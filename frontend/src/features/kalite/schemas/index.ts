import { z } from "zod";

/** GAP-F4-02 — OpsMeasurementRequest: olculen_ayar, olculen_gram ve/veya olculen. */
export const measurementSchema = z.object({
  order_line_id: z.number().int().positive("Sipariş satırı zorunlu."),
  olculen_ayar: z.string().trim().optional(),
  olculen_gram: z.string().trim().optional(),
  olculen: z.string().trim().optional(),
  override_gerekce: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  const hasParts = Boolean(v.olculen_ayar || v.olculen_gram);
  const hasRaw = Boolean(v.olculen);
  if (!hasParts && !hasRaw) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ölçülen değer veya ayar/gram girin.",
      path: ["olculen"],
    });
  }
});

export type MeasurementInput = z.infer<typeof measurementSchema>;

export function toOpsMeasurementBody(input: MeasurementInput): {
  order_line_id: number;
  olculen?: string;
  olculen_ayar?: string;
  olculen_gram?: string;
  override_gerekce?: string;
} {
  const ayar = input.olculen_ayar?.trim() || undefined;
  const gram = input.olculen_gram?.trim() || undefined;
  const raw = input.olculen?.trim() || undefined;
  return {
    order_line_id: input.order_line_id,
    ...(ayar ? { olculen_ayar: ayar } : {}),
    ...(gram ? { olculen_gram: gram } : {}),
    ...(raw ? { olculen: raw } : !gram && ayar ? { olculen: ayar } : {}),
    ...(input.override_gerekce?.trim()
      ? { override_gerekce: input.override_gerekce.trim() }
      : {}),
  };
}

export const createInspectionSchema = z.object({
  order_id: z.number().int().positive("Sipariş ID zorunludur."),
  order_line_id: z.string().trim().optional(),
  notlar: z.string().trim().optional(),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
