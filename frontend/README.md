# TaraGold frontend (Vite SPA)

Vite + React + TypeScript portal. Normatif API: [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) + [`docs/api/openapi-v1.json`](../docs/api/openapi-v1.json) — **repo kökünde** (`frontend/` içinde kopya yok).  
UI runtime: [ADR-0031](../docs/decisions/ADR-0031-vite-spa-portal.md) **Kabul**. API sözleşmesi: [ADR-0017](../docs/decisions/ADR-0017-nextjs-api-sozlesmesi.md) NX-1…12.

## Mimari

- `src/features/<django-app>` — components / types / services / hooks / schemas
- `src/app/(portal)/…` — sayfa girişleri (React Router `Routes` ile bağlanır)
- `src/lib/api` — session + CSRF + otomatik Idempotency-Key (yazma; auth exempt)
- Routing: **react-router-dom** (dinamik segment + 404)
- Veri önbellek: **@tanstack/react-query**
- Bildirim: `ToastProvider` / `useToast`
- Hata: `AppErrorBoundary` (Next `error.tsx` yok)

## API tipleri

```bash
npm run generate:api   # ../docs/api/openapi-v1.json → src/lib/api/schema.d.ts
```

`src/lib/api/types.ts` şemadan re-export eder. Feature `types/` alan adları OpenAPI ile birebir kalır.

## Test / lint

```bash
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint
npm run build          # typecheck + vite build
npm test               # vitest
npm run test:e2e       # playwright — Vite:3000 + Django (API mock yasak)
```

E2E önkoşul: Django `runserver`, `CSRF_TRUSTED_ORIGINS=http://127.0.0.1:3000`,
`DJANGO_ORIGIN` proxy, `USE_MOCK` kapalı, `seed_demo_portals`.
Kimlik: `E2E_USERNAME` / `E2E_PASSWORD` (varsayılan `demo_alici` / `DemoPortal1!`).
`page.route` ile `/api` mock **yasak**. Workers=1 (tek demo kullanıcı / sepet çakışması).

## Yerel çalıştırma

Paket: **npm** (`package-lock.json`). `bun.lock` / `yarn.lock` / `pnpm-lock.yaml` commit edilmez.  
Node: **≥22.12** (`engines`).

1. Backend: `backend/config` → `runserver` (PG).
2. Django `.env`: `CSRF_TRUSTED_ORIGINS=http://127.0.0.1:3000`
3. Frontend:
   ```bash
   cp .env.example .env.local   # DJANGO_ORIGIN=http://127.0.0.1:8000
   npm install
   npm run dev                  # http://127.0.0.1:3000 → /api proxy
   npm run dev:lan              # yalnız bilinçli LAN (--host 0.0.0.0)
   ```

## Offline mock (opsiyonel)

`tools/mock-api-plugin.ts` yalnız `USE_MOCK=true` iken dinamik yüklenir (statik import yok).  
Staging/production/`--mode staging` build’de `USE_MOCK=true` **fail-fast**.  
Günlük geliştirme ve E2E: mock **kapalı**, Django zorunlu.

## PWA / cache

`public/sw.js` **network-first**; HTML cache’lenmez. `CACHE_NAME` sürümü deploy’da artırılır. `npm run dev` altında kayıtlı SW unregister edilir.

## Build artefaktları

`.next/` (Next kalıntısı) ve `dist/` (Vite çıktısı) **gitignore**’dadır; commit edilmez. Yerelde silinebilir; `npm run build` `dist/` üretir.

## Yasak

- `next/*` import / shim
- Sahte endpoint / mock KPI (prod yolu; offline `USE_MOCK` hariç)
- AI Studio kalıntıları (`GEMINI_*`, `metadata.json`, `DISABLE_HMR`, `experimentalDecorators`)
