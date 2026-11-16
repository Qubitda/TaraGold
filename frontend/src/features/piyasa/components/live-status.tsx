"use client";

import { usePiyasaPano, useOpsPanoDetayQuery } from "../hooks";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

export type LiveTone = "live" | "stale" | "down" | "loading" | "manual";

export function resolveLiveStatus(input: {
  kaynak?: string | null;
  gecikmeli?: boolean;
  isError?: boolean;
  isLoading?: boolean;
}): { tone: LiveTone; label: string; detail: string } {
  if (input.isLoading) {
    return {
      tone: "loading",
      label: "Kontrol…",
      detail: "Bağlantı kontrol ediliyor",
    };
  }
  if (input.isError || input.kaynak === "FAIL") {
    return {
      tone: "down",
      label: "KOPUK",
      detail: "Canlı veri yok — fiyat vererek işlem yapmayın",
    };
  }
  if (input.gecikmeli || input.kaynak === "LKG") {
    return {
      tone: "stale",
      label: "GECİKMELİ",
      detail: "Son bilinen fiyat gösteriliyor",
    };
  }
  if (input.kaynak === "MANUEL") {
    return {
      tone: "manual",
      label: "ELLE",
      detail: "Sabit elle fiyatlar aktif",
    };
  }
  return {
    tone: "live",
    label: "CANLI",
    detail: "Fiyatlar anlık güncelleniyor",
  };
}

const TONE_CLASS: Record<LiveTone, string> = {
  live: "border-emerald-600/40 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  stale: "border-amber-600/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  down: "border-destructive/50 bg-destructive/15 text-destructive",
  loading: "border-border bg-muted text-muted-foreground",
  manual: "border-border bg-muted text-foreground",
};

/** Pano / şerit için büyük durum rozeti. */
export function LiveStatusBadge({
  kaynak,
  gecikmeli,
  isError,
  isLoading,
  size = "md",
}: {
  kaynak?: string | null;
  gecikmeli?: boolean;
  isError?: boolean;
  isLoading?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const { tone, label } = resolveLiveStatus({
    kaynak,
    gecikmeli,
    isError,
    isLoading,
  });
  const sizeCls =
    size === "lg"
      ? "px-2.5 py-1 text-xs font-medium"
      : size === "sm"
        ? "px-1.5 py-0.5 text-[11px] font-medium"
        : "px-2 py-0.5 text-xs font-medium";

  return (
    <span
      role="status"
      data-testid="live-status-badge"
      data-tone={tone}
      className={`inline-flex items-center gap-1.5 rounded border ${sizeCls} ${TONE_CLASS[tone]}`}
      title={label}
    >
      <span
        className={
          tone === "live"
            ? "h-2 w-2 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
            : tone === "down"
              ? "h-2 w-2 rounded-full bg-destructive"
              : tone === "stale"
                ? "h-2 w-2 rounded-full bg-amber-500"
                : "h-2 w-2 rounded-full bg-muted-foreground"
        }
      />
      {label}
    </span>
  );
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("tr-TR");
}

function fmtAge(iso?: string | null, nowIso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const n = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return "—";
  const sec = Math.max(0, Math.round((n - t) / 1000));
  if (sec < 60) return `${sec} sn önce`;
  if (sec < 3600) return `${Math.floor(sec / 60)} dk önce`;
  return `${Math.floor(sec / 3600)} sa önce`;
}

/**
 * Ayarlar sayfası — bağlantı testi / canlı mı net görünsün.
 */
export function BaglantiTestCard() {
  const pano = usePiyasaPano();
  const detay = useOpsPanoDetayQuery(true);
  const hasData = Boolean(pano.data);
  const hardError = Boolean(pano.isError && !hasData);
  const status = resolveLiveStatus({
    kaynak: pano.data?.kaynak,
    gecikmeli: pano.data?.gecikmeli,
    isError: hardError || pano.data?.kaynak === "FAIL",
    isLoading: pano.isLoading && !hasData,
  });

  const rows = detay.data?.satirlar ?? [];
  const has = rows.find((r) => (r.kod || "").toLowerCase() === "has");
  const okCount = rows.filter((r) => r.ok !== false).length;
  const failCount = rows.filter((r) => r.ok === false).length;
  const elleCount = rows.filter((r) => r.fiyat_modu === "ELLE").length;
  const guncelleme = has?.guncelleme || pano.data?.server_now;

  const testNow = () => {
    void pano.refetch();
    void detay.refetch();
  };

  return (
    <section
      className={`rounded-md border p-3 ${TONE_CLASS[status.tone]}`}
      data-testid="baglanti-test-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/80">Bağlantı testi</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <LiveStatusBadge
              kaynak={
                hardError || pano.data?.kaynak === "FAIL"
                  ? "FAIL"
                  : pano.data?.kaynak
              }
              gecikmeli={pano.data?.gecikmeli}
              isError={hardError}
              isLoading={pano.isLoading && !hasData}
              size="sm"
            />
            <span className="text-xs opacity-90">{status.detail}</span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-current bg-background/60 text-xs"
          disabled={pano.isFetching || detay.isFetching}
          onClick={testNow}
        >
          {pano.isFetching || detay.isFetching ? "Kontrol…" : "Şimdi kontrol et"}
        </Button>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[11px] opacity-70">Son kontrol</dt>
          <dd className="font-medium tabular-nums">
            {pano.dataUpdatedAt
              ? new Date(pano.dataUpdatedAt).toLocaleTimeString("tr-TR")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] opacity-70">Veri yaşı</dt>
          <dd className="font-medium">
            {fmtAge(guncelleme, pano.data?.server_now)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] opacity-70">HAS (örnek)</dt>
          <dd className="font-medium tabular-nums">
            {formatMoney(has?.nihai_alis, has?.para_birimi || "TRY")} /{" "}
            {formatMoney(has?.nihai_satis, has?.para_birimi || "TRY")}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-xs opacity-80">
        Kalemler: {okCount} tamam
        {failCount > 0 ? ` · ${failCount} hata` : ""}
        {elleCount > 0 ? ` · ${elleCount} elle sabit` : ""}
        {" · "}
        her 30 sn otomatik yenilenir
      </p>
    </section>
  );
}
