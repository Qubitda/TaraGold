export interface BuyerQuoteNetOzet {
  toplam_vergisiz?: string | null;
  gram?: string | null;
  gram_basi_vergisiz?: string | null;
  has_gram?: string | null;
}

export interface PriceQuote {
  id: number;
  varyant_id: number;
  birim_fiyat: string;
  para_birimi: string;
  expires_at?: string;
  allowed_actions?: string[];
  durum?: string;
  gram?: string;
  gram_basi_vergisiz?: string;
  toplam_vergisiz?: string;
  has_gram?: string | null;
  net_ozet?: BuyerQuoteNetOzet;
  varyant_sku?: string;
  urun?: string;
}

export interface PriceQuotePage {
  count: number;
  results: PriceQuote[];
}

export interface PriceLock {
  id: number;
  quote_id: number;
  kilit_fiyati: string;
  para_birimi: string;
  durum: "AKTIF" | "KULLANILDI" | "SURESI_DOLDU" | "IPTAL" | string;
  expires_at: string;
  gecerli?: boolean;
  varyant_sku?: string;
  urun_ad?: string;
}

export interface PriceLockPage {
  count: number;
  results: PriceLock[];
}

export interface SupplierVariantOption {
  id: number;
  sku: string;
  urun_id: number;
  urun_ad: string;
  platform_kodu: string;
  gram?: string | null;
  renk?: string;
  beden?: string;
  etiket: string;
}

export interface SupplierVariantPage {
  count: number;
  results: SupplierVariantOption[];
}









export interface SupplierOffer {
  id: number;
  varyant_id: number;
  varyant_sku?: string;
  urun_ad?: string;
  platform_kodu?: string;
  fiyat_modeli?: string;
  temin_tipi?: string;
  birim_fiyat: string | null;
  gram?: string | null;
  iscilik_override?: string | null;
  para_birimi: string;
  durum: "TASLAK" | "ONAY_BEKLIYOR" | "GONDERILDI" | "ONAYLANDI" | "YAYINDA" | "PASIF" | string;
  allowed_actions: string[];
  tedarikci_kodu?: string;
  versiyon?: number;
  uretim_suresi_gun?: number | null;
  gecerlilik_bitis?: string | null;
}

export interface SupplierOfferPage {
  count: number;
  results: SupplierOffer[];
}

export interface SupplierOfferCreateRequest {
  varyant_id: number;
  fiyat_modeli: string;
  birim_fiyat?: string;
  gram?: string;
  iscilik_override?: string;
  para_birimi?: string;
  tedarikci_kodu?: string;
  temin_tipi?: string;
  uretim_suresi_gun?: number;
  gecerlilik_baslangic?: string;
  gecerlilik_bitis?: string;
}

export interface SupplierOfferImportSatir {
  satir_no: number;
  varyant_id: number;
  sku?: string;
  fiyat_modeli: string;
  birim_fiyat?: string | null;
  gram?: string | null;
  iscilik_override?: string | null;
  para_birimi?: string;
  tedarikci_kodu?: string;
}

export interface SupplierOfferImportHata {
  satir_no: number;
  hata: string;
}

export interface SupplierOfferImportPreview {
  server_now: string;
  satirlar: SupplierOfferImportSatir[];
  hatalar: SupplierOfferImportHata[];
}

export interface SupplierOfferImportCommitResult {
  server_now?: string | null;
  created: Array<{
    satir_no: number;
    teklif_id: number;
    varyant_id: number;
    durum: string;
  }>;
  hatalar: SupplierOfferImportHata[];
  detail?: string;
}
