/**
 * Normatif belgeler tipleri — /api/v1/belgeler/, /belgeler/<id>/download/, /ops/belge-ayarlari/
 * ve sevkiyat/POD/sipariş/ledger/iade/kalite kayıtları.
 */

export type DocumentSource =
  | "belge"
  | "shipment"
  | "ops_shipment"
  | "order"
  | "ledger"
  | "return"
  | "inspection";

export type DocumentCategory =
  | "PROFORMA"
  | "IRSALIYE"
  | "TEDARIKCI_IRSALIYE"
  | "TAS_SERTIFIKA"
  | "SEVKIYAT"
  | "POD"
  | "SIPARIS"
  | "LEDGER"
  | "IADE"
  | "KALITE"
  | "DIGER";

export interface DocumentItem {
  id: string;
  belge_tipi: DocumentCategory | string;
  ad: string;
  belge_no?: string;
  firma_ad?: string;
  durum?: string;
  /** Doğrudan indirilebilir PDF API yolu veya harici http(s) URL */
  dosya_url?: string;
  raw_ref?: string;
  referans_tipi: DocumentSource;
  referans_id: number;
  related_order_id?: number | null;
  olusturma_tarihi?: string;
  format?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
  allowed_actions?: string[];
  href?: string;
}

export interface BackendDocumentRow {
  id: number;
  firma_id: number;
  firma_ad?: string;
  tip: string;
  baslik: string;
  content_type?: string;
  byte_size?: number;
  order_id?: number | null;
  revizyon?: number | null;
  belge_turu?: string;
  download_url?: string;
  olusturma_tarihi?: string | null;
}

export interface BelgeAyarlari {
  proforma_disclaimer: string;
  irsaliye_baslik: string;
  irsaliye_alt_metin: string;
  guncelleme_tarihi?: string | null;
}

export interface PodAttachRequest {
  shipment_id: number;
  teslim_alan: string;
  notlar?: string;
  belgeler_ref?: string;
}

export interface DocumentsSnapshot {
  items: DocumentItem[];
  errors: Partial<Record<DocumentSource, string>>;
}
