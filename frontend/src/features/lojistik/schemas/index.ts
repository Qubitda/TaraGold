import { z } from "zod";

/** ADR-0034: elle kargo_firma + takip_no zorunlu. */
export const shipmentDispatchSchema = z.object({
  kargo_firma: z.string().trim().min(1, "Taşıyıcı adı zorunludur."),
  takip_no: z.string().trim().min(1, "Takip numarası zorunludur."),
});

export type ShipmentDispatchInput = z.infer<typeof shipmentDispatchSchema>;

export const shipmentPodSchema = z.object({
  teslim_alan: z.string().trim().min(1, "Teslim alan zorunlu."),
  notlar: z.string().trim().optional(),
  belgeler_ref: z.string().trim().optional(),
});

export type ShipmentPodInput = z.infer<typeof shipmentPodSchema>;

export const createShipmentSchema = z.object({
  order_id: z.number().int().positive("Geçerli bir Sipariş ID girin."),
  takip_no: z.string().trim().optional(),
  notlar: z.string().trim().optional(),
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const createReturnSchema = z.object({
  order_id: z.number().int().positive("Sipariş ID zorunludur."),
  shipment_id: z.number().int().positive("Sevkiyat ID zorunludur."),
  sebep: z.string().trim().min(2, "İade sebebi zorunludur."),
  notlar: z.string().trim().optional(),
  order_line_id: z.number().int().positive("Sipariş satırı seçilmelidir."),
  miktar: z.string().trim().min(1, "İade miktarı zorunludur."),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
