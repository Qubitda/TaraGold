import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { BuyerPriceLock, BuyerQuote } from "@/lib/api/types";
import type {
  BuyerRfqCreateRequest,
  OpsRfqMatch,
  OpsRfqMatchCandidate,
  PriceLock,
  PriceQuote,
  RfqMessage,
  RfqRevision,
  SupplierOffer,
  SupplierOfferCreateRequest,
  SupplierOfferImportCommitResult,
  SupplierOfferImportPreview,
  SupplierOfferImportSatir,
  SupplierOfferPage,
  SupplierRfq,
  SupplierRfqPage,
} from "../types";

function mapQuote(q: BuyerQuote): PriceQuote {
  const net = q.net_ozet;
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
    urun: typeof q.urun === "string" ? q.urun : undefined,
  };
}

function mapLock(l: BuyerPriceLock): PriceLock {
  return {
    id: l.id,
    quote_id: l.quote_id,
    kilit_fiyati: l.toplam_vergisiz || "",
    para_birimi: l.para_birimi || "TRY",
    durum: (l.durum as PriceLock["durum"]) || "AKTIF",
    expires_at: l.expires_at || "",
    gecerli: l.gecerli,
  };
}

export const fiyatlamaService = {
  /** Liste GET yok (OpenAPI). Tek kayıt: GET /quotes/{id}/ */
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
  getSupplierRfqs(): Promise<SupplierRfqPage> {
    return apiFetch<SupplierRfqPage>("/supplier/rfqs/");
  },
  getSupplierRfq(id: number | string): Promise<SupplierRfq> {
    return apiFetch<SupplierRfq>(`/supplier/rfqs/${id}/`);
  },
  getSupplierOffers(): Promise<SupplierOfferPage> {
    return apiFetch<SupplierOfferPage>("/supplier/offers/");
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
  /** GAP-F3-04 — CSV metin önizleme (PDF desteklenmez) */
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
  getBuyerRfqs(): Promise<SupplierRfqPage> {
    return apiFetch<SupplierRfqPage>("/rfqs/");
  },
  getBuyerRfqDetail(id: number | string): Promise<SupplierRfq> {
    return apiFetch<SupplierRfq>(`/rfqs/${id}/`);
  },
  createBuyerRfq(data: BuyerRfqCreateRequest): Promise<SupplierRfq> {
    return apiFetch<SupplierRfq>("/rfqs/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  sendBuyerRfq(id: number | string): Promise<SupplierRfq> {
    return apiFetch<SupplierRfq>(`/rfqs/${id}/send/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addBuyerRfqMessage(
    id: number | string,
    govde: string
  ): Promise<RfqMessage> {
    return apiFetch<RfqMessage>(`/rfqs/${id}/messages/`, {
      method: "POST",
      body: { govde },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addBuyerRfqRevision(
    id: number | string,
    ozet: string
  ): Promise<RfqRevision> {
    return apiFetch<RfqRevision>(`/rfqs/${id}/revisions/`, {
      method: "POST",
      body: { ozet },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addSupplierRfqMessage(
    id: number | string,
    govde: string
  ): Promise<RfqMessage> {
    return apiFetch<RfqMessage>(`/supplier/rfqs/${id}/messages/`, {
      method: "POST",
      body: { govde },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addSupplierRfqRevision(
    id: number | string,
    ozet: string
  ): Promise<RfqRevision> {
    return apiFetch<RfqRevision>(`/supplier/rfqs/${id}/revisions/`, {
      method: "POST",
      body: { ozet },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getRfqMatchCandidates(
    lineId: number,
    limit = 10
  ): Promise<{ rfq_line_id: number; results: OpsRfqMatchCandidate[] }> {
    return apiFetch<{ rfq_line_id: number; results: OpsRfqMatchCandidate[] }>(
      `/ops/rfq-lines/${lineId}/match-candidates/?limit=${limit}`
    );
  },
  getRfqLineMatches(
    lineId: number
  ): Promise<{ rfq_line_id: number; results: OpsRfqMatch[] }> {
    return apiFetch<{ rfq_line_id: number; results: OpsRfqMatch[] }>(
      `/ops/rfq-lines/${lineId}/matches/`
    );
  },
  createRfqLineMatch(
    lineId: number,
    data: { varyant_id: number; kanit?: string; skor?: string }
  ): Promise<OpsRfqMatch> {
    return apiFetch<OpsRfqMatch>(`/ops/rfq-lines/${lineId}/matches/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  approveRfqMatch(matchId: number): Promise<OpsRfqMatch> {
    return apiFetch<OpsRfqMatch>(`/ops/rfq-matches/${matchId}/approve/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  rejectRfqMatch(matchId: number, neden?: string): Promise<OpsRfqMatch> {
    return apiFetch<OpsRfqMatch>(`/ops/rfq-matches/${matchId}/reject/`, {
      method: "POST",
      body: neden ? { neden } : {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
