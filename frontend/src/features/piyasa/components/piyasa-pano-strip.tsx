"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLivePanoStatus } from "../hooks";
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

function Yon({ yon }: { yon?: string }) {
  if (yon === "up")
    return <span className="text-emerald-600 dark:text-emerald-400">▲</span>;
  if (yon === "down")
    return <span className="text-rose-600 dark:text-rose-400">▼</span>;
  return null;
}

/**
 * Üst kayan fiyat şeridi — portal tema (açık/koyu).
 * Yalnızca `ticker_da_goster=true` kalemler; tek durum rozeti.
 */
export function PiyasaPanoStrip() {
  const { q, gecikmeli, isDown, hidePrices, isLoading, isError, kaynak } =
    useLivePanoStatus();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const tickerRows = useMemo(
    () => (q.data?.satirlar ?? []).filter((r) => r.ticker_da_goster === true),
    [q.data?.satirlar]
  );

  const items = tickerRows.map((r) => {
    const satis =
      r.satis_goster === false
        ? null
        : formatPrice(r.satis ?? r.fiyat, r.ondalik ?? 2);
    return (
      <span
        key={r.kod}
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 text-xs leading-none"
      >
        <span className="font-medium text-muted-foreground">
          {r.ad || r.kod}:
        </span>
        {satis != null ? (
          <span className="font-semibold tabular-nums text-foreground">
            {hidePrices ? "—" : satis}{" "}
            <Yon yon={r.yon_satis || r.yon_alis} />
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    );
  });

  const durationSec = Math.max(28, tickerRows.length * 3.2);

  return (
    <div
      className={`flex h-11 w-full items-center gap-2 border-b border-border bg-card px-2.5 text-foreground ${
        gecikmeli || isDown ? "opacity-80" : ""
      }`}
      aria-live="off"
      title="Canlı fiyat şeridi"
      data-testid="piyasa-ticker"
    >
      <Link
        to="/piyasa"
        className="flex h-full shrink-0 items-center gap-1.5 border-r border-border pr-2.5"
        title="Canlı piyasa"
        aria-label="Canlı piyasa"
      >
        <LiveStatusBadge
          kaynak={isDown ? "FAIL" : kaynak}
          gecikmeli={gecikmeli}
          isError={isError}
          isLoading={isLoading}
          size="sm"
        />
        <FeedHealthAlert toastOnly />
      </Link>
      <div
        className={`min-w-0 flex-1 overflow-hidden ${
          reduceMotion ? "overflow-x-auto [scrollbar-width:thin]" : "group"
        }`}
      >
        {q.isLoading && !q.data ? (
          <span className="px-2 text-xs text-muted-foreground">
            Fiyat yükleniyor…
          </span>
        ) : items.length === 0 ? (
          <span className="px-2 text-xs text-muted-foreground">
            Üst şerit boş.{" "}
            <Link
              to="/ayarlar/piyasa"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Ayarlardan kalem seçin
            </Link>
          </span>
        ) : reduceMotion ? (
          <div className="flex w-max items-center gap-1 py-1">{items}</div>
        ) : (
          <div
            className="flex w-max items-center group-hover:[animation-play-state:paused]"
            style={{
              animation: `piyasa-marquee ${durationSec}s linear infinite`,
            }}
          >
            {items}
            {items}
          </div>
        )}
      </div>
      <style>{`
        @keyframes piyasa-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
