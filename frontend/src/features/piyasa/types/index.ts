export type PiyasaOlcek = "GRAM" | "ONS" | "KG" | string;

export interface PiyasaPanoSatir {
  kod: string;
  ad?: string;
  bolum?: string;
  grup?: string;
  varyant_etiket?: string;
  gram?: string | null;
  fiyat: string;
  alis?: string | null;
  satis?: string | null;
  alis_goster?: boolean;
  satis_goster?: boolean;
  yon_alis?: string;
  yon_satis?: string;
  para_birimi: string;
  olcek?: PiyasaOlcek;
  ondalik?: number;
  ticker_da_goster?: boolean;
  kaynak: string;
  guncelleme?: string | null;
  banner?: string | null;
}

export interface OpsPanoDetaySatir {
  id: number | null;
  kod: string;
  ad?: string;
  bolum?: string;
  grup?: string;
  varyant_etiket?: string;
  aktif?: boolean;
  fiyat_modu?: "CANLI" | "ELLE" | string;
  sabit_alis?: string | null;
  sabit_satis?: string | null;
  marj_tipi?: string;
  alis_marj?: string | null;
  satis_marj?: string | null;
  ham_alis?: string | null;
  ham_satis?: string | null;
  nihai_alis?: string | null;
  nihai_satis?: string | null;
  ondalik?: number;
  para_birimi?: string;
  gram?: string | null;
  olcek?: string;
  metal_id?: number | null;
  ayar_id?: number | null;
  alis_goster?: boolean;
  satis_goster?: boolean;
  aliciya_alis_goster?: boolean;
  aliciya_goster?: boolean;
  ticker_da_goster?: boolean;
  feed_health?: string;
  banner?: string;
  ok?: boolean;
  hata?: string;
  guncelleme?: string | null;
}

export interface OpsPanoDetay {
  server_now: string;
  referans_ibaresi?: string;
  satirlar: OpsPanoDetaySatir[];
}

export interface OpsPiyasaUrunPatch {
  fiyat_modu?: "CANLI" | "ELLE" | string;
  sabit_alis?: string | number | null;
  sabit_satis?: string | number | null;
  marj_tipi?: string;
  alis_marj?: string | number;
  satis_marj?: string | number;
  ticker_da_goster?: boolean;
  aliciya_goster?: boolean;
  alis_goster?: boolean;
  satis_goster?: boolean;
  aliciya_alis_goster?: boolean;
  aktif?: boolean;
  ad?: string;
  bolum?: string;
  grup?: string;
  varyant_etiket?: string;
  sira?: number;
  gram?: string | number;
  olcek?: string;
  metal_id?: number | null;
  ayar_id?: number | null;
}

/** ADR-0042 — yeni pano kalemi. */
export interface OpsPiyasaUrunCreate {
  ad: string;
  grup: string;
  bolum: string;
  metal_id: number;
  ayar_id?: number | null;
  gram?: string | number;
  olcek?: string;
  marj_tipi?: string;
  alis_marj?: string | number;
  satis_marj?: string | number;
  aliciya_goster?: boolean;
  ticker_da_goster?: boolean;
}

/** ADR-0041 — kuyumcu kendi ekran adı + ek marj. */
export interface FirmaPanoTercih {
  firma_id: number;
  firma_ad: string;
  platform?: boolean;
  pano_baslik: string;
  etkin_baslik: string;
  marj_tipi: "TL" | "YUZDE" | string;
  alis_marj: string;
  satis_marj: string;
  guncelleme?: string | null;
  mesaj?: string;
}

export interface FirmaPanoTercihPatch {
  pano_baslik?: string;
  marj_tipi?: "TL" | "YUZDE" | string;
  alis_marj?: string | number;
  satis_marj?: string | number;
}

/** Altın ons dönem kutuları (Binance XAUUSDT 1d). */
export interface OnsOzetDonem {
  etiket: string;
  fiyat: string;
  referans?: string | null;
  degisim_yuzde?: string | null;
  yon?: "up" | "down" | "flat" | string;
}

