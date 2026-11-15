"use client";

import { useEffect, useState } from "react";
import { usePiyasaPano } from "../hooks";

function formatPrice(v: string | null | undefined, ondalik = 2): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });
}

function Yon({ yon }: { yon?: string }) {
  if (yon === "up") return <span className="text-emerald-500">▲</span>;
  if (yon === "down") return <span className="text-rose-500">▼</span>;
  return null;
}

/**
 * Global kayan fiyat şeridi — sticky ≤36px; CSS translateX (ADR-0039).
 * prefers-reduced-motion: animasyon kapalı, yatay kaydırılabilir.
 */
export function PiyasaPanoStrip() {
  const q = usePiyasaPano();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const rows = (q.data?.satirlar ?? []).filter(
    (r) => r.ticker_da_goster !== false
  );
  // ticker_da_goster yoksa (eski API) hepsini göster; true olanları tercih et
  const tickerRows =
    rows.some((r) => r.ticker_da_goster === true)
      ? rows.filter((r) => r.ticker_da_goster === true)
      : rows;

  const gecikmeli = Boolean(q.data?.gecikmeli) || q.data?.kaynak === "LKG";
  const fail = q.data?.kaynak === "FAIL" || q.isError;

  const items = tickerRows.map((r) => {
    const alis =
      r.alis_goster === false
        ? null
        : formatPrice(r.alis ?? null, r.ondalik ?? 2);
    const satis =
      r.satis_goster === false
        ? null
        : formatPrice(r.satis ?? r.fiyat, r.ondalik ?? 2);
    return (
      <span
        key={r.kod}
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 font-mono text-[11px] tabular-nums"
      >
        <span className="font-sans font-medium text-foreground/90">
          {r.ad || r.kod}
        </span>
        {alis != null ? (
          <span className="text-muted-foreground">
            A <Yon yon={r.yon_alis} /> {fail ? "—" : alis}
          </span>
        ) : null}
        {satis != null ? (
          <span>
            S <Yon yon={r.yon_satis} /> {fail ? "—" : satis}
          </span>
        ) : null}
      </span>
    );
  });

  const track = (
    <>
      {items}
      {/* Sonsuz döngü için kopya */}
      {!reduceMotion ? items : null}
    </>
  );

  return (
    <div
      className={`flex h-9 w-full items-center border-b border-border bg-card/95 ${
        gecikmeli || fail ? "opacity-70" : ""
      }`}
      aria-live="off"
      title={q.data?.referans_ibaresi || "Referans fiyat"}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="font-semibold text-foreground">Piyasa</span>
        {gecikmeli ? (
          <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-300">
            gecikmeli
          </span>
        ) : null}
        {fail ? (
          <span className="rounded bg-destructive/15 px-1 text-destructive">
            —
          </span>
        ) : null}
      </div>
      <div
        className={`min-w-0 flex-1 overflow-hidden ${
          reduceMotion ? "overflow-x-auto" : "group"
        }`}
      >
        {items.length === 0 ? (
          <span className="px-3 text-[11px] text-muted-foreground">
            Fiyat bekleniyor…
          </span>
        ) : (
          <div
            className={
              reduceMotion
                ? "flex w-max"
                : "flex w-max animate-[piyasa-marquee_40s_linear_infinite] group-hover:[animation-play-state:paused] group-active:[animation-play-state:paused]"
            }
          >
            {track}
          </div>
        )}
      </div>
      <style>{`
        @keyframes piyasa-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <a
        href="/piyasa"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-10 focus:z-50 focus:rounded bg-card focus:px-2 focus:py-1 focus:text-xs"
      >
        Fiyatlar özeti — Canlı Piyasa sayfası
      </a>
    </div>
  );
}
