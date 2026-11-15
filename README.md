# TaraGold

Jewelry B2B commerce platform (Django modular monolith).

## Dokümantasyon (tek kaynak)

| Bilgi | Dosya |
|-------|--------|
| AI agent çalışma kuralları | [`AGENTS.md`](AGENTS.md) |
| Ürün / mimari / ADR / backlog / güncel durum | [`docs/MASTER.md`](docs/MASTER.md) |
| Kurulum, migrate, test, runserver | [`backend/README.md`](backend/README.md) |
| Vite SPA portal | [`frontend/README.md`](frontend/README.md) |

Kanonik durum: `docs/MASTER.md` §2 + §12. Dağınık faz raporu / ikinci yol haritası yok.

## Hızlı başlangıç

```powershell
cd backend
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r config\requirements.txt
cd config
copy .env.example .env
# .env: SECRET_KEY, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
# Staging (DEBUG=False + fake provider): ALLOW_FAKE_PROVIDERS=1
python manage.py migrate
python manage.py seed_role_permissions
python manage.py bootstrap_platform
python manage.py seed_tanimlar
python manage.py createsuperuser
python manage.py runserver
```

Frontend (ayrı terminal; **mock yok** — Django proxy):

```powershell
cd frontend
copy .env.example .env.local
# DJANGO_ORIGIN=http://127.0.0.1:8000
# VITE_USE_MOCK asla staging/prod'da true olmamalı
npm install
npm run dev
```

Ortam yolu ve ayrıntı: [`backend/README.md`](backend/README.md) → **Ortam kurulumu**.

## Teknoloji

- Python 3.12–3.14 · Django **6.1.2** · PostgreSQL · `psycopg`
- HTTP: Django Admin (`/admin/`) + `/api/v1/` (B1–B7)
- Frontend: Vite + React Router + TanStack Query (`frontend/`) — ADR-0031
- Domain app’ler: `firmalar` … `kalite` + `api` (ADR-0004)

Güncel faz / sıradaki iş: master **§12**.
