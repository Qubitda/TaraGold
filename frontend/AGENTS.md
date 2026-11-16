# TaraGold frontend (Vite SPA)

Normatif runtime: Vite + React Router + TanStack Query.

- Paket: `frontend/package.json` + `package-lock.json` (npm); Node `.nvmrc` = 24.12.0
- API: Django `/api/v1` via Vite proxy (`DJANGO_ORIGIN`). Staging/prod: `USE_MOCK` yasak.
- OpenAPI: `docs/api/openapi-v1.json` → `npm run generate:api` (veya `/api/schema/`)
- Offline mock: yalnız `USE_MOCK=true` → `tools/mock-api-plugin.ts` (dinamik import).
- Sayfa girişleri: `src/app/(portal)/…` — React Router `Routes` ile bağlanır (Next.js App Router değil).
- Kurallar: kök [`AGENTS.md`](../AGENTS.md) + [`docs/RUNBOOK.md`](../docs/RUNBOOK.md).
