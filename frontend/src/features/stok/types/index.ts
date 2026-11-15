import type { components } from "@/lib/api/schema";

export type StockBalance = components["schemas"]["SupplierStock"] & {
  id?: number;
  warehouse_kod?: string;
  warehouse_ad?: string;
  varyant_sku?: string;
  urun_ad?: string;
  platform_kodu?: string;
};

export type StockAdjustmentRequest = {
  warehouse_id: number;
  varyant_id: number;
  miktar: string | number;
  neden?: string;
};

export interface SupplierWarehouse {
  id: number;
  kod: string;
  ad: string;
  sahip_tipi?: string;
  sahip_firma_id?: number;
  sahip_firma_ad?: string;
  aktif: boolean;
  olusturma_tarihi?: string | null;
}

export interface WarehouseWriteRequest {
  kod: string;
  ad: string;
  aktif?: boolean;
  sahip_firma_id?: number;
}
