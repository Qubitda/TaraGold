import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type {
  BuyerCatalogPage,
  BuyerCatalogDetail,
  CatalogRefItem,
  CatalogRefsResponse,
  CatalogRefsSinglePage,
  CategoryItem,
  CategoryPage,
  CategoryWriteRequest,
  MonturlerPage,
  OpsProduct,
  OpsProductChannelItem,
  OpsProductPage,
  OpsProductCreateRequest,
  OpsProductUpdateRequest,
  OpsProductVariant,
  OpsProductVariantCreateRequest,
  OpsProductVariantUpdateRequest,
  TaslarPage,
} from "../types";

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const urunlerService = {
  getCatalog(params?: Record<string, string | undefined>): Promise<BuyerCatalogPage> {
    return apiFetch<BuyerCatalogPage>(`/catalog/${qs(params)}`);
  },
  getProductDetail(id: number | string): Promise<BuyerCatalogDetail> {
    return apiFetch<BuyerCatalogDetail>(`/catalog/${id}/`);
  },
  getMonturler(params?: Record<string, string | undefined>): Promise<MonturlerPage> {
    return apiFetch<MonturlerPage>(`/catalog/monturler/${qs(params)}`);
  },
  getTaslar(params?: Record<string, string | undefined>): Promise<TaslarPage> {
    return apiFetch<TaslarPage>(`/catalog/taslar/${qs(params)}`);
  },

  // Categories & Refs
  getCategories(params?: Record<string, string | undefined>): Promise<CategoryPage> {
    return apiFetch<CategoryPage>(`/categories/${qs(params)}`);
  },
  getOpsCategories(params?: Record<string, string | undefined>): Promise<CategoryPage> {
    return apiFetch<CategoryPage>(`/ops/categories/${qs(params)}`);
  },
  createOpsCategory(data: CategoryWriteRequest): Promise<CategoryItem> {
    return apiFetch<CategoryItem>("/ops/categories/", {
      method: "POST",
      body: data,
    });
  },
  updateOpsCategory(
    id: number | string,
    data: Partial<CategoryWriteRequest>
  ): Promise<CategoryItem> {
    return apiFetch<CategoryItem>(`/ops/categories/${id}/`, {
      method: "PATCH",
      body: data,
    });
  },
  deleteOpsCategory(id: number | string): Promise<{ deleted: boolean; id: number }> {
    return apiFetch<{ deleted: boolean; id: number }>(`/ops/categories/${id}/`, {
      method: "DELETE",
    });
  },
  getCatalogRefs(params?: Record<string, string | undefined>): Promise<CatalogRefsResponse> {
    return apiFetch<CatalogRefsResponse>(`/ops/catalog-refs/${qs(params)}`);
  },
  getCatalogRefItems(
    kaynak: string,
    params?: { q?: string; include_inactive?: string }
  ): Promise<CatalogRefsSinglePage> {
    return apiFetch<CatalogRefsSinglePage>(
      `/ops/catalog-refs/${qs({ kaynak, include_inactive: params?.include_inactive ?? "1", q: params?.q })}`
    );
  },
  createCatalogRef(body: Record<string, unknown>): Promise<CatalogRefItem> {
    return apiFetch<CatalogRefItem>("/ops/catalog-refs/", {
      method: "POST",
      body,
    });
  },
  updateCatalogRef(
    kaynak: string,
    id: number | string,
    body: Record<string, unknown>
  ): Promise<CatalogRefItem> {
    return apiFetch<CatalogRefItem>(`/ops/catalog-refs/${kaynak}/${id}/`, {
      method: "PATCH",
      body,
    });
  },
  deleteCatalogRef(
    kaynak: string,
    id: number | string
  ): Promise<{ deleted: boolean; id: number; kaynak: string }> {
    return apiFetch<{ deleted: boolean; id: number; kaynak: string }>(
      `/ops/catalog-refs/${kaynak}/${id}/`,
      { method: "DELETE" }
    );
  },

  // Ops Products & Variants & Channels
  getOpsProducts(params?: Record<string, string | undefined>): Promise<OpsProductPage> {
    return apiFetch<OpsProductPage>(`/ops/products/${qs(params)}`);
  },
  getOpsProduct(id: number | string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/`);
  },
  createOpsProduct(data: OpsProductCreateRequest): Promise<OpsProduct> {
    return apiFetch<OpsProduct>("/ops/products/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  updateOpsProduct(
    id: number | string,
    data: OpsProductUpdateRequest
  ): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/`, {
      method: "PATCH",
      body: data,
    });
  },
  deleteOpsProduct(id: number | string): Promise<{ deleted: boolean; id: number }> {
    return apiFetch<{ deleted: boolean; id: number }>(`/ops/products/${id}/`, {
      method: "DELETE",
    });
  },
  addOpsVariant(
    productId: number | string,
    data: OpsProductVariantCreateRequest
  ): Promise<OpsProductVariant> {
    return apiFetch<OpsProductVariant>(`/ops/products/${productId}/variants/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  updateOpsVariant(
    productId: number | string,
    variantId: number | string,
    data: OpsProductVariantUpdateRequest
  ): Promise<OpsProductVariant> {
    return apiFetch<OpsProductVariant>(
      `/ops/products/${productId}/variants/${variantId}/`,
      { method: "PATCH", body: data }
    );
  },
  deleteOpsVariant(
    productId: number | string,
    variantId: number | string
  ): Promise<{ deleted: boolean; id: number }> {
    return apiFetch<{ deleted: boolean; id: number }>(
      `/ops/products/${productId}/variants/${variantId}/`,
      { method: "DELETE" }
    );
  },
  getOpsProductChannels(
    productId: number | string
  ): Promise<{ urun_id: number; results: OpsProductChannelItem[] }> {
    return apiFetch<{ urun_id: number; results: OpsProductChannelItem[] }>(
      `/ops/products/${productId}/channels/`
    );
  },
  setOpsProductChannel(
    productId: number | string,
    kanalId: number,
    aktif: boolean
  ): Promise<{ id: number; urun_id: number; kanal_id: number; aktif: boolean }> {
    return apiFetch(`/ops/products/${productId}/channels/`, {
      method: "POST",
      body: { kanal_id: kanalId, aktif },
    });
  },
  submitOpsProduct(id: number | string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/submit/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  approveOpsProduct(id: number | string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/approve/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  rejectOpsProduct(id: number | string, neden: string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/reject/`, {
      method: "POST",
      body: { neden },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  publishOpsProduct(id: number | string, durum = "aktif"): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/publish/`, {
      method: "POST",
      body: { durum },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  unpublishOpsProduct(id: number | string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/unpublish/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
