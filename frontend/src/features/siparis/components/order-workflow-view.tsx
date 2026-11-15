"use client";

import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { BulkOrderResult, BuyerOrder } from "../types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { siparisService } from "../services";
import {
  siparisKeys,
  useBulkOrderMutation,
  useCancelOrderMutation,
  useCartQuery,
  useCheckoutMutation,
  useMarkSupplierHazirMutation,
  useOrderDetailQuery,
  useOrdersPageQuery,
  useRemoveCartLineMutation,
  useReorderOrderMutation,
  useRequoteCartLineMutation,
  useSupplierHazirlamaQuery,
  useUpdateCartLineMutation,
} from "../hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QuoteCountdown, isQuoteExpired } from "@/components/commerce/quote-countdown";
import { mapCommerceError } from "@/lib/api/commerce-errors";
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
  FileSpreadsheet,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Upload,
} from "lucide-react";
import {
  firmalarService,
  opsFirmalarService,
  type FirmaAdresi,
  type SalesChannelOption,
} from "@/features/firmalar";
import { useActionToast } from "@/hooks/use-action-toast";
import { OpsOnayHavuzu } from "./ops-onay-havuzu";
import { useAuthContext } from "@/features/auth/components/auth-provider";

type TabId = "cart" | "orders" | "bulk" | "hazirlama";

const ORDER_STATUS_LABELS: Record<string, string> = {
  TASLAK: "Taslak",
  OLUSTURULDU: "Oluşturuldu",
  ONAY_BEKLIYOR: "Onay Bekliyor",
  BEKLEMEDE: "Beklemede",
  ONAYLANDI: "Onaylandı",
  HAZIRLANIYOR: "Hazırlanıyor",
  HAZIR: "Hazır",
  SEVKIYAT: "Sevkiyatta",
  TAMAMLANDI: "Tamamlandı",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal",
};

function orderStatusLabel(durum: string): string {
  return ORDER_STATUS_LABELS[durum] || durum;
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
  const salesChannelsQuery = useQuery({
    queryKey: ["sales-channels-options"],
    queryFn: async () => {
      const res = await opsFirmalarService.listSalesChannels();
      const items = Array.isArray(res) ? res : (res.results ?? []);
      return items.filter((c) => c.aktif !== false);
    },
  });

  const removeLineMutation = useRemoveCartLineMutation();
  const updateLineMutation = useUpdateCartLineMutation();
  const checkoutMutation = useCheckoutMutation();
  const requoteMutation = useRequoteCartLineMutation();
  const cancelMutation = useCancelOrderMutation();
  const reorderMutation = useReorderOrderMutation();
  const bulkMutation = useBulkOrderMutation();
  const hazirlamaQuery = useSupplierHazirlamaQuery(showSupplierHazirlama);
  const markHazirMutation = useMarkSupplierHazirMutation();

  const tabParam = searchParams.get("tab");
  const activeTab: TabId =
    tabParam === "orders" ||
    tabParam === "bulk" ||
    tabParam === "cart" ||
    (tabParam === "hazirlama" && showSupplierHazirlama)
      ? tabParam
      : routeOrderId
        ? "orders"
        : "cart";

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
  const salesChannels: SalesChannelOption[] = salesChannelsQuery.data ?? [];

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

  const [selectedOrder, setSelectedOrder] = useState<BuyerOrder | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  const routeIdNum =
    routeOrderId && Number.isFinite(Number(routeOrderId))
      ? Number(routeOrderId)
      : undefined;
  const orderDetailQuery = useOrderDetailQuery(routeIdNum, Boolean(routeIdNum));

  // Toplu Sipariş State'leri
  const [selectedChannelId, setSelectedChannelId] = useState<number | "">("");
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkOrderResult | null>(null);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  useEffect(() => {
    if (selectedChannelId === "" && salesChannels.length > 0) {
      setSelectedChannelId(salesChannels[0].id);
    }
  }, [salesChannels, selectedChannelId]);

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

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    if (!selectedChannelId) {
      const msg = "Lütfen bir satış kanalı seçin.";
      setError(msg);
      actionToast.error("Kanal seçilmedi", msg);
      return;
    }
    setIsSubmittingBulk(true);
    setError(null);
    setBulkResult(null);

    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const rows = lines.map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      return {
        sku: parts[0] || "",
        miktar: parts[1] || "1",
        birim: parts[2] || "ADET",
      };
    });

    try {
      const result = await bulkMutation.mutateAsync({
        satis_kanali_id: Number(selectedChannelId),
        rows,
      });
      setBulkResult(result);
      actionToast.success("Toplu sipariş işlendi");
      if (result.order_id) {
        await refreshData();
      }
    } catch (err) {
      setError(mapCommerceError(err, "Toplu sipariş işlenemedi."));
      actionToast.error("Toplu sipariş işlenemedi", err);
    } finally {
      setIsSubmittingBulk(false);
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
    if (!cart?.lines) return;
    const next: Record<number, string> = {};
    for (const line of cart.lines) {
      next[line.id] = line.miktar;
    }
    setLineDrafts(next);
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

  const cartHasExpiredQuote = Boolean(
    cart?.lines?.some((l) => isQuoteExpired(l.gecerlilik_sonu))
  );

  const handleConfirmCheckout = async () => {
    if (cartHasExpiredQuote) {
      const msg =
        "Sepette süresi dolmuş fiyat teklifi var. Miktarı güncelleyin veya satırı silip yeni fiyat alın.";
      setError(msg);
      actionToast.error("Sipariş tamamlanamadı", msg);
      return;
    }
    setIsSubmittingCheckout(true);
    setError(null);
    try {
      const createdOrder = await checkoutMutation.mutateAsync({
        teslimat_adresi_id: selectedDeliveryAddr ?? undefined,
        fatura_adresi_id: selectedInvoiceAddr ?? undefined,
        siparis_notu: orderNotes.trim(),
      });
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
      actionToast.success("Satır sepetten kaldırıldı");
    } catch (err) {
      setError(mapCommerceError(err, "Satır silinemedi."));
      actionToast.error("Satır silinemedi", err);
    }
  };

  const handleSaveLineQty = async (lineId: number) => {
    const miktar = (lineDrafts[lineId] || "").trim();
    if (!miktar || Number(miktar) <= 0) {
      setError("Lütfen sıfırdan büyük geçerli bir miktar girin.");
      return;
    }
    setSavingLineId(lineId);
    setError(null);
    try {
      await updateLineMutation.mutateAsync({ lineId, miktar });
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
      actionToast.success("Sipariş kalemleri sepete aktarıldı");
      setOrderDetailOpen(false);
      if (routeOrderId) {
        navigate("/siparis?tab=cart", { replace: true });
      } else {
        setActiveTab("cart");
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
            Sipariş &amp; Sepet Yönetimi
          </h1>
          <p className="text-xs text-muted-foreground">
            Aktif sepet kalemlerinizi yönetin, siparişlerinizi takip edin veya toplu SKU listesi yükleyin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "cart"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Aktif Sepet ({cart?.line_count ?? 0})</span>
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
            <span>Sipariş Geçmişi ({ordersTotalCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "bulk"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Toplu Sipariş</span>
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
      ) : activeTab === "cart" ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-[8px] border border-border bg-card overflow-hidden">
            {!cart || cart.lines.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6">
                <ShoppingCart className="h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-foreground">Sepetiniz boş</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Katalogdan seçtiğiniz ürünler için aldığınız fiyat tekliflerini sepete ekleyebilirsiniz.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün / Stok Kodu</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead className="text-right">Birim Fiyat (Vergisiz)</TableHead>
                    <TableHead>Para Birimi</TableHead>
                    <TableHead>Fiyat Geçerlilik Süresi</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.lines.map((line) => {
                    const expired = isQuoteExpired(line.gecerlilik_sonu);
                    return (
                      <TableRow
                        key={line.id}
                        className={expired ? "bg-destructive/5" : undefined}
                      >
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
                          {formatMoney(line.birim_fiyat_vergisiz, line.para_birimi)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.para_birimi}
                        </TableCell>
                        <TableCell className="text-xs">
                          <QuoteCountdown expiresAt={line.gecerlilik_sonu} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {expired ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={requoteMutation.isPending}
                                onClick={() => {
                                  void requoteMutation
                                    .mutateAsync(line.id)
                                    .then(() =>
                                      actionToast.success("Fiyat yenilendi")
                                    )
                                    .catch((err) =>
                                      actionToast.error("Fiyat yenilenemedi", err)
                                    );
                                }}
                              >
                                Fiyatı yenile
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setRemoveLineConfirm(line.id)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              aria-label="Satırı sepetten sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Siparişi onayladığınız anda güncel fiyatlar dondurulur ve rezervasyon yapılır.</p>
                {cartHasExpiredQuote ? (
                  <p className="text-destructive" role="alert">
                    Sepetinizde süresi dolmuş fiyat teklifi bulunuyor. Lütfen eski satırı kaldırıp yeni teklif ekleyin.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={() => setCheckoutModalOpen(true)}
                disabled={isSubmittingCheckout || cartHasExpiredQuote}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Siparişi Tamamla</span>
              </Button>
            </div>
          )}
        </div>
      ) : activeTab === "orders" ? (
        <ListPage
          title="Sipariş Geçmişi"
          description="Tamamlanan siparişleriniz kilitlenmiş fiyat ve miktar bilgileriyle burada saklanır."
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
              {Object.entries(ORDER_STATUS_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
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
          emptyDescription="Sepetinizi onayladığınızda oluşan siparişler burada listelenir."
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
      ) : activeTab === "bulk" ? (
        <div className="flex flex-col gap-6">
          <form
            onSubmit={handleBulkSubmit}
            className="flex flex-col gap-4 rounded-[8px] border border-border bg-card p-6"
          >
            <div className="flex flex-col gap-1 border-b border-border pb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span>Hızlı Toplu Sipariş &amp; Stok Kodu Listesi</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Toptan alımlarda her satıra bir kalem gelecek şekilde Stok Kodu, Miktar ve Birim girin (virgül, noktalı virgül veya sekme ile ayırabilirsiniz).
              </p>
            </div>

            <div className="flex flex-col gap-1.5 max-w-sm">
              <label className="text-xs font-medium text-foreground">
                Satış Kanalı
              </label>
              <select
                value={selectedChannelId}
                onChange={(e) =>
                  setSelectedChannelId(e.target.value ? Number(e.target.value) : "")
                }
                disabled={isSubmittingBulk || salesChannelsQuery.isLoading}
                className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
              >
                <option value="">Satış kanalı seçiniz…</option>
                {salesChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.ad} ({ch.kod})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">
                Kalem Listesi (Format: STOK_KODU, MIKTAR, BIRIM)
              </span>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  "BLZ-22K-BURMA, 10, ADET\nYUZ-18K-TEKTAS, 5, ADET\nKLY-14K-BAGET, 20, ADET"
                }
                rows={6}
                className="w-full rounded-[6px] border border-input bg-background p-3 text-xs font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isSubmittingBulk}
              />
              <span className="text-[11px] text-muted-foreground">
                Örnek: Her satıra &ldquo;STOK_KODU, ADET, BIRIM&rdquo; şeklinde yazın.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="submit"
                disabled={isSubmittingBulk || !bulkText.trim() || !selectedChannelId}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                <span>
                  {isSubmittingBulk ? "İşleniyor…" : "Toplu Siparişi Oluştur"}
                </span>
              </Button>
            </div>
          </form>

          {bulkResult && (
            <div className="rounded-[8px] border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Toplu Sipariş İşlendi
                  </span>
                </div>
                {bulkResult.order_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigate(`/siparis/${bulkResult.order_id}?tab=orders`);
                      setOrderDetailOpen(true);
                    }}
                    className="text-xs gap-1.5"
                  >
                    <span>Siparişi İncele</span>
                  </Button>
                )}
              </div>

              {bulkResult.accepted?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground">
                    Kabul Edilen Kalemler ({bulkResult.accepted.length})
                  </span>
                  <div className="rounded-[6px] border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Satır</TableHead>
                          <TableHead>Stok Kodu</TableHead>
                          <TableHead className="text-right">Miktar</TableHead>
                          <TableHead>Birim</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkResult.accepted.map((a, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">
                              {a.satir_no}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-medium">
                              {a.sku}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {a.miktar}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.birim || "ADET"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {bulkResult.errors?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-destructive">
                    Hatalı / Bulunamayan Kalemler ({bulkResult.errors.length})
                  </span>
                  <div className="rounded-[6px] border border-destructive/30 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Satır</TableHead>
                          <TableHead>Stok Kodu</TableHead>
                          <TableHead>Hata Açıklaması</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkResult.errors.map((e, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs text-destructive">
                              {e.satir_no}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-medium">
                              {e.sku}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">
                              {e.hata}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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

      {/* Sepet Satırı Silme Onayı */}
      <ConfirmDialog
        open={removeLineConfirm !== null}
        onOpenChange={(open) => !open && setRemoveLineConfirm(null)}
        title="Satırı Sepetten Kaldır"
        description="Seçili ürün kalemi aktif sepetinizden kaldırılacaktır."
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
                Kilitlenmiş Sipariş Kalemleri
              </span>
              {renderDurumBadge(selectedOrder.durum)}
            </div>

            {selectedOrder.lines && selectedOrder.lines.length > 0 ? (
              <div className="rounded-[6px] border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün / Stok Kodu</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead className="text-right">Birim Fiyat</TableHead>
                      <TableHead className="text-right">Satır Tutarı</TableHead>
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
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {formatMoney(
                            l.snapshot_birim_fiyat_vergisiz,
                            l.para_birimi
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                          {formatMoney(
                            l.snapshot_satir_tutari_vergisiz,
                            l.para_birimi
                          )}
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
                        ? "Sepete Aktarılıyor…"
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

      {/* Siparişi Tamamla Modalı */}
      <EntityModal
        open={checkoutModalOpen}
        onOpenChange={setCheckoutModalOpen}
        title="Sipariş Onayı ve Teslimat Özeti"
        description="Teslimat ve fatura adreslerinizi kontrol ederek siparişi kesinleştirin."
        isDirty={Boolean(orderNotes.trim())}
        isSubmitting={isSubmittingCheckout}
        submitLabel="Siparişi Kesinleştir"
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
              <span>Sepetteki Kalem Adedi:</span>
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
