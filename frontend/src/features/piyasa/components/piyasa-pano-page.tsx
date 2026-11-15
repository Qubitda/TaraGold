"use client";

import { useMemo } from "react";
import { useAuth } from "@/features/auth";
import { usePiyasaPano } from "../hooks";
import type { PiyasaPanoSatir } from "../types";

function formatPrice(v: string | null | undefined, ondalik = 2): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });
}

function YonMark({ yon }: { yon?: string }) {
  if (yon === "up") return <span className="text-emerald-400">▲</span>;
  if (yon === "down") return <span className="text-rose-400">▼</span>;
  return <span className="text-slate-500">·</span>;
}

function Panel({
  title,
  rows,
}: {
  title: string;
  rows: PiyasaPanoSatir[];
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-amber-500/30 bg-[#0b1f3a]">
      <header className="border-b border-amber-500/40 bg-[#123056] px-4 py-2">
        <h2 className="text-sm font-semibold tracking-wide text-amber-300">
          {title}
        </h2>
        <div className="mt-1 grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 text-[10px] uppercase text-slate-400">
          <span />
          <span className="text-right">Alış</span>
          <span className="text-right">Satış</span>
        </div>
      </header>
      <ul className="divide-y divide-slate-700/60 overflow-auto">
        {rows.map((r) => (
          <li
            key={r.kod}
            className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 px-4 py-2.5 text-sm"
          >
            <span className="truncate text-slate-100">{r.ad || r.kod}</span>
            <span className="text-right font-mono tabular-nums text-slate-100">
              <YonMark yon={r.yon_alis} />{" "}
              {r.alis_goster === false ? "—" : formatPrice(r.alis ?? r.fiyat, r.ondalik)}
            </span>
            <span className="text-right font-mono tabular-nums text-slate-100">
              <YonMark yon={r.yon_satis} />{" "}
              {r.satis_goster === false ? "—" : formatPrice(r.satis ?? r.fiyat, r.ondalik)}
            </span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-slate-400">
            Satır yok
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/**
 * KuyumcuEkran tarzı 3 panelli pano — /piyasa
 */
export function PiyasaPanoPage() {
  const { user } = useAuth();
  const q = usePiyasaPano();
  const rows = q.data?.satirlar ?? [];
  const firma = user?.firma_ad || "TaraGold";
  const now = q.data?.server_now
    ? new Date(q.data.server_now)
    : new Date();

  const byBolum = useMemo(() => {
    const altin: PiyasaPanoSatir[] = [];
    const eski: PiyasaPanoSatir[] = [];
    const doviz: PiyasaPanoSatir[] = [];
    for (const r of rows) {
      const b = (r.bolum || "").toUpperCase();
      if (b === "ESKI_ALTIN") eski.push(r);
      else if (b === "DOVIZ") doviz.push(r);
      else altin.push(r);
    }
    return { altin, eski, doviz };
  }, [rows]);

  const hasSatis = rows.find(
    (r) => (r.kod || "").toLowerCase().includes("has") && r.satis
  );

  return (
    <div className="-m-6 md:-m-8 min-h-[calc(100vh-3.5rem)] bg-[#071528] text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-500/30 pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/80">
              Referans fiyat
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-amber-200 md:text-3xl">
              {firma}
            </h1>
            <p className="text-xs text-slate-400">
              Anlık altın ve döviz kurları ·{" "}
              {q.data?.gecikmeli ? (
                <span className="text-amber-400">gecikmeli</span>
              ) : (
                <span className="text-emerald-400">canlı</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl tabular-nums text-amber-100 md:text-3xl">
              {now.toLocaleTimeString("tr-TR")}
            </p>
            <p className="text-xs text-slate-400">
              {now.toLocaleDateString("tr-TR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            {hasSatis ? (
              <p className="mt-2 rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-200">
                HAS ALTIN SATIŞ{" "}
                <span className="font-mono text-base tabular-nums">
                  {formatPrice(hasSatis.satis, hasSatis.ondalik)}
                </span>
              </p>
            ) : null}
          </div>
        </header>

        {q.isError ? (
          <p className="text-sm text-rose-300">Pano yüklenemedi.</p>
        ) : null}
        {q.data?.banner ? (
          <p className="text-xs text-amber-300/90">{q.data.banner}</p>
        ) : null}

        <div className="grid flex-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="ALTIN" rows={byBolum.altin} />
          <div className="grid gap-4 sm:grid-rows-2">
            <Panel title="ESKİ ALTINLAR" rows={byBolum.eski} />
            <Panel title="DÖVİZ KURLARI" rows={byBolum.doviz} />
          </div>
        </div>

        <p className="text-[10px] text-slate-500">
          {q.data?.referans_ibaresi ||
            "Referans fiyat — yatırım tavsiyesi değildir."}
        </p>
      </div>
    </div>
  );
}
