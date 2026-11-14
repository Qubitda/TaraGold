# TaraGold MASTER (özet iskelet)

> Bu dosya workspace’te eksikti; ADR-0037 uygulaması sırasında iskelet olarak eklendi.
> Tam tarihçe için git geçmişi / ekip kanonik kopyası birleştirilmeli.

## §2 — Canlı durum (2026-11-14)

- Django 6.1 + Vite SPA (ADR-0031).
- Katalog yazma: `/api/v1/ops/products/` (ADR-0030).
- Alıcı fiyat: quote → cart (`quote_id`); katalogda fiyat yok.
- **ADR-0037 P0 uygulandı**: `UrunGorsel`, bulk varyant, readiness, price-preview, media API, FE Hazırlık paneli.

## §12 — Sıradaki adım

1. P1 backlog: çoklu koleksiyon M2M, etiket/rozet, alıcı detay vitrin (`docs/BACKLOG.md`).
2. OpenAPI regenerate + FE `generate:api` (media/preview path’leri).
3. Lokal: `seed_urunler` (refs) sonrası ops ürün hazırlık akışı smoke.
