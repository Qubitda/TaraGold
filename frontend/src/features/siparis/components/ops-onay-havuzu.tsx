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
  const [selected, setSelected] = useState<OpsOrderRow | null>(null);
  const [neden, setNeden] = useState("");
  const [tutar, setTutar] = useState("");
  const [yontem, setYontem] = useState("HAVALE");
  const [dekont, setDekont] = useState("");

  const q = useQuery({
    queryKey: ["ops-onay-havuzu"],
    queryFn: () => opsOrdersService.onayHavuzu(),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["ops-onay-havuzu"] });

  const onayM = useMutation({
    mutationFn: (id: number) => opsOrdersService.onayla(id),
    onSuccess: () => {
      toast.success("Sipariş onaylandı", "Hazırlama emri tetiklendi");
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

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Yükleniyor…</p>;
  }
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">Onay bekleyen sipariş yok.</p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => setSelected(o)}
            >
              Sipariş #{o.id} · {o.durum}
              {o.olusturma_tarihi ? (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {o.olusturma_tarihi.slice(0, 16)}
                </span>
              ) : null}
            </button>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                disabled={onayM.isPending}
                onClick={() => onayM.mutate(o.id)}
              >
                Onayla
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(o)}
              >
                Detay
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              Sipariş #{selected.id} — işlemler
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              Kapat
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void opsOrdersService
                  .downloadProforma(selected.id)
                  .then(() => toast.success("Proforma indirildi"))
                  .catch((e: Error) =>
                    toast.error("Proforma", e.message)
                  )
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
                  .catch((e: Error) =>
                    toast.error("İrsaliye", e.message)
                  )
              }
            >
              İrsaliye PDF
            </Button>
          </div>

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
              onClick={() =>
                redM.mutate({ id: selected.id, neden })
              }
            >
              Reddet
            </Button>
          </div>

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
