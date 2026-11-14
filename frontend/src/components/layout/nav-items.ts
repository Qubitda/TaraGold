import type { ComponentType } from "react";
import {
  Building2,
  Sliders,
  Gem,
  Tag,
  Boxes,
  ShoppingCart,
  Receipt,
  CheckCircle,
  Truck,
  FileText,
  Briefcase,
  User,
  BarChart3,
} from "lucide-react";
import type { Capabilities } from "@/lib/api/types";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredCapability?: keyof Capabilities;
  /** Herhangi biri yeterli (route guard ile aynı mantık). */
  requiredAnyOf?: (keyof Capabilities)[];
}

export const DOMAIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/firmalar",
    label: "Firmalar",
    icon: Building2,
    requiredCapability: "can_manage_org",
  },
  {
    href: "/tanimlar",
    label: "Tanımlar & Kanallar",
    icon: Sliders,
    requiredCapability: "can_view_ops",
  },
  {
    href: "/urunler",
    label: "Ürünler & Katalog",
    icon: Gem,
    requiredCapability: "can_view_catalog",
  },
  {
    href: "/fiyatlama",
    label: "Fiyatlama",
    icon: Tag,
    requiredCapability: "can_lock_quote",
  },
  {
    href: "/stok",
    label: "Stok & Depolar",
    icon: Boxes,
    requiredCapability: "can_view_supplier_stock",
  },
  {
    href: "/siparis",
    label: "Siparişler",
    icon: ShoppingCart,
    requiredCapability: "can_view_orders",
  },
  {
    href: "/finans",
    label: "Finans & Cari",
    icon: Receipt,
    requiredCapability: "can_view_finance",
  },
  {
    href: "/kalite",
    label: "Kalite Kontrol",
    icon: CheckCircle,
    requiredCapability: "can_manage_qc",
  },
  {
    href: "/lojistik",
    label: "Lojistik & İadeler",
    icon: Truck,
    requiredCapability: "can_view_shipments",
  },
  {
    href: "/belgeler",
    label: "Belgeler",
    icon: FileText,
    requiredAnyOf: [
      "can_view_shipments",
      "can_view_orders",
      "can_view_ops",
      "can_manage_shipment",
    ],
  },
  {
    href: "/teklifler",
    label: "Tedarikçi Teklif & RFQ",
    icon: Briefcase,
    requiredCapability: "can_manage_offers",
  },
  {
    href: "/profil",
    label: "Profil",
    icon: User,
  },
  {
    href: "/raporlar",
    label: "Raporlar & Analitik",
    icon: BarChart3,
    requiredCapability: "can_view_ops",
  },
];
