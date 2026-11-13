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
