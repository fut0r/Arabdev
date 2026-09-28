# ArabDev

A social and professional platform for developers — especially the Arabic‑speaking developer community.
People publish technical posts (with code, tables and links), follow each other, discuss in comments,
and discover work through tags, trending posts and search. The interface is Arabic‑first (RTL) with a
full English (LTR) translation.

| Address | What |
|---|---|
| <https://arabdev.site/dashboard> | The app. The dashboard is the home feed; `arabdev.site/` redirects there (or to sign in). |
| <https://wiki.arabdev.site> | ArabDev Wiki (`wiki/`) |
| <https://privacy.arabdev.site> | Privacy Policy (`privacy/`) |
| <https://patch.arabdev.site> | Patch notes (`patch-notes/`) |
| support@arabdev.site | Support: account help, bugs, content reports, privacy requests, security reports |
| hi@arabdev.site | Sponsorship, contributions, partnerships, commitments and general questions |

| | |
|---|---|
| **Frontend** | React 19 · TypeScript · Vite · MUI 9 · React Router · TanStack Query · i18next · TipTap |
| **Backend** | Python · FastAPI · Pydantic · SQLAlchemy 2 · Alembic · JWT · Redis (optional) · Pytest |
| **Database** | SQLite (WAL mode) for development and single-server hosting; PostgreSQL (Neon) when hosted on Vercel. |

---

## Repository layout

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py            # app factory, middleware, error handlers, media mount
│   │   ├── core/              # settings, database, security, deps, errors, rate limiting, cache
│   │   ├── models/            # SQLAlchemy models (19 tables)
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── api/v1/            # REST routes, grouped by OpenAPI tag
│   │   ├── services/          # business logic (auth, posts, feed, notifications, media, ads…)
│   │   ├── repositories/      # query builders / data access
│   │   ├── utils/             # HTML sanitizer, validators, pagination, text helpers
│   │   └── cli.py             # seed / make-admin / purge-tokens commands
│   ├── alembic/               # migrations
│   ├── tests/                 # pytest suite
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── public/fonts/          # Alexandria, Tajawal, Anton (WOFF2 + OFL licences)
│   ├── src/
│   │   ├── api/               # axios client, endpoints, query keys, cache helpers
│   │   ├── components/        # shared UI: Logo, EmptyState, LoadingState, Pagination…
│   │   ├── features/          # auth, onboarding, posts, editor, comments, profile, ads, search…
│   │   ├── layouts/           # AppLayout, Navbar, Sidebar, RightSidebar, MobileNavigation
│   │   ├── pages/             # route components (lazy loaded)
│   │   ├── i18n/              # ar.json, en.json
│   │   ├── theme/             # colors, typography, tokens, theme, fonts.css
│   │   ├── hooks/ router/ types/ utils/
│   │   └── main.tsx
│   ├── nginx.conf
│   └── Dockerfile             # built from the project root (see docker-compose.yml)
├── wiki/                      # ArabDev Wiki → wiki.arabdev.site (ar/ + en/, 25 articles each)
├── privacy/                   # Privacy Policy → privacy.arabdev.site (ar/ + en/)
├── patch-notes/               # Patch notes → patch.arabdev.site (ar/ + en/)
├── api/index.py               # Serves the API as a Vercel function
├── vercel.json                # Vercel build, routing and the daily clean-up job
├── requirements.txt           # Python packages for the Vercel function
├── LICENSE                    # GNU GPL v3
├── docker-compose.yml         # redis + backend + frontend
├── .dockerignore              # for the root-context frontend build
└── .env.example
```

---

## Running locally

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -e ".[dev]"
cp .env.example .env              # then set SECRET_KEY
alembic upgrade head              # creates backend/arabdev.db
python -m app.cli seed --demo     # interests + house ads (+ fictional demo developers and posts)
uvicorn app.main:app --reload --port 8000
```

- API docs: <http://localhost:8000/api/docs> (Swagger) and <http://localhost:8000/api/redoc>
- Health: <http://localhost:8000/api/v1/health>
- Make someone an admin (to manage ads): `python -m app.cli make-admin <username>`
- Delete ended sessions and old reset links now: `python -m app.cli purge-tokens`. The API also does
  this when it starts, then every six hours on a server, or once a day on Vercel (`vercel.json`)

