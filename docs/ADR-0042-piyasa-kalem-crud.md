# ADR-0042 — Piyasa kalem CRUD + hurda + döviz GBP/CHF

- **Durum:** Taslak
- **Tarih:** 2026-11-16
- **Kapsam:** Ops `PiyasaUrun` create/delete; hurda örnekleri; pano döviz GBP/CHF
- **Uygulama (2026-11-16):** kod + test dilimi landed; ADR hâlâ Taslak (Kabul ayrı).

## Karar

1. **Kategoriler sabit** (`grup` / `bolum`); kalem adı, gram, milyem (ayar), marj kullanıcıda.
2. **Formül değişmez:** `ham = saf × milyem × gram`; `nihai = ham ± marj` (TL|%). İşçilik TL yok.
3. **Hurda:** ayrı motor yok; `bolum=ESKI_ALTIN` + ayar/gram/marj. Seed örnek `hurda_14|18|21|22`.
4. **CRUD:** `POST/DELETE /ops/piyasa/urunler/`; PATCH’e `gram` / `metal_id` / `ayar_id` / `olcek`. Silme soft (`aktif=false`).
5. **Döviz panosu:** USD/EUR + **GBP** + **CHF** (kur yoksa satır `ok=false`; zincir `*USDT×USDTTRY`).
6. **Frankfurter yedek:** Binance book 0/yok (GBP/CHF) veya metal poll kesik → `api.frankfurter.dev` mid ± `spread_bps`; XAU/XAG troy oz → gram TRY. Referans (günlük), trading quote değil; banner/LKG ile.

## Yapılmayacaklar

İsimleri koda gömmek; işçilik ek alanı; client `firma_id` ile tenant.

## Kanıt (özet)

- API: `OpsPiyasaUrunListCreateView` + PATCH/DELETE; seed `hurda_*`; ingest GBPUSDT/CHFUSDT.
- FE: ayar panel Ekle/Sil + gram/ayar.
- Test: `api.tests.test_adr0042_piyasa_kalem_crud` (5 OK, `--keepdb`).
- Frankfurter: `tanimlar.services.providers.frankfurter` + `persist_frankfurter_fallback`; test `test_frankfurter_fallback`.
