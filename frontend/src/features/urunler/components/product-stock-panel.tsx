"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelationSelect } from "@/components/crud";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdjustStockMutation,
  useCreateWarehouseMutation,
  useSupplierWarehousesQuery,
} from "@/features/stok/hooks";
import { fiyatlamaService } from "@/features/fiyatlama/services";
import type { SupplierOffer } from "@/features/fiyatlama/types";
import { urunlerService } from "../services";
import type {
  OpsProduct,
  OpsProductStockResponse,
  OpsProductStockRow,
} from "../types";
import { mapCommerceError } from "@/lib/api/commerce-errors";

type Props = {
  product: OpsProduct;
  canAdjust: boolean;
  onToast: {
    success: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  };
};

type VariantRow = {
  id: number;
  sku: string;
  /** Renk · boy · gram vb. — kullanıcının gördüğü özellik kırılımı */
  ozellik: string;
};

/**
 * Ürün Stok & Fiyat — tek ekran.
 * Her özellik kırılımı (varyant) için ayrı fiyat ve/veya adet.
 * Ledger’ın teklif anahtarı arka planda; UI’da “teklif” yok.
 */
export function ProductStockPanel({ product, canAdjust, onToast }: Props) {
  const [stockData, setStockData] = useState<OpsProductStockResponse | null>(
    null
  );
  const [stockLoading, setStockLoading] = useState(false);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  const [warehouseId, setWarehouseId] = useState<string>("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [savingVid, setSavingVid] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [newWhOpen, setNewWhOpen] = useState(false);
  const [newWhKod, setNewWhKod] = useState("");
  const [newWhAd, setNewWhAd] = useState("");

  const warehousesQ = useSupplierWarehousesQuery(true);
  const adjustMut = useAdjustStockMutation();
  const createWhMut = useCreateWarehouseMutation();

  const variants: VariantRow[] = useMemo(
    () =>
      (product.varyantlar ?? [])
        .filter((v) => v.aktif !== false)
        .map((v) => {
          const parts = [v.renk, v.beden, v.gram ? `${v.gram} g` : null].filter(
            Boolean
          ) as string[];
          return {
            id: v.id,
            sku: v.sku || `Kırılım #${v.id}`,
            ozellik: parts.length ? parts.join(" · ") : "Standart",
          };
        }),
    [product.varyantlar]
  );

  const searchHint =
    product.platform_kodu || product.ad || String(product.id);

  const reloadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      setStockData(await urunlerService.getOpsProductStock(product.id));
    } catch {
      setStockData(null);
    } finally {
      setStockLoading(false);
    }
  }, [product.id]);

  const reloadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const page = await fiyatlamaService.getSupplierOffers({
        page_size: "100",
        q: searchHint,
      });
      const vids = new Set(variants.map((v) => v.id));
      const rows = (page.results ?? []).filter((t) => vids.has(t.varyant_id));
      setOffers(rows.length ? rows : page.results ?? []);
    } catch {
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [searchHint, variants]);

  useEffect(() => {
    void reloadStock();
    void reloadOffers();
  }, [reloadStock, reloadOffers, product.guncelleme_zamani]);

  useEffect(() => {
    if (warehouseId) return;
    const first = (warehousesQ.data ?? []).find((w) => w.aktif);
    if (first) setWarehouseId(String(first.id));
  }, [warehousesQ.data, warehouseId]);

  const warehouseOptions = useMemo(
    () =>
      (warehousesQ.data ?? []).map((w) => ({
        value: String(w.id),
        label: w.ad,
        subtitle: w.kod,
        disabled: w.aktif === false,
      })),
    [warehousesQ.data]
  );

  const selectedWarehouse = useMemo(
    () =>
      (warehousesQ.data ?? []).find((w) => String(w.id) === warehouseId) ?? null,
    [warehousesQ.data, warehouseId]
  );

  const balanceFor = useCallback(
    (varyantId: number): OpsProductStockRow | undefined => {
      if (!warehouseId) return undefined;
      return (stockData?.results ?? []).find(
        (r) =>
          r.varyant_id === varyantId && String(r.warehouse_id) === warehouseId
      );
    },
    [stockData, warehouseId]
  );

  const resolveOffer = useCallback(
    (varyantId: number, bal?: OpsProductStockRow): SupplierOffer | null => {
      if (bal?.teklif_id) {
        const fromBal = offers.find((o) => o.id === bal.teklif_id);
        if (fromBal) return fromBal;
      }
      const forVar = offers.filter((o) => o.varyant_id === varyantId);
      if (!forVar.length) return null;
      return (
        forVar.find((o) => o.durum === "YAYINDA") ||
        forVar.find((o) => o.durum === "ONAYLANDI") ||
        forVar[0]
      );
    },
    [offers]
  );

  // Depo / teklif değişince satır değerlerini doldur
  useEffect(() => {
    const nextPrices: Record<string, string> = {};
    const nextTargets: Record<string, string> = {};
    for (const v of variants) {
      const bal = warehouseId
        ? (stockData?.results ?? []).find(
            (r) =>
              r.varyant_id === v.id && String(r.warehouse_id) === warehouseId
          )
        : undefined;
      const offer = resolveOffer(v.id, bal);
      nextPrices[String(v.id)] = offer?.birim_fiyat
        ? String(offer.birim_fiyat)
        : "";
      nextTargets[String(v.id)] = bal ? String(bal.on_hand) : "";
    }
    setPrices(nextPrices);
    setTargets(nextTargets);
  }, [warehouseId, stockData, variants, offers, resolveOffer]);

  const upsertPrice = async (
    varyantId: number,
    priceRaw: string,
    existing: SupplierOffer | null
  ): Promise<number | null> => {
    const price = priceRaw.trim();
    if (!price) {
      return existing?.id ?? null;
    }
    if (Number.isNaN(Number(price)) || Number(price) <= 0) {
      throw new Error("Birim fiyat pozitif bir sayı olmalı.");
    }

    if (!existing) {
      const created = await fiyatlamaService.createSupplierOffer({
        varyant_id: varyantId,
        fiyat_modeli: "SABIT_PARCA",
        birim_fiyat: price,
        para_birimi: "TRY",
        temin_tipi: "HAZIR",
      });
      setOffers((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
      return created.id;
    }

    const current = existing.birim_fiyat ? String(existing.birim_fiyat) : "";
    if (current === price) return existing.id;

    if (existing.durum === "YAYINDA") {
      const versioned = await fiyatlamaService.createSupplierOfferVersion(
        existing.id,
        { birim_fiyat: price, fiyat_modeli: "SABIT_PARCA" }
      );
      setOffers((prev) => [
        versioned,
        ...prev.filter((o) => o.id !== versioned.id),
      ]);
      return versioned.id;
    }

    // Taslak / diğer: yeni fiyat satırı (eskiyi bozmadan)
    const created = await fiyatlamaService.createSupplierOffer({
      varyant_id: varyantId,
      fiyat_modeli: "SABIT_PARCA",
      birim_fiyat: price,
      para_birimi: existing.para_birimi || "TRY",
      temin_tipi: "HAZIR",
    });
    setOffers((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
    return created.id;
  };

  const onSaveRow = async (varyantId: number) => {
    setFormError(null);
    const priceRaw = (prices[String(varyantId)] ?? "").trim();
    const qtyRaw = (targets[String(varyantId)] ?? "").trim();
    const hasPrice = priceRaw !== "";
    const hasQty = qtyRaw !== "";

    if (!hasPrice && !hasQty) {
      setFormError("Bu kırılım için fiyat ve/veya adet girin.");
      return;
    }
    if (hasQty && !warehouseId) {
      setFormError("Adet kaydetmek için önce depo seçin veya oluşturun.");
      return;
    }
    if (hasQty && (Number.isNaN(Number(qtyRaw)) || Number(qtyRaw) < 0)) {
      setFormError("Adet 0 veya daha büyük olmalı.");
      return;
    }

    const bal = balanceFor(varyantId);
    const existing = resolveOffer(varyantId, bal);
    const label =
      variants.find((v) => v.id === varyantId)?.ozellik ||
      variants.find((v) => v.id === varyantId)?.sku ||
      "Kırılım";

    setSavingVid(varyantId);
    try {
      let offerId = await upsertPrice(varyantId, priceRaw, existing);

      if (hasQty) {
        if (!offerId) {
          throw new Error(
            "Stok için bu özellik kırılımına bir fiyat yazın (aynı satırda)."
          );
        }
        const target = Number(qtyRaw);
        const current = bal ? Number(bal.on_hand) : 0;
        const delta = target - current;
        if (delta !== 0) {
          await adjustMut.mutateAsync({
            warehouse_id: Number(warehouseId),
            teklif_id: offerId,
            miktar: String(delta),
            neden: "Ürün stok güncelleme",
          });
        }
      }

      const bits: string[] = [];
      if (hasPrice) bits.push(`fiyat ${priceRaw}`);
      if (hasQty) bits.push(`adet ${qtyRaw}`);
      onToast.success(`${label}: ${bits.join(" · ")} kaydedildi`);
      await reloadStock();
      await reloadOffers();
    } catch (err) {
      setFormError(mapCommerceError(err, "Kayıt başarısız."));
      onToast.error("Kayıt başarısız", err);
    } finally {
      setSavingVid(null);
    }
  };

  const onCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newWhKod.trim() || !newWhAd.trim()) {
      setFormError("Depo kodu ve adı zorunlu.");
      return;
    }
    try {
      const wh = await createWhMut.mutateAsync({
        kod: newWhKod.trim().toUpperCase(),
        ad: newWhAd.trim(),
        aktif: true,
      });
      setWarehouseId(String(wh.id));
      setNewWhOpen(false);
      setNewWhKod("");
      setNewWhAd("");
      onToast.success("Depo oluşturuldu");
      await warehousesQ.refetch();
    } catch (err) {
      setFormError(mapCommerceError(err, "Depo oluşturulamadı."));
      onToast.error("Depo oluşturulamadı", err);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-muted-foreground max-w-2xl">
        Her özellik kırılımı (renk, boy, metal, gram…) için ayrı{" "}
        <strong className="font-medium text-foreground">fiyat</strong> ve{" "}
        <strong className="font-medium text-foreground">adet</strong>{" "}
        girebilirsiniz. İstediğiniz satırları doldurun — hepsi bu ekranda.
      </p>

      {!variants.length ? (
        <p className="text-xs text-destructive rounded-[6px] border border-destructive/30 bg-destructive/5 px-3 py-2">
          Önce Varyantlar sekmesinden özellik kırılımlarını (renk / boy / …)
          ekleyin. Her kırılım ayrı fiyat ve stok alır.
        </p>
      ) : null}

      {variants.length > 0 ? (
        <div className="rounded-[8px] border border-border bg-muted/15 p-3 space-y-3 min-w-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 min-w-0 flex-1 sm:max-w-xs">
              <Label className="text-[11px]">Depo (stok için) *</Label>
              <RelationSelect
                value={warehouseId}
                onChange={(v) => setWarehouseId(String(v ?? ""))}
                options={warehouseOptions}
                placeholder="Depo seçin…"
                disabled={!canAdjust || warehousesQ.isLoading}
              />
            </div>
            {canAdjust ? (
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground pb-2"
                onClick={() => setNewWhOpen((o) => !o)}
              >
                {newWhOpen
                  ? "Depo formunu kapat"
                  : warehouseOptions.length
                    ? "+ Yeni depo"
                    : "Depo yok — burada oluştur"}
              </button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 shrink-0 ml-auto"
              onClick={() => {
                void reloadStock();
                void reloadOffers();
              }}
              disabled={stockLoading || offersLoading}
            >
              {stockLoading || offersLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Yenile
            </Button>
          </div>

          {selectedWarehouse ? (
            <p className="text-[11px] text-muted-foreground">
              Stok deposu:{" "}
              <span className="text-foreground font-medium">
                {selectedWarehouse.ad}
              </span>
              <span className="font-mono text-[10px] ml-1.5">
                ({selectedWarehouse.kod})
              </span>
              . Yalnız fiyat güncellemek için depo şart değil; adet için gerekir.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Yalnız fiyat girebilirsiniz. Adet için depo seçin.
            </p>
          )}

          {newWhOpen && canAdjust ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-[6px] border border-dashed border-border p-2.5 bg-background">
              <div className="flex flex-col gap-1 min-w-0">
                <Label className="text-[11px]">Depo kodu</Label>
                <Input
                  value={newWhKod}
                  onChange={(e) => setNewWhKod(e.target.value.toUpperCase())}
                  className="font-mono text-xs h-8"
                  placeholder="ANA"
                />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <Label className="text-[11px]">Depo adı</Label>
                <Input
                  value={newWhAd}
                  onChange={(e) => setNewWhAd(e.target.value)}
                  className="text-xs h-8"
                  placeholder="Ana depo"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={createWhMut.isPending}
                  onClick={(e) => void onCreateWarehouse(e)}
                >
                  {createWhMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Depoyu kaydet
                </Button>
              </div>
            </div>
          ) : null}

          {formError ? (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          {stockLoading && !stockData && offersLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="overflow-x-auto min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Özellik kırılımı</TableHead>
                    <TableHead className="w-[7.5rem]">Birim fiyat</TableHead>
                    <TableHead className="text-right">Depodaki</TableHead>
                    {canAdjust ? (
                      <TableHead className="w-[7rem]">Hedef adet</TableHead>
                    ) : null}
                    {canAdjust ? (
                      <TableHead className="text-right w-[5.5rem]"> </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v) => {
                    const bal = balanceFor(v.id);
                    const current = bal ? bal.on_hand : "—";
                    const busy = savingVid === v.id;
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="min-w-0">
                          <div className="text-xs font-medium text-foreground">
                            {v.ozellik}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {v.sku}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canAdjust ? (
                            <Input
                              value={prices[String(v.id)] ?? ""}
                              onChange={(e) =>
                                setPrices((prev) => ({
                                  ...prev,
                                  [String(v.id)]: e.target.value,
                                }))
                              }
                              className="font-mono text-xs h-8 w-[7rem]"
                              inputMode="decimal"
                              disabled={busy || adjustMut.isPending}
                              placeholder="—"
                            />
                          ) : (
                            <span className="font-mono text-xs">
                              {prices[String(v.id)] || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">
                          {current}
                          {bal && Number(bal.reserved) > 0 ? (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              rezerve {bal.reserved}
                            </div>
                          ) : null}
                        </TableCell>
                        {canAdjust ? (
                          <TableCell>
                            <Input
                              value={targets[String(v.id)] ?? ""}
                              onChange={(e) =>
                                setTargets((prev) => ({
                                  ...prev,
                                  [String(v.id)]: e.target.value,
                                }))
                              }
                              className="font-mono text-xs h-8 w-[6.5rem]"
                              inputMode="decimal"
                              disabled={busy || adjustMut.isPending}
                              placeholder="—"
                            />
                          </TableCell>
                        ) : null}
                        {canAdjust ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={busy || adjustMut.isPending}
                              onClick={() => void onSaveRow(v.id)}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Kaydet"
                              )}
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
