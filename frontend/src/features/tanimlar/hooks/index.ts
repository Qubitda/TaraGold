"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tanimlarService } from "../services";
import type { OpsDefinitionKaynak } from "../types";

export const tanimlarKeys = {
  all: ["tanimlar"] as const,
  salesChannels: () => [...tanimlarKeys.all, "sales-channels"] as const,
  opsDef: (kaynak: OpsDefinitionKaynak) =>
    [...tanimlarKeys.all, "ops-def", kaynak] as const,
};

export function useSalesChannelsQuery(enabled = true) {
  return useQuery({
    queryKey: tanimlarKeys.salesChannels(),
    queryFn: () => tanimlarService.getSalesChannelsPage(),
    enabled,
  });
}

/** Tanımlar ekranı uyumluluk sarmalayıcısı. */
export function useSalesChannels() {
  const q = useSalesChannelsQuery();
  return {
    page: q.data ?? null,
    channels: q.data?.results ?? [],
    loading: q.isLoading,
    error: q.isError
      ? q.error instanceof Error
        ? q.error.message
        : "Tanım verileri alınamadı."
      : null,
    refresh: () => void q.refetch(),
  };
}

export function useOpsDefinitionsQuery(
  kaynak: OpsDefinitionKaynak | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: tanimlarKeys.opsDef(kaynak ?? "fiyat-gruplari"),
    queryFn: () => tanimlarService.getOpsDefinitions(kaynak!, true),
    enabled: Boolean(kaynak) && enabled,
  });
}

export function useCreateOpsDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      kaynak: OpsDefinitionKaynak;
      body: Record<string, unknown>;
    }) => tanimlarService.createOpsDefinition(vars.kaynak, vars.body),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: tanimlarKeys.opsDef(vars.kaynak) });
    },
  });
}

export function useUpdateOpsDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      kaynak: OpsDefinitionKaynak;
      id: number | string;
      body: Record<string, unknown>;
    }) => tanimlarService.updateOpsDefinition(vars.kaynak, vars.id, vars.body),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: tanimlarKeys.opsDef(vars.kaynak) });
    },
  });
}

export function useDeleteOpsDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { kaynak: OpsDefinitionKaynak; id: number | string }) =>
      tanimlarService.deleteOpsDefinition(vars.kaynak, vars.id),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: tanimlarKeys.opsDef(vars.kaynak) });
    },
  });
}

