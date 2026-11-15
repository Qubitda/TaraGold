"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { urunlerService } from "../services";
import type {
  CatalogRefItem,
  CatalogRefsResponse,
  OpsProduct,
  OpsProductVariant,
  PricePreviewResponse,
  ProductMediaItem,
  ProductReadiness,
} from "../types";

type Props = {
  product: OpsProduct;
  refs?: CatalogRefsResponse | null;
  onChanged: () => void;
};

const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp,image/gif";

export function ProductP0Panel({ product, refs, onChanged }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<"varyant" | "gorsel" | "fiyat" | "yayin">("varyant");
  const [renkIds, setRenkIds] = useState<number[]>([]);
  const [bedenIds, setBedenIds] = useState<number[]>([]);
  const [defaultGram, setDefaultGram] = useState("3.200");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PricePreviewResponse | null>(null);
  const [readiness, setReadiness] = useState<ProductReadiness | null>(
    product.hazirlik ?? null
  );

  const renkler = refs?.renkler ?? [];
  const olculer = useMemo(() => {
    const tip = product.olcu_tipi || "";
    return (refs?.olculer ?? []).filter((o) => !tip || o.tip === tip);
  }, [refs?.olculer, product.olcu_tipi]);

  const gorseller = product.gorseller ?? [];

  const toggleId = (list: number[], id: number, set: (v: number[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const refreshReadiness = async () => {
    const r = await urunlerService.getOpsProductReadiness(product.id);
    setReadiness(r);
  };

  const generateMatrix = async () => {
    setBusy(true);
    try {
      const renkSet = renkIds.length ? renkIds : [null];
      const bedenSet = bedenIds.length ? bedenIds : [null];
      const satirlar: Array<{
        gram: string;
        renk_id: number | null;
        beden_id: number | null;
      }> = [];
      for (const r of renkSet) {
        for (const b of bedenSet) {
          satirlar.push({
            gram: defaultGram,
            renk_id: r,
            beden_id: b,
          });
        }
      }
      await urunlerService.bulkAddOpsVariants(product.id, satirlar);
      toast.success(`${satirlar.length} varyant oluşturuldu`);
      await refreshReadiness();
      onChanged();
      setStep("gorsel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Varyant matrisi başarısız");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: File[], kapakFirst: boolean) => {
    if (!files.length) return;
    setBusy(true);
    const failed: File[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        setUploadProgress(`${i + 1}/${files.length}: ${file.name}`);
        try {
          await urunlerService.uploadOpsProductMedia(product.id, file, {
            kapak: kapakFirst && i === 0,
            tip: kapakFirst && i === 0 ? "kapak" : "galeri",
          });
        } catch {
          failed.push(file);
        }
      }
      setFailedFiles(failed);
      if (failed.length) {
        toast.error(`${failed.length} görsel yüklenemedi — tekrar deneyin`);
      } else {
        toast.success(`${files.length} görsel yüklendi`);
      }
      await refreshReadiness();
      onChanged();
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  const moveMedia = async (g: ProductMediaItem, dir: -1 | 1) => {
    const sorted = [...gorseller].sort((a, b) => a.sira - b.sira || a.id - b.id);
    const idx = sorted.findIndex((x) => x.id === g.id);
    const swap = sorted[idx + dir];
    if (idx < 0 || !swap) return;
    setBusy(true);
    try {
      await urunlerService.reorderOpsProductMedia(product.id, [
        { id: g.id, sira: swap.sira },
        { id: swap.id, sira: g.sira },
      ]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sıralama başarısız");
    } finally {
      setBusy(false);
    }
  };

  const setCover = async (id: number) => {
    setBusy(true);
    try {
      await urunlerService.setOpsProductMediaCover(product.id, id);
      await refreshReadiness();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kapak seçilemedi");
    } finally {
      setBusy(false);
    }
  };

  const removeMedia = async (id: number) => {
    setBusy(true);
    try {
      await urunlerService.deleteOpsProductMedia(product.id, id);
      await refreshReadiness();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Silinemedi");
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async (v: OpsProductVariant) => {
    setBusy(true);
    try {
      const p = await urunlerService.getOpsPricePreview(product.id, v.id);
      setPreview(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Önizleme alınamadı");
    } finally {
      setBusy(false);
    }
  };

  const chip = (item: CatalogRefItem, active: boolean, onClick: () => void) => (
    <button
      key={item.id}
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs ${
        active ? "border-foreground bg-foreground text-background" : "border-border"
      }`}
    >
      {item.ad}
    </button>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["varyant", "1. Varyant matrisi"],
            ["gorsel", "2. Görseller"],
            ["fiyat", "3. Fiyat önizleme"],
            ["yayin", "4. Yayın checklist"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`rounded px-2 py-1 ${step === k ? "bg-muted font-medium" : "opacity-70"}`}
            onClick={() => setStep(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {readiness ? (
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            Hazırlık {readiness.yuzde}% ({readiness.tamamlanan}/{readiness.toplam})
          </div>
          {readiness.eksikler.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {readiness.eksikler.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Yayınlamaya hazır.</p>
          )}
        </div>
      ) : null}

      {step === "varyant" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Renk ve ölçü seçin; sistem kombinasyonları oluşturur. Stok otomatik açılmaz.
          </p>
          {!renkler.length ? (
            <p className="text-sm text-amber-700">
              Renk referansı boş. Referanslar sekmesinden ekleyin veya seed_urunler çalıştırın.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {renkler.map((r) =>
                chip(r, renkIds.includes(r.id), () => toggleId(renkIds, r.id, setRenkIds))
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {olculer.slice(0, 24).map((o) =>
              chip(
                {
                  id: o.id,
                  kod: o.deger || o.kod,
                  ad: o.deger || o.ad || String(o.id),
                  sira: o.sira,
                  aktif: o.aktif,
                },
                bedenIds.includes(o.id),
                () => toggleId(bedenIds, o.id, setBedenIds)
              )
            )}
          </div>
          <div className="max-w-xs space-y-1">
            <Label>Varsayılan gram</Label>
            <Input value={defaultGram} onChange={(e) => setDefaultGram(e.target.value)} />
          </div>
          <Button disabled={busy} onClick={() => void generateMatrix()}>
            Matrisi oluştur
          </Button>
        </div>
      ) : null}

      {step === "gorsel" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            JPEG/PNG/WebP/GIF, en fazla 8 MB. Kapak görseli yayınlamak için zorunludur.
          </p>
          <div className="flex flex-wrap gap-3">
            <Label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
              Kapak yükle
              <input
                type="file"
                accept={ACCEPT_IMAGES}
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFiles([f], true);
                  e.target.value = "";
                }}
              />
            </Label>
            <Label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
              Çoklu galeri
              <input
                type="file"
                accept={ACCEPT_IMAGES}
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  if (list.length) void uploadFiles(list, false);
                  e.target.value = "";
                }}
              />
            </Label>
            {failedFiles.length ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void uploadFiles(failedFiles, false)}
              >
                Başarısızları tekrar dene ({failedFiles.length})
              </Button>
            ) : null}
          </div>
          {uploadProgress ? (
            <p className="text-xs text-muted-foreground">Yükleniyor: {uploadProgress}</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {gorseller.map((g) => (
              <div key={g.id} className="w-24 space-y-1 text-center text-[10px]">
                {g.url ? (
                  <img
                    src={g.url}
                    alt={g.alt_metin || ""}
                    className="h-20 w-20 rounded object-cover border border-border mx-auto"
                  />
                ) : (
                  <div className="h-20 w-20 rounded border border-dashed mx-auto" />
                )}
                <div className="font-medium">{g.kapak ? "Kapak" : `Sıra ${g.sira}`}</div>
                <div className="flex flex-wrap justify-center gap-0.5">
                  <button
                    type="button"
                    className="rounded border px-1"
                    disabled={busy}
                    onClick={() => void moveMedia(g, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded border px-1"
                    disabled={busy}
                    onClick={() => void moveMedia(g, 1)}
                  >
                    ↓
                  </button>
                  {!g.kapak ? (
                    <button
                      type="button"
                      className="rounded border px-1"
                      disabled={busy}
                      onClick={() => void setCover(g.id)}
                    >
                      Kapak
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded border px-1 text-destructive"
                    disabled={busy}
                    onClick={() => void removeMedia(g.id)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === "fiyat" ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Fiyat tipi: <strong>{product.fiyat_tipi}</strong>. Katalog taş bedeli quote’a girmez;
            alıcı fiyatı teklif + quote ile oluşur.
          </p>
          <div className="flex flex-wrap gap-2">
            {(product.varyantlar ?? []).map((v) => (
              <Button
                key={v.id}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void loadPreview(v)}
              >
                {v.sku || `#${v.id}`} önizle
              </Button>
            ))}
          </div>
          {preview ? (
            <pre className="overflow-auto rounded bg-muted/50 p-3 text-xs">
              {JSON.stringify(preview, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {step === "yayin" ? (
        <div className="space-y-2 text-sm">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refreshReadiness()}
          >
            Checklist yenile
          </Button>
          <p className="text-muted-foreground">
            Yayınlama ürün detayındaki «Yayınla» aksiyonundan yapılır; eksik kapak veya varyant
            engellenir.
          </p>
        </div>
      ) : null}
    </div>
  );
}
