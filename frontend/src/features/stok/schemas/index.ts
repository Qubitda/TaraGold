import { z } from "zod";

export const stockAdjustmentSchema = z.object({
  warehouse_id: z
    .number({ message: "Lütfen bir depo seçin." })
    .int()
    .positive("Lütfen bir depo seçin."),
  /** Özellik kırılımı (varyant) — UI’da “teklif” gösterilmez */
  varyant_id: z
    .number({ message: "Lütfen ürün / özellik kırılımı seçin." })
    .int()
    .positive("Lütfen ürün / özellik kırılımı seçin."),
  /** İlk bağ veya fiyat güncellemesi için isteğe bağlı */
  birim_fiyat: z.string().optional(),
  miktar: z.string().trim().min(1, "Miktar zorunludur."),
  neden: z
    .string()
    .trim()
    .min(5, "Düzeltme nedeni en az 5 karakter olmalıdır."),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const warehouseSchema = z.object({
  kod: z.string().trim().min(2, "Depo kodu en az 2 karakter olmalıdır."),
  ad: z.string().trim().min(2, "Depo adı en az 2 karakter olmalıdır."),
  sahip_firma_id: z.number().int().positive().optional(),
  aktif: z.boolean(),
});

export type WarehouseInput = z.infer<typeof warehouseSchema>;
