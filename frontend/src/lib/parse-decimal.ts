/**
 * TR/EN ondalık ayrıştırma — NaN ve virgüllü girişleri doğrular.
 * Boş → null; geçersiz → null.
 */
export function parseDecimalTr(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  let s = String(raw).trim();
  if (!s) return null;
  // "1.234,56" → "1234.56" ; "1,5" → "1.5" ; "1.5" → "1.5"
  if (/,/.test(s) && /\./.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/,/.test(s)) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isPositiveDecimal(raw: string | number | null | undefined): boolean {
  const n = parseDecimalTr(raw);
  return n != null && n > 0;
}
