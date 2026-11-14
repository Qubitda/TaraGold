"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  useApproveReturnMutation,
  useBuyerShipmentPodQuery,
  useBuyerShipmentsPageQuery,
  useCancelReturnMutation,
  useCancelShipmentMutation,
  useCreateReturnMutation,
  useCreateShipmentMutation,
  useDeliverShipmentMutation,
  useDispatchShipmentMutation,
  useMahsupReturnMutation,
  useOpsShipmentsPageQuery,
  usePrepareShipmentMutation,
  useRejectReturnMutation,
  useReturnsPageQuery,
  useSubmitBuyerPodMutation,
  useSubmitPodMutation,
  useSubmitReturnMutation,
} from "../hooks";
import { lojistikService } from "../services";
import { siparisService } from "@/features/siparis/services";
import {
  opsOrdersService,
  type OpsOrderRow,
} from "@/features/firmalar/services/ops-firmalar";
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
  Truck,
  RotateCcw,
  RefreshCw,
  PackageCheck,
  Send,
  CheckCircle2,
  ClipboardCheck,
  Ban,
  XCircle,
  Download,
  FileText,
} from "lucide-react";

const SHIPMENT_STATUS_OPTIONS = [
  { value: "", label: "Tüm sevkiyat durumları" },
  { value: "TASLAK", label: "Taslak" },
  { value: "HAZIR", label: "Hazır" },
  { value: "YOLDA", label: "Yolda" },
  { value: "TESLIM", label: "Teslim Edildi" },
  { value: "IPTAL", label: "İptal" },
];

const RETURN_STATUS_OPTIONS = [
  { value: "", label: "Tüm iade durumları" },
  { value: "TASLAK", label: "Taslak" },
  { value: "INCELENIYOR", label: "İnceleniyor" },
  { value: "ONAYLANDI", label: "Onaylandı" },
  { value: "MAHSUP_EDILDI", label: "Mahsup Edildi" },
  { value: "REDDEDILDI", label: "Reddedildi" },
  { value: "IPTAL", label: "İptal" },
];

const STATUS_LABELS: Record<string, string> = {
  TASLAK: "Taslak",
  HAZIR: "Hazır",
  YOLDA: "Yolda",
  SEVK_EDILDI: "Sevk Edildi",
  TESLIM: "Teslim Edildi",
  TESLIM_EDILDI: "Teslim Edildi",
  INCELENIYOR: "İnceleniyor",
  ONAYLANDI: "Onaylandı",
  MAHSUP_EDILDI: "Mahsup Edildi",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal",
};

const TESLIM_MODEL_LABELS: Record<string, string> = {
  PLATFORM_QC: "Platform Kalite Kontrolü",
  DOGRUDAN: "Doğrudan Teslimat",
  TEDARIKCI_TO_PLATFORM: "Tedarikçiden Platforma",
};

const SEVK_YON_LABELS: Record<string, string> = {
  PLATFORM_TO_ALICI: "Platformdan Alıcıya",
  TEDARIKCI_TO_ALICI: "Tedarikçiden Alıcıya",
  TEDARIKCI_TO_PLATFORM: "Tedarikçiden Platforma",
};

