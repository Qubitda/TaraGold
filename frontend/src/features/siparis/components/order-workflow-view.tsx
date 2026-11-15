"use client";

import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { BuyerOrder } from "../types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { siparisService } from "../services";
import {
  siparisKeys,
  useCancelOrderMutation,
  useCartQuery,
  useMarkSupplierHazirMutation,
  useOrderDetailQuery,
  useOrdersPageQuery,
  useRemoveCartLineMutation,
  useReorderOrderMutation,
  useRequoteCartLineMutation,
  useSupplierHazirlamaQuery,
  useUpdateCartLineMutation,
} from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import {
  ORDER_STATUSES,
  TAHMINI_FIYAT_ACIKLAMA,
  orderStatusLabel as sharedOrderStatusLabel,
} from "@/lib/order-status";
import { calibrateServerClock } from "@/hooks/use-server-clock";
import { newIdempotencyKey } from "@/lib/api/client";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { isPositiveDecimal } from "@/lib/parse-decimal";
import { ConfirmDialog, EntityModal, ListPage, RowActions } from "@/components/crud";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  firmalarService,
  type FirmaAdresi,
} from "@/features/firmalar";
import { useActionToast } from "@/hooks/use-action-toast";
import { OpsOnayHavuzu } from "./ops-onay-havuzu";
import { useAuthContext } from "@/features/auth/components/auth-provider";

type TabId = "prepare" | "orders" | "hazirlama";

function orderStatusLabel(durum: string): string {
  return sharedOrderStatusLabel(durum, "buyer");
}

