"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { piyasaService } from "../services";
import type {
  FirmaPanoTercihPatch,
  MarjKuraliWriteRequest,
  OpsMarjPolitikasiPatchRequest,
  PiyasaOlcek,
} from "../types";

export const piyasaKeys = {
  all: ["piyasa"] as const,
  pano: (olcek?: PiyasaOlcek) =>
    [...piyasaKeys.all, "pano", olcek ?? "ALL"] as const,
  tercih: () => [...piyasaKeys.all, "tercih"] as const,
  marjPolitikasi: () => [...piyasaKeys.all, "ops-marj-politikasi"] as const,
  canli: () => [...piyasaKeys.all, "ops-canli"] as const,
  panoDetay: () => [...piyasaKeys.all, "ops-pano-detay"] as const,
  marjKurallari: (params?: Record<string, string | undefined>) =>
    [...piyasaKeys.all, "ops-marj-kurallari", params ?? {}] as const,
};

/** Canlı/LKG board — sağlıklıyken 30s; gecikme/kopukta 5s (müşteri boş fiyat görmesin). */
export function usePiyasaPano(olcek?: PiyasaOlcek) {
  return useQuery({
    queryKey: piyasaKeys.pano(olcek),
    queryFn: () => piyasaService.getPano(olcek),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || d.gecikmeli || d.kaynak === "LKG" || d.kaynak === "FAIL") {
        return 5_000;
      }
      return 30_000;
    },
    staleTime: 5_000,
  });
}

/**
 * Şerit + pano aynı canlılık durumu.
 * Geçici refetch hatası (elde eski veri varken) KOPUK sayılmaz.
 */
export function useLivePanoStatus(olcek?: PiyasaOlcek) {
  const q = usePiyasaPano(olcek);
  const hasData = Boolean(q.data);
  const kaynak = q.data?.kaynak;
  const hardError = Boolean(q.isError && !hasData);
  const isDown = hardError || kaynak === "FAIL";
  return {
    q,
    kaynak,
    gecikmeli: Boolean(q.data?.gecikmeli) || kaynak === "LKG",
    isDown,
    hidePrices: isDown,
    isLoading: q.isLoading && !hasData,
    isError: hardError,
  };
}

export function useFirmaPanoTercihQuery(enabled = true) {
  return useQuery({
    queryKey: piyasaKeys.tercih(),
    queryFn: () => piyasaService.getTercih(),
    enabled,
  });
}

export function useUpdateFirmaPanoTercihMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FirmaPanoTercihPatch) =>
      piyasaService.updateTercih(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
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

export function useOpsPanoDetayQuery(enabled = true) {
  return useQuery({
    queryKey: piyasaKeys.panoDetay(),
    queryFn: () => piyasaService.getOpsPanoDetay(),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled,
  });
}

export function useCreateOpsUrunMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import("../types").OpsPiyasaUrunCreate) =>
      piyasaService.createOpsUrun(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function usePatchOpsUrunMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: number | string;
      data: import("../types").OpsPiyasaUrunPatch;
    }) => piyasaService.patchOpsUrun(vars.id, vars.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function useDeleteOpsUrunMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => piyasaService.deleteOpsUrun(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function useTickerTopluMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticker_da_goster: boolean) =>
      piyasaService.setTickerToplu(ticker_da_goster),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
  });
}

export function usePanoGosterTopluMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aliciya_goster: boolean) =>
      piyasaService.setPanoGosterToplu(aliciya_goster),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: piyasaKeys.all });
    },
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


