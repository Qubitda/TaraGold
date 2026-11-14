export interface BuyerCatalogVariant {
  id: number;
  sku: string;
  beden: string;
  renk: string;
  gram: string | null;
  sabit_fiyat?: string | null;
  benzersiz_parca?: boolean;
}

export interface BuyerCatalogItem {
  id: number;
  ad: string;
  platform_kodu: string;
  kategori: string;
  kategori_id?: number;
  kategori_sira?: number;
  kategori_one_cikan?: boolean;
  ayar: string;
  varyant_count: number;
  fiyat_tipi: string;
  temin_tipi?: string;
  termin_gun?: number | null;
  yayin_durumu: string;
  allowed_actions: string[];
  kapak_url?: string;
}

export interface ProductMediaItem {
  id: number;
  urun_id?: number;
  varyant_id?: number | null;
  url: string;
  tip: string;
  sira: number;
  kapak: boolean;
  alt_metin?: string;
}

export interface ProductReadiness {
  tamamlanan: number;
  toplam: number;
  yuzde: number;
  hazir: boolean;
  eksikler: string[];
  kontroller: Array<{
    kod: string;
    etiket: string;
    ok: boolean;
    zorunlu: boolean;
  }>;
  aktif_varyant_sayisi?: number;
}

export interface PricePreviewResponse {
  available: boolean;
  varyant_id: number;
  urun_id: number;
  fiyat_tipi: string;
  gram?: string | null;
  ek_bedel?: string;
  sabit_fiyat?: string | null;
  reason_code?: string;
  detail?: string;
  hint?: string;
  aciklama?: Record<string, string>;
  teklif?: {
    id: number;
    fiyat_modeli: string;
    birim_fiyat?: string | null;
    para_birimi?: string;
    versiyon?: number;
  };
}

export interface BuyerCatalogDetail {
  id: number;
  ad: string;
  platform_kodu: string;
  kategori: string;
  kategori_id?: number;
  kategori_sira?: number;
  kategori_one_cikan?: boolean;
  ayar: string;
  aciklama?: string;
  fiyat_tipi: string;
  temin_tipi?: string;
  termin_gun?: number | null;
  olcu_tipi?: string;
  renk_ekseni?: boolean;
  allowed_actions: string[];
  varyantlar: BuyerCatalogVariant[];
  koleksiyon?: string;
  teknikler?: string[];
  stiller?: string[];
  ozel_gunler?: string[];
  kapak_url?: string;
  gorseller?: ProductMediaItem[];
}

export interface BuyerCatalogPage {
  count: number;
  page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: BuyerCatalogItem[];
}

export interface OpsProductVariant {
  id: number;
  sku: string;
  aktif: boolean;
  gram?: string | null;
  renk_id?: number | null;
  renk?: string;
  beden_id?: number | null;
  beden?: string;
  ek_bedel?: string;
  sabit_fiyat?: string | null;
  tedarikci_sku?: string;
  benzersiz_parca?: boolean;
}

export interface OpsProductChannelItem {
  kanal_id: number;
  kod: string;
  ad: string;
  tip?: string;
  atanmis?: boolean;
  aktif: boolean;
}

export interface OpsProduct {
  id: number;
  ad: string;
  platform_kodu: string;
  aciklama?: string;
  kategori_id: number;
  kategori?: string;
  kategori_sira?: number;
  kategori_one_cikan?: boolean;
  ayar_id: number;
  ayar?: string;
  fiyat_tipi?: string;
  temin_tipi?: string;
  termin_gun?: number | null;
  renk_ekseni?: boolean;
  olcu_tipi?: string;
  koleksiyon_id?: number | null;
  koleksiyon?: string;
  hedef_kitle?: string;
  yas_grubu_id?: number | null;
  yas_grubu?: string;
  yuzey?: string;
  zincir_tipi_id?: number | null;
  zincir_tipi?: string;
  kopca_tipi_id?: number | null;
  kopca_tipi?: string;
  teknik_ids?: number[];
  teknikler?: string[];
  stil_ids?: number[];
  stiller?: string[];
  ozel_gun_ids?: number[];
  ozel_gunler?: string[];
  onay_durumu: string;
  yayin_durumu: string;
  red_nedeni?: string;
  olusturan_firma_id: number;
  varyant_count: number;
  kanallar?: Array<{ kanal_id: number; kod: string; ad: string; aktif: boolean }>;
  allowed_actions?: string[];
  varyantlar?: OpsProductVariant[];
  hazirlik?: ProductReadiness;
  gorseller?: ProductMediaItem[];
  kapak_url?: string;
}

export interface OpsProductPage {
  count: number;
  page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: OpsProduct[];
}

export interface OpsProductCreateRequest {
  ad: string;
  kategori_id: number;
  ayar_id: number;
  aciklama?: string;
  fiyat_tipi?: string;
  temin_tipi?: string;
  termin_gun?: number | null;
  renk_ekseni?: boolean;
  olcu_tipi?: string;
  koleksiyon_id?: number | null;
  hedef_kitle?: string;
  yas_grubu_id?: number | null;
  yuzey?: string;
  zincir_tipi_id?: number | null;
  kopca_tipi_id?: number | null;
  teknik_ids?: number[];
  stil_ids?: number[];
  ozel_gun_ids?: number[];
  satis_kanali_id?: number;
}

