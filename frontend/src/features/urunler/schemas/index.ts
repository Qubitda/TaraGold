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

const optionalPositiveInt = z.number().int().positive().optional();
const optionalNullablePositiveInt = z.number().int().positive().nullable().optional();

export const opsVariantTipSchema = z.enum([
  "HAM_ALTIN",
  "MONTUR",
  "TAS",
  "TASLI",
]);

export const opsMonturModuSchema = z.enum([
  "FULL",
  "HEAD",
  "BAND",
  "HEAD_BAND",
]);

const opsVariantCreateBaseSchema = z.object({
  tip: opsVariantTipSchema,
  gram: z.string().trim().optional(),
  renk_id: optionalNullablePositiveInt,
  beden_id: optionalNullablePositiveInt,
  ayar_id: optionalPositiveInt,
  ek_bedel: z.string().trim().optional(),
  sabit_fiyat: z.string().trim().optional(),
  tedarikci_sku: z.string().trim().optional(),
  benzersiz_parca: z.boolean().optional(),
  aktif: z.boolean().optional(),
  parca_rolu: z.enum(["FULL", "HEAD", "BAND"]).optional(),
  bas_stil: z.string().trim().optional(),
  govde_stil: z.string().trim().optional(),
  yuva_adedi: optionalPositiveInt,
  izinli_kesimler: z.array(z.string().trim().min(1)).optional(),
  karat_min: z.string().trim().optional(),
  karat_max: z.string().trim().optional(),
  karat: z.string().trim().optional(),
  kesim_kod: z.string().trim().optional(),
});

export const opsVariantCreateSchema = opsVariantCreateBaseSchema.superRefine(
  (data, ctx) => {
    if (data.tip === "TAS") {
      // ayar/renk yok sayılır — zorunluluk yok; dolu gelse de create tarafı temizler
      if (!data.karat || !(Number(data.karat) > 0)) {
        ctx.addIssue({
          code: "custom",
          path: ["karat"],
          message: "Karat zorunludur.",
        });
      }
      if (!data.kesim_kod?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["kesim_kod"],
          message: "Kesim kodu zorunludur.",
        });
      }
      return;
    }

    if (data.ayar_id == null) {
      ctx.addIssue({
        code: "custom",
        path: ["ayar_id"],
        message: "Metal tipinde ayar zorunludur.",
      });
    }

    if (data.tip === "MONTUR") {
      const rol = data.parca_rolu || "FULL";
      // BAND yuva taşımaz; FULL/HEAD soket alanları zorunlu
      if (rol === "FULL" || rol === "HEAD") {
        if (data.yuva_adedi == null || data.yuva_adedi < 1) {
          ctx.addIssue({
            code: "custom",
            path: ["yuva_adedi"],
            message: "Yuva adedi zorunludur.",
          });
        }
        if (!data.izinli_kesimler?.length) {
          ctx.addIssue({
            code: "custom",
            path: ["izinli_kesimler"],
            message: "En az bir izinli kesim seçin.",
          });
        }
        if (!data.karat_min?.trim() || !data.karat_max?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["karat_min"],
            message: "Karat min/max zorunludur.",
          });
        }
      }
    }
  }
);

