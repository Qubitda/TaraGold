import { z } from "zod";

export const elleTahsilatSchema = z.object({
  order_id: z.number().int().positive("Sipariş ID zorunludur."),
  tutar: z.string().trim().min(1, "Tutar zorunludur."),
  yontem: z.string().trim().min(1, "Ödeme yöntemi zorunludur."),
  para_birimi: z.string().trim().optional(),
  dekont_ref: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
});

export type ElleTahsilatInput = z.infer<typeof elleTahsilatSchema>;

export const elleTedarikciOdemeSchema = z.object({
  tedarikci_firma_id: z.number().int().positive("Tedarikçi firma ID zorunludur."),
  hak_edis_id: z.number().int().positive().optional(),
  order_id: z.number().int().positive().optional(),
  tutar: z.string().trim().min(1, "Tutar zorunludur."),
  yontem: z.string().trim().min(1, "Ödeme yöntemi zorunludur."),
  para_birimi: z.string().trim().optional(),
  dekont_ref: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
});

export type ElleTedarikciOdemeInput = z.infer<typeof elleTedarikciOdemeSchema>;
