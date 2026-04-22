import os
import re
import hmac
import hashlib
import httpx

from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from app.database import get_pool

load_dotenv()

router = APIRouter(prefix="/webhook", tags=["webhook"])

WA_VERIFY_TOKEN = os.getenv("WA_VERIFY_TOKEN", "")
WA_APP_SECRET   = os.getenv("WA_APP_SECRET", "")
WA_TOKEN        = os.getenv("WA_TOKEN", "")
WA_PHONE_ID     = os.getenv("WA_PHONE_NUMBER_ID", "")

# ─────────────────────────────────────────────
# MOCK NLP EXTRACTOR
# ─────────────────────────────────────────────

SKILL_KEYWORDS = {
    "mason":       ["masonry", "bricklaying"],
    "masonry":     ["masonry"],
    "tiler":       ["tiling"],
    "tiling":      ["tiling"],
    "carpenter":   ["carpentry"],
    "carpentry":   ["carpentry"],
    "plumber":     ["plumbing"],
    "plumbing":    ["plumbing"],
    "electrician": ["electrical"],
    "electrical":  ["electrical"],
    "painter":     ["painting"],
    "painting":    ["painting"],
    "welder":      ["welding"],
    "welding":     ["welding"],
    "driver":      ["driving"],
    "driving":     ["driving"],
    "cleaner":     ["cleaning"],
    "cleaning":    ["cleaning"],
    "labour":      ["general labour"],
    "laborer":     ["general labour"],
    "helper":      ["general labour"],
    "gardener":    ["gardening"],
    "cook":        ["cooking"],
    "security":    ["security"],
}

SRI_LANKA_DISTRICTS = [
    "colombo", "gampaha", "kalutara", "kandy", "matale", "nuwara eliya",
    "galle", "matara", "hambantota", "jaffna", "kilinochchi", "mannar",
    "vavuniya", "mullaitivu", "batticaloa", "ampara", "trincomalee",
    "kurunegala", "puttalam", "anuradhapura", "polonnaruwa", "badulla",
    "monaragala", "ratnapura", "kegalle", "nugegoda", "dehiwala",
    "moratuwa", "negombo", "kaduwela"
]


def mock_nlp_extract(text: str) -> dict:
    text_lower = text.lower()
    found_skills = set()
    for keyword, skill_tags in SKILL_KEYWORDS.items():
        if keyword in text_lower:
            found_skills.update(skill_tags)
    location = None
    for district in SRI_LANKA_DISTRICTS:
        if district in text_lower:
            location = district.title()
            break
    experience_years = None
    exp_match = re.search(r"(\d+)\s*(year|yr|years|yrs)", text_lower)
    if exp_match:
        experience_years = int(exp_match.group(1))
    daily_rate = None
    rate_match = re.search(r"rs\.?\s*(\d{3,5})|(\d{3,5})\s*(?:per day|a day|daily|/day)", text_lower)
    if rate_match:
        daily_rate = int(rate_match.group(1) or rate_match.group(2))
    return {
        "skills":           list(found_skills),
        "location":         location,
        "experience_years": experience_years,
        "daily_rate_lkr":  daily_rate,
    }


# ─────────────────────────────────────────────
# HMAC VERIFICATION
# ─────────────────────────────────────────────

def verify_wa_signature(payload: bytes, signature_header: str) -> bool:
    if not WA_APP_SECRET:
        return True
    expected = "sha256=" + hmac.new(
        WA_APP_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


# ─────────────────────────────────────────────
# SEND WHATSAPP REPLY
# ─────────────────────────────────────────────

async def send_wa_message(to: str, message: str):
    if not WA_TOKEN or not WA_PHONE_ID:
        print(f"[WA REPLY SKIPPED] To: {to} | Msg: {message}")
        return
    url = f"https://graph.facebook.com/v19.0/{WA_PHONE_ID}/messages"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": message},
            },
            headers={"Authorization": f"Bearer {WA_TOKEN}"},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[WA ERROR] {resp.status_code}: {resp.text}")


# ─────────────────────────────────────────────
# UPSERT WORKER PROFILE (text registration)
# ─────────────────────────────────────────────

