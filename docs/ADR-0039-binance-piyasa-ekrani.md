# ADR-0039 — Binance canlı piyasa → işaretli marj → pano + global ticker

- **Durum:** Kabul
- **Tarih:** 2026-11-16
- **Kapsam:** Backend `piyasa/` + `tanimlar/kur_servisi` genişletme; Vite FE ticker + pano + **vitrin/TV** (`/ekran/{token}`). Production migrate yok (dosya + onay).
- **İlke:** Sıfırdan tasarım, **mevcut kod üzerine genişletme** (`PiyasaUrun`, `hesap.py`, `piyasa_fiyat_servisi`, `KurSaglayici`/`MetalKuru`/`DovizKuru`, `piyasa-pano-strip`, `PortalShell`). Frontend Binance’e bağlanmaz.

## 1. Bağlam

Kuyumcu vitrin panosu (referans: kuyumcuekran.com): alış/satış sütunları, kalem bazlı makas, kesintide son fiyat. TaraGold’ta aynı mantık gömülü: **üstte her portalda ticker** + **`/piyasa` tam pano**.

Ham dünya fiyatı **Binance public market** (bid/ask `bookTicker`). Platformun **tek fiyatı** = ham + **işaretli kalem marjı** (iki tarafa da eklenir; negatif olabilir). Yaklaşık TL, ödeme anı kur snapshot’ı, ops hesapları bu nihai fiyattan okur.

## 2. Karar — marj semantiği (kırıcı)

**Eski** (`uygula_pano_marj`): alış marjı düşer, satış ekler; marj ≥ 0; mod global (`PiyasaMarjPolitikasi`).

**Yeni:**

\[
\begin{align}
nihai\_alis &= ham\_alis + alis\_marj && \text{(TL)} \\
&= ham\_alis \times (1 + alis\_marj/100) && \text{(\%)} \\
nihai\_satis &= ham\_satis + satis\_marj && \text{(TL)} \\
&= ham\_satis \times (1 + satis\_marj/100) && \text{(\%)}
\end{align}
\]

- `marj_tipi` (**TL|YUZDE**) **kalem bazında** (`PiyasaUrun`).
- Marj **işaretli** (negatif izinli).
- Kayıt reddi: `nihai_alis ≤ 0` veya `nihai_satis < nihai_alis`.
- Migration: eski `alis_marj` → `-alis_marj` (davranış eşdeğeri için); test ile kanıt.
- Global politika satır tipini override etmez; politika alanları deprecated / yalnız varsayılan seed.

## 3. Karar — veri kaynağı

- `KurSaglayici` arayüzü korunur; **Binance** ilk concrete provider. İkinci sağlayıcı eklenebilir.
- **Binance.TR (2026-11-16):** spot REST/WS varsayılan `api.binance.me` / `stream.binance.me`. `BINANCE_TR_API_KEY` yalnız `.env` (`X-MBX-APIKEY`; asla commit/log). Market data public; SIGNED için ayrıca `BINANCE_TR_API_SECRET`. XAU/XAG futures global `fapi.binance.com` (TR’de XAU çifti yok). TR’de `PAXG_TRY` / `XAUT_TRY` / `USDT_TRY` var; gram yolu hâlâ `XAUUSDT×USDTTRY` (yedek: `PAXGUSDT`/`XAUTUSDT`).
- Sembol tablosu/config (kod gömme yok). **Dilim 1 canlı doğrulama (2026-11-16, bu ortam):**

| İhtiyaç | Sonuç | Not |
|---------|--------|-----|
| Ons AU | **DOĞRULANDI** `XAUUSDT` fapi bookTicker | Yedek: spot `PAXGUSDT`, `XAUTUSDT` (ikisi de canlı) |
| Ons AG | **DOĞRULANDI** `XAGUSDT` fapi | |
| USD/TRY | **DOĞRULANDI** spot `USDTTRY` (`api.binance.me`) | |
| EUR/TRY | **DOĞRULANDI** zincir `EURUSDT × USDTTRY` | Spot `EURTRY` **yok** (−1121) |
| GBP/TRY | **DOĞRULANAMADI** canlı book | Spot’ta TRADING `GBP*` yok; `GBPUSDT` book 0/0; fapi `GBPUSDT` −1121. Sterlin kalemi: config’te zincir + **sıfır book → STALE/manuel**; ikinci sağlayıcı veya ops MANUEL. |

- Gram TRY (en kötü makas):  
  `gram_alis = ons_bid / TROY_OZ_GRAM × usdtry_bid`  
  `gram_satis = ons_ask / TROY_OZ_GRAM × usdtry_ask`  
  (`TROY_OZ_GRAM = 31.1035`). Has/saf referans; ayar kaleminde ham = saf × milyem, sonra **kalem marjı** (milyeme sert bağlanma yok — 22A bilezik vb. bağımsız makas).
- USDT≠USD, perp/spot sapması, yerel prim → **marj ile kapatılır**; ayrı iskonto alanı yok.
- UI: “referans fiyat” ibaresi; Binance ToS notu.
- Not: `fapi/.../exchangeInfo` bazı ağlarda HTTP 451; bookTicker bu ortamda 200.

## 4. Karar — ingest / sağlık

- Ayrı süreç: `asyncio` + websockets management command; exponential backoff; ping/pong.
- Son tick Redis (yoksa DB scratch); `feed_*_kaydet` **throttle** (≈5 sn veya %0.05 değişim).
- Anomali: tek tick %N (varsayılan 2) sıçrama / bid>ask / ≤0 → red, LKG korunur, alert.
- Bayat: `max_gecikme` (öneri **30 sn**) → `FEED_STALE_LKG` + “gecikmeli”; **300 sn** → fiyat gizlenir, **ödeme kur snapshot reddedilir** (sessiz fallback yok). Mevcut LKG/banner ile uyumlu.
- **Okuma güvenliği (2026-11-16):** `present_buyer_pano` → `ensure_fresh_feed_for_read` (throttled REST poll). Ingest süreci düşse bile HAS/ONS boş `—` kalmasın. Altın satırı yokken yalnız döviz → `kaynak=FAIL` (yanlış “son bilinen” yok). İşletim: `python manage.py ingest_binance_piyasa --loop`.

