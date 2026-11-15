/**
 * OpenAPI normatif sepet ve sipariş tipleri (API_CONTRACT ve ADR-0011/0017).
 * Fiyat ve miktar hesaplamaları daima backend otoritesindedir.
 */

export interface BuyerCartLine {
  id: number;
  varyant_id: number;
  varyant_sku?: string;
  urun_ad?: string;
  quote_id: number;
  miktar: string; // Decimal string
  birim: string;
  birim_fiyat_vergisiz: string;
  para_birimi: string;
  gecerlilik_sonu: string | null;
  gram?: string | null;
  fiyat_tipi?: string;
  satis_kanali_id?: number;
}

export interface BuyerCart {
  id: number;
  alici_firma_id: number;
  sube_id: number | null;
  line_count: number;
  server_now: string;
  allowed_actions: string[];
  lines: BuyerCartLine[];
}

export interface BuyerOrderLine {
  id: number;
  varyant_id: number;
  varyant_sku?: string;
  urun_ad?: string;
  miktar: string;
  birim: string;
  tahmini_birim_fiyat_vergisiz?: string | null;
  tahmini_satir_tutari_vergisiz?: string | null;
  snapshot_birim_fiyat_vergisiz?: string | null;
  snapshot_satir_tutari_vergisiz?: string | null;
  fiyat_kesin?: boolean;
  fark_vergisiz?: string | null;
  para_birimi: string;
  price_quote_id?: number | null;
}

export interface BuyerOrder {
  id: number;
  alici_firma_id: number;
  alici_firma_ad?: string;
  durum: string;
  idempotency_key: string | null;
  line_count: number;
  olusturma_tarihi: string;
  allowed_actions: string[];
  tahmini_toplam_vergisiz?: string | null;
  kesin_toplam_vergisiz?: string | null;
  fark_toplam_vergisiz?: string | null;
  fiyat_kesin?: boolean;
  lines?: BuyerOrderLine[];
  teslimat_adresi?: {
    id: number;
    tip: string;
    il: string;
    ilce: string;
    adres: string;
  } | null;
  fatura_adresi?: {
    id: number;
    tip: string;
    il: string;
    ilce: string;
    adres: string;
  } | null;
  siparis_notu?: string;
}

/** OpenAPI CheckoutResult — POST /checkouts/ */
export interface CheckoutResult {
  checkout_id: number;
  durum?: string;
  order_id?: number | null;
  server_now?: string;
}

/** Eski UI alanı; checkout EmptyRequest — gönderilmez. */
export interface CheckoutRequest {
  teslimat_adresi_id?: number;
  fatura_adresi_id?: number;
  notlar?: string;
}

export interface BulkOrderRowInput {
  sku: string;
  miktar: string;
  birim?: string;
}

export interface BulkOrderCreateRequest {
  satis_kanali_id: number;
  rows?: BulkOrderRowInput[];
  csv?: string;
}

export interface BulkOrderResult {
  order_id: number | null;
  replayed: boolean;
  accepted: Array<{
    satir_no: number;
    sku: string;
    miktar: string;
    birim?: string;
  }>;
  errors: Array<{
    satir_no: number;
    sku: string;
    hata: string;
  }>;
}

export interface SupplierHazirlamaSatir {
  order_line_id: number;
  varyant_id: number;
  platform_kodu?: string;
  miktar: string;
  birim: string;
  teslim_modeli?: string;
}

export interface SupplierHazirlamaEmri {
  order_id: number;
  durum: string;
  hazirlama_durumu?: string;
  satirlar: SupplierHazirlamaSatir[];
  alici: null | Record<string, unknown>;
}
