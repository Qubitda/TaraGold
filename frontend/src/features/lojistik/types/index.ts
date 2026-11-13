import type { components } from "@/lib/api/schema";

export type ShipmentPodInfo = {
  id?: number;
  teslim_alan?: string;
  notlar?: string;
  belgeler_ref?: string;
  olusturma_tarihi?: string | null;
};

export type OpsShipment = components["schemas"]["OpsShipment"] & {
  kargo_firma?: string;
  tasiyici?: string | null;
  takip_no?: string;
  teslim_modeli?: string;
  sevk_yonu?: string;
  notlar?: string;
  pod?: ShipmentPodInfo | null;
  olusturma_tarihi?: string | null;
  guncelleme_tarihi?: string | null;
};
export type OpsShipmentPage = Omit<
  components["schemas"]["OpsShipmentPage"],
  "results"
> & {
  results: OpsShipment[];
};
export type BuyerReturn = components["schemas"]["BuyerReturn"] & {
  iade_sebebi?: string | null;
  mahsup_tutari?: string | null;
};
export type BuyerReturnPage = components["schemas"]["BuyerReturnPage"];
export type BuyerShipment = components["schemas"]["BuyerShipment"] & {
  kargo_firma?: string;
  tasiyici?: string | null;
  takip_no?: string;
  teslim_modeli?: string;
  sevk_yonu?: string;
  notlar?: string;
  pod?: ShipmentPodInfo | null;
  olusturma_tarihi?: string | null;
  guncelleme_tarihi?: string | null;
};
export type BuyerShipmentPodResponse = {
  shipment_id: number;
  order_id: number;
  durum: string;
  tasiyici?: string | null;
  takip_no?: string;
  has_pod: boolean;
  pod?: ShipmentPodInfo | null;
  server_now: string;
};
export type DispatchShipmentRequest = {
  kargo_firma: string;
  tasiyici?: string;
  takip_no: string;
};
export type PodRequest = components["schemas"]["OpsPodRequest"];
export type ShipmentCreateRequest =
  components["schemas"]["OpsShipmentCreateRequest"] & {
    tasiyici?: string;
    teslim_modeli?: string;
    sevk_yonu?: string;
  };

export type CreateReturnRequest = {
  order_id: number;
  shipment_id: number;
  sebep: string;
  iade_sebebi?: string;
  notlar?: string;
  lines: Array<{
    order_line_id: number;
    miktar: string;
  }>;
};

export type BuyerReturnDetail = BuyerReturn & {
  shipment_id?: number | null;
  sebep?: string;
  iade_sebebi?: string | null;
  mahsup_tutari?: string | null;
  notlar?: string;
  olusturma_tarihi?: string | null;
  stok_iade_yapildi?: boolean;
  finans_mahsup_yapildi?: boolean;
  lines?: Array<{
    id?: number;
    order_line_id: number;
    miktar: string;
    birim?: string;
  }>;
};
