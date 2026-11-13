import { apiFetch } from "@/lib/api/client";
import type {
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
};

