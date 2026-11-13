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
  unvan?: string;
  vergi_no?: string;
  vergi_dairesi?: string;
  mersis_no?: string;
  ticaret_sicil_no?: string;
  oda_adi?: string;
  oda_kayit_no?: string;
  web_sitesi?: string;
  telefon?: string;
  eposta?: string;
  vade_gun?: number | null;
  tipler?: string[];
};

export type OpsFirmaKontak = {
  id: number;
  ad_soyad: string;
  departman?: string;
  gorev?: string;
  telefon?: string;
  eposta?: string;
  birincil?: boolean;
  notlar?: string;
};

export type OpsFirmaAdres = {
  id: number;
  tip: string;
  il: string;
  ilce?: string;
  adres: string;
  varsayilan?: boolean;
};

export type OpsFirmaBanka = {
  id: number;
  banka_adi: string;
  iban: string;
  swift_bic?: string;
  para_birimi: string;
  aktif?: boolean;
};

export type OpsFirmaBelge = {
  id: number;
  tip: string;
  baslik: string;
  storage_key: string;
  content_type?: string;
  byte_size?: number;
};

export type OpsKanalIzni = {
  id: number;
  tedarikci_firma_id: number;
  satis_kanali_id: number;
  durum: string;
  talep_tarihi?: string | null;
  karar_tarihi?: string | null;
};

export type OpsKanalIzniPage = {
  count: number;
  results: OpsKanalIzni[];
  next?: string | null;
  previous?: string | null;
};

export type FirmaKullanici = {
  id: number;
  kullanici_id: number;
  username: string;
  rol: string;
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

export type FeedResponse = {
  format: "json" | "xml";
  contentType: string;
  raw: string;
  data: unknown;
};

async function fetchFeedEndpoint(
  path: string,
  apiKey: string,
  format: "json" | "xml"
): Promise<FeedResponse> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`/api/v1${path}${sep}format=${format}`, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey.trim(),
      Accept: format === "xml" ? "application/xml" : "application/json",
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!res.ok) {
    let message = `Feed hatası (${res.status})`;
    try {
      const parsed = JSON.parse(raw) as { detail?: string; title?: string };
      message = parsed.detail || parsed.title || message;
    } catch {
      if (raw.trim()) message = raw.trim();
    }
    throw new Error(message);
  }
  let data: unknown = raw;
  if (format === "json" && raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return { format, contentType, raw, data };
}

export const feedService = {
  getUrunler(apiKey: string, format: "json" | "xml" = "json"): Promise<FeedResponse> {
    return fetchFeedEndpoint("/feed/urunler/", apiKey, format);
  },
  getUrunDetail(
    apiKey: string,
    id: number | string,
    format: "json" | "xml" = "json"
  ): Promise<FeedResponse> {
    return fetchFeedEndpoint(`/feed/urunler/${id}/`, apiKey, format);
  },
  getStokFiyat(apiKey: string, format: "json" | "xml" = "json"): Promise<FeedResponse> {
    return fetchFeedEndpoint("/feed/stok-fiyat/", apiKey, format);
  },
  async getSchemaXsd(apiKey: string): Promise<FeedResponse> {
    const res = await fetch("/api/v1/feed/schema.xsd", {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey.trim(),
        Accept: "application/xml",
      },
    });
    const contentType = res.headers.get("content-type") || "application/xml";
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`XSD Şema hatası (${res.status}): ${raw}`);
    }
    return { format: "xml", contentType, raw, data: raw };
  },
};

export type OpsAliciKanalErisimi = {
  id: number;
  firma_id: number;
  firma_ad: string;
  satis_kanali_id: number;
  satis_kanali_kod: string;
  satis_kanali_ad?: string;
  fiyat_grubu_id: number;
  fiyat_grubu_ad?: string;
  fiyat_grubu_kod?: string;
  aktif: boolean;
};

export type OpsFiyatGrubu = {
  id: number;
  kod: string;
  ad: string;
};

export type SalesChannelOption = {
  id: number;
  kod: string;
  ad: string;
  quote_ttl_saniye?: number;
  aktif: boolean;
};

