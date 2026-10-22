# Wildfern — Find Your Wild

An immersive website for **Wildfern**, a fictional café hidden in a forest: a live 3D forest
you travel through as you scroll, and a FastAPI backend for real table reservations.

- **Frontend:** React 19 + TypeScript, Vite, three.js (React Three Fiber + drei), GSAP ScrollTrigger, Motion
- **Backend:** FastAPI + SQLAlchemy — SQLite locally, Postgres in production
- **Hosting:** Vercel (static site + a Python serverless function for `/api/*`)

## Run it locally

You need Node 20+ and Python 3.12+.

```bash
npm install
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

npm run dev:all     # API on :8000 + site on :5173 (Vite proxies /api to the API)
```

Then open http://localhost:5173. API docs: http://localhost:8000/api/docs

| Script             | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `npm run dev:all`  | FastAPI (`:8000`) and Vite (`:5173`) together            |
| `npm run dev`      | Frontend only (booking/menu calls need the API running)  |
| `npm run api`      | Backend only                                             |
| `npm run test:api` | Backend test suite (pytest)                              |
| `npm run build`    | Type-check and build the site into `dist/`               |

Local bookings are stored in `wildfern.db` (SQLite, git-ignored). Delete it to start fresh.

## API

All routes live under `/api`.

| Method | Route                              | Purpose                                                    |
| ------ | ---------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/health`                      | Status and which database is in use                        |
| GET    | `/api/menu`                        | Signature drinks                                           |
| GET    | `/api/availability?date=YYYY-MM-DD`| Every slot that day, with seats left                       |
| POST   | `/api/reservations`                | Book a table → returns a code like `WF-7KQ2MX`             |
| GET    | `/api/reservations/{code}?email=`  | Look up a booking (code **and** email must match)          |
| POST   | `/api/reservations/{code}/cancel`  | Cancel (body: `{ "email": … }`)                            |
| POST   | `/api/newsletter`                  | Subscribe an email                                         |
| GET    | `/api/admin/reservations?date=`    | All bookings — needs `Authorization: Bearer $ADMIN_TOKEN`  |

**Booking rules** (`backend/config.py`): open 7:00–18:00, half-hour slots, last seating 17:30,
each booking holds its seats for 90 minutes, 32 bookable seats at any moment (the rest is kept
for walk-ins), parties of 1–8, up to 90 days ahead, at least an hour's notice for same-day.
On Postgres, bookings for the same date are serialised with an advisory lock so two requests
can't take the same last seats.

**Spam friction:** a hidden honeypot field and a per-IP rate limit (8 bookings / 10 min). On
serverless the limit is per instance, so treat it as friction, not security.

## Deploy to Vercel

1. **Create a Postgres database.** Easiest: Vercel dashboard → Storage → *Neon* (free tier).
   Connecting it to the project sets `DATABASE_URL` automatically.
2. **Import the project.** Push this folder to GitHub and import it in Vercel, or run
   `npx vercel` from this folder. `vercel.json` already configures the Vite build, the Python
   function at `api/index.py`, the `/api/*` rewrite and cache headers.
3. **Set environment variables** (Settings → Environment Variables), see `.env.example`:
   - `DATABASE_URL` — required for bookings to persist (set by the Neon integration)
   - `ADMIN_TOKEN` — a long random string, to enable the admin endpoint
   - `CAFE_TIMEZONE` — e.g. `Asia/Kolkata`; defaults to `UTC`
4. **Deploy**, then check `https://<your-site>/api/health` — it should say
   `"database": "postgres", "persistent": true`.

> Without `DATABASE_URL`, the API still runs on Vercel but uses a temporary SQLite file in
> `/tmp` that is wiped whenever the function restarts — `/api/health` reports
> `"persistent": false` in that case.

## Project structure

```
api/index.py            Vercel entry point (imports the FastAPI app)
backend/                FastAPI app: config, db, models, schemas, booking rules, routes
tests/                  pytest suite for the API
scripts/                dev runner (API + Vite) and test runner
src/
  App.tsx               page composition, preloader, ScrollTrigger refresh
  content.ts            nav, menu fallback data, songbird greetings
  lib/api.ts            typed client for the backend
  components/           Nav, Preloader, GreeterBird, RevealText, Edge, FernMark
  sections/             Journey (3D hero), Philosophy, Space (gallery), Menu, Moment,
                        Reservations (book + manage), Footer (newsletter)
  three/                the 3D scene: camera rig, forest, birds (boids), pollen, leaves,
                        sun rays, café, click effects
public/images/          locally hosted WebP photography (Unsplash)
```

## Notes and limitations

- **No emails are sent.** The booking code shown after booking (plus the guest's email) is how
  guests find or cancel a booking. Adding a provider (Resend, Postmark…) to `backend/main.py`
  would be the next step.
- **Schema changes:** tables are created automatically on first request; there are no
  migrations yet (add Alembic before changing models in production).
- **3D performance** adapts to the device: the GPU is detected to pick a quality tier, and
  resolution steps down if frames drop. Without WebGL the hero falls back to a photograph.
- Prices, address and phone number are placeholders for this fictional café.
