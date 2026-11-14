# TaraGold / Kuyumbank Admin Paneli — FAZ 0 UX, İlişki ve API Denetim Raporu

> **Kapsam:** Bu belge yalnızca **Faz 0 — Denetim** çıktısıdır; uygulama kodunda hiçbir değişiklik yapılmamıştır.  
> **Kanıt Politikası:** Her bulgu doğrudan okunan kaynak dosya ve satır numarası (`dosya:satır`) ile desteklenmiştir. Çalışma alanında bulunmayan dosya veya yapı **bulunamadı** olarak işaretlenmiştir.  
> **`analiz.docx` Durumu:** Workspace genelinde `analiz.docx` arandı (`find . -maxdepth 4 -iname "*analiz*" -o -name "*.docx"`); **bulunamadı**. Denetim, kullanıcı istemindeki analiz maddeleri ve mevcut frontend/backend kod tabanının birebir incelemesi esas alınarak hazırlanmıştır.

---

## 1. Admin & Portal Ekranları Denetim Tablosu

| Ekran / Modül | Sayfa / Modal mı | Liste / Ara / Filtrele / Sayfalama | Yeni / Düzenle / Sil / Aktif-Pasif | Ham ID Soruyor mu | Backend Endpoint'i Var mı | Frontend'e Yansıyor mu |
|---|---|---|---|---|---|---|
| **Ana Sayfa** (`/` · `home-dashboard-view.tsx`) | Sayfa | Sınırlı arama/filtre; sayfalama **yok** | İşlem **yok** | Cari bakiyeler `#${c.id}` (`home-dashboard-view.tsx:876`), teknik not (`/reports/orders/`, `740-743`) | Kısmi (`/me/dashboard/`, `/reports/orders/`) | Kısmi (zaman serisi ve firma adı cari kartında eksik) |
| **Firmalar — Ops** (`/firmalar` üst · `ops-firmalar-view.tsx`) | Sayfa + 4 adımlı **gömülü** form (`469-578`) + Detay Modalı (`1069-1535`) | Ara (`q`) var; durum filtresi & sunucu sayfalama UI'ı **yok** (`447,462`) | Yeni (gömülü wizard), Düzenle (modal `genel`), Onayla, Askıya Al. **Sil yok**; alt kaynaklarda (kontak/adres/banka/belge) **Düzenle/Sil yok** | Evet: Kanal İzinleri tablosunda `Firma #id`, `Kanal #id` (`889-893`); Feed testinde `Ürün ID` (`774-782`) | Ana firma CRUD var (`api/urls.py:644-667`); alt kaynaklar için yalnız GET/POST var (`669-687`), **PATCH/DELETE yok** | **Kısmen bozuk:** `TedarikciKanalIzni` modeli `ISTENDI` (`tedarikci_kanal_izni.py:11`), UI ise `BEKLEMEDE` bekliyor (`ops-firmalar-view.tsx:868,909`) → Onayla/Reddet butonları **hiç görünmez** |
| **Firmalar — Org / Kullanıcılar** (`/firmalar` alt · `firmalar-org-view.tsx`) | Sayfa + ayrı Yeni Birim / Davet / Detay modalları | Birimlerde istemci tarafı ara/filtre/sayfalama (`219-234`); Onay/Davet/Kullanıcılarda **yok** | Birim: Yeni var; **Düzenle/Sil/Pasifleştir yok**. Kullanıcı: Rol & Aktif/Pasif var (`822-867`), Yeni/Sil yok. Üye ekleme modal içi **gömülü form** (`1090-1122`) | Evet: `Firma ID (Opsiyonel)` filtresi (`773-782`), `Kullanıcı id` (`1095-1102`), tablolarda `#id` | `/org-units/`, `/firma/kullanicilar/` (`api/urls.py:739-747,794-804`) | Kısmi (kullanıcı davet akışı ayrı, firma oluşturma akışı ayrı; tenant-ops bağı kopuk) |
| **Tanımlar** (`/tanimlar` · `definitions-view.tsx`) | Sayfa + Ortak Oluştur/Düzenle Modalı (`821-1250`) + Satır içi silme onayı | İstemci ara & sayfalama (`317-333`, `PAGE_SIZE=10`); kurlarda backend `[:200]` limit (`ops_definitions.py:207,212`), **sunucu sayfalama yok** | Fiyat Grubu / Ayar / Metal Kuru / Döviz Kuru: Yeni/Düzenle/Sil var. Satış Kanalları: **salt okunur** (Yeni/Düzenle/Sil **yok**) | ID gösterimi (`#id`, endpoint URL'leri modal açıklamasında `838-840`), form inputlarında `<select>` var | `/ops/definitions/{kaynak}/` (`api/urls.py:729-737`); **`satis-kanallari` CRUD yok** (`sales-channels/` salt okunur) | Kısmi (`SatisKanali` düzenlenemediği için sadece DB/admin'den değişiyor; `FiyatGrubu` dışı kaynaklarda `aktif` filtresi yok) |
| **Piyasa Marj Politikası** (`ops-marj-politikasi-card.tsx`) | Sayfa içi gömülü kart (`/tanimlar:778`, `/fiyatlama:171`) | Liste yok (tekil politika) | Güncelle + Aktif/Pasif toggle var | Hayır | Var (`GET/PATCH /ops/piyasa/marj-politikasi/`, `api/urls.py:274-276`) | Evet (yalnızca global tekil politika; kanal/kategori kırılımı UI'da yok) |
| **Ürünler & Katalog** (`/urunler` · `catalog-view.tsx`) | Sayfa + Ayrı Yeni Modal (`1409`), Varyant Modal (`1493`), Detay Modal (`1067`) | Ara + Onay/Yayın filtresi + Sunucu sayfalama (`649-691,1040-1064`) | Yeni taslak, Varyant ekle, Onaya gönder, Onayla/Reddet, Yayınla/Pasife al. **Ürün/Varyant Düzenle & Sil yok** | **Kritik Evet:** `kategori_id` (`1425-1432`), `ayar_id` (`1433-1440`), `renk_id` (`1512-1518`) ham sayı inputu | `/ops/products/`, `/catalog/` (`api/urls.py:251-266,749-787`). **PATCH/DELETE yok**, `Renk`/`OlcuDegeri`/`UrunKanal` API'si yok | **Bozuk:** `kategori_id: 0` ile `"Aktif kategori bulunamadı."` hatası (`katalog_yazma_servisi.py:63-65`), kategori sırası/öne çıkan yansımıyor |
| **Kategoriler** | **Ekran bulunamadı** | **Bulunamadı** | **Bulunamadı** | — | **Bulunamadı** (`api/urls.py`'de sıfır kategori ucu) | **Hayır** (yalnız Django Admin `kategori_admin.py`) |
| **Birimler** (`ADET/GRAM/KARAT`) | **Ekran bulunamadı** | **Bulunamadı** | **Bulunamadı** | — | **Bulunamadı** (`Birim` DB modeli yok; sabit `StokBirimi`, `birim_constants.py:4-13`) | Sabit string olarak tablolarda görünür |
| **Depolar (`Warehouse`)** | **Ekran bulunamadı** | **Bulunamadı** (yalnız `/stok` içinde select) | Yeni / Düzenle / Sil / Aktif-Pasif **yok** | `/stok`'ta depo yoksa ham `Depo ID` (`stock-management-view.tsx:247-255`) | Yalnız `GET /supplier/warehouses/` (`api/urls.py:391-394`); **POST/PATCH/DELETE yok** | Yeni depo açılamadığı için yeni tedarikçi stok giremez |
| **Fiyatlama (Quote / Lock)** (`/fiyatlama` · `pricing-quotes-view.tsx`) | Sayfa | Liste endpoint'i yok (localStorage/sepet tabanlı); ara/filtre/sayfalama **yok** | Kilitle / Yenile var; liste CRUD yok | **Evet:** `Quote ID ile getir` (`189-203`), `PriceLock ID ile getir` (`211-225`) | `GET/POST /quotes/`, `/price-locks/` (`api/urls.py:278-285`); **liste GET endpoint'i yok** | Kısmi (sayfa yenilenince geçmiş quote'lar yalnızca ID bilinirse veya sepetteyse bulunur) |
| **Stok** (`/stok` · `stock-management-view.tsx`) | Sayfa + Stok Düzeltme Modalı (`217-315`) | Ara / Filtre / Sayfalama **yok** | Yalnız `+ Stok Düzeltmesi` | **Evet:** `Teklif ID` (`268-279`), depo yoksa `Depo ID` (`247-254`), tabloda `#teklif_id`, `#varyant_id` (`194-199`) | `GET /supplier/stock/`, `POST /supplier/stock/adjustments/` (`api/urls.py:396-404`) | Kısmi (ürün adı / SKU / tedarikçi adı dönmediği için operatör kör kalıyor) |
| **Sipariş & Onay Havuzu** (`/siparis` · `order-workflow-view.tsx` + `ops-onay-havuzu.tsx`) | Sayfa + Inline Ops detay paneli (`ops-onay-havuzu.tsx:195-313`) + Checkout/Bulk modalları | Onay havuzunda durum filtresi var; ara & sayfalama UI'ı **yok**. Alıcı siparişlerinde sayfalama **yok** | Onayla/Reddet/Proforma/İrsaliye/Tahsilat/İptal/Tekrar Sipariş var. Düzenle/Sil yok | **Evet:** `Sepet ID ile Görüntüle` (`order-workflow-view.tsx:634`), sepette `#varyant_id` (`520-539`), bulk siparişte hardcoded `satis_kanali_id: 1` (`201`) | `/orders/`, `/ops/orders/onay-havuzu/` (`api/urls.py:298-316,599-627`) | **Kısmen bozuk:** Checkout'ta adres seçimi `void selectedDeliveryAddr` ile çöpe atılıyor (`301-302`) |
| **Finans & Cari** (`/finans` · `finance-dashboard-view.tsx`) | Sayfa + Cari Detay Modalı + **gömülü** tahsilat/ödeme formları | Ara / Filtre / Sayfalama **yok** (cari, ledger, hak ediş, ödemeler düz liste) | Elle Tahsilat / Tedarikçi Ödeme var; **Cari Limit / Hesap Düzenleme yok** | **Evet:** `Cari Hesap ID` lookup (`87,198-209`), `Sipariş ID` (`69,88`), `Tedarikçi Firma ID`, `Hak Ediş ID` (`77-79`) | `/finance/*`, `/ops/finance/*` (`api/urls.py:425-475`); **Cari kredi limiti PATCH ucu yok** | Kısmi (ID bilmeden manuel tahsilat/ödeme girişi zor) |
| **Kalite Kontrol (QC)** (`/kalite` · `quality-inspections-view.tsx`) | Sayfa + Oluştur / Detay / Ölçüm Modalları | Ara / Filtre / Sayfalama **yok** | Başlat / Geç / Kal / İptal / Ölçüm Ekle var; Düzenle/Sil yok | **Evet:** `Sipariş ID`, `Sipariş Satırı ID` (`367-392`), `order_line_id` (`572-584`) | `/ops/inspections/*` (`api/urls.py:493-526`) | Evet (ancak sipariş/satır isimle seçilemiyor) |
| **Lojistik & İadeler** (`/lojistik` · `logistics-management-view.tsx`) | Sayfa + Modallar | Ara / Filtre / Sayfalama **yok** (`482-855`) | Sevkiyat & İade durum geçişleri var; Düzenle/Sil yok | **Evet:** `Sipariş ID` (`870-886`), İadede `Sipariş ID`, `Sevkiyat ID`, `Sipariş Satır ID` (`1228-1318`) | `/ops/shipments/*`, `/shipments/*`, `/returns/*` (`api/urls.py:317-354,528-561`) | Evet (ancak UI teknik ID ve `"ADR-0034"` jargonu içeriyor, `418`) |
| **Belgeler** (`/belgeler` · `documents-view.tsx`) | Sayfa + Detay / POD / Belge Ayarları Modalları | İstemci tarafı ara/filtre/sayfalama (`154-173`) + 10+ uçtan birleştirme (`useDocuments`) | POD ekle & Ops Belge Ayarları var; Düzenle/Sil yok | Kısmi (`Order ID` filtresi `106`, POD sevkiyatı `<select>` kullanıyor `220`) | `/documents/`, `/belgeler/`, `/ops/belge-ayarlari/` (`api/urls.py:232-248`) | Evet (ancak merkezi sunucu paginasyonu yerine çoklu fetch aggregation var) |
| **Tedarikçi RFQ & Teklifler** (`/teklifler` · `supplier-rfq-offers-view.tsx`) | Sayfa + Offer / BuyerRFQ / Eşleştirme Modalları | Sekme filtresi var; ara / durum filtresi / sunucu sayfalama **yok** | Teklif: Yeni / Gönder / Pasife Al / Versiyonla (Düzenle/Sil yok). RFQ: Yeni / Gönder / Mesaj / Revizyon (Düzenle/Sil yok) | **Evet:** `Hedef Varyant ID` (`default: 1`, `1014-1035`), `RFQ ID`, `RFQ Satır ID` (`1036-1069`), `Montür varyant id` (`1270-1278`), Ops eşleştirme `Varyant ID` (`1585-1640`) | `/supplier/offers/*`, `/supplier/rfqs/*`, `/rfqs/*`, `/ops/rfq-*` (`api/urls.py:356-389,406-424,563-581,830-846`) | **Zayıf:** Teklif tablosu ürün adı yerine `Varyant #${offer.varyant_id}` basıyor (`837`, `present_offer` ürün adı dönmüyor) |
| **Raporlar & Analitik** (`/raporlar` · `reports-dashboard-view.tsx`) | Sayfa | Tarih/Eşik filtresi var; tablolarda ara/sayfalama yok | Salt okunur rapor | Anomali tablosunda `Firma #${item.alici_firma_id}` (`365`) | `/reports/orders/`, `/reports/buyer-behavior/`, `/ops/anomalies/ciro/` (`api/urls.py:436-444,477-480`) | Evet (ancak firma adı yerine ID gösteriyor) |
| **Profil & Adres** (`/profil` · `profile-view.tsx`) | Sayfa + Adres Ekle/Düzenle Modalı (`916-983`) | Adres listesinde ara/sayfalama yok | Ad/Soyad & Şifre & Adres Yeni/Düzenle/Sil var | Adres modal başlığında `#id` ve `PATCH /me/addresses/...` (`926-931`) | `/me/profile/`, `/me/addresses/*` (`api/urls.py:219,223-231`) | **Karışık:** Firma adresleri kişisel `/profil` altında yönetiliyor; `profile-addresses-view` yetim export (`firmalar/components/index.ts:2`) |
| **Act-As (Kullanıcı Değiştir)** (`header.tsx:270-322`, `firmalar-org-view.tsx:868-878`) | Dialog Modal / Tablo butonu | Hedef kullanıcı arama/seçme **yok** (Header modalında) | Başlat / Durdur | **Evet:** Header modalı çıplak `"Hedef Kullanıcı ID"` sayı inputu soruyor (`header.tsx:288-298`) | `/act-as/start/`, `/act-as/stop/` (`api/urls.py:249-250`) | Kısmi (kullanıcı isimle aranamıyor) |

---

## 2. İlişki Haritası (ERD & Kopuk Bağlar)

```
 [Kullanici] ──(1:1 FK, PROTECT: firma, rol)──────────────────────┐
      │                                                            │
      └──(M:N via FirmaUyelik: birincil=True)──▶ [Firma] ◀─────────┘
                                                   │
          ┌────────────────┬───────────────────────┼──────────────────────┐
          ▼                ▼                       ▼                      ▼
   [FirmaAdresi]   [AliciKanalErisimi]    [TedarikciKanalIzni]     [OrgBirimi]
   (yalnız Firma)   (firma+kanal→FiyatGrubu) (tedarikci+kanal)    (firma-içi şube)
                           │                       │
                           └───────────┬───────────┘
                                       ▼
                                [SatisKanali]  (⚠ tip alanı YOK; CRUD API YOK)
                                       │
                                 (via UrunKanal — ⚠ ekle/çıkar API YOK)
                                       │
 [FiyatGrubu] ◀──(FK, kök zorunlu)── [Kategori] ◀──(FK, aktif=True)── [Urun] ──▶ [AyarMilyem]
  (CRUD API var)   (⚠ HİÇBİR API YOK!)    ▲                            │           (CRUD var)
                                     (sira, one_cikan)                   ▼
                                                                    [Varyant] ──▶ [OlcuDegeri / Renk]
                                                                    (⚠ PATCH yok;   (⚠ API listesi/CRUD YOK!)
                                                                     beden_id POST'ta yok)
                                                                        │
 ┌──────────────────────────────────────────────────────────────────────┘
 ▼
[TedarikciTeklif] ──(opsiyonel FK)──▶ [RFQ / RFQLine]
       │                                (⚠ satır eşleştirme yalnız ham ID)
       ▼
[StockBalance / StockMovement] ──▶ [Warehouse]   (⚠ yalnız GET /supplier/warehouses/; CRUD YOK)
       │
       └── birim: CharField("ADET"|"GRAM"|"KARAT")  (⚠ ayrı Birim modeli YOK)
```

### Kopuk Bağlar ve Eksik FK / Serializer / Filtre Listesi

| İlişki Çifti | Mevcut Durum | Kopukluk / Eksik | Kanıt (`dosya:satır`) |
|---|---|---|---|
| **Firma ↔ Kullanıcı / FirmaUyelik** | `Kullanici.firma` hâlâ tekil `PROTECT` FK; çoklu üyelik `FirmaUyelik` üzerinden | Firma oluşturma (`/ops/firmalar/`) kullanıcı davetini ayrı adım yapar; yeni kullanıcı davet edilmeden şifreyle doğrudan oluşturulamaz; `OrgBirimi` üye ekleme yalnız `kullanici_id` sayısı ister (`Kullanici` liste endpoint'i isimle aramaya elverişli combobox'a bağlı değil). | `kullanici.py:45-51`, `firma_uyelik.py:11-46`, `ops_firmalar.py:87-135`, `firmalar-org-view.tsx:1095-1102` |
| **Firma ↔ FirmaAdresi ↔ Profil** | `FirmaAdresi` sadece `Firma`'ya bağlıdır (`firma` FK) | Aynı tablo iki farklı rotadan (`/me/addresses/` → Profil sayfası; `/ops/firmalar/<pk>/adresler/` → Firmalar sayfası) yönetilir. Ops tarafında adres/kontak/banka/belge **PATCH/DELETE** uçları yoktur. Checkout modalı adresleri seçer ama backend'e göndermez (`void selectedDeliveryAddr`). | `api/urls.py:223-231,669-687`, `ops_firmalar.py:254-303`, `order-workflow-view.tsx:301-302` |
| **Satış Kanalı ↔ Firma ↔ Fiyat Grubu** | `AliciKanalErisimi` `(firma, satis_kanali) → fiyat_grubu` bağlar; `TedarikciKanalIzni` `(tedarikci, satis_kanali)` tutar | 1) `SatisKanali` modelinde kanal tipi (`KUYUMCU_PORTAL \| B2B_API \| B2C`) alanı **yoktur**, sadece `TanimTaban` + `quote_ttl_saniye`.<br>2) `SatisKanali` için **CRUD API yoktur** (`SalesChannelListView` salt okunur `aktif=True`).<br>3) `AliciKanalErisimi` güncelleme (`PATCH` ile fiyat grubu değiştirme) ve `DELETE` ucu yoktur (yalnız POST + `/toggle/`).<br>4) `TedarikciKanalIzni` UI durum uyuşmazlığı (`ISTENDI` vs `BEKLEMEDE`) nedeniyle onay butonları çalışmaz. | `satis_kanali.py:6-24`, `sales_channels.py:14-32`, `alici_kanal_erisimi.py:12-39`, `api/urls.py:699-722`, `tedarikci_kanal_izni.py:10-13`, `ops-firmalar-view.tsx:868,909` |
| **Ürün ↔ Kategori ↔ Fiyat Grubu** | `Urun.kategori` → `Kategori` (`aktif=True`), `Kategori.fiyat_grubu` (kök zorunlu) | Backend'de `/categories/` veya `/ops/categories/` **hiçbir endpoint yoktur**. Ürün ekranı `kategori_id` için çıplak sayı ister; kategori ağacı (`ust`), `sira`, `one_cikan`, `fiyat_grubu` frontend'den okunamaz/yönetilemez. | `kategori.py:23-54,210-211`, `urun.py:64-67,254-256`, `api/urls.py:173-847`, `catalog-view.tsx:1425-1432` |
| **Ürün ↔ SatisKanali (`UrunKanal`)** | `UrunKanal` M2M-through tablosu mevcut | Taslak ürün oluşturulurken tek bir opsiyonel `satis_kanali_id` verilebilir (`katalog_yazma_servisi.py:88-89`), ancak sonrasında **ürünün kanallarını listeleme/ekleme/kaldırma/güncelleme endpoint'i yoktur**. `Urun` ve `Varyant` için **PATCH/DELETE** ucu yoktur. | `katalog_yazma_servisi.py:88-89`, `api/urls.py:749-787`, `ops_products.py:63-176` |
| **Ürün ↔ Varyant ↔ Ölçü / Renk** | `Varyant.clean()` ürün `olcu_tipi` doluysa `beden_id`, `renk_ekseni=True` ise `renk_id`, `sabit` fiyatta `sabit_fiyat` zorunlu kılar | `OpsProductVariantCreateView.post` & `varyant_ekle()` **yalnızca `gram`, `renk_id`, `ek_bedel` kabul eder**; `beden_id`, `tedarikci_sku`, `sabit_fiyat`, `benzersiz_parca` parametrelerini hiç almaz! Ayrıca `Renk` ve `OlcuDegeri` lookup/CRUD endpoint'i yoktur. | `varyant.py:118-153`, `ops_products.py:147-176`, `katalog_yazma_servisi.py:111-169`, `api/urls.py` (Renk/OlcuDegeri yok) |
| **Stok ↔ Birim ↔ Depo ↔ Teklif** | `Warehouse` modeli mevcut; `birim` ise ayrı model değil, `CharField` (`ADET/GRAM/KARAT`) | 1) `Warehouse` için yalnız `GET /supplier/warehouses/` vardır; **depo oluşturma/düzenleme/aktif-pasif endpoint'i yoktur**.<br>2) `Birim` yönetimi/modeli yoktur (teklif `fiyat_modeli`'nden türetilir: `stok/services/birim.py:15-17`).<br>3) `present_balance` yalnızca `warehouse_id`, `teklif_id`, `varyant_id` döner; ürün adı, SKU veya teklif özeti dönmez. | `stok/birim_constants.py:4-13`, `api/views/supplier.py:344-429`, `api/presenters/supplier.py` (ham ID dönüşü), `stock-management-view.tsx:172-279` |
| **Teklif ↔ Ürün/Varyant ↔ RFQ** | `TedarikciTeklif` `varyant` ve opsiyonel `rfq`/`rfq_line` FK'larına sahiptir | `present_offer` ürün adı/SKU döndürmediği için teklif listesinde `Varyant #id` görünür; teklif ve RFQ oluşturma formları varyant ve RFQ için ham sayı ID ister. | `tedarikci_teklif.py:40-44,124-139`, `supplier-rfq-offers-view.tsx:837,1014-1069` |