export const opsFirmalarService = {
  list(params?: Record<string, string>): Promise<OpsFirmaPage> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<OpsFirmaPage>(`/ops/firmalar/${query}`);
  },
  get(id: number): Promise<OpsFirma> {
    return apiFetch<OpsFirma>(`/ops/firmalar/${id}/`);
  },
  create(data: Record<string, unknown>): Promise<OpsFirma> {
    return apiFetch<OpsFirma>("/ops/firmalar/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  update(id: number, data: Record<string, unknown>): Promise<OpsFirma> {
    return apiFetch<OpsFirma>(`/ops/firmalar/${id}/`, {
      method: "PATCH",
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
  askiyaAl(id: number): Promise<OpsFirma> {
    return apiFetch<OpsFirma>(`/ops/firmalar/${id}/askiya-al/`, {
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
  listKontaklar(firmaId: number): Promise<OpsFirmaKontak[]> {
    return apiFetch<OpsFirmaKontak[]>(`/ops/firmalar/${firmaId}/kontaklar/`);
  },
  createKontak(
    firmaId: number,
    data: Omit<OpsFirmaKontak, "id">
  ): Promise<OpsFirmaKontak> {
    return apiFetch<OpsFirmaKontak>(`/ops/firmalar/${firmaId}/kontaklar/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listAdresler(firmaId: number): Promise<OpsFirmaAdres[]> {
    return apiFetch<OpsFirmaAdres[]>(`/ops/firmalar/${firmaId}/adresler/`);
  },
  createAdres(
    firmaId: number,
    data: Omit<OpsFirmaAdres, "id">
  ): Promise<OpsFirmaAdres> {
    return apiFetch<OpsFirmaAdres>(`/ops/firmalar/${firmaId}/adresler/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listBanka(firmaId: number): Promise<OpsFirmaBanka[]> {
    return apiFetch<OpsFirmaBanka[]>(`/ops/firmalar/${firmaId}/banka/`);
  },
  createBanka(
    firmaId: number,
    data: Omit<OpsFirmaBanka, "id">
  ): Promise<OpsFirmaBanka> {
    return apiFetch<OpsFirmaBanka>(`/ops/firmalar/${firmaId}/banka/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listBelgeler(firmaId: number): Promise<OpsFirmaBelge[]> {
    return apiFetch<OpsFirmaBelge[]>(`/ops/firmalar/${firmaId}/belgeler/`);
  },
  createBelge(
    firmaId: number,
    data: Omit<OpsFirmaBelge, "id">
  ): Promise<OpsFirmaBelge> {
    return apiFetch<OpsFirmaBelge>(`/ops/firmalar/${firmaId}/belgeler/`, {
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
  listKanalIzinleri(durum?: string): Promise<OpsKanalIzniPage> {
    const query = durum ? `?${new URLSearchParams({ durum }).toString()}` : "";
    return apiFetch<OpsKanalIzniPage>(`/ops/kanal-izinleri/${query}`);
  },
  onaylaKanalIzni(id: number): Promise<OpsKanalIzni> {
    return apiFetch<OpsKanalIzni>(`/ops/kanal-izinleri/${id}/onayla/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  reddetKanalIzni(id: number): Promise<OpsKanalIzni> {
    return apiFetch<OpsKanalIzni>(`/ops/kanal-izinleri/${id}/reddet/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listKullanicilar(firmaId?: number | string): Promise<FirmaKullanici[]> {
    const q =
      firmaId !== undefined && String(firmaId).trim() !== ""
        ? `?${new URLSearchParams({ firma_id: String(firmaId).trim() }).toString()}`
        : "";
    return apiFetch<FirmaKullanici[]>(`/firma/kullanicilar/${q}`);
  },
  updateKullanici(
    userId: number,
    data: { rol?: string; aktif?: boolean }
  ): Promise<FirmaKullanici> {
    return apiFetch<FirmaKullanici>(`/firma/kullanicilar/${userId}/`, {
      method: "PATCH",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  listAliciKanalErisimleri(firmaId?: number): Promise<{
    count: number;
    results: OpsAliciKanalErisimi[];
  }> {
    const q = firmaId ? `?firma_id=${firmaId}` : "";
    return apiFetch(`/ops/alici-kanal-erisimleri/${q}`);
  },
  createAliciKanalErisimi(data: {
    firma_id: number;
    satis_kanali_id: number;
    fiyat_grubu_id: number;
    aktif?: boolean;
  }): Promise<OpsAliciKanalErisimi> {
    return apiFetch<OpsAliciKanalErisimi>("/ops/alici-kanal-erisimleri/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  toggleAliciKanalErisimi(id: number): Promise<OpsAliciKanalErisimi> {
    return apiFetch<OpsAliciKanalErisimi>(
      `/ops/alici-kanal-erisimleri/${id}/toggle/`,
      {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
  listFiyatGruplari(): Promise<{ count: number; results: OpsFiyatGrubu[] }> {
    return apiFetch("/ops/fiyat-gruplari/");
  },
  listSalesChannels(): Promise<SalesChannelOption[] | { results: SalesChannelOption[] }> {
    return apiFetch("/sales-channels/");
  },
};

export type OpsOrderLineRow = {
  id: number;
  varyant_id: number;
  platform_kodu?: string;
  miktar: string;
  birim: string;
  para_birimi: string;
  satir_tutari: string;
  teslim_modeli?: string;
};

export type OpsHazirlamaEmriRow = {
  id: number;
  tedarikci_firma_id: number;
  tedarikci_ad?: string;
  durum: string;
  teslim_modeli?: string;
  hazir_zamani?: string | null;
};

export type OpsOrderRow = {
  id: number;
  durum: string;
  alici_firma_id?: number;
  alici_firma_ad?: string;
  olusturma_tarihi?: string | null;
  toplamlar?: Record<string, string>;
  satir_sayisi?: number;
  satirlar?: OpsOrderLineRow[];
  hazirlama_emirleri?: OpsHazirlamaEmriRow[];
};

export const opsOrdersService = {
  listAll(params?: {
    durum?: string;
    alici_firma_id?: number;
  }): Promise<{ results: OpsOrderRow[]; count?: number }> {
    const search = new URLSearchParams();
    if (params?.durum) search.set("durum", params.durum);
    if (params?.alici_firma_id)
      search.set("alici_firma_id", String(params.alici_firma_id));
    const q = search.toString() ? `?${search.toString()}` : "";
    return apiFetch(`/ops/orders/${q}`);
  },
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
    data: {
      tutar: string;
      yontem: string;
      para_birimi?: string;
      aciklama?: string;
      dekont_ref?: string;
    }
  ): Promise<{ ledger_entry_id: number; tutar: string; para_birimi?: string }> {
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