export interface OnsOzet {
  sembol?: string;
  pb?: string;
  son?: string | null;
  ok?: boolean;
  kaynak?: string;
  donemler?: OnsOzetDonem[];
  hata?: string;
  guncelleme?: string | null;
}

export interface PiyasaPano {
  server_now: string;
  olcek?: string | null;
  kaynak?: string;
  gecikmeli?: boolean;
  /** Ops ayarından; boşsa FE firma adını kullanır. */
  baslik?: string | null;
  referans_ibaresi?: string;
  banner?: string | null;
  ons_ozet?: OnsOzet | null;
  satirlar: PiyasaPanoSatir[];
}

export interface OpsMarjPolitikasi {
  id: number;
  anahtar: string;
  marj_modu: "TL" | "YUZDE" | string;
  marj_orani: string;
  aktif: boolean;
  pano_baslik?: string;
  guncelleme?: string | null;
  server_now: string;
}

export interface OpsMarjPolitikasiPatchRequest {
  marj_modu?: "TL" | "YUZDE";
  marj_orani?: string;
  aktif?: boolean;
  pano_baslik?: string;
}

export interface OpsCanliMetalRow {
  metal_id: number;
  kod: string;
  ad: string;
  olcek: string;
  alis: string | null;
  satis: string | null;
  kaynak: string;
  saglayici: string;
  guncelleme: string | null;
}

export interface OpsCanliPanoRow {
  kod: string;
  ad: string;
  olcek: string;
  para_birimi: string;
  alis: string | null;
  satis: string | null;
  banner: string;
  guncelleme: string | null;
}

export interface OpsCanliDovizRow {
  para_birimi: string;
  alis: string | null;
  satis: string | null;
  kaynak: string;
  saglayici: string;
  guncelleme: string | null;
}

export interface OpsCanliPiyasaResponse {
  salt_okunur: boolean;
  server_now: string;
  has_gram: OpsCanliMetalRow[];
  pano_satirlari: OpsCanliPanoRow[];
  doviz: OpsCanliDovizRow[];
}

export type MarjKapsam = "TUMU" | "SATIS_KANALI" | "KATEGORI" | "FIYAT_GRUBU";
export type MarjTuru = "YUZDE" | "GRAM_BASI_SABIT";

export interface MarjKuraliRow {
  id: number;
  ad: string;
  kapsam: MarjKapsam | string;
  kapsam_etiket: string;
  satis_kanali_id: number | null;
  satis_kanali_ad: string;
  kategori_id: number | null;
  kategori_ad: string;
  fiyat_grubu_id: number | null;
  fiyat_grubu_ad: string;
  hedef_ad: string;
  marj_turu: MarjTuru | string;
  marj_turu_etiket: string;
  deger: string;
  aktif: boolean;
  guncelleme: string | null;
}

export interface MarjKurallariRefs {
  kapsam_secenekleri: Array<{ kod: string; ad: string }>;
  marj_turleri: Array<{ kod: string; ad: string }>;
  satis_kanallari: Array<{ id: number; kod: string; ad: string; tip: string; aktif: boolean }>;
  kategoriler: Array<{ id: number; kod: string; ad: string; aktif: boolean }>;
  fiyat_gruplari: Array<{ id: number; kod: string; ad: string; aktif: boolean }>;
}

export interface MarjKurallariPage {
  count: number;
  results: MarjKuraliRow[];
  cozumleme_sirasi: string[];
  server_now: string;
  refs?: MarjKurallariRefs;
}

export interface MarjKuraliWriteRequest {
  ad?: string;
  kapsam?: MarjKapsam | string;
  satis_kanali_id?: number | null;
  kategori_id?: number | null;
  fiyat_grubu_id?: number | null;
  marj_turu: MarjTuru | string;
  deger: string;
  aktif?: boolean;
}


