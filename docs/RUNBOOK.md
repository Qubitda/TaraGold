# TaraGold RUNBOOK

Kurulum ve işletim. Kanonik ürün durumu: yoksa kök `README.md` + `backend/README.md`.

## İlk kurulum sırası

1. PostgreSQL ayakta; `backend/config/.env` doldurulmuş (`SECRET_KEY`, `DB_*`, `DEBUG`, `ALLOWED_HOSTS`).
2. `cd backend/config`
3. `python manage.py migrate`
4. `python manage.py createcachetable` — **zorunlu** (varsayılan `DatabaseCache`, tablo: `taragold_cache`)
5. Seed / bootstrap:
   - `python manage.py seed_role_permissions`
   - `python manage.py bootstrap_platform`
   - `python manage.py seed_tanimlar`
   - (opsiyonel) `createsuperuser`, `seed_urunler`, …
6. `python manage.py ingest_binance_piyasa --once` — ilk tick + MetalKuru/DovizKuru
7. Süreçler:
   - Web: `python manage.py runserver` **veya** gunicorn (`deploy/systemd/taragold-web.service` / `deploy/ecosystem.config.cjs`)
   - Feed: `python manage.py ingest_binance_piyasa --loop` (ayrı süreç; web isteğinde senkron Binance yok)
   - FE: `cd frontend && npm run dev` (Vite `/api` → Django)

## Prod TLS / nginx

- `DEBUG=False` iken `SECURE_SSL_REDIRECT` varsayılan `True`.
- Aynı anda `SECURE_PROXY_SSL_HEADER` varsayılan `True` → `X-Forwarded-Proto`.
- Header kapalı + SSL redirect açık → yönlendirme döngüsü (`taragold.E003`).

## Cache

- Runtime varsayılan: `django.core.cache.backends.db.DatabaseCache` / `LOCATION=taragold_cache`
- LocMem yalnız `manage.py test` sürecinde
- Tablo yoksa system check `taragold.E004`

## urunler 0017 geçmişi (bölünmüş migration)

Eski tek dosya `0017_varyant_ayar_metal` üç parçaya ayrıldı:

1. `0017_varyant_ayar_nullable` — nullable FK
2. `0017_varyant_ayar_fill` — veri doldurma (`atomic=False`; boş ayarlı metal+ürün → RuntimeError + id listesi, tahmin yok)
3. `0017_varyant_ayar_constraints` — unique/check

Şeması zaten uygulanmış DB (eski ad kayıtlı):

```powershell
cd backend/config
python ../../scripts/rewrite_urunler_0017_history.py
python manage.py createcachetable
python manage.py migrate
```

`keepdb` test DB’si eski `0017_varyant_ayar_metal` kaydı taşıyorsa aynı rewrite’ı `DB_NAME=test_taragold` ile çalıştırın.

## Deploy örnekleri

- systemd: `deploy/systemd/taragold-web.service`, `deploy/systemd/taragold-ingest.service`
- PM2: `deploy/ecosystem.config.cjs`
