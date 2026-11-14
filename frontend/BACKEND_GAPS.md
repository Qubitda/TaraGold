# Frontend → Backend boşlukları (FAZ 3)

OpenAPI kaynağı: `docs/api/openapi-v1.json`. Aşağıdakiler **HTTP yüzünde yok**; FE uydurma endpoint yazmaz.

---

## GAP-F3-01 — Canlı borsa / piyasa panosu — **UYGULANDI** (2026-11-12)

| | |
|--|--|
| **İhtiyaç** | Portalda canlı (veya LKG) metal/kur panosu; alıcıya yalnızca görüntü |
| **Uygulama** | `GET /api/v1/piyasa/pano/?olcek=ONS\|KG\|GRAM` — `PiyasaPanoView` + `present_buyer_pano` |
| **Yanıt** | `{ "server_now", "olcek", "satirlar": [{ "kod", "ad", "fiyat", "para_birimi", "olcek", "kaynak", "guncelleme", "banner" }] }` |
| **Yasak** | `alis_marj`, `satis_marj`, `marj_modu`, detay/saf kur |
| **Ekran** | Header `PiyasaPanoStrip` |
| **Kanıt** | `api.tests.test_piyasa_pano_f301` |

---

## GAP-F3-02 — Global kâr marjı (admin/ops) — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Ops/admin için global marj politikası okuma/yazma |
| **Uygulama** | `GET/PATCH /api/v1/ops/piyasa/marj-politikasi/` |
| **İstek** | `{ "marj_orani": "0.085", "aktif": true }` (string Decimal) |
| **Yanıt** | Politika DTO + `server_now` |
| **Ekran** | `OpsMarjPolitikasiCard` (Fiyatlama & Tanımlar ops paneli) |
| **Not** | Alıcıya **asla** marj kırılımı dönülmez |

---

## GAP-F3-03 — İşçilik (gr) + has hesabı (alıcı net) — **UYGULANDI** (2026-11-12)

| | |
|--|--|
| **İhtiyaç** | Quote yanıtında işçilik/has; alıcı yalnız **net** görür |
| **Uygulama** | `BuyerQuote` + `net_ozet`: `iscilik_vergisiz` (ISCILIK satır tutarı), `has_gram` (gram×katalog milyem) |
| **Yanıt (alıcı)** | mevcut net alanlar + `iscilik_vergisiz` / `has_gram` / `net_ozet` — maliyet/marj/tedarikçi/satır listesi **yok** |
| **Yanıt (yasak)** | `maliyet`, `marj`, `tedarikci_*`, ham `iscilik`, `kanal_marj` |
| **Ekran** | `BuyerNetPriceCard` |
| **Kanıt** | `fiyatlama.tests.test_faz3_6_kor_havuz_k011.Faz36KorHavuzK011Tests.test_buyer_net_ozet_iscilik_and_has` |

---

## GAP-F3-04 — Tedarikçi föy CSV içe aktarma — **UYGULANDI** (2026-11-12; PDF sonra)

| | |
|--|--|
| **İhtiyaç** | Yükleme → önizleme → hatalı satır → commit (taslak teklifler) |
| **Uygulama** | `POST /supplier/offers/import/preview/` + `…/commit/` (`teklif_import_servisi`) |
| **Preview** | multipart `file` **veya** JSON `{csv}`; PDF → 400 |
| **Commit** | `{ "satirlar": [...] }` — hepsi geçerliyse atomic taslak; aksi yazma yok |
| **CSV** | `fiyat_modeli` + (`varyant_id`\|`sku`); opsiyonel gram/birim_fiyat/iscilik_override/… |
| **Ekran** | Teklifler sekmesi föy paneli |
| **Kanıt** | `api.tests.test_supplier_offer_import_f304` |

---

## GAP-F3-05 — Özel üretim: montür/taş katalog + üretim siparişi SM — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Montür seç → taş seç → özel üretim RFQ akışı |
| **Uygulama** | `GET /api/v1/catalog/monturler/` ve `GET /api/v1/catalog/taslar/` |
| **Ekran** | `CatalogView` ("Montürler", "Taşlar" sekmeleri) + `SupplierRfqOffersView` Özel Üretim RFQ formu |
| **Not** | Montür/taş katalog seçicisi `montur_varyant_id`, `hedef_ayar`, `hedef_gram` ve `tas_ozeti` alanlarını doldurur |

---

## GAP-F3-06 — RFQ ↔ tedarikçi teklif bağlama — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Tedarikçi teklifini belirli RFQ satırına bağlama |
| **Uygulama** | `POST /api/v1/supplier/offers/` body ve `SupplierOffer` yanıtında opsiyonel `rfq_id` / `rfq_line_id` |
| **Ekran** | `SupplierRfqOffersView` ("Teklif hazırla" modalı, tablo ve detay modalı) |

---

---

# FAZ 4 — Finans / Stok / Lojistik / Kalite

## GAP-F4-01 — Sevkiyat taşıyıcı alanı — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Dispatch’te taşıyıcı firma (`tasiyici`) + OpsShipment yanıtında gösterme |
| **Uygulama** | `TakipNoRequest` & `OpsShipment` üzerinde `tasiyici?: string | null` |
| **Ekran** | Lojistik sevk modalı ve sevkiyat tablosu |