`--demo` creates ten fictional developer accounts (password `ArabDev2026`, emails
`<username>@demo.arabdev.site`, e.g. `layla_dev@demo.arabdev.site`) and 26 posts, so the feed,
pagination and recommendations have something to show. Don't run it against production.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api and /media to :8000)
```

The dev server also serves the documentation sites at <http://localhost:5173/wiki/>,
[/privacy/](http://localhost:5173/privacy/), [/patch-notes/](http://localhost:5173/patch-notes/) and
the license at [/LICENSE.txt](http://localhost:5173/LICENSE.txt).

Other scripts: `npm run build`, `npm run typecheck`, `npm run format`.

### Docker

```bash
cp .env.example .env              # set SECRET_KEY
docker compose up --build
```

The app is served on <http://localhost:8080> (nginx serves the SPA and proxies `/api` and `/media`
to FastAPI). The frontend image is built from the project root so it can include `LICENSE`; the
documentation sites are deployed separately (see below). The SQLite file lives on the `data` volume and uploads on the `media` volume. The backend
container applies migrations and seeds reference data on start. To add the
demo content: `docker compose exec backend python -m app.cli seed --demo`.

### Tests

```bash
cd backend
pytest                            # every test gets a fresh in-memory SQLite database
```

The suite covers registration rules, login, refresh-token rotation and reuse detection, password
reset, HTML sanitizing, server-side pagination, permissions, feeds (following / for you / latest),
reposts, notifications and their preferences, privacy settings, search, uploads (validation and
re-encoding), ads and rate limiting.

---

## How it works

### Authentication
- Passwords are hashed with **Argon2id**. Login errors are identical for unknown emails and wrong
  passwords.
- A short-lived **JWT access token** (15 min) is kept in memory by the SPA — never in localStorage.
- A **refresh token** lives in an `httpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/auth`. It is
  stored hashed, **rotated on every use**, and replaying a rotated token revokes the whole session
  family (a short grace window covers two tabs refreshing at once). "Keep me signed in" decides
  whether the cookie is persistent (30 days) or session-only.
- Cookie endpoints require an `X-ArabDev-Client` header, which cross-site forms can't send (CSRF).
- Changing or resetting the password bumps a token version, so every outstanding access token dies.
- Rate limits protect login, registration, password reset, search, uploads, posting and commenting
  (Redis when configured, otherwise in-process). They count per address, taken from the right-hand end
  of `X-Forwarded-For` so a client can't forge its way around them (see `TRUSTED_PROXY_HOPS`), and
  sign-in and password reset are also limited per account, so guesses spread over many machines
  still run out.
- The app is served with HSTS, `X-Frame-Options: DENY`, a Content-Security-Policy that blocks
  framing, plugins, `<base>` hijacking and off-site form posts, and related headers (`vercel.json`, and
  `frontend/nginx-security-headers.conf` for Docker). Scripts and frames are not allow-listed, because
  Google AdSense and Cloudflare Turnstile load from hosts that change without notice.

### Posts and the editor
- The editor is TipTap with a deliberately small toolbar: headings, bold/italic/underline/strike,
  inline code, code blocks, quotes, lists, links, tables, alignment, and **controlled** font
  (Alexandria / Tajawal / Anton), size and color choices. Colors are CSS variables
  (`var(--ad-text-red)` …) so a post written in light mode stays readable in dark mode.
- Every paragraph gets `dir="auto"`, so Arabic and English can share one post and each aligns itself.
- The server re-sanitizes everything with **nh3** and an allow-list that mirrors the toolbar (fonts,
  sizes, colors and alignments outside the list are dropped). The browser sanitizes again with
  DOMPurify as defense in depth.
- Posts can attach one image and one link, carry up to 5 tags, and be saved as drafts.

### Feed, pagination and ads
- **No infinite scroll.** Every list is paginated on the server (`?page=&limit=`, max 20) and returns
  `{items, page, limit, total, pages}`. The UI uses numbered MUI pagination with previous/next.
- Feed tabs: **For you** (newest days first; within a day, people you follow and your interests rank
  higher), **Following** (posts *and reposts* by people you follow), **Latest**.
- **Ads appear after every 8 posts**, never randomly. Which ad fills a slot rotates predictably with
  the page number. Ads are labelled "Sponsored" with the sponsor's name on a dashed, tinted surface
  and never mimic posts. Desktop also has one sidebar ad slot. Seeded ads are ArabDev house ads.

### Social graph and recommendations
- Follows, likes, bookmarks, reposts and comments are relational tables with the right indexes.
- Tags map onto interests (`#js` → JavaScript), which powers "For you" and developer suggestions
  (shared interests, then people followed by people you follow).
