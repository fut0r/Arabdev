# ArabDev 1.4 deployment

Back up the database before deploying. Run `python -m app.cli migrate` with a direct database connection in the release stage, then set `AUTO_MIGRATE=false` for warm and cold API starts. The existing `AUTO_MIGRATE=true` default remains available on hosts without a release hook; PostgreSQL migrations use an advisory lock. Cleanup is no longer part of migration startup. Keep the authenticated daily cleanup job configured. Migration `c14a20261028` backfills normalized search fields in batches; trial it on a copy of your database before a production release. Downgrade removes 1.4 metadata, so restore a backup to preserve those new fields.

## Optional GitHub sign-in

Create a GitHub OAuth App. Callback: `https://arabdev.site/auth/github/callback` (or the exact local FRONTEND_URL plus that path). Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the API only. No frontend secret is required. Empty values hide the button. State is bound to an HttpOnly ten-minute cookie, authorization uses PKCE, and the code is exchanged server-side. Existing accounts must sign in and link with their password; email matches never merge accounts. Two-factor and required login email codes are preserved. New GitHub users can set a password through the existing verified-email reset flow. Test the real provider callback in staging before enabling production.

## Optional weekly digest

Set `WEEKLY_DIGEST_ENABLED=true` only after SMTP works and enough useful content is published regularly. The switch then appears in notification preferences. It is off for every existing and new account by default. The existing authenticated daily `/api/v1/internal/cron/purge-tokens` job processes up to five eligible recipients per invocation and stops starting new deliveries after a ten-second budget. An in-flight SMTP call can exceed that budget; set short SMTP timeouts and use a dedicated longer-running worker calling `deliver_weekly` for larger lists. With the default daily schedule, at most 35 recipients can be processed each week. Monitor throughput before enabling subscriptions at scale. Each user is claimed once per UTC week, before SMTP. Empty weeks are skipped; failed/uncertain delivery is recorded and is **not automatically retried**, preventing duplicate messages after network timeouts. Review failed/pending rows manually. GET unsubscribe displays confirmation; POST applies it. No emails are sent by deployment or tests.

## Optional S3-compatible media

Install the backend with `pip install -e ".[s3]"` (or add this extra to your hosting requirements). Set `STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_PUBLIC_URL` (HTTPS public/CDN base), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT_URL` and `S3_REGION` (default auto). Grant the service only object read/write/delete for its bucket and configure public image delivery separately. New objects use an `s3/` marker internally. Existing database images retain `/media/...` URLs and continue to load; existing local images require keeping MEDIA_ROOT mounted. This release does not migrate or delete historical media. Do not switch away from S3 while rows still reference it. Run upload/read/delete smoke checks against your staging bucket before enabling production.

## Verification

Backend: `pytest`, `ruff check .`, `ruff format --check .`, `pip-audit --skip-editable`.
Frontend: `npm ci`, `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm audit`.
Browser: `npx playwright install chromium`, `npm run test:e2e`. This starts a loopback API with a disposable SQLite file under `.cache`, disables SMTP/Turnstile/provider integrations, and runs desktop/mobile journeys. It never uses backend/arabdev.db. Production Turnstile and provider credentials need staging smoke checks.
