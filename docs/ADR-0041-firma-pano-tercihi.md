# ADR-0041 — Kuyumcu pano adı + ek marj

- **Durum:** Kabul (kullanıcı talimatı 2026-11-16)
- **Tarih:** 2026-11-16
- **Kapsam:** `FirmaPanoTercih` + `GET /piyasa/pano/` firma bağlamı + alıcı tercih API

## Karar

| Kim | Başlık | Fiyat |
|-----|--------|--------|
| Platform / ops | Global `pano_baslik` (örn. Aydemir) veya platform firma adı | Platform kalem marjı |
| Kuyumcu (alıcı firma) | `FirmaPanoTercih.pano_baslik` veya **firma.ad** | Platform nihai + **firma ek marjı** |

- Tercih **tenant-scoped** (`firma` OneToOne); client `firma_id` güvenilmez.
- Ek marj: işaretli `alis_marj` / `satis_marj` + `marj_tipi` (TL|YUZDE); platform fiyatının üstüne uygulanır.
- Alıcı API’ye ham/platform marj sızmaz; yalnız nihai + kendi başlık.

## Yapılmayacaklar

Kuyumcunun platform kalem marjını değiştirmesi; kör havuz sızıntısı; FE’de sahte fiyat.
