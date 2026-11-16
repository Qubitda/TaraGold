import { ApiError, apiFetch, apiFetchBlob, newIdempotencyKey } from "@/lib/api/client";
import type {
  BuyerCatalogPage,
  BuyerCatalogDetail,
  BulkVariantError,
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
  OpsProductCreateResponse,
  OpsProductStone,
  OpsProductUpdateRequest,
  OpsProductVariant,
  OpsProductVariantCreateRequest,
  OpsProductVariantUpdateRequest,
  OpsProductStockResponse,
  PricePreviewResponse,
  ProductMediaItem,
  ProductReadiness,
  TaslarPage,
} from "../types";

/** Bulk varyant 400 gövdesinden satır hatalarını çıkar. */
export function parseBulkVariantErrors(err: unknown): BulkVariantError[] {
  if (!(err instanceof ApiError)) return [];
  const errors = err.problem.errors;
  if (!errors || typeof errors !== "object") return [];
  const raw = (errors as Record<string, unknown>).satir_hatalari;
  if (!Array.isArray(raw)) {
    // Geriye uyum: { satirlar: "Satır N: …" }
    const flat = (errors as Record<string, unknown>).satirlar;
    if (typeof flat === "string") {
      const m = /Satır\s+(\d+)\s*:\s*(.*)/i.exec(flat);
      if (m) {
        return [
          {
            satir_index: Math.max(0, Number(m[1]) - 1),
            alan: "satir",
            detail: m[2] || flat,
          },
        ];
      }
      return [{ satir_index: 0, alan: "satirlar", detail: flat }];
    }
    return [];
  }
  return raw
    .map((row): BulkVariantError | null => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const idx = Number(r.satir_index);
      if (!Number.isFinite(idx)) return null;
      return {
        satir_index: idx,
        alan: String(r.alan || "satir"),
        detail: String(r.detail || ""),
      };
    })
    .filter((x): x is BulkVariantError => x != null);
}

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
  /**
   * Seçici listeleri — varsayılan yalnız aktif=true (include_inactive gönderme).
   * Pasif kayıtlar için `include_inactive=1` geç.
   */
  getCatalogRefs(params?: Record<string, string | undefined>): Promise<CatalogRefsResponse> {
    const next = { ...params };
    // Seçiciler pasif görmesin; açıkça istenmedikçe include_inactive silinir
    if (next.include_inactive !== "1" && next.include_inactive !== "true") {
      delete next.include_inactive;
    }
    return apiFetch<CatalogRefsResponse>(`/ops/catalog-refs/${qs(next)}`);
  },
  getCatalogRefItems(
    kaynak: string,
    params?: { q?: string; include_inactive?: string }
  ): Promise<CatalogRefsSinglePage> {
    // Tanımlar paneli: pasifler de (varsayılan include_inactive=1)
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
  createOpsProduct(data: OpsProductCreateRequest): Promise<OpsProductCreateResponse> {
    return apiFetch<OpsProductCreateResponse>("/ops/products/", {
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
  bulkAddOpsVariants(
    productId: number | string,
    satirlar: OpsProductVariantCreateRequest[]
  ): Promise<{
    count: number;
    results: OpsProductVariant[];
    hazirlik?: ProductReadiness;
  }> {
    return apiFetch(`/ops/products/${productId}/variants/bulk/`, {
      method: "POST",
      body: { satirlar },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getOpsProductReadiness(id: number | string): Promise<ProductReadiness> {
    return apiFetch<ProductReadiness>(`/ops/products/${id}/readiness/`);
  },
  getOpsProductStock(id: number | string): Promise<OpsProductStockResponse> {
    return apiFetch<OpsProductStockResponse>(`/ops/products/${id}/stock/`);
  },
  getOpsProductMedia(
    id: number | string
  ): Promise<{ count: number; results: ProductMediaItem[] }> {
    return apiFetch(`/ops/products/${id}/media/`);
  },
  uploadOpsProductMedia(
    id: number | string,
    file: File,
    opts?: {
      kapak?: boolean;
      tip?: string;
      alt_metin?: string;
      varyant_id?: number | null;
    }
  ): Promise<ProductMediaItem> {
    const fd = new FormData();
    fd.append("dosya", file);
    if (opts?.kapak) fd.append("kapak", "true");
    if (opts?.tip) fd.append("tip", opts.tip);
    if (opts?.alt_metin) fd.append("alt_metin", opts.alt_metin);
    if (opts?.varyant_id != null) fd.append("varyant_id", String(opts.varyant_id));
    return apiFetch(`/ops/products/${id}/media/`, {
      method: "POST",
      body: fd,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addOpsProductVideoUrl(
    id: number | string,
    hariciUrl: string,
    altMetin = "Video"
  ): Promise<ProductMediaItem> {
    const fd = new FormData();
    fd.append("tip", "video");
    fd.append("harici_url", hariciUrl);
    fd.append("alt_metin", altMetin);
    return apiFetch(`/ops/products/${id}/media/`, {
      method: "POST",
      body: fd,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  setOpsProductMediaCover(
    productId: number | string,
    mediaId: number | string
  ): Promise<ProductMediaItem> {
    return apiFetch(`/ops/products/${productId}/media/${mediaId}/`, {
      method: "POST",
      body: { action: "set_cover" },
    });
  },
  deleteOpsProductMedia(
    productId: number | string,
    mediaId: number | string
  ): Promise<{ deleted: boolean; id: number }> {
    return apiFetch(`/ops/products/${productId}/media/${mediaId}/`, {
      method: "DELETE",
    });
  },
  reorderOpsProductMedia(
    productId: number | string,
    siralar: Array<{ id: number; sira: number }>
  ): Promise<{ count: number; results: ProductMediaItem[] }> {
    return apiFetch(`/ops/products/${productId}/media/reorder/`, {
      method: "POST",
      body: { siralar },
    });
  },
  getOpsPricePreview(
    productId: number | string,
    variantId: number | string
  ): Promise<PricePreviewResponse> {
    return apiFetch(
      `/ops/products/${productId}/variants/${variantId}/price-preview/`
    );
  },
  copyOpsProduct(id: number | string): Promise<OpsProduct> {
    return apiFetch<OpsProduct>(`/ops/products/${id}/copy/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  bulkOpsProducts(
    action: "submit" | "delete" | "unpublish",
    ids: number[]
  ): Promise<{ ok: number[]; errors: Array<{ id: number; detail: string }>; action: string }> {
    return apiFetch(`/ops/products/bulk/`, {
      method: "POST",
      body: { action, ids },
    });
  },
  /** Session+CSRF ile CSV Blob; yetki hatasında ApiError (çağıran toast eder). */
  downloadOpsProductsCsv(
    params?: Record<string, string | undefined>
  ): Promise<Blob> {
    return apiFetchBlob(`/ops/products/export/${qs(params)}`, "text/csv,*/*");
  },
  getOpsProductAudit(
    id: number | string
  ): Promise<{
    urun_id: number;
    results: Array<{
      id: number;
      action: string;
      success: boolean;
      reason: string;
      actor: string;
      created_at: string | null;
    }>;
  }> {
    return apiFetch(`/ops/products/${id}/audit/`);
  },
  getOpsProductStones(
    id: number | string
  ): Promise<{ count: number; results: OpsProductStone[] }> {
    return apiFetch(`/ops/products/${id}/stones/`);
  },
  addOpsProductStone(
    productId: number | string,
    body: {
      tas_tipi_id: number;
      adet?: number;
      karat?: string | null;
      bedel?: string;
      sertifika_no?: string;
    }
  ): Promise<OpsProductStone> {
    return apiFetch(`/ops/products/${productId}/stones/`, {
      method: "POST",
      body,
    });
  },
  updateOpsProductStone(
    productId: number | string,
    stoneId: number | string,
    body: Record<string, unknown>
  ): Promise<OpsProductStone> {
    return apiFetch(`/ops/products/${productId}/stones/${stoneId}/`, {
      method: "PATCH",
      body,
    });
  },
  deleteOpsProductStone(
    productId: number | string,
    stoneId: number | string
  ): Promise<{ deleted: boolean; id: number }> {
    return apiFetch(`/ops/products/${productId}/stones/${stoneId}/`, {
      method: "DELETE",
    });
  },
};
