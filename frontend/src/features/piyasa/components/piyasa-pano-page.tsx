"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Maximize2,
  Minimize2,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { useLivePanoStatus } from "../hooks";
import type { OnsOzet, PiyasaPanoSatir } from "../types";
import { Button } from "@/components/ui/button";
import { BuyerPanoTercihCard } from "./buyer-pano-tercih-card";
import { FeedHealthAlert } from "./feed-health-alert";
import { LiveStatusBadge } from "./live-status";

function formatPrice(v: string | null | undefined, ondalik = 2): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });
}

function formatPct(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function weightLabel(r: PiyasaPanoSatir): string {
  const kod = (r.kod || "").toLowerCase();
  if ((r.bolum || "").toUpperCase() === "DOVIZ") {
    if (kod === "usd") return "Dolar";
    if (kod === "eur") return "Euro";
    if (kod === "gbp") return "Sterlin";
    if (kod === "chf") return "Frank";
    return "Kur";
  }
  if ((r.olcek || "").toUpperCase() === "ONS") return "$";
  if ((r.olcek || "").toUpperCase() === "KG") return "1 Kg";
  const g = r.gram != null ? Number(r.gram) : NaN;
  if (Number.isFinite(g) && g !== 1) {
    return `${g.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}g`;
  }
  return "Gr";
}

function yonUp(yon?: string): boolean | null {
  if (yon === "up") return true;
  if (yon === "down") return false;
  return null;
}

function KpiCards({
  rows,
  ozet,
}: {
  rows: PiyasaPanoSatir[];
  ozet?: OnsOzet | null;
}) {
  const byKod = useMemo(() => {
    const m = new Map<string, PiyasaPanoSatir>();
    for (const r of rows) m.set((r.kod || "").toLowerCase(), r);
    return m;
  }, [rows]);

  const bugun = ozet?.donemler?.find((d) => d.etiket === "Bugün");

  const cards = [
    {
      key: "has",
      title: "HAS ALTIN (GR)",
      row: byKod.get("has"),
      change: bugun?.degisim_yuzde ?? null,
      changeYon: bugun?.yon ?? undefined,
    },
    {
      key: "ons",
      title: "ONS ALTIN ($)",
      row: byKod.get("ons"),
      change: null as string | null,
      changeYon: undefined as string | undefined,
    },
    {
      key: "usd",
      title: "USD / TRY",
      row: byKod.get("usd"),
      change: null as string | null,
      changeYon: undefined as string | undefined,
    },
    {
      key: "eur",
      title: "EUR / TRY",
      row: byKod.get("eur"),
      change: null as string | null,
      changeYon: undefined as string | undefined,
    },
  ].map((c) => {
    const yon =
      c.changeYon || c.row?.yon_satis || c.row?.yon_alis || undefined;
    return { ...c, yon };
  });

  if (!cards.some((c) => c.row)) return null;

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((kpi) => {
        const r = kpi.row;
        const up = yonUp(kpi.yon);
        const buy = r
          ? formatPrice(r.alis ?? r.fiyat, r.ondalik ?? 2)
          : "—";
        const sell = r
          ? formatPrice(r.satis ?? r.fiyat, r.ondalik ?? 2)
          : "—";
        return (
          <div
            key={kpi.key}
            className="rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-amber-500/40"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">
                {kpi.title}
              </span>
              {kpi.change != null || up != null ? (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    up === true
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : up === false
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {up === true ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : up === false ? (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  ) : null}
                  {kpi.change != null ? formatPct(kpi.change) : up != null ? (up ? "▲" : "▼") : "—"}
                </span>
              ) : null}
            </div>
            <div className="flex items-baseline justify-between gap-3 tabular-nums">
              <div>
                <span className="block text-[10px] uppercase text-muted-foreground">
                  Alış
                </span>
                <span className="text-sm font-semibold text-foreground/80">
                  {r?.alis_goster === false ? "—" : buy}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                  Satış
                </span>
                <span className="text-lg font-bold tracking-tight text-foreground">
                  {r?.satis_goster === false ? "—" : sell}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HasOzetStrip({ ozet }: { ozet?: OnsOzet | null }) {
  const donemler = ozet?.donemler ?? [];
  if (!ozet?.ok || donemler.length === 0) return null;
  return (
    <section
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid="has-ozet-strip"
      aria-label="Has altın dönem özeti"
    >
      {donemler.map((d) => {
        const up = d.yon === "up";
        const down = d.yon === "down";
        const now = Number(d.fiyat);
        const ref = d.referans != null ? Number(d.referans) : NaN;
        const delta =
          Number.isFinite(now) && Number.isFinite(ref) ? now - ref : null;
        const deltaLabel =
          delta == null
            ? null
            : `${delta > 0 ? "+" : ""}${delta.toLocaleString("tr-TR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
        return (
          <div
            key={d.etiket}
            className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Has · {d.etiket}
            </p>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span
                className={`text-base font-bold tabular-nums ${
                  up
                    ? "text-emerald-600 dark:text-emerald-400"
                    : down
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                }`}
              >
                {formatPct(d.degisim_yuzde)}
              </span>
              {deltaLabel ? (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    up
                      ? "text-emerald-600/80 dark:text-emerald-400/80"
                      : down
                        ? "text-rose-600/80 dark:text-rose-400/80"
                        : "text-muted-foreground"
                  }`}
                >
                  {deltaLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
              şimdi {formatPrice(d.fiyat, 2)}
              {d.referans ? ` · baş ${formatPrice(d.referans, 2)}` : ""}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function PriceCard({
  title,
  rows,
}: {
  title: string;
  rows: PiyasaPanoSatir[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <h2 className="flex items-center gap-2 text-xs font-bold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {title}
        </h2>
        <span className="text-[10px] font-medium text-muted-foreground">
          {rows.length} kalem
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Ürün</th>
              <th className="px-3 py-1.5 text-right font-semibold">Alış</th>
              <th className="px-3 py-1.5 text-right font-semibold">Satış</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 text-[13px] tabular-nums">
            {rows.map((r) => {
              const up = yonUp(r.yon_satis || r.yon_alis);
              return (
                <tr
                  key={r.kod}
                  className="transition-colors hover:bg-amber-500/[0.06]"
                >
                  <td className="px-3 py-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-foreground">
                        {r.ad || r.kod}
                      </span>
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {weightLabel(r)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-foreground/75">
                    {r.alis_goster === false
                      ? "—"
                      : formatPrice(r.alis ?? r.fiyat, r.ondalik ?? 2)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1 font-bold text-foreground">
                      {r.satis_goster === false
                        ? "—"
                        : formatPrice(r.satis ?? r.fiyat, r.ondalik ?? 2)}
                      {up === true ? (
                        <span className="text-[10px] text-emerald-500">▲</span>
                      ) : up === false ? (
                        <span className="text-[10px] text-rose-500">▼</span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function useBoardSections(rows: PiyasaPanoSatir[]) {
  return useMemo(() => {
    const gramImalat: PiyasaPanoSatir[] = [];
    const ayarBilezik: PiyasaPanoSatir[] = [];
    const gumus: PiyasaPanoSatir[] = [];
    const sarrafiyeYeni: PiyasaPanoSatir[] = [];
    const sarrafiyeEski: PiyasaPanoSatir[] = [];
    const doviz: PiyasaPanoSatir[] = [];

    const gramOrder = [
      "has",
      "hind_trabzon",
      "fantazi_akitma",
      "cnc_ajda_22",
      "gram24",
    ];
    const ayarOrder = [
      "22ayar",
      "rek_bilezik",
      "burma_bilezik",
      "ayar21",
      "14ayar",
      "cumhuriyet",
    ];

    for (const r of rows) {
      const grup = (r.grup || "").toUpperCase();
      const bolum = (r.bolum || "").toUpperCase();
      const varyant = (r.varyant_etiket || "").toUpperCase();
      const kod = (r.kod || "").toLowerCase();

      if (bolum === "DOVIZ" || ["usd", "eur", "gbp", "chf"].includes(kod)) {
        doviz.push(r);
        continue;
      }
      if (grup === "GUMUS") {
        gumus.push(r);
        continue;
      }
      if (
        grup === "HAS" &&
        (kod === "ons" || kod === "has_kg" || kod === "eur_kg")
      ) {
        continue;
      }
      if (grup === "SARRAFIYE" || varyant === "YENI" || varyant === "ESKI") {
        if (kod === "cumhuriyet") {
          ayarBilezik.push(r);
          continue;
        }
        if (varyant === "ESKI" || bolum === "ESKI_ALTIN") sarrafiyeEski.push(r);
        else sarrafiyeYeni.push(r);
        continue;
      }
      if (gramOrder.includes(kod)) {
        gramImalat.push(r);
        continue;
      }
      if (ayarOrder.includes(kod) || grup === "AYAR_GRAM") {
        ayarBilezik.push(r);
        continue;
      }
      if (grup === "ISCILIK") {
        if (
          kod.includes("bilezik") ||
          kod.includes("rek") ||
          kod.includes("burma")
        ) {
          ayarBilezik.push(r);
        } else {
          gramImalat.push(r);
        }
        continue;
      }
      if (grup === "HAS") {
        gramImalat.push(r);
        continue;
      }
      if (grup === "DIGER") {
        doviz.push(r);
        continue;
      }
      gramImalat.push(r);
    }

    const byOrder = (list: PiyasaPanoSatir[], order: string[]) =>
      [...list].sort((a, b) => {
        const ia = order.indexOf((a.kod || "").toLowerCase());
        const ib = order.indexOf((b.kod || "").toLowerCase());
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });

    return {
      gramImalat: byOrder(gramImalat, gramOrder),
      ayarBilezik: byOrder(ayarBilezik, ayarOrder),
      gumus,
      sarrafiyeYeni,
      sarrafiyeEski,
      doviz,
      gumusVeDoviz: [...gumus, ...doviz],
    };
  }, [rows]);
}

export type PiyasaBoardVariant = "portal" | "tv";

/**
 * Canlı piyasa panosu — kartlı KPI + fiyat tabloları.
 * `tv`: menüsüz pencere (ikinci monitör).
 */
export function PiyasaPanoPage({
  variant = "portal",
}: {
  variant?: PiyasaBoardVariant;
}) {
  const { user } = useAuth();
  const { q, gecikmeli, isDown, isLoading, isError } = useLivePanoStatus();
  const rows = q.data?.satirlar ?? [];
  const sections = useBoardSections(rows);
  const [isFs, setIsFs] = useState(false);

  const firma = user?.firma?.ad || "TaraGold";
  const baslik = (q.data?.baslik || "").trim() || firma;
  const now = q.data?.server_now
    ? new Date(q.data.server_now)
    : new Date();
  const isTv = variant === "tv";

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // tarayıcı reddetti
    }
  };

  const openTvWindow = () => {
    const url = `${window.location.origin}/piyasa/tv`;
    window.open(
      url,
      "taragold-piyasa-tv",
      "popup=yes,width=1280,height=800"
    );
  };

  return (
    <div
      className={
        isTv
          ? "flex h-dvh flex-col overflow-hidden bg-background text-foreground"
          : "flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
      }
      data-testid="piyasa-board-fit"
    >
      {isTv ? (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-foreground">
              Canlı Piyasa
            </h1>
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
              {baslik}
            </span>
            <LiveStatusBadge
              kaynak={isDown ? "FAIL" : q.data?.kaynak}
              gecikmeli={gecikmeli}
              isError={isError}
              isLoading={isLoading}
              size="sm"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="hidden items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground sm:flex">
              <Clock className="h-3 w-3 text-amber-500" />
              <span>{now.toLocaleTimeString("tr-TR")}</span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2 bg-foreground text-[11px] text-background hover:bg-foreground/90 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
              onClick={() => void toggleFullscreen()}
            >
              {isFs ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  Çık
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Tam Ekran
                </>
              )}
            </Button>
          </div>
        </header>
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-1.5 border-b border-border px-3 py-1 sm:px-4">
          <span className="mr-auto rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            {baslik}
          </span>
          <div className="hidden items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground sm:flex">
            <Clock className="h-3 w-3 text-amber-500" />
            <span>{now.toLocaleTimeString("tr-TR")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={openTvWindow}
            title="Ayrı pencere — TV/2. monitör"
          >
            <Monitor className="h-3.5 w-3.5" />
            TV
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 px-2 bg-foreground text-[11px] text-background hover:bg-foreground/90 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
            onClick={() => void toggleFullscreen()}
          >
            {isFs ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                Çık
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Tam Ekran
              </>
            )}
          </Button>
        </div>
      )}

      <div
        className={
          isTv
            ? "min-h-0 flex-1 space-y-2 overflow-auto p-2"
            : "min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 sm:px-4"
        }
      >
        {!isTv ? <BuyerPanoTercihCard /> : null}

        <div className="empty:hidden">
          <FeedHealthAlert />
          {q.isError ? (
            <p className="mt-1 text-xs text-destructive">
              Pano yanıt vermedi — canlı veri yok.
            </p>
          ) : null}
        </div>

        <KpiCards rows={rows} ozet={q.data?.ons_ozet} />
        <HasOzetStrip ozet={q.data?.ons_ozet} />

        <div className="grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2">
          <div className="space-y-2.5">
            <PriceCard title="Sarrafiye — Yeni" rows={sections.sarrafiyeYeni} />
            <PriceCard title="Has & gram / imalat" rows={sections.gramImalat} />
            <PriceCard title="Ayar & bilezik" rows={sections.ayarBilezik} />
          </div>
          <div className="space-y-2.5">
            <PriceCard title="Sarrafiye — Eski" rows={sections.sarrafiyeEski} />
            <PriceCard
              title="Gümüş & döviz kurları"
              rows={sections.gumusVeDoviz}
            />
          </div>
        </div>

        <footer className="flex flex-col items-center justify-between gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground sm:flex-row">
          <span>
            {q.data?.referans_ibaresi ||
              "Referans fiyatlardır — yatırım tavsiyesi değildir."}
          </span>
          <span className="tabular-nums">{firma}</span>
        </footer>
      </div>
    </div>
  );
}
