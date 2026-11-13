/** GET /api/v1/sales-channels/ — runtime: {count, results, server_now} */

export interface SalesChannel {
  id: number;
  kod: string;
  ad: string;
  quote_ttl_saniye?: number | null;
  /** Liste yalnızca aktif=True döner; alan API’de yoksa true kabul edilir */
  aktif?: boolean;
}

export interface SalesChannelPage {
  count: number;
  results: SalesChannel[];
  server_now?: string;
}

export type DefinitionCategoryId = "sales-channels" | "fiyat-gruplari" | "ayar-milyem" | "kur-metal" | "kur-doviz";

export type OpsDefinitionKaynak =
  | "fiyat-gruplari"
  | "ayar-milyem"
  | "metal-kurlari"
  | "doviz-kurlari";

export interface DefinitionCategoryMeta {
  id: DefinitionCategoryId;
  label: string;
  description: string;
  backendModel: string;
  /** OpenAPI / runtime HTTP yüzeyi var mı */
  apiAvailable: boolean;
  endpoint?: string;
  kaynak?: OpsDefinitionKaynak;
}

export interface OpsFiyatGrubu {
  id: number;
  kod: string;
  ad: string;
  sira: number;
  aktif: boolean;
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

export interface OpsDefinitionRefs {
  metaller: Array<{ id: number; kod: string; ad: string; gram_bazli: boolean }>;
  saglayicilar: Array<{ id: number; kod: string; ad: string; aktif: boolean }>;
  kur_tipleri: string[];
  fiyat_kaynaklari: string[];
  para_birimleri: string[];
}

export type OpsDefinitionRow =
  | OpsFiyatGrubu
  | OpsAyarMilyem
  | OpsMetalKuru
  | OpsDovizKuru;

export interface OpsDefinitionsPage<T = OpsDefinitionRow> {
  kaynak: OpsDefinitionKaynak;
  count: number;
  results: T[];
  server_now?: string;
  refs?: OpsDefinitionRefs;
}