- Notifications (likes, comments, follows, reposts, mentions) respect each user's preferences and
  privacy ("who can mention me"); undoing a like/follow withdraws its unread notification.

### Media
- Uploads are decoded with Pillow, checked for type, size (5 MB) and dimensions, and **re-encoded to
  WebP** (avatars are cropped to 400×400, post images capped at 1600 px). Nothing the client sent is
  served back as-is.
- Storage goes through a small `StorageBackend` interface (`save / delete / url`); only local disk
  ships today, and an S3-compatible backend only needs to implement those three methods.

### Frontend architecture
- One `PreferencesProvider` owns language → direction → Emotion RTL cache → MUI theme, so switching
  language flips the whole layout at once. Language and theme are saved to the account when signed in.
- Theme tokens live in `src/theme` (colors, typography, spacing/radii/shadows). Light and dark are
  separate color schemes, not an inversion.
- TanStack Query handles caching; likes, bookmarks, reposts and follows update optimistically across
  every cached copy (feed, profile, search, post page).
- Routes are lazy loaded; the editor bundle only loads on the editor page.

### Documentation sites
- `wiki/`, `privacy/` and `patch-notes/` are standalone static sites (plain HTML, CSS and a little
  JavaScript) on their own subdomains: `wiki.arabdev.site`, `privacy.arabdev.site` and
  `patch.arabdev.site`. Each folder is self-contained (its own fonts and favicon) and is deployed
  as-is, with no build step. Each has `ar/` and `en/` pages and an `index.html` that opens the
  language the reader last used there (Arabic by default).
- Links between the sites and back to the app are absolute (`https://arabdev.site/dashboard`,
  `https://wiki.arabdev.site/…`). On `localhost` their scripts rewrite those links to the local
  paths below, so development never jumps to production.
- In development a small Vite plugin in `frontend/vite.config.ts` serves them at
  <http://localhost:5173/wiki/>, `/privacy/` and `/patch-notes/`. Every build publishes `LICENSE` as
  `/LICENSE.txt` on the app.
- The app links to them from the side column, the account menu, the sign-in pages, the registration
  form and Settings → Privacy (`src/components/DocLinks.tsx`), in the reader's language. All public
  addresses and the two contact emails live in `frontend/src/site.ts`.
- Keep both languages in step: the Arabic and English pages use the same element ids, so links and
  the language switch land on the same section. Everything is readable without JavaScript.
- **Patch notes:** add a new `<article class="release">` above the previous one and tag each change
  with `data-type="new|improved|fixed|security|developer"`. The filters and counts are computed from
  the list, so they never need updating by hand.

---

## Configuration

