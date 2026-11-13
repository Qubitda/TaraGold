"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  useApproveReturnMutation,
  useBuyerShipmentPodQuery,
  useBuyerShipmentsQuery,
  useCancelReturnMutation,
  useCancelShipmentMutation,
  useCreateReturnMutation,
  useCreateShipmentMutation,
  useDeliverShipmentMutation,
  useDispatchShipmentMutation,
  useMahsupReturnMutation,
  useOpsShipmentsQuery,
  usePrepareShipmentMutation,
  useRejectReturnMutation,
  useReturnsQuery,
  useSubmitBuyerPodMutation,
  useSubmitPodMutation,
  useSubmitReturnMutation,
} from "../hooks";
import { lojistikService } from "../services";
import { siparisService } from "@/features/siparis/services";
import type { BuyerOrder } from "@/features/siparis/types";
import {
  createReturnSchema,
  createShipmentSchema,
  shipmentDispatchSchema,
  shipmentPodSchema,
  type CreateReturnInput,
  type CreateShipmentInput,
  type ShipmentDispatchInput,
  type ShipmentPodInput,
} from "../schemas";
import type {
  BuyerReturnDetail,
  BuyerShipment,
  OpsShipment,
} from "../types";
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
  Truck,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  PackageCheck,
  Send,
  CheckCircle2,
  ClipboardCheck,
  Ban,
  Plus,
  Eye,
  XCircle,
  Download,
  FileText,
} from "lucide-react";

