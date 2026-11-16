# ADR-0044 — İmalat modülü: montür/taş alanları + uyumluluk + İmal et

- **Durum:** Kabul
- **Tarih:** 2026-11-16
- **Kabul:** 2026-11-16 (sıkı uyumluluk: kısıt boşsa imalata alınmaz)
- **İlgili:** ADR-0043 (alıcı seçimi), ADR-0001 (emir MONTUR/TAS/CAKIM)
- **Kapsam:** Ops ürün formu (tip’e göre alan), ayrı **İmalat** UI, montür↔taş uyumluluk, CTA “İmal et”

## Karar özeti

1. **Ürün Yönetimi** tip’e göre form gösterir (montür / taş / ham ürün ayrı).  
2. **İmalat** ayrı modül/sekme: montür + uyumlu taş → nihai imal satırı → **İmal et** (sepete bileşim; “Sipariş Ver” değil).  
3. **Uyumluluk zorunlu:** her taş her montüre girmez; montür üzerinde kısıt, imalatta filtre.  
4. Ham/bitmiş **HAM_ALTIN** satış ürünü ayrı yol; imalat birleştirmesinden sonra oluşur (veya doğrudan bileşim siparişi).

## A) Ürün Yönetimi — tip’e göre gösterilecekler

### Montür (`tip=MONTUR`)
| Alan | Zorunlu | Not |
|------|---------|-----|
| Ad, kategori, ayar/milyem | Evet | Genel |
| Brüt gram | Evet | Net = brüt − taş (imalatta) |
| Renk (sarı/beyaz/rose) | Önerilir | Renk ekseni |
| Ölçü (yüzük no vb.) | Kategoriye göre | |
| Yuva adedi | Evet | Kaç taş |
| İzinli kesimler | Evet | örn. ROUND, PRINCESS |
| Min/max karat (toplam veya yuva başı) | Evet | Uyumluluk |
| Yuva şekli / oturuş | Önerilir | |
| Fiyat (işçilik/montür) | Evet | Teklif |

**Gizle:** taş karat/4C, sertifika (taşta).

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
- İmalat UI: **sol montür / sağ uyumlu taş** (tek ekran, tek CTA). Montür seçilmeden taş paneli boş; uyumsuz taşlar listelenmez.  
- Akış: Montür seç → uyumlu taşlar → özet + adet → **İmal et**.  
- **İmal et** = ADR-0043 bileşim sepet satırı (+ MONTUR/TAS/CAKIM emirleri).  
- CTA: **İmal et** (Sepete ekle / Sipariş Ver değil).

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
- Alıcıya tedarikçi/usta göstermek  

## Onay

**Kabul edildi** (2026-11-16). Sıkı uyumluluk + İmalat modülü uygulanır; production migrate ayrı onay.
