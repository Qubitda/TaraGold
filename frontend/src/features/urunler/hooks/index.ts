"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { urunlerService } from "../services";
import type {
  CategoryWriteRequest,
  OpsProductCreateRequest,
  OpsProductUpdateRequest,
  OpsProductVariantCreateRequest,
  OpsProductVariantUpdateRequest,
} from "../types";

export const urunlerKeys = {
  all: ["urunler"] as const,
  catalog: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "catalog", filters ?? {}] as const,
  catalogDetail: (id: number | string) =>
    [...urunlerKeys.all, "catalog", "detail", String(id)] as const,
  categories: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "categories", filters ?? {}] as const,
  opsCategories: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "ops-categories", filters ?? {}] as const,
  catalogRefs: () => [...urunlerKeys.all, "catalog-refs"] as const,
  catalogRefItems: (kaynak: string, q?: string) =>
    [...urunlerKeys.all, "catalog-ref-items", kaynak, q ?? ""] as const,
  monturler: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "monturler", filters ?? {}] as const,
  taslar: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "taslar", filters ?? {}] as const,
  ops: (filters?: Record<string, string | undefined>) =>
    [...urunlerKeys.all, "ops", filters ?? {}] as const,
  opsDetail: (id: number | string) =>
    [...urunlerKeys.all, "ops", "detail", String(id)] as const,
  opsProductChannels: (id: number | string) =>
    [...urunlerKeys.all, "ops", "channels", String(id)] as const,
};

export function useCatalogQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.catalog(filters),
    queryFn: () => urunlerService.getCatalog(filters),
    enabled,
  });
}

export function useCatalogDetailQuery(id: number | string | undefined, enabled = true) {
  return useQuery({
    queryKey: urunlerKeys.catalogDetail(id ?? ""),
    queryFn: () => urunlerService.getProductDetail(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useCategoriesQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.categories(filters),
    queryFn: () => urunlerService.getCategories(filters),
    enabled,
  });
}

export function useOpsCategoriesQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.opsCategories(filters),
    queryFn: () => urunlerService.getOpsCategories(filters),
    enabled,
  });
}

export function useCatalogRefsQuery(enabled = true) {
  return useQuery({
    queryKey: urunlerKeys.catalogRefs(),
    queryFn: () => urunlerService.getCatalogRefs(),
    enabled,
  });
}

export function useCatalogRefItemsQuery(
  kaynak: string,
  q?: string,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.catalogRefItems(kaynak, q),
    queryFn: () =>
      urunlerService.getCatalogRefItems(kaynak, {
        q: q || undefined,
        include_inactive: "1",
      }),
    enabled: Boolean(kaynak) && enabled,
  });
}

export function useMonturlerQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.monturler(filters),
    queryFn: () => urunlerService.getMonturler(filters),
    enabled,
  });
}

export function useTaslarQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.taslar(filters),
    queryFn: () => urunlerService.getTaslar(filters),
    enabled,
  });
}

export function useOpsProductsQuery(
  filters?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.ops(filters),
    queryFn: () => urunlerService.getOpsProducts(filters),
    enabled,
  });
}

export function useOpsProductQuery(id: number | string | undefined, enabled = true) {
  return useQuery({
    queryKey: urunlerKeys.opsDetail(id ?? ""),
    queryFn: () => urunlerService.getOpsProduct(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useOpsProductChannelsQuery(
  id: number | string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: urunlerKeys.opsProductChannels(id ?? ""),
    queryFn: () => urunlerService.getOpsProductChannels(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateOpsCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CategoryWriteRequest) => urunlerService.createOpsCategory(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useUpdateOpsCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number | string; data: Partial<CategoryWriteRequest> }) =>
      urunlerService.updateOpsCategory(vars.id, vars.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useDeleteOpsCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => urunlerService.deleteOpsCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useCreateCatalogRefMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => urunlerService.createCatalogRef(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useUpdateCatalogRefMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      kaynak: string;
      id: number | string;
      body: Record<string, unknown>;
    }) => urunlerService.updateCatalogRef(vars.kaynak, vars.id, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useDeleteCatalogRefMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { kaynak: string; id: number | string }) =>
      urunlerService.deleteCatalogRef(vars.kaynak, vars.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useCreateOpsProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OpsProductCreateRequest) =>
      urunlerService.createOpsProduct(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useUpdateOpsProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number | string; data: OpsProductUpdateRequest }) =>
      urunlerService.updateOpsProduct(vars.id, vars.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useDeleteOpsProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => urunlerService.deleteOpsProduct(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}

export function useOpsProductActionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      action:
        | "submit"
        | "approve"
        | "reject"
        | "publish"
        | "unpublish"
        | "addVariant"
        | "updateVariant"
        | "deleteVariant"
        | "setChannel";
      id: number | string;
      variantId?: number | string;
      neden?: string;
      variant?: OpsProductVariantCreateRequest;
      variantUpdate?: OpsProductVariantUpdateRequest;
      durum?: string;
      kanalId?: number;
      kanalAktif?: boolean;
    }) => {
      switch (input.action) {
        case "submit":
          return urunlerService.submitOpsProduct(input.id);
        case "approve":
          return urunlerService.approveOpsProduct(input.id);
        case "reject":
          return urunlerService.rejectOpsProduct(input.id, input.neden || "");
        case "publish":
          return urunlerService.publishOpsProduct(input.id, input.durum);
        case "unpublish":
          return urunlerService.unpublishOpsProduct(input.id);
        case "addVariant":
          return urunlerService.addOpsVariant(input.id, input.variant!);
        case "updateVariant":
          return urunlerService.updateOpsVariant(
            input.id,
            input.variantId!,
            input.variantUpdate!
          );
        case "deleteVariant":
          return urunlerService.deleteOpsVariant(input.id, input.variantId!);
        case "setChannel":
          return urunlerService.setOpsProductChannel(
            input.id,
            input.kanalId!,
            Boolean(input.kanalAktif)
          );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urunlerKeys.all });
    },
  });
}
