"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  opsOrdersService,
  type OpsOrderRow,
} from "@/features/firmalar/services/ops-firmalar";

export function OpsOnayHavuzu() {
  const toast = useActionToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"havuz" | "tumu">("havuz");
  const [durumFilter, setDurumFilter] = useState("");
  const [selected, setSelected] = useState<OpsOrderRow | null>(null);
  const [neden, setNeden] = useState("");
  const [tutar, setTutar] = useState("");
  const [yontem, setYontem] = useState("HAVALE");
  const [dekont, setDekont] = useState("");

  const q = useQuery({
    queryKey: ["ops-onay-havuzu", mode, durumFilter],
    queryFn: () =>
      mode === "havuz"
        ? opsOrdersService.onayHavuzu()
        : opsOrdersService.listAll(durumFilter ? { durum: durumFilter } : undefined),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ops-onay-havuzu"] });
  };

  const onayM = useMutation({
    mutationFn: (id: number) => opsOrdersService.onayla(id),
    onSuccess: (updated) => {
      toast.success("Sipariş onaylandı", "Hazırlama emri tetiklendi");
      setSelected(updated);
      invalidate();
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const redM = useMutation({
    mutationFn: ({ id, neden: n }: { id: number; neden: string }) =>
      opsOrdersService.reddet(id, n),
    onSuccess: () => {
      toast.success("Sipariş reddedildi");
      setSelected(null);
      setNeden("");
      invalidate();
    },
    onError: (e: Error) => toast.error("Red başarısız", e.message),
  });

  const tahsilM = useMutation({
    mutationFn: (id: number) =>
      opsOrdersService.tahsilat(id, {
        tutar,
        yontem,
        dekont_ref: dekont,
      }),
    onSuccess: (r) => {
      toast.success("Tahsilat kaydedildi", `Ledger #${r.ledger_entry_id}`);
      setTutar("");
      setDekont("");
    },
    onError: (e: Error) => toast.error("Tahsilat başarısız", e.message),
  });

  const rows = q.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("havuz")}
            className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
              mode === "havuz"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Onay Bekleyenler
          </button>
          <button
            type="button"
            onClick={() => setMode("tumu")}
            className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
              mode === "tumu"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tüm Ops Siparişleri
          </button>
        </div>

        {mode === "tumu" && (
          <select
            aria-label="Sipariş durum filtresi"
            value={durumFilter}
            onChange={(e) => setDurumFilter(e.target.value)}
            className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
          >
            <option value="">Tüm Durumlar</option>
            <option value="ONAY_BEKLIYOR">ONAY_BEKLIYOR</option>
            <option value="HAZIRLANIYOR">HAZIRLANIYOR</option>
            <option value="HAZIR">HAZIR</option>
            <option value="SEVKIYAT">SEVKIYAT</option>
            <option value="TAMAMLANDI">TAMAMLANDI</option>
            <option value="IPTAL">IPTAL</option>
          </select>
        )}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Siparişler alınamadı."}
        </p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          {mode === "havuz"
            ? "Onay bekleyen sipariş yok."
            : "Filtreye uygun sipariş yok."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((o) => {
            const awaitingApproval =
              o.durum === "ONAY_BEKLIYOR" || o.durum === "OLUSTURULDU";
            const totalText = o.toplamlar
              ? Object.entries(o.toplamlar)
                  .map(([pb, v]) => `${v} ${pb}`)
                  .join(" · ")
              : "";
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => setSelected(o)}
                >
                  <span className="font-mono font-semibold">Sipariş #{o.id}</span>{" "}
                  · <span className="font-mono text-xs">{o.durum}</span>
                  {o.alici_firma_ad ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {o.alici_firma_ad}
                    </span>
                  ) : null}
                  {totalText ? (
                    <span className="ml-2 font-mono text-xs text-foreground">
                      [{totalText}]
                    </span>
                  ) : null}
                  {o.olusturma_tarihi ? (
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                      {o.olusturma_tarihi.slice(0, 16)}
                    </span>
                  ) : null}
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {awaitingApproval && (
                    <Button
                      size="sm"
                      disabled={onayM.isPending}
                      onClick={() => onayM.mutate(o.id)}
                    >
                      Onayla
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(o)}
                  >
                    Detay
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">
                Sipariş #{selected.id} ({selected.durum})
                {selected.alici_firma_ad ? ` · ${selected.alici_firma_ad}` : ""}
              </h3>
              {selected.toplamlar && (
                <p className="text-xs font-mono text-muted-foreground">
                  Toplam:{" "}
                  {Object.entries(selected.toplamlar)
                    .map(([pb, v]) => `${v} ${pb}`)
                    .join(" · ")}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              Kapat
            </Button>
          </div>

          {selected.hazirlama_emirleri && selected.hazirlama_emirleri.length > 0 && (
            <div className="rounded border border-border bg-muted/30 p-2.5 space-y-1 text-xs">
              <p className="font-medium text-foreground">
                Tedarikçi Hazırlama Emirleri ({selected.hazirlama_emirleri.length})
              </p>
              <ul className="space-y-1 font-mono text-[11px]">
                {selected.hazirlama_emirleri.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Emir #{e.id} · {e.tedarikci_ad || `Tedarikçi #${e.tedarikci_firma_id}`}
                    </span>
                    <span>
                      {e.teslim_modeli || "PLATFORM_QC"} · <strong>{e.durum}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void opsOrdersService
                  .downloadProforma(selected.id)
                  .then(() => toast.success("Proforma indirildi"))
                  .catch((e: Error) => toast.error("Proforma", e.message))
              }
            >
              Proforma PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void opsOrdersService
                  .downloadIrsaliye(selected.id)
                  .then(() => toast.success("İrsaliye indirildi"))
                  .catch((e: Error) => toast.error("İrsaliye", e.message))
              }
            >
              İrsaliye PDF
            </Button>
          </div>

          {(selected.durum === "ONAY_BEKLIYOR" ||
            selected.durum === "OLUSTURULDU") && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                placeholder="Red nedeni"
                value={neden}
                onChange={(e) => setNeden(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={redM.isPending}
                onClick={() => redM.mutate({ id: selected.id, neden })}
              >
                Reddet
              </Button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              placeholder="Tutar"
              className="text-right tabular-nums"
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
            />
            <Input
              placeholder="Yöntem"
              value={yontem}
              onChange={(e) => setYontem(e.target.value)}
            />
            <Input
              placeholder="Dekont ref"
              value={dekont}
              onChange={(e) => setDekont(e.target.value)}
            />
            <Button
              size="sm"
              disabled={tahsilM.isPending || !tutar}
              onClick={() => tahsilM.mutate(selected.id)}
            >
              Elle tahsilat
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
