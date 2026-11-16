import { z } from "zod";

export const catalogFilterSchema = z.object({
  q: z.string().optional(),
  ordering: z.string().optional(),
  kategori_id: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
  onay_durumu: z.string().optional(),
  yayin_durumu: z.string().optional(),
});

export const opsProductCreateSchema = z.object({
  ad: z.string().trim().min(1, "Ürün adı zorunludur."),
  kategori_id: z.coerce
    .number({ message: "Kategori seçimi zorunludur." })
    .int()
    .positive("Kategori seçimi zorunludur."),
  ayar_id: z.coerce
    .number({ message: "Ayar seçimi zorunludur." })
    .int()
    .positive("Ayar seçimi zorunludur."),
  aciklama: z.string().trim().optional(),
  fiyat_tipi: z.string().trim().optional(),
  temin_tipi: z.string().trim().optional(),
  termin_gun: z.string().trim().optional(),
  olcu_tipi: z.string().trim().optional(),
  renk_ekseni: z.boolean().optional(),
  satis_kanali_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
});

export const opsVariantCreateSchema = z.object({
  tip: z.string().trim().optional(),
  gram: z.string().trim().optional(),
  renk_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
  beden_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
  ek_bedel: z.string().trim().optional(),
  sabit_fiyat: z.string().trim().optional(),
  tedarikci_sku: z.string().trim().optional(),
  benzersiz_parca: z.boolean().optional(),
  aktif: z.boolean().optional(),
  yuva_adedi: z.coerce.number().int().positive().optional().or(z.literal(0)),
  izinli_kesimler: z.array(z.string()).optional(),
  karat_min: z.string().trim().optional(),
  karat_max: z.string().trim().optional(),
  karat: z.string().trim().optional(),
  kesim_kod: z.string().trim().optional(),
});

export const categorySchema = z.object({
  kod: z.string().trim().min(1, "Kategori kodu zorunludur.").max(30),
  ad: z.string().trim().min(1, "Kategori adı zorunludur.").max(80),
  ust_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
  fiyat_grubu_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
  sira: z.coerce.number().int().default(0),
  aktif: z.boolean().default(true),
  dahili: z.boolean().default(false),
  one_cikan: z.boolean().default(false),
  ikon: z.string().trim().optional(),
  seo_baslik: z.string().trim().optional(),
  seo_aciklama: z.string().trim().optional(),
});

export const rejectSchema = z.object({
  neden: z.string().trim().min(1, "Red nedeni zorunludur."),
});

export type CatalogFilterInput = z.infer<typeof catalogFilterSchema>;
export type OpsProductCreateInput = z.infer<typeof opsProductCreateSchema>;
export type OpsVariantCreateInput = z.infer<typeof opsVariantCreateSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