---

## 3. Kullanıcı Analizindeki Sorunların Kök Neden Eşlemesi (UI / API / Model)

| Problem / Kullanıcı Şikâyeti | Kök Neden Kategorisi | Teknik Açıklama ve Kanıt (`dosya:satır`) |
|---|---|---|
| **1. Modüller arası UI tutarsızlığı** (kendi içinde farklı listeleme, gömülü formlar, inline paneller) | **UI Sorunu** | Ortak `<ListPage>`, `<EntityModal>`, `<RelationSelect>` bileşenleri yok. Örn: `ops-firmalar-view.tsx:469-578` sayfa içi 4 adımlı wizard; `ops-onay-havuzu.tsx:195-313` tablo altı inline detay paneli; `finance-dashboard-view.tsx:68-85` sayfa içi ham tahsilat/ödeme formları; `definitions-view.tsx` tek ortak dialog kullanıyor ama `catalog-view.tsx` 3 ayrı özel dialog kullanıyor. |
| **2. Kullanıcıya teknik jargon gösterilmesi** (`"CRUD"`, `"ID"`, endpoint pathleri, ADR numaraları) | **UI Sorunu** | `sidebar.tsx:74` (`"Domain Modülleri"`), `sidebar.tsx:114-116` (`/{backendApp}`), `header.tsx:153` (`{pathname}`), `definitions-view.tsx:480-482,838-840` (`"CRUD"`, `"/ops/definitions/{kaynak}/"`), `catalog-view.tsx:1414` (`"POST /ops/products/ — ad, kategori_id, ayar_id zorunlu"`), `logistics-management-view.tsx:418` (`"ADR-0034"`), `profile-view.tsx:929-931` (`"PATCH /me/addresses/..."`). |
| **3. Formların ham sayısal ID istemesi** (`kategori_id`, `ayar_id`, `renk_id`, `order_id`, `teklif_id`, `warehouse_id`, `kullanici_id`, `quote_id`) | **UI + API Eksiği** | **UI:** Arama özellikli combobox (`<RelationSelect>`) yok.<br>**API:** Kategori, Ayar (ops/catalog lookup dışında), Renk, Ölçü, Quote listesi, PriceLock listesi, Cari kredi düzenleme gibi birçok kaynak için **isimle aranabilir listeleme endpoint'i eksik**. Örn: `catalog-view.tsx:1425-1440`, `quality-inspections-view.tsx:367-392,572-584`, `logistics-management-view.tsx:870-886,1228-1318`, `stock-management-view.tsx:268-279`, `pricing-quotes-view.tsx:189-225`, `header.tsx:288-298`. |
| **4. Sunucu taraflı arama/filtre/sayfalama eksikliği** | **UI + API Eksiği** | Backend listelerinin bir kısmı sayfalama (`paginate_queryset`) destekliyor (`ops_firmalar.py:85`, `ops_products.py:93`, `supplier.py:366,383`), fakat `ops_definitions.py:207,212` `[:200]` slice kesiyor ve `q`/filtre/sayfalama yok; `quotes/` ve `price-locks/` liste ucu hiç yok. Frontend tarafında ise `catalog-view.tsx` ve `ops-onay-havuzu` dışında neredeyse hiçbir modül sunucu paginasyonuna/aramasına bağlı değil. |
| **5. Standart satır eylemlerinin (Görüntüle / Düzenle / Aktif-Pasif / Sil) eksikliği** | **API + UI Eksiği** | `OpsProductDetailView`, `OpsFirmalar` alt kaynakları (`kontak/adres/banka/belge`), `AliciKanalErisimi`, `Warehouse`, `OrgBirimi`, `Kategori`, `SatisKanali` için **PATCH/DELETE** veya aktif-pasif uçları eksik (`api/urls.py:644-804`); olan yerlerde ise UI butonları bağlanmamış. |
| **6. Yeni firma açılışında kullanıcı/şube/adres/kanal kurulumunun parçalı olması** | **UI + API Eksiği** | Firma oluşturma (`/firmalar` üst bölüm), kullanıcı rol/davet (`/firmalar` alt bölüm), firma adresleri (`/profil` + ops modalı), satış kanalı oluşturma (`/tanimlar` salt okunur) farklı ekranlara dağılmış durumda. |
| **7. Tedarikçi kanal izinlerinin onaylanamaması** | **UI Uyuşmazlığı** | Backend modeli `ISTENDI / ONAYLI / REDDEDILDI` dönüyor (`tedarikci_kanal_izni.py:11-13`, `firma_ops.py:106`), UI ise `BEKLEMEDE / ONAYLANDI` filtreliyor ve yalnızca `iz.durum === "BEKLEMEDE"` iken Onayla/Reddet butonlarını gösteriyor (`ops-firmalar-view.tsx:868-870,909`). |
| **8. Sipariş checkout adreslerinin kaydedilmemesi & Bulk siparişte kanal 1'in sabitlenmesi** | **UI Hatası** | `order-workflow-view.tsx:301-302` (`void selectedDeliveryAddr; void selectedInvoiceAddr;`) adresleri API'ye göndermez; `order-workflow-view.tsx:201` bulk siparişte `satis_kanali_id: 1` hardcode eder. |
| **9. Varyant oluştururken beden/ölçü ve sabit fiyatlı ürünlerin API'den eklenememesi** | **API + UI Eksiği** | `Varyant.clean()` ölçü ve sabit fiyat isterken (`varyant.py:124-153`), `ops_products.py:159-167` ve `katalog_yazma_servisi.py:111-169` yalnızca `gram`, `renk_id`, `ek_bedel` kabul eder. Frontend modalı (`catalog-view.tsx:1493-1547`) da bu alanları hiç sunmaz. |
| **10. Satış kanalı tipinin (`KUYUMCU_PORTAL / B2B_API / B2C`) modelde olmaması** | **Model + API Eksiği** | `SatisKanali` modeli yalnızca `kod`, `ad`, `sira`, `aktif`, `quote_ttl_saniye` içerir (`satis_kanali.py:6-24`). UI metni (`ops-firmalar-view.tsx:951`) bu 3 kanalı varmış gibi gösterir ancak modelde kanal `tip` alanı ve CRUD endpoint'i yoktur. |
| **11. Birim yönetiminin yalnızca kod sabiti olması** | **Model + API Eksiği** | `StokBirimi` (`ADET`, `GRAM`, `KARAT`) sabit tuple'dır (`stok/birim_constants.py:4-13`); ayrı `Birim` tablosu ve `/ops/definitions/birimler/` benzeri bir yönetimi yoktur. |

