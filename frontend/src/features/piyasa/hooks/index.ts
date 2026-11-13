"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { piyasaService } from "../services";
import type { OpsMarjPolitikasiPatchRequest, PiyasaOlcek } from "../types";

export const piyasaKeys = {
  all: ["piyasa"] as const,
  pano: (olcek?: PiyasaOlcek) =>
    [...piyasaKeys.all, "pano", olcek ?? "ALL"] as const,
  marjPolitikasi: () => [...piyasaKeys.all, "ops-marj-politikasi"] as const,
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

