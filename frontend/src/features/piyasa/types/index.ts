export type PiyasaOlcek = "GRAM" | "ONS" | "KG" | string;

export interface PiyasaPanoSatir {
  kod: string;
  ad?: string;
  fiyat: string;
  para_birimi: string;
  olcek?: PiyasaOlcek;
  kaynak: string;
  guncelleme?: string | null;
  banner?: string | null;
}

export interface PiyasaPano {
  server_now: string;
  olcek?: string | null;
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

