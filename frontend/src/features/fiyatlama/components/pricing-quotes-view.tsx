"use client";

import React, { useMemo, useState } from "react";
import {
  useCreatePriceLockMutation,
  usePriceLocksListQuery,
  useQuotesListQuery,
} from "../hooks";
import { fiyatlamaService } from "../services";
import type { PriceLock, PriceQuote } from "../types";
import { useAuth } from "@/features/auth";
import { OpsMarjPolitikasiCard } from "@/features/piyasa";
import { urunlerService, type BuyerCatalogVariant } from "@/features/urunler";
import { tanimlarService } from "@/features/tanimlar";
import { formatMoney, formatDateTime } from "@/lib/format";
import {
  QuoteCountdown,
  isQuoteExpired,
} from "@/components/commerce/quote-countdown";
import {
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Lock, RefreshCw, Tag } from "lucide-react";
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { BlindPoolCallout } from "./blind-pool-callout";
import { BuyerNetPriceCard } from "./buyer-net-price-card";

function lockBadgeVariant(
  durum: string,
  gecerli?: boolean
): "success" | "destructive" | "warning" | "outline" {
  if (gecerli === false || /SURESI_DOLDU|IPTAL|EXPIRED/i.test(durum)) {
    return "destructive";
  }
  if (/AKTIF|ACTIVE/i.test(durum)) return "success";
  if (/KULLANILDI|USED/i.test(durum)) return "warning";
  return "outline";
}

