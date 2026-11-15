"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CreditCard,
  FileDown,
  XCircle,
} from "lucide-react";
import { EntityModal, ListPage, RowActions } from "@/components/crud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  opsOrdersService,
  type OpsOrderRow,
} from "@/features/firmalar/services/ops-firmalar";
import { useActionToast } from "@/hooks/use-action-toast";
import { formatDateTime } from "@/lib/format";
import { isPositiveDecimal } from "@/lib/parse-decimal";
import { dashboardKeys } from "@/features/dashboard";
import { finansKeys } from "@/features/finans";
import { siparisKeys } from "@/features/siparis";

const ORDER_STATUS_LABELS: Record<string, string> = {
  ONAY_BEKLIYOR: "Onay Bekliyor",
  OLUSTURULDU: "Oluşturuldu",
  ONAYLANDI: "Onaylandı",
  HAZIRLANIYOR: "Hazırlanıyor",
  HAZIR: "Hazır",
  SEVKIYAT: "Sevkiyatta",
  TAMAMLANDI: "Tamamlandı",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal",
};

function statusLabel(durum: string): string {
  return ORDER_STATUS_LABELS[durum] || durum;
}

function statusBadge(durum: string) {
  switch (durum) {
    case "ONAYLANDI":
    case "HAZIR":
    case "TAMAMLANDI":
      return <Badge variant="success">{statusLabel(durum)}</Badge>;
    case "IPTAL":
    case "REDDEDILDI":
      return <Badge variant="destructive">{statusLabel(durum)}</Badge>;
    case "ONAY_BEKLIYOR":
    case "OLUSTURULDU":
    case "HAZIRLANIYOR":
    case "SEVKIYAT":
      return <Badge variant="warning">{statusLabel(durum)}</Badge>;
    default:
      return <Badge variant="outline">{statusLabel(durum)}</Badge>;
  }
}

