"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { piyasaService } from "../services";
import type {
  MarjKuraliWriteRequest,
  OpsMarjPolitikasiPatchRequest,
  PiyasaOlcek,
} from "../types";

export const piyasaKeys = {
  all: ["piyasa"] as const,
  pano: (olcek?: PiyasaOlcek) =>
    [...piyasaKeys.all, "pano", olcek ?? "ALL"] as const,
  marjPolitikasi: () => [...piyasaKeys.all, "ops-marj-politikasi"] as const,
  canli: () => [...piyasaKeys.all, "ops-canli"] as const,
  marjKurallari: (params?: Record<string, string | undefined>) =>
    [...piyasaKeys.all, "ops-marj-kurallari", params ?? {}] as const,
};

/** Canlı/LKG board — 30s refetch; marj alanı yok. */
export function usePiyasaPano(olcek?: PiyasaOlcek) {
  return useQuery({
    queryKey: piyasaKeys.pano(olcek),
    queryFn: () => piyasaService.getPano(olcek),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useOpsMarjPolitikasiQuery(enabled = true) {
  return useQuery({
    queryKey: piyasaKeys.marjPolitikasi(),
    queryFn: () => piyasaService.getOpsMarjPolitikasi(),
    enabled,
  });
}

export function useUpdateOpsMarjPolitikasiMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OpsMarjPolitikasiPatchRequest) =>
      piyasaService.updateOpsMarjPolitikasi(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function useOpsCanliPiyasaQuery(enabled = true) {
  return useQuery({
    queryKey: piyasaKeys.canli(),
    queryFn: () => piyasaService.getOpsCanliPiyasa(),
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled,
  });
}

export function useMarjKurallariQuery(
  params?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: piyasaKeys.marjKurallari(params),
    queryFn: () => piyasaService.getMarjKurallari(params),
    enabled,
  });
}

export function useCreateMarjKuraliMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MarjKuraliWriteRequest) => piyasaService.createMarjKurali(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function useUpdateMarjKuraliMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number | string; data: Partial<MarjKuraliWriteRequest> }) =>
      piyasaService.updateMarjKurali(vars.id, vars.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function useDeleteMarjKuraliMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => piyasaService.deleteMarjKurali(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}