export function PricingQuotesView() {
  const { user } = useAuth();
  const canOps = Boolean(user?.capabilities?.can_view_ops && user?.firma?.platform_mu);
  const canBuyerWrite = Boolean(user?.firma?.alici_mi && !canOps);
  const actionToast = useActionToast();

  const [activeTab, setActiveTab] = useState<"quotes" | "locks">("quotes");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quotePage, setQuotePage] = useState(1);
  const [quotePageSize, setQuotePageSize] = useState(20);

  const [lockSearch, setLockSearch] = useState("");
  const [lockDurumFilter, setLockDurumFilter] = useState("");
  const [lockPage, setLockPage] = useState(1);
  const [lockPageSize, setLockPageSize] = useState(20);

  const [lockingId, setLockingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // Yeni Fiyat Teklifi (Quote) Al modal state
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productVariants, setProductVariants] = useState<BuyerCatalogVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<"TRY" | "USD" | "EUR">("TRY");
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [createQuoteError, setCreateQuoteError] = useState<string | null>(null);

  const quoteParams = useMemo(
    () => ({
      page: String(quotePage),
      page_size: String(quotePageSize),
      ...(quoteSearch.trim() ? { q: quoteSearch.trim() } : {}),
    }),
    [quotePage, quotePageSize, quoteSearch]
  );

  const lockParams = useMemo(
    () => ({
      page: String(lockPage),
      page_size: String(lockPageSize),
      ...(lockSearch.trim() ? { q: lockSearch.trim() } : {}),
      ...(lockDurumFilter ? { durum: lockDurumFilter } : {}),
    }),
    [lockPage, lockPageSize, lockSearch, lockDurumFilter]
  );

  const quotesQ = useQuotesListQuery(quoteParams);
  const locksQ = usePriceLocksListQuery(lockParams);
  const createLockMut = useCreatePriceLockMutation();

  const quotes: PriceQuote[] = quotesQ.data?.results ?? [];
  const locks: PriceLock[] = locksQ.data?.results ?? [];

  const handleProductChange = async (pid: number | null) => {
    setSelectedProductId(pid);
    setSelectedVariantId("");
    setProductVariants([]);
    if (!pid) return;
    try {
      const detail = await urunlerService.getProductDetail(pid);
      const vars = detail.varyantlar ?? [];
      setProductVariants(vars);
      if (vars.length > 0) setSelectedVariantId(String(vars[0].id));
    } catch (err) {
      actionToast.error("Ürün seçenekleri alınamadı", err);
    }
  };

  const handleCreateQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateQuoteError(null);
    const vid = Number(selectedVariantId);
    if (!vid || !selectedChannelId) {
      setCreateQuoteError("Lütfen ürün, varyant ve satış kanalını seçin.");
      return;
    }
    setCreatingQuote(true);
    try {
      await fiyatlamaService.createQuote({
        varyant_id: vid,
        satis_kanali_id: selectedChannelId,
        para_birimi: currency,
      });
      actionToast.success("Fiyat teklifi oluşturuldu");
      setQuoteModalOpen(false);
      await quotesQ.refetch();
    } catch (err) {
      const msg = mapCommerceError(err, "Fiyat teklifi alınamadı.");
      setCreateQuoteError(msg);
      actionToast.error("Fiyat teklifi alınamadı", err);
    } finally {
      setCreatingQuote(false);
    }
  };

  const handleRefreshQuote = async (quoteId: number) => {
    setRefreshingId(quoteId);
    try {
      const quote = await fiyatlamaService.getQuote(quoteId);
      await quotesQ.refetch();
      if (isQuoteExpired(quote.expires_at)) {
        actionToast.info("Teklif süresi dolmuş", "Katalogdan yeni fiyat alabilirsiniz.");
      } else {
        actionToast.success("Fiyat teklifi güncellendi");
      }
    } catch (err) {
      actionToast.error("Fiyat teklifi yenilenemedi", err);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleLock = async (q: PriceQuote) => {
    if (isQuoteExpired(q.expires_at)) {
      actionToast.error("Teklif süresi dolmuş", "Süresi dolan fiyat kilitlenemez.");
      return;
    }
    setLockingId(q.id);
    try {
      await createLockMut.mutateAsync(q.id);
      actionToast.success("Fiyat kilitlendi");
      await Promise.all([quotesQ.refetch(), locksQ.refetch()]);
    } catch (err) {
      actionToast.error("Fiyat kilitlenemedi", err);
    } finally {
      setLockingId(null);
    }
  };

  const tabSwitcher = (
    <div className="flex items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
      <Button
        type="button"
        variant={activeTab === "quotes" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("quotes")}
      >
        <Tag className="h-3.5 w-3.5" />
        Fiyat Teklifleri
      </Button>
      <Button
        type="button"
        variant={activeTab === "locks" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("locks")}
      >
        <Lock className="h-3.5 w-3.5" />
        Fiyat Kilitleri
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {canOps ? <OpsMarjPolitikasiCard /> : null}
      <BlindPoolCallout role="buyer" />

      {quotes.length > 0 && activeTab === "quotes" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.slice(0, 3).map((q) => (
            <BuyerNetPriceCard key={`net-${q.id}`} quote={q} />
          ))}
        </div>
      ) : null}

      {activeTab === "quotes" ? (
        <ListPage
          title="Fiyatlama & Fiyat Teklifleri"
          description="Alıcıya sunulan güncel fiyat tekliflerini inceleyin ve süresi dolmadan fiyatı kilitleyin."
          createLabel={canBuyerWrite ? "Yeni Fiyat Al" : undefined}
          onCreate={
            canBuyerWrite
              ? () => {
                  setCreateQuoteError(null);
                  setSelectedProductId(null);
                  setProductVariants([]);
                  setSelectedVariantId("");
                  setSelectedChannelId(null);
                  setQuoteModalOpen(true);
                }
              : undefined
          }
          extraActions={tabSwitcher}
          searchValue={quoteSearch}
          onSearchChange={(val) => {
            setQuoteSearch(val);
            setQuotePage(1);
          }}
          searchPlaceholder="Ürün adı, stok kodu veya kanal ara…"
          loading={quotesQ.isLoading}
          error={
            quotesQ.isError
              ? mapCommerceError(quotesQ.error, "Fiyat teklifleri alınamadı.")
              : null
          }
          onRetry={() => void quotesQ.refetch()}
          isEmpty={quotes.length === 0}
          emptyTitle="Henüz fiyat teklifi bulunmuyor"
          emptyDescription="Katalogdan ürün seçerek veya Yeni Fiyat Al butonunu kullanarak güncel net fiyat alabilirsiniz."
          page={quotePage}
          pageSize={quotePageSize}
          totalCount={quotesQ.data?.count ?? quotes.length}
          onPageChange={setQuotePage}
          onPageSizeChange={(sz) => {
            setQuotePageSize(sz);
            setQuotePage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün & Varyant</TableHead>
                <TableHead className="text-right">Net Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Geçerlilik Süresi</TableHead>
                <TableHead className="w-[140px] text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
                const expired = isQuoteExpired(q.expires_at);
                return (
                  <TableRow key={q.id} className={expired ? "opacity-75" : undefined}>
                    <TableCell className="text-xs">
                      <div className="font-medium text-foreground">
                        {q.urun || "Katalog Ürünü"}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {q.varyant_sku || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-medium">
                      {formatMoney(q.toplam_vergisiz || q.birim_fiyat, q.para_birimi)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={expired ? "destructive" : "success"}
                        className="text-[10px]"
                      >
                        {expired ? "Süresi Doldu" : "Geçerli"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <QuoteCountdown expiresAt={q.expires_at} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel={q.urun || q.varyant_sku || "Fiyat Teklifi"}
                        extraActions={[
                          {
                            label:
                              refreshingId === q.id ? "Yenileniyor…" : "Süreyi Kontrol Et",
                            icon: <RefreshCw className="h-3.5 w-3.5" />,
                            onClick: () => void handleRefreshQuote(q.id),
                            disabled: refreshingId === q.id,
                          },
                          ...(canBuyerWrite
                            ? [
                                {
                                  label:
                                    lockingId === q.id
                                      ? "Kilitleniyor…"
                                      : "Fiyatı Kilitle",
                                  icon: <Lock className="h-3.5 w-3.5" />,
                                  onClick: () => void handleLock(q),
                                  disabled: lockingId === q.id || expired,
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
          title="Fiyat Kilitleri"
          description="Sipariş öncesi sabitlenen fiyat kilitlerinin kalan sürelerini takip edin."
          extraActions={tabSwitcher}
          searchValue={lockSearch}
          onSearchChange={(val) => {
            setLockSearch(val);
            setLockPage(1);
          }}
          searchPlaceholder="Ürün veya stok kodu ile ara…"
          filters={
            <select
              value={lockDurumFilter}
              onChange={(e) => {
                setLockDurumFilter(e.target.value);
                setLockPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
              aria-label="Fiyat kilidi durum filtresi"
            >
              <option value="">Tüm Durumlar</option>
              <option value="AKTIF">Aktif</option>
              <option value="SURESI_DOLDU">Süresi Doldu</option>
            </select>
          }
          loading={locksQ.isLoading}
          error={
            locksQ.isError
              ? mapCommerceError(locksQ.error, "Fiyat kilitleri alınamadı.")
              : null
          }
          onRetry={() => void locksQ.refetch()}
          isEmpty={locks.length === 0}
          emptyTitle="Henüz fiyat kilidi yok"
          emptyDescription="Geçerli bir fiyat teklifini kilitlediğinizde burada listelenir."
          page={lockPage}
          pageSize={lockPageSize}
          totalCount={locksQ.data?.count ?? locks.length}
          onPageChange={setLockPage}
          onPageSizeChange={(sz) => {
            setLockPageSize(sz);
            setLockPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün & Varyant</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Kilitli Tutar</TableHead>
                <TableHead>Kalan Süre / Bitiş</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locks.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">
                    <div className="font-medium text-foreground">
                      {l.urun_ad || "Katalog Ürünü"}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {l.varyant_sku || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={lockBadgeVariant(l.durum, l.gecerli)}
                      className="text-[10px]"
                    >
                      {l.gecerli === false ? "Süresi Doldu" : l.durum}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">
                    {l.kilit_fiyati
                      ? formatMoney(l.kilit_fiyati, l.para_birimi)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <QuoteCountdown expiresAt={l.expires_at} />
                      <span className="text-muted-foreground">
                        {l.expires_at ? formatDateTime(l.expires_at) : "—"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* Yeni Fiyat Teklifi Al Modalı */}
      <EntityModal
        open={quoteModalOpen}
        onOpenChange={setQuoteModalOpen}
        title="Yeni Fiyat Teklifi Al"
        description="Katalogdan ürün ve satış kanalı seçerek anlık net fiyat teklifi hesaplayın."
        isDirty={Boolean(selectedProductId || selectedChannelId)}
        isSubmitting={creatingQuote}
        submitLabel="Fiyat Hesapla"
        error={createQuoteError}
        onSubmit={handleCreateQuoteSubmit}
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ürün</Label>
            <RelationSelect
              value={selectedProductId}
              onChange={(val) => void handleProductChange(val ? Number(val) : null)}
              placeholder="Ürün seçin…"
              searchPlaceholder="Ürün adı veya kodu ara…"
              loadOptions={async (q) => {
                const page = await urunlerService.getCatalog({
                  page_size: "30",
                  ...(q ? { q } : {}),
                });
                return (page.results ?? []).map((u) => ({
                  value: u.id,
                  label: u.ad,
                  sublabel: `${u.platform_kodu || ""} · ${u.kategori || ""}`.trim(),
                }));
              }}
            />
          </div>

          {productVariants.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="quote-variant-select">Varyant</Label>
              <select
                id="quote-variant-select"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
              >
                {productVariants.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.sku} {v.gram ? `· ${v.gram}g` : ""} {v.renk ? `· ${v.renk}` : ""}{" "}
                    {v.beden ? `· ${v.beden}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Satış Kanalı</Label>
              <RelationSelect
                value={selectedChannelId}
                onChange={(val) => setSelectedChannelId(val ? Number(val) : null)}
                placeholder="Kanal seçin…"
                searchPlaceholder="Kanal ara…"
                loadOptions={async (q) => {
                  const list = await tanimlarService.getSalesChannels();
                  const filtered = q
                    ? list.filter(
                        (k) =>
                          k.ad.toLowerCase().includes(q.toLowerCase()) ||
                          k.kod.toLowerCase().includes(q.toLowerCase())
                      )
                    : list;
                  return filtered.map((k) => ({
                    value: k.id,
                    label: k.ad,
                    sublabel: k.kod,
                  }));
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quote-currency">Para Birimi</Label>
              <select
                id="quote-currency"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                value={currency}
                onChange={(e) =>
                  setCurrency((e.target.value as "TRY" | "USD" | "EUR") || "TRY")
                }
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