---

## 4. Yanlış Route'lar ve Navigasyon / Başlık Sızıntıları

1. **Yanlış `backendApp` Etiketleri (`frontend/src/components/layout/nav-items.ts` & `sidebar.tsx:114-116`):**
   `sidebar.tsx:114-116`, her menü öğesinin sağında kullanıcıya doğrudan `/{item.backendApp}` rozeti basmaktadır. Bu hem teknik backend app sızıntısıdır hem de şu 3 menüde **yanlış/kafa karıştırıcı modül adı** gösterir:
   - **Tedarikçi RFQ** (`/teklifler`) → sağında **`/fiyatlama`** yazar (`nav-items.ts:106-111`).
   - **Profil & Adres** (`/profil`) → sağında **`/firmalar`** yazar (`nav-items.ts:113-117`).
   - **Raporlar & Analitik** (`/raporlar`) → sağında **`/siparis`** yazar (`nav-items.ts:119-124`).
   - *(Ek)* **Tanımlar** (`/tanimlar`) ve **Ürünler** (`/urunler`) gibi tüm satırlarda `/{backendApp}` rozeti, üst başlıkta ise `sidebar.tsx:74` (`"Domain Modülleri"`) ve `header.tsx:153` (`{pathname}`) teknik ifade sızıntısı vardır.
