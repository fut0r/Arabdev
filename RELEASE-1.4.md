# ArabDev 1.4 release checklist

This release implements the product review and user-requested personalization. Arabic and English, existing accounts/content, and public reading remain supported.

- [x] Personalization: account-synced and guest-local accent, fonts, text size, background, density, reading width, theme and reset.
- [x] Discovery: public home navigation, developers directory, active topics, explicit time ranges, latest/type/language filters, Arabic-normalized relevance search.
- [x] Publishing: article/question/project/note, detected or selected language, series, repository/demo URLs, autosave and recoverable local editing.
- [x] Reading: accessible excerpts, compact cards, reading time, wider articles, table of contents, highlighted/copyable code, full image view.
- [x] Community: accepted answers, followed tags, private bookmark collections and notes, editorial picks.
- [x] Operations: trusted-report threshold, accurate structured data, optional weekly digest and GitHub authentication, optional object storage and deployment migrations.
- [x] Verification: backend behavior and migrations, frontend behavior and browser journeys, Arabic desktop visual review and Arabic/English desktop/mobile browser checks, lint/typecheck/build/dependency checks.
- [x] Documentation: version 1.4.0, bilingual wiki/privacy/release notes, deployment setup and community launch guide.
- [ ] Delivery: commit with requested Git identity, push to repository, verify CI and deployment where accessible.

Services requiring new third-party credentials must be disabled until configured; no fabricated credentials or silent production migrations of existing media.

## Verified locally (2026-10-28)

- Backend: 153 passed; one PostgreSQL migration case skipped locally because no test PostgreSQL server is configured. SQLite populated upgrade/downgrade/re-upgrade passed. CI runs the PostgreSQL case against PostgreSQL 16.
- Frontend: nine unit tests and four Chromium browser journeys passed (desktop and Pixel 7), including autosave/recovery/publish and private notes. Lint, formatting, TypeScript and production build passed.
- Dependency audits: no known vulnerabilities in the installed backend environment or frontend dependency tree after security updates.
- One expected Pillow decompression-bomb warning comes from the rejection test for oversized images.

## External activation

GitHub OAuth, S3 media storage and the opt-in weekly digest are implemented but disabled until their documented credentials/configuration and staging checks are supplied. No real provider login, S3 bucket operation or production email delivery was performed. The production database has not been modified by this task. Review DEPLOYMENT-1.4.md before deployment; the digest's small default batch is intended for a small community.
