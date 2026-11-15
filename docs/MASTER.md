# TaraGold MASTER (özet iskelet)

> Kanonik canlı durum. Yeni oturum: `AGENTS.md` → bu dosya §2 + §12.

## §2 — Canlı durum (2026-11-15)

- Django 6.1 + Vite SPA (ADR-0031).
- Katalog yazma: `/api/v1/ops/products/` (ADR-0030).
- Ürün akışı: **taslak → Yayınla** (çift onay / dört göz kaldırıldı; [ADR-0038](decisions/ADR-0038-urun-onay-kaldirma.md) Taslak). Pasife alınca yeniden taslak.
- Alıcı vitrin: `yayin_durumu=aktif` (+ yayın anında `onay_durumu=onayli` uyumu).
- Tanım CRUD tek yüzey: `/tanimlar` (ops definitions + catalog-refs + kategoriler; `?grup=`).
- Ops workspace **Stok & Fiyat**: ürün → depo → özellik kırılımı (varyant) başına ayrı birim fiyat + hedef adet (tek ekran; teklif jargonu yok, ledger arka planda).
- Sipariş UX: Sipariş Ver → çok satır staging → Siparişi Gönder → `ONAY_BEKLIYOR` → ops onay → HazirlamaEmri; Sipariş Listem = gönderilmiş siparişler.
- **RFQ kaldırıldı** (BE+FE): `/rfqs/`, supplier RFQ, ops eşleştirme, `can_manage_rfq`, `TedarikciTeklif.rfq*` FK. PriceQuote/PriceLock/teklif ve montür+taş katalog korunur. Migration: `fiyatlama.0021` + `siparis.0011` (henüz uygulanmadı).

## §12 — Sıradaki adım

1. Yerel/PG: `migrate` (`fiyatlama.0021`, `siparis.0011`) + `seed_role_permissions` (manage_rfq temizliği).
2. Alıcı smoke: kanal → katalog fiyat → Sipariş Ver → Gönder → ops onay.
3. OpenAPI FE sync doğrula (`npm run generate:api`).
4. P2: Excel / favoriler / barkod-marka (`docs/BACKLOG.md` varsa).