2. **Logo Harfi Hatası (`sidebar.tsx:41-52`):** Marka adı `TaraGold` olmasına rağmen logo kutusunda **`K`** harfi yazmaktadır.
3. **Yetim / Çakışan Route Bileşeni:** `profile-addresses-view` yalnız `frontend/src/features/firmalar/components/index.ts:2` içinde export edilmiştir; `App.tsx` rotalarında hiç kullanılmaz (`/profil` rotası `ProfileView` render eder, `App.tsx:87`).
4. **Sayfa Hiyerarşisi Karmaşası (`/firmalar`):** `frontend/src/app/(portal)/firmalar/page.tsx:10-18` tek sayfada hem `OpsFirmalarView` hem `FirmalarOrgView` render eder; bu da aynı ekranda hem tüm firmalar listesini hem oturum firmasının org birimlerini üst üste yığar.

---

## 5. `"Aktif kategori bulunamadı."` Hatasının Kök Nedeni

Hata **3 katmanlı (Backend API Eksikliği + UI Ham ID Tasarımı + Seed Bağımlılığı)** bir zincirden doğmaktadır:

1. **Doğrudan Backend Doğrulama Kaynağı (`backend/config/urunler/services/katalog_yazma_servisi.py:63-65`):**
   ```python
   kategori = Kategori.objects.filter(pk=kategori_id, aktif=True).first()
   if kategori is None:
       raise ValidationError({"kategori_id": "Aktif kategori bulunamadı."})
   ```
   `OpsProductListCreateView.post` (`backend/config/api/views/ops_products.py:107-123`) gelen `kategori_id` değerini doğrudan bu servise geçirir.
