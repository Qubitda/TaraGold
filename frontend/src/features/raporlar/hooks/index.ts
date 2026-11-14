"use client";

import { useQuery } from "@tanstack/react-query";
import { raporlarService } from "../services";

export const raporlarKeys = {
  all: ["raporlar"] as const,
  commercial: (from: string, to: string) =>
    [...raporlarKeys.all, "commercial", from, to] as const,
  behavior: (from: string, to: string, aliciFirmaId?: number | null) =>
    [...raporlarKeys.all, "behavior", from, to, aliciFirmaId ?? "self"] as const,
  anomaly: (esik: string) => [...raporlarKeys.all, "anomaly", esik] as const,
};

export function useCommercialOrdersQuery(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: raporlarKeys.commercial(dateFrom, dateTo),
    queryFn: () =>
      raporlarService.getCommercialOrders({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled,
  });
}

export function useBuyerBehaviorQuery(
  dateFrom: string,
  dateTo: string,
  enabled = true,
  aliciFirmaId?: number | null
) {
  return useQuery({
    queryKey: raporlarKeys.behavior(dateFrom, dateTo, aliciFirmaId),
    queryFn: () =>
      raporlarService.getBuyerBehavior({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        alici_firma_id: aliciFirmaId ?? undefined,
      }),
    enabled,
  });
}

export function useRevenueAnomaliesQuery(esikCiro: string, enabled = true) {
  return useQuery({
    queryKey: raporlarKeys.anomaly(esikCiro),
    queryFn: () => raporlarService.getRevenueAnomalies(esikCiro),
    enabled: enabled && Boolean(esikCiro.trim()),
  });
}
