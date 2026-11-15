"use client";

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { urunlerService } from "../services";
import type { CatalogRefsResponse, OpsProduct } from "../types";

type Props = {
  product: OpsProduct;
  refs?: CatalogRefsResponse | null;
  disabled?: boolean;
  onDone: () => Promise<void> | void;
  onToast: {
    success: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  };
};

/** Renk × ölçü matrisi → POST …/variants/bulk/ */
export function VariantMatrixBlock({
  product,
  refs,
  disabled,
  onDone,
  onToast,
}: Props) {
  const [renkIds, setRenkIds] = useState<number[]>([]);
  const [bedenIds, setBedenIds] = useState<number[]>([]);
  const [defaultGram, setDefaultGram] = useState("3.200");
  const [busy, setBusy] = useState(false);

  const renkler = refs?.renkler ?? [];
  const olculer = useMemo(() => {
    const tip = product.olcu_tipi || "";
    return (refs?.olculer ?? []).filter((o) => !tip || o.tip === tip);
  }, [refs?.olculer, product.olcu_tipi]);

  const toggle = (list: number[], id: number, set: (v: number[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const comboCount =
    (renkIds.length || (product.renk_ekseni ? 0 : 1)) *
    (bedenIds.length || (product.olcu_tipi ? 0 : 1));

  const generate = async () => {
    if (product.renk_ekseni && !renkIds.length) {
      onToast.error("Renk ekseni açık — en az bir renk seçin");
      return;
    }
    if (product.olcu_tipi && !bedenIds.length) {
      onToast.error("Ölçü tipi seçili — en az bir ölçü seçin");
      return;
    }
    if ((product.fiyat_tipi || "gram") === "gram" && !defaultGram.trim()) {
      onToast.error("Varsayılan gram zorunlu");
      return;
    }
    setBusy(true);
    try {
      const renkSet: Array<number | null> = renkIds.length
        ? renkIds
        : [null];
      const bedenSet: Array<number | null> = bedenIds.length
        ? bedenIds
        : [null];
      const satirlar: Array<{
        gram?: string;
        renk_id: number | null;
        beden_id: number | null;
      }> = [];
      for (const r of renkSet) {
        for (const b of bedenSet) {
          satirlar.push({
            gram:
              (product.fiyat_tipi || "gram") === "gram"
                ? defaultGram
                : undefined,
            renk_id: r,
            beden_id: b,
          });
        }
      }
      const res = await urunlerService.bulkAddOpsVariants(product.id, satirlar);
      onToast.success(`${res.count} varyant oluşturuldu`);
      await onDone();
    } catch (err) {
      onToast.error("Matris oluşturulamadı", err);
    } finally {
      setBusy(false);
    }
  };

  const createSingle = async () => {
    if ((product.fiyat_tipi || "gram") === "gram" && !defaultGram.trim()) {
      onToast.error("Gram girin");
      return;
    }
    setBusy(true);
    try {
      await urunlerService.addOpsVariant(product.id, {
        gram:
          (product.fiyat_tipi || "gram") === "gram"
            ? defaultGram
            : undefined,
        sabit_fiyat:
          product.fiyat_tipi === "sabit" ? defaultGram : undefined,
        renk_id: null,
        beden_id: null,
      });
      onToast.success("Tek varyant eklendi");
      await onDone();
    } catch (err) {
      onToast.error("Varyant eklenemedi", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[8px] border border-border bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-medium">Varyant matrisi (toplu)</div>
      <p className="text-[11px] text-muted-foreground">
        Renk ve ölçü seçip kombinasyon üretin. Eksensiz ürün için «Tek varyant»
        kullanın.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Varsayılan gram</Label>
          <Input
            className="h-8 w-28 text-xs"
            value={defaultGram}
            disabled={disabled || busy}
            onChange={(e) => setDefaultGram(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={disabled || busy}
          onClick={() => void createSingle()}
        >
          Tek varyant oluştur
        </Button>
      </div>
      {product.renk_ekseni || !product.olcu_tipi ? (
        <div className="space-y-1.5">
          <Label className="text-[11px]">
            Renkler {product.renk_ekseni ? "*" : "(isteğe bağlı)"}
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {renkler.map((r) => {
              const on = renkIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => toggle(renkIds, r.id, setRenkIds)}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border"
                  }`}
                >
                  {r.ad}
                </button>
              );
            })}
            {!renkler.length ? (
              <Link
                to="/tanimlar?grup=renk"
                className="text-[11px] text-muted-foreground underline underline-offset-2"
              >
                Renk referansı yok — Tanımlar → Renkler
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {product.olcu_tipi ? (
        <div className="space-y-1.5">
          <Label className="text-[11px]">Ölçüler *</Label>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {olculer.map((o) => {
              const on = bedenIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => toggle(bedenIds, o.id, setBedenIds)}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border"
                  }`}
                >
                  {o.deger || o.ad}
                </button>
              );
            })}
            {!olculer.length ? (
              <Link
                to="/tanimlar?grup=olcu"
                className="text-[11px] text-destructive underline underline-offset-2"
              >
                Bu ölçü tipi için referans yok — Tanımlar → Ölçü / Beden
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={disabled || busy || comboCount < 1}
        onClick={() => void generate()}
      >
        {busy ? "Oluşturuluyor…" : `Matris oluştur (${comboCount || 0})`}
      </Button>
    </div>
  );
}