2. **API Katmanında Kategori Listeleme / Oluşturma Ucu Yok:**
   `backend/config/api/urls.py` (`173-847`) içinde **hiçbir** `/categories/` veya `/ops/categories/` endpoint'i yoktur (`ops_definitions.py:56-70` yalnızca `fiyat-gruplari`, `ayar-milyem`, `metal-kurlari`, `doviz-kurlari` kaynaklarını tanır). Dolayısıyla admin paneli hangi kategorilerin `aktif=True` olduğunu ve gerçek `id`'lerini **API'den çekemez**.
3. **Frontend Varsayılan `0` Değerli Ham Sayı Kutusu (`frontend/src/features/urunler/components/catalog-view.tsx:409,1425-1432`):**
   - Form `defaultValues` içinde `kategori_id: 0` (ve `ayar_id: 0`) ile başlar (`catalog-view.tsx:409-410`).
   - Kullanıcıya kategori listesi yerine çıplak `<Input type="number" ... />` (`label="kategori_id"`, `1425-1431`) gösterilir. Operatör `0` bırakırsa veya tahmin ettiği ID veritabanında yoksa / `aktif=False` ise backend anında `"Aktif kategori bulunamadı."` döner.
4. **Veri Tohumlama (Seed) ve İş Kuralı Bağımlılığı (`seed_urunler.py:98-106`, `kategori.py:210-211`, `urun.py:254-256`):**
   - Kategoriler yalnızca `python manage.py seed_urunler` çalıştırılırsa (`seed_urunler.py:102-105`, öncesinde `seed_fiyat_gruplari` şartı ile) veya Django Admin'den (`/admin/`) eklenir.
   - `Kategori.clean()` (`kategori.py:210-211`) ana kategoride `fiyat_grubu` zorunlu kılar; `Urun.clean()` (`urun.py:254-256`) de kategorinin etkin fiyat grubunu kontrol eder. Admin panelinde Kategori yönetimi olmadığı için kullanıcı eksik kategoriyi API/UI üzerinden ne görebilir ne oluşturabilir.

