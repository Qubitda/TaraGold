"use client";

import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export function DomainLoading({ label }: { label: string }) {
  return (
    <div
      className="flex h-48 w-full items-center justify-center"
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        <span>{label} verileri yükleniyor…</span>
      </div>
    </div>
  );
}

export function DomainError({
  label,
  error,
  reset,
}: {
  label: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[${label} Segment Hatası]:`, error);
  }, [label, error]);

  return (
    <div
      className="flex flex-col gap-4 rounded-[8px] border border-border bg-card p-6"
      role="alert"
    >
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <h2 className="text-base font-semibold">{label} segmenti yüklenemedi</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        {error.message || "Bilinmeyen bir hata meydana geldi."}
      </p>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={reset}>
          Yeniden Dene
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Genel Bakışa Dön</Link>
        </Button>
      </div>
    </div>
  );
}

export interface DomainPlaceholderProps {
  title: string;
  description?: string;
  note?: string;
}

export function DomainPlaceholder({
  title,
  description,
  note,
}: DomainPlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {description || "Bu bölüm hazırlanıyor."}
        </p>
      </div>

      {note ? (
        <div className="rounded-[8px] border border-border bg-card p-6 text-xs text-muted-foreground">
          {note}
        </div>
      ) : null}
    </div>
  );
}
