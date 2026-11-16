# ADR-0001 — Toptan altın/kuyum akışı (has-gram, bileşen, cari, bağlantı kuru)

- **Durum:** Kabul v2 + backend uygulandı (2026-11-16; FE ayrı; production migrate kullanıcı onayı)
- **PG kabul:** `siparis.tests.test_adr0001_altin_akisi` — 19 test yeşil (v1 1–13 + v2 14–18)
- **Tarih:** 2026-11-16
- **Kapsam:** Backend (Django 6.1 + DRF + PostgreSQL). Frontend ayrı. Hak ediş **bu ADR dışı**.
- **Üzerine inşa:** v1 HAS/TRY yeşil; v2 bileşen+USD+emir teyidi (yeniden yazım yok).
- **Production migrate:** yalnız dosya + kullanıcı onayı.

## 1. Bağlam

Satış **net altın gram × milyem = has gram**. TL ikincil. Ödeme: **HAS | HURDA | TL | USD**.

Alıcı **montür + taşı ayrı seçer** (ADR-0043); çakım/usta arka plan. Platform stok tutmaz. Usta kimliği alıcıya görünmez; platform istediği ustayla çalışır.

## 2. Kilitli kararlar

| Kod | Karar |
|-----|--------|
| **A1–A8** | Önceki kilit (milyem, işçilik, TL dağıtım, ask kur, cari ödeme, taş USD\|TL, çakım TL\|HAS, MONTUR/TAS/CAKIM). |
| **B1** | Usta: ops çakım emri açılırken seçer; varsayılan usta opsiyonel. Alıcı görmez. |
| **B2** | Taş ayrı Varyant; stok ADET; karat özellik/fiyat. |
| **B3** | Çakım hizmet emri; stok yok. |
| **B4** | `gram`=brüt; `tas_agirligi`; `net_altin_gram=gram−tas_agirligi`; `tas_agirligi < gram`. |
| **B5** | USD ödeme = TL bağlantı politikası (bayat ret, manuel+%2). |
| **B6** | Mevcut kod üzerine genişletme. |
| **B7** | `reddet` neden zorunlu. |

Açık sonraki faz: kredi net eşdeğer; hak ediş; karat toplu stok.

## 3. Durumlar

Sipariş: `ONAY_BEKLIYOR→ONAYLANDI→HAZIRLANIYOR→HAZIR`; red/iptal kuralları v1+HAZIRLANIYOR.

Emir `tip`: `HAM_ALTIN|MONTUR|TAS|CAKIM`.  
`TEDARIK_BEKLIYOR→HAZIRLANIYOR→HAZIR` | `TEDARIK_BEKLIYOR→REDDEDILDI`.  
`otomatik_teyit` → doğrudan HAZIRLANIYOR. Teyit red → onay geri alınmaz; ops alternatif/iptal. Fiyat değişimi → ops onayı. CAKIM yalnız MONTUR+TAS HAZIR sonrası (idempotent).

## 4–10

Model/API/test/dilim: görev metni + v1 § korunur; v2 test 14–18 + teyit senaryoları. Yapılmayacaklar aynı. Ledger `(order,tedarikci,tip)` unique.

## 12. Onay

**Kabul edildi.** Uygulama başlar; production migrate ayrı onay.