---

## 6. Kategorideki `"görüntüleme sırası, öne çıkan, popüler"` Alanları Neden Frontend'e Yansımıyor?

Modelde alanlar **mevcuttur**, ancak veritabanından React arayüzüne uzanan **3 katmanın tamamında kesinti** vardır:

1. **Modelde Tanımlı (`backend/config/urunler/models/kategori.py:40-54,83` & `urunler/admin/kategori_admin.py:16-18,28`):**
   - `sira = models.PositiveIntegerField("Görüntüleme Sırası", default=0, ...)` (`kategori.py:40`).
   - `one_cikan = models.BooleanField("Öne Çıkan / Popüler Kategori", default=False, ...)` (`kategori.py:51`) — *"Öne Çıkan"* ve *"Popüler"* kavramları backend'de tek boolean alanda birleştirilmiştir; ayrı bir `populer` alanı **bulunamadı**.
   - `Meta.ordering = ["sira", "ad"]` (`kategori.py:83`).
   - Bu alanlar yalnız Django Admin'de (`kategori_admin.py:16-18`) düzenlenebilir.
2. **Kesinti 1 — Kategori API Endpoint'i Yok (`backend/config/api/urls.py`):**
   `/api/v1/` altında kategori listesi veya ağaç endpoint'i olmadığı için `sira`, `one_cikan`, `ust_id`, `gorsel`, `ikon`, `dahili` alanları hiçbir HTTP yanıtıyla frontend'e ulaşmaz.
