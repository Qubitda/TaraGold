"use client";

import { useEffect, useState } from "react";
import {
  useFirmaPanoTercihQuery,
  useUpdateFirmaPanoTercihMutation,
} from "../hooks";
import { useToast } from "@/components/ui/toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Kuyumcu: ekran adı + platform fiyatına kendi ek marjı.
 * Platform hesabında gösterilmez.
 */
export function BuyerPanoTercihCard() {
  const q = useFirmaPanoTercihQuery(true);
  const mut = useUpdateFirmaPanoTercihMutation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [baslik, setBaslik] = useState("");
  const [tip, setTip] = useState("YUZDE");
  const [alis, setAlis] = useState("0");
  const [satis, setSatis] = useState("0");

  useEffect(() => {
    if (!q.data || q.data.platform) return;
    setBaslik(q.data.pano_baslik || "");
    setTip(q.data.marj_tipi || "YUZDE");
    setAlis(q.data.alis_marj ?? "0");
    setSatis(q.data.satis_marj ?? "0");
  }, [q.data]);

  if (q.isLoading) return null;
  if (q.data?.platform) return null;
  if (q.isError) return null;

  const save = async () => {
    try {
      const res = await mut.mutateAsync({
        pano_baslik: baslik.trim(),
        marj_tipi: tip,
        alis_marj: alis,
        satis_marj: satis,
      });
      toast.success("Kaydedildi", res.etkin_baslik);
      setOpen(false);
    } catch (err) {
      toast.error("Kayıt hatası", mapCommerceError(err, "Tercih kaydedilemedi"));
    }
  };

  return (
    <div
      className="shrink-0 border-b border-border px-1 py-1"
      data-testid="buyer-pano-tercih"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          Ekran:{" "}
          <span className="font-medium text-foreground">
            {q.data?.etkin_baslik || q.data?.firma_ad}
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Kapat" : "Ad / marj"}
        </Button>
      </div>

      {open ? (
        <div className="mt-2 grid gap-2 rounded-md border border-border bg-card p-2.5 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="kuyumcu-baslik" className="text-xs">
              Ekran adı
            </Label>
            <Input
              id="kuyumcu-baslik"
              className="h-8 text-xs"
              value={baslik}
              maxLength={80}
              placeholder={q.data?.firma_ad || "Firma adınız"}
              onChange={(e) => setBaslik(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Boş bırakırsanız firma adınız kullanılır.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ek marj tipi</Label>
            <select
              className="flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
            >
              <option value="YUZDE">Yüzde (%)</option>
              <option value="TL">TL</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="kuyumcu-alis" className="text-xs">
                Alış ek marj
              </Label>
              <Input
                id="kuyumcu-alis"
                className="h-8 text-xs tabular-nums"
                value={alis}
                onChange={(e) => setAlis(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kuyumcu-satis" className="text-xs">
                Satış ek marj
              </Label>
              <Input
                id="kuyumcu-satis"
                className="h-8 text-xs tabular-nums"
                value={satis}
                onChange={(e) => setSatis(e.target.value)}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={mut.isPending}
              onClick={() => void save()}
            >
              {mut.isPending ? "…" : "Kaydet"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
