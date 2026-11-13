import type { components } from "@/lib/api/schema";

export type ShipmentPodInfo = {
  teslim_alan?: string;
  notlar?: string;
  belgeler_ref?: string;
  olusturma_tarihi?: string | null;
};

export type OpsShipment = components["schemas"]["OpsShipment"] & {
  kargo_firma?: string;
  takip_no?: string;
  notlar?: string;
  pod?: ShipmentPodInfo | null;
  olusturma_tarihi?: string | null;
  guncelleme_tarihi?: string | null;
};
export type OpsShipmentPage = components["schemas"]["OpsShipmentPage"];
export type BuyerReturn = components["schemas"]["BuyerReturn"];
export type BuyerReturnPage = components["schemas"]["BuyerReturnPage"];
export type BuyerShipment = components["schemas"]["BuyerShipment"] & {
  kargo_firma?: string;
  takip_no?: string;
  notlar?: string;
  pod?: ShipmentPodInfo | null;
  olusturma_tarihi?: string | null;
  guncelleme_tarihi?: string | null;
};
export type DispatchShipmentRequest = {
  kargo_firma: string;
  takip_no: string;
};
export type PodRequest = components["schemas"]["OpsPodRequest"];
export type ShipmentCreateRequest =
  components["schemas"]["OpsShipmentCreateRequest"];

export type CreateReturnRequest = {
  order_id: number;
  shipment_id: number;
  sebep: string;
  notlar?: string;
  lines: Array<{
    order_line_id: number;
    miktar: string;
  }>;
};

export type BuyerReturnDetail = BuyerReturn & {
  shipment_id?: number | null;
  sebep?: string;
  notlar?: string;
  olusturma_tarihi?: string | null;
  stok_iade_yapildi?: boolean;
  finans_mahsup_yapildi?: boolean;
  lines?: Array<{
    id?: number;
    order_line_id: number;
    miktar: string;
  }>;
};
