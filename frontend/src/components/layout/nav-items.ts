import type { ComponentType } from "react";
import {
  LayoutGrid,
  Building2,
  Sliders,
  Gem,
  Tag,
  Boxes,
  ShoppingCart,
  Wallet,
  CheckCircle,
  Truck,
  FileText,
  Briefcase,
  Users,
  BarChart3,
  Mail,
} from "lucide-react";
import type { Capabilities } from "@/lib/api/types";

export interface NavItem {
  /** React list key (href tekil olmayabilir). */
  id: string;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredCapability?: keyof Capabilities;
  /** Herhangi biri yeterli (route guard ile aynı mantık). */
  requiredAnyOf?: (keyof Capabilities)[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** Görev odaklı bilgi mimarisi — operasyon / ticari / sistem ayrımı. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "genel",
    label: "Genel",
    items: [
      {
        id: "overview",
        href: "/",
        label: "Genel Bakış",
        icon: LayoutGrid,
      },
    ],
  },
  {
    id: "operasyon",
    label: "Operasyon",
    items: [
      {
        id: "orders",
        href: "/siparis",
        label: "Sipariş Listem",
        icon: ShoppingCart,
        requiredCapability: "can_view_orders",
      },
      {
        id: "supplier-offers",
        href: "/fiyatlama",
        label: "Tedarikçi Teklifleri",
        icon: Briefcase,
        requiredCapability: "can_manage_offers",
      },
      {
        id: "stock",
        href: "/stok",
        label: "Stok & Depolar",
        icon: Boxes,
        requiredCapability: "can_view_supplier_stock",
      },
      {
        id: "logistics",
        href: "/lojistik",
        label: "Lojistik & İadeler",
        icon: Truck,
        requiredAnyOf: ["can_view_shipments", "can_manage_return"],
      },
      {
        id: "qc",
        href: "/kalite",
        label: "Kalite Kontrol",
        icon: CheckCircle,
        requiredCapability: "can_manage_qc",
      },
      {
        id: "documents",
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
    ],
  },
  {
    id: "ticari",
    label: "Ticari Yönetim",
    items: [
      {
        id: "firms",
        href: "/firmalar",
        label: "Firmalar",
        icon: Building2,
        requiredCapability: "can_manage_org",
      },
      {
        id: "catalog",
        href: "/urunler",
        label: "Ürünler & Katalog",
        icon: Gem,
        requiredCapability: "can_view_catalog",
      },
      {
        id: "pricing",
        href: "/fiyatlama",
        label: "Fiyatlandırma",
        icon: Tag,
        requiredCapability: "can_lock_quote",
      },
    ],
  },
  {
    id: "finans",
    label: "Finans",
    items: [
      {
        id: "finance",
        href: "/finans",
        label: "Finans & Cari",
        icon: Wallet,
        requiredAnyOf: ["can_view_finance", "can_view_ops_finance", "can_view_credit"],
      },
    ],
  },
  {
    id: "sistem",
    label: "Sistem Yönetimi",
    items: [
      {
        id: "definitions",
        href: "/tanimlar",
        label: "Tanımlar & Kanallar",
        icon: Sliders,
        requiredCapability: "can_view_ops",
      },
      {
        id: "smtp",
        href: "/ayarlar/eposta",
        label: "E-posta (SMTP)",
        icon: Mail,
        requiredCapability: "can_manage_smtp",
      },
      {
        id: "users-roles",
        href: "/firmalar",
        label: "Kullanıcılar & Roller",
        icon: Users,
        requiredAnyOf: ["can_manage_users", "can_manage_org"],
      },
    ],
  },
  {
    id: "analiz",
    label: "Analiz",
    items: [
      {
        id: "reports",
        href: "/raporlar",
        label: "Raporlar & Analitik",
        icon: BarChart3,
        requiredCapability: "can_view_ops",
      },
    ],
  },
  // Profil: sidebar footer'da; menüde tekrar yok
];

/** Düz liste — geriye uyumluluk / route guard taraması. */
export const DOMAIN_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function isNavItemVisible(
  item: NavItem,
  capabilities?: Capabilities | null
): boolean {
  const needsCap = Boolean(
    item.requiredCapability || item.requiredAnyOf?.length
  );
  if (!needsCap) return true;
  // Caps henüz yüklenmediyse gizleme (flash); yüklendiyse sıkı filtre
  if (!capabilities) return true;
  if (item.requiredCapability && capabilities[item.requiredCapability]) {
    return true;
  }
  if (item.requiredAnyOf?.some((k) => Boolean(capabilities[k]))) {
    return true;
  }
  return false;
}

export function filterVisibleNavGroups(
  capabilities?: Capabilities | null
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, capabilities)),
  })).filter((group) => group.items.length > 0);
}