3. **Kesinti 2 — Ürün Presenter'ları Kategori Alanlarını Düşürüyor:**
   - `BuyerCatalogItemPresenter` (`backend/config/api/presenters/buyer.py:146`): `"kategori": getattr(getattr(urun, "kategori", None), "ad", "") or ""` — yalnızca kategori adını (string) döner; `kategori_id`, `sira`, `one_cikan` **yoktur**.
   - `present_ops_product` (`backend/config/api/presenters/ops_products.py:51-52`): yalnızca `kategori_id` ve `kategori` (`ad`) döner.
4. **Kesinti 3 — Katalog Sorgusu Sıralamayı Yoksayıyor & UI Bileşeni Yok:**
   - `BuyerCatalogListView` (`api/views/catalog.py:65-67`) ve `OpsProductListCreateView` (`api/views/ops_products.py:90-92`), `apply_ordering` whitelist'ini yalnız `("pk", "ad", "platform_kodu")` ile sınırlar; `kategori__sira` veya `-kategori__one_cikan` sıralaması yoktur.
   - `frontend/src/features/urunler/components/catalog-view.tsx:649-662`: Ne kategori ağacı/filtresi ne de "Öne Çıkan Kategoriler" şeridi/sıralaması mevcuttur.

---

## 7. Önerilen Faz Planı (Faz 1–5) ve Risk Analizi

### Önerilen Faz Sırası

