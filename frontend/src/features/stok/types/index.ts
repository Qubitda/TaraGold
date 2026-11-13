import type { components } from "@/lib/api/schema";

export type StockBalance = components["schemas"]["SupplierStock"];
export type StockAdjustmentRequest =
  components["schemas"]["SupplierStockAdjustRequest"];

export interface SupplierWarehouse {
  id: number;
  kod: string;
  ad: string;
  sahip_tipi?: string;
  aktif: boolean;
  olusturma_tarihi?: string | null;
}

