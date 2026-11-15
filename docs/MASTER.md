# TaraGold MASTER (özet iskelet)

> Kanonik canlı durum. Yeni oturum: `AGENTS.md` → bu dosya §2 + §12.

## §2 — Canlı durum (2026-11-14)

- Django 6.1 + Vite SPA (ADR-0031).
- Katalog yazma: `/api/v1/ops/products/` (ADR-0030).
- Ürün akışı: **taslak → Yayınla** (çift onay / dört göz kaldırıldı; [ADR-0038](decisions/ADR-0038-urun-onay-kaldirma.md) Taslak). Pasife alınca yeniden taslak.
- Alıcı vitrin: `yayin_durumu=aktif` (+ yayın anında `onay_durumu=onayli` uyumu).
- Tanım CRUD tek yüzey: `/tanimlar` (ops definitions + catalog-refs + kategoriler; `?grup=`).
- Ops workspace **Stok & Fiyat**: ürün → depo → özellik kırılımı (varyant) başına ayrı birim fiyat + hedef adet (tek ekran; teklif jargonu yok, ledger arka planda).

## §12 — Sıradaki adım

1. OpenAPI regenerate (stock teklif alanları; ürün action sadeleşmesi).
2. Alıcı smoke: kanal → katalog fiyat → sepet → checkout.
3. P2: Excel / favoriler / barkod-marka (`docs/BACKLOG.md` varsa).
