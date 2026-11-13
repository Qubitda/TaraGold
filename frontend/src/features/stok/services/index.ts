import { apiFetch, newIdempotencyKey, unwrapResults } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  StockAdjustmentRequest,
  StockBalance,
  SupplierWarehouse,
} from "../types";

export const stokService = {
  getWarehouses(
    params?: Record<string, string>
  ): Promise<Paginated<SupplierWarehouse>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<Paginated<SupplierWarehouse>>(
      `/supplier/warehouses/${query}`
    );
  },
  async listWarehouses(
    params?: Record<string, string>
  ): Promise<SupplierWarehouse[]> {
    const page = await this.getWarehouses(params);
    return unwrapResults(page);
  },
  getSupplierStock(
    params?: Record<string, string>
  ): Promise<Paginated<StockBalance>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<Paginated<StockBalance>>(`/supplier/stock/${query}`);
  },
  async listSupplierStock(params?: Record<string, string>): Promise<StockBalance[]> {
    const page = await this.getSupplierStock(params);
    return unwrapResults(page);
  },
  adjustStock(data: StockAdjustmentRequest): Promise<unknown> {
    return apiFetch<unknown>("/supplier/stock/adjustments/", {
      method: "POST",
      body: {
        warehouse_id: data.warehouse_id,
        teklif_id: data.teklif_id,
        miktar: data.miktar,
        neden: data.neden || "",
      },
      idempotencyKey: newIdempotencyKey(),
    });
  },
};

