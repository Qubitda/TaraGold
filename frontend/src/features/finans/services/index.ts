import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  CariHesap,
  CreditCheckResponse,
  CreditInfo,
  ElleTahsilatRequest,
  ElleTahsilatResponse,
  ElleTedarikciOdemeRequest,
  ElleTedarikciOdemeResponse,
  FinanceSummary,
  LedgerEntry,
  OpsCariRow,
  OpsFinanceSummary,
  OpsHakEdisRow,
  OpsLedgerRow,
  OpsPaymentRow,
  PaymentIntent,
} from "../types";

export const finansService = {
  getMyFinance(paraBirimi = "TRY"): Promise<FinanceSummary> {
    return apiFetch<FinanceSummary>(
      `/finance/me/?para_birimi=${encodeURIComponent(paraBirimi)}`
    );
  },
  getMyCredit(paraBirimi = "TRY"): Promise<CreditInfo> {
    return apiFetch<CreditInfo>(
      `/credit/me/?para_birimi=${encodeURIComponent(paraBirimi)}`
    );
  },
  checkCredit(
    tutar: string,
    paraBirimi = "TRY"
  ): Promise<CreditCheckResponse> {
    return apiFetch<CreditCheckResponse>("/credit/check/", {
      method: "POST",
      body: { tutar, para_birimi: paraBirimi },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getCariList(params?: Record<string, string>): Promise<Paginated<CariHesap>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<Paginated<CariHesap>>(`/finance/cari/${query}`);
  },
  getCariDetail(id: number | string): Promise<CariHesap> {
    return apiFetch<CariHesap>(`/finance/cari/${id}/`);
  },
  getLedger(params?: Record<string, string>): Promise<Paginated<LedgerEntry>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<Paginated<LedgerEntry>>(`/finance/ledger/${query}`);
  },
  createPaymentIntent(orderId: number): Promise<PaymentIntent> {
    return apiFetch<PaymentIntent>("/payments/intents/", {
      method: "POST",
      body: { order_id: orderId },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getOpsFinance(): Promise<OpsFinanceSummary> {
    return apiFetch<OpsFinanceSummary>("/ops/finance/");
  },
  getOpsFinanceCari(): Promise<Paginated<OpsCariRow>> {
    return apiFetch<Paginated<OpsCariRow>>("/ops/finance/cari/");
  },
  getOpsFinanceLedger(): Promise<Paginated<OpsLedgerRow>> {
    return apiFetch<Paginated<OpsLedgerRow>>("/ops/finance/ledger/");
  },
  getOpsFinancePayments(): Promise<Paginated<OpsPaymentRow>> {
    return apiFetch<Paginated<OpsPaymentRow>>("/ops/finance/payments/");
  },
  getOpsFinanceHakEdis(params?: {
    durum?: string;
    tedarikci_firma_id?: number;
    order_id?: number;
  }): Promise<Paginated<OpsHakEdisRow>> {
    const search = new URLSearchParams();
    if (params?.durum) search.set("durum", params.durum);
    if (params?.tedarikci_firma_id)
      search.set("tedarikci_firma_id", String(params.tedarikci_firma_id));
    if (params?.order_id) search.set("order_id", String(params.order_id));
    const q = search.toString() ? `?${search.toString()}` : "";
    return apiFetch<Paginated<OpsHakEdisRow>>(`/ops/finance/hak-edis/${q}`);
  },
  recordElleTahsilat(
    orderId: number,
    data: ElleTahsilatRequest
  ): Promise<ElleTahsilatResponse> {
    return apiFetch<ElleTahsilatResponse>(`/ops/orders/${orderId}/tahsilat/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  recordElleTedarikciOdeme(
    data: ElleTedarikciOdemeRequest
  ): Promise<ElleTedarikciOdemeResponse> {
    return apiFetch<ElleTedarikciOdemeResponse>("/ops/finance/tedarikci-odeme/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
