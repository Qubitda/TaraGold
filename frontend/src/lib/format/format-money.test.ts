import { describe, expect, it } from "vitest";
import { formatMoney, pickDisplayPrice } from "./index";

describe("formatMoney", () => {
  it("boş string için em dash döner", () => {
    expect(formatMoney("")).toBe("—");
    expect(formatMoney("   ")).toBe("—");
  });

  it("null/undefined için em dash döner", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("NaN için em dash döner", () => {
    expect(formatMoney("abc")).toBe("—");
  });

  it("geçersiz para biriminde çökmez", () => {
    expect(() => formatMoney("10", "NOT_A_CURRENCY")).not.toThrow();
    expect(formatMoney("10", "NOT_A_CURRENCY")).toMatch(/10/);
  });
});

describe("pickDisplayPrice", () => {
  it("toplam öncelikli", () => {
    expect(
      pickDisplayPrice({
        toplam: "100",
        gram_basi: "5",
        birim: "1",
      })
    ).toBe("100");
  });

  it("undefined string'i atlar", () => {
    expect(
      pickDisplayPrice({
        toplam: "undefined",
        gram_basi: "12.5",
      })
    ).toBe("12.5");
  });

  it("hepsi boşsa null", () => {
    expect(pickDisplayPrice({ toplam: "", gram_basi: null })).toBeNull();
  });
});
