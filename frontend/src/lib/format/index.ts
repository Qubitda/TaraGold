/**
 * Görüntü formatları.
 * Nihai para/gram hesabı backend otoritesindedir (API_CONTRACT & ADR-0017).
 * Locale: tr-TR (Django LANGUAGE_CODE ile birebir paralel).
 */

export function formatMoney(
  value: string | number | null | undefined,
  currency = "TRY",
  locale = "tr-TR"
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || ""}`.trim();
  }
}

export function formatGram(
  value: string | number | null | undefined,
  locale = "tr-TR",
  digits = 3
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";

  try {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(n)} g`;
  } catch {
    return `${n} g`;
  }
}

export function formatDateTime(
  iso: string | null | undefined,
  locale = "tr-TR",
  timeZone = "Europe/Istanbul"
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatPercent(
  value: string | number | null | undefined,
  locale = "tr-TR",
  digits = 2
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";

  try {
    return `%${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(n)}`;
  } catch {
    return `%${n}`;
  }
}

/** Quote/lock gösterimi — toplam öncelikli; yoksa null (UI "—"). */
export function pickDisplayPrice(parts: {
  toplam?: string | null;
  gram_basi?: string | null;
  birim?: string | null;
}): string | null {
  for (const v of [parts.toplam, parts.gram_basi, parts.birim]) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s === "undefined" || s === "null") continue;
    const n = Number(s);
    if (Number.isFinite(n)) return s;
  }
  return null;
}
