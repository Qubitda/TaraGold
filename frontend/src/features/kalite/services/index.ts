import { apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type {
  InspectionCreateRequest,
  InspectionMeasurementRequest,
  OpsInspection,
  OpsInspectionPage,
} from "../types";

export interface InspectionListParams {
  q?: string;
  durum?: string;
  page?: number;
  page_size?: number;
}

export const kaliteService = {
  getInspections(params?: InspectionListParams): Promise<OpsInspectionPage> {
    const sp = new URLSearchParams();
    if (params?.q?.trim()) sp.set("q", params.q.trim());
    if (params?.durum) sp.set("durum", params.durum);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.page_size) sp.set("page_size", String(params.page_size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return apiFetch<OpsInspectionPage>(`/ops/inspections/${qs}`);
  },
  getInspectionDetail(id: number | string): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/`);
  },
  createInspection(data: InspectionCreateRequest): Promise<OpsInspection> {
    return apiFetch<OpsInspection>("/ops/inspections/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  startInspection(id: number | string): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/start/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  addMeasurement(
    id: number | string,
    data: InspectionMeasurementRequest
  ): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/measurements/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  passInspection(id: number | string): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/pass/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  failInspection(id: number | string): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/fail/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  cancelInspection(id: number | string): Promise<OpsInspection> {
    return apiFetch<OpsInspection>(`/ops/inspections/${id}/cancel/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