## GAP-F4-02 — QC ölçüm: ayar + gram ayrı alan — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Ölçülen ayar ve gram ayrı Decimal alanlar |
| **Uygulama** | `OpsMeasurementRequest` & `InspectionMeasurementItem`: `olculen_ayar`, `olculen_gram` (Decimal string) |
| **Ekran** | `QualityInspectionsView` ölçüm modalı ve ölçüm tablosu |

## GAP-F4-03 — Depo listesi (warehouse picker) — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Stok düzeltmede depo seçimi (id ezberletmeden) |
| **Uygulama** | `GET /api/v1/supplier/warehouses/` → `{ id, ad, kod }` |
| **Ekran** | `StockManagementView` depo seçici & stok tablosu |

## GAP-F4-04 — İade sebep / mahsup tutarı yüzeyi — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | BuyerReturn’de `iade_sebebi`, `mahsup_tutari` (string Decimal) |
| **Uygulama** | `BuyerReturn` yanıtı `iade_sebebi` ve `mahsup_tutari` alanlarını içerir; `POST /returns/{id}/mahsup/` desteklenir |
| **Ekran** | Lojistik iade tablosu ve detay modalı |

## GAP-F4-05 — Alıcı sevkiyat / POD self-service — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Alıcı kendi `/shipments/` listesinde takip + POD görüntüleme/indirme |
| **Uygulama** | `GET/POST /api/v1/shipments/{id}/pod/` |
| **Ekran** | Alıcı lojistik sevkiyat detayı & POD modalı |

---

---

# FAZ 5 — Org / Tanımlar / Belgeler / Profil / Dashboard / Raporlar

## GAP-F5-01 — Merkezi belge kasası — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Tek `GET /documents/` (tip, order_id, indirme URL, tenant/kör havuz) |
| **Uygulama** | `GET /api/v1/documents/?tip=&order_id=` + `GET /api/v1/documents/{id}/download/` |
| **Ekran** | `DocumentsView` |

## GAP-F5-02 — Tanım CRUD (fiyat grubu / ayar / kur) — **UYGULANDI** (2026-11-13)

| | |
|--|--|
| **İhtiyaç** | Ops tanımlar: fiyat grubu, ayar-milyem, metal/döviz kuru okuma-yazma |
| **Uygulama** | `GET/POST /api/v1/ops/definitions/{kaynak}/` + `GET/PATCH/DELETE /api/v1/ops/definitions/{kaynak}/{id}/` |
| **Ekran** | `DefinitionsView` |

## GAP-F5-03 — Firma listesi (tenant dışı) — **UYGULANDI** (2026-11-12)

| | |
|--|--|
| **İhtiyaç** | Platform ops için firma arama |
| **Uygulama** | `GET/POST /api/v1/ops/firmalar/` + onay/davet/alt kaynaklar |
| **Ekran** | Firmalar → Ops firmalar (4 adımlı sihirbaz) |

## GAP-F5-04 — Sipariş onay havuzu UI derinleştirme — **UYGULANDI** (2026-11-12)

| | |
|--|--|
| **İhtiyaç** | Ret / hazırlama / proforma / tahsilat tek ekran akışı |
| **Uygulama** | `OpsOnayHavuzu`: onay/red + proforma/irsaliye PDF + manuel tahsilat |
| **Ekran** | Sipariş → Ops onay havuzu |

## GAP-F5-05 — Feed API anahtarı UI — **UYGULANDI** (2026-11-12)

| | |
|--|--|
| **İhtiyaç** | API müşterisi anahtar oluştur/iptal ekranı |
| **Uygulama** | `GET/POST /ops/firmalar/{id}/api-anahtarlar/` + `POST …/{anahtar_id}/iptal/`; `OpsFirmalarView` panel |
| **Ekran** | Firmalar → Ops firmalar → API anahtarları |
| **Not** | Feed `stok_ozet` artık birim bazlı ATP (`ADET:n`); placeholder kaldırıldı |

---

# FAZ 6 — Katalog ticari deneyim (ADR-0037)

## GAP-F6-01 — Ürün galerisi + kapak — **UYGULANDI** (2026-11-14)

| | |
|--|--|
| **İhtiyaç** | Ürün/varyant görselleri, kapak, sıralama |
| **Uygulama** | `UrunGorsel` + `GET/POST /ops/products/{id}/media/` (+ reorder/cover/delete); alıcı `kapak_url` / `gorseller` |
| **Ekran** | Katalog → Ops ürün detay → Hazırlık (P0) |

## GAP-F6-02 — Bulk varyant + yayın checklist — **UYGULANDI** (2026-11-14)

| | |
|--|--|
| **İhtiyaç** | Renk×ölçü matrisi; onaya göndermede kapak+varyant |
| **Uygulama** | `POST …/variants/bulk/`, `GET …/readiness/`, `onaya_gonder` checklist |
| **Ekran** | Hazırlık (P0) paneli |

## GAP-F6-03 — Ops fiyat önizleme (motor rewrite yok) — **UYGULANDI** (2026-11-14)

| | |
|--|--|
| **İhtiyaç** | Gram/sabit açıklama + teklif durumu; sahte fiyat yok |
| **Uygulama** | `GET …/variants/{vid}/price-preview/` |
| **Ekran** | Hazırlık → Fiyat önizleme |
| **Not** | Katalog `UrunTasi.bedel` ≠ quote `TeklifTasMaliyeti` (K-011) |

---

*Güncelleme: 2026-11-14 — ADR-0037 P0 (GAP-F6-01..03) eklendi.*
