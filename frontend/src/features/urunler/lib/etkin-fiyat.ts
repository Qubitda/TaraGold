/** VaryantFiyat varsa o kazanır; yoksa Urun.fiyat_tipi → fiyat modeli. */

export type FiyatKaynak = "varyant_fiyat" | "urun" | "none";

export type FiyatGosterim = "manual" | "calculated";

export function urunFiyatTipiToModel(fiyatTipi: string | undefined): string {
  const t = (fiyatTipi || "gram").toLowerCase();
  if (t === "sabit") return "SABIT_PARCA";
  return "GRAM_BIRIM";
}

export function vfModelToGosterim(model: string): FiyatGosterim {
  const m = model.toUpperCase();
  if (m === "SABIT_PARCA" || m === "SABIT") return "manual";
  return "calculated";
}

export function etkinFiyatModeli(input: {
  urunFiyatTipi?: string;
  varyantFiyatModeli?: string | null;
}): {
  kaynak: FiyatKaynak;
  model: string | null;
  gosterim: FiyatGosterim | null;
  conflict: boolean;
} {
  const urunModel = urunFiyatTipiToModel(input.urunFiyatTipi);
  const vf = (input.varyantFiyatModeli || "").trim().toUpperCase();

  if (vf) {
    const gosterim = vfModelToGosterim(vf);
    const urunG = vfModelToGosterim(urunModel);
    return {
      kaynak: "varyant_fiyat",
      model: vf,
      gosterim,
      conflict: gosterim !== urunG,
    };
  }

  if (!input.urunFiyatTipi) {
    return { kaynak: "none", model: null, gosterim: null, conflict: false };
  }

  return {
    kaynak: "urun",
    model: urunModel,
    gosterim: vfModelToGosterim(urunModel),
    conflict: false,
  };
}

export function fiyatGosterimLabel(g: FiyatGosterim | null): string {
  if (g === "manual") return "Manuel";
  if (g === "calculated") return "Hesaplanan";
  return "—";
}