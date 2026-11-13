import type { components } from "@/lib/api/schema";

export type InspectionMeasurementItem = {
  id: number;
  order_line_id: number;
  birim?: string;
  beklenen?: string;
  olculen: string;
  sapma_abs?: string;
  sonuc?: string;
  override_uygulandi?: boolean;
  olusturma_tarihi?: string | null;
};

export type OpsInspection = components["schemas"]["OpsInspection"] & {
  order_line_id?: number | null;
  shipment_blok?: boolean;
  notlar?: string;
  measurements?: InspectionMeasurementItem[];
  olusturma_tarihi?: string | null;
};
export type OpsInspectionPage = components["schemas"]["OpsInspectionPage"];
export type InspectionMeasurementRequest =
  components["schemas"]["OpsMeasurementRequest"];
export type InspectionCreateRequest =
  components["schemas"]["OpsInspectionCreateRequest"];
