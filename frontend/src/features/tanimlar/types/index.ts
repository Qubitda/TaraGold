/** GET /api/v1/sales-channels/ */
export interface SalesChannel {
  id: number;
  kod: string;
  ad: string;
  tip?: string;
  fiyat_grubu_id?: number | null;
  quote_ttl_saniye?: number | null;
  sira?: number;
  aktif?: boolean;
}

export interface SalesChannelPage {
  count: number;
  results: SalesChannel[];
  server_now?: string;
}

/** Ops definitions veya ürün catalog-refs — `?grup=` ile eşleşir. */
export type DefinitionCategoryId =
  | "satis-kanallari"
  | "fiyat-gruplari"
  | "kiymetli-metaller"
  | "ayar-milyem"
  | "kur-metal"
  | "kur-doviz"
  | "birimler"
  | "kategoriler"
  | "koleksiyon"
  | "renk"
  | "olcu"
  | "yas-grubu"
  | "teknik"
  | "stil"
  | "ozel-gun"
  | "zincir-tipi"
  | "kopca-tipi"
  | "tas-tipi"
  | "tas-kesimi"
  | "mihlama-tipi"
  | "tas-mensei"
  | "sertifika-kurumu"
  | "berraklik"
  | "renk-derecesi"
  | "kesim-kalitesi";

export type OpsDefinitionKaynak =
  | "satis-kanallari"
  | "fiyat-gruplari"
  | "kiymetli-metaller"
  | "ayar-milyem"
  | "metal-kurlari"
  | "doviz-kurlari"
  | "birimler";

export type DefinitionKind = "ops" | "catalog-ref" | "categories";

export interface DefinitionCategoryMeta {
  id: DefinitionCategoryId;
  label: string;
  description: string;
  /** ops: OpsDefinitionKaynak; catalog-ref: kaynak slug; categories: "kategoriler" */
  kaynak: string;
  kind?: DefinitionKind;
  readOnly?: boolean;
}

export interface DefinitionNavSection {
  id: string;
  label: string;
  items: DefinitionCategoryMeta[];
}

export interface OpsSatisKanali {
  id: number;
  kod: string;
  ad: string;
  tip: string;
  fiyat_grubu_id?: number | null;
  fiyat_grubu_ad?: string;
  varsayilan_marj_kurali_id?: number | null;
  varsayilan_marj_kurali_ad?: string;
  quote_ttl_saniye: number | null;
  sira: number;
  aktif: boolean;
}

export interface SalesChannelProductItem {
  urun_id: number;
  platform_kodu: string;
  ad: string;
  kategori_ad: string;
  ayar_kod: string;
  onay_durumu: string;
  yayin_durumu: string;
  atanmis: boolean;
  aktif: boolean;
}

export interface SalesChannelProductsResponse {
  kanal: {
    id: number;
    kod: string;
    ad: string;
    tip: string;
  };
  count: number;
  results: SalesChannelProductItem[];
}

export interface OpsFiyatGrubu {
  id: number;
  kod: string;
  ad: string;
  sira: number;
  aktif: boolean;
}

export interface OpsKiymetliMetal {
  id: number;
  kod: string;
  ad: string;
  gram_bazli: boolean;
}

export interface OpsAyarMilyem {
  id: number;
  metal_id: number;
  metal_kod: string;
  metal_ad: string;
  fiyat_kaynagi: string;
  ayar_degeri: number;
  ayar_kodu: string;
  milyem: string;
}

export interface OpsMetalKuru {
  id: number;
  metal_id: number;
  metal_kod: string;
  metal_ad: string;
  saglayici_id: number;
  saglayici_kod: string;
  kur_tipi: string;
  zaman?: string | null;
  alinma_zamani?: string | null;
  saf_birim_fiyat: string;
  kaynak: string;
  manuel_neden: string;
  girilme_zamani?: string | null;
}

export interface OpsDovizKuru {
  id: number;
  para_birimi: string;
  saglayici_id: number;
  saglayici_kod: string;
  kur_tipi: string;
  zaman?: string | null;
  alinma_zamani?: string | null;
  kur: string;
  kaynak: string;
  manuel_neden: string;
  girilme_zamani?: string | null;
}

export interface OpsBirim {
  id: string;
  kod: string;
  ad: string;
}

export interface OpsDefinitionRefs {
  metaller: Array<{ id: number; kod: string; ad: string; gram_bazli: boolean }>;
  saglayicilar: Array<{ id: number; kod: string; ad: string; aktif: boolean }>;
  fiyat_gruplari?: Array<{ id: number; kod: string; ad: string; aktif: boolean }>;
  marj_kurallari?: Array<{
    id: number;
    ad: string;
    kapsam: string;
    marj_turu: string;
    deger: string;
    aktif: boolean;
  }>;
  kur_tipleri: string[];
  fiyat_kaynaklari: string[];
  para_birimleri: string[];
  kanal_tipleri?: Array<{ kod: string; ad: string }>;
  birimler?: Array<{ kod: string; ad: string }>;
}

export type OpsDefinitionRow =
  | OpsSatisKanali
  | OpsFiyatGrubu
  | OpsKiymetliMetal
  | OpsAyarMilyem
  | OpsMetalKuru
  | OpsDovizKuru
  | OpsBirim;

export interface OpsDefinitionsPage<T = OpsDefinitionRow> {
  kaynak: OpsDefinitionKaynak;
  count: number;
  page?: number;
  page_size?: number;
  results: T[];
  server_now?: string;
  refs?: OpsDefinitionRefs;
}
