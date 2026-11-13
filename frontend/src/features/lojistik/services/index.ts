import { apiDownload, apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  BuyerReturn,
  BuyerReturnDetail,
  BuyerReturnPage,
  BuyerShipment,
  BuyerShipmentPodResponse,
  CreateReturnRequest,
  DispatchShipmentRequest,
  OpsShipment,
  OpsShipmentPage,
  PodRequest,
  ShipmentCreateRequest,
} from "../types";

export const lojistikService = {
  getShipments(): Promise<OpsShipmentPage> {
    return apiFetch<OpsShipmentPage>("/ops/shipments/");
  },
  getOpsShipmentDetail(id: number | string): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/`);
  },
  getBuyerShipments(
    params?: Record<string, string>
  ): Promise<Paginated<BuyerShipment>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch(`/shipments/${query}`);
  },
  getBuyerShipmentDetail(id: number | string): Promise<BuyerShipment> {
    return apiFetch<BuyerShipment>(`/shipments/${id}/`);
  },
  getBuyerShipmentPod(id: number | string): Promise<BuyerShipmentPodResponse> {
    return apiFetch<BuyerShipmentPodResponse>(`/shipments/${id}/pod/`);
  },
  submitBuyerPod(
    id: number | string,
    data: PodRequest
  ): Promise<BuyerShipment> {
    return apiFetch<BuyerShipment>(`/shipments/${id}/pod/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  downloadBuyerShipmentPod(id: number | string): Promise<void> {
    return apiDownload(
      `/shipments/${id}/pod/?download=1`,
      `pod-shipment-${id}.txt`
    );
  },
  createShipment(data: ShipmentCreateRequest): Promise<OpsShipment> {
    return apiFetch<OpsShipment>("/ops/shipments/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  prepareShipment(id: number | string): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/prepare/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  dispatchShipment(
    id: number | string,
    data: DispatchShipmentRequest
  ): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/dispatch/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  deliverShipment(id: number | string): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/deliver/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  cancelShipment(id: number | string): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/cancel/`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  submitPod(id: number | string, data: PodRequest): Promise<OpsShipment> {
    return apiFetch<OpsShipment>(`/ops/shipments/${id}/pod/`, {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getReturns(): Promise<BuyerReturnPage> {
    return apiFetch<BuyerReturnPage>("/returns/");
  },
  createReturn(data: CreateReturnRequest): Promise<BuyerReturnDetail> {
    return apiFetch<BuyerReturnDetail>("/returns/", {
      method: "POST",
      body: {
        ...data,
        iade_sebebi: data.iade_sebebi ?? data.sebep,
      },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  getReturnDetail(id: number | string): Promise<BuyerReturnDetail> {
    return apiFetch<BuyerReturnDetail>(`/returns/${id}/`);
  },
  submitReturn(id: number | string): Promise<BuyerReturn> {
    return apiFetch<BuyerReturn>(`/returns/${id}/submit/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  approveReturn(id: number | string): Promise<BuyerReturn> {
    return apiFetch<BuyerReturn>(`/returns/${id}/approve/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  rejectReturn(id: number | string, reason?: string): Promise<BuyerReturn> {
    return apiFetch<BuyerReturn>(`/returns/${id}/reject/`, {
      method: "POST",
      body: reason ? { reason } : {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  cancelReturn(id: number | string): Promise<BuyerReturn> {
    return apiFetch<BuyerReturn>(`/returns/${id}/cancel/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  mahsupReturn(id: number | string): Promise<BuyerReturn> {
    return apiFetch<BuyerReturn>(`/returns/${id}/mahsup/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
