export type PiyasaOlcek = "GRAM" | "ONS" | "KG" | string;

export interface PiyasaPanoSatir {
  kod: string;
  ad?: string;
  bolum?: string;
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

export interface PiyasaPano {
  server_now: string;
  olcek?: string | null;
  kaynak?: string;
  gecikmeli?: boolean;
  referans_ibaresi?: string;
  banner?: string | null;
  satirlar: PiyasaPanoSatir[];
}

export interface OpsMarjPolitikasi {
  id: number;
  anahtar: string;
  marj_modu: "TL" | "YUZDE" | string;
  marj_orani: string;
  aktif: boolean;
  guncelleme?: string | null;
  server_now: string;
}

export interface OpsMarjPolitikasiPatchRequest {
  marj_modu?: "TL" | "YUZDE";
  marj_orani?: string;
  aktif?: boolean;
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


