"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useAddMeasurementMutation,
  useCancelInspectionMutation,
  useCreateInspectionMutation,
  useFailInspectionMutation,
  useInspectionDetailQuery,
  useInspectionsPageQuery,
  usePassInspectionMutation,
  useStartInspectionMutation,
} from "../hooks";
import {
  createInspectionSchema,
  measurementSchema,
  toOpsMeasurementBody,
  type CreateInspectionInput,
  type MeasurementInput,
} from "../schemas";
import type { OpsInspection } from "../types";
import {
  opsOrdersService,
  type OpsOrderLineRow,
  type OpsOrderRow,
} from "@/features/firmalar/services/ops-firmalar";
import { siparisService } from "@/features/siparis/services";
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { formatDateTime } from "@/lib/format";
import {
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
  type ExtraRowAction,
  type RelationOption,
} from "@/components/crud";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Play,
  Scale,
  RefreshCw,
  Ban,
} from "lucide-react";

const DURUM_OPTIONS = [
  { value: "", label: "Tüm durumlar" },
  { value: "TASLAK", label: "Taslak" },
  { value: "OLCUMDE", label: "Ölçümde" },
  { value: "GECTI", label: "Geçti" },
  { value: "KALDI", label: "Kaldı" },
  { value: "IPTAL", label: "İptal" },
];

const DURUM_LABELS: Record<string, string> = {
  TASLAK: "Taslak",
  OLCUMDE: "Ölçümde",
  INCELEMEDE: "İncelemede",
  DEVAM_EDIYOR: "Devam Ediyor",
  GECTI: "Geçti",
  KALDI: "Kaldı",
  IPTAL: "İptal",
  BEKLEMEDE: "Beklemede",
};

function orderToOption(o: OpsOrderRow): RelationOption {
  const firstLine = o.satirlar?.[0];
  const productSummary = firstLine
    ? `${firstLine.urun_ad || firstLine.platform_kodu || "Ürün"}${
        (o.satir_sayisi || o.satirlar?.length || 0) > 1
          ? ` (+${(o.satir_sayisi || o.satirlar?.length || 1) - 1} kalem)`
          : ""
      }`
    : `${o.satir_sayisi ?? 0} kalem`;
  const toplamText = o.toplamlar
    ? Object.entries(o.toplamlar)
        .map(([pb, t]) => `${t} ${pb}`)
        .join(" · ")
    : "";
  return {
    value: o.id,
    label: o.alici_firma_ad
      ? `${o.alici_firma_ad} — ${productSummary}`
      : `Sipariş (${productSummary})`,
    subtitle: [DURUM_LABELS[o.durum] || o.durum, toplamText]
      .filter(Boolean)
      .join(" · "),
  };
}

function lineToOption(ln: OpsOrderLineRow): RelationOption {
  const name = ln.urun_ad || ln.platform_kodu || "Sipariş Kalemi";
  return {
    value: ln.id,
    label: ln.platform_kodu && ln.urun_ad
      ? `${ln.urun_ad} (${ln.platform_kodu})`
      : name,
    subtitle: `${ln.miktar} ${ln.birim}${ln.teslim_modeli ? ` · ${ln.teslim_modeli}` : ""}`,
  };
}

export function QualityInspectionsView() {
  const actionToast = useActionToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [durumFilter, setDurumFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const listQ = useInspectionsPageQuery({
    q: debouncedSearch || undefined,
    durum: durumFilter || undefined,
    page,
    page_size: pageSize,
  });

  const createMut = useCreateInspectionMutation();
  const startMut = useStartInspectionMutation();
  const passMut = usePassInspectionMutation();
  const failMut = useFailInspectionMutation();
  const cancelMut = useCancelInspectionMutation();
  const measureMut = useAddMeasurementMutation();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createOrderLines, setCreateOrderLines] = useState<RelationOption[]>([]);

  const [measureModalOpen, setMeasureModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] =
    useState<OpsInspection | null>(null);
  const [measureLines, setMeasureLines] = useState<RelationOption[]>([]);
  const [loadingMeasureLines, setLoadingMeasureLines] = useState(false);

  const [detailId, setDetailId] = useState<number | null>(null);
  const detailQ = useInspectionDetailQuery(detailId, detailId !== null);

  const createForm = useForm<CreateInspectionInput>({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: { order_id: undefined, order_line_id: "", notlar: "" },
  });

  const measureForm = useForm<MeasurementInput>({
    resolver: zodResolver(measurementSchema),
    defaultValues: {
      order_line_id: undefined,
      olculen_ayar: "",
      olculen_gram: "",
      override_gerekce: "",
    },
  });

  const inspections = listQ.data?.results ?? [];
  const totalCount = listQ.data?.count ?? inspections.length;
  const loading = listQ.isLoading;
  const error = listQ.isError
    ? mapCommerceError(listQ.error, "Kalite kontrol listesi alınamadı.")
    : null;

  const loadOrderOptions = useCallback(async (q: string): Promise<RelationOption[]> => {
    const res = await opsOrdersService.listAll({
      q: q || undefined,
      page_size: 30,
    });
    return (res.results ?? []).map(orderToOption);
  }, []);

  const syncLinesForOrder = async (orderId: number): Promise<RelationOption[]> => {
    try {
      const opsRes = await opsOrdersService.listAll({
        q: String(orderId),
        page_size: 20,
      });
      const matched = (opsRes.results ?? []).find((o) => o.id === orderId);
      if (matched?.satirlar?.length) {
        return matched.satirlar.map(lineToOption);
      }
    } catch {
      // Fallback to buyer detail if needed
    }
    try {
      const ord = await siparisService.getOrderDetail(orderId);
      return (ord.lines ?? []).map((ln) => ({
        value: ln.id,
        label:
          ln.urun_ad && ln.varyant_sku
            ? `${ln.urun_ad} (${ln.varyant_sku})`
            : ln.urun_ad || ln.varyant_sku || "Sipariş Kalemi",
        subtitle: `${ln.miktar} ${ln.birim}`,
      }));
    } catch {
      return [];
    }
  };

  const handleOpenMeasure = async (item: OpsInspection) => {
    setSelectedInspection(item);
    measureForm.reset({
      order_line_id: item.order_line_id ?? undefined,
      olculen_ayar: "",
      olculen_gram: "",
      override_gerekce: "",
    });
    setMeasureModalOpen(true);
    setMeasureLines([]);
    if (item.order_id != null) {
      setLoadingMeasureLines(true);
      const opts = await syncLinesForOrder(item.order_id);
      setMeasureLines(opts);
      if (!item.order_line_id && opts.length === 1) {
        measureForm.setValue("order_line_id", Number(opts[0].value));
      }
      setLoadingMeasureLines(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      actionToast.success(label);
    } catch (err) {
      actionToast.error(label, err);
    }
  };

  const onCreateSubmit = async (formData: CreateInspectionInput) => {
    try {
      const parsedLineId =
        formData.order_line_id && Number.isFinite(Number(formData.order_line_id))
          ? Number(formData.order_line_id)
          : undefined;
      await createMut.mutateAsync({
        order_id: formData.order_id,
        ...(parsedLineId ? { order_line_id: parsedLineId } : {}),
        ...(formData.notlar ? { notlar: formData.notlar } : {}),
      });
      actionToast.success("Kalite kontrol incelemesi oluşturuldu");
      setCreateModalOpen(false);
      setCreateOrderLines([]);
      createForm.reset();
    } catch (err) {
      actionToast.error("İnceleme oluşturulamadı", err);
    }
  };

  const onMeasurementSubmit = async (formData: MeasurementInput) => {
    if (!selectedInspection) return;
    try {
      const body = toOpsMeasurementBody(formData);
      await measureMut.mutateAsync({ id: selectedInspection.id, data: body });
      actionToast.success("Ölçüm kaydedildi");
      setMeasureModalOpen(false);
      measureForm.reset();
    } catch (err) {
      actionToast.error("Ölçüm kaydedilemedi", err);
    }
  };

  const renderDurumBadge = (durum: string) => {
    const label = DURUM_LABELS[durum] || durum || "Taslak";
    switch (durum) {
      case "GECTI":
        return <Badge variant="success">{label}</Badge>;
      case "KALDI":
      case "IPTAL":
        return <Badge variant="destructive">{label}</Badge>;
      case "INCELEMEDE":
      case "OLCUMDE":
      case "DEVAM_EDIYOR":
        return <Badge variant="secondary">{label}</Badge>;
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  const selectedCreateOrderId = createForm.watch("order_id");
  const selectedCreateLineId = createForm.watch("order_line_id");
  const selectedMeasureLineId = measureForm.watch("order_line_id");

  return (
    <div className="flex flex-col gap-6">
      <ListPage
        title="Kalite Kontrol"
        description="Sipariş ve ürün kalemleri için kalite inceleme, ölçüm toleransı ve onay süreçleri."
        createLabel="Yeni İnceleme"
        onCreate={() => {
          createForm.reset({ order_id: undefined, order_line_id: "", notlar: "" });
          setCreateOrderLines([]);
          setCreateModalOpen(true);
        }}
        extraActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void listQ.refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        }
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Alıcı firma, ürün kodu veya not ile ara…"
        filters={
          <select
            value={durumFilter}
            onChange={(e) => {
              setDurumFilter(e.target.value);
              setPage(1);
            }}
            aria-label="İnceleme durumu filtresi"
            className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
          >
            {DURUM_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        }
        loading={loading}
        error={error}
        onRetry={() => void listQ.refetch()}
        isEmpty={inspections.length === 0}
        emptyTitle="Kalite kontrol kaydı bulunamadı"
        emptyDescription="Filtreleri değiştirin veya sipariş için yeni bir kalite incelemesi başlatın."
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alıcı Firma</TableHead>
              <TableHead>Not / Kapsam</TableHead>
              <TableHead>Sevkiyat Bloku</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inspections.map((item) => {
              const actions = item.allowed_actions || [];
              const canMeasure =
                actions.includes("measure") ||
                actions.includes("add_measurement");

              const extraActions: ExtraRowAction[] = [];
              if (actions.includes("start")) {
                extraActions.push({
                  label: "İncelemeyi Başlat",
                  icon: <Play className="h-3.5 w-3.5" />,
                  disabled: startMut.isPending,
                  onClick: () =>
                    runAction("İnceleme başlatıldı", () =>
                      startMut.mutateAsync(item.id)
                    ),
                });
              }
              if (canMeasure) {
                extraActions.push({
                  label: "Ölçüm Gir",
                  icon: <Scale className="h-3.5 w-3.5" />,
                  onClick: () => void handleOpenMeasure(item),
                });
              }
              if (actions.includes("pass")) {
                extraActions.push({
                  label: "Onayla (Geçti)",
                  icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                  disabled: passMut.isPending,
                  onClick: () =>
                    runAction("İnceleme geçti olarak işaretlendi", () =>
                      passMut.mutateAsync(item.id)
                    ),
                });
              }
              if (actions.includes("fail")) {
                extraActions.push({
                  label: "Reddet (Kaldı)",
                  icon: <XCircle className="h-3.5 w-3.5" />,
                  variant: "destructive",
                  confirmTitle: "Kalite Kontrolü Reddet",
                  confirmDescription:
                    "Bu inceleme kaldı olarak işaretlenecek ve sevkiyat bloku devam edecektir.",
                  disabled: failMut.isPending,
                  onClick: () =>
                    runAction("İnceleme kaldı olarak işaretlendi", () =>
                      failMut.mutateAsync(item.id)
                    ),
                });
              }
              if (actions.includes("cancel")) {
                extraActions.push({
                  label: "İptal Et",
                  icon: <Ban className="h-3.5 w-3.5" />,
                  variant: "destructive",
                  confirmTitle: "İncelemeyi İptal Et",
                  confirmDescription:
                    "Seçili kalite kontrol kaydı iptal edilecek. Devam etmek istiyor musunuz?",
                  disabled: cancelMut.isPending,
                  onClick: () =>
                    runAction("İnceleme iptal edildi", () =>
                      cancelMut.mutateAsync(item.id)
                    ),
                });
              }

              return (
                <TableRow key={item.id}>
                  <TableCell className="text-xs font-medium text-foreground">
                    {item.alici_firma_ad || "Platform Siparişi"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                    {item.notlar || "Genel kalite kontrol incelemesi"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.shipment_blok ? "warning" : "outline"}>
                      {item.shipment_blok ? "Bloklu" : "Açık"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.olusturma_tarihi
                      ? formatDateTime(item.olusturma_tarihi)
                      : "—"}
                  </TableCell>
                  <TableCell>{renderDurumBadge(item.durum)}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={item.alici_firma_ad || "Kalite incelemesi"}
                      onView={() => setDetailId(item.id)}
                      extraActions={extraActions}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ListPage>

      {/* Yeni QC İnceleme Modal */}
      <EntityModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title="Yeni Kalite Kontrol İncelemesi"
        description="Sipariş veya belirli bir ürün kalemi için kalite kontrol kaydı oluşturun."
        isDirty={createForm.formState.isDirty}
        isSubmitting={createForm.formState.isSubmitting || createMut.isPending}
        submitLabel="İnceleme Oluştur"
        onSubmit={createForm.handleSubmit(onCreateSubmit)}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-create-order">Sipariş *</Label>
          <RelationSelect
            id="qc-create-order"
            value={selectedCreateOrderId ?? null}
            onChange={(val) => {
              const num = val ? Number(val) : undefined;
              createForm.setValue("order_id", num as number, {
                shouldValidate: true,
                shouldDirty: true,
              });
              createForm.setValue("order_line_id", "");
              setCreateOrderLines([]);
              if (num) {
                void syncLinesForOrder(num).then(setCreateOrderLines);
              }
            }}
            loadOptions={loadOrderOptions}
            placeholder="Sipariş seçin…"
            searchPlaceholder="Alıcı firma veya ürün kodu ile ara…"
            emptyText="Uygun sipariş bulunamadı"
            disabled={createForm.formState.isSubmitting}
          />
          {createForm.formState.errors.order_id && (
            <span className="text-[11px] text-destructive">
              {createForm.formState.errors.order_id.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-create-line">Sipariş Kalemi (opsiyonel)</Label>
          <RelationSelect
            id="qc-create-line"
            value={selectedCreateLineId || null}
            onChange={(val) =>
              createForm.setValue("order_line_id", val ? String(val) : "", {
                shouldDirty: true,
              })
            }
            options={createOrderLines}
            placeholder={
              selectedCreateOrderId
                ? createOrderLines.length > 0
                  ? "Tüm sipariş veya kalem seçin…"
                  : "Kalem bulunamadı (tüm sipariş kontrol edilir)"
                : "Önce sipariş seçin…"
            }
            clearable
            disabled={
              !selectedCreateOrderId ||
              createOrderLines.length === 0 ||
              createForm.formState.isSubmitting
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-create-notlar">Notlar (opsiyonel)</Label>
          <Input
            id="qc-create-notlar"
            placeholder="Örn: İlk parti ayar & gram kontrolü"
            disabled={createForm.formState.isSubmitting}
            {...createForm.register("notlar")}
          />
        </div>
      </EntityModal>

      {/* QC Detay Modal */}
      <EntityModal
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        title="Kalite İnceleme Detayı"
        description="İnceleme durumu, sevkiyat bloku ve kaydedilmiş ölçüm sonuçları."
        size="md"
      >
        {detailQ.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>İnceleme detayı yükleniyor…</span>
          </div>
        ) : detailQ.isError ? (
          <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {mapCommerceError(detailQ.error, "İnceleme detayı alınamadı.")}
          </div>
        ) : detailQ.data ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-[6px] border border-border p-3">
              <div>
                <span className="text-muted-foreground">Alıcı Firma</span>
                <p className="font-medium text-foreground mt-0.5">
                  {detailQ.data.alici_firma_ad || "Platform Siparişi"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Durum</span>
                <div className="mt-0.5">
                  {renderDurumBadge(detailQ.data.durum)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Sevkiyat Bloku</span>
                <p className="font-medium mt-0.5">
                  {detailQ.data.shipment_blok ? "Bloklu" : "Açık"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Oluşturma</span>
                <p className="mt-0.5">
                  {detailQ.data.olusturma_tarihi
                    ? formatDateTime(detailQ.data.olusturma_tarihi)
                    : "—"}
                </p>
              </div>
              {detailQ.data.notlar && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notlar</span>
                  <p className="mt-0.5">{detailQ.data.notlar}</p>
                </div>
              )}
            </div>

            <div className="rounded-[6px] border border-border overflow-hidden">
              <div className="border-b border-border bg-muted/30 px-3 py-2 font-semibold">
                Ölçüm Kayıtları ({detailQ.data.measurements?.length ?? 0})
              </div>
              {!detailQ.data.measurements ||
              detailQ.data.measurements.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  Henüz ölçüm kaydı bulunmuyor.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün Kodu</TableHead>
                      <TableHead>Beklenen</TableHead>
                      <TableHead>Ölçülen</TableHead>
                      <TableHead>Ayar / Gram</TableHead>
                      <TableHead>Sonuç</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailQ.data.measurements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono">
                          {m.varyant_sku || "Sipariş Kalemi"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {m.beklenen || "—"} {m.birim || ""}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {m.olculen}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {m.olculen_ayar || m.olculen_gram
                            ? `${m.olculen_ayar ?? "—"} ay / ${m.olculen_gram ?? "—"} gr`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {m.sonuc || "KAYDEDİLDİ"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Ölçüm Gir Modal */}
      <EntityModal
        open={measureModalOpen}
        onOpenChange={setMeasureModalOpen}
        title="Ölçüm Kaydı"
        description={
          selectedInspection?.alici_firma_ad
            ? `${selectedInspection.alici_firma_ad} için ölçülen ayar ve gram değerini girin.`
            : "Ölçülen ayar ve gram değeri toleransa göre değerlendirilir."
        }
        isDirty={measureForm.formState.isDirty}
        isSubmitting={measureForm.formState.isSubmitting || measureMut.isPending}
        submitLabel="Ölçümü Kaydet"
        onSubmit={measureForm.handleSubmit(onMeasurementSubmit)}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-line">Sipariş Kalemi *</Label>
          <RelationSelect
            id="qc-line"
            value={selectedMeasureLineId ?? null}
            onChange={(val) =>
              measureForm.setValue("order_line_id", val ? Number(val) : (undefined as unknown as number), {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            options={measureLines}
            placeholder={
              loadingMeasureLines
                ? "Sipariş kalemleri yükleniyor…"
                : "Ölçülecek ürün kalemini seçin…"
            }
            disabled={loadingMeasureLines || measureForm.formState.isSubmitting}
          />
          {measureForm.formState.errors.order_line_id && (
            <span className="text-[11px] text-destructive">
              {measureForm.formState.errors.order_line_id.message}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-ayar">Ölçülen Ayar</Label>
            <Input
              id="qc-ayar"
              placeholder="Örn: 14"
              className="font-mono tabular-nums"
              disabled={measureForm.formState.isSubmitting}
              {...measureForm.register("olculen_ayar")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-gram">Ölçülen Gram</Label>
            <Input
              id="qc-gram"
              placeholder="Örn: 12.450"
              className="font-mono tabular-nums"
              disabled={measureForm.formState.isSubmitting}
              {...measureForm.register("olculen_gram")}
            />
          </div>
        </div>
        {measureForm.formState.errors.olculen && (
          <span className="text-[11px] text-destructive">
            {measureForm.formState.errors.olculen.message}
          </span>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-override">Tolerans Aşım Gerekçesi (opsiyonel)</Label>
          <Input
            id="qc-override"
            placeholder="Varsa tolerans dışı kabul gerekçesi"
            disabled={measureForm.formState.isSubmitting}
            {...measureForm.register("override_gerekce")}
          />
        </div>
      </EntityModal>
    </div>
  );
}