export const opsMonturParcaSchema = z
  .object({
    parca_rolu: z.enum(["HEAD", "BAND"]),
    ad: z.string().trim().optional(),
    gram: z.string().trim().min(1, "Gram zorunludur."),
    renk_id: optionalPositiveInt,
    ayar_id: z.number().int().positive("Ayar zorunludur."),
    bas_stil: z.string().trim().optional(),
    govde_stil: z.string().trim().optional(),
    yuva_adedi: optionalPositiveInt,
    izinli_kesimler: z.array(z.string().trim().min(1)).optional(),
    karat_min: z.string().trim().optional(),
    karat_max: z.string().trim().optional(),
    sabit_fiyat: z.string().trim().optional(),
    tip: opsVariantTipSchema.optional(),
    varyantlar: z.array(opsVariantCreateSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (!(Number(data.gram) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["gram"],
        message: "Gram pozitif olmalıdır.",
      });
    }
    if (data.renk_id == null) {
      ctx.addIssue({
        code: "custom",
        path: ["renk_id"],
        message: "Metal rengi zorunludur.",
      });
    }
    if (data.parca_rolu === "HEAD") {
      if (!data.bas_stil?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["bas_stil"],
          message: "Baş stili zorunludur.",
        });
      }
      if (data.yuva_adedi == null || data.yuva_adedi < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["yuva_adedi"],
          message: "Yuva adedi zorunludur.",
        });
      }
      if (!data.izinli_kesimler?.length) {
        ctx.addIssue({
          code: "custom",
          path: ["izinli_kesimler"],
          message: "En az bir izinli kesim seçin.",
        });
      }
      if (!data.karat_min?.trim() || !data.karat_max?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["karat_min"],
          message: "Karat min/max zorunludur.",
        });
      }
    }
    if (data.parca_rolu === "BAND" && !data.govde_stil?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["govde_stil"],
        message: "Gövde stili zorunludur.",
      });
    }
  });

const opsProductCreateBaseSchema = z.object({
  ad: z.string().trim().min(1, "Ürün adı zorunludur."),
  kategori_id: z.number({ message: "Kategori seçimi zorunludur." }).int().positive(),
  /** Ürün varsayılanı — metal varyantta yoksa varyant.ayar kullanılır. */
  ayar_id: optionalPositiveInt,
  aciklama: z.string().trim().optional(),
  fiyat_tipi: z.enum(["gram", "sabit"], {
    message: "Fiyat tipi gram veya sabit olmalı.",
  }),
  temin_tipi: z.enum(["hazir", "siparis_ozel"]).default("hazir"),
  termin_gun: z.coerce.number().int().nonnegative().optional().nullable(),
  olcu_tipi: z.string().trim().optional(),
  renk_ekseni: z.boolean().optional(),
  satis_kanali_id: optionalPositiveInt,
  sahiplik_firma_id: optionalPositiveInt,
  koleksiyon_id: optionalNullablePositiveInt,
  hedef_kitle: z.string().trim().optional(),
  yas_grubu_id: optionalNullablePositiveInt,
  yuzey: z.string().trim().optional(),
  zincir_tipi_id: optionalNullablePositiveInt,
  kopca_tipi_id: optionalNullablePositiveInt,
  teknik_ids: z.array(z.number().int().positive()).optional(),
  stil_ids: z.array(z.number().int().positive()).optional(),
  ozel_gun_ids: z.array(z.number().int().positive()).optional(),
  meta_baslik: z.string().trim().optional(),
  meta_aciklama: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  canonical_url: z.string().trim().optional(),
  gorsel_alt_metni: z.string().trim().optional(),
  montur_modu: opsMonturModuSchema.optional(),
  parcalar: z.array(opsMonturParcaSchema).optional(),
  varyantlar: z.array(opsVariantCreateSchema).optional(),
});

export const opsProductCreateSchema = opsProductCreateBaseSchema.superRefine(
  (data, ctx) => {
    if (data.montur_modu === "HEAD_BAND") {
      const parts = data.parcalar ?? [];
      if (parts.length !== 2) {
        ctx.addIssue({
          code: "custom",
          path: ["parcalar"],
          message: "HEAD_BAND için tam 2 parça (HEAD ve BAND) gerekli.",
        });
        return;
      }
      const roles = parts.map((p) => p.parca_rolu).sort();
      if (roles[0] !== "BAND" || roles[1] !== "HEAD") {
        ctx.addIssue({
          code: "custom",
          path: ["parcalar"],
          message: "Parçalar HEAD ve BAND olmalı (birer tane).",
        });
      }
      return;
    }

    if (!data.varyantlar || data.varyantlar.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["varyantlar"],
        message: "En az bir varyant gerekli.",
      });
    }
  }
);

