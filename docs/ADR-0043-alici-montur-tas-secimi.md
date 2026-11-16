# ADR-0043 — Alıcı montür + taş seçimi (bileşeni kuyumcu kurar)

- **Durum:** Kabul
- **Tarih:** 2026-11-16
- **Kabul:** 2026-11-16 (kullanıcı onayı)
- **İlgili:** ADR-0001 v2 (bileşen/emir motoru) — **alıcı yüzeyi değişir**
- **Kapsam:** Katalog + sepet/checkout + (varsa) FE sipariş UI. Emir tipleri MONTUR/TAS/CAKIM korunur.

## Bağlam

ADR-0001: alıcı **taşlı bitmiş** tek satır alır; `VaryantBilesen` platformda önceden bağlanır.  
İstenen model: **montürcü montür**, **taşçı taş** yükler; **kuyumcu ikisini ayrı seçip ürünü kendisi kurar**.

## Karar

1. **Katalog ayrımı (zorunlu)**  
   - Montür tedarikçisi yalnız `Varyant.tip=MONTUR` (+ teklif/stok).  
   - Taş tedarikçisi yalnız `Varyant.tip=TAS` (+ teklif/stok).  
   - Alıcıya hazır `TASLI` “platform birleştirmiş” ürün **satış birimi değil** (veya yalnız vitrin; sipariş hattı seçimden üretilir).

2. **Alıcı sipariş UX**  
   - Kuyumcu: **1 montür + ≥1 taş** seçer (miktar/ölçü).  
   - Sepet satırı bu seçimden oluşur (snapshot: montür + taş kimlikleri, gram/karat, fiyat).  
   - Alıcıya usta/tedarikçi unvanı sızmaz (kör havuz).

3. **Bileşen kaydı**  
   - Birleştirme **sipariş anında** (veya alıcı “ürünüm” taslağında) oluşur.  
   - `VaryantBilesen` platform şablonunda zorunlu değil; satır/emir tarafında montür+taş referansı yeter.  
   - Onayda mevcut motor: `HazirlamaEmri` **MONTUR** + **TAS**; ikisi HAZIR → ops **CAKIM** (B1 usta, alıcı görmez).

4. **Fiyat**  
   - Alıcı fiyatı = montür quote + taş quote(lar) + (çakım/işçilik politikası, varsa).  
   - Net altın: montür `gram` − `tas_agirligi` kuralları ADR-0001 B4 ile uyumlu kalır.

5. **Stok**  
   - Platform stok tutmaz. Rezervasyon montür ve taş depolarında ayrı.

## Yapılmayacaklar

- Alıcının tek tıkla “platform TASLI SKU” siparişini varsayılan yol yapmak.  
- Tedarikçi/usta kimliğini alıcıya göstermek.  
- CAKIM’i alıcıya seçtirmek.

## ADR-0001 düzeltmesi

| ADR-0001 | Bu ADR |
|----------|--------|
| “Alıcı bitmiş ürünü tek satır alır; montür/taş arka plan” | Alıcı **montür ve taşı seçer**; arka plan yalnız **çakım/usta + emir** |
| `VaryantBilesen` katalogda önceden | Seçim → sipariş satırı / transient bileşen |

Emir durumu, teyit, USD/HAS ödeme kilidi **aynı**.

## Uygulama notu (2026-11-16 dilim)

- BE: `CartLine`/`OrderLine.bilesim` + `POST /carts/me/lines/` `{montur_quote_id, taslar[]}`; checkout→order kopyası; onayda `composition_emir_specs` → MONTUR/TAS emir.  
- Katalog: `monturler` = `Varyant.tip=MONTUR`; `taslar` varsayılan satınalınabilir TAS (`?mode=referans` eski sözlük).  
- FE: katalogda “Ürün kur — montür + taş” paneli → sepet.  
- Migration: `siparis.0015_adr0043_bilesim` (production migrate ayrı onay).  
- Test: `siparis.tests.test_adr0043_bilesim`.

## Onay

**Kabul edildi** (2026-11-16). Uygulama başlar; production migrate ayrı onay.
