import { describe, expect, it } from "vitest";
import { isPositiveDecimal, parseDecimalTr } from "./parse-decimal";

describe("parseDecimalTr", () => {
  it("virgüllü TR ondalık", () => {
    expect(parseDecimalTr("1,5")).toBe(1.5);
    expect(parseDecimalTr("1.234,56")).toBe(1234.56);
  });

  it("noktalı EN ondalık", () => {
    expect(parseDecimalTr("1.5")).toBe(1.5);
  });

  it("geçersiz → null", () => {
    expect(parseDecimalTr("")).toBeNull();
    expect(parseDecimalTr("abc")).toBeNull();
    expect(parseDecimalTr("1,2,3")).toBeNull();
  });

  it("NaN sayısı → null", () => {
    expect(parseDecimalTr(Number.NaN)).toBeNull();
  });
});

describe("isPositiveDecimal", () => {
  it("pozitif geçer", () => {
    expect(isPositiveDecimal("1,5")).toBe(true);
    expect(isPositiveDecimal("0")).toBe(false);
    expect(isPositiveDecimal("-1")).toBe(false);
    expect(isPositiveDecimal("abc")).toBe(false);
  });
});