/** Sihirbaz adım 1 — tür / montür rolü */
export const opsWizardTipSchema = z
  .object({
    kind: z.enum(["HAM_ALTIN", "MONTUR", "TAS"], {
      message: "Ürün tipi seçin",
    }),
    montur_modu: opsMonturModuSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "MONTUR" && data.montur_modu == null) {
      ctx.addIssue({
        code: "custom",
        path: ["montur_modu"],
        message: "Montür rolü seçin",
      });
    }
  });

/** Sihirbaz adım 2 — kimlik (create şemasından türetilmiş alanlar) */
export const opsWizardKimlikSchema = z
  .object({
    ad: opsProductCreateBaseSchema.shape.ad,
    kategori_id: opsProductCreateBaseSchema.shape.kategori_id,
    olcu_tipi: opsProductCreateBaseSchema.shape.olcu_tipi,
    renk_ekseni: opsProductCreateBaseSchema.shape.renk_ekseni,
    sahiplik_firma_id: optionalPositiveInt,
    require_sahiplik: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.require_sahiplik && data.sahiplik_firma_id == null) {
      ctx.addIssue({
        code: "custom",
        path: ["sahiplik_firma_id"],
        message: "Sahiplik firması zorunlu",
      });
    }
  });

export const bulkVariantErrorSchema = z.object({
  satir_index: z.number().int().nonnegative(),
  alan: z.string(),
  detail: z.string(),
});

export const categorySchema = z.object({
  kod: z.string().trim().min(1, "Kategori kodu zorunludur.").max(30),
  ad: z.string().trim().min(1, "Kategori adı zorunludur.").max(80),
  ust_id: optionalPositiveInt.nullable(),
  fiyat_grubu_id: optionalPositiveInt.nullable(),
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

/** Zod path → UI field key (sihirbaz FieldErr). */
export function zodIssuesToFieldErrors(
  issues: z.ZodIssue[],
  aliases: Record<string, string> = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path;
    let key = "form";
    if (path[0] === "parcalar" && typeof path[1] === "number") {
      const prefix = path[1] === 0 ? "h_head_" : "h_band_";
      const field = String(path[2] ?? "parca");
      const fieldMap: Record<string, string> = {
        ayar_id: "ayar_id",
        renk_id: "metal_renk",
        bas_stil: "stil",
        govde_stil: "stil",
        gram: "gram",
        yuva_adedi: "yuva",
        izinli_kesimler: "kesim",
        karat_min: "karat",
        karat_max: "karat",
        metal_id: "metal_id",
      };
      key = `${prefix}${fieldMap[field] ?? field}`;
    } else if (path[0] === "varyantlar" && typeof path[1] === "number") {
      const field = String(path[2] ?? "varyant");
      const fieldMap: Record<string, string> = {
        ayar_id: "ayar_id",
        renk_id: "metal_renk",
        kesim_kod: "kesim",
        karat: "karat",
        yuva_adedi: "yuva",
        izinli_kesimler: "kesim",
        karat_min: "karat",
        karat_max: "karat",
        bas_stil: "bas_stil",
        govde_stil: "govde_stil",
        gram: "gram",
        tip: "kind",
      };
      key = fieldMap[field] ?? field;
    } else {
      key = String(path[0] ?? "form");
    }
    key = aliases[key] ?? key;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type CatalogFilterInput = z.infer<typeof catalogFilterSchema>;
export type OpsProductCreateInput = z.infer<typeof opsProductCreateSchema>;
export type OpsVariantCreateInput = z.infer<typeof opsVariantCreateSchema>;
export type OpsMonturParcaInput = z.infer<typeof opsMonturParcaSchema>;
export type BulkVariantErrorInput = z.infer<typeof bulkVariantErrorSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
export type OpsMonturModu = z.infer<typeof opsMonturModuSchema>;
/** Create/bulk varyant tip — types.OpsVariantTip buradan türesin. */
export type OpsVariantTipFromSchema = z.infer<typeof opsVariantTipSchema>;
