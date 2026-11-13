"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResults } from "@/lib/api/client";
import { finansService } from "../services";
import type {
  ElleTahsilatRequest,
  ElleTedarikciOdemeRequest,
} from "../types";

export const finansKeys = {
  all: ["finans"] as const,
  me: (pb = "TRY") => [...finansKeys.all, "me", pb] as const,
  credit: (pb = "TRY") => [...finansKeys.all, "credit", pb] as const,
  cari: () => [...finansKeys.all, "cari"] as const,
  cariDetail: (id: number | string) =>
    [...finansKeys.all, "cari-detail", String(id)] as const,
  ledger: () => [...finansKeys.all, "ledger"] as const,
  ops: () => [...finansKeys.all, "ops"] as const,
  opsCari: () => [...finansKeys.all, "ops-cari"] as const,
  opsLedger: () => [...finansKeys.all, "ops-ledger"] as const,
  opsPayments: () => [...finansKeys.all, "ops-payments"] as const,
  opsHakEdis: (durum = "") => [...finansKeys.all, "ops-hak-edis", durum] as const,
};

export function useFinanceMeQuery(paraBirimi = "TRY", enabled = true) {
  return useQuery({
    queryKey: finansKeys.me(paraBirimi),
    queryFn: () => finansService.getMyFinance(paraBirimi),
    enabled,
  });
}

export function useCreditQuery(paraBirimi = "TRY", enabled = true) {
  return useQuery({
    queryKey: finansKeys.credit(paraBirimi),
    queryFn: () => finansService.getMyCredit(paraBirimi),
    enabled,
  });
}

export function useCheckCreditMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tutar,
      para_birimi = "TRY",
    }: {
      tutar: string;
      para_birimi?: string;
    }) => finansService.checkCredit(tutar, para_birimi),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finansKeys.all });
    },
  });
}

export function useCariListQuery(enabled = true) {
  return useQuery({
    queryKey: finansKeys.cari(),
    queryFn: async () => unwrapResults(await finansService.getCariList()),
    enabled,
  });
}

export function useCariDetailQuery(id: number | null, enabled = true) {
  return useQuery({
    queryKey: finansKeys.cariDetail(id ?? 0),
    queryFn: () => finansService.getCariDetail(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useLedgerQuery(enabled = true) {
  return useQuery({
    queryKey: finansKeys.ledger(),
    queryFn: async () => unwrapResults(await finansService.getLedger()),
    enabled,
  });
}

export function useOpsFinanceQuery(enabled = false) {
  return useQuery({
    queryKey: finansKeys.ops(),
    queryFn: () => finansService.getOpsFinance(),
    enabled,
  });
}

export function useOpsFinanceCariQuery(enabled = false) {
  return useQuery({
    queryKey: finansKeys.opsCari(),
    queryFn: async () => unwrapResults(await finansService.getOpsFinanceCari()),
    enabled,
  });
}

export function useOpsFinanceLedgerQuery(enabled = false) {
  return useQuery({
    queryKey: finansKeys.opsLedger(),
    queryFn: async () =>
      unwrapResults(await finansService.getOpsFinanceLedger()),
    enabled,
  });
}

export function useOpsFinancePaymentsQuery(enabled = false) {
  return useQuery({
    queryKey: finansKeys.opsPayments(),
    queryFn: async () =>
      unwrapResults(await finansService.getOpsFinancePayments()),
    enabled,
  });
}

export function useOpsFinanceHakEdisQuery(enabled = false, durum = "") {
  return useQuery({
    queryKey: finansKeys.opsHakEdis(durum),
    queryFn: async () =>
      unwrapResults(
        await finansService.getOpsFinanceHakEdis(durum ? { durum } : undefined)
      ),
    enabled,
  });
}

export function useElleTahsilatMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      data,
    }: {
      orderId: number;
      data: ElleTahsilatRequest;
    }) => finansService.recordElleTahsilat(orderId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finansKeys.all });
    },
  });
}

export function useElleTedarikciOdemeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ElleTedarikciOdemeRequest) =>
      finansService.recordElleTedarikciOdeme(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finansKeys.all });
    },
  });
}
