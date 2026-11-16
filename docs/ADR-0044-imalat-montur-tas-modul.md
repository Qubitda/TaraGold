# ADR-0044 — İmalat modülü: montür/taş alanları + uyumluluk + İmal et

- **Durum:** Kabul
- **Tarih:** 2026-11-16
- **Kabul:** 2026-11-16 (sıkı uyumluluk: kısıt boşsa imalata alınmaz)
- **İlgili:** ADR-0043 (alıcı seçimi), ADR-0001 (emir MONTUR/TAS/CAKIM)
- **Kapsam:** Ops ürün formu (tip’e göre alan), ayrı **İmalat** UI, montür↔taş uyumluluk, CTA “İmal et”

## Karar özeti

1. **Ürün Yönetimi** **3 adımlı sihirbaz:** (1) tür / montür rolü (FULL|HEAD|BAND|HEAD+BAND) → (2) kimlik (ad, kategori, sahiplik, ölçü tipi, renk ekseni) → (3) teknik zorunlular (metal/ayar/**metal rengi** Tanımlar’dan; montür yuva/kesim/karat; taş tip/kesim/karat). Tek **POST** `varyantlar` veya `montur_modu=HEAD+BAND` + `parcalar`. Kapak/önizleme yok; hazırlık workspace + sunucu yanıtı.  
2. **Workspace 5 sekme:** Genel (kimlik+özellik+SEO; `peer_id` montür eşi) · Varyantlar (matris, stok/fiyat, VF öncelikli fiyat) · Medya · Bağlı taşlar · Yayın (hazırlık+kanal+geçmiş). Kaydet yalnız Genel.  
3. **Metal rengi** = `refs.renkler` (grup filtresi yok). **Ayar** metal varyantlarda zorunlu; **TAS** muaf (`Varyant.ayar` null). Stil/kesim listeleri yalnız **Tanımlar** (`getCatalogRefs`).  
4. **HEAD+BAND:** `montur_grup_id` + liste/detay `peer_id`.  
5. **Sahiplik:** `Urun.olusturan_firma` = tedarikçi firması (yeni kolon yok). Platform create: body `sahiplik_firma_id` zorunlu (`tedarikci_mi`). Tedarikçi: `olusturan_firma=actor.firma` (client id yok sayılır). Ops list/detail: `sahiplik_firma_id` / `sahiplik_firma_ad`. **Alıcı API/UI’de firma/tedarikçi yok** (kör havuz).  
6. **İmalat** ayrı modül/sekme: montür + uyumlu taş → nihai imal satırı → **İmal et** (sepete bileşim; “Sipariş Ver” değil).  
4. **Uyumluluk zorunlu:** her taş her montüre girmez; montür üzerinde kısıt, imalatta filtre.  
5. Ham/bitmiş **HAM_ALTIN** satış ürünü ayrı yol; imalat birleştirmesinden sonra oluşur (veya doğrudan bileşim siparişi).  
6. **Montür parça rolü (A):** `parca_rolu ∈ {FULL, HEAD, BAND}` — gerçek alan (etiket değil). Head+Band ayrı kayıt; isterse tek **FULL**. İleri: yalnız HEAD / yalnız BAND. Siparişte “montür ayağı” = FULL veya (HEAD[+BAND]) içerde 1–2 quote.

## A) Ürün Yönetimi — tip’e göre gösterilecekler

### Montür (`tip=MONTUR`)
| Alan | Zorunlu | Not |
|------|---------|-----|
| `parca_rolu` | Evet | FULL \| HEAD \| BAND |
| `bas_stil` / `govde_stil` | Role göre | Görsel stil kodu (Blue Nile head/band) |
| Ad, kategori, ayar/milyem | Evet | Genel |
| Brüt gram | Evet (FULL/HEAD/BAND) | Net = brüt − taş (imalatta; yuva olanlarda) |
| Renk (sarı/beyaz/rose) | Önerilir | Metal swatch |
| Ölçü (yüzük no vb.) | Kategoriye göre | Özellikle BAND/FULL |
| Yuva adedi | FULL/HEAD | BAND’da yok |
| İzinli kesimler | FULL/HEAD | BAND’da yok |
| Min/max karat (toplam) | FULL/HEAD | **İzin aralığı** (taşta gerçek ct) |
| Fiyat (işçilik/montür) | Evet | Teklif |

**Gizle:** taş karat/4C, sertifika (taşta).  
**İmalata açık:** yalnız FULL/HEAD + dolu yuva kısıtları. BAND taş yuvası taşımaz (tek başına satış/stok OK).

### Taş (`tip=TAS`)
Her türlü taş: değerli / yarı değerli / sentetik / cam / inci / ham — **mücevher taşı olmak zorunda değil**.

| Alan | Zorunlu | Not |
|------|---------|-----|
| Ad | Evet | |
| Ölçü (ct / karat alanı) | Evet | Ticari ölçü; pırlanta şart değil |
| Şekil / kesim kodu | Evet | Serbest kod (ROUND, CABOCHON, BEAD, HAM…) — uyumluluk anahtarı |
| Berraklık / renk / sertifika | Opsiyonel | Yalnızca ilgiliyse (4C şart değil) |
| Adet (stok) | Evet | |
| Fiyat (USD\|TL) | Evet | |

**Gizle:** brüt gram/ayar (montürde); ölçü beden (genelde).

### Ürün — ham / bitmiş (`HAM_ALTIN` / hazır stok)
| Alan | Not |
|------|-----|
| Mevcut Genel + Varyant + Stok & Fiyat | Klasik vitrin |
| İmalat birleştirmesi **yok** | Doğrudan satış |

`TASLI` şablon: opsiyonel; ADR-0043’te birincil yol imalat seçimi.

## B) İmalat modülü (ayrı)

- Yer: `/urunler` sekmeleri — **Montürler** | **Taşlar** (ayrı vitrin) + **İmalat** (eşleştirme).  
- İmalat UI: **görsel önizleme** (şekil ikon ızgarası + karat chip + montür silüeti üzerinde ölçekli taş) → montür stil ızgarası → uyumlu stok taş listesi → tek CTA. Montür seçilmeden taş paneli boş; uyumsuz taşlar listelenmez.  
- Önizleme karat/şekil **görseldir**; fiyat ve sepet satırı yalnız seçilen stok taş quote’undan.  
- Akış: Montür seç → şekil/karat önizle → uyumlu taş kilitle → özet + adet → **İmal et**.  
- **İmal et** = ADR-0043 bileşim sepet satırı (+ MONTUR/TAS/CAKIM emirleri).  
- CTA: **İmal et** (Sepete ekle / Sipariş Ver değil).  
- FE: `frontend/src/features/urunler/components/montur-tas-compose-panel.tsx` + `stone-shape-icons.tsx`.  
- **HEAD+BAND (A):** İmalatta FULL/HEAD listelenir; HEAD seçilince opsiyonel BAND. Sepet: `band_quote_id` → bileşim snapshot’ta `band` + stok/emir ikinci MONTUR ayağı.

## C) Uyumluluk kuralları

Montür varyantında (JSON veya alanlar):
- `yuva_adedi` (int ≥ 1)
- `izinli_kesimler`: string[] (TasKesimi.kod)
- `karat_min`, `karat_max` (Decimal; yuva başı veya toplam — v1: **toplam**)

Taş uyumlu ⇔  
`kesim ∈ izinli_kesimler` ∧ `karat_min ≤ karat ≤ karat_max` ∧ seçilen taş adedi ≤ `yuva_adedi`.

**Kabul (sıkı):** kısıt yoksa imalata **girmez** (montürcü uyumluluk doldurmalı). Gevşek uyarı modu yok.

## D) Yapılmayacaklar

- İmalatta “her taş her montür”  
- Montür formunda 4C taş alanları  
- Alıcıya tedarikçi/usta / sahiplik firması göstermek (kör havuz)  
- Sahiplik için yeni DB kolonu (mevcut `olusturan_firma`)  

## Onay

**Kabul edildi** (2026-11-16). Sıkı uyumluluk + İmalat + sahiplik/sihirbaz uygulanır; production migrate ayrı onay (sahiplik için migration gerekmez).