Backend settings (env vars or `backend/.env`, see `backend/.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `backend/arabdev.db` | `sqlite:///` + path (four slashes for an absolute Linux path), or a PostgreSQL URL |
| `SECRET_KEY` | dev value | **Required** in production |
| `REDIS_URL` | unset | Enables shared rate limiting and caching |
| `TRUSTED_PROXY_HOPS` | `1` | Reverse proxies in front of the API that append to `X-Forwarded-For` (`1` fits Vercel, which replaces the header, and the Docker nginx). Raise it for each extra proxy in front, such as Cloudflare; `0` ignores the header |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Comma separated |
| `FRONTEND_URL` | `http://localhost:5173` | Used in password reset links. Production: `https://arabdev.site` |
| `SUPPORT_EMAIL` / `HELLO_EMAIL` | `support@` / `hi@arabdev.site` | Shown in emails and the API docs |
| `MAIL_FROM` | `ArabDev <support@arabdev.site>` | Sender for outgoing email |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `MEDIA_ROOT` | `backend/media` | Uploaded files (local storage only) |
| `STORAGE_BACKEND` | `local` | `database` keeps images in the database, for hosts without a disk |
| `CRON_SECRET` | unset | Bearer token for the scheduled clean-up endpoint |
| `VERCEL` | unset | Set to `1` by Vercel; turns on production mode, secure cookies and database image storage |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | 15 / 30 | |

Frontend build settings (`frontend/.env`, see `frontend/.env.example`): `VITE_API_ORIGIN` points the
app at an API on another address (not needed on Vercel, where both share one), and
`VITE_WIKI_URL`, `VITE_PRIVACY_URL`, `VITE_PATCH_NOTES_URL` override the documentation addresses.

Email: no mail provider is wired up yet. In development, password reset links are printed in the
backend log. `app/services/email_service.py` is the single place to plug in SMTP or an email API.

### Before going public: commitments made in the privacy policy
The privacy policy describes how the official service runs. Most of it is enforced by the code
(hashed tokens, cookie scope, metadata stripping, cascading deletion, automatic token clean-up). A few
points depend on how the service is operated, so check them before launch:

- Make sure `support@arabdev.site` and `hi@arabdev.site` receive mail; the policy, wiki and patch
  notes promise a reply within 30 days (acknowledgement within 7).
- Keep server and proxy logs for no longer than **30 days** (for example with logrotate or your
  host's log retention setting). `docker-compose.yml` caps container log size but not their age.
- Rotate backups so deleted data disappears from them within **30 days** (on Neon, check the
  restore window).
- Serve everything over HTTPS with `COOKIE_SECURE=true`.
- Have the policy reviewed by someone qualified for the countries you operate in. It is written to be
  accurate about the software, not as legal advice.

---

## Notes and deliberate choices

- **SQLite** is the development database: one file, nothing to operate, and fast for this workload.
  The engine enables WAL (readers never wait for a writer), foreign keys and a busy timeout. Back it
  up by copying `arabdev.db` (or `sqlite3 arabdev.db ".backup backup.db"` while running), and run the
  API as a single process.
- **PostgreSQL** is used when ArabDev is hosted on Vercel, where there is no disk to keep a file on.
  Nothing else changes: the same models, migrations and tests run on both, and `DATABASE_URL` decides.
  Hosted `postgres://` URLs are pointed at psycopg 3 automatically, and Neon's connection pooler is
  accounted for.
- **Uploaded images** normally live on disk. With `STORAGE_BACKEND=database` they are stored in the
  `media` table instead (loaded only when requested) and served by the API with immutable cache
  headers, so hosts without a disk still work. Images between 4 and 5 MB are re-encoded in the browser
  first, because Vercel refuses request bodies above 4.5 MB.
- **Deployment on Vercel** (how arabdev.site runs): four projects from this one repository.

  | Project | Vercel settings | Domain |
  |---|---|---|
  | App **and API** | Root directory `./` — `vercel.json` sets the build and routing | `arabdev.site` |
  | Wiki | Root directory `wiki`, no build command, output `.` | `wiki.arabdev.site` |
  | Privacy | Root directory `privacy`, no build command, output `.` | `privacy.arabdev.site` |
  | Patch notes | Root directory `patch-notes`, no build command, output `.` | `patch.arabdev.site` |

  The first project needs a PostgreSQL database — add **Neon** under *Storage*, which sets
  `DATABASE_URL` — plus `SECRET_KEY` and `CRON_SECRET` (any long random value; Vercel sends it to the
  daily clean-up job). `VERCEL=1` is set automatically and turns on production mode, secure cookies
  and database image storage. The app and the API share one address, so no CORS or cross-site cookie
  settings are needed, and `/dashboard` and other app routes fall back to `index.html`.

  `api/index.py` runs the schema migrations and inserts reference data when an instance starts, under
  a PostgreSQL lock so instances starting together cannot collide. Rate limiting counts attempts in
  memory, which on serverless is per instance; connect a Redis URL (for example Upstash) as
  `REDIS_URL` to share the counters.

- **Deployment on one server** (VPS or Docker) also works unchanged: SQLite on disk, images on disk,
  `docker compose up --build`. Serve the app build as a static site and set
  `FRONTEND_URL=https://arabdev.site` and `CORS_ORIGINS=https://arabdev.site` on the API. If the API
  runs on a subdomain such as `api.arabdev.site`, the sign-in cookie still works because both are on
  `arabdev.site`.
- **Messages** was listed as "possible navigation" but had no endpoints or tables in the brief, so it
  is left out rather than shipped as a dead menu item.
- Fonts (Alexandria, Tajawal, Anton) are self-hosted as WOFF2 under the SIL Open Font License.

---

## License

ArabDev is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License, version 3** or (at your option) any later version, as published by the
Free Software Foundation. It is distributed in the hope that it will be useful, but **without any
warranty**; see [`LICENSE`](LICENSE) for the full text (`GPL-3.0-or-later`).

The bundled fonts are licensed separately under the SIL Open Font License 1.1 (see
`frontend/public/fonts/*/OFL.txt`).
