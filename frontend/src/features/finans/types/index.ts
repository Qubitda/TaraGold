import type { components } from "@/lib/api/schema";

export type FinanceSummary = components["schemas"]["BuyerFinanceSummary"] & {
  credit?: CreditInfo | null;
  payment_intents?: PaymentIntent[];
};
export type CariHesap = components["schemas"]["BuyerCari"];
export type LedgerEntry = components["schemas"]["BuyerLedger"];
export type CreditInfo = components["schemas"]["BuyerCredit"];
export type PaymentIntent = components["schemas"]["BuyerPaymentIntent"] & {
  order_id?: number;
};
export type OpsFinanceSummary = components["schemas"]["OpsFinanceSummary"];

export type CreditCheckResponse = {
  ok: boolean;
  credit: CreditInfo;
};

export type OpsCariRow = {
  id: number;
  firma_id: number;
  karsi_firma_id?: number | null;
  para_birimi: string;
  bakiye: string;
  kredi_limiti?: string | null;
  guncelleme_tarihi?: string | null;
};

export type OpsLedgerRow = {
  id: number;
  firma_id: number;
  karsi_firma_id?: number | null;
  yon: string;
  tutar: string;
  para_birimi: string;
  hareket_tipi: string;
  referans_tip?: string | null;
  referans_id?: number | null;
  olusturma_tarihi?: string | null;
};

export type OpsPaymentRow = {
  id: number;
  order_id: number;
  alici_firma_id: number;
  durum: string;
  tutar: string;
  para_birimi: string;
  olusturma_tarihi?: string | null;
};

export type OpsHakEdisRow = {
  id: number;
  order_id: number;
  quality_inspection_id?: number | null;
  tedarikci_firma_id: number;
  tedarikci_firma_ad?: string;
  durum: string;
  gram: string;
  tutar: string | null;
  para_birimi: string;
  vade_tarihi?: string | null;
  hak_edis_tarihi?: string | null;
  odeme_tarihi?: string | null;
  odeme_ledger_entry_id?: number | null;
  aciklama?: string;
  olusturma_tarihi?: string | null;
};

export type ElleTahsilatRequest = {
  tutar: string;
  yontem: string;
  para_birimi?: string;
  dekont_ref?: string;
  aciklama?: string;
};

export type ElleTahsilatResponse = {
  ledger_entry_id: number;
  tutar: string;
  para_birimi: string;
};

export type ElleTedarikciOdemeRequest = {
  tedarikci_firma_id: number;
  hak_edis_id?: number;
  order_id?: number;
  tutar: string;
  yontem: string;
  para_birimi?: string;
  dekont_ref?: string;
  aciklama?: string;
};

export type ElleTedarikciOdemeResponse = {
  ledger_entry_id: number;
  tutar: string;
  para_birimi: string;
  tedarikci_firma_id: number;
  hak_edis: OpsHakEdisRow | null;
};
