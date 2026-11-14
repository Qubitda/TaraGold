import { apiFetch } from "@/lib/api/client";
import type {
  MarjKuraliRow,
  MarjKuraliWriteRequest,
  MarjKurallariPage,
  OpsCanliPiyasaResponse,
  OpsMarjPolitikasi,
  OpsMarjPolitikasiPatchRequest,
  PiyasaOlcek,
  PiyasaPano,
} from "../types";

export const piyasaService = {
  getPano(olcek?: PiyasaOlcek): Promise<PiyasaPano> {
    const q =
      olcek && String(olcek).trim()
        ? `?olcek=${encodeURIComponent(String(olcek).trim().toUpperCase())}`
        : "";
    return apiFetch<PiyasaPano>(`/piyasa/pano/${q}`);
  },
  getOpsMarjPolitikasi(): Promise<OpsMarjPolitikasi> {
    return apiFetch<OpsMarjPolitikasi>("/ops/piyasa/marj-politikasi/");
  },
  updateOpsMarjPolitikasi(
    data: OpsMarjPolitikasiPatchRequest
  ): Promise<OpsMarjPolitikasi> {
    return apiFetch<OpsMarjPolitikasi>("/ops/piyasa/marj-politikasi/", {
      method: "PATCH",
      body: data,
    });
  },
  getOpsCanliPiyasa(): Promise<OpsCanliPiyasaResponse> {
    return apiFetch<OpsCanliPiyasaResponse>("/ops/piyasa/canli/");
  },
  getMarjKurallari(params?: Record<string, string | undefined>): Promise<MarjKurallariPage> {
    const sp = new URLSearchParams();
    sp.set("include_refs", "1");
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && String(v).trim() !== "") sp.set(k, String(v));
      }
    }
    const q = sp.toString();
    return apiFetch<MarjKurallariPage>(`/ops/piyasa/marj-kurallari/${q ? `?${q}` : ""}`);
  },
  createMarjKurali(data: MarjKuraliWriteRequest): Promise<MarjKuraliRow> {
    return apiFetch<MarjKuraliRow>("/ops/piyasa/marj-kurallari/", {
      method: "POST",
      body: data,
    });
  },
  updateMarjKurali(
    id: number | string,
    data: Partial<MarjKuraliWriteRequest>
  ): Promise<MarjKuraliRow> {
    return apiFetch<MarjKuraliRow>(`/ops/piyasa/marj-kurallari/${id}/`, {
      method: "PATCH",
      body: data,
    });
  },
  deleteMarjKurali(id: number | string): Promise<{ deleted: boolean; id: number }> {
    return apiFetch<{ deleted: boolean; id: number }>(
      `/ops/piyasa/marj-kurallari/${id}/`,
      { method: "DELETE" }
    );
  },
};


