import { apiDownloadPost, apiFetch, newIdempotencyKey } from "@/lib/api/client";

export type OpsFirma = {
  id: number;
  ad: string;
  firma_kodu: string;
  durum: string;
  alici_mi: boolean;
  tedarikci_mi: boolean;
  onay_durumu: string;
  aktif: boolean;
};

export type OpsFirmaPage = {
  count: number;
  results: OpsFirma[];
  next?: string | null;
  previous?: string | null;
};

export type OpsApiAnahtar = {
  id: number;
  ad: string;
  key_prefix: string;
  scopes: string[];
  iptal: boolean;
  satis_kanali_id: number | null;
  rate_limit_per_min: number;
  olusturma?: string | null;
  api_key?: string;
};

export const opsFirmalarService = {
  list(params?: Record<string, string>): Promise<OpsFirmaPage> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<OpsFirmaPage>(`/ops/firmalar/${query}`);
  },
  create(data: Record<string, unknown>): Promise<OpsFirma> {
    return apiFetch<OpsFirma>("/ops/firmalar/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  onayla(id: number): Promise<OpsFirma> {
    return apiFetch<OpsFirma>(`/ops/firmalar/${id}/onayla/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  davet(id: number, data: { email: string; rol: string }): Promise<unknown> {
    return apiFetch(`/ops/firmalar/${id}/davet/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listApiAnahtarlar(firmaId: number): Promise<OpsApiAnahtar[]> {
    return apiFetch<OpsApiAnahtar[]>(
      `/ops/firmalar/${firmaId}/api-anahtarlar/`
    );
  },
  createApiAnahtar(
    firmaId: number,
    data: { ad?: string; scopes?: string[] } = {}
  ): Promise<OpsApiAnahtar> {
    return apiFetch<OpsApiAnahtar>(
      `/ops/firmalar/${firmaId}/api-anahtarlar/`,
      {
        method: "POST",
        body: data,
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
  iptalApiAnahtar(firmaId: number, anahtarId: number): Promise<OpsApiAnahtar> {
    return apiFetch<OpsApiAnahtar>(
      `/ops/firmalar/${firmaId}/api-anahtarlar/${anahtarId}/iptal/`,
      {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
};

export type OpsOrderRow = {
  id: number;
  durum: string;
  alici_firma_id?: number;
  olusturma_tarihi?: string | null;
};

export const opsOrdersService = {
  onayHavuzu(): Promise<{ results: OpsOrderRow[]; count?: number }> {
    return apiFetch("/ops/orders/onay-havuzu/");
  },
  onayla(id: number): Promise<OpsOrderRow> {
    return apiFetch(`/ops/orders/${id}/onayla/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  reddet(id: number, neden = ""): Promise<OpsOrderRow> {
    return apiFetch(`/ops/orders/${id}/reddet/`, {
      method: "POST",
      body: { neden },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  tahsilat(
    id: number,
    data: { tutar: string; yontem: string; aciklama?: string; dekont_ref?: string }
  ): Promise<{ ledger_entry_id: number; tutar: string }> {
    return apiFetch(`/ops/orders/${id}/tahsilat/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  async downloadProforma(id: number): Promise<void> {
    await apiDownloadPost(
      `/ops/orders/${id}/proforma/`,
      {},
      `proforma-${id}.pdf`
    );
  },
  async downloadIrsaliye(id: number): Promise<void> {
    await apiDownloadPost(
      `/ops/orders/${id}/irsaliye/`,
      {},
      `irsaliye-${id}.pdf`
    );
  },
};
