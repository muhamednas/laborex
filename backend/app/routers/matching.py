import psycopg2.extras
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from app.database import get_pool, cache_get, cache_set

router = APIRouter(tags=["matching"])


# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class JobPostRequest(BaseModel):
    employer_id: str
    title: str
    description: Optional[str] = None
    required_skills: List[str] = []
    lat: float
    lon: float
    job_address_text: Optional[str] = None
    daily_wage: int
    workers_needed: int = 1
    start_date: date
    end_date: Optional[date] = None
    includes_epf_etf: bool = False
    includes_meals: bool = False
    includes_transport: bool = False


class EmployerRegisterRequest(BaseModel):
    business_name: str
    whatsapp_number: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    industry_category: Optional[str] = None
    business_address_text: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


# ─────────────────────────────────────────────
# SKILL SCORING
# ─────────────────────────────────────────────

def jaccard_score(set_a: list, set_b: list) -> float:
    if not set_a or not set_b:
        return 0.0
    a, b = set(set_a), set(set_b)
    return len(a & b) / len(a | b)


# ─────────────────────────────────────────────
# GET /jobs
# ─────────────────────────────────────────────

@router.get("/jobs")
def get_jobs_near(
    lat: float = Query(...),
    lon: float = Query(...),
    skills: Optional[str] = Query(None),
    max_km: float = Query(25),
    min_wage: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    skill_list = [s.strip().lower() for s in skills.split(",")] if skills else []
    cache_key = f"jobs:{lat}:{lon}:{skills}:{max_km}:{min_wage}:{page}"
    cached = cache_get(cache_key)
    if cached:
        return {"source": "cache", **cached}

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    jp.id,
                    jp.title,
                    jp.description,
                    jp.required_skills,
                    jp.daily_wage,
                    jp.workers_needed,
                    jp.workers_hired,
                    jp.start_date,
                    jp.end_date,
                    jp.includes_epf_etf,
                    jp.includes_meals,
                    jp.includes_transport,
                    jp.job_address_text,
                    e.business_name     AS employer_name,
                    e.trust_score       AS employer_trust_score,
                    ROUND(
                        (ST_Distance(
                            jp.job_location,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography
                        ) / 1000.0)::numeric
                    , 2) AS distance_km
                FROM job_postings jp
                JOIN employers e ON e.id = jp.employer_id
                WHERE
                    jp.status = 'open'
                    AND jp.expires_at > NOW()
                    AND ST_DWithin(
                        jp.job_location,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography,
                        %s
                    )
                    AND (%s IS NULL OR jp.daily_wage >= %s)
                ORDER BY distance_km ASC
                LIMIT %s OFFSET %s
                """,
                (lon, lat, lon, lat, max_km * 1000, min_wage, min_wage, page_size, (page - 1) * page_size),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for row in rows:
                row["match_score"] = round(jaccard_score(skill_list, row.get("required_skills") or []) * 100, 1)
                for field in ["start_date", "end_date"]:
                    if row.get(field):
                        row[field] = str(row[field])
            if skill_list:
                rows.sort(key=lambda r: (-r["match_score"], r["distance_km"]))
            result = {"total": len(rows), "page": page, "page_size": page_size, "jobs": rows}
            cache_set(cache_key, result)
            return {"source": "db", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# POST /jobs — create a new job posting
# ─────────────────────────────────────────────

@router.post("/jobs", status_code=201)
def create_job(body: JobPostRequest):
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # Verify employer exists
            cur.execute("SELECT id FROM employers WHERE id = %s", (body.employer_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Employer not found")

            cur.execute(
                """
                INSERT INTO job_postings (
                    employer_id, title, description, required_skills,
                    job_location, job_address_text,
                    daily_wage, workers_needed, start_date, end_date,
                    includes_epf_etf, includes_meals, includes_transport,
                    status
                ) VALUES (
                    %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography,
                    %s, %s, %s, %s, %s, %s, %s, %s, 'open'
                )
                RETURNING id, title, daily_wage, start_date, created_at
                """,
                (
                    body.employer_id,
                    body.title,
                    body.description,
                    body.required_skills,
                    body.lon, body.lat,
                    body.job_address_text,
                    body.daily_wage,
                    body.workers_needed,
                    body.start_date,
                    body.end_date,
                    body.includes_epf_etf,
                    body.includes_meals,
                    body.includes_transport,
                ),
            )
            row = cur.fetchone()

            # Update employer job count
            cur.execute(
                "UPDATE employers SET total_jobs_posted = total_jobs_posted + 1 WHERE id = %s",
                (body.employer_id,)
            )
            conn.commit()

            return {
                "status": "created",
                "id": str(row[0]),
                "title": row[1],
                "daily_wage": row[2],
                "start_date": str(row[3]),
                "created_at": str(row[4]),
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# POST /employers — register a new employer
# ─────────────────────────────────────────────

@router.post("/employers", status_code=201)
def register_employer(body: EmployerRegisterRequest):
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            location_sql = "NULL"
            params = [
                body.business_name,
                body.whatsapp_number,
                body.contact_person,
                body.email,
                body.industry_category,
                body.business_address_text,
            ]

            if body.lat and body.lon:
                cur.execute(
                    """
                    INSERT INTO employers (
                        business_name, whatsapp_number, contact_person,
                        email, industry_category, business_address_text,
                        business_location
                    ) VALUES (%s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography)
                    ON CONFLICT (whatsapp_number) DO UPDATE SET
                        business_name        = EXCLUDED.business_name,
                        contact_person       = COALESCE(EXCLUDED.contact_person, employers.contact_person),
                        email                = COALESCE(EXCLUDED.email, employers.email),
                        industry_category    = COALESCE(EXCLUDED.industry_category, employers.industry_category),
                        business_address_text = COALESCE(EXCLUDED.business_address_text, employers.business_address_text),
                        updated_at           = NOW()
                    RETURNING id, business_name, created_at
                    """,
                    params + [body.lon, body.lat],
                )
            else:
                cur.execute(
                    """
                    INSERT INTO employers (
                        business_name, whatsapp_number, contact_person,
                        email, industry_category, business_address_text
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (whatsapp_number) DO UPDATE SET
                        business_name        = EXCLUDED.business_name,
                        contact_person       = COALESCE(EXCLUDED.contact_person, employers.contact_person),
                        updated_at           = NOW()
                    RETURNING id, business_name, created_at
                    """,
                    params,
                )

            row = cur.fetchone()
            conn.commit()
            return {
                "status": "registered",
                "id": str(row[0]),
                "business_name": row[1],
                "created_at": str(row[2]),
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# GET /employers — list all employers
# ─────────────────────────────────────────────

@router.get("/employers")
def list_employers():
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, business_name, whatsapp_number,
                       industry_category, trust_score,
                       total_jobs_posted, is_verified
                FROM employers
                ORDER BY trust_score DESC
                """
            )
            rows = [dict(r) for r in cur.fetchall()]
            return {"total": len(rows), "employers": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────
# GET /workers/nearby
# ─────────────────────────────────────────────

@router.get("/workers/nearby")
def get_workers_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    skills: Optional[str] = Query(None),
    radius_km: float = Query(20),
    max_wage: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    skill_list = [s.strip().lower() for s in skills.split(",")] if skills else []
    cache_key = f"workers:{lat}:{lon}:{skills}:{radius_km}:{max_wage}:{page}"
    cached = cache_get(cache_key)
    if cached:
        return {"source": "cache", **cached}

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    wp.id, wp.full_name, wp.skills,
                    wp.home_address_text, wp.min_daily_wage,
                    wp.trust_score, wp.avg_rating,
                    wp.total_jobs_completed, wp.is_verified,
                    wp.preferred_language,
                    ROUND(
                        (ST_Distance(
                            wp.home_location,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography
                        ) / 1000.0)::numeric
                    , 2) AS distance_km
                FROM worker_profiles wp
                WHERE
                    wp.status = 'available'
                    AND wp.home_location IS NOT NULL
                    AND ST_DWithin(
                        wp.home_location,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::extensions.geography,
                        %s
                    )
                    AND (%s IS NULL OR wp.min_daily_wage <= %s)
                ORDER BY wp.trust_score DESC
                LIMIT %s OFFSET %s
                """,
                (lon, lat, lon, lat, radius_km * 1000, max_wage, max_wage, page_size, (page - 1) * page_size),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for row in rows:
                row["match_score"] = round(jaccard_score(skill_list, row.get("skills") or []) * 100, 1)
            if skill_list:
                rows.sort(key=lambda r: (-r["match_score"], -r["trust_score"]))
            result = {"total": len(rows), "page": page, "page_size": page_size, "workers": rows}
            cache_set(cache_key, result)
            return {"source": "db", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)