export function OrderWorkflowView() {
  const { user } = useAuthContext();
  const showOpsOnay = Boolean(user?.capabilities?.can_view_ops);
  const showSupplierHazirlama = Boolean(
    user?.capabilities?.can_manage_offers ||
      user?.capabilities?.can_view_ops ||
      user?.firma?.tedarikci_mi
  );
  const actionToast = useActionToast();
  const navigate = useNavigate();
  const { id: routeOrderId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [orderSearch, setOrderSearch] = useState("");
  const [orderDurum, setOrderDurum] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);

  const cartQuery = useCartQuery();
  const ordersQuery = useOrdersPageQuery({
    page: String(orderPage),
    page_size: String(orderPageSize),
    ...(orderSearch.trim() ? { q: orderSearch.trim() } : {}),
    ...(orderDurum ? { durum: orderDurum } : {}),
  });

  const removeLineMutation = useRemoveCartLineMutation();
  const updateLineMutation = useUpdateCartLineMutation();
  const requoteMutation = useRequoteCartLineMutation();
  const cancelMutation = useCancelOrderMutation();
  const reorderMutation = useReorderOrderMutation();
  const hazirlamaQuery = useSupplierHazirlamaQuery(showSupplierHazirlama);
  const markHazirMutation = useMarkSupplierHazirMutation();

  const tabParam = searchParams.get("tab");
  const activeTab: TabId =
    tabParam === "orders" ||
    tabParam === "prepare" ||
    tabParam === "cart" || // eski URL uyumu → prepare
    (tabParam === "hazirlama" && showSupplierHazirlama)
      ? tabParam === "cart"
        ? "prepare"
        : (tabParam as TabId)
      : routeOrderId
        ? "orders"
        : "prepare";

  const setActiveTab = (tab: TabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true }
    );
  };

  const cart = cartQuery.data ?? null;
  const ordersPageData = ordersQuery.data;
  const orders = ordersPageData?.results ?? [];
  const ordersTotalCount = ordersPageData?.count ?? orders.length;

  const [addresses, setAddresses] = useState<FirmaAdresi[]>([]);
  const loading = cartQuery.isLoading;
  const [error, setError] = useState<string | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<number, string>>({});
  const [savingLineId, setSavingLineId] = useState<number | null>(null);
  const [removeLineConfirm, setRemoveLineConfirm] = useState<number | null>(null);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedDeliveryAddr, setSelectedDeliveryAddr] = useState<number | undefined>(
    undefined
  );
  const [selectedInvoiceAddr, setSelectedInvoiceAddr] = useState<number | undefined>(
    undefined
  );
  const [orderNotes, setOrderNotes] = useState("");
  const checkoutAttemptRef = useRef<{
    checkoutKey: string;
    orderKey: string;
    checkoutId?: number;
  } | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<BuyerOrder | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const routeIdNum =
    routeOrderId && Number.isFinite(Number(routeOrderId))
      ? Number(routeOrderId)
      : undefined;
  const orderDetailQuery = useOrderDetailQuery(routeIdNum, Boolean(routeIdNum));

  const handleMarkHazir = async (orderId: number) => {
    setError(null);
    try {
      await markHazirMutation.mutateAsync(orderId);
      actionToast.success("Sipariş hazır olarak işaretlendi");
    } catch (err) {
      const msg = mapCommerceError(err, "Hazır işaretleme başarısız.");
      setError(msg);
      actionToast.error("Hazır işaretlenemedi", msg);
    }
  };

  const [downloadingIrsaliyeId, setDownloadingIrsaliyeId] = useState<number | null>(
    null
  );

  const handleDownloadSupplierIrsaliye = async (orderId: number) => {
    setDownloadingIrsaliyeId(orderId);
    try {
      await siparisService.downloadSupplierHazirlamaIrsaliye(orderId);
      actionToast.success("Tedarikçi irsaliyesi indirildi");
    } catch (err) {
      actionToast.error("Tedarikçi irsaliyesi indirilemedi", err);
    } finally {
      setDownloadingIrsaliyeId(null);
    }
  };

  const refreshData = async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: siparisKeys.all });
    try {
      const addressData = await firmalarService.getAddresses();
      const addrList = addressData?.results || [];
      setAddresses(addrList);
      const defDelivery =
        addrList.find((a) => a.tip === "TESLIMAT" && a.varsayilan) ||
        addrList.find((a) => a.tip === "TESLIMAT");
      const defInvoice =
        addrList.find((a) => a.tip === "FATURA" && a.varsayilan) ||
        addrList.find((a) => a.tip === "FATURA");
      if (defDelivery) setSelectedDeliveryAddr(defDelivery.id);
      if (defInvoice) setSelectedInvoiceAddr(defInvoice.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adresler alınamadı.");
    }
  };

  useEffect(() => {
    void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once for addresses
  }, []);

  useEffect(() => {
    const err = cartQuery.error || ordersQuery.error || orderDetailQuery.error;
    if (err) {
      setError(mapCommerceError(err, "Sipariş verileri alınamadı."));
    }
  }, [cartQuery.error, ordersQuery.error, orderDetailQuery.error]);

  useEffect(() => {
    if (cart?.server_now) calibrateServerClock(cart.server_now);
  }, [cart?.server_now]);

  useEffect(() => {
    if (!cart?.lines) return;
    setLineDrafts((prev) => {
      const next: Record<number, string> = {};
      const liveIds = new Set(cart.lines.map((l) => l.id));
      for (const line of cart.lines) {
        // Kaydedilmemiş taslakları koru; yalnızca yeni satırlara sunucu değeri yaz
        next[line.id] =
          prev[line.id] !== undefined ? prev[line.id]! : line.miktar;
      }
      // Silinen satırları düş
      for (const id of Object.keys(prev)) {
        const n = Number(id);
        if (!liveIds.has(n)) continue;
      }
      return next;
    });
  }, [cart?.lines]);

  useEffect(() => {
    if (!routeIdNum) return;
    setActiveTab("orders");
    setOrderDetailOpen(true);
    if (orderDetailQuery.data) {
      setSelectedOrder(orderDetailQuery.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIdNum, orderDetailQuery.data]);

  const handleConfirmCheckout = async () => {
    if (!checkoutAttemptRef.current) {
      checkoutAttemptRef.current = {
        checkoutKey: newIdempotencyKey(),
        orderKey: newIdempotencyKey(),
      };
    }
    const attempt = checkoutAttemptRef.current;
    setIsSubmittingCheckout(true);
    setError(null);
    try {
      let checkoutId = attempt.checkoutId;
      if (!checkoutId) {
        const checkoutResult = await siparisService.createCheckout(
          {
            teslimat_adresi_id: selectedDeliveryAddr ?? undefined,
            fatura_adresi_id: selectedInvoiceAddr ?? undefined,
            siparis_notu: orderNotes.trim(),
          },
          attempt.checkoutKey
        );
        if (checkoutResult.order_id) {
          const createdOrder = await siparisService.getOrderDetail(
            checkoutResult.order_id
          );
          checkoutAttemptRef.current = null;
          void queryClient.invalidateQueries({ queryKey: siparisKeys.all });
          setCheckoutModalOpen(false);
          setOrderNotes("");
          await refreshData();
          setActiveTab("orders");
          setSelectedOrder(createdOrder);
          setOrderDetailOpen(true);
          navigate(`/siparis/${createdOrder.id}?tab=orders`, { replace: true });
          actionToast.success("Sipariş oluşturuldu");
          return;
        }
        checkoutId = checkoutResult.checkout_id ?? checkoutResult.id;
        if (!checkoutId) throw new Error("Checkout id alınamadı.");
        attempt.checkoutId = checkoutId;
      }
      const createdOrder = await siparisService.createOrderFromCheckout(
        checkoutId,
        attempt.orderKey
      );
      checkoutAttemptRef.current = null;
      void queryClient.invalidateQueries({ queryKey: siparisKeys.all });
      setCheckoutModalOpen(false);
      setOrderNotes("");
      await refreshData();
      setActiveTab("orders");
      setSelectedOrder(createdOrder);
      setOrderDetailOpen(true);
      navigate(`/siparis/${createdOrder.id}?tab=orders`, { replace: true });
      actionToast.success("Sipariş oluşturuldu");
    } catch (err) {
      const msg = mapCommerceError(err, "Sipariş oluşturma işlemi başarısız.");
      setError(msg);
      actionToast.error("Sipariş oluşturulamadı", msg);
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  const handleRemoveLine = async (lineId: number) => {
    try {
      await removeLineMutation.mutateAsync(lineId);
      setRemoveLineConfirm(null);
      actionToast.success("Satır kaldırıldı");
    } catch (err) {
      setError(mapCommerceError(err, "Satır silinemedi."));
      actionToast.error("Satır silinemedi", err);
    }
  };

  const handleSaveLineQty = async (lineId: number) => {
    const miktar = (lineDrafts[lineId] || "").trim();
    if (!isPositiveDecimal(miktar)) {
      setError("Lütfen sıfırdan büyük geçerli bir miktar girin.");
      return;
    }
    setSavingLineId(lineId);
    setError(null);
    try {
      await updateLineMutation.mutateAsync({ lineId, miktar });
      setLineDrafts((prev) => ({ ...prev, [lineId]: miktar }));
      actionToast.success("Miktar güncellendi");
    } catch (err) {
      setError(mapCommerceError(err, "Miktar güncellenemedi."));
      actionToast.error("Miktar güncellenemedi", err);
    } finally {
      setSavingLineId(null);
    }
  };

  const handleOpenOrderDetail = (order: BuyerOrder) => {
    setSelectedOrder(order);
    navigate(`/siparis/${order.id}?tab=orders`);
    setOrderDetailOpen(true);
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelMutation.mutateAsync(orderId);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, durum: "IPTAL" } : null));
      }
      actionToast.success("Sipariş iptal edildi");
    } catch (err) {
      setError(mapCommerceError(err, "Sipariş iptal edilemedi."));
      actionToast.error("Sipariş iptal edilemedi", err);
    }
  };

  const handleReorderOrder = async (orderId: number) => {
    setError(null);
    try {
      await reorderMutation.mutateAsync(orderId);
      actionToast.success("Sipariş kalemleri hazırlandı");
      setOrderDetailOpen(false);
      if (routeOrderId) {
        navigate("/siparis?tab=cart", { replace: true });
      } else {
        setActiveTab("prepare");
      }
    } catch (err) {
      const msg = mapCommerceError(err, "Tekrar sipariş oluşturulamadı.");
      setError(msg);
      actionToast.error("Tekrar sipariş oluşturulamadı", msg);
    }
  };

  const renderDurumBadge = (durum: string) => {
    const label = orderStatusLabel(durum);
    switch (durum) {
      case "ONAYLANDI":
      case "HAZIR":
      case "TAMAMLANDI":
        return <Badge variant="success">{label}</Badge>;
      case "IPTAL":
      case "REDDEDILDI":
        return <Badge variant="destructive">{label}</Badge>;
      case "BEKLEMEDE":
      case "ONAY_BEKLIYOR":
      case "HAZIRLANIYOR":
      case "SEVKIYAT":
        return <Badge variant="warning">{label}</Badge>;
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  const deliveryOptions = addresses.filter((a) => a.tip === "TESLIMAT");
  const invoiceOptions = addresses.filter((a) => a.tip === "FATURA");

  return (
    <div className="flex flex-col gap-6">
      {showOpsOnay ? (
        <section className="space-y-3 border-b border-border pb-6">
          <OpsOnayHavuzu />
        </section>
      ) : null}

      {/* Başlık ve Sekme Değiştirici */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sipariş
          </h1>
          <p className="text-xs text-muted-foreground">
            Ürünleri ekleyip gönderin; gönderilmiş siparişlerinizi ve durumlarını takip edin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("prepare")}
            className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "prepare"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Yeni sipariş ({cart?.line_count ?? 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "orders"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Sipariş Listem ({ordersTotalCount})</span>
          </button>
          {showSupplierHazirlama && (
            <button
              type="button"
              onClick={() => setActiveTab("hazirlama")}
              className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "hazirlama"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>
                Tedarikçi Hazırlama ({(hazirlamaQuery.data ?? []).length})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Hata Bildirimi */}
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
            onClick={refreshData}
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
            <span>Veriler yükleniyor…</span>
          </div>
        </div>
      ) : activeTab === "prepare" ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-[8px] border border-border bg-card overflow-hidden">
            {!cart || cart.lines.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6">
                <ShoppingCart className="h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-foreground">Henüz ürün eklenmedi</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Katalogdan Sipariş Ver ile ürün ekleyin; miktarları düzenleyip Siparişi Gönderin.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün / Stok Kodu</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead className="text-right">Tahmini birim</TableHead>
                    <TableHead>Para Birimi</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.lines.map((line) => {
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="text-xs font-medium text-foreground">
                            {line.urun_ad || line.varyant_sku || "Ürün Kalemi"}
                          </div>
                          {line.varyant_sku ? (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {line.varyant_sku}
                              {line.gram ? ` · ${line.gram}g` : ""}
                              {line.fiyat_tipi ? ` · ${line.fiyat_tipi}` : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Input
                              value={lineDrafts[line.id] ?? line.miktar}
                              onChange={(e) =>
                                setLineDrafts((prev) => ({
                                  ...prev,
                                  [line.id]: e.target.value,
                                }))
                              }
                              inputMode="decimal"
                              className="h-8 w-24 text-right font-mono tabular-nums"
                              aria-label={`${line.urun_ad || line.varyant_sku || "Kalem"} miktar`}
                            />
                            <span className="text-[11px] text-muted-foreground">
                              {line.birim || "ADET"}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                savingLineId === line.id ||
                                (lineDrafts[line.id] ?? line.miktar) === line.miktar
                              }
                              onClick={() => void handleSaveLineQty(line.id)}
                            >
                              Kaydet
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-foreground font-medium">
                          <div>
                            {formatMoney(line.birim_fiyat_vergisiz, line.para_birimi)}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-sans font-normal">
                            Tahmini
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.para_birimi}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoveLineConfirm(line.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            aria-label="Satırı kaldır"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {cart && cart.lines.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[8px] border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground space-y-1 max-w-xl">
                <p>
                  Gönderince sipariş onay havuzuna düşer. Gösterilen tutarlar{" "}
                  <strong className="font-medium text-foreground">tahmini</strong>
                  dir; kesin fiyat onayda güncel kura göre yazılır. Stok onayda ayrılır.
                </p>
                <p className="text-[11px]">{TAHMINI_FIYAT_ACIKLAMA}</p>
              </div>
              <Button
                type="button"
                onClick={() => setCheckoutModalOpen(true)}
                disabled={isSubmittingCheckout}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Siparişi Gönder</span>
              </Button>
            </div>
          )}
        </div>
      ) : activeTab === "orders" ? (
        <ListPage
          title="Sipariş Geçmişi"
          description="Siparişleriniz; onay öncesi tahmini, onay sonrası kesin fiyatla burada görünür."
          searchValue={orderSearch}
          onSearchChange={(val) => {
            setOrderSearch(val);
            setOrderPage(1);
          }}
          searchPlaceholder="Ürün adı, stok kodu veya alıcı firma ile ara…"
          filters={
            <select
              aria-label="Sipariş durumu filtresi"
              value={orderDurum}
              onChange={(e) => {
                setOrderDurum(e.target.value);
                setOrderPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value="">Tüm Durumlar</option>
              {ORDER_STATUSES.map((k) => (
                <option key={k} value={k}>
                  {orderStatusLabel(k)}
                </option>
              ))}
            </select>
          }
          loading={ordersQuery.isLoading}
          error={
            ordersQuery.isError
              ? mapCommerceError(ordersQuery.error, "Siparişler alınamadı.")
              : null
          }
          onRetry={() => void ordersQuery.refetch()}
          isEmpty={orders.length === 0}
          emptyTitle="Kayıtlı sipariş bulunamadı"
          emptyDescription="Gönderdiğiniz siparişler ve durumları burada listelenir."
          page={orderPage}
          pageSize={orderPageSize}
          totalCount={ordersTotalCount}
          onPageChange={setOrderPage}
          onPageSizeChange={(next) => {
            setOrderPageSize(next);
            setOrderPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sipariş Özeti</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Kalem Sayısı</TableHead>
                <TableHead>Sipariş Tarihi</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const canReorder =
                  !order.allowed_actions ||
                  order.allowed_actions.includes("reorder");
                const canCancel = order.allowed_actions?.includes("cancel");
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left text-xs font-medium text-foreground hover:underline"
                        onClick={() => handleOpenOrderDetail(order)}
                      >
                        {order.alici_firma_ad || "Sipariş Kaydı"}
                      </button>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateTime(order.olusturma_tarihi)}
                      </div>
                    </TableCell>
                    <TableCell>{renderDurumBadge(order.durum)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {order.line_count} kalem
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(order.olusturma_tarihi)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel="Bu sipariş"
                        onView={() => handleOpenOrderDetail(order)}
                        extraActions={[
                          ...(canReorder
                            ? [
                                {
                                  label: "Tekrar Sipariş Ver",
                                  icon: <RotateCcw className="h-3.5 w-3.5" />,
                                  onClick: () => handleReorderOrder(order.id),
                                },
                              ]
                            : []),
                          ...(canCancel
                            ? [
                                {
                                  label: "Siparişi İptal Et",
                                  variant: "destructive" as const,
                                  confirmTitle: "Siparişi İptal Et",
                                  confirmDescription:
                                    "Bu sipariş iptal edilecek ve varsa stok rezervasyonu iade edilecektir.",
                                  onClick: () => handleCancelOrder(order.id),
                                },
                              ]
                            : []),
                        ]}
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
          title="Tedarikçi Hazırlama Emirleri"
          description="Alıcı kimliği gizli tutularak yönlendirilen hazırlama emirlerini tamamlayıp sevk irsaliyesi alabilirsiniz."
          loading={hazirlamaQuery.isLoading}
          error={
            hazirlamaQuery.isError
              ? hazirlamaQuery.error instanceof Error
                ? hazirlamaQuery.error.message
                : "Hazırlama emirleri alınamadı."
              : null
          }
          onRetry={() => void hazirlamaQuery.refetch()}
          isEmpty={(hazirlamaQuery.data ?? []).length === 0}
          emptyTitle="Aktif hazırlama emri bulunmuyor"
          emptyDescription="Platform tarafından yönlendirilen siparişler burada görünür."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Durum</TableHead>
                <TableHead>Hazırlanacak Kalemler (Kör Havuz)</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(hazirlamaQuery.data ?? []).map((emri) => (
                <TableRow key={emri.order_id}>
                  <TableCell>{renderDurumBadge(emri.durum)}</TableCell>
                  <TableCell className="text-xs">
                    <ul className="space-y-1 font-mono text-[11px]">
                      {emri.satirlar.map((s) => (
                        <li key={s.order_line_id}>
                          <span className="font-medium text-foreground">
                            {s.platform_kodu || "Ürün Kalemi"}
                          </span>{" "}
                          · {s.miktar} {s.birim}
                          {s.teslim_modeli
                            ? ` (${
                                s.teslim_modeli === "DOGRUDAN"
                                  ? "Doğrudan Teslim"
                                  : "Platform Kalite Kontrol"
                              })`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingIrsaliyeId === emri.order_id}
                        onClick={() =>
                          void handleDownloadSupplierIrsaliye(emri.order_id)
                        }
                        className="h-8 text-xs gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>
                          {downloadingIrsaliyeId === emri.order_id
                            ? "İndiriliyor…"
                            : "Sevk İrsaliyesi İndir"}
                        </span>
                      </Button>
                      {(emri.hazirlama_durumu ?? emri.durum) !== "HAZIR" &&
                      emri.durum !== "TAMAMLANDI" ? (
                        <Button
                          size="sm"
                          disabled={markHazirMutation.isPending}
                          onClick={() => void handleMarkHazir(emri.order_id)}
                          className="h-8 text-xs"
                        >
                          {markHazirMutation.isPending
                            ? "İşleniyor…"
                            : "Hazır İşaretle"}
                        </Button>
                      ) : (
                        <Badge variant="success" className="font-mono text-[10px]">
                          HAZIR
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* Satır silme onayı */}
      <ConfirmDialog
        open={removeLineConfirm !== null}
        onOpenChange={(open) => !open && setRemoveLineConfirm(null)}
        title="Satırı Kaldır"
        description="Seçili ürün kalemi hazırlanan listeden kaldırılacaktır."
        confirmLabel="Kaldır"
        variant="destructive"
        loading={removeLineMutation.isPending}
        onConfirm={() => {
          if (removeLineConfirm !== null) {
            return handleRemoveLine(removeLineConfirm);
          }
        }}
      />

      {/* Sipariş Detay Modalı */}
      <EntityModal
        open={orderDetailOpen}
        onOpenChange={(open) => {
          setOrderDetailOpen(open);
          if (!open && routeOrderId) {
            navigate("/siparis?tab=orders", { replace: true });
          }
        }}
        title={selectedOrder?.alici_firma_ad ? `Sipariş · ${selectedOrder.alici_firma_ad}` : "Sipariş Detayı"}
        description={
          selectedOrder
            ? `Tarih: ${formatDateTime(selectedOrder.olusturma_tarihi)} · Durum: ${orderStatusLabel(selectedOrder.durum)}`
            : undefined
        }
        size="lg"
      >
        {orderDetailQuery.isLoading || orderDetailQuery.isFetching ? (
          <div
            className="flex h-32 items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : orderDetailQuery.isError && !selectedOrder ? (
          <div
            className="flex flex-col gap-3 rounded-[6px] border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {mapCommerceError(
                  orderDetailQuery.error,
                  "Sipariş detayı yüklenemedi."
                )}
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void orderDetailQuery.refetch()}
                className="h-8 border-destructive/30"
              >
                Yeniden Dene
              </Button>
            </div>
          </div>
        ) : selectedOrder ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sipariş kalemleri
              </span>
              {renderDurumBadge(selectedOrder.durum)}
            </div>

            {selectedOrder.fiyat_kesin ? (
              <p className="text-xs text-muted-foreground">
                Kesin toplam:{" "}
                <span className="font-mono font-medium text-foreground">
                  {selectedOrder.kesin_toplam_vergisiz ?? "—"}
                </span>
                {selectedOrder.tahmini_toplam_vergisiz ? (
                  <>
                    {" "}
                    · Tahmini:{" "}
                    <span className="line-through font-mono">
                      {selectedOrder.tahmini_toplam_vergisiz}
                    </span>
                  </>
                ) : null}
                {selectedOrder.fark_toplam_vergisiz &&
                selectedOrder.fark_toplam_vergisiz !== "0.00" ? (
                  <>
                    {" "}
                    · Fark:{" "}
                    <span className="font-mono text-foreground">
                      {selectedOrder.fark_toplam_vergisiz}
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tahmini toplam:{" "}
                <span className="font-mono font-medium text-foreground">
                  {selectedOrder.tahmini_toplam_vergisiz ?? "—"}
                </span>
                {" · "}
                {TAHMINI_FIYAT_ACIKLAMA}
              </p>
            )}

            {selectedOrder.lines && selectedOrder.lines.length > 0 ? (
              <div className="rounded-[6px] border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün / Stok Kodu</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead className="text-right">Tahmini</TableHead>
                      <TableHead className="text-right">Kesin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="text-xs font-medium text-foreground">
                            {l.urun_ad || l.varyant_sku || "Ürün Kalemi"}
                          </div>
                          {l.varyant_sku ? (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {l.varyant_sku}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {l.miktar} {l.birim}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums text-xs ${
                            l.fiyat_kesin ? "line-through text-muted-foreground" : "font-semibold"
                          }`}
                        >
                          {formatMoney(
                            l.tahmini_satir_tutari_vergisiz ??
                              l.snapshot_satir_tutari_vergisiz,
                            l.para_birimi
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                          {l.fiyat_kesin
                            ? formatMoney(
                                l.snapshot_satir_tutari_vergisiz,
                                l.para_birimi
                              )
                            : "—"}
                          {l.fark_vergisiz && l.fark_vergisiz !== "0.00" ? (
                            <div className="text-[10px] font-sans font-normal text-muted-foreground">
                              Fark: {l.fark_vergisiz} {l.para_birimi}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                Kalem bilgisi yüklenemedi.
              </p>
            )}

            <div className="border-t border-border pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Onaylı proforma ve irsaliye belgelerinizi{" "}
                <Link to="/belgeler" className="text-foreground underline">
                  Belgeler
                </Link>{" "}
                ekranından indirebilirsiniz.
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(!selectedOrder.allowed_actions ||
                  selectedOrder.allowed_actions.includes("reorder")) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      reorderMutation.isPending &&
                      reorderMutation.variables === selectedOrder.id
                    }
                    onClick={() => void handleReorderOrder(selectedOrder.id)}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      {reorderMutation.isPending &&
                      reorderMutation.variables === selectedOrder.id
                        ? "Listeye aktarılıyor…"
                        : "Tekrar Sipariş Ver"}
                    </span>
                  </Button>
                )}

                {selectedOrder.allowed_actions?.includes("cancel") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => void handleCancelOrder(selectedOrder.id)}
                  >
                    {cancelMutation.isPending
                      ? "İptal Ediliyor…"
                      : "Siparişi İptal Et"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Siparişi Gönder Modalı */}
      <EntityModal
        open={checkoutModalOpen}
        onOpenChange={setCheckoutModalOpen}
        title="Sipariş Onayı ve Teslimat Özeti"
        description="Teslimat ve fatura adreslerinizi kontrol ederek siparişi kesinleştirin."
        isDirty={Boolean(orderNotes.trim())}
        isSubmitting={isSubmittingCheckout}
        submitLabel="Siparişi Gönder"
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirmCheckout();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Teslimat Adresi</span>
              </span>
              <Link
                to="/profil"
                className="text-[11px] text-primary hover:underline underline-offset-2"
              >
                Adres Ekle / Düzenle
              </Link>
            </div>

            {deliveryOptions.length === 0 ? (
              <div className="rounded-[6px] border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Kayıtlı teslimat adresi bulunamadı.{" "}
                <Link to="/profil" className="text-foreground underline">
                  Profil &amp; Adresler
                </Link>{" "}
                ekranından adres ekleyebilirsiniz.
              </div>
            ) : (
              <select
                value={selectedDeliveryAddr ?? ""}
                onChange={(e) => setSelectedDeliveryAddr(Number(e.target.value))}
                className="h-9 w-full rounded-[6px] border border-input bg-background px-3 py-1 text-xs"
              >
                {deliveryOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.il} {a.ilce ? `/ ${a.ilce}` : ""} — {a.adres}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Fatura Adresi</span>
            </span>

            {invoiceOptions.length === 0 ? (
              <div className="rounded-[6px] border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Kayıtlı fatura adresi bulunamadı (Teslimat adresi esas alınır).
              </div>
            ) : (
              <select
                value={selectedInvoiceAddr ?? ""}
                onChange={(e) => setSelectedInvoiceAddr(Number(e.target.value))}
                className="h-9 w-full rounded-[6px] border border-input bg-background px-3 py-1 text-xs"
              >
                {invoiceOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.il} {a.ilce ? `/ ${a.ilce}` : ""} — {a.adres}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              Sipariş Notu (İsteğe Bağlı)
            </span>
            <Input
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Örn: Saat 14:00 öncesi teslimat ricası"
            />
          </div>

          <div className="rounded-[6px] border border-border/80 bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Kalem adedi:</span>
              <span className="font-mono font-medium text-foreground">
                {cart?.line_count ?? 0}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Onayladığınızda güncel teklif fiyatları kilitlenir ve siparişiniz operasyon onay havuzuna iletilir.
            </div>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