function opsOrderToOption(o: OpsOrderRow): RelationOption {
  const first = o.satirlar?.[0];
  const productPart = first
    ? `${first.urun_ad || first.platform_kodu || "Ürün"}${
        (o.satir_sayisi || o.satirlar?.length || 0) > 1
          ? ` (+${(o.satir_sayisi || o.satirlar?.length || 1) - 1} kalem)`
          : ""
      }`
    : `${o.satir_sayisi ?? 0} kalem`;
  const totalPart = o.toplamlar
    ? Object.entries(o.toplamlar)
        .map(([pb, t]) => `${t} ${pb}`)
        .join(" · ")
    : "";
  return {
    value: o.id,
    label: o.alici_firma_ad
      ? `${o.alici_firma_ad} — ${productPart}`
      : `Sipariş (${productPart})`,
    subtitle: [STATUS_LABELS[o.durum] || o.durum, totalPart]
      .filter(Boolean)
      .join(" · "),
  };
}

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

  const [shipSearch, setShipSearch] = useState("");
  const [debouncedShipSearch, setDebouncedShipSearch] = useState("");
  const [shipDurum, setShipDurum] = useState("");
  const [shipPage, setShipPage] = useState(1);
  const [shipPageSize, setShipPageSize] = useState(20);

  const [retSearch, setRetSearch] = useState("");
  const [debouncedRetSearch, setDebouncedRetSearch] = useState("");
  const [retDurum, setRetDurum] = useState("");
  const [retPage, setRetPage] = useState(1);
  const [retPageSize, setRetPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedShipSearch(shipSearch);
      setShipPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [shipSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedRetSearch(retSearch);
      setRetPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [retSearch]);

  const opsShipmentsQ = useOpsShipmentsPageQuery(
    {
      q: debouncedShipSearch || undefined,
      durum: shipDurum || undefined,
      page: shipPage,
      page_size: shipPageSize,
    },
    canManageShipment
  );
  const buyerShipmentsQ = useBuyerShipmentsPageQuery(
    {
      q: debouncedShipSearch || undefined,
      durum: shipDurum || undefined,
      page: shipPage,
      page_size: shipPageSize,
    },
    !canManageShipment
  );
  const returnsQ = useReturnsPageQuery({
    q: debouncedRetSearch || undefined,
    durum: retDurum || undefined,
    page: retPage,
    page_size: retPageSize,
  });

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
  const [returnShipmentOptions, setReturnShipmentOptions] = useState<
    RelationOption[]
  >([]);
  const [returnLineOptions, setReturnLineOptions] = useState<RelationOption[]>(
    []
  );
  const [loadingReturnDeps, setLoadingReturnDeps] = useState(false);

  const [returnDetailOpen, setReturnDetailOpen] = useState(false);
  const [returnDetailLoading, setReturnDetailLoading] = useState(false);
  const [returnDetailError, setReturnDetailError] = useState<string | null>(
    null
  );
  const [returnDetailTargetId, setReturnDetailTargetId] = useState<
    number | null
  >(null);
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
  const shipments = activeShipmentsQ.data?.results ?? [];
  const shipTotal = activeShipmentsQ.data?.count ?? shipments.length;

  const returns = returnsQ.data?.results ?? [];
  const retTotal = returnsQ.data?.count ?? returns.length;

  const loadOrderOptions = useCallback(
    async (q: string): Promise<RelationOption[]> => {
      if (canManageShipment || canManageReturn) {
        const res = await opsOrdersService.listAll({
          q: q || undefined,
          page_size: 30,
        });
        return (res.results ?? []).map(opsOrderToOption);
      }
      const res = await siparisService.getOrders({
        ...(q ? { q } : {}),
        page_size: "30",
      });
      return (res.results ?? []).map((o) => {
        const first = o.lines?.[0];
        const summary = first
          ? `${first.urun_ad || first.varyant_sku || "Ürün"} (${o.line_count} kalem)`
          : `${o.line_count} kalem`;
        return {
          value: o.id,
          label: summary,
          subtitle: `${STATUS_LABELS[o.durum] || o.durum} · ${formatDateTime(o.olusturma_tarihi)}`,
        };
      });
    },
    [canManageShipment, canManageReturn]
  );

  const loadReturnDependencies = async (
    orderId: number,
    preselectedShipmentId?: number
  ) => {
    setLoadingReturnDeps(true);
    setReturnShipmentOptions([]);
    setReturnLineOptions([]);
    try {
      const [shipsRes, linesOpts] = await Promise.all([
        canManageReturn
          ? lojistikService.getShipments({ order_id: orderId, page_size: 30 })
          : lojistikService.getBuyerShipments({ order_id: orderId, page_size: 30 }),
        (async () => {
          if (canManageReturn) {
            const opsRes = await opsOrdersService.listAll({
              q: String(orderId),
              page_size: 20,
            });
            const found = (opsRes.results ?? []).find((o) => o.id === orderId);
            if (found?.satirlar?.length) {
              return found.satirlar.map((ln) => ({
                value: ln.id,
                label:
                  ln.urun_ad && ln.platform_kodu
                    ? `${ln.urun_ad} (${ln.platform_kodu})`
                    : ln.urun_ad || ln.platform_kodu || "Sipariş Kalemi",
                subtitle: `${ln.miktar} ${ln.birim}`,
              }));
            }
          }
          const ord = await siparisService.getOrderDetail(orderId);
          return (ord.lines ?? []).map((ln) => ({
            value: ln.id,
            label:
              ln.urun_ad && ln.varyant_sku
                ? `${ln.urun_ad} (${ln.varyant_sku})`
                : ln.urun_ad || ln.varyant_sku || "Sipariş Kalemi",
            subtitle: `${ln.miktar} ${ln.birim}`,
          }));
        })(),
      ]);

      const sOpts = (shipsRes.results ?? []).map((s) => ({
        value: s.id,
        label: [s.tasiyici || s.kargo_firma || "Sevkiyat", s.takip_no]
          .filter(Boolean)
          .join(" — "),
        subtitle: STATUS_LABELS[s.durum] || s.durum,
      }));
      setReturnShipmentOptions(sOpts);
      setReturnLineOptions(linesOpts);

      if (preselectedShipmentId) {
        createReturnForm.setValue("shipment_id", preselectedShipmentId, {
          shouldValidate: true,
        });
      } else if (sOpts.length === 1) {
        createReturnForm.setValue("shipment_id", Number(sOpts[0].value), {
          shouldValidate: true,
        });
      }
      if (linesOpts.length === 1) {
        createReturnForm.setValue("order_line_id", Number(linesOpts[0].value), {
          shouldValidate: true,
        });
      }
    } catch (err) {
      actionToast.error("Sipariş kalemleri ve sevkiyatlar alınamadı", err);
    } finally {
      setLoadingReturnDeps(false);
    }
  };

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
        ...(formData.teslim_modeli
          ? { teslim_modeli: formData.teslim_modeli }
          : {}),
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
      actionToast.success("Teslimat kanıtı kaydedildi");
      setPodModalOpen(false);
      podForm.reset();
    } catch (err) {
      actionToast.error("Teslimat kanıtı kaydedilemedi", err);
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
      actionToast.success("Teslimat kanıtı onaylandı");
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
      actionToast.success("Teslimat tutanağı indirildi");
    } catch (err) {
      actionToast.error("Teslimat tutanağı indirilemedi", err);
    } finally {
      setDownloadingPod(false);
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
      setReturnShipmentOptions([]);
      setReturnLineOptions([]);
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

  const tabSwitcher = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
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
          <span>Sevkiyatlar ({shipTotal})</span>
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
          <span>İadeler ({retTotal})</span>
        </button>
      </div>
    </div>
  );

  const selectedCreateOrderId = createShipForm.watch("order_id");
  const selectedReturnOrderId = createReturnForm.watch("order_id");
  const selectedReturnShipmentId = createReturnForm.watch("shipment_id");
  const selectedReturnLineId = createReturnForm.watch("order_line_id");

  return (
    <div className="flex flex-col gap-6">
      {activeTab === "shipments" ? (
        <ListPage
          title="Lojistik & Sevkiyat"
          description="Sevkiyat oluşturma, taşıyıcı ve takip numarası kaydı, teslimat kanıtı ve iade süreçleri."
          createLabel={canManageShipment ? "Yeni Sevkiyat" : undefined}
          onCreate={
            canManageShipment
              ? () => {
                  createShipForm.reset({
                    order_id: undefined,
                    takip_no: "",
                    notlar: "",
                    teslim_modeli: "PLATFORM_QC",
                    sevk_yonu: "PLATFORM_TO_ALICI",
                  });
                  setCreateShipModalOpen(true);
                }
              : undefined
          }
          extraActions={tabSwitcher}
          searchValue={shipSearch}
          onSearchChange={setShipSearch}
          searchPlaceholder="Alıcı firma, taşıyıcı veya takip no ile ara…"
          filters={
            <select
              value={shipDurum}
              onChange={(e) => {
                setShipDurum(e.target.value);
                setShipPage(1);
              }}
              aria-label="Sevkiyat durumu"
              className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
            >
              {SHIPMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
          loading={activeShipmentsQ.isLoading}
          error={
            activeShipmentsQ.isError
              ? mapCommerceError(
                  activeShipmentsQ.error,
                  "Sevkiyat verileri alınamadı."
                )
              : null
          }
          onRetry={() => void activeShipmentsQ.refetch()}
          isEmpty={shipments.length === 0}
          emptyTitle="Sevkiyat kaydı bulunamadı"
          emptyDescription="Filtreleri değiştirin veya onaylanmış bir sipariş için yeni sevkiyat oluşturun."
          page={shipPage}
          pageSize={shipPageSize}
          totalCount={shipTotal}
          onPageChange={setShipPage}
          onPageSizeChange={(size) => {
            setShipPageSize(size);
            setShipPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {canManageShipment && <TableHead>Alıcı Firma</TableHead>}
                <TableHead>Taşıyıcı / Takip</TableHead>
                <TableHead>Teslim Modeli</TableHead>
                <TableHead>Sevk Yönü</TableHead>
                <TableHead>Tarih</TableHead>
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
                const aliciAd =
                  "alici_firma_ad" in s && typeof s.alici_firma_ad === "string"
                    ? s.alici_firma_ad
                    : "";

                const extraActions: ExtraRowAction[] = [];
                if (canBuyerPod) {
                  extraActions.push({
                    label:
                      actions.includes("confirm_pod") && !s.pod
                        ? "Teslimatı Onayla"
                        : "Teslimat Kanıtı",
                    icon: <FileText className="h-3.5 w-3.5" />,
                    onClick: () => {
                      podForm.reset();
                      setBuyerPodShipmentId(s.id);
                    },
                  });
                }
                if (
                  !canManageShipment &&
                  actions.includes("request_return") &&
                  s.order_id != null
                ) {
                  extraActions.push({
                    label: "İade Talebi Oluştur",
                    icon: <RotateCcw className="h-3.5 w-3.5" />,
                    onClick: () => {
                      createReturnForm.reset({
                        order_id: s.order_id!,
                        shipment_id: s.id,
                        sebep: "",
                        notlar: "",
                        order_line_id: undefined,
                        miktar: "1",
                      });
                      setActiveTab("returns");
                      setCreateReturnOpen(true);
                      void loadReturnDependencies(s.order_id!, s.id);
                    },
                  });
                }
                if (canManageShipment && actions.includes("prepare")) {
                  extraActions.push({
                    label: "Hazırlığı Başlat",
                    icon: <PackageCheck className="h-3.5 w-3.5" />,
                    disabled: prepareMut.isPending,
                    onClick: () =>
                      runAction("Hazırlık başlatıldı", () =>
                        prepareMut.mutateAsync(s.id)
                      ),
                  });
                }
                if (canManageShipment && actions.includes("dispatch")) {
                  extraActions.push({
                    label: "Sevk Et",
                    icon: <Send className="h-3.5 w-3.5" />,
                    onClick: () => {
                      setSelectedShipment(s);
                      dispatchForm.reset({
                        kargo_firma: carrierLabel || "",
                        takip_no: s.takip_no || "",
                      });
                      setDispatchModalOpen(true);
                    },
                  });
                }
                if (canManageShipment && canPod) {
                  extraActions.push({
                    label: "Teslimat Kanıtı Ekle",
                    icon: <ClipboardCheck className="h-3.5 w-3.5" />,
                    onClick: () => {
                      setSelectedShipment(s);
                      podForm.reset();
                      setPodModalOpen(true);
                    },
                  });
                }
                if (canManageShipment && actions.includes("deliver")) {
                  extraActions.push({
                    label: "Teslim Edildi İşaretle",
                    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                    disabled: deliverMut.isPending,
                    onClick: () =>
                      runAction("Teslimat işaretlendi", () =>
                        deliverMut.mutateAsync(s.id)
                      ),
                  });
                }
                if (canManageShipment && actions.includes("cancel")) {
                  extraActions.push({
                    label: "Sevkiyatı İptal Et",
                    icon: <Ban className="h-3.5 w-3.5" />,
                    variant: "destructive",
                    confirmTitle: "Sevkiyatı İptal Et",
                    confirmDescription:
                      "Bu sevkiyat kaydı iptal edilecek. Onaylıyor musunuz?",
                    disabled: cancelMut.isPending,
                    onClick: () =>
                      runAction("Sevkiyat iptal edildi", () =>
                        cancelMut.mutateAsync(s.id)
                      ),
                  });
                }

                return (
                  <TableRow key={s.id}>
                    {canManageShipment && (
                      <TableCell className="text-xs font-medium text-foreground">
                        {aliciAd || "Platform Sevkiyatı"}
                      </TableCell>
                    )}
                    <TableCell className="text-xs">
                      {carrierLabel || s.takip_no ? (
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {carrierLabel || "Taşıyıcı bekleniyor"}
                          </span>
                          {s.takip_no && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {s.takip_no}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Henüz sevk edilmedi
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {TESLIM_MODEL_LABELS[s.teslim_modeli || "PLATFORM_QC"] ||
                        s.teslim_modeli}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.sevk_yonu
                        ? SEVK_YON_LABELS[s.sevk_yonu] || s.sevk_yonu
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.olusturma_tarihi
                        ? formatDateTime(s.olusturma_tarihi)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.durum === "TESLIM_EDILDI" || s.durum === "TESLIM"
                            ? "success"
                            : s.durum === "SEVK_EDILDI" || s.durum === "YOLDA"
                              ? "warning"
                              : s.durum === "IPTAL"
                                ? "destructive"
                                : "outline"
                        }
                        className="text-[11px]"
                      >
                        {STATUS_LABELS[s.durum] || s.durum}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel={carrierLabel || aliciAd || "Sevkiyat"}
                        onView={() => void openShipmentDetail(s.id)}
                        extraActions={extraActions}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      ) : (
        <ListPage
          title="İade Talepleri"
          description="Alıcı iade talepleri, inceleme, stok iade ve finansal mahsup işlemleri."
          createLabel={
            canManageReturn || !canManageShipment
              ? "Yeni İade Talebi"
              : undefined
          }
          onCreate={
            canManageReturn || !canManageShipment
              ? () => {
                  createReturnForm.reset({
                    order_id: undefined,
                    shipment_id: undefined,
                    sebep: "",
                    notlar: "",
                    order_line_id: undefined,
                    miktar: "1",
                  });
                  setReturnShipmentOptions([]);
                  setReturnLineOptions([]);
                  setCreateReturnOpen(true);
                }
              : undefined
          }
          extraActions={tabSwitcher}
          searchValue={retSearch}
          onSearchChange={setRetSearch}
          searchPlaceholder="Alıcı firma, sebep veya not ile ara…"
          filters={
            <select
              value={retDurum}
              onChange={(e) => {
                setRetDurum(e.target.value);
                setRetPage(1);
              }}
              aria-label="İade durumu"
              className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
            >
              {RETURN_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
          loading={returnsQ.isLoading}
          error={
            returnsQ.isError
              ? mapCommerceError(returnsQ.error, "İade verileri alınamadı.")
              : null
          }
          onRetry={() => void returnsQ.refetch()}
          isEmpty={returns.length === 0}
          emptyTitle="İade talebi bulunamadı"
          emptyDescription="Filtreleri temizleyin veya teslim edilen bir sevkiyat için yeni iade talebi oluşturun."
          page={retPage}
          pageSize={retPageSize}
          totalCount={retTotal}
          onPageChange={setRetPage}
          onPageSizeChange={(size) => {
            setRetPageSize(size);
            setRetPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {canManageReturn && <TableHead>Alıcı Firma</TableHead>}
                <TableHead>İade Sebebi</TableHead>
                <TableHead>Mahsup Tutarı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r) => {
                const actions = r.allowed_actions || [];
                const canSubmit =
                  actions.includes("submit") ||
                  actions.includes("submit_review");

                const extraActions: ExtraRowAction[] = [];
                if (canSubmit) {
                  extraActions.push({
                    label: "İncelemeye Gönder",
                    icon: <Send className="h-3.5 w-3.5" />,
                    disabled: submitReturnMut.isPending,
                    onClick: () =>
                      runAction("İade incelemeye gönderildi", () =>
                        submitReturnMut.mutateAsync(r.id)
                      ),
                  });
                }
                if (actions.includes("approve")) {
                  extraActions.push({
                    label: "Onayla",
                    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                    disabled: approveMut.isPending,
                    onClick: () =>
                      runAction("İade onaylandı", () =>
                        approveMut.mutateAsync(r.id)
                      ),
                  });
                }
                if (actions.includes("reject")) {
                  extraActions.push({
                    label: "Reddet",
                    icon: <XCircle className="h-3.5 w-3.5" />,
                    variant: "destructive",
                    disabled: rejectReturnMut.isPending,
                    onClick: () => {
                      setRejectTargetId(r.id);
                      setRejectReason("");
                    },
                  });
                }
                if (actions.includes("cancel")) {
                  extraActions.push({
                    label: "İptal Et",
                    icon: <Ban className="h-3.5 w-3.5" />,
                    variant: "destructive",
                    confirmTitle: "İade Talebini İptal Et",
                    confirmDescription:
                      "Bu iade talebi iptal edilecek. Devam etmek istiyor musunuz?",
                    disabled: cancelReturnMut.isPending,
                    onClick: () =>
                      runAction("İade iptal edildi", () =>
                        cancelReturnMut.mutateAsync(r.id)
                      ),
                  });
                }
                if (actions.includes("mahsup")) {
                  extraActions.push({
                    label: "Mahsup Et",
                    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                    confirmTitle: "Finansal Mahsup İşlemi",
                    confirmDescription:
                      "Onaylı iade tutarı alıcı cari hesabına mahsup edilecek. Onaylıyor musunuz?",
                    disabled: mahsupMut.isPending,
                    onClick: () =>
                      runAction("İade mahsup edildi", () =>
                        mahsupMut.mutateAsync(r.id)
                      ),
                  });
                }

                return (
                  <TableRow key={r.id}>
                    {canManageReturn && (
                      <TableCell className="text-xs font-medium text-foreground">
                        {r.alici_firma_ad || "Alıcı Firma"}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-foreground max-w-[300px] truncate">
                      {r.iade_sebebi || "Belirtilmedi"}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {r.mahsup_tutari ? `${r.mahsup_tutari} TRY` : "—"}
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
                        className="text-[11px]"
                      >
                        {STATUS_LABELS[r.durum] || r.durum}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel={r.alici_firma_ad || "İade talebi"}
                        onView={() => void openReturnDetail(r.id)}
                        extraActions={extraActions}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* Yeni Sevkiyat Oluştur Modal */}
      <EntityModal
        open={createShipModalOpen}
        onOpenChange={setCreateShipModalOpen}
        title="Yeni Sevkiyat Oluştur"
        description="Onaylı sipariş için taslak sevkiyat kaydı oluşturun."
        isDirty={createShipForm.formState.isDirty}
        isSubmitting={
          createShipForm.formState.isSubmitting || createShipmentMut.isPending
        }
        submitLabel="Sevkiyat Oluştur"
        onSubmit={createShipForm.handleSubmit(onCreateShipmentSubmit)}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-shp-order">Sipariş *</Label>
          <RelationSelect
            id="new-shp-order"
            value={selectedCreateOrderId ?? null}
            onChange={(val) =>
              createShipForm.setValue(
                "order_id",
                val ? Number(val) : (undefined as unknown as number),
                { shouldValidate: true, shouldDirty: true }
              )
            }
            loadOptions={loadOrderOptions}
            placeholder="Sipariş seçin…"
            searchPlaceholder="Alıcı firma veya ürün kodu ile ara…"
            emptyText="Uygun sipariş bulunamadı"
            disabled={createShipForm.formState.isSubmitting}
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
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              disabled={createShipForm.formState.isSubmitting}
              {...createShipForm.register("teslim_modeli")}
            >
              <option value="PLATFORM_QC">Platform Kalite Kontrolü</option>
              <option value="DOGRUDAN">Doğrudan Teslimat</option>
              <option value="TEDARIKCI_TO_PLATFORM">Tedarikçiden Platforma</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-shp-yon">Sevk Yönü</Label>
            <select
              id="new-shp-yon"
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              disabled={createShipForm.formState.isSubmitting}
              {...createShipForm.register("sevk_yonu")}
            >
              <option value="PLATFORM_TO_ALICI">Platformdan Alıcıya</option>
              <option value="TEDARIKCI_TO_ALICI">Tedarikçiden Alıcıya</option>
              <option value="TEDARIKCI_TO_PLATFORM">Tedarikçiden Platforma</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-shp-takip">Takip No (opsiyonel)</Label>
          <Input
            id="new-shp-takip"
            className="font-mono"
            placeholder="Varsa kargo takip numarası"
            disabled={createShipForm.formState.isSubmitting}
            {...createShipForm.register("takip_no")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-shp-not">Notlar (opsiyonel)</Label>
          <Input
            id="new-shp-not"
            placeholder="Teslimat veya güvenlik notu"
            disabled={createShipForm.formState.isSubmitting}
            {...createShipForm.register("notlar")}
          />
        </div>
      </EntityModal>

      {/* Sevkiyat Detay Modal */}
      <EntityModal
        open={shipDetailOpen}
        onOpenChange={setShipDetailOpen}
        title="Sevkiyat Detayı"
        description="Sevkiyat durumu, taşıyıcı bilgileri ve teslimat kanıtı."
        size="sm"
      >
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
            <div className="grid grid-cols-2 gap-3 rounded-[6px] border border-border p-3">
              {"alici_firma_ad" in shipDetailData &&
                shipDetailData.alici_firma_ad && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Alıcı Firma</span>
                    <p className="font-medium text-foreground mt-0.5">
                      {shipDetailData.alici_firma_ad}
                    </p>
                  </div>
                )}
              <div>
                <span className="text-muted-foreground">Durum</span>
                <p className="font-medium mt-0.5">
                  {STATUS_LABELS[shipDetailData.durum] || shipDetailData.durum}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Taşıyıcı Firma</span>
                <p className="mt-0.5">
                  {shipDetailData.tasiyici || shipDetailData.kargo_firma || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Teslim Modeli</span>
                <p className="mt-0.5">
                  {TESLIM_MODEL_LABELS[
                    shipDetailData.teslim_modeli || "PLATFORM_QC"
                  ] || shipDetailData.teslim_modeli}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Sevk Yönü</span>
                <p className="mt-0.5">
                  {shipDetailData.sevk_yonu
                    ? SEVK_YON_LABELS[shipDetailData.sevk_yonu] ||
                      shipDetailData.sevk_yonu
                    : "—"}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Takip No</span>
                <p className="font-mono mt-0.5">
                  {shipDetailData.takip_no || "—"}
                </p>
              </div>
              {shipDetailData.notlar && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notlar</span>
                  <p className="mt-0.5">{shipDetailData.notlar}</p>
                </div>
              )}
            </div>

            {shipDetailData.pod && (
              <div className="rounded-[6px] border border-border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Teslimat Kanıtı</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={downloadingPod}
                    onClick={() => void handleDownloadPod(shipDetailData.id)}
                    className="h-7 text-[11px] gap-1"
                  >
                    <Download className="h-3 w-3" />
                    {downloadingPod ? "İndiriliyor…" : "Tutanağı İndir"}
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
                    Belge Referansı: {shipDetailData.pod.belgeler_ref}
                  </p>
                )}
                {shipDetailData.pod.notlar && (
                  <p>Not: {shipDetailData.pod.notlar}</p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const sid = shipDetailData.id;
                  setShipDetailOpen(false);
                  podForm.reset();
                  setBuyerPodShipmentId(sid);
                }}
              >
                Teslimat Kanıtını Aç
              </Button>
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Sevk Et Modal */}
      <EntityModal
        open={dispatchModalOpen}
        onOpenChange={setDispatchModalOpen}
        title="Sevkiyatı Yola Çıkar"
        description="Taşıyıcı firma adı ve kargo takip numarasını girin."
        isDirty={dispatchForm.formState.isDirty}
        isSubmitting={
          dispatchForm.formState.isSubmitting || dispatchMut.isPending
        }
        submitLabel="Sevk Et"
        onSubmit={dispatchForm.handleSubmit(onDispatchSubmit)}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shp-carrier">Taşıyıcı / Kargo Firması *</Label>
          <Input
            id="shp-carrier"
            placeholder="Örn: Loomis, Yurtiçi Kargo"
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
          <Label htmlFor="shp-tracking">Takip / İrsaliye Numarası *</Label>
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
      </EntityModal>

      {/* Teslimat Kanıtı Ekle (Ops) Modal */}
      <EntityModal
        open={podModalOpen}
        onOpenChange={setPodModalOpen}
        title="Teslimat Kanıtı Kaydet"
        description="Teslim alan kişi ve varsa belge referansını girin."
        isDirty={podForm.formState.isDirty}
        isSubmitting={podForm.formState.isSubmitting || podMut.isPending}
        submitLabel="Teslimat Kanıtını Kaydet"
        onSubmit={podForm.handleSubmit(onPodSubmit)}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pod-alan">Teslim Alan *</Label>
          <Input
            id="pod-alan"
            placeholder="Ad Soyad"
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
          <Label htmlFor="pod-not">Notlar (opsiyonel)</Label>
          <Input
            id="pod-not"
            disabled={podForm.formState.isSubmitting}
            {...podForm.register("notlar")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pod-ref">Belge Referansı / Bağlantı (opsiyonel)</Label>
          <Input
            id="pod-ref"
            className="font-mono"
            placeholder="Varsa tutanak bağlantı veya anahtarı"
            disabled={podForm.formState.isSubmitting}
            {...podForm.register("belgeler_ref")}
          />
        </div>
      </EntityModal>

      {/* Yeni İade Talebi Modal */}
      <EntityModal
        open={createReturnOpen}
        onOpenChange={setCreateReturnOpen}
        title="Yeni İade Talebi Oluştur"
        description="Sipariş, sevkiyat ve iade edilecek ürün kalemini seçerek talep başlatın."
        isDirty={createReturnForm.formState.isDirty}
        isSubmitting={
          createReturnForm.formState.isSubmitting || createReturnMut.isPending
        }
        submitLabel="İade Talebi Oluştur"
        onSubmit={createReturnForm.handleSubmit(onCreateReturnSubmit)}
        size="md"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ret-order">Sipariş *</Label>
          <RelationSelect
            id="ret-order"
            value={selectedReturnOrderId ?? null}
            onChange={(val) => {
              const num = val ? Number(val) : undefined;
              createReturnForm.setValue("order_id", num as number, {
                shouldValidate: true,
                shouldDirty: true,
              });
              createReturnForm.setValue(
                "shipment_id",
                undefined as unknown as number
              );
              createReturnForm.setValue(
                "order_line_id",
                undefined as unknown as number
              );
              if (num) {
                void loadReturnDependencies(num);
              } else {
                setReturnShipmentOptions([]);
                setReturnLineOptions([]);
              }
            }}
            loadOptions={loadOrderOptions}
            placeholder="Sipariş seçin…"
            searchPlaceholder="Alıcı firma veya ürün kodu ile ara…"
            emptyText="Uygun sipariş bulunamadı"
            disabled={createReturnForm.formState.isSubmitting}
          />
          {createReturnForm.formState.errors.order_id && (
            <span className="text-[11px] text-destructive">
              {createReturnForm.formState.errors.order_id.message}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-ship">Sevkiyat *</Label>
            <RelationSelect
              id="ret-ship"
              value={selectedReturnShipmentId ?? null}
              onChange={(val) =>
                createReturnForm.setValue(
                  "shipment_id",
                  val ? Number(val) : (undefined as unknown as number),
                  { shouldValidate: true, shouldDirty: true }
                )
              }
              options={returnShipmentOptions}
              placeholder={
                loadingReturnDeps
                  ? "Yükleniyor…"
                  : selectedReturnOrderId
                    ? "Sevkiyat seçin…"
                    : "Önce sipariş seçin…"
              }
              emptyText="Bu siparişe ait sevkiyat bulunamadı"
              disabled={
                loadingReturnDeps ||
                !selectedReturnOrderId ||
                createReturnForm.formState.isSubmitting
              }
            />
            {createReturnForm.formState.errors.shipment_id && (
              <span className="text-[11px] text-destructive">
                {createReturnForm.formState.errors.shipment_id.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-line">Sipariş Kalemi *</Label>
            <RelationSelect
              id="ret-line"
              value={selectedReturnLineId ?? null}
              onChange={(val) =>
                createReturnForm.setValue(
                  "order_line_id",
                  val ? Number(val) : (undefined as unknown as number),
                  { shouldValidate: true, shouldDirty: true }
                )
              }
              options={returnLineOptions}
              placeholder={
                loadingReturnDeps
                  ? "Yükleniyor…"
                  : selectedReturnOrderId
                    ? "Ürün kalemi seçin…"
                    : "Önce sipariş seçin…"
              }
              emptyText="Sipariş kalemi bulunamadı"
              disabled={
                loadingReturnDeps ||
                !selectedReturnOrderId ||
                createReturnForm.formState.isSubmitting
              }
            />
            {createReturnForm.formState.errors.order_line_id && (
              <span className="text-[11px] text-destructive">
                {createReturnForm.formState.errors.order_line_id.message}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-qty">İade Miktarı *</Label>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-sebep">İade Sebebi *</Label>
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ret-notlar">Notlar (opsiyonel)</Label>
          <Input
            id="ret-notlar"
            disabled={createReturnForm.formState.isSubmitting}
            {...createReturnForm.register("notlar")}
          />
        </div>
      </EntityModal>

      {/* İade Detay Modal */}
      <EntityModal
        open={returnDetailOpen}
        onOpenChange={setReturnDetailOpen}
        title="İade Talebi Detayı"
        description="İade kalemleri, stok iade ve finansal mahsup durumu."
        size="md"
      >
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
            {returnDetailTargetId != null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void openReturnDetail(returnDetailTargetId)}
              >
                Yeniden Dene
              </Button>
            )}
          </div>
        ) : returnDetailData ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-[6px] border border-border p-3">
              {returnDetailData.alici_firma_ad && (
                <div>
                  <span className="text-muted-foreground">Alıcı Firma</span>
                  <p className="font-medium mt-0.5">
                    {returnDetailData.alici_firma_ad}
                  </p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Durum</span>
                <p className="font-medium mt-0.5">
                  {STATUS_LABELS[returnDetailData.durum] ||
                    returnDetailData.durum}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Tarih</span>
                <p className="mt-0.5">
                  {returnDetailData.olusturma_tarihi
                    ? formatDateTime(returnDetailData.olusturma_tarihi)
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Stok İade</span>
                <p className="font-medium mt-0.5">
                  {returnDetailData.stok_iade_yapildi ? "Tamamlandı" : "Bekliyor"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Finans Mahsup</span>
                <p className="font-medium mt-0.5">
                  {returnDetailData.finans_mahsup_yapildi
                    ? "Mahsup Edildi"
                    : "Bekliyor"}
                  {returnDetailData.mahsup_tutari
                    ? ` (${returnDetailData.mahsup_tutari} TRY)`
                    : ""}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">İade Sebebi</span>
                <p className="mt-0.5">
                  {returnDetailData.iade_sebebi ||
                    returnDetailData.sebep ||
                    "—"}
                </p>
              </div>
              {returnDetailData.notlar && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notlar</span>
                  <p className="mt-0.5">{returnDetailData.notlar}</p>
                </div>
              )}
            </div>

            {returnDetailData.lines && returnDetailData.lines.length > 0 && (
              <div className="rounded-[6px] border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün Kodu</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnDetailData.lines.map((ln, idx) => (
                      <TableRow key={ln.id ?? idx}>
                        <TableCell className="font-mono">
                          {ln.varyant_sku || "Sipariş Kalemi"}
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
          </div>
        ) : null}
      </EntityModal>

      {/* Teslimat Kanıtı Görüntüleme / Onay Modal */}
      <EntityModal
        open={buyerPodShipmentId !== null}
        onOpenChange={(open) => {
          if (!open) setBuyerPodShipmentId(null);
        }}
        title="Teslimat Kanıtı"
        description="Teslimat tutanağını görüntüleyin, indirin veya teslimatı onaylayın."
        size="sm"
        hideFooter={!buyerPodQ.data?.has_pod && !buyerPodQ.isLoading && !buyerPodQ.isError}
      >
        {buyerPodQ.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Teslimat kanıtı yükleniyor…</span>
          </div>
        ) : buyerPodQ.isError ? (
          <div className="space-y-3">
            <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {mapCommerceError(buyerPodQ.error, "Teslimat kanıtı alınamadı.")}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void buyerPodQ.refetch()}
            >
              Yeniden Dene
            </Button>
          </div>
        ) : buyerPodQ.data ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-border p-3">
              <div>
                <span className="text-muted-foreground">Sevkiyat Durumu</span>
                <p className="font-medium mt-0.5">
                  {STATUS_LABELS[buyerPodQ.data.durum] || buyerPodQ.data.durum}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Taşıyıcı</span>
                <p className="mt-0.5">{buyerPodQ.data.tasiyici || "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Takip No</span>
                <p className="font-mono mt-0.5">
                  {buyerPodQ.data.takip_no || "—"}
                </p>
              </div>
            </div>

            {buyerPodQ.data.has_pod && buyerPodQ.data.pod ? (
              <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Teslimat Kanıtı Kayıtlı
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
                    {downloadingPod ? "İndiriliyor…" : "Tutanağı İndir"}
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
                  Henüz teslimat kanıtı yok — Teslimatı Onayla
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
                  <Label htmlFor="buyer-pod-ref">Belge Referansı</Label>
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
                      : "Teslimatı Onayla"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </EntityModal>

      {/* İade Reddet Modal */}
      <EntityModal
        open={rejectTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTargetId(null);
        }}
        title="İade Talebini Reddet"
        description="İsteğe bağlı olarak ret gerekçesi belirtebilirsiniz."
        isDirty={rejectReason.trim().length > 0}
        isSubmitting={rejectReturnMut.isPending}
        submitLabel="Talebi Reddet"
        onSubmit={onRejectReturnSubmit}
        size="sm"
      >
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
      </EntityModal>
    </div>
  );
}
