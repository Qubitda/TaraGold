"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tanimlarService } from "../services";
import type { OpsDefinitionKaynak } from "../types";

export const tanimlarKeys = {
  all: ["tanimlar"] as const,
  salesChannels: () => [...tanimlarKeys.all, "sales-channels"] as const,
  opsDef: (
    kaynak: OpsDefinitionKaynak,
    params?: Record<string, string | undefined>
  ) => [...tanimlarKeys.all, "ops-def", kaynak, params ?? {}] as const,
  channelProducts: (kanalId: number | string, params?: { q?: string; atanmis?: string }) =>
    [...tanimlarKeys.all, "channel-products", String(kanalId), params ?? {}] as const,
};

export function useSalesChannelsQuery(enabled = true) {
  return useQuery({
    queryKey: tanimlarKeys.salesChannels(),
    queryFn: () => tanimlarService.getSalesChannelsPage(),
    enabled,
  });
}

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
  enabled = true,
  params?: Record<string, string | undefined>
) {
  return useQuery({
    queryKey: tanimlarKeys.opsDef(kaynak ?? "fiyat-gruplari", params),
    queryFn: () => tanimlarService.getOpsDefinitions(kaynak!, true, params),
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
      void qc.invalidateQueries({ queryKey: tanimlarKeys.all });
      if (vars.kaynak === "satis-kanallari") {
        void qc.invalidateQueries({ queryKey: tanimlarKeys.salesChannels() });
      }
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
      void qc.invalidateQueries({ queryKey: tanimlarKeys.all });
      if (vars.kaynak === "satis-kanallari") {
        void qc.invalidateQueries({ queryKey: tanimlarKeys.salesChannels() });
      }
    },
  });
}

export function useDeleteOpsDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { kaynak: OpsDefinitionKaynak; id: number | string }) =>
      tanimlarService.deleteOpsDefinition(vars.kaynak, vars.id),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: tanimlarKeys.all });
      if (vars.kaynak === "satis-kanallari") {
        void qc.invalidateQueries({ queryKey: tanimlarKeys.salesChannels() });
      }
    },
  });
}

export function useChannelProductsQuery(
  kanalId: number | string | undefined,
  params?: { q?: string; atanmis?: string },
  enabled = true
) {
  return useQuery({
    queryKey: tanimlarKeys.channelProducts(kanalId ?? "", params),
    queryFn: () => tanimlarService.getChannelProducts(kanalId!, params),
    enabled: Boolean(kanalId) && enabled,
  });
}

export function useSetChannelProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { kanalId: number | string; urunId: number; aktif: boolean }) =>
      tanimlarService.setChannelProduct(vars.kanalId, vars.urunId, vars.aktif),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tanimlarKeys.all });
    },
  });
}

