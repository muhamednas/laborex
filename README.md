# LaborEx — Blue-Collar Labor Exchange 🇱🇰

A platform connecting informal daily-wage workers with SMEs in Sri Lanka.
Workers register via WhatsApp (no CV needed), employers find them by GPS radius.

## Live Demo
- Frontend: https://laborex.vercel.app
- API Docs: https://laborex-production.up.railway.app/docs

## Core Features
- **Zero-CV Profiles** — workers register via WhatsApp text, NLP extracts skills + location
- **GPS Radius Matching** — PostGIS finds workers within X km of a worksite
- **Trust Score System** — dual rating (employer ↔ worker)
- **EPF/ETF Auto-calculation** — 8% employee + 12% employer + 3% ETF via DB trigger
- **PWA Dashboard** — mobile-first employer dashboard, installable on phone

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI |
| Database | PostgreSQL 17 + PostGIS |
| Cache | In-memory (Redis-compatible interface) |
| Frontend | React, Vite, Tailwind CSS, PWA |
| Hosting | Railway (API) + Vercel (Frontend) |
| Integration | WhatsApp Business API (Meta) |
| NLP | Keyword extraction (mock → Anthropic Claude) |

## Architecture
WhatsApp worker → Meta API → FastAPI webhook
↓
NLP skill extraction
↓
PostgreSQL + PostGIS
↓
React PWA ← REST API (FastAPI)

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /webhook/worker-profile | WhatsApp webhook receiver |
| GET | /jobs | Find jobs near coordinates |
| POST | /jobs | Post a new job |
| GET | /workers/nearby | Find workers near worksite |
| POST | /employers | Register employer |
| GET | /employers | List employers |

## Setup & Run

See [RUNBOOK.md](RUNBOOK.md) for full setup instructions.

### Quick start
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Screenshots
> Dashboard, WhatsApp registration flow, API docs

## Author
Muhammad — [LinkedIn](https://linkedin.com/in/YOUR_HANDLE)
