"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lojistikService, type LogisticsListParams } from "../services";
import type {
  CreateReturnRequest,
  DispatchShipmentRequest,
  PodRequest,
  ShipmentCreateRequest,
} from "../types";

export const lojistikKeys = {
  all: ["lojistik"] as const,
  opsShipments: (params?: LogisticsListParams) =>
    [...lojistikKeys.all, "ops-shipments", params || {}] as const,
  returns: (params?: LogisticsListParams) =>
    [...lojistikKeys.all, "returns", params || {}] as const,
  buyerShipments: (params?: LogisticsListParams) =>
    [...lojistikKeys.all, "buyer-shipments", params || {}] as const,
  buyerShipmentPod: (id: number | string) =>
    [...lojistikKeys.all, "buyer-pod", String(id)] as const,
};

function invalidateLojistik(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: lojistikKeys.all });
}

export function useOpsShipmentsQuery(enabled = true) {
  return useQuery({
    queryKey: lojistikKeys.opsShipments(),
    queryFn: async () => {
      const page = await lojistikService.getShipments();
      return page.results ?? [];
    },
    enabled,
  });
}

export function useOpsShipmentsPageQuery(
  params?: LogisticsListParams,
  enabled = true
) {
  return useQuery({
    queryKey: lojistikKeys.opsShipments(params),
    queryFn: () => lojistikService.getShipments(params),
    enabled,
  });
}

export function useBuyerShipmentsQuery(enabled = true) {
  return useQuery({
    queryKey: lojistikKeys.buyerShipments(),
    queryFn: async () => {
      const page = await lojistikService.getBuyerShipments();
      return page.results ?? [];
    },
    enabled,
  });
}

export function useBuyerShipmentsPageQuery(
  params?: LogisticsListParams,
  enabled = true
) {
  return useQuery({
    queryKey: lojistikKeys.buyerShipments(params),
    queryFn: () => lojistikService.getBuyerShipments(params),
    enabled,
  });
}

export function useBuyerShipmentPodQuery(
  id: number | null,
  enabled = true
) {
  return useQuery({
    queryKey: lojistikKeys.buyerShipmentPod(id ?? 0),
    queryFn: () => lojistikService.getBuyerShipmentPod(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useReturnsQuery(enabled = true) {
  return useQuery({
    queryKey: lojistikKeys.returns(),
    queryFn: async () => {
      const page = await lojistikService.getReturns();
      return page.results ?? [];
    },
    enabled,
  });
}

export function useReturnsPageQuery(
  params?: LogisticsListParams,
  enabled = true
) {
  return useQuery({
    queryKey: lojistikKeys.returns(params),
    queryFn: () => lojistikService.getReturns(params),
    enabled,
  });
}

export function usePrepareShipmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.prepareShipment(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useDispatchShipmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: DispatchShipmentRequest;
    }) => lojistikService.dispatchShipment(id, data),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useDeliverShipmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.deliverShipment(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useCancelShipmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.cancelShipment(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useSubmitPodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PodRequest }) =>
      lojistikService.submitPod(id, data),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useSubmitBuyerPodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PodRequest }) =>
      lojistikService.submitBuyerPod(id, data),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useCreateShipmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ShipmentCreateRequest) =>
      lojistikService.createShipment(data),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useCreateReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReturnRequest) =>
      lojistikService.createReturn(data),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useSubmitReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.submitReturn(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useApproveReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.approveReturn(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useRejectReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      lojistikService.rejectReturn(id, reason),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useCancelReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.cancelReturn(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}

export function useMahsupReturnMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lojistikService.mahsupReturn(id),
    onSuccess: () => invalidateLojistik(qc),
  });
}
