"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { usePiyasaPano } from "../hooks";
import { useToast } from "@/components/ui/toast";

/** Sağlayıcı adı kullanıcıya sızmasın. */
function sanitizeBanner(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  if (/binance|fapi|bookticker|ingest/i.test(t)) {
    return "";
  }
  return t;
}

/**
 * Canlı fiyat kopunca / bayatlınca kritik uyarı.
 * Toast yalnızca FAIL’e geçişte (spam yok).
 */
export function FeedHealthAlert({
  compact = false,
  toastOnly = false,
}: {
  compact?: boolean;
  /** Yalnız toast; görsel rozet başka yerde (LiveStatusBadge). */
  toastOnly?: boolean;
}) {
  const q = usePiyasaPano();
  const toast = useToast();
  const prev = useRef<string | null>(null);

  const hardError = Boolean(q.isError && !q.data);
  const kaynak = hardError ? "FAIL" : q.data?.kaynak || "";
  const fail = hardError || kaynak === "FAIL";
  const stale = Boolean(q.data?.gecikmeli) || kaynak === "LKG";
  const banner = sanitizeBanner(q.data?.banner || "");

  useEffect(() => {
    if (prev.current !== null && prev.current !== "FAIL" && fail) {
      toast.error(
        "Canlı fiyat koptu",
        banner ||
          "Piyasa verisi alınamıyor. Fiyat vererek işlem yapmayın — risk kritik."
      );
    }
    if (prev.current === "FAIL" && kaynak === "CANLI") {
      toast.success("Canlı fiyat geri geldi", "Bağlantı yeniden kuruldu.");
    }
    prev.current = fail ? "FAIL" : kaynak || null;
  }, [fail, kaynak, banner, toast]);

  if (toastOnly) return null;
  if (!fail && !stale) return null;

  if (compact) {
    return (
      <span
        className={
          fail
            ? "rounded bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive"
            : "rounded bg-muted px-1.5 text-[10px] text-muted-foreground"
        }
      >
        {fail ? "KOPUK" : "gecikmeli"}
      </span>
    );
  }

  return (
    <div
      role="alert"
      className={
        fail
          ? "flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "flex items-start gap-2 border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
      }
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">
          {fail
            ? "Canlı veri koptu — fiyat kullanmayın"
            : "Kur gecikmeli (son bilinen değer)"}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          {sanitizeBanner(banner) ||
            (fail
              ? "Altın/ons fiyatı yok veya çok bayat. Fiyat vererek işlem yapmayın — risk kritik."
              : "Bağlantı yavaş; ekranda görünen son bilinen fiyat kullanılıyor. Yenilenene kadar işlemde dikkat.")}
        </p>
      </div>
    </div>
  );
}
