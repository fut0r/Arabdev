# Contributing to ArabDev

Thanks for wanting to help. Bug fixes, translations, docs and features are all welcome. This page
covers how the project is put together and what a pull request needs to get merged.

بالعربية باختصار: نرحّب بمساهماتك. افتح مشكلة (issue) قبل أي ميزة كبيرة، واكتب كل نص يظهر للمستخدم
بالعربية والإنجليزية معًا، وشغّل الفحوصات المذكورة أدناه قبل فتح طلب الدمج. للأسئلة راسلنا على
hi@arabdev.site.

## Before you start

- **Small fixes** (typos, an obvious bug, a missing translation): open a pull request directly.
- **Anything bigger** (a feature, a new dependency, a change to how data is stored): open an issue
  first so we can agree on the approach before you spend the time.
- **Security problems**: never in a public issue. See [SECURITY.md](SECURITY.md).

Setup takes about five minutes; the [README](README.md#run-it-locally) has the steps.

## The rules that matter most

1. **Two languages, always.** Every string a person sees goes in both
   `frontend/src/i18n/ar.json` and `en.json`, never hard-coded. Arabic plurals need the `_zero`,
   `_one`, `_two`, `_few`, `_many` and `_other` forms. If you can't write good Arabic, write the
   English and say so in the pull request; someone will help.
2. **Right to left is the default.** Use logical CSS (`marginInlineStart`, `insetInlineEnd`,
   `textAlign: 'start'`) rather than left and right, and check your change in Arabic.
3. **The server decides.** Permissions, limits and validation live in the backend services. The
   frontend can hide a button, but the API must refuse the action too. A new route that changes
   something gets `dependencies=[RequireHuman]` (`app/services/human_check.py`) or a Turnstile
   guard of its own, so scripts can't use it, and anything people publish goes through
   `app/services/spam_guard.py`.
4. **Tests for behaviour.** A backend change comes with a test in `backend/tests/` that would fail
   without it.
5. **Docs stay true.** If you change how something works for people, update the matching article
   in `wiki/en` and `wiki/ar` (same element ids in both), and anything the privacy policy says about
   it. Releases get an entry in `patch-notes/`.

## How the code is organised

**Backend** (`backend/app`):

- `api/v1/*.py` routes are thin: they parse the request, call a service, return a schema.
- `services/` holds the rules. Most features are one service module (`two_factor_service.py`,
  `block_service.py`, `report_service.py`, ...). Start reading there.
- `repositories/` has queries that more than one service needs. `models/` and `schemas/` are what
  they sound like.
- Errors are raised as `app.core.errors` classes with a stable `code` (`"blocked"`,
  `"post_not_found"`); the frontend translates the code, so keep codes stable and add a translation
  for new ones under `errors` in both language files.
- Schema changes need an Alembic migration (`alembic revision --autogenerate -m "..."`, then read
  and tidy it). Use `sa.true()` / `sa.false()` for boolean defaults so it works on SQLite and
  PostgreSQL.

**Frontend** (`frontend/src`):

- `features/<name>/` holds the components and hooks for one feature; `pages/` only puts them
  together for a route.
- Server data goes through TanStack Query; keys live in `api/queryKeys.ts`.
- MUI with the project theme (`theme/`). Prefer theme tokens (`text.secondary`, `surface.sunken`)
  over raw colours so dark mode keeps working.

## Checks

Run these before pushing; CI runs the same ones.

```bash
cd backend
pytest
ruff check .            # lint, including bandit's security rules
ruff format .           # formatting

cd frontend
npm run lint            # oxlint
npm run format          # Prettier
npm run build           # type check, build, prerender
```

If a lint rule is wrong for a specific line, disable it on that line with a short reason rather
than turning it off everywhere.

## Pull requests

- One topic per pull request. Refactors and features in separate ones are much easier to review.
- Write commit messages that say what changed and why, in plain sentences. The history is read by
  people trying to understand a decision months later.
- Screenshots in both languages help a lot for anything visual, and a phone-width screenshot if
  layout changed.
- By contributing you agree that your work is released under the project's licence, the GNU GPL
  v3 or later.

## Conduct

Be kind and assume good intent. The [code of conduct](CODE_OF_CONDUCT.md) applies to issues, pull
requests and everything else around the project.
