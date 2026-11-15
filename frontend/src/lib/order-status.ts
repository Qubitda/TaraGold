/**
 * Sipariş durum sözlüğü — tek kaynak (docs/SPEC.md §4 / ADR-0038).
 * Başka dosyada durum etiketi tanımlanmaz.
 */

export const ORDER_STATUSES = [
  "OLUSTURULDU",
  "ONAY_BEKLIYOR",
  "ONAYLANDI",
  "HAZIRLANIYOR",
  "HAZIR",
  "REDDEDILDI",
  "IPTAL",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderStatusBadge = "success" | "destructive" | "warning" | "outline";

type StatusMeta = {
  buyerLabel: string;
  adminLabel: string;
  badge: OrderStatusBadge;
  next: readonly OrderStatus[];
};

const META: Record<OrderStatus, StatusMeta> = {
  OLUSTURULDU: {
    buyerLabel: "Oluşturuldu",
    adminLabel: "Oluşturuldu (legacy)",
    badge: "outline",
    next: ["ONAYLANDI", "IPTAL", "REDDEDILDI"],
  },
  ONAY_BEKLIYOR: {
    buyerLabel: "Onay bekliyor",
    adminLabel: "Onay havuzunda",
    badge: "warning",
    next: ["ONAYLANDI", "REDDEDILDI", "IPTAL"],
  },
  ONAYLANDI: {
    buyerLabel: "Onaylandı",
    adminLabel: "Tedarikçiye iletildi",
    badge: "success",
    next: ["HAZIRLANIYOR"],
  },
  HAZIRLANIYOR: {
    buyerLabel: "Hazırlanıyor",
    adminLabel: "Hazırlanıyor",
    badge: "warning",
    next: ["HAZIR"],
  },
  HAZIR: {
    buyerLabel: "Hazırlandı",
    adminLabel: "Hazır",
    badge: "success",
    next: [],
  },
  REDDEDILDI: {
    buyerLabel: "Reddedildi",
    adminLabel: "Reddedildi",
    badge: "destructive",
    next: [],
  },
  IPTAL: {
    buyerLabel: "İptal",
    adminLabel: "İptal",
    badge: "outline",
    next: [],
  },
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function orderStatusLabel(
  durum: string,
  audience: "buyer" | "admin" = "buyer"
): string {
  if (!isOrderStatus(durum)) return durum.replace(/_/g, " ");
  return audience === "admin" ? META[durum].adminLabel : META[durum].buyerLabel;
}

export function orderStatusBadge(durum: string): OrderStatusBadge {
  if (!isOrderStatus(durum)) return "outline";
  return META[durum].badge;
}

export function orderStatusNext(durum: string): readonly OrderStatus[] {
  if (!isOrderStatus(durum)) return [];
  return META[durum].next;
}

export const TAHMINI_FIYAT_ACIKLAMA =
  "Kesin fiyat siparişiniz onaylandığında güncel kura göre belirlenir.";
