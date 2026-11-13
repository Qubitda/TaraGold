# ADR-0035 — Normatif İş Modeli: Roller, Çoklu Üyelik ve Satış Kanalları (Taslak)

- **Durum**: Taslak (Normatif geçiş kapsamında — ADR-0003 ve ADR-0033 K3 tek-aktif-üyelik kısıtını günceller / *supersedes*)
- **Kapsam**: `firmalar`, `tanimlar`, `api`

## Kararlar

1. **Taraflar (4 Normatif Taraf)**:
   - **Platform (`PLATFORM_SUPER` + Ops ekibi)**: Firmaları tanımlar/onaylar, kanal izin ve erişimlerini onaylar, marj ve fiyat gruplarını yönetir, siparişleri onaylar/reddeder, tedarikçiye maskeli hazırlama emri gönderir, kargo sevk işlemlerini (elle taşıyıcı + takip no) yürütür, alıcı tahsilatını ve tedarikçi hak ediş ödemesini elle kaydeder.
   - **Tedarikçi (`TEDARIKCI` — imalatçı/toptancı)**: Ürün, stok ve teklif girer; kendisine yönlendirilen `HazirlamaEmri` satırlarını hazırlar. Alıcıyı asla görmez.
   - **Kuyumcu (`ALICI_KUYUMCU`)**: Portal üzerinden katalog, net fiyat/quote, sepet ve sipariş süreçlerini yürütür. Tedarikçiyi, marjı, maliyeti veya iç işçilik kırılımını görmez.
   - **API Müşterisi (`API_MUSTERISI`)**: JSON/XML feed üzerinden katalog, net kanal fiyatı ve ATP stok çeker (`X-Api-Key`). Tedarikçi, maliyet veya marj görmez.
   - **Nihai Tüketici Yoktur**: Platformda tüketici hesabı, tüketici ödemesi ve sanal POS bulunmaz.

2. **Satış Kanalları (Ayrı Tanım)**:
   - Satış kanalı firma rolü değildir; kanonik `SatisKanali` tanımları `KUYUMCU_PORTAL`, `B2B_API`, `B2C` olarak güvenceye alınır (mevcut `FiyatGrubu`, `FiyatSozlesmesi`, `PiyasaMarjPolitikasi`, `AliciKanalErisimi`, `TedarikciKanalIzni` yeniden kullanılır). Eski seed kodları (`KUYUMCU_PANEL`, `CANTACI_PANEL`, `B2C_API`) veri kaybı olmaması için korunur.

3. **Çoklu Firma / Çoklu Rol Üyeliği**:
   - `FirmaUyelik` üzerindeki tek aktif üyelik kısıtı (`firmauyelik_tek_aktif_uyelik`) kaldırılır; `birincil` alanı aktif oturum bağlamını gösterir. `Kullanici.firma` + `Kullanici.rol` aktif oturum bağlamı olarak korunur ve kullanıcılar aktif üyelikleri arasında geçiş yapabilir.