1. **Faz 1 — Ortak UI/UX Standardı & Navigasyon Temizliği (Frontend):**
   - Paylaşılan bileşenler (`src/components/crud/`): `<ListPage>`, `<EntityModal>`, `<RelationSelect>` (isimle aramalı combobox + "yoksa ekle" iç içe modal desteği), `<ConfirmDialog>`, `<RowActions>`.
   - `nav-items.ts`, `sidebar.tsx`, `header.tsx` temizliği: `/{backendApp}` rozetlerinin, `"Domain Modülleri"`, `"K"` logosunun, `{pathname}` ve tüm `"ID"`/`"CRUD"`/endpoint jargonu etiketlerinin kaldırılması; yetim `profile-addresses-view` temizliği; `/firmalar` ve `/profil` ayrımının netleştirilmesi.
   - **Risk:** Düşük (veri kaybı yok; mevcut route guard'ları korunur).

2. **Faz 2 — Kategori, Birim/Ölçü/Renk, Tanımlar & Katalog API + UI (Backend + Frontend):**
   - **Backend:**
     - `/api/v1/categories/` (alıcı/ortak aktif+dahili=False, `sira` & `one_cikan` sıralı) ve `/api/v1/ops/categories/` tam CRUD + aktif/pasif (`sira`, `one_cikan`, `ust_id`, `fiyat_grubu_id`, `dahili`).
     - `BuyerCatalogListView` / `OpsProductListCreateView` için `kategori_id`, `one_cikan` filtresi + `kategori__sira` sıralama desteği; presenter'lara `kategori_id`, `kategori_sira`, `kategori_one_cikan` eklenmesi.
     - `/api/v1/ops/definitions/satis-kanallari/` (Satış Kanalları CRUD + opsiyonel `tip` alanı için güvenli genişletme migration'ı) ve `/api/v1/ops/catalog-refs/` (`Renk`, `OlcuDegeri` listeleme/ekleme).
     - `OpsProductDetailView` (`PATCH`/`DELETE` taslak/pasif), `OpsProductVariantDetailView`, `varyant_ekle` içine `beden_id`, `tedarikci_sku`, `sabit_fiyat`, `benzersiz_parca` eklenmesi, `UrunKanal` yönetim uçları.
     - `Birim` kavramının netleştirilmesi (`StokBirimi` referans listesi API'den döndürülür; yeni DB tablosu gerekirse geri alınabilir expand migration ile).
   - **Frontend:** Kategoriler, Ürünler, Satış Kanalları & Tanımlar ekranlarının `<ListPage>` + `<EntityModal>` + `<RelationSelect>` ile yenilenmesi (`kategori_id: 0` hatası tamamen biter, `sira`/`one_cikan` katalogda görünür).
   - **Risk:** Orta — `Urun`/`Varyant` check constraint'leri ve `Kategori.clean()` (`MAKS_DERINLIK=3`, döngü ve kök `fiyat_grubu` zorunluluğu) servis/API hatalarının temiz Türkçe form hata mesajlarına çevrilmesini gerektirir.

3. **Faz 3 — Firmalar, Kullanıcı/Üyelik, Adres, Kanal Erişimi & İzinleri (Backend + Frontend):**
   - **Backend:** `OpsFirma` alt kaynakları (`kontaklar`, `adresler`, `banka`, `belgeler`) ve `AliciKanalErisimi` için `PATCH`/`DELETE` uçları; `Kullanici` arama/combobox listesi (`GET /firma/kullanicilar/?q=`).
   - **Frontend:** `OpsFirmalarView` 4 adımlı inline wizard → `<EntityModal>` dönüşümü; `TedarikciKanalIzni` `"ISTENDI"` durum eşleşmesinin düzeltilmesi; Firma Yönetimi içinde tek akıştan Firma + Adres + Kullanıcı/Rol + Kanal Erişimi yönetimi; Header Act-As modalında `kullanici_id` yerine `<RelationSelect>` ile kullanıcı arama.
   - **Risk:** Orta — `Kullanici` tek firma/rol (`ADR-0003`) ve `FirmaUyelik` (`ADR-0035`) senkronu bozulmamalı; mevcut tenant izolasyonu testleri korunmalıdır.

4. **Faz 4 — Depo (`Warehouse`), Stok, Teklif/RFQ & Fiyatlama (Backend + Frontend):**
   - **Backend:** `Warehouse` CRUD endpoint'leri (`/ops/warehouses/` + `/supplier/warehouses/`), `present_balance` ve `present_offer` içine ürün adı / SKU / depo adı alanlarının kör havuz kurallarına uygun şekilde eklenmesi, Quote/PriceLock listeleme veya arama desteği (`GET /quotes/`, `GET /price-locks/`).
   - **Frontend:** Depo yönetim ekranı/modalı, Stok ve Tedarikçi Teklif/RFQ modallarında tüm ham ID'lerin (`varyant_id`, `teklif_id`, `warehouse_id`, `rfq_id`) `<RelationSelect>`'e çevrilmesi.
   - **Risk:** Orta-Yüksek — `StockBalance` ve `TedarikciTeklif` kör havuz maskelemesi (`assert_masked`) korunmalı; alıcıya tedarikçi kimliği, tedarikçiye alıcı kimliği kesinlikle sızmamalıdır.

5. **Faz 5 — Sipariş, Finans/Kredi, Kalite Kontrol, Lojistik/İade, Belgeler & Raporlar (Backend + Frontend):**
   - **Backend:** Gerekli seçici/lookup ve filtreleme (`?q=`, sayfalama) uçlarının tamamlanması (`CariHesap` kredi limiti PATCH, `OpsOrder` arama/sayfalama, `Belge` merkezi listeleme iyileştirmesi).
   - **Frontend:** Sipariş checkout adres payload düzeltmesi (`void selectedDeliveryAddr` hatasının giderilmesi), bulk siparişte hardcoded `satis_kanali_id: 1` yerine kanal seçimi, QC/Lojistik/İade/Finans ekranlarındaki tüm ham ID inputlarının `<RelationSelect>` + `<EntityModal>` + `<ListPage>` standardına geçirilmesi; kalan tüm teknik metinlerin temizlenmesi.
   - **Risk:** Düşük-Orta — Sipariş/Finans idempotency anahtarları ve durum makineleri (`_allow_status_transition`) korunmalıdır.
