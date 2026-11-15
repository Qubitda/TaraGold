# TaraGold frontend (Vite SPA)

Normatif runtime: Vite + React Router + TanStack Query — [ADR-0031](../docs/decisions/ADR-0031-vite-spa-portal.md).

- Paket: `frontend/package.json` + `package-lock.json` (npm).
- API: Django `/api/v1` via Vite proxy (`DJANGO_ORIGIN`). Staging/prod: `USE_MOCK` yasak.
- Offline mock: yalnız `USE_MOCK=true` → `tools/mock-api-plugin.ts` (dinamik import).
- Sayfa girişleri: `src/app/(portal)/…` — React Router `Routes` ile bağlanır (Next.js App Router değil).
- Kurallar: kök [`AGENTS.md`](../AGENTS.md) + [`docs/MASTER.md`](../docs/MASTER.md) §2/§12.
