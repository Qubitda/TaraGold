"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useAdjustStockMutation,
  useCreateWarehouseMutation,
  useDeleteWarehouseMutation,
  useSupplierStockPageQuery,
  useSupplierWarehousesPageQuery,
  useUpdateWarehouseMutation,
} from "../hooks";
import {
  stockAdjustmentSchema,
  warehouseSchema,
  type StockAdjustmentInput,
  type WarehouseInput,
} from "../schemas";
import { stokService } from "../services";
import type { SupplierWarehouse } from "../types";
import { fiyatlamaService } from "@/features/fiyatlama/services";
import { urunlerService } from "@/features/urunler/services";
import { opsFirmalarService } from "@/features/firmalar/services/ops-firmalar";
import { useAuth } from "@/features/auth";
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
} from "@/components/crud";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Boxes, Plus, Warehouse } from "lucide-react";

export function StockManagementView() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOps = Boolean(user?.firma?.platform_mu || user?.capabilities?.can_view_ops);
  const actionToast = useActionToast();

  const [activeTab, setActiveTab] = useState<"stock" | "warehouses">(() =>
    searchParams.get("tab") === "warehouses" ? "warehouses" : "stock"
  );

  // Stock list state
  const [stockSearch, setStockSearch] = useState(
    () => searchParams.get("q") || ""
  );
  const [warehouseFilter, setWarehouseFilter] = useState(
    () => searchParams.get("warehouse_id") || ""
  );
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Warehouse list state
  const [whSearch, setWhSearch] = useState("");
  const [whAktifFilter, setWhAktifFilter] = useState("");
  const [whPage, setWhPage] = useState(1);
  const [whPageSize, setWhPageSize] = useState(20);

  // Modals
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [whModalOpen, setWhModalOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<SupplierWarehouse | null>(null);
  const [whModalError, setWhModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierWarehouse | null>(null);

  const stockParams = useMemo(
    () => ({
      page: String(stockPage),
      page_size: String(stockPageSize),
      ...(stockSearch.trim() ? { q: stockSearch.trim() } : {}),
      ...(warehouseFilter ? { warehouse_id: warehouseFilter } : {}),
    }),
    [stockPage, stockPageSize, stockSearch, warehouseFilter]
  );

  const whParams = useMemo(
    () => ({
      page: String(whPage),
      page_size: String(whPageSize),
      ...(whSearch.trim() ? { q: whSearch.trim() } : {}),
      ...(whAktifFilter ? { aktif: whAktifFilter } : {}),
    }),
    [whPage, whPageSize, whSearch, whAktifFilter]
  );

  const stockQ = useSupplierStockPageQuery(stockParams);
  const warehousesQ = useSupplierWarehousesPageQuery(whParams);
  const allWarehousesQ = useSupplierWarehousesPageQuery({ page_size: "100" });

  const adjustMut = useAdjustStockMutation();
  const createWhMut = useCreateWarehouseMutation();
  const updateWhMut = useUpdateWarehouseMutation();
  const deleteWhMut = useDeleteWarehouseMutation();

  const adjustForm = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      warehouse_id: undefined,
      varyant_id: undefined,
      birim_fiyat: "",
      miktar: "",
      neden: "",
    },
  });

  // Deep-link: /stok?q=&warehouse_id=&varyant_id=&adjust=1&tab=warehouses
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "warehouses") setActiveTab("warehouses");
    const q = searchParams.get("q");
    if (q) setStockSearch(q);
    const wh = searchParams.get("warehouse_id");
    if (wh) setWarehouseFilter(wh);
    if (searchParams.get("adjust") === "1") {
      const varyantRaw =
        searchParams.get("varyant_id") || searchParams.get("teklif_id");
      adjustForm.reset({
        warehouse_id: wh ? Number(wh) : undefined,
        varyant_id: varyantRaw ? Number(varyantRaw) : undefined,
        birim_fiyat: "",
        miktar: "",
        neden: "",
      });
      setAdjustError(null);
      setAdjustOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("adjust");
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const whForm = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      kod: "",
      ad: "",
      sahip_firma_id: undefined,
      aktif: true,
    },
  });

  const balances = stockQ.data?.results ?? [];
  const warehouses = warehousesQ.data?.results ?? [];
  const filterWarehouses = allWarehousesQ.data?.results ?? [];

  const openAdjustModal = () => {
    setAdjustError(null);
    adjustForm.reset({
      warehouse_id: undefined,
      varyant_id: undefined,
      birim_fiyat: "",
      miktar: "",
      neden: "",
    });
    setAdjustOpen(true);
  };

  /** Özellik kırılımı için fiyat satırını bul veya oluştur (UI’da teklif denmez). */
  const ensureOfferForVariant = async (
    varyantId: number,
    birimFiyat?: string
  ): Promise<number> => {
    const fromBal = balances.find(
      (b) => b.varyant_id === varyantId && b.teklif_id
    );
    if (fromBal?.teklif_id) return Number(fromBal.teklif_id);

    const page = await fiyatlamaService.getSupplierOffers({ page_size: "100" });
    const rows = (page.results ?? []).filter((o) => o.varyant_id === varyantId);
    const existing =
      rows.find((o) => o.durum === "YAYINDA") ||
      rows.find((o) => o.durum === "ONAYLANDI") ||
      rows[0];
    if (existing) return existing.id;

    const price = (birimFiyat || "").trim();
    if (!price || Number.isNaN(Number(price)) || Number(price) <= 0) {
      throw new Error(
        "Bu özellik kırılımının henüz fiyatı yok. Birim fiyat alanını doldurun."
      );
    }
    const created = await fiyatlamaService.createSupplierOffer({
      varyant_id: varyantId,
      fiyat_modeli: "SABIT_PARCA",
      birim_fiyat: price,
      para_birimi: "TRY",
      temin_tipi: "HAZIR",
    });
    return created.id;
  };

  const openCreateWhModal = () => {
    setEditingWh(null);
    setWhModalError(null);
    whForm.reset({
      kod: "",
      ad: "",
      sahip_firma_id: undefined,
      aktif: true,
    });
    setWhModalOpen(true);
  };

  const openEditWhModal = (w: SupplierWarehouse) => {
    setEditingWh(w);
    setWhModalError(null);
    whForm.reset({
      kod: w.kod,
      ad: w.ad,
      sahip_firma_id: w.sahip_firma_id,
      aktif: w.aktif,
    });
    setWhModalOpen(true);
  };

  const onAdjustSubmit = adjustForm.handleSubmit(async (data) => {
    setAdjustError(null);
    try {
      const teklifId = await ensureOfferForVariant(
        Number(data.varyant_id),
        data.birim_fiyat
      );
      await adjustMut.mutateAsync({
        warehouse_id: Number(data.warehouse_id),
        teklif_id: teklifId,
        miktar: data.miktar.trim(),
        neden: data.neden.trim(),
      });
      actionToast.success("Stok düzeltmesi kaydedildi");
      setAdjustOpen(false);
    } catch (err) {
      const msg = mapCommerceError(err, "Stok hareketi işlenemedi.");
      setAdjustError(msg);
      actionToast.error("Stok hareketi işlenemedi", err);
    }
  });

  const onWhSubmit = whForm.handleSubmit(async (data) => {
    setWhModalError(null);
    try {
      if (editingWh) {
        await updateWhMut.mutateAsync({
          id: editingWh.id,
          data: {
            kod: data.kod.trim(),
            ad: data.ad.trim(),
            aktif: data.aktif,
          },
        });
        actionToast.success("Depo güncellendi", data.ad);
      } else {
        await createWhMut.mutateAsync({
          kod: data.kod.trim(),
          ad: data.ad.trim(),
          aktif: data.aktif,
          ...(isOps && data.sahip_firma_id
            ? { sahip_firma_id: data.sahip_firma_id }
            : {}),
        });
        actionToast.success("Depo oluşturuldu", data.ad);
      }
      setWhModalOpen(false);
    } catch (err) {
      const msg = mapCommerceError(err, "Depo kaydedilemedi.");
      setWhModalError(msg);
      actionToast.error("Depo kaydedilemedi", err);
    }
  });

  const handleToggleWh = async (w: SupplierWarehouse) => {
    try {
      await updateWhMut.mutateAsync({
        id: w.id,
        data: { aktif: !w.aktif },
      });
      actionToast.success(w.aktif ? "Depo pasife alındı" : "Depo aktifleştirildi", w.ad);
    } catch (err) {
      actionToast.error("Depo durumu güncellenemedi", err);
    }
  };

  const handleDeleteWh = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWhMut.mutateAsync(deleteTarget.id);
      actionToast.success("Depo silindi", deleteTarget.ad);
      setDeleteTarget(null);
    } catch (err) {
      actionToast.error("Depo silinemedi", err);
    }
  };

  const tabSwitcher = (
    <div className="flex items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
      <Button
        type="button"
        variant={activeTab === "stock" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("stock")}
      >
        <Boxes className="h-3.5 w-3.5" />
        Stok Bakiyeleri
      </Button>
      <Button
        type="button"
        variant={activeTab === "warehouses" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("warehouses")}
      >
        <Warehouse className="h-3.5 w-3.5" />
        Depolar
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {activeTab === "stock" ? (
        <ListPage
          title="Stok & Depo Yönetimi"
          description="Depo ve özellik kırılımı (renk / boy / …) bazında stok bakiyeleri. Detaylı fiyat+adet için ürün ekranındaki Stok & Fiyat sekmesini kullanın."
          createLabel="Stok Düzeltmesi"
          onCreate={openAdjustModal}
          extraActions={tabSwitcher}
          searchValue={stockSearch}
          onSearchChange={(val) => {
            setStockSearch(val);
            setStockPage(1);
          }}
          searchPlaceholder="Ürün, SKU veya depo ara…"
          filters={
            <select
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setStockPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
              aria-label="Depo filtresi"
            >
              <option value="">Tüm Depolar</option>
              {filterWarehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.kod} — {w.ad}
                </option>
              ))}
            </select>
          }
          loading={stockQ.isLoading}
          error={
            stockQ.isError
              ? mapCommerceError(stockQ.error, "Stok verileri alınamadı.")
              : null
          }
          onRetry={() => void stockQ.refetch()}
          isEmpty={balances.length === 0}
          emptyTitle="Stok bakiyesi bulunamadı"
          emptyDescription="Henüz tanımlı stok bakiyesi yok. Stok Düzeltmesi ile ilk girişinizi yapabilirsiniz."
          page={stockPage}
          pageSize={stockPageSize}
          totalCount={stockQ.data?.count ?? balances.length}
          onPageChange={setStockPage}
          onPageSizeChange={(sz) => {
            setStockPageSize(sz);
            setStockPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depo</TableHead>
                <TableHead>Ürün / özellik kırılımı</TableHead>
                <TableHead>Birim</TableHead>
                <TableHead className="text-right">Eldeki</TableHead>
                <TableHead className="text-right">Rezerve</TableHead>
                <TableHead className="text-right">Kullanılabilir</TableHead>
                <TableHead className="w-[100px] text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((b) => (
                <TableRow
                  key={`${b.warehouse_id ?? "w"}-${b.teklif_id ?? "t"}-${b.varyant_id}`}
                >
                  <TableCell className="text-xs">
                    <div className="font-medium text-foreground">
                      {b.warehouse_ad || "Depo"}
                    </div>
                    {b.warehouse_kod ? (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {b.warehouse_kod}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium text-foreground">
                      {b.urun_ad || b.platform_kodu || "Katalog ürünü"}
                    </div>
                    {b.varyant_sku ? (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {b.varyant_sku}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.birim}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {b.on_hand ?? "0"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {b.reserved ?? "0"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">
                    {b.available}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setAdjustError(null);
                        adjustForm.reset({
                          warehouse_id: b.warehouse_id ?? undefined,
                          varyant_id: b.varyant_id ?? undefined,
                          birim_fiyat: "",
                          miktar: "",
                          neden: "",
                        });
                        setAdjustOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Düzelt
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : (
        <ListPage
          title="Depo Yönetimi"
          description="Stok girişi ve sevkiyat için kullanılan depoları tanımlayın ve yönetin."
          createLabel="Yeni Depo"
          onCreate={openCreateWhModal}
          extraActions={tabSwitcher}
          searchValue={whSearch}
          onSearchChange={(val) => {
            setWhSearch(val);
            setWhPage(1);
          }}
          searchPlaceholder="Depo kodu, adı veya firma ara…"
          filters={
            <select
              value={whAktifFilter}
              onChange={(e) => {
                setWhAktifFilter(e.target.value);
                setWhPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
              aria-label="Depo durum filtresi"
            >
              <option value="">Tüm Durumlar</option>
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
          }
          loading={warehousesQ.isLoading}
          error={
            warehousesQ.isError
              ? mapCommerceError(warehousesQ.error, "Depolar alınamadı.")
              : null
          }
          onRetry={() => void warehousesQ.refetch()}
          isEmpty={warehouses.length === 0}
          emptyTitle="Henüz depo tanımlanmamış"
          emptyDescription="Stok takibi başlatmak için Yeni Depo butonunu kullanın."
          page={whPage}
          pageSize={whPageSize}
          totalCount={warehousesQ.data?.count ?? warehouses.length}
          onPageChange={setWhPage}
          onPageSizeChange={(sz) => {
            setWhPageSize(sz);
            setWhPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depo Kodu</TableHead>
                <TableHead>Depo Adı</TableHead>
                <TableHead>Sahiplik</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-[100px] text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs font-semibold">
                    {w.kod}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-foreground">
                    {w.ad}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.sahip_firma_ad || (w.sahip_tipi === "PLATFORM" ? "Platform" : "Tedarikçi")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={w.aktif ? "success" : "outline"} className="text-[10px]">
                      {w.aktif ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={w.ad}
                      isActive={w.aktif}
                      onEdit={() => openEditWhModal(w)}
                      onToggleActive={() => handleToggleWh(w)}
                      onDelete={() => setDeleteTarget(w)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* Stok Düzeltmesi Modalı — teklif jargonu yok */}
      <EntityModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        title="Stok Düzeltmesi"
        description="Depo ve ürün özellik kırılımı için artı (+) veya eksi (-) stok hareketi. Kırılım başına fiyat/adet için ürün → Stok & Fiyat sekmesi daha uygundur."
        isDirty={adjustForm.formState.isDirty}
        isSubmitting={adjustForm.formState.isSubmitting || adjustMut.isPending}
        submitLabel="Hareketi Kaydet"
        error={adjustError}
        onSubmit={onAdjustSubmit}
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Depo</Label>
            <Controller
              name="warehouse_id"
              control={adjustForm.control}
              render={({ field }) => (
                <RelationSelect
                  value={field.value ?? null}
                  onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                  placeholder="Depo seçin…"
                  searchPlaceholder="Depo kodu veya adı ile ara…"
                  createLabel="Yeni Depo Ekle"
                  onCreateNew={() => {
                    setAdjustOpen(false);
                    openCreateWhModal();
                  }}
                  loadOptions={async (q) => {
                    const page = await stokService.getWarehouses({
                      aktif: "true",
                      page_size: "30",
                      ...(q ? { q } : {}),
                    });
                    return (page.results ?? []).map((w) => ({
                      value: w.id,
                      label: `${w.kod} — ${w.ad}`,
                      subtitle: w.sahip_firma_ad || undefined,
                    }));
                  }}
                />
              )}
            />
            {adjustForm.formState.errors.warehouse_id ? (
              <p className="text-xs text-destructive">
                {adjustForm.formState.errors.warehouse_id.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Ürün / özellik kırılımı</Label>
            <Controller
              name="varyant_id"
              control={adjustForm.control}
              render={({ field }) => (
                <RelationSelect
                  value={field.value ?? null}
                  onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                  placeholder="Renk, boy, metal… kırılımı seçin…"
                  searchPlaceholder="Ürün adı veya SKU ile ara…"
                  loadOptions={async (q) => {
                    const page = await urunlerService.getOpsProducts({
                      page_size: "20",
                      ...(q ? { q } : {}),
                    });
                    const opts: Array<{
                      value: number;
                      label: string;
                      subtitle?: string;
                    }> = [];
                    for (const p of page.results ?? []) {
                      const detail =
                        p.varyantlar && p.varyantlar.length
                          ? p
                          : await urunlerService.getOpsProduct(p.id);
                      for (const v of detail.varyantlar ?? []) {
                        if (v.aktif === false) continue;
                        const ozellik = [v.renk, v.beden, v.gram ? `${v.gram} g` : null]
                          .filter(Boolean)
                          .join(" · ");
                        opts.push({
                          value: v.id,
                          label: `${detail.ad || detail.platform_kodu} — ${ozellik || v.sku}`,
                          subtitle: v.sku,
                        });
                      }
                    }
                    return opts.slice(0, 40);
                  }}
                />
              )}
            />
            {adjustForm.formState.errors.varyant_id ? (
              <p className="text-xs text-destructive">
                {adjustForm.formState.errors.varyant_id.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stok-birim-fiyat">
              Birim fiyat (yalnız ilk bağ / fiyat yoksa)
            </Label>
            <Input
              id="stok-birim-fiyat"
              placeholder="Örn: 1250"
              className="font-mono tabular-nums"
              {...adjustForm.register("birim_fiyat")}
            />
            <p className="text-[10px] text-muted-foreground">
              Bu kırılımda fiyat yoksa buraya yazın; varsa boş bırakabilirsiniz.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stok-miktar">Miktar (artış için +, düşüm için -)</Label>
            <Input
              id="stok-miktar"
              placeholder="Örn: 10 veya -2.5"
              className="font-mono tabular-nums"
              {...adjustForm.register("miktar")}
            />
            {adjustForm.formState.errors.miktar ? (
              <p className="text-xs text-destructive">
                {adjustForm.formState.errors.miktar.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stok-neden">Açıklama / Neden</Label>
            <Input
              id="stok-neden"
              placeholder="Örn: Sayım fazlası girişi / fire düşümü"
              {...adjustForm.register("neden")}
            />
            {adjustForm.formState.errors.neden ? (
              <p className="text-xs text-destructive">
                {adjustForm.formState.errors.neden.message}
              </p>
            ) : null}
          </div>
        </div>
      </EntityModal>

      {/* Depo Oluştur / Düzenle Modalı */}
      <EntityModal
        open={whModalOpen}
        onOpenChange={setWhModalOpen}
        title={editingWh ? "Depo Bilgilerini Düzenle" : "Yeni Depo Tanımla"}
        description="Stok hareketlerinin tutulacağı depo bilgilerini girin."
        isDirty={whForm.formState.isDirty}
        isSubmitting={
          whForm.formState.isSubmitting || createWhMut.isPending || updateWhMut.isPending
        }
        submitLabel={editingWh ? "Değişiklikleri Kaydet" : "Depoyu Oluştur"}
        error={whModalError}
        onSubmit={onWhSubmit}
        size="md"
      >
        <div className="space-y-4">
          {!editingWh && isOps ? (
            <div className="space-y-1.5">
              <Label>Sahip Firma (Opsiyonel — boşsa Platform deposu)</Label>
              <Controller
                name="sahip_firma_id"
                control={whForm.control}
                render={({ field }) => (
                  <RelationSelect
                    value={field.value ?? null}
                    onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                    placeholder="Kendi firmanız veya tedarikçi seçin…"
                    searchPlaceholder="Firma adı veya vergi no ile ara…"
                    clearable
                    loadOptions={async (q) => {
                      const res = await opsFirmalarService.list({
                        tedarikci_mi: "true",
                        page_size: "30",
                        ...(q ? { q } : {}),
                      });
                      return (res.results ?? []).map((f) => ({
                        value: f.id,
                        label: f.ad,
                        subtitle: f.durum,
                      }));
                    }}
                  />
                )}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wh-kod">Depo Kodu</Label>
              <Input
                id="wh-kod"
                placeholder="Örn: IST-MERKEZ"
                className="font-mono"
                {...whForm.register("kod")}
              />
              {whForm.formState.errors.kod ? (
                <p className="text-xs text-destructive">
                  {whForm.formState.errors.kod.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-ad">Depo Adı</Label>
              <Input
                id="wh-ad"
                placeholder="Örn: İstanbul Merkez Kasa"
                {...whForm.register("ad")}
              />
              {whForm.formState.errors.ad ? (
                <p className="text-xs text-destructive">
                  {whForm.formState.errors.ad.message}
                </p>
              ) : null}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={whForm.watch("aktif")}
              onChange={(e) =>
                whForm.setValue("aktif", e.target.checked, { shouldDirty: true })
              }
            />
            <span>Depo aktif (stok giriş/çıkış işlemlerine açık)</span>
          </label>
        </div>
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Depoyu Sil"
        description={
          deleteTarget
            ? `"${deleteTarget.ad}" (${deleteTarget.kod}) deposunu silmek istediğinize emin misiniz? Stok hareketi olan depolar silinemez.`
            : ""
        }
        confirmLabel="Sil"
        variant="destructive"
        loading={deleteWhMut.isPending}
        onConfirm={handleDeleteWh}
      />
    </div>
  );
}
