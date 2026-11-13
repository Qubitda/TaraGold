"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { usePiyasaPano } from "../hooks";
import type { PiyasaOlcek } from "../types";

const OLCEK_OPTIONS: ReadonlyArray<{ label: string; value?: PiyasaOlcek }> = [
  { label: "Tümü", value: undefined },
  { label: "GR", value: "GRAM" },
  { label: "KG", value: "KG" },
  { label: "ONS", value: "ONS" },
];

function kaynakTone(kaynak: string): string {
  const k = kaynak.toUpperCase();
  if (k === "CANLI") return "text-emerald-600 dark:text-emerald-400";
  if (k === "FAIL") return "text-destructive";
  if (k === "LKG" || k === "MANUEL") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function olcekShort(olcek?: string): string {
  if (!olcek) return "";
  const o = olcek.toUpperCase();
  if (o === "GRAM") return "gr";
  if (o === "KG") return "kg";
  if (o === "ONS") return "ons";
  return o.toLowerCase();
}

/**
 * Header borsa şeridi — yalnız Buyer PiyasaPano alanları.
 * Yasak alanlar (alis_marj, satis_marj, marj_modu, detay/saf kur) asla gösterilmez.
 */
export function PiyasaPanoStrip() {
  const [olcek, setOlcek] = useState<PiyasaOlcek | undefined>(undefined);
  const q = usePiyasaPano(olcek);
  const rows = q.data?.satirlar ?? [];

  const banners = Array.from(
    new Set(
      rows
        .map((r) => r.banner?.trim())
        .filter((b): b is string => Boolean(b))
    )
  );
  const hasLkgOrWarn =
    banners.length > 0 ||
    rows.some((r) => {
      const k = r.kaynak.toUpperCase();
      return k === "LKG" || k === "FAIL";
    });

  if (q.isError) {
    const errMsg =
      q.error instanceof ApiError
        ? q.error.problem.detail || q.error.message
        : "Piyasa panosu alınamadı";
    return (
      <div
        className="hidden md:flex items-center gap-2 overflow-hidden text-[11px] text-muted-foreground"
        aria-live="polite"
        title={errMsg}
      >
        <span className="font-mono">Borsa</span>
        <span className="text-destructive">—</span>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="inline-flex items-center gap-1 rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
          aria-label="Piyasa panosunu yenile"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Yenile</span>
        </button>
      </div>
    );
  }

  if (q.isLoading && rows.length === 0) {
    return (
      <div
        className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground"
        aria-busy="true"
      >
        <span className="font-mono">Borsa</span>
        <span className="animate-pulse">…</span>
      </div>
    );
  }

  if (rows.length === 0 && !olcek) {
    return null;
  }

  return (
    <div
      className="hidden lg:flex min-w-0 max-w-[44vw] items-center gap-2.5 overflow-x-auto"
      aria-label="Piyasa panosu"
    >
      <div
        className="shrink-0 inline-flex items-center rounded-[5px] border border-border bg-muted/40 p-0.5"
        role="group"
        aria-label="Ölçek filtresi"
      >
        {OLCEK_OPTIONS.map((opt) => {
          const active = (olcek ?? "") === (opt.value ?? "");
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => setOlcek(opt.value)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-[4px] bg-background px-1.5 py-0.5 font-mono text-[9px] font-semibold text-foreground shadow-xs"
                  : "rounded-[4px] px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {hasLkgOrWarn ? (
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-amber-700 dark:text-amber-300"
          title={
            banners.length > 0
              ? banners.join(" · ")
              : "Bazı kurlar LKG / gecikmeli beslemeden okunuyor."
          }
        >
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
          <span>{banners[0] ? "LKG" : "UYARI"}</span>
        </span>
      ) : null}

      {rows.length === 0 ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          Bu ölçekte aktif pano satırı yok
        </span>
      ) : (
        rows.slice(0, 6).map((s) => {
          const titleParts = [
            s.ad || s.kod,
            s.olcek ? `Ölçek: ${s.olcek}` : null,
            s.guncelleme ? `Güncelleme: ${formatDateTime(s.guncelleme)}` : null,
            s.banner ? `Uyarı: ${s.banner}` : null,
          ].filter(Boolean);
          const unit = !olcek ? olcekShort(s.olcek) : "";

          return (
            <div
              key={s.kod}
              title={titleParts.join(" • ")}
              className="shrink-0 flex items-baseline gap-1.5 border-l border-border pl-2.5 first:border-l-0 first:pl-0"
            >
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {s.kod}
              </span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {formatMoney(s.fiyat, s.para_birimi)}
                {unit ? (
                  <span className="text-[9px] text-muted-foreground">/{unit}</span>
                ) : null}
              </span>
              <span className={`font-mono text-[9px] ${kaynakTone(s.kaynak)}`}>
                {s.kaynak}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

