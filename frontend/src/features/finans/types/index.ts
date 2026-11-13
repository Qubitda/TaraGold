import type { components } from "@/lib/api/schema";

export type FinanceSummary = components["schemas"]["BuyerFinanceSummary"];
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