def upsert_worker(phone: str, name: str, extracted: dict) -> str:
    skills     = extracted.get("skills") or []
    location   = extracted.get("location")
    daily_rate = extracted.get("daily_rate_lkr")
    pool       = get_pool()
    conn       = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO worker_profiles
                    (whatsapp_number, full_name, skills, home_address_text,
                     min_daily_wage, raw_registration_text)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (whatsapp_number) DO UPDATE SET
                    full_name         = COALESCE(EXCLUDED.full_name, worker_profiles.full_name),
                    skills            = CASE
                                          WHEN array_length(EXCLUDED.skills, 1) > 0
                                          THEN EXCLUDED.skills
                                          ELSE worker_profiles.skills
                                        END,
                    home_address_text = COALESCE(EXCLUDED.home_address_text, worker_profiles.home_address_text),
                    min_daily_wage    = COALESCE(EXCLUDED.min_daily_wage, worker_profiles.min_daily_wage),
                    updated_at        = NOW()
                RETURNING id
                """,
                (
                    phone,
                    name or "Unknown",
                    skills,
                    location,
                    daily_rate,
                    f"[{datetime.utcnow().isoformat()}] Registered via WhatsApp",
                ),
            )
            worker_id = str(cur.fetchone()[0])
            conn.commit()
            return worker_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# UPDATE WORKER GPS LOCATION
# ─────────────────────────────────────────────

def update_worker_location(phone: str, lat: float, lon: float, name: str) -> str:
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # Upsert worker with GPS location
            cur.execute(
                """
                INSERT INTO worker_profiles
                    (whatsapp_number, full_name, home_location, status)
                VALUES (
                    %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography,
                    'available'
                )
                ON CONFLICT (whatsapp_number) DO UPDATE SET
                    home_location = ST_SetSRID(
                        ST_MakePoint(%s, %s), 4326
                    )::extensions.geography,
                    full_name     = COALESCE(EXCLUDED.full_name, worker_profiles.full_name),
                    status        = 'available',
                    updated_at    = NOW()
                RETURNING id, full_name
                """,
                (phone, name or "Unknown", lon, lat, lon, lat),
            )
            row = cur.fetchone()
            conn.commit()
            print(f"[GPS] Updated location for {phone}: lat={lat}, lon={lon}")
            return str(row[0])
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# WEBHOOK: GET (Meta verification)
# ─────────────────────────────────────────────

@router.get("/worker-profile")
async def verify_webhook(request: Request):
    params    = dict(request.query_params)
    mode      = params.get("hub.mode")
    token     = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    if mode == "subscribe" and token == WA_VERIFY_TOKEN:
        print("[WEBHOOK] Meta verification successful")
        return int(challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


# ─────────────────────────────────────────────
# WEBHOOK: POST (incoming messages)
# ─────────────────────────────────────────────

@router.post("/worker-profile")
async def receive_message(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    sig  = request.headers.get("x-hub-signature-256", "")
    if not verify_wa_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()
    if data.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    results = []

    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            value       = change.get("value", {})
            messages    = value.get("messages", [])
            contacts    = value.get("contacts", [])
            contact_map = {c["wa_id"]: c["profile"]["name"] for c in contacts}

            for msg in messages:
                phone = msg["from"]
                name  = contact_map.get(phone, "Unknown")
                mtype = msg.get("type")

                # ── LOCATION MESSAGE ──────────────────────────
                if mtype == "location":
                    lat = msg["location"]["latitude"]
                    lon = msg["location"]["longitude"]
                    print(f"[LOCATION] From: {phone} | lat={lat}, lon={lon}")

                    worker_id = update_worker_location(phone, lat, lon, name)

                    reply = (
                        f"📍 Location saved!\n\n"
                        f"Your home location has been updated.\n"
                        f"lat: {lat}, lon: {lon}\n\n"
                        f"Employers near you can now find you for jobs. ✅"
                    )
                    background_tasks.add_task(send_wa_message, phone, reply)

                    results.append({
                        "type":      "location",
                        "worker_id": worker_id,
                        "phone":     phone,
                        "lat":       lat,
                        "lon":       lon,
                    })

                # ── TEXT MESSAGE ──────────────────────────────
                elif mtype == "text":
                    msg_text = msg["text"]["body"]
                    print(f"[MSG] From: {phone} | Name: {name} | Text: {msg_text}")

                    # Help command
                    if msg_text.strip().lower() in ["hi", "hello", "help", "start"]:
                        reply = (
                            f"👋 Welcome to LaborEx!\n\n"
                            f"To register, send a message like:\n"
                            f"_I am a mason. 5 years experience in Colombo. Rs 3500 per day._\n\n"
                            f"📍 To share your location:\n"
                            f"Tap the *attachment (📎)* icon → *Location* → *Send Your Current Location*\n\n"
                            f"We'll match you with nearby jobs automatically!"
                        )
                        background_tasks.add_task(send_wa_message, phone, reply)
                        results.append({"type": "help", "phone": phone})
                        continue

                    extracted = mock_nlp_extract(msg_text)
                    print(f"[NLP] Extracted: {extracted}")

                    worker_id  = upsert_worker(phone, name, extracted)
                    skills_str = ", ".join(extracted["skills"]) if extracted["skills"] else "none detected"
                    loc_str    = extracted["location"] or "not detected"
                    rate_str   = f"Rs. {extracted['daily_rate_lkr']}/day" if extracted["daily_rate_lkr"] else "not specified"

                    reply = (
                        f"✅ Profile saved!\n\n"
                        f"👷 Name: {name}\n"
                        f"🔧 Skills: {skills_str}\n"
                        f"📍 Location: {loc_str}\n"
                        f"💰 Daily rate: {rate_str}\n\n"
                        f"📌 *Share your exact location* so employers can find you:\n"
                        f"Tap 📎 → Location → Send Your Current Location"
                    )
                    background_tasks.add_task(send_wa_message, phone, reply)

                    results.append({
                        "type":             "text",
                        "worker_id":        worker_id,
                        "phone":            phone,
                        "skills_extracted": extracted["skills"],
                        "location":         extracted["location"],
                    })

                else:
                    print(f"[SKIP] Unsupported message type: {mtype}")

    return {"status": "ok", "processed": len(results), "results": results}