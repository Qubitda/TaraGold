import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { BuyerPriceLock, BuyerQuote, Paginated } from "@/lib/api/types";
import type {
  PriceLock,
  PriceLockPage,
  PriceQuote,
  PriceQuotePage,
  SupplierOffer,
  SupplierOfferCreateRequest,
  SupplierOfferImportCommitResult,
  SupplierOfferImportPreview,
  SupplierOfferImportSatir,
  SupplierOfferPage,
  SupplierVariantPage,
} from "../types";

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function mapQuote(q: BuyerQuote): PriceQuote {
  const net = q.net_ozet;
  const urunVal = q.urun as unknown;
  const urunLabel =
    typeof urunVal === "string"
      ? urunVal
      : urunVal && typeof urunVal === "object" && "ad" in urunVal
      ? String((urunVal as { ad?: string }).ad || "")
      : undefined;
  return {
    id: q.id,
    varyant_id: q.varyant_id ?? 0,
    birim_fiyat: q.gram_basi_vergisiz || q.toplam_vergisiz,
    para_birimi: q.para_birimi,
    expires_at: q.expires_at || undefined,
    allowed_actions: q.allowed_actions,
    durum: q.durum,
    gram: q.gram,
    gram_basi_vergisiz: q.gram_basi_vergisiz,
    toplam_vergisiz: q.toplam_vergisiz,
    has_gram: q.has_gram ?? net?.has_gram ?? null,
    net_ozet: net
      ? {
          toplam_vergisiz: net.toplam_vergisiz,
          gram: net.gram,
          gram_basi_vergisiz: net.gram_basi_vergisiz,
          has_gram: net.has_gram,
        }
      : undefined,
    varyant_sku: q.varyant_sku,
    urun: urunLabel,
  };
}

function mapLock(
  l: BuyerPriceLock & { varyant_sku?: string; urun_ad?: string }
): PriceLock {
  return {
    id: l.id,
    quote_id: l.quote_id,
    kilit_fiyati: l.toplam_vergisiz || "",
    para_birimi: l.para_birimi || "TRY",
    durum: (l.durum as PriceLock["durum"]) || "AKTIF",
    expires_at: l.expires_at || "",
    gecerli: l.gecerli,
    varyant_sku: l.varyant_sku,
    urun_ad: l.urun_ad,
  };
}

export const fiyatlamaService = {
  getQuotes(params?: Record<string, string | undefined>): Promise<PriceQuotePage> {
    return apiFetch<Paginated<BuyerQuote>>(`/quotes/${qs(params)}`).then((res) => ({
      count: res.count ?? 0,
      results: (res.results ?? []).map(mapQuote),
    }));
  },
  getQuote(id: number | string): Promise<PriceQuote> {
    return apiFetch<BuyerQuote>(`/quotes/${id}/`).then(mapQuote);
  },
  createQuote(data: {
    varyant_id: number;
    satis_kanali_id: number;
    para_birimi?: string;
  }): Promise<PriceQuote> {
    return apiFetch<BuyerQuote>("/quotes/", {
      method: "POST",
      body: {
        varyant_id: data.varyant_id,
        satis_kanali_id: data.satis_kanali_id,
        para_birimi: data.para_birimi || "TRY",
      },
      idempotencyKey: newIdempotencyKey(),
    }).then(mapQuote);
  },
  /** Katalog otomatik fiyat — motor = quote; başarısızsa reason_code. */
  batchQuotes(data: {
    satis_kanali_id: number;
    varyant_ids: number[];
    para_birimi?: string;
  }): Promise<{
    count: number;
    results: Array<{
      ok: boolean;
      varyant_id: number;
      urun_id?: number;
      fiyat_tipi?: string;
      reason_code?: string;
      detail?: string;
      uyari?: string | null;
      quote?: BuyerQuote;
    }>;
  }> {
    return apiFetch("/quotes/batch/", {
      method: "POST",
      body: {
        satis_kanali_id: data.satis_kanali_id,
        varyant_ids: data.varyant_ids,
        para_birimi: data.para_birimi || "TRY",
      },
    });
  },
  getPriceLocks(params?: Record<string, string | undefined>): Promise<PriceLockPage> {
    return apiFetch<
      Paginated<BuyerPriceLock & { varyant_sku?: string; urun_ad?: string }>
    >(`/price-locks/${qs(params)}`).then((res) => ({
      count: res.count ?? 0,
      results: (res.results ?? []).map(mapLock),
    }));
  },
  getPriceLock(id: number | string): Promise<PriceLock> {
    return apiFetch<BuyerPriceLock>(`/price-locks/${id}/`).then(mapLock);
  },
  createPriceLock(quoteId: number): Promise<PriceLock> {
    return apiFetch<BuyerPriceLock>("/price-locks/", {
      method: "POST",
      body: { quote_id: quoteId },
      idempotencyKey: newIdempotencyKey(),
    }).then(mapLock);
  },
  getSupplierVariants(
    params?: Record<string, string | undefined>
  ): Promise<SupplierVariantPage> {
    return apiFetch<SupplierVariantPage>(`/supplier/variants/${qs(params)}`);
  },
  getSupplierOffers(
    params?: Record<string, string | undefined>
  ): Promise<SupplierOfferPage> {
    return apiFetch<SupplierOfferPage>(`/supplier/offers/${qs(params)}`);
  },
  getSupplierOfferDetail(id: number | string): Promise<SupplierOffer> {
    return apiFetch<SupplierOffer>(`/supplier/offers/${id}/`);
  },
  createSupplierOfferVersion(
    id: number | string,
    data: { gram?: string; birim_fiyat?: string; fiyat_modeli?: string }
  ): Promise<SupplierOffer> {
    return apiFetch<SupplierOffer>(`/supplier/offers/${id}/versions/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  createSupplierOffer(data: SupplierOfferCreateRequest): Promise<SupplierOffer> {
    return apiFetch<SupplierOffer>("/supplier/offers/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  submitSupplierOffer(id: number | string): Promise<SupplierOffer> {
    return apiFetch<SupplierOffer>(`/supplier/offers/${id}/submit/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  deactivateSupplierOffer(id: number | string): Promise<SupplierOffer> {
    return apiFetch<SupplierOffer>(`/supplier/offers/${id}/deactivate/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  previewOfferImport(csv: string): Promise<SupplierOfferImportPreview> {
    return apiFetch<SupplierOfferImportPreview>(
      "/supplier/offers/import/preview/",
      {
        method: "POST",
        body: { csv },
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
  commitOfferImport(
    satirlar: SupplierOfferImportSatir[]
  ): Promise<SupplierOfferImportCommitResult> {
    return apiFetch<SupplierOfferImportCommitResult>(
      "/supplier/offers/import/commit/",
      {
        method: "POST",
        body: { satirlar },
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
};
