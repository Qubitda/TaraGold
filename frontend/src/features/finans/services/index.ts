import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  CariHesap,
  CreditCheckResponse,
  CreditInfo,
  FinanceSummary,
  LedgerEntry,
  OpsCariRow,
  OpsFinanceSummary,
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
  createPaymentIntent(orderId: number): Promise<PaymentIntent> {
    return apiFetch<PaymentIntent>("/payments/intents/", {
      method: "POST",
      body: { order_id: orderId },
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
