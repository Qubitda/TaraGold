# ADR-0040 — Kalem fiyatı: Canlı veya Elle sabit

- **Durum:** Kabul (kullanıcı talimatı 2026-11-16)
- **Tarih:** 2026-11-16
- **Kapsam:** `PiyasaUrun` + `piyasa_fiyat_servisi` + ops ayar UI
- **İlke:** Operatör her kalemde sorar: canlı mı, elle mi? Karmaşık marj/politika ekranı yok.

## Karar

| Mod | Anlam |
|-----|--------|
| `CANLI` | Binance/ingest ham fiyat + kalem marjı (`alis_marj` / `satis_marj`) |
| `ELLE` | Operatör sabit `sabit_alis` / `sabit_satis` girer; feed/marj uygulanmaz |

- Varsayılan: `CANLI`.
- `ELLE`: her iki sabit > 0 ve `sabit_satis ≥ sabit_alis`; `feed_health = FEED_LOCKED_MANUEL`.
- Pano/ticker görünürlüğü (`aliciya_goster`, `ticker_da_goster`) ayrı kalır.
- UI: tek tablo; Canlı→marj, Elle→alış/satış. Kayan şeritte «Ticker» etiketi yok.

## Yapılmayacaklar

Global «hepsi elle» kilidi; FE sahte fiyat; ELLE’de gizli marj uygulaması.
