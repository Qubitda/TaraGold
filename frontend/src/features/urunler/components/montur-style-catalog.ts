/** Montür parça rolleri + stil etiket yardımcıları (Tanımlar kaynaklı kodlar). */

export type MonturParcaRolu = "FULL" | "HEAD" | "BAND";

export type StyleOpt = { kod: string; ad: string };

export function styleLabel(
  list: StyleOpt[],
  kod: string | undefined | null
): string {
  if (!kod) return "—";
  return list.find((s) => s.kod === kod)?.ad ?? kod;
}

export function stillerFromRefs(
  items?: Array<{ kod?: string; ad?: string }>
): StyleOpt[] {
  return (items ?? [])
    .filter((i) => i.kod)
    .map((i) => ({
      kod: String(i.kod),
      ad: i.ad || String(i.kod),
    }));
}