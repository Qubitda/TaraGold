"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useAddMeasurementMutation,
  useCancelInspectionMutation,
  useCreateInspectionMutation,
  useFailInspectionMutation,
  useInspectionDetailQuery,
  useInspectionsQuery,
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
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { formatDateTime } from "@/lib/format";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Play,
  Scale,
  RefreshCw,
  AlertCircle,
  Ban,
  Plus,
  Eye,
} from "lucide-react";

export function QualityInspectionsView() {
  const actionToast = useActionToast();
  const listQ = useInspectionsQuery();
  const createMut = useCreateInspectionMutation();
  const startMut = useStartInspectionMutation();
  const passMut = usePassInspectionMutation();
  const failMut = useFailInspectionMutation();
  const cancelMut = useCancelInspectionMutation();
  const measureMut = useAddMeasurementMutation();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [measureModalOpen, setMeasureModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] =
    useState<OpsInspection | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const detailQ = useInspectionDetailQuery(detailId, detailId !== null);

  const createForm = useForm<CreateInspectionInput>({
    resolver: zodResolver(createInspectionSchema),
    defaultValues: { order_id: undefined, order_line_id: "", notlar: "" },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MeasurementInput>({
    resolver: zodResolver(measurementSchema),
    defaultValues: {
      order_line_id: undefined,
      olculen_ayar: "",
      olculen_gram: "",
      override_gerekce: "",
    },
  });

  const inspections = listQ.data ?? [];
  const loading = listQ.isLoading;
  const error = listQ.isError
    ? mapCommerceError(listQ.error, "Kalite kontrol listesi alınamadı.")
    : null;

  const runAction = async (
    label: string,
    fn: () => Promise<unknown>
  ) => {
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
      reset();
    } catch (err) {
      actionToast.error("Ölçüm kaydedilemedi", err);
    }
  };

  const renderDurumBadge = (durum: string) => {
    switch (durum) {
      case "GECTI":
        return <Badge variant="success">GEÇTİ</Badge>;
      case "KALDI":
        return <Badge variant="destructive">KALDI</Badge>;
      case "IPTAL":
        return <Badge variant="destructive">İPTAL</Badge>;
      case "INCELEMEDE":
      case "OLCUMDE":
      case "DEVAM_EDIYOR":
        return <Badge variant="secondary">{durum}</Badge>;
      case "BEKLEMEDE":
      case "TASLAK":
      default:
        return <Badge variant="outline">{durum || "BEKLEMEDE"}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Kalite Kontrol (QC)
          </h1>
          <p className="text-xs text-muted-foreground">
            İnceleme oluşturma, detay ölçüm listesi ve kabul/ret geçişleri.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni İnceleme (QC)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQ.refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center justify-between rounded-[8px] border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQ.refetch()}
            className="h-8 border-destructive/30"
          >
            Yeniden Dene
          </Button>
        </div>
      )}

      <div className="rounded-[8px] border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex h-48 w-full items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>İnceleme listesi alınıyor…</span>
            </div>
          </div>
        ) : inspections.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Şu an bekleyen veya aktif kalite kontrol incelemesi bulunmamaktadır.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">İnceleme ID</TableHead>
                <TableHead>Sipariş Ref</TableHead>
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
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs font-semibold tabular-nums">
                      QC-#{item.id}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {item.order_id != null ? `Sipariş #${item.order_id}` : "—"}
                    </TableCell>
                    <TableCell>{renderDurumBadge(item.durum)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailId(item.id)}
                          className="h-8 text-xs gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detay
                        </Button>
                        {actions.includes("start") && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={startMut.isPending}
                            onClick={() =>
                              void runAction("İnceleme başlatıldı", () =>
                                startMut.mutateAsync(item.id)
                              )
                            }
                            className="h-8 text-xs gap-1"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Başlat
                          </Button>
                        )}
                        {canMeasure && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedInspection(item);
                              setMeasureModalOpen(true);
                            }}
                            className="h-8 text-xs gap-1"
                          >
                            <Scale className="h-3.5 w-3.5" />
                            Ölçüm Gir
                          </Button>
                        )}
                        {actions.includes("pass") && (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={passMut.isPending}
                            onClick={() =>
                              void runAction("Geçti olarak işaretlendi", () =>
                                passMut.mutateAsync(item.id)
                              )
                            }
                            className="h-8 text-xs gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Onayla
                          </Button>
                        )}
                        {actions.includes("fail") && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={failMut.isPending}
                            onClick={() =>
                              void runAction("Kaldı olarak işaretlendi", () =>
                                failMut.mutateAsync(item.id)
                              )
                            }
                            className="h-8 text-xs gap-1"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reddet
                          </Button>
                        )}
                        {actions.includes("cancel") && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cancelMut.isPending}
                            onClick={() =>
                              void runAction("İnceleme iptal edildi", () =>
                                cancelMut.mutateAsync(item.id)
                              )
                            }
                            className="h-8 text-xs gap-1"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            İptal
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Yeni QC İnceleme Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Kalite Kontrol (QC) İncelemesi</DialogTitle>
            <DialogDescription>
              Sipariş veya belirli bir sipariş satırı için QC kaydı oluşturur.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-create-order">Sipariş ID</Label>
              <Input
                id="qc-create-order"
                type="number"
                className="font-mono tabular-nums"
                placeholder="Örn: 201"
                disabled={createForm.formState.isSubmitting}
                {...createForm.register("order_id", { valueAsNumber: true })}
              />
              {createForm.formState.errors.order_id && (
                <span className="text-[11px] text-destructive">
                  {createForm.formState.errors.order_id.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-create-line">
                Sipariş Satırı ID (opsiyonel)
              </Label>
              <Input
                id="qc-create-line"
                type="number"
                className="font-mono tabular-nums"
                disabled={createForm.formState.isSubmitting}
                {...createForm.register("order_line_id")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-create-notlar">Notlar (opsiyonel)</Label>
              <Input
                id="qc-create-notlar"
                disabled={createForm.formState.isSubmitting}
                {...createForm.register("notlar")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  createForm.formState.isSubmitting || createMut.isPending
                }
              >
                {createMut.isPending ? "Oluşturuluyor…" : "Oluştur"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* QC Detay Dialog */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>QC İnceleme Detayı (QC-#{detailId})</DialogTitle>
            <DialogDescription>
              Sunucudan alınan inceleme durumu ve kaydedilmiş ölçümler.
            </DialogDescription>
          </DialogHeader>
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
              <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-border p-3">
                <div>
                  <span className="text-muted-foreground">İnceleme ID</span>
                  <p className="font-mono font-semibold">
                    QC-#{detailQ.data.id}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Durum</span>
                  <div className="mt-0.5">
                    {renderDurumBadge(detailQ.data.durum)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Sipariş / Satır</span>
                  <p className="font-mono">
                    {detailQ.data.order_id != null
                      ? `#${detailQ.data.order_id}`
                      : "—"}
                    {detailQ.data.order_line_id != null
                      ? ` / Satır #${detailQ.data.order_line_id}`
                      : ""}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sevkiyat Bloku</span>
                  <p className="font-mono">
                    {detailQ.data.shipment_blok ? "BLOKLU" : "AÇIK"}
                  </p>
                </div>
                {detailQ.data.olusturma_tarihi && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Oluşturma</span>
                    <p>{formatDateTime(detailQ.data.olusturma_tarihi)}</p>
                  </div>
                )}
                {detailQ.data.notlar && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notlar</span>
                    <p>{detailQ.data.notlar}</p>
                  </div>
                )}
              </div>

              <div className="rounded-[6px] border border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-3 py-2 font-semibold">
                  Ölçümler ({detailQ.data.measurements?.length ?? 0})
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
                        <TableHead>Satır</TableHead>
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
                            #{m.order_line_id}
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
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {m.sonuc || "KAYDEDILDI"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailId(null)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Ölçüm Gir Dialog */}
      <Dialog open={measureModalOpen} onOpenChange={setMeasureModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ölçüm Kaydı (QC-#{selectedInspection?.id})</DialogTitle>
            <DialogDescription>
              Ölçülen ayar/gram değeri sunucu toleransına göre değerlendirilir.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(onMeasurementSubmit)}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-line">Sipariş satırı (order_line_id)</Label>
              <Input
                id="qc-line"
                type="number"
                className="font-mono tabular-nums"
                disabled={isSubmitting}
                {...register("order_line_id", { valueAsNumber: true })}
              />
              {errors.order_line_id && (
                <span className="text-[11px] text-destructive">
                  {errors.order_line_id.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-ayar">Ölçülen Ayar</Label>
              <Input
                id="qc-ayar"
                placeholder="Örn: 14"
                className="font-mono tabular-nums"
                disabled={isSubmitting}
                {...register("olculen_ayar")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-gram">Ölçülen Gram</Label>
              <Input
                id="qc-gram"
                placeholder="Örn: 12.450"
                className="font-mono tabular-nums"
                disabled={isSubmitting}
                {...register("olculen_gram")}
              />
              {errors.olculen && (
                <span className="text-[11px] text-destructive">
                  {errors.olculen.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-override">Override gerekçe</Label>
              <Input
                id="qc-override"
                disabled={isSubmitting}
                {...register("override_gerekce")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMeasureModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || measureMut.isPending}
              >
                {isSubmitting || measureMut.isPending
                  ? "Kaydediliyor…"
                  : "Ölçümü Kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

