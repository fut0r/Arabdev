# ArabDev

A social platform for Arabic-speaking developers. People write technical posts (code blocks, tables,
images, links), follow each other, talk in the comments, and find each other through tags, trending
posts and search. The interface is Arabic first, right to left, with a complete English version.

Live at **[arabdev.site](https://arabdev.site)**. Documentation:
[wiki](https://wiki.arabdev.site) · [privacy policy](https://privacy.arabdev.site) ·
[patch notes](https://patch.arabdev.site).

| | |
|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, MUI 9, React Router, TanStack Query, i18next, TipTap |
| Backend | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic |
| Data | SQLite locally and on a single server; PostgreSQL (Neon) on Vercel; Redis (Upstash) optional |
| Checks | pytest, ruff, pip-audit · oxlint, Prettier, `tsc`, npm audit (all run in CI) |

Want to help? Read **[CONTRIBUTING.md](CONTRIBUTING.md)**. Found a security problem? See
**[SECURITY.md](SECURITY.md)** and please don't open a public issue.

---

## Run it locally

You need Python 3.12 and Node 22.

**Backend** (http://localhost:8000, API docs at `/api/docs`):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env              # then set SECRET_KEY
alembic upgrade head              # creates backend/arabdev.db
python -m app.cli seed --demo     # reference data, plus fictional demo accounts and posts
uvicorn app.main:app --reload --port 8000
```

**Frontend** (http://localhost:5173, proxies `/api` and `/media` to port 8000):

```bash
cd frontend
npm install
npm run dev
```

The demo accounts are fictional: `<username>@demo.arabdev.site` with the password `ArabDev2026`
(for example `layla_dev@demo.arabdev.site`). Never seed them into a real database. To make someone a
moderator locally: `python -m app.cli make-admin <username>`.

The dev server also serves the three documentation sites at `/wiki/`, `/privacy/` and `/patch-notes/`.

**Docker:** `cp .env.example .env`, set `SECRET_KEY`, then `docker compose up --build`. The app is on
http://localhost:8080; nginx serves the frontend and passes the API through to FastAPI.

## Checks

```bash
cd backend && pytest && ruff check . && ruff format --check .
cd frontend && npm run lint && npm run format:check && npm run build
```

Every test gets a fresh in-memory SQLite database. CI runs the same commands, plus `pip-audit` and
`npm audit`, on every pull request.

---

## Repository layout

```text
backend/
  app/
    api/v1/        REST routes, one module per area (auth, users, posts, moderation, ...)
    api/           routes served from the site root: pages.py (readable pages), feeds.py (RSS), seo.py
    core/          settings, database, security, permissions, rate limiting, errors, encryption
    models/        SQLAlchemy models (23 tables)
    schemas/       Pydantic request and response models
    services/      the rules: auth, two-step sign-in, posts, ranking, blocks, reports, email, ...
    repositories/  reusable queries
    utils/         HTML sanitizing, validators, pagination, text helpers
  alembic/         migrations
  tests/
frontend/
  src/
    api/           HTTP client, endpoints, query keys
    features/      one folder per feature (auth, posts, editor, ads, settings, moderation, ...)
    pages/         one component per route, loaded on demand
    layouts/       app frame: navbar, side columns, mobile navigation
    components/    small shared pieces
    i18n/          ar.json and en.json
    theme/         colors, type, spacing, MUI theme
  scripts/prerender.mjs   writes readable text into the built homepage, /about and /contact
wiki/ privacy/ patch-notes/   the documentation sites (plain HTML, Arabic and English)
api/index.py       the API as a Vercel function
vercel.json        build, routing, security headers, daily clean-up job
```

---

## How the main parts work

**Accounts and sign-in.** Passwords are hashed with Argon2id, and new ones are checked against
known breaches (Have I Been Pwned; only five characters of a hash leave the server). The access
token (15 minutes) lives in memory; the refresh token sits in an `httpOnly` cookie scoped to
`/api/v1/auth`, is stored hashed, and is rotated on every use, so a replayed one ends the whole
session. Sign-in can be confirmed with an emailed code, or with an authenticator app (TOTP, secret
stored encrypted, ten one-time recovery codes). Cloudflare Turnstile checks sign-up, sign-in,
posting and commenting.

**Limits.** Sign-in, sign-up, codes, resets, posting, commenting, uploads, search and reports are
rate limited per network address (taken from the right-hand end of `X-Forwarded-For`, see
`TRUSTED_PROXY_HOPS`) and, where it matters, per account. Counters live in Redis when it is
configured, otherwise in memory.

**Posts.** TipTap with a deliberately small toolbar. The server cleans every post with nh3 against an
allow-list that mirrors the toolbar, and the browser cleans it again with DOMPurify. Each paragraph
gets `dir="auto"`, so Arabic and English mix in one post.

**Feeds.** Every list is paginated on the server (20 per page, no infinite scroll). *For you* scores
recent posts by closeness (people you follow, your interests, who you interact with), discussion
and freshness, and spreads authors out (`services/ranking.py`). *Trending* ranks by how fast a post
gathers reactions.

**Safety.** Any post can be reported; three reports hide it until a moderator decides
(`services/report_service.py`). Moderators can remove posts, restrict an account for a while, or
suspend it, and everyone involved is emailed. Members can block each other
(`services/block_service.py`).

**Readable pages.** The app is a single-page app, so the API writes a post's, profile's or tag's
own title and text into the HTML shell for crawlers and link previews, and the build does the same
for the homepage, About and Contact (`services/page_service.py`, `scripts/prerender.mjs`).

**Ads.** Four Google AdSense units, placed by the rules in `frontend/src/features/ads/placements.tsx`.
ArabDev's own labelled ads fill a slot when Google has nothing for it.

**Email.** Plain SMTP (`services/email_service.py`); without `SMTP_HOST`, messages are written to
the log instead, which is how development works.

---

## Configuration

Backend settings come from environment variables or `backend/.env` (see `backend/.env.example`).

| Variable | Default | What it does |
|---|---|---|
| `SECRET_KEY` | dev value | Signs tokens and derives encryption keys. Required in production; changing it signs everyone out and turns off authenticator sign-in |
| `DATABASE_URL` | `backend/arabdev.db` | SQLite path or a PostgreSQL URL |
| `REDIS_URL` | unset | Shared rate limits and cache |
| `FRONTEND_URL` | `http://localhost:5173` | Public address used in emails and canonical links |
| `CORS_ORIGINS` | local addresses | Comma-separated browser origins |
| `TRUSTED_PROXY_HOPS` | `1` | Proxies in front of the API that append to `X-Forwarded-For` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS` | unset, 587 | Outgoing mail |
| `MAIL_FROM` | `ArabDev <noreply@arabdev.site>` | Sender; replies go to `SUPPORT_EMAIL` |
| `EMAIL_CODES_ENABLED` | follows SMTP | Emailed six-digit codes; `false` turns them off if mail breaks |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | unset | Cloudflare Turnstile; off unless both are set |
| `PWNED_PASSWORDS_ENABLED` | `true` | The breached-password check |
| `ADMIN_USERNAMES` | unset | Comma-separated moderators, besides accounts with the admin flag |
| `MODERATION_EMAIL` | support address | Where new reports are emailed |
| `REPORT_AUTO_HIDE_THRESHOLD`, `REPORT_RETENTION_DAYS` | 3, 365 | Reports before a post is hidden; how long decided reports are kept |
| `STORAGE_BACKEND` | `local` | `database` keeps images in the database (used on Vercel) |
| `CRON_SECRET` | unset | Bearer token for the daily clean-up endpoint |
| `SPA_SHELL_URL`, `SPA_SHELL_PATH` | `FRONTEND_URL/app.html` | Where the API reads the app shell it writes pages into |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS (automatic on Vercel) |

---

## Deployment

**arabdev.site** runs on Vercel from this repository: the frontend is built to static files and
`api/index.py` serves the API as a Python function in Frankfurt, next to the Neon database and
Upstash Redis. Each new instance runs pending migrations under a PostgreSQL lock. A daily cron job
deletes expired sessions, codes and old reports. Pushing to `main` deploys.

The documentation sites are published with GitHub Pages from their own repositories
([Wiki](https://github.com/fut0r/Wiki), [Privacy-policy](https://github.com/fut0r/Privacy-policy),
[Patch-notes](https://github.com/fut0r/Patch-notes)); the folders here are the source and are
copied there after changes.

A single server works too: `docker compose up --build` gives you Redis, the API on SQLite and nginx.

---

## License

ArabDev is free software under the **GNU General Public License v3** or later; see
[`LICENSE`](LICENSE). The bundled fonts (Alexandria, Tajawal, Anton) are under the SIL Open Font
License 1.1 (`frontend/public/fonts/*/OFL.txt`).