export function LogisticsManagementView() {
  const actionToast = useActionToast();
  const { user } = useAuth();
  const canManageShipment = Boolean(
    user?.capabilities?.can_manage_shipment || user?.capabilities?.can_view_ops
  );
  const canManageReturn = Boolean(
    user?.capabilities?.can_manage_return || user?.capabilities?.can_view_ops
  );

  const [activeTab, setActiveTab] = useState<"shipments" | "returns">(
    "shipments"
  );

  const opsShipmentsQ = useOpsShipmentsQuery(canManageShipment);
  const buyerShipmentsQ = useBuyerShipmentsQuery(!canManageShipment);
  const returnsQ = useReturnsQuery();

  const createShipmentMut = useCreateShipmentMutation();
  const prepareMut = usePrepareShipmentMutation();
  const dispatchMut = useDispatchShipmentMutation();
  const deliverMut = useDeliverShipmentMutation();
  const cancelMut = useCancelShipmentMutation();
  const podMut = useSubmitPodMutation();
  const submitBuyerPodMut = useSubmitBuyerPodMutation();

  const createReturnMut = useCreateReturnMutation();
  const submitReturnMut = useSubmitReturnMutation();
  const approveMut = useApproveReturnMutation();
  const rejectReturnMut = useRejectReturnMutation();
  const cancelReturnMut = useCancelReturnMutation();
  const mahsupMut = useMahsupReturnMutation();

  const [createShipModalOpen, setCreateShipModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [podModalOpen, setPodModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<
    OpsShipment | BuyerShipment | null
  >(null);

  const [buyerPodShipmentId, setBuyerPodShipmentId] = useState<number | null>(
    null
  );
  const [downloadingPod, setDownloadingPod] = useState(false);
  const buyerPodQ = useBuyerShipmentPodQuery(
    buyerPodShipmentId,
    buyerPodShipmentId !== null
  );

  const [shipDetailOpen, setShipDetailOpen] = useState(false);
  const [shipDetailLoading, setShipDetailLoading] = useState(false);
  const [shipDetailError, setShipDetailError] = useState<string | null>(null);
  const [shipDetailData, setShipDetailData] = useState<
    OpsShipment | BuyerShipment | null
  >(null);

  const [createReturnOpen, setCreateReturnOpen] = useState(false);
  const [fetchedOrderLines, setFetchedOrderLines] = useState<
    NonNullable<BuyerOrder["lines"]>
  >([]);
  const [fetchingLines, setFetchingLines] = useState(false);

  const [returnDetailOpen, setReturnDetailOpen] = useState(false);
  const [returnDetailLoading, setReturnDetailLoading] = useState(false);
  const [returnDetailError, setReturnDetailError] = useState<string | null>(null);
  const [returnDetailTargetId, setReturnDetailTargetId] = useState<number | null>(
    null
  );
  const [returnDetailData, setReturnDetailData] =
    useState<BuyerReturnDetail | null>(null);

  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const createShipForm = useForm<CreateShipmentInput>({
    resolver: zodResolver(createShipmentSchema),
    defaultValues: {
      order_id: undefined,
      takip_no: "",
      notlar: "",
      teslim_modeli: "PLATFORM_QC",
      sevk_yonu: "PLATFORM_TO_ALICI",
    },
  });

  const dispatchForm = useForm<ShipmentDispatchInput>({
    resolver: zodResolver(shipmentDispatchSchema),
    defaultValues: { kargo_firma: "", takip_no: "" },
  });

  const podForm = useForm<ShipmentPodInput>({
    resolver: zodResolver(shipmentPodSchema),
    defaultValues: { teslim_alan: "", notlar: "", belgeler_ref: "" },
  });

  const createReturnForm = useForm<CreateReturnInput>({
    resolver: zodResolver(createReturnSchema),
    defaultValues: {
      order_id: undefined,
      shipment_id: undefined,
      sebep: "",
      notlar: "",
      order_line_id: undefined,
      miktar: "1",
    },
  });

  const activeShipmentsQ = canManageShipment ? opsShipmentsQ : buyerShipmentsQ;
  const shipments = activeShipmentsQ.data ?? [];
  const returns = returnsQ.data ?? [];
  const loading =
    activeTab === "shipments" ? activeShipmentsQ.isLoading : returnsQ.isLoading;
  const error =
    activeTab === "shipments" && activeShipmentsQ.isError
      ? mapCommerceError(activeShipmentsQ.error, "Sevkiyat verileri alınamadı.")
      : activeTab === "returns" && returnsQ.isError
        ? mapCommerceError(returnsQ.error, "İade verileri alınamadı.")
        : null;

  const refetchAll = () => {
    void activeShipmentsQ.refetch();
    void returnsQ.refetch();
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      actionToast.success(label);
    } catch (err) {
      actionToast.error(label, err);
    }
  };

  const openShipmentDetail = async (id: number) => {
    setShipDetailOpen(true);
    setShipDetailLoading(true);
    setShipDetailError(null);
    setShipDetailData(null);
    try {
      const detail = canManageShipment
        ? await lojistikService.getOpsShipmentDetail(id)
        : await lojistikService.getBuyerShipmentDetail(id);
      setShipDetailData(detail);
    } catch (err) {
      const msg = mapCommerceError(err, "Sevkiyat detayı alınamadı.");
      setShipDetailError(msg);
      actionToast.error("Sevkiyat detayı alınamadı", err);
    } finally {
      setShipDetailLoading(false);
    }
  };

  const openReturnDetail = async (id: number) => {
    setReturnDetailOpen(true);
    setReturnDetailLoading(true);
    setReturnDetailError(null);
    setReturnDetailTargetId(id);
    setReturnDetailData(null);
    try {
      const detail = await lojistikService.getReturnDetail(id);
      setReturnDetailData(detail);
    } catch (err) {
      const msg = mapCommerceError(err, "İade detayı alınamadı.");
      setReturnDetailError(msg);
      actionToast.error("İade detayı alınamadı", err);
    } finally {
      setReturnDetailLoading(false);
    }
  };

  const onCreateShipmentSubmit = async (formData: CreateShipmentInput) => {
    try {
      await createShipmentMut.mutateAsync({
        order_id: formData.order_id,
        ...(formData.takip_no ? { takip_no: formData.takip_no } : {}),
        ...(formData.notlar ? { notlar: formData.notlar } : {}),
        ...(formData.teslim_modeli ? { teslim_modeli: formData.teslim_modeli } : {}),
        ...(formData.sevk_yonu ? { sevk_yonu: formData.sevk_yonu } : {}),
      });
      actionToast.success("Sevkiyat oluşturuldu");
      setCreateShipModalOpen(false);
      createShipForm.reset();
    } catch (err) {
      actionToast.error("Sevkiyat oluşturulamadı", err);
    }
  };

  const onDispatchSubmit = async (formData: ShipmentDispatchInput) => {
    if (!selectedShipment) return;
    try {
      await dispatchMut.mutateAsync({
        id: selectedShipment.id,
        data: {
          kargo_firma: formData.kargo_firma,
          tasiyici: formData.kargo_firma,
          takip_no: formData.takip_no,
        },
      });
      actionToast.success("Sevk kaydedildi");
      setDispatchModalOpen(false);
      dispatchForm.reset();
    } catch (err) {
      actionToast.error("Sevk işlemi kaydedilemedi", err);
    }
  };

  const onPodSubmit = async (formData: ShipmentPodInput) => {
    if (!selectedShipment) return;
    try {
      await podMut.mutateAsync({
        id: selectedShipment.id,
        data: {
          teslim_alan: formData.teslim_alan,
          ...(formData.notlar ? { notlar: formData.notlar } : {}),
          ...(formData.belgeler_ref
            ? { belgeler_ref: formData.belgeler_ref }
            : {}),
        },
      });
      actionToast.success("POD kaydedildi");
      setPodModalOpen(false);
      podForm.reset();
    } catch (err) {
      actionToast.error("POD kaydedilemedi", err);
    }
  };

  const onBuyerPodSubmit = async (formData: ShipmentPodInput) => {
    if (buyerPodShipmentId == null) return;
    try {
      await submitBuyerPodMut.mutateAsync({
        id: buyerPodShipmentId,
        data: {
          teslim_alan: formData.teslim_alan,
          ...(formData.notlar ? { notlar: formData.notlar } : {}),
          ...(formData.belgeler_ref
            ? { belgeler_ref: formData.belgeler_ref }
            : {}),
        },
      });
      actionToast.success("Teslimat kanıtı (POD) onaylandı");
      podForm.reset();
      void buyerPodQ.refetch();
    } catch (err) {
      actionToast.error("Teslimat kanıtı kaydedilemedi", err);
    }
  };

  const handleDownloadPod = async (shipmentId: number) => {
    setDownloadingPod(true);
    try {
      await lojistikService.downloadBuyerShipmentPod(shipmentId);
      actionToast.success("POD belgesi indirildi");
    } catch (err) {
      actionToast.error("POD belgesi indirilemedi", err);
    } finally {
      setDownloadingPod(false);
    }
  };

  const handleFetchOrderLines = async () => {
    const orderId = createReturnForm.getValues("order_id");
    if (!orderId || Number.isNaN(orderId) || orderId <= 0) {
      actionToast.error(
        "Sipariş ID gerekli",
        new Error("Satırları getirmek için geçerli bir Sipariş ID girin.")
      );
      return;
    }
    setFetchingLines(true);
    try {
      const ord = await siparisService.getOrderDetail(orderId);
      const lines = ord.lines ?? [];
      setFetchedOrderLines(lines);
      if (lines.length === 0) {
        actionToast.error("Satır bulunamadı", new Error("Bu siparişte satır yok."));
      } else {
        createReturnForm.setValue("order_line_id", lines[0].id);
        actionToast.success(`${lines.length} sipariş satırı getirildi`);
      }
    } catch (err) {
      setFetchedOrderLines([]);
      actionToast.error("Sipariş satırları alınamadı", err);
    } finally {
      setFetchingLines(false);
    }
  };

  const onCreateReturnSubmit = async (formData: CreateReturnInput) => {
    try {
      await createReturnMut.mutateAsync({
        order_id: formData.order_id,
        shipment_id: formData.shipment_id,
        sebep: formData.sebep,
        ...(formData.notlar ? { notlar: formData.notlar } : {}),
        lines: [
          {
            order_line_id: formData.order_line_id,
            miktar: formData.miktar,
          },
        ],
      });
      actionToast.success("İade talebi oluşturuldu");
      setCreateReturnOpen(false);
      setFetchedOrderLines([]);
      createReturnForm.reset();
    } catch (err) {
      actionToast.error("İade talebi oluşturulamadı", err);
    }
  };

  const onRejectReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectTargetId == null) return;
    try {
      await rejectReturnMut.mutateAsync({
        id: rejectTargetId,
        reason: rejectReason.trim() || undefined,
      });
      actionToast.success("İade talebi reddedildi");
      setRejectTargetId(null);
      setRejectReason("");
    } catch (err) {
      actionToast.error("İade reddedilemedi", err);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lojistik & Sevkiyat Operasyonları
          </h1>
          <p className="text-xs text-muted-foreground">
            Sevk: elle taşıyıcı adı + takip no (ADR-0034). POD ve iade yaşam
            döngüsü canlı API üzerinden yönetilir.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "shipments" && canManageShipment && (
            <Button
              size="sm"
              onClick={() => setCreateShipModalOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni Sevkiyat
            </Button>
          )}
          {activeTab === "returns" && (canManageReturn || !canManageShipment) && (
            <Button
              size="sm"
              onClick={() => setCreateReturnOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni İade Talebi
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
          <div className="flex items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("shipments")}
              className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "shipments"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Sevkiyatlar ({shipments.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("returns")}
              className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "returns"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>İade ({returns.length})</span>
            </button>
          </div>
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
            onClick={refetchAll}
            className="h-8 border-destructive/30"
          >
            Yeniden Dene
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 w-full items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Sevkiyat verileri alınıyor…</span>
          </div>
        </div>
      ) : activeTab === "shipments" ? (
        <div className="rounded-[8px] border border-border bg-card overflow-hidden">
          {shipments.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Kayıtlı sevkiyat bulunmamaktadır.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Sevkiyat ID</TableHead>
                  <TableHead>Sipariş Ref</TableHead>
                  <TableHead>Taşıyıcı / Takip</TableHead>
                  <TableHead>Model / Yön</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => {
                  const actions = s.allowed_actions || [];
                  const canPod =
                    actions.includes("pod") || actions.includes("add_pod");
                  const canBuyerPod =
                    actions.includes("view_pod") ||
                    actions.includes("confirm_pod") ||
                    Boolean(s.pod);
                  const carrierLabel = s.tasiyici || s.kargo_firma;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-semibold tabular-nums">
                        SHP-#{s.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {s.order_id != null ? `Sipariş #${s.order_id}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {carrierLabel || s.takip_no ? (
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {carrierLabel || "—"}
                            </span>
                            {s.takip_no && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {s.takip_no}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {s.teslim_modeli || "PLATFORM_QC"}
                        {s.sevk_yonu ? ` · ${s.sevk_yonu}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.durum === "TESLIM_EDILDI" || s.durum === "TESLIM"
                              ? "success"
                              : s.durum === "SEVK_EDILDI" || s.durum === "YOLDA"
                                ? "warning"
                                : "outline"
                          }
                          className="font-mono text-[10px]"
                        >
                          {s.durum}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openShipmentDetail(s.id)}
                            className="h-8 text-xs gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detay
                          </Button>
                          {canBuyerPod && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                podForm.reset();
                                setBuyerPodShipmentId(s.id);
                              }}
                              className="h-8 text-xs gap-1"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {actions.includes("confirm_pod") && !s.pod
                                ? "Teslimatı Onayla (POD)"
                                : "POD"}
                            </Button>
                          )}
                          {!canManageShipment &&
                            actions.includes("request_return") &&
                            s.order_id != null && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  createReturnForm.setValue(
                                    "order_id",
                                    s.order_id!
                                  );
                                  createReturnForm.setValue("shipment_id", s.id);
                                  setActiveTab("returns");
                                  setCreateReturnOpen(true);
                                }}
                                className="h-8 text-xs gap-1"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                İade Talebi
                              </Button>
                            )}
                          {canManageShipment && actions.includes("prepare") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={prepareMut.isPending}
                              onClick={() =>
                                void runAction("Hazırlık başlatıldı", () =>
                                  prepareMut.mutateAsync(s.id)
                                )
                              }
                              className="h-8 text-xs gap-1"
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                              Hazırla
                            </Button>
                          )}
                          {canManageShipment && actions.includes("dispatch") && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedShipment(s);
                                setDispatchModalOpen(true);
                              }}
                              className="h-8 text-xs gap-1"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Sevk Et
                            </Button>
                          )}
                          {canManageShipment && canPod && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedShipment(s);
                                setPodModalOpen(true);
                              }}
                              className="h-8 text-xs gap-1"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              POD
                            </Button>
                          )}
                          {canManageShipment && actions.includes("deliver") && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={deliverMut.isPending}
                              onClick={() =>
                                void runAction("Teslim işaretlendi", () =>
                                  deliverMut.mutateAsync(s.id)
                                )
                              }
                              className="h-8 text-xs gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Teslim
                            </Button>
                          )}
                          {canManageShipment && actions.includes("cancel") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={cancelMut.isPending}
                              onClick={() =>
                                void runAction("Sevkiyat iptal", () =>
                                  cancelMut.mutateAsync(s.id)
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
      ) : (
        <div className="rounded-[8px] border border-border bg-card overflow-hidden">
          {returns.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Aktif iade talebi bulunmamaktadır.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">İade ID</TableHead>
                  <TableHead>Sipariş Ref</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => {
                  const actions = r.allowed_actions || [];
                  const canSubmit =
                    actions.includes("submit") ||
                    actions.includes("submit_review");
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-semibold tabular-nums">
                        RET-#{r.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {r.order_id != null ? `Sipariş #${r.order_id}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.durum === "MAHSUP_EDILDI" ||
                            r.durum === "ONAYLANDI"
                              ? "success"
                              : r.durum === "REDDEDILDI" || r.durum === "IPTAL"
                                ? "destructive"
                                : "outline"
                          }
                          className="font-mono text-[10px]"
                        >
                          {r.durum}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openReturnDetail(r.id)}
                            className="h-8 text-xs gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detay
                          </Button>
                          {canSubmit && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submitReturnMut.isPending}
                              onClick={() =>
                                void runAction("İade incelemeye gönderildi", () =>
                                  submitReturnMut.mutateAsync(r.id)
                                )
                              }
                              className="h-8 text-xs gap-1"
                            >
                              <Send className="h-3.5 w-3.5" />
                              İncelemeye Gönder
                            </Button>
                          )}
                          {actions.includes("approve") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={approveMut.isPending}
                              onClick={() =>
                                void runAction("İade onaylandı", () =>
                                  approveMut.mutateAsync(r.id)
                                )
                              }
                              className="h-8 text-xs gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Onayla
                            </Button>
                          )}
                          {actions.includes("reject") && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={rejectReturnMut.isPending}
                              onClick={() => {
                                setRejectTargetId(r.id);
                                setRejectReason("");
                              }}
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
                              disabled={cancelReturnMut.isPending}
                              onClick={() =>
                                void runAction("İade iptal edildi", () =>
                                  cancelReturnMut.mutateAsync(r.id)
                                )
                              }
                              className="h-8 text-xs gap-1"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              İptal
                            </Button>
                          )}
                          {actions.includes("mahsup") && (
                            <Button
                              variant="default"
                              size="sm"
                              disabled={mahsupMut.isPending}
                              onClick={() =>
                                void runAction("İade mahsup edildi", () =>
                                  mahsupMut.mutateAsync(r.id)
                                )
                              }
                              className="h-8 text-xs"
                            >
                              Mahsup Et
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
      )}

      {/* Yeni Sevkiyat Oluştur Dialog */}
      <Dialog open={createShipModalOpen} onOpenChange={setCreateShipModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Sevkiyat Oluştur</DialogTitle>
            <DialogDescription>
              Onaylı sipariş için taslak sevkiyat kaydı açar.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createShipForm.handleSubmit(onCreateShipmentSubmit)}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-shp-order">Sipariş ID</Label>
              <Input
                id="new-shp-order"
                type="number"
                className="font-mono tabular-nums"
                placeholder="Örn: 201"
                disabled={createShipForm.formState.isSubmitting}
                {...createShipForm.register("order_id", {
                  valueAsNumber: true,
                })}
              />
              {createShipForm.formState.errors.order_id && (
                <span className="text-[11px] text-destructive">
                  {createShipForm.formState.errors.order_id.message}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-shp-model">Teslim Modeli</Label>
                <select
                  id="new-shp-model"
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs font-mono"
                  disabled={createShipForm.formState.isSubmitting}
                  {...createShipForm.register("teslim_modeli")}
                >
                  <option value="PLATFORM_QC">PLATFORM_QC (QC Zorunlu)</option>
                  <option value="DOGRUDAN">DOGRUDAN (QC Muaf)</option>
                  <option value="TEDARIKCI_TO_PLATFORM">TEDARIKCI_TO_PLATFORM</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-shp-yon">Sevk Yönü</Label>
                <select
                  id="new-shp-yon"
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs font-mono"
                  disabled={createShipForm.formState.isSubmitting}
                  {...createShipForm.register("sevk_yonu")}
                >
                  <option value="PLATFORM_TO_ALICI">PLATFORM_TO_ALICI</option>
                  <option value="TEDARIKCI_TO_ALICI">TEDARIKCI_TO_ALICI</option>
                  <option value="TEDARIKCI_TO_PLATFORM">TEDARIKCI_TO_PLATFORM</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-shp-takip">Takip No (opsiyonel)</Label>
              <Input
                id="new-shp-takip"
                className="font-mono"
                disabled={createShipForm.formState.isSubmitting}
                {...createShipForm.register("takip_no")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-shp-not">Notlar (opsiyonel)</Label>
              <Input
                id="new-shp-not"
                disabled={createShipForm.formState.isSubmitting}
                {...createShipForm.register("notlar")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateShipModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  createShipForm.formState.isSubmitting ||
                  createShipmentMut.isPending
                }
              >
                {createShipmentMut.isPending ? "Oluşturuluyor…" : "Oluştur"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sevkiyat Detay Dialog */}
      <Dialog open={shipDetailOpen} onOpenChange={setShipDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Sevkiyat Detayı{" "}
              {shipDetailData ? `(SHP-#${shipDetailData.id})` : ""}
            </DialogTitle>
            <DialogDescription>
              Sunucudan alınan sevkiyat, taşıyıcı ve POD bilgileri.
            </DialogDescription>
          </DialogHeader>
          {shipDetailLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Sevkiyat detayı yükleniyor…</span>
            </div>
          ) : shipDetailError ? (
            <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {shipDetailError}
            </div>
          ) : shipDetailData ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-border p-3">
                <div>
                  <span className="text-muted-foreground">Sevkiyat ID</span>
                  <p className="font-mono font-semibold">
                    SHP-#{shipDetailData.id}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sipariş ID</span>
                  <p className="font-mono font-semibold">
                    {shipDetailData.order_id != null
                      ? `#${shipDetailData.order_id}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Durum</span>
                  <p className="font-mono">{shipDetailData.durum}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Taşıyıcı Firma</span>
                  <p>{shipDetailData.tasiyici || shipDetailData.kargo_firma || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Teslim Modeli</span>
                  <p className="font-mono">{shipDetailData.teslim_modeli || "PLATFORM_QC"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sevk Yönü</span>
                  <p className="font-mono">{shipDetailData.sevk_yonu || "—"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Takip No</span>
                  <p className="font-mono">{shipDetailData.takip_no || "—"}</p>
                </div>
                {shipDetailData.notlar && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notlar</span>
                    <p>{shipDetailData.notlar}</p>
                  </div>
                )}
              </div>
              {shipDetailData.pod && (
                <div className="rounded-[6px] border border-border bg-muted/30 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Teslimat Kanıtı (POD)</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadingPod}
                      onClick={() => void handleDownloadPod(shipDetailData.id)}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Download className="h-3 w-3" />
                      {downloadingPod ? "İndiriliyor…" : "POD İndir (.txt)"}
                    </Button>
                  </div>
                  <p>
                    Teslim Alan:{" "}
                    <span className="font-medium">
                      {shipDetailData.pod.teslim_alan || "—"}
                    </span>
                  </p>
                  {shipDetailData.pod.belgeler_ref && (
                    <p className="font-mono">
                      Belge Ref: {shipDetailData.pod.belgeler_ref}
                    </p>
                  )}
                  {shipDetailData.pod.notlar && (
                    <p>Not: {shipDetailData.pod.notlar}</p>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const sid = shipDetailData.id;
                    setShipDetailOpen(false);
                    podForm.reset();
                    setBuyerPodShipmentId(sid);
                  }}
                >
                  POD Sayfası
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShipDetailOpen(false)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Sevk Et Dialog */}
      <Dialog open={dispatchModalOpen} onOpenChange={setDispatchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sevk (SHP-#{selectedShipment?.id})</DialogTitle>
            <DialogDescription>
              Elle taşıyıcı adı ve takip numarası zorunlu.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={dispatchForm.handleSubmit(onDispatchSubmit)}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shp-carrier">Taşıyıcı / kargo firması</Label>
              <Input
                id="shp-carrier"
                placeholder="Örn: Loomis, Yurtiçi"
                disabled={dispatchForm.formState.isSubmitting}
                {...dispatchForm.register("kargo_firma")}
              />
              {dispatchForm.formState.errors.kargo_firma && (
                <span className="text-[11px] text-destructive">
                  {dispatchForm.formState.errors.kargo_firma.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shp-tracking">Kargo Takip / İrsaliye No</Label>
              <Input
                id="shp-tracking"
                placeholder="Örn: LMS-2026-987654"
                className="font-mono"
                disabled={dispatchForm.formState.isSubmitting}
                {...dispatchForm.register("takip_no")}
              />
              {dispatchForm.formState.errors.takip_no && (
                <span className="text-[11px] text-destructive">
                  {dispatchForm.formState.errors.takip_no.message}
                </span>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDispatchModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  dispatchForm.formState.isSubmitting || dispatchMut.isPending
                }
              >
                {dispatchMut.isPending ? "Kaydediliyor…" : "Sevk Et"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* POD Dialog */}
      <Dialog open={podModalOpen} onOpenChange={setPodModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>POD (SHP-#{selectedShipment?.id})</DialogTitle>
            <DialogDescription>
              Teslimat kanıtı (Proof of Delivery) kaydı.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={podForm.handleSubmit(onPodSubmit)}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pod-alan">Teslim alan</Label>
              <Input
                id="pod-alan"
                disabled={podForm.formState.isSubmitting}
                {...podForm.register("teslim_alan")}
              />
              {podForm.formState.errors.teslim_alan && (
                <span className="text-[11px] text-destructive">
                  {podForm.formState.errors.teslim_alan.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pod-not">Notlar</Label>
              <Input
                id="pod-not"
                disabled={podForm.formState.isSubmitting}
                {...podForm.register("notlar")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pod-ref">Belgeler ref</Label>
              <Input
                id="pod-ref"
                className="font-mono"
                disabled={podForm.formState.isSubmitting}
                {...podForm.register("belgeler_ref")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPodModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={podForm.formState.isSubmitting || podMut.isPending}
              >
                {podMut.isPending ? "Kaydediliyor…" : "POD Kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Yeni İade Talebi Dialog */}
      <Dialog open={createReturnOpen} onOpenChange={setCreateReturnOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni İade Talebi Oluştur</DialogTitle>
            <DialogDescription>
              Teslim edilmiş sevkiyat ve sipariş satırı üzerinden iade talebi
              başlatır.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createReturnForm.handleSubmit(onCreateReturnSubmit)}
            className="flex flex-col gap-3 pt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ret-order">Sipariş ID</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="ret-order"
                    type="number"
                    className="font-mono tabular-nums"
                    placeholder="Örn: 201"
                    disabled={createReturnForm.formState.isSubmitting}
                    {...createReturnForm.register("order_id", {
                      valueAsNumber: true,
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={fetchingLines}
                    onClick={() => void handleFetchOrderLines()}
                    className="shrink-0"
                  >
                    {fetchingLines ? "…" : "Satırlar"}
                  </Button>
                </div>
                {createReturnForm.formState.errors.order_id && (
                  <span className="text-[11px] text-destructive">
                    {createReturnForm.formState.errors.order_id.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ret-ship">Sevkiyat ID</Label>
                <Input
                  id="ret-ship"
                  type="number"
                  className="font-mono tabular-nums"
                  placeholder="Örn: 601"
                  disabled={createReturnForm.formState.isSubmitting}
                  {...createReturnForm.register("shipment_id", {
                    valueAsNumber: true,
                  })}
                />
                {createReturnForm.formState.errors.shipment_id && (
                  <span className="text-[11px] text-destructive">
                    {createReturnForm.formState.errors.shipment_id.message}
                  </span>
                )}
              </div>
            </div>

            {fetchedOrderLines.length > 0 && (
              <div className="rounded-[6px] border border-border bg-muted/30 p-2 space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Sipariş Satırları (seçmek için tıklayın):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {fetchedOrderLines.map((ln) => (
                    <Button
                      key={ln.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] font-mono"
                      onClick={() =>
                        createReturnForm.setValue("order_line_id", ln.id)
                      }
                    >
                      Satır #{ln.id} (Varyant #{ln.varyant_id} · {ln.miktar})
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ret-line">Sipariş Satır ID</Label>
                <Input
                  id="ret-line"
                  type="number"
                  className="font-mono tabular-nums"
                  disabled={createReturnForm.formState.isSubmitting}
                  {...createReturnForm.register("order_line_id", {
                    valueAsNumber: true,
                  })}
                />
                {createReturnForm.formState.errors.order_line_id && (
                  <span className="text-[11px] text-destructive">
                    {createReturnForm.formState.errors.order_line_id.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ret-qty">İade Miktarı</Label>
                <Input
                  id="ret-qty"
                  className="font-mono tabular-nums"
                  disabled={createReturnForm.formState.isSubmitting}
                  {...createReturnForm.register("miktar")}
                />
                {createReturnForm.formState.errors.miktar && (
                  <span className="text-[11px] text-destructive">
                    {createReturnForm.formState.errors.miktar.message}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-sebep">İade Sebebi</Label>
              <Input
                id="ret-sebep"
                placeholder="Örn: Ayar uyumsuzluğu / Hasarlı paket"
                disabled={createReturnForm.formState.isSubmitting}
                {...createReturnForm.register("sebep")}
              />
              {createReturnForm.formState.errors.sebep && (
                <span className="text-[11px] text-destructive">
                  {createReturnForm.formState.errors.sebep.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-notlar">Notlar (opsiyonel)</Label>
              <Input
                id="ret-notlar"
                disabled={createReturnForm.formState.isSubmitting}
                {...createReturnForm.register("notlar")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateReturnOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  createReturnForm.formState.isSubmitting ||
                  createReturnMut.isPending
                }
              >
                {createReturnMut.isPending
                  ? "Oluşturuluyor…"
                  : "İade Talebi Oluştur"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* İade Detay Dialog */}
      <Dialog open={returnDetailOpen} onOpenChange={setReturnDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              İade Detayı{" "}
              {returnDetailData ? `(RET-#${returnDetailData.id})` : ""}
            </DialogTitle>
            <DialogDescription>
              İade satırları, stok iade ve finansal mahsup durumu.
            </DialogDescription>
          </DialogHeader>
          {returnDetailLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>İade detayı yükleniyor…</span>
            </div>
          ) : returnDetailError ? (
            <div className="space-y-3">
              <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {returnDetailError}
              </div>
              <div className="flex justify-end gap-2">
                {returnDetailTargetId != null && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openReturnDetail(returnDetailTargetId)}
                  >
                    Yeniden Dene
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReturnDetailOpen(false)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          ) : returnDetailData ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-border p-3">
                <div>
                  <span className="text-muted-foreground">İade ID</span>
                  <p className="font-mono font-semibold">
                    RET-#{returnDetailData.id}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Durum</span>
                  <p className="font-mono">{returnDetailData.durum}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sipariş / Sevkiyat</span>
                  <p className="font-mono">
                    #{returnDetailData.order_id} /{" "}
                    {returnDetailData.shipment_id
                      ? `SHP-#${returnDetailData.shipment_id}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tarih</span>
                  <p>
                    {returnDetailData.olusturma_tarihi
                      ? formatDateTime(returnDetailData.olusturma_tarihi)
                      : "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">İade Sebebi</span>
                  <p>{returnDetailData.iade_sebebi || returnDetailData.sebep || "—"}</p>
                </div>
                {returnDetailData.notlar && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notlar</span>
                    <p>{returnDetailData.notlar}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Stok İade</span>
                  <p className="font-mono">
                    {returnDetailData.stok_iade_yapildi ? "EVET" : "HAYIR"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Finans Mahsup</span>
                  <p className="font-mono">
                    {returnDetailData.finans_mahsup_yapildi ? "EVET" : "HAYIR"}
                    {returnDetailData.mahsup_tutari
                      ? ` (${returnDetailData.mahsup_tutari})`
                      : ""}
                  </p>
                </div>
              </div>
              {returnDetailData.lines && returnDetailData.lines.length > 0 && (
                <div className="rounded-[6px] border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Satır ID</TableHead>
                        <TableHead>Sipariş Satırı</TableHead>
                        <TableHead className="text-right">Miktar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnDetailData.lines.map((ln, idx) => (
                        <TableRow key={ln.id ?? idx}>
                          <TableCell className="font-mono">
                            #{ln.id ?? idx + 1}
                          </TableCell>
                          <TableCell className="font-mono">
                            #{ln.order_line_id}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {ln.miktar} {ln.birim || ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(returnDetailData.allowed_actions?.includes("submit") ||
                    returnDetailData.allowed_actions?.includes("submit_review")) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={submitReturnMut.isPending}
                      onClick={() =>
                        void runAction("İade incelemeye gönderildi", async () => {
                          await submitReturnMut.mutateAsync(returnDetailData.id);
                          await openReturnDetail(returnDetailData.id);
                        })
                      }
                      className="h-8 text-xs"
                    >
                      İncelemeye Gönder
                    </Button>
                  )}
                  {returnDetailData.allowed_actions?.includes("approve") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={approveMut.isPending}
                      onClick={() =>
                        void runAction("İade onaylandı", async () => {
                          await approveMut.mutateAsync(returnDetailData.id);
                          await openReturnDetail(returnDetailData.id);
                        })
                      }
                      className="h-8 text-xs"
                    >
                      Onayla
                    </Button>
                  )}
                  {returnDetailData.allowed_actions?.includes("reject") && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={rejectReturnMut.isPending}
                      onClick={() => {
                        setRejectTargetId(returnDetailData.id);
                        setRejectReason("");
                      }}
                      className="h-8 text-xs"
                    >
                      Reddet
                    </Button>
                  )}
                  {returnDetailData.allowed_actions?.includes("cancel") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelReturnMut.isPending}
                      onClick={() =>
                        void runAction("İade iptal edildi", async () => {
                          await cancelReturnMut.mutateAsync(returnDetailData.id);
                          await openReturnDetail(returnDetailData.id);
                        })
                      }
                      className="h-8 text-xs"
                    >
                      İptal Et
                    </Button>
                  )}
                  {returnDetailData.allowed_actions?.includes("mahsup") && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={mahsupMut.isPending}
                      onClick={() =>
                        void runAction("İade mahsup edildi", async () => {
                          await mahsupMut.mutateAsync(returnDetailData.id);
                          await openReturnDetail(returnDetailData.id);
                        })
                      }
                      className="h-8 text-xs"
                    >
                      Mahsup Et
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReturnDetailOpen(false)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Alıcı Self-Service POD Görüntüleme / İndirme / Onay Dialog (/shipments/<id>/pod/) */}
      <Dialog
        open={buyerPodShipmentId !== null}
        onOpenChange={(open) => {
          if (!open) setBuyerPodShipmentId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Teslimat Kanıtı / POD{" "}
              {buyerPodShipmentId != null ? `(SHP-#${buyerPodShipmentId})` : ""}
            </DialogTitle>
            <DialogDescription>
              GET/POST /shipments/&#123;id&#125;/pod/ — teslimat tutanağını görüntüleyin,
              indirin veya teslimatı onaylayın.
            </DialogDescription>
          </DialogHeader>
          {buyerPodQ.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>POD bilgisi yükleniyor…</span>
            </div>
          ) : buyerPodQ.isError ? (
            <div className="space-y-3">
              <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {mapCommerceError(buyerPodQ.error, "POD bilgisi alınamadı.")}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void buyerPodQ.refetch()}
                >
                  Yeniden Dene
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBuyerPodShipmentId(null)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          ) : buyerPodQ.data ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-border p-3">
                <div>
                  <span className="text-muted-foreground">Sipariş No</span>
                  <p className="font-mono font-semibold">
                    #{buyerPodQ.data.order_id}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sevkiyat Durumu</span>
                  <p className="font-mono">{buyerPodQ.data.durum}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Taşıyıcı</span>
                  <p>{buyerPodQ.data.tasiyici || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Takip No</span>
                  <p className="font-mono">{buyerPodQ.data.takip_no || "—"}</p>
                </div>
              </div>

              {buyerPodQ.data.has_pod && buyerPodQ.data.pod ? (
                <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      POD Kaydı Mevcut
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={downloadingPod}
                      onClick={() =>
                        void handleDownloadPod(buyerPodQ.data.shipment_id)
                      }
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadingPod ? "İndiriliyor…" : "POD İndir (.txt)"}
                    </Button>
                  </div>
                  <p>
                    Teslim Alan:{" "}
                    <span className="font-medium">
                      {buyerPodQ.data.pod.teslim_alan || "—"}
                    </span>
                  </p>
                  {buyerPodQ.data.pod.belgeler_ref && (
                    <p className="font-mono">
                      Belge Ref: {buyerPodQ.data.pod.belgeler_ref}
                    </p>
                  )}
                  {buyerPodQ.data.pod.notlar && (
                    <p>Not: {buyerPodQ.data.pod.notlar}</p>
                  )}
                  {buyerPodQ.data.pod.olusturma_tarihi && (
                    <p className="text-[11px] text-muted-foreground">
                      Kayıt: {formatDateTime(buyerPodQ.data.pod.olusturma_tarihi)}
                    </p>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={podForm.handleSubmit(onBuyerPodSubmit)}
                  className="space-y-3 rounded-[6px] border border-border p-3"
                >
                  <p className="font-medium text-foreground">
                    Henüz POD kaydı yok — Teslimatı Onayla
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="buyer-pod-alan">Teslim Alan *</Label>
                    <Input
                      id="buyer-pod-alan"
                      placeholder="Ad Soyad"
                      disabled={submitBuyerPodMut.isPending}
                      {...podForm.register("teslim_alan")}
                    />
                    {podForm.formState.errors.teslim_alan && (
                      <span className="text-[11px] text-destructive">
                        {podForm.formState.errors.teslim_alan.message}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="buyer-pod-not">Notlar</Label>
                    <Input
                      id="buyer-pod-not"
                      placeholder="Opsiyonel teslimat notu"
                      disabled={submitBuyerPodMut.isPending}
                      {...podForm.register("notlar")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="buyer-pod-ref">Belge Ref</Label>
                    <Input
                      id="buyer-pod-ref"
                      className="font-mono"
                      placeholder="Opsiyonel referans"
                      disabled={submitBuyerPodMut.isPending}
                      {...podForm.register("belgeler_ref")}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBuyerPodShipmentId(null)}
                    >
                      Kapat
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={submitBuyerPodMut.isPending}
                    >
                      {submitBuyerPodMut.isPending
                        ? "Onaylanıyor…"
                        : "Teslimatı Onayla (POD)"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* İade Reddet Dialog */}
      <Dialog
        open={rejectTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTargetId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>İadeyi Reddet (RET-#{rejectTargetId})</DialogTitle>
            <DialogDescription>
              İsteğe bağlı olarak ret gerekçesi belirtebilirsiniz.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onRejectReturnSubmit} className="space-y-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">Ret Gerekçesi</Label>
              <Input
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Örn: İnceleme kriterlerine uygun değil"
                disabled={rejectReturnMut.isPending}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRejectTargetId(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={rejectReturnMut.isPending}
              >
                {rejectReturnMut.isPending ? "Reddediliyor…" : "Reddet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