export function OpsOnayHavuzu() {
  const toast = useActionToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"havuz" | "tumu">("havuz");
  const [searchQuery, setSearchQuery] = useState("");
  const [durumFilter, setDurumFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [detailOrder, setDetailOrder] = useState<OpsOrderRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OpsOrderRow | null>(null);
  const [neden, setNeden] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [tahsilatTarget, setTahsilatTarget] = useState<OpsOrderRow | null>(null);
  const [tutar, setTutar] = useState("");
  const [yontem, setYontem] = useState("HAVALE");
  const [dekont, setDekont] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [tahsilatError, setTahsilatError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ops-onay-havuzu", mode, durumFilter, searchQuery, page, pageSize],
    queryFn: () =>
      mode === "havuz"
        ? opsOrdersService.onayHavuzu({
            q: searchQuery || undefined,
            page,
            page_size: pageSize,
          })
        : opsOrdersService.listAll({
            durum: durumFilter || undefined,
            q: searchQuery || undefined,
            page,
            page_size: pageSize,
          }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ops-onay-havuzu"] });
    void qc.invalidateQueries({ queryKey: siparisKeys.all });
    void qc.invalidateQueries({ queryKey: finansKeys.all });
    void qc.invalidateQueries({ queryKey: dashboardKeys.all });
  };

  const onayM = useMutation({
    mutationFn: (id: number) => opsOrdersService.onayla(id),
    onSuccess: (updated) => {
      toast.success("Sipariş onaylandı", "Tedarikçi hazırlama emri oluşturuldu.");
      setDetailOrder((prev) => (prev && prev.id === updated.id ? updated : prev));
      invalidate();
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const redM = useMutation({
    mutationFn: ({ id, neden: n }: { id: number; neden: string }) =>
      opsOrdersService.reddet(id, n),
    onSuccess: (updated) => {
      toast.success("Sipariş reddedildi");
      setRejectTarget(null);
      setNeden("");
      setRejectError(null);
      setDetailOrder((prev) => (prev && prev.id === updated.id ? updated : prev));
      invalidate();
    },
    onError: (e: Error) => {
      setRejectError(e.message);
      toast.error("Red işlemi başarısız", e.message);
    },
  });

  const tahsilM = useMutation({
    mutationFn: (id: number) =>
      opsOrdersService.tahsilat(id, {
        tutar,
        yontem,
        dekont_ref: dekont,
        aciklama,
      }),
    onSuccess: () => {
      toast.success("Tahsilat kaydedildi");
      setTahsilatTarget(null);
      setTutar("");
      setDekont("");
      setAciklama("");
      setTahsilatError(null);
      invalidate();
    },
    onError: (e: Error) => {
      setTahsilatError(e.message);
      toast.error("Tahsilat kaydedilemedi", e.message);
    },
  });

  const rows = q.data?.results ?? [];
  const totalCount = q.data?.count ?? rows.length;

  const formatTotals = (o: OpsOrderRow) => {
    if (!o.toplamlar) return "—";
    const entries = Object.entries(o.toplamlar);
    if (entries.length === 0) return "—";
    return entries.map(([pb, v]) => `${v} ${pb}`).join(" · ");
  };

  const formatOrderTitle = (o: OpsOrderRow) =>
    o.alici_firma_ad || "Alıcı Siparişi";

  return (
    <div className="space-y-4">
      <ListPage
        title={mode === "havuz" ? "Sipariş Onay Havuzu" : "Tüm Operasyon Siparişleri"}
        description="Gelen alıcı siparişlerini inceleyin, onaylayarak tedarikçi hazırlama emirlerini başlatın veya tahsilat/belge işlemlerini yürütün."
        searchValue={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setPage(1);
        }}
        searchPlaceholder="Alıcı firma adı, ürün adı veya stok kodu ile ara…"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("havuz");
                  setPage(1);
                }}
                className={`rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === "havuz"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Onay Bekleyenler
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("tumu");
                  setPage(1);
                }}
                className={`rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === "tumu"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tüm Siparişler
              </button>
            </div>

            {mode === "tumu" && (
              <select
                aria-label="Sipariş durum filtresi"
                value={durumFilter}
                onChange={(e) => {
                  setDurumFilter(e.target.value);
                  setPage(1);
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
            )}
          </div>
        }
        loading={q.isLoading}
        error={
          q.isError
            ? q.error instanceof Error
              ? q.error.message
              : "Siparişler alınamadı."
            : null
        }
        onRetry={() => void q.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={
          mode === "havuz"
            ? "Onay bekleyen sipariş yok"
            : "Filtreye uygun sipariş bulunamadı"
        }
        emptyDescription="Alıcılar sipariş verdiğinde bu havuzda onayınıza düşer."
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alıcı Firma</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">Kalem</TableHead>
              <TableHead className="text-right">Toplam Tutar</TableHead>
              <TableHead>Sipariş Tarihi</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const awaitingApproval =
                o.durum === "ONAY_BEKLIYOR" || o.durum === "OLUSTURULDU";
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left text-xs font-medium text-foreground hover:underline"
                      onClick={() => setDetailOrder(o)}
                    >
                      {formatOrderTitle(o)}
                    </button>
                    {o.satirlar && o.satirlar.length > 0 ? (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                        {o.satirlar
                          .map(
                            (l) =>
                              l.urun_ad || l.platform_kodu || `${l.miktar} ${l.birim}`
                          )
                          .join(", ")}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{statusBadge(o.durum)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">
                    {o.satir_sayisi ?? o.satirlar?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs font-medium">
                    {formatTotals(o)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {o.olusturma_tarihi ? formatDateTime(o.olusturma_tarihi) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={`${formatOrderTitle(o)} siparişi`}
                      onView={() => setDetailOrder(o)}
                      extraActions={[
                        ...(awaitingApproval
                          ? [
                              {
                                label: "Onayla ve Hazırlamaya Al",
                                icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
                                confirmTitle: "Siparişi Onayla",
                                confirmDescription: `${formatOrderTitle(o)} siparişi onaylanacak ve ilgili tedarikçiye hazırlama emri iletilecektir.`,
                                onClick: async () => {
                                  await onayM.mutateAsync(o.id);
                                },
                              },
                              {
                                label: "Reddet",
                                icon: <XCircle className="h-3.5 w-3.5" />,
                                variant: "destructive" as const,
                                onClick: () => {
                                  setRejectError(null);
                                  setNeden("");
                                  setRejectTarget(o);
                                },
                              },
                            ]
                          : []),
                        {
                          label: "Tahsilat Kaydet",
                          icon: <CreditCard className="h-3.5 w-3.5" />,
                          onClick: () => {
                            setTahsilatError(null);
                            setTutar("");
                            setDekont("");
                            setAciklama("");
                            setTahsilatTarget(o);
                          },
                        },
                        {
                          label: "Proforma İndir",
                          icon: <FileDown className="h-3.5 w-3.5" />,
                          onClick: () =>
                            opsOrdersService
                              .downloadProforma(o.id)
                              .then(() => toast.success("Proforma belgesi indirildi"))
                              .catch((e: Error) => toast.error("Proforma hatası", e.message)),
                        },
                        {
                          label: "İrsaliye İndir",
                          icon: <FileDown className="h-3.5 w-3.5" />,
                          onClick: () =>
                            opsOrdersService
                              .downloadIrsaliye(o.id)
                              .then(() => toast.success("İrsaliye belgesi indirildi"))
                              .catch((e: Error) => toast.error("İrsaliye hatası", e.message)),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ListPage>

      {/* Sipariş Detay Modalı */}
      <EntityModal
        open={Boolean(detailOrder)}
        onOpenChange={(open) => !open && setDetailOrder(null)}
        title={detailOrder ? `Sipariş Detayı · ${formatOrderTitle(detailOrder)}` : "Sipariş Detayı"}
        description={
          detailOrder
            ? `Durum: ${statusLabel(detailOrder.durum)} · Toplam: ${formatTotals(detailOrder)}`
            : undefined
        }
        size="lg"
        footerExtra={
          detailOrder ? (
            <div className="flex flex-wrap items-center gap-2 mr-auto">
              {(detailOrder.durum === "ONAY_BEKLIYOR" ||
                detailOrder.durum === "OLUSTURULDU") && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={onayM.isPending}
                    onClick={() => onayM.mutate(detailOrder.id)}
                  >
                    Onayla
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setRejectError(null);
                      setNeden("");
                      setRejectTarget(detailOrder);
                    }}
                  >
                    Reddet
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTahsilatError(null);
                  setTutar("");
                  setDekont("");
                  setAciklama("");
                  setTahsilatTarget(detailOrder);
                }}
              >
                Tahsilat Kaydet
              </Button>
            </div>
          ) : null
        }
      >
        {detailOrder ? (
          <div className="space-y-4 text-xs">
            {detailOrder.satirlar && detailOrder.satirlar.length > 0 && (
              <div className="rounded-[6px] border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün / Stok Kodu</TableHead>
                      <TableHead>Teslim Modeli</TableHead>
                      <TableHead className="text-right">Miktar</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailOrder.satirlar.map((ln) => (
                      <TableRow key={ln.id}>
                        <TableCell className="font-medium">
                          <div>{ln.urun_ad || ln.platform_kodu || "Ürün Kalemi"}</div>
                          {ln.platform_kodu ? (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {ln.platform_kodu}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {ln.teslim_modeli === "DOGRUDAN"
                            ? "Doğrudan Teslim"
                            : "Platform Kalite Kontrol"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {ln.miktar} {ln.birim}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {ln.satir_tutari} {ln.para_birimi}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {detailOrder.hazirlama_emirleri &&
              detailOrder.hazirlama_emirleri.length > 0 && (
                <div className="rounded-[6px] border border-border bg-muted/30 p-3 space-y-2">
                  <p className="font-medium text-foreground">
                    Tedarikçi Hazırlama Emirleri ({detailOrder.hazirlama_emirleri.length})
                  </p>
                  <ul className="space-y-1.5">
                    {detailOrder.hazirlama_emirleri.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-background px-2.5 py-1.5 border border-border/60"
                      >
                        <span className="font-medium">
                          {e.tedarikci_ad || "Tedarikçi Firma"}
                        </span>
                        <span className="text-muted-foreground">
                          {e.teslim_modeli === "DOGRUDAN"
                            ? "Doğrudan"
                            : "Platform Kontrol"}{" "}
                          · <strong className="text-foreground">{e.durum}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void opsOrdersService
                    .downloadProforma(detailOrder.id)
                    .then(() => toast.success("Proforma indirildi"))
                    .catch((e: Error) => toast.error("Proforma", e.message))
                }
              >
                Proforma Belgesi İndir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void opsOrdersService
                    .downloadIrsaliye(detailOrder.id)
                    .then(() => toast.success("İrsaliye indirildi"))
                    .catch((e: Error) => toast.error("İrsaliye", e.message))
                }
              >
                Sevk İrsaliyesi İndir
              </Button>
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Sipariş Red Modalı */}
      <EntityModal
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="Siparişi Reddet"
        description={
          rejectTarget
            ? `${formatOrderTitle(rejectTarget)} siparişini reddetme nedenini yazın.`
            : undefined
        }
        isDirty={Boolean(neden.trim())}
        isSubmitting={redM.isPending}
        submitLabel="Siparişi Reddet"
        error={rejectError}
        onSubmit={(e) => {
          e.preventDefault();
          if (!rejectTarget) return;
          if (!neden.trim()) {
            setRejectError("Lütfen red nedenini belirtin.");
            return;
          }
          redM.mutate({ id: rejectTarget.id, neden: neden.trim() });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Red Nedeni
          </label>
          <Input
            value={neden}
            onChange={(e) => setNeden(e.target.value)}
            placeholder="Örn: Stok teyidi sağlanamadı veya limit aşımı"
          />
        </div>
      </EntityModal>

      {/* Elle Tahsilat Modalı */}
      <EntityModal
        open={Boolean(tahsilatTarget)}
        onOpenChange={(open) => !open && setTahsilatTarget(null)}
        title="Sipariş Tahsilatı Kaydet"
        description={
          tahsilatTarget
            ? `${formatOrderTitle(tahsilatTarget)} için tahsilat kaydı oluşturun.`
            : undefined
        }
        isDirty={Boolean(tutar.trim() || dekont.trim() || aciklama.trim())}
        isSubmitting={tahsilM.isPending}
        submitLabel="Tahsilatı Kaydet"
        error={tahsilatError}
        onSubmit={(e) => {
          e.preventDefault();
          if (!tahsilatTarget) return;
          if (!isPositiveDecimal(tutar)) {
            setTahsilatError("Geçerli ve sıfırdan büyük bir tutar girin.");
            return;
          }
          tahsilM.mutate(tahsilatTarget.id);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Tutar</label>
            <Input
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Ödeme Yöntemi
            </label>
            <select
              value={yontem}
              onChange={(e) => setYontem(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value="HAVALE">Havale / EFT</option>
              <option value="CEK">Çek</option>
              <option value="NAKIT">Nakit</option>
              <option value="MAHSUP">Mahsup</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Dekont / Referans Numarası
          </label>
          <Input
            value={dekont}
            onChange={(e) => setDekont(e.target.value)}
            placeholder="Banka dekont no"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Açıklama (İsteğe Bağlı)
          </label>
          <Input
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Tahsilat notu"
          />
        </div>
      </EntityModal>
    </div>
  );
}
