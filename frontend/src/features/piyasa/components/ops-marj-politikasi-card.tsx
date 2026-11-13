"use client";

import React, { useEffect, useState } from "react";
import {
  useOpsMarjPolitikasiQuery,
  useUpdateOpsMarjPolitikasiMutation,
} from "../hooks";
import { formatDateTime } from "@/lib/format";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { useActionToast } from "@/hooks/use-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Percent, RefreshCw, Save } from "lucide-react";

export function OpsMarjPolitikasiCard() {
  const actionToast = useActionToast();
  const q = useOpsMarjPolitikasiQuery(true);
  const updateMut = useUpdateOpsMarjPolitikasiMutation();

  const [marjModu, setMarjModu] = useState<"TL" | "YUZDE">("YUZDE");
  const [marjOrani, setMarjOrani] = useState("0");
  const [aktif, setAktif] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setMarjModu(q.data.marj_modu === "TL" ? "TL" : "YUZDE");
    setMarjOrani(q.data.marj_orani ?? "0");
    setAktif(Boolean(q.data.aktif));
  }, [q.data]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const val = marjOrani.trim();
    if (!val) {
      setFormError("Marj oranı boş bırakılamaz.");
      return;
    }
    try {
      await updateMut.mutateAsync({
        marj_modu: marjModu,
        marj_orani: val,
        aktif,
      });
      actionToast.success("Global marj politikası güncellendi");
    } catch (err) {
      const msg = mapCommerceError(err, "Marj politikası güncellenemedi.");
      setFormError(msg);
      actionToast.error("Marj politikası güncellenemedi", msg);
    }
  };

  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Ops Global Piyasa Marj Politikası
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Yalnızca platform ops/finans ekibi görür; alıcı yanıtlarına marj kırılımı yansıtılmaz.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {q.data ? (
            <Badge
              variant={q.data.aktif ? "success" : "secondary"}
              className="font-mono text-[10px]"
            >
              {q.data.aktif ? "AKTİF" : "PASİF"}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={`h-3 w-3 ${q.isFetching ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Marj politikası yükleniyor…</span>
        </div>
      ) : q.isError ? (
        <div className="flex items-center justify-between rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {mapCommerceError(q.error, "Marj politikası alınamadı.")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void q.refetch()}
          >
            Yeniden Dene
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ops-marj-modu" className="text-xs">
              Marj Modu
            </Label>
            <select
              id="ops-marj-modu"
              value={marjModu}
              onChange={(e) => setMarjModu(e.target.value === "TL" ? "TL" : "YUZDE")}
              disabled={updateMut.isPending}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              <option value="YUZDE">YUZDE</option>
              <option value="TL">TL</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ops-marj-orani" className="text-xs">
              Marj Oranı (Decimal)
            </Label>
            <Input
              id="ops-marj-orani"
              value={marjOrani}
              onChange={(e) => setMarjOrani(e.target.value)}
              disabled={updateMut.isPending}
              className="font-mono tabular-nums h-9"
              placeholder="0.0850"
            />
          </div>
          <label className="flex items-center gap-2 h-9 px-2 rounded-[6px] border border-border bg-muted/20 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={aktif}
              onChange={(e) => setAktif(e.target.checked)}
              disabled={updateMut.isPending}
              className="h-4 w-4 rounded border-border"
            />
            <span>Politika Aktif</span>
          </label>
          <Button
            type="submit"
            size="sm"
            className="h-9 gap-1.5"
            disabled={updateMut.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            {updateMut.isPending ? "Kaydediliyor…" : "Güncelle"}
          </Button>
        </form>
      )}

      {formError ? (
        <p className="text-xs text-destructive">{formError}</p>
      ) : null}

      {q.data?.guncelleme ? (
        <p className="text-[11px] text-muted-foreground font-mono">
          Son güncelleme: {formatDateTime(q.data.guncelleme)}
        </p>
      ) : null}
    </div>
  );
}