export interface OpsProductUpdateRequest {
  ad?: string;
  kategori_id?: number;
  ayar_id?: number;
  aciklama?: string;
  fiyat_tipi?: string;
  temin_tipi?: string;
  termin_gun?: number | null;
  renk_ekseni?: boolean;
  olcu_tipi?: string;
  koleksiyon_id?: number | null;
  hedef_kitle?: string;
  yas_grubu_id?: number | null;
  yuzey?: string;
  zincir_tipi_id?: number | null;
  kopca_tipi_id?: number | null;
  teknik_ids?: number[];
  stil_ids?: number[];
  ozel_gun_ids?: number[];
}

export interface OpsProductVariantCreateRequest {
  gram?: string;
  renk_id?: number | null;
  beden_id?: number | null;
  ek_bedel?: string;
  sabit_fiyat?: string;
  tedarikci_sku?: string;
  benzersiz_parca?: boolean;
}

export interface OpsProductVariantUpdateRequest extends OpsProductVariantCreateRequest {
  aktif?: boolean;
}

export interface CategoryItem {
  id: number;
  kod: string;
  ad: string;
  slug?: string;
  tam_ad?: string;
  ust_id?: number | null;
  ust_ad?: string;
  fiyat_grubu_id?: number | null;
  fiyat_grubu_ad?: string;
  etkin_fiyat_grubu_id?: number | null;
  etkin_fiyat_grubu_ad?: string;
  sira: number;
  aktif: boolean;
  dahili: boolean;
  one_cikan: boolean;
  ikon?: string;
  seo_baslik?: string;
  seo_aciklama?: string;
  urun_sayisi?: number | null;
}

export interface CategoryPage {
  count: number;
  page?: number;
  page_size?: number;
  next?: string | null;
  previous?: string | null;
  results: CategoryItem[];
}

export interface CategoryWriteRequest {
  kod: string;
  ad: string;
  ust_id?: number | null;
  fiyat_grubu_id?: number | null;
  sira?: number;
  aktif?: boolean;
  dahili?: boolean;
  one_cikan?: boolean;
  ikon?: string;
  seo_baslik?: string;
  seo_aciklama?: string;
}

export interface CatalogRefItem {
  id: number;
  kod?: string;
  ad?: string;
  tip?: string;
  tip_ad?: string;
  sayisal_deger?: string;
  deger?: string;
  sira: number;
  aktif: boolean;
  degerli?: boolean;
}

export interface CatalogRefKaynakMeta {
  kaynak: string;
  ad: string;
}

export interface CatalogRefsSinglePage {
  kaynak: string;
  count: number;
  items: CatalogRefItem[];
  kaynaklar?: CatalogRefKaynakMeta[];
  olcu_tipleri?: Array<{ kod: string; ad: string }>;
  server_now?: string;
}

export interface CatalogRefsResponse {
  renkler: CatalogRefItem[];
  olculer: CatalogRefItem[];
  koleksiyonlar?: CatalogRefItem[];
  yas_gruplari?: CatalogRefItem[];
  teknikler?: CatalogRefItem[];
  stiller?: CatalogRefItem[];
  ozel_gunler?: CatalogRefItem[];
  zincir_tipleri?: CatalogRefItem[];
  kopca_tipleri?: CatalogRefItem[];
  tas_tipleri?: CatalogRefItem[];
  tas_kesimleri?: CatalogRefItem[];
  mihlama_tipleri?: CatalogRefItem[];
  tas_menseileri?: CatalogRefItem[];
  sertifika_kurumlari?: CatalogRefItem[];
  berrakliklar?: CatalogRefItem[];
  renk_dereceleri?: CatalogRefItem[];
  kesim_kaliteleri?: CatalogRefItem[];
  ayarlar: Array<{
    id: number;
    ayar_kodu: string;
    ayar_degeri: number;
    milyem: string;
    metal_id: number;
    metal_ad: string;
  }>;
  birimler: Array<{ kod: string; ad: string }>;
  olcu_tipleri: Array<{ kod: string; ad: string }>;
  fiyat_tipleri: Array<{ kod: string; ad: string }>;
  temin_tipleri: Array<{ kod: string; ad: string }>;
  hedef_kitleler?: Array<{ kod: string; ad: string }>;
  yuzeyler?: Array<{ kod: string; ad: string }>;
  kaynaklar?: CatalogRefKaynakMeta[];
  server_now?: string;
}

export interface MonturCatalogVariant {
  id: number;
  sku: string;
  gram: string | null;
  renk: string;
  beden: string;
}

export interface MonturCatalogItem extends BuyerCatalogItem {
  varyantlar: MonturCatalogVariant[];
}

export interface MonturlerPage {
  count: number;
  page?: number;
  page_size?: number;
  next?: string | null;
  previous?: string | null;
  results: MonturCatalogItem[];
}

export interface TasCatalogItem {
  id: number;
  kod: string;
  ad: string;
  degerli: boolean;
  sira: number;
}

export interface TasRefItem {
  id: number;
  kod: string;
  ad: string;
}

export interface TaslarPage {
  count: number;
  page?: number;
  page_size?: number;
  next?: string | null;
  previous?: string | null;
  results: TasCatalogItem[];
  referanslar?: {
    kesimler?: TasRefItem[];
    berrakliklar?: TasRefItem[];
    renk_dereceleri?: TasRefItem[];
    kesim_kaliteleri?: TasRefItem[];
    sertifika_kurumlari?: TasRefItem[];
    menseiler?: TasRefItem[];
  };
}