## 5. Karar — model / katalog

`PiyasaUrun` genişler:

| Alan | Not |
|------|-----|
| `bolum` | `ALTIN \| ESKI_ALTIN \| DOVIZ` (`grup` migration map) |
| `marj_tipi` | kalem `TL\|YUZDE` |
| `alis_marj` / `satis_marj` | işaretli; MinValueValidator kaldırılır |
| `alis_goster` / `satis_goster` | Pano/ticker sütunu (14/18 ayar satış boş → `satis_goster=false`) |
| `aliciya_alis_goster` | **Seçimli (Q2):** alıcı API/ticker’da alış kolonunu göster/gizle (varsayılan `true`); ops her zaman ham+alış görür |
| `ondalik` | döviz 4, altın 2 varsayılan |
| `ticker_da_goster`, `aliciya_goster`, `sira`, `aktif` | |
| `gram` | sarrafiye çarpanı admin’den (Ata/Gremse toptancı teyidi) |

Seed (16 kalem, marj 0): 22A bilezik, Gram/Has, Çeyrek/Yarım/Tam (Yeni), Cumhuriyet, Gremse, 14A, 18A; Eski çeyrek/yarım/tam/gremse; USD/EUR/GBP.

## 6. Karar — API

| Endpoint | Rol |
|----------|-----|
| `GET /api/v1/piyasa/pano/` | Marjlı nihai; alıcıya açık; **ham/marj yok** |
| `GET /api/v1/piyasa/pano/stream/` | SSE; auth; snapshot + değişim + 15s heartbeat; polling yedeği 5s |
| `GET /api/v1/ops/piyasa/pano-detay/` | Ham bid/ask, marj, nihai, tick, sağlık |
| `PATCH /api/v1/ops/piyasa/urunler/{id}/` | `manage_piyasa`; audit eski→yeni; aşırı değişimde FE onay penceresi |
| `GET /api/v1/ops/piyasa/gecmis/` | Dakikalık geçmiş (retention) |

Ödeme snapshot bu servisten; gözlem FK saklanır.

## 7. Karar — frontend

1. **Global ticker:** `PortalShell` / header üstü sticky ≤36px; her portal (alıcı/ops/tedarikçi). CSS sonsuz kaydırma; `prefers-reduced-motion` → kaymaz. SSE tek `EventSource` (context). Sekme gizli → pause. Bayat → sönük + rozet; çok bayat → “—”. `aria-live="off"` + erişilebilir özet.
2. **`/piyasa`:** 3 panel (ALTIN | ESKİ | DÖVİZ), koyu zemin, ▲▼, HAS SATIŞ vurgusu, saat. Ops: ham/marj/nihai + satır içi marj.
3. **Admin marj:** canlı önizleme, ticker sırası, uyarılar.
4. Mevcut `piyasa-pano-strip.tsx` dönüştürülür; ikinci ticker yazılmaz.
5. **Vitrin/TV şimdi (Q4):** `/ekran/{token}` tam ekran, iptal edilebilir token, salt-okunur pano (dilim 8 zorunlu).

## 8. Dilimler

1. ADR + Binance sembol doğrulama ✅  
2. Marj semantiği + model/migration + birim test ✅ (`0007`/`0008`, `hesap`+`piyasa_fiyat` 28 OK)  
3. Binance provider + ingest + anomali/bayat ✅ (`ingest_binance_piyasa`, tick cache, 30/300 hide)  
4. Pano API + SSE + ops detay ✅ (+ FE Canlı Piyasa menü + kayan ticker + `/piyasa` 3 panel)  
5. Global ticker  
6. Pano sayfası + admin marj  
7. E2E / mevcut test yeşil / OpenAPI  
8. Vitrin/TV (`/ekran/{token}`) — **kapsamda**  

Bir dilim yeşil olmadan sonrakine geçilmez. Production migrate ayrı onay.

## 9. Yapılmayacaklar

FE→Binance; her tick DB yazma; sembol/milyem/gram kod gömme; `float`; tek sağlayıcıya sert kilit; production migrate; ayrı “prim/iskonto” alanı.

## 10. Riskler

- Binance IP/limit / futures bölgesel erişim → soyut provider + REST yedek.  
- Marj migration işaret çevirisi eski panoları kaydırabilir → backfill + test zorunlu.  
- SSE proxy (nginx) buffering kapatılmalı.  
- Sarrafiye gramları toptancı teyidi olmadan seed varsayılanı riskli.

## 11. Kilitli kararlar (2026-11-16)

| # | Soru | Karar |
|---|------|--------|
| **Q1** | Ticker varsayılan | Gram Has, 22A bilezik, Çeyrek Yeni, USD, EUR (`ticker_da_goster=true`); kalanlar panoda. |
| **Q2** | Alıcı alış | **Seçimli** — kalem `aliciya_alis_goster` (+ `alis_goster`); ops her zaman görür. |
| **Q3** | Bayatlık | **30 sn** gecikmeli / **300 sn** gizle+ödeme snapshot red; `settings` ile. |
| **Q4** | Vitrin/TV | **Şimdi** — dilim 8 zorunlu. |

## 12. Onay

**Kabul** + Q1–Q4 kilitli. Dilim 2+.
