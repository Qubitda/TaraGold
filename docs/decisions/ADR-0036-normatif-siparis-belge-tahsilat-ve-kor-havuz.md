# ADR-0036 — Normatif Sipariş, Kör Havuz, Belge, Tahsilat ve Teslim Modeli (Taslak)

- **Durum**: Taslak (Normatif geçiş kapsamında — ADR-0011/0012/0013/0034 ek ve düzeltmeleri)
- **Kapsam**: `siparis`, `lojistik`, `kalite`, `belgeler`, `finans`, `fiyatlama`, `api`

## Kararlar

1. **Kör Havuz & Fiyat Sunumu**:
   - Alıcı yüzeylerinde (`PriceQuote` DTO, sepet, sipariş, proforma, irsaliye, API feed) tedarikçi kimliği, maliyet, marj ve iç işçilik kırılımı (`iscilik_vergisiz` dahil) gösterilmez; alıcı yalnız net fiyat görür.
   - Tedarikçi yüzeylerinde (`HazirlamaEmri`, tedarikçi irsaliyesi, RFQ, admin) alıcı kimliği, alıcı net satış fiyatı, marj ve diğer tedarikçilerin satırları gösterilmez.
   - `HazirlamaEmri` sipariş onayı sırasında tedarikçi başına ayrıştırılır; bir sipariş yalnız tüm tedarikçilerin hazırlama emirleri `HAZIR` olduğunda `HAZIR` durumuna geçer.

2. **Teslim Modeli (A1) & Elle Kargo**:
   - Sipariş/sevkiyat `PLATFORM_QC` veya `DOGRUDAN` teslim modelini taşır. `PLATFORM_QC` modelinde kalite ölçüm/PASS kapısı zorunludur; `DOGRUDAN` modelinde platform direkt sevkiyat açabilir.
   - Kargo/carrier API entegrasyonu yoktur; taşıyıcı adı (`kargo_firma`) ve takip no (`takip_no`) platform tarafından elle girilir (`taragold.E003` üretim bloğu kaldırılır).

3. **Belgeler (Proforma & İrsaliye PDF) — Resmi Fatura Yok**:
   - E-fatura / e-irsaliye entegrasyonu yoktur. `BelgeAyarlari` ile yapılandırılabilen `PROFORMA` (revizyon takipli, QC ölçümü sonrası yeni revizyon üretebilen, `"Resmi fatura yerine geçmez."` ibareli, vergisiz/KDV'siz), `IRSALIYE` (alıcı sevk belgesi, varsayılan başlık `"İrsaliye"`, alt metin yapılandırılabilir) ve `TEDARIKCI_IRSALIYE` (alıcı kimliği ve alıcı net fiyatı maskeli tedarikçi sevk fişi) üretilir.

4. **Tahsilat, Cari ve Tedarikçi Ödemesi — Sanal POS Yok**:
   - Sanal POS / `PaymentIntent` HTTP uçları kapatılır (`410 Gone`); mevcut DB tabloları veri kaybı olmaması için korunur.
   - Sipariş onayında alıcı carisine `SATIS` (`BORC`), platform tarafından elle tahsilat kaydında (`elle_tahsilat`) alıcı carisine `TAHSILAT` (`ALACAK`, `karsi_firma=platform`, `AuditOlay` kayıtlı) yazılır.
   - Tedarikçi hak edişleri (`TedarikciHakEdis`) QC PASS aşamasında tedarikçi teklif maliyetine göre hesaplanır ve platform tarafından elle ödeme (`elle_tedarikci_odeme`) ile `ODENDI` durumuna alınır.
