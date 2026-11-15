import { describe, expect, it } from "vitest";
import type { Capabilities } from "@/lib/api/types";
import {
  DOMAIN_NAV_ITEMS,
  filterVisibleNavGroups,
  isNavItemVisible,
  NAV_GROUPS,
} from "./nav-items";

function caps(partial: Partial<Capabilities>): Capabilities {
  return partial as Capabilities;
}

describe("nav-items IA", () => {
  it("görev odaklı grup sırasını korur", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "genel",
      "operasyon",
      "ticari",
      "finans",
      "sistem",
      "analiz",
    ]);
  });

  it("capability yokken yalnızca herkese açık öğeleri bırakır", () => {
    const groups = filterVisibleNavGroups(caps({}));
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual(["piyasa", "overview"]);
    expect(groups.map((g) => g.id)).toEqual(["genel"]);
  });

  it("operasyon / sistem ayrımını capability ile uygular", () => {
    const groups = filterVisibleNavGroups(
      caps({
        can_view_orders: true,
        can_view_ops: true,
        can_manage_smtp: true,
      })
    );
    const byGroup = Object.fromEntries(
      groups.map((g) => [g.id, g.items.map((i) => i.id)])
    );
    expect(byGroup.operasyon).toContain("orders");
    expect(byGroup.sistem).toEqual(
      expect.arrayContaining(["definitions", "smtp"])
    );
    expect(byGroup.analiz).toEqual(["reports"]);
  });

  it("requiredCapability: stok & fiyat", () => {
    const item = DOMAIN_NAV_ITEMS.find((i) => i.id === "stock")!;
    expect(
      isNavItemVisible(item, caps({ can_view_supplier_stock: true }))
    ).toBe(true);
    expect(isNavItemVisible(item, caps({}))).toBe(false);
  });

  it("caps henüz yokken flash önlemek için görünür tutar", () => {
    expect(isNavItemVisible(DOMAIN_NAV_ITEMS[1]!, null)).toBe(true);
  });
});
