"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stokService } from "../services";
import type { StockAdjustmentRequest, WarehouseWriteRequest } from "../types";

export const stokKeys = {
  all: ["stok"] as const,
  supplier: (params?: Record<string, string | undefined>) =>
    [...stokKeys.all, "supplier", params ?? {}] as const,
  warehouses: (params?: Record<string, string | undefined>) =>
    [...stokKeys.all, "warehouses", params ?? {}] as const,
};

export function useSupplierWarehousesPageQuery(
  params?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: stokKeys.warehouses(params),
    queryFn: () => stokService.getWarehouses(params),
    enabled,
  });
}

export function useSupplierWarehousesQuery(enabled = true) {
  return useQuery({
    queryKey: stokKeys.warehouses(),
    queryFn: () => stokService.listWarehouses({ page_size: "100" }),
    enabled,
  });
}

export function useSupplierStockPageQuery(
  params?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: stokKeys.supplier(params),
    queryFn: () => stokService.getSupplierStock(params),
    enabled,
  });
}

export function useSupplierStockQuery(enabled = true) {
  return useQuery({
    queryKey: stokKeys.supplier(),
    queryFn: () => stokService.listSupplierStock({ page_size: "100" }),
    enabled,
  });
}

export function useCreateWarehouseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WarehouseWriteRequest) => stokService.createWarehouse(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: stokKeys.all });
    },
  });
}

export function useUpdateWarehouseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number | string;
      data: Partial<WarehouseWriteRequest>;
    }) => stokService.updateWarehouse(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: stokKeys.all });
    },
  });
}

export function useDeleteWarehouseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => stokService.deleteWarehouse(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: stokKeys.all });
    },
  });
}

export function useAdjustStockMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StockAdjustmentRequest) => stokService.adjustStock(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: stokKeys.all });
    },
  });
}
