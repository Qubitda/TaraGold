# ADR-0038 — Ürün çift onay kaldırma (taslak → Yayınla)

- **Durum:** Taslak
- **Tarih:** 2026-11-14

## Bağlam

Ürün kataloğunda `onaya_gonder` → `onayla` / `reddet` → `yayina_al` zinciri ve dört göz kuralı operasyonu yavaşlatıyordu. Sipariş / firma onayları ayrı kalır.

## Karar

- Ürün akışı: **taslak → Yayınla** (en az bir aktif satış kanalı zorunlu).
- `onay_durumu` kolonu kalır; yayın anında `onayli` yazılır (alıcı vitrin filtresi uyumu).
- Yayından kaldırma: `yayin=pasif` + `onay_durumu=taslak`.
- Kritik alan kilidi: yalnız `yayin_durumu=aktif` iken.
- FE: Onaya Gönder / Onayla / Reddet kaldırıldı; `submit`/`approve`/`reject` `allowed_actions` üretilmez.
- API `…/submit|approve|reject/` geri uyumluluk için durur; UI çağırmaz.

## Sonuçlar

- Solo ops aynı aktörle yayınlayabilir.
- Eski `onay_bekliyor` kayıtlar doğrudan yayınlanabilir.
- İleride kolon drop / permission cleanup ayrı iş.
