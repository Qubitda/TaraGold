import { apiFetch, newIdempotencyKey, unwrapResults } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  StockAdjustmentRequest,
  StockBalance,
  SupplierWarehouse,
  WarehouseWriteRequest,
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

export const stokService = {
  getWarehouses(
    params?: Record<string, string | undefined>
  ): Promise<Paginated<SupplierWarehouse>> {
    return apiFetch<Paginated<SupplierWarehouse>>(
      `/supplier/warehouses/${qs(params)}`
    );
  },
  async listWarehouses(
    params?: Record<string, string | undefined>
  ): Promise<SupplierWarehouse[]> {
    const page = await this.getWarehouses(params);
    return unwrapResults(page);
  },
  createWarehouse(data: WarehouseWriteRequest): Promise<SupplierWarehouse> {
    return apiFetch<SupplierWarehouse>("/supplier/warehouses/", {
      method: "POST",
      body: data,
    });
  },
  updateWarehouse(
    id: number | string,
    data: Partial<WarehouseWriteRequest>
  ): Promise<SupplierWarehouse> {
    return apiFetch<SupplierWarehouse>(`/supplier/warehouses/${id}/`, {
      method: "PATCH",
      body: data,
    });
  },
  deleteWarehouse(id: number | string): Promise<{ deleted: boolean; id: number }> {
    return apiFetch<{ deleted: boolean; id: number }>(
      `/supplier/warehouses/${id}/`,
      { method: "DELETE" }
    );
  },
  getSupplierStock(
    params?: Record<string, string | undefined>
  ): Promise<Paginated<StockBalance>> {
    return apiFetch<Paginated<StockBalance>>(`/supplier/stock/${qs(params)}`);
  },
  async listSupplierStock(
    params?: Record<string, string | undefined>
  ): Promise<StockBalance[]> {
    const page = await this.getSupplierStock(params);
    return unwrapResults(page);
  },
  adjustStock(data: StockAdjustmentRequest): Promise<unknown> {
    return apiFetch<unknown>("/supplier/stock/adjustments/", {
      method: "POST",
      body: {
        warehouse_id: data.warehouse_id,
        varyant_id: data.varyant_id,
        miktar: data.miktar,
        neden: data.neden || "",
      },
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
