"use client";

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/features/auth";
import { opsOrdersService } from "@/features/firmalar/services/ops-firmalar";
import { siparisService } from "@/features/siparis";
import {
  useDocuments,
  useSubmitPodDocumentMutation,
  useBelgeAyarlariQuery,
  useUpdateBelgeAyarlariMutation,
} from "../hooks";
import { belgelerService } from "../services";
import { podAttachSchema, type PodAttachInput } from "../schemas";
import type { BelgeAyarlari, DocumentItem } from "../types";
import { formatDateTime } from "@/lib/format";
import { unwrapResults } from "@/lib/api/client";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Download,
  RefreshCw,
  FileText,
  Eye,
  Plus,
  CheckCircle2,
  File,
  FileImage,
  ExternalLink,
  ArrowRight,
  Settings2,
} from "lucide-react";

const PAGE_SIZE = 15;

const CATEGORIES = [
  { id: "all", label: "Tümü" },
  { id: "PROFORMA", label: "Proforma" },
  { id: "IRSALIYE", label: "İrsaliye" },
  { id: "TEDARIKCI_IRSALIYE", label: "Tedarikçi İrsaliyesi" },
  { id: "TAS_SERTIFIKA", label: "Taş Sertifika" },
  { id: "SEVKIYAT", label: "Sevkiyat" },
  { id: "POD", label: "Teslimat Kanıtı" },
  { id: "SIPARIS", label: "Sipariş" },
  { id: "LEDGER", label: "Cari Hareket" },
  { id: "IADE", label: "İade" },
  { id: "KALITE", label: "Kalite" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  belge: "Resmi Belge (PDF)",
  shipment: "Alıcı Sevkiyatı",
  ops_shipment: "Operasyon Sevkiyatı",
  order: "Sipariş",
  ledger: "Cari Hareket",
  return: "İade",
  inspection: "Kalite Kontrol",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  PROFORMA: "Proforma",
  IRSALIYE: "İrsaliye",
  TEDARIKCI_IRSALIYE: "Tedarikçi İrsaliyesi",
  TAS_SERTIFIKA: "Taş Sertifika",
  SEVKIYAT: "Sevkiyat",
  POD: "Teslimat Kanıtı",
  SIPARIS: "Sipariş",
  LEDGER: "Cari Hareket",
  IADE: "İade",
  KALITE: "Kalite",
  DIGER: "Diğer",
};

const META_LABELS: Record<string, string> = {
  revizyon: "Revizyon",
  byte_size: "Dosya Boyutu",
  belge_turu: "Belge Türü",
  tasiyici: "Taşıyıcı",
  takip_no: "Takip Numarası",
  teslim_alan: "Teslim Alan",
  referans: "Referans",
  line_count: "Satır Sayısı",
  tutar: "Tutar",
  para_birimi: "Para Birimi",
  referans_tip: "İşlem Kaynağı",
  sebep: "İade Sebebi",
  notlar: "Notlar",
};

function typeIcon(format?: string) {
  if (format === "IMAGE") return FileImage;
  if (format === "PDF" || format === "URL") return FileText;
  return File;
}

function statusVariant(
  durum?: string
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (!durum) return "outline";
  const d = durum.toUpperCase();
  if (
    ["TESLIM_EDILDI", "TAMAMLANDI", "ONAYLANDI", "KAYITLI", "PASS", "GECTI"].some(
      (x) => d.includes(x)
    )
  ) {
    return "success";
  }
  if (["BEKLEMEDE", "YOLDA", "HAZIR", "OLCUMDE", "TASLAK"].some((x) => d.includes(x))) {
    return "warning";
  }
  if (["IPTAL", "RED", "FAIL", "REDDEDILDI"].some((x) => d.includes(x))) {
    return "destructive";
  }
  return "secondary";
}

export function DocumentsView() {
  const { user } = useAuth();
  const isOps = Boolean(user?.capabilities?.can_view_ops);
  const canPod = Boolean(
    user?.capabilities?.can_manage_shipment || user?.capabilities?.can_view_ops
  );

  const [q, setQ] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrderLabel, setSelectedOrderLabel] = useState<string>("");
  const [tip, setTip] = useState("all");
  const [durum, setDurum] = useState("all");
  const [kaynak, setKaynak] = useState("all");
  const [page, setPage] = useState(1);

  const actionToast = useActionToast();
  const { documents, errors, loading, error, refresh } = useDocuments({
    order_id: selectedOrderId ? String(selectedOrderId) : undefined,
    q: q.trim() || undefined,
  });
  const podMut = useSubmitPodDocumentMutation();
  const belgeAyarlariQ = useBelgeAyarlariQuery(isOps);
  const updateAyarlarMut = useUpdateBelgeAyarlariMutation();

  const [detail, setDetail] = useState<DocumentItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [ayarOpen, setAyarOpen] = useState(false);
  const [ayarDirty, setAyarDirty] = useState(false);
  const [ayarDraft, setAyarDraft] = useState<BelgeAyarlari>({
    proforma_disclaimer: "",
    irsaliye_baslik: "",
    irsaliye_alt_metin: "",
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const {
    register: registerPod,
    handleSubmit: handlePodSubmit,
    watch: watchPod,
    setValue: setPodValue,
    reset: resetPod,
    formState: { errors: podErrors, isSubmitting: isPodSubmitting, isDirty: podDirty },
  } = useForm<PodAttachInput>({
    resolver: zodResolver(podAttachSchema),
    defaultValues: {
      shipment_id: 0,
      teslim_alan: "",
      notlar: "",
      belgeler_ref: "",
    },
  });

  const podShipmentId = watchPod("shipment_id");

  const loadOrderFilterOptions = async (search: string): Promise<RelationOption[]> => {
    if (isOps) {
      const res = await opsOrdersService.listAll({
        q: search.trim() || undefined,
        page_size: 25,
      });
      return (res.results ?? []).map((o) => ({
        value: o.id,
        label: o.alici_firma_ad
          ? `${o.alici_firma_ad} · ${o.durum}`
          : `Sipariş · ${o.durum}`,
        subtitle: [
          o.satir_sayisi != null ? `${o.satir_sayisi} kalem` : null,
          o.olusturma_tarihi ? formatDateTime(o.olusturma_tarihi) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    }
    const res = await siparisService.getOrders({
      ...(search.trim() ? { q: search.trim() } : {}),
      page_size: "25",
    });
    return unwrapResults(res).map((o) => ({
      value: o.id,
      label: o.alici_firma_ad
        ? `${o.alici_firma_ad} · ${o.durum}`
        : `Sipariş (${o.durum})`,
      subtitle: `${o.line_count} kalem · ${formatDateTime(o.olusturma_tarihi)}`,
    }));
  };

  const loadPodShipmentOptions = async (search: string): Promise<RelationOption[]> => {
    const pageData = await belgelerService.listOpsShipments();
    const rows = unwrapResults(pageData);
    const term = search.trim().toLowerCase();
    return rows
      .filter((s) => {
        if (!term) return true;
        const hay = `${s.tasiyici || ""} ${s.takip_no || ""} ${s.durum || ""}`.toLowerCase();
        return hay.includes(term);
      })
      .map((s) => ({
        value: s.id,
        label: s.tasiyici
          ? `${s.tasiyici}${s.takip_no ? ` · ${s.takip_no}` : ""}`
          : s.takip_no
            ? `Sevkiyat · ${s.takip_no}`
            : `Sevkiyat (${s.durum})`,
        subtitle: s.durum,
      }));
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (tip !== "all" && d.belge_tipi !== tip) return false;
      if (durum !== "all" && (d.durum || "") !== durum) return false;
      if (kaynak !== "all" && d.referans_tipi !== kaynak) return false;
      if (selectedOrderId != null && d.related_order_id !== selectedOrderId) return false;
      if (!qq) return true;
      const blob = `${d.ad} ${d.belge_no || ""} ${d.firma_ad || ""} ${d.raw_ref || ""} ${d.belge_tipi}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [documents, q, tip, durum, kaynak, selectedOrderId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const stats = useMemo(() => {
    const pending = documents.filter((d) =>
      /BEKLEMEDE|TASLAK|HAZIR|YOLDA|OLCUMDE/i.test(d.durum || "")
    ).length;
    const approved = documents.filter((d) =>
      /ONAYLANDI|TESLIM|TAMAMLANDI|KAYITLI|PASS|GECTI/i.test(d.durum || "")
    ).length;
    const rejected = documents.filter((d) =>
      /RED|IPTAL|FAIL/i.test(d.durum || "")
    ).length;
    const downloadable = documents.filter((d) => Boolean(d.dosya_url)).length;
    return {
      total: documents.length,
      pending,
      approved,
      rejected,
      downloadable,
    };
  }, [documents]);

  const durumOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) if (d.durum) set.add(d.durum);
    return [...set].sort();
  }, [documents]);

  const clearFilters = () => {
    setQ("");
    setSelectedOrderId(null);
    setSelectedOrderLabel("");
    setTip("all");
    setDurum("all");
    setKaynak("all");
    setPage(1);
  };

  const openPodModal = () => {
    resetPod({
      shipment_id: 0,
      teslim_alan: "",
      notlar: "",
      belgeler_ref: "",
    });
    setActionError(null);
    setPodOpen(true);
  };

  const onPodSave = async (data: PodAttachInput) => {
    setActionError(null);
    try {
      await podMut.mutateAsync({
        shipment_id: data.shipment_id,
        teslim_alan: data.teslim_alan,
        notlar: data.notlar,
        belgeler_ref: data.belgeler_ref,
      });
      setPodOpen(false);
      resetPod();
      setSuccessMsg("Teslimat kanıtı kaydedildi.");
      actionToast.success("Teslimat kanıtı kaydedildi");
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Teslimat kanıtı kaydedilemedi."
      );
      actionToast.error("Teslimat kanıtı kaydedilemedi", err);
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    if (!doc.dosya_url) return;
    setActionError(null);
    setDownloading(true);
    try {
      const name = `${doc.belge_no || doc.ad || "belge"}`;
      await belgelerService.downloadUrl(doc.dosya_url, name);
      setSuccessMsg("Belge indirme başlatıldı.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "İndirme başarısız.");
    } finally {
      setDownloading(false);
    }
  };

  const previewable =
    detail?.dosya_url &&
    (detail.format === "PDF" ||
      detail.format === "IMAGE" ||
      detail.format === "URL");

  return (
    <div className="flex flex-col gap-5 max-w-[1180px]">
      <ListPage
        title="Belgeler"
        description="Proforma fatura, irsaliye, sertifika, sevkiyat ve teslimat kanıtı kayıtlarını tek merkezden görüntüleyin ve indirin."
        createLabel={canPod ? "Teslimat Kanıtı Ekle" : undefined}
        onCreate={canPod ? openPodModal : undefined}
        extraActions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Yenile
            </Button>
            {isOps ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (belgeAyarlariQ.data) {
                    setAyarDraft({
                      proforma_disclaimer: belgeAyarlariQ.data.proforma_disclaimer,
                      irsaliye_baslik: belgeAyarlariQ.data.irsaliye_baslik,
                      irsaliye_alt_metin: belgeAyarlariQ.data.irsaliye_alt_metin,
                    });
                  }
                  setAyarDirty(false);
                  setAyarOpen(true);
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Belge Ayarları
              </Button>
            ) : null}
          </div>
        }
        searchValue={q}
        onSearchChange={(val) => {
          setQ(val);
          setPage(1);
        }}
        searchPlaceholder="Belge başlığı, firma veya takip bilgisi ara…"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <RelationSelect
                value={selectedOrderId}
                selectedLabel={selectedOrderLabel}
                onChange={(val, opt) => {
                  setSelectedOrderId(val ? Number(val) : null);
                  setSelectedOrderLabel(opt?.label || "");
                  setPage(1);
                }}
                loadOptions={loadOrderFilterOptions}
                placeholder="Siparişe göre filtrele…"
                searchPlaceholder="Firma veya durum ile sipariş ara…"
                emptyText="Sipariş bulunamadı"
                clearable
              />
            </div>
            <select
              value={durum}
              onChange={(e) => {
                setDurum(e.target.value);
                setPage(1);
              }}
              aria-label="Durum filtresi"
              className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
            >
              <option value="all">Tüm durumlar</option>
              {durumOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={kaynak}
              onChange={(e) => {
                setKaynak(e.target.value);
                setPage(1);
              }}
              aria-label="Kaynak filtresi"
              className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
            >
              <option value="all">Tüm kaynaklar</option>
              {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {(q || selectedOrderId || tip !== "all" || durum !== "all" || kaynak !== "all") && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
                Temizle
              </Button>
            )}
          </div>
        }
        loading={loading}
        error={actionError || error}
        onRetry={() => {
          setActionError(null);
          void refresh();
        }}
        isEmpty={!loading && filtered.length === 0}
        emptyTitle={documents.length === 0 ? "Henüz belge kaydı yok" : "Arama sonucu bulunamadı"}
        emptyDescription="Filtreleri temizleyebilir veya yeni teslimat kanıtı ekleyebilirsiniz."
        page={safePage}
        pageSize={PAGE_SIZE}
        totalCount={filtered.length}
        onPageChange={setPage}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Toplam kayıt" value={String(stats.total)} />
            <Stat label="Süreçte" value={String(stats.pending)} />
            <Stat label="Tamamlanan" value={String(stats.approved)} />
            <Stat label="Red / iptal" value={String(stats.rejected)} />
            <Stat label="İndirilebilir" value={String(stats.downloadable)} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setTip(c.id);
                  setPage(1);
                }}
                className={`rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  tip === c.id
                    ? "border-border bg-secondary text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
                {c.id !== "all"
                  ? ` (${documents.filter((d) => d.belge_tipi === c.id).length})`
                  : ` (${documents.length})`}
              </button>
            ))}
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 rounded-[6px] border border-border bg-muted/60 p-3 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
              <button
                type="button"
                className="ml-auto text-muted-foreground"
                onClick={() => setSuccessMsg(null)}
              >
                Kapat
              </button>
            </div>
          )}

          {Object.keys(errors).length > 0 && documents.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Bazı belge kaynakları şu anda yüklenemedi.
            </p>
          ) : null}

          <div className="rounded-[8px] border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Belge / Başlık</TableHead>
                  <TableHead>Referans / Özet</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((d) => {
                  const Icon = typeIcon(d.format);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs text-foreground">{d.ad}</div>
                        {d.firma_ad ? (
                          <div className="text-[11px] text-muted-foreground">{d.firma_ad}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.belge_no || d.raw_ref || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {DOC_TYPE_LABELS[d.belge_tipi] || d.belge_tipi}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[d.referans_tipi] || d.referans_tipi}
                      </TableCell>
                      <TableCell>
                        {d.durum ? (
                          <Badge
                            variant={statusVariant(d.durum)}
                            className="font-mono text-[10px]"
                          >
                            {d.durum}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {d.format || "—"}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {d.olusturma_tarihi ? formatDateTime(d.olusturma_tarihi) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          itemLabel={d.ad}
                          onView={() => setDetail(d)}
                          extraActions={
                            d.dosya_url
                              ? [
                                  {
                                    label: "İndir",
                                    icon: <Download className="h-3.5 w-3.5" />,
                                    disabled: downloading,
                                    onClick: () => handleDownload(d),
                                  },
                                ]
                              : []
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </ListPage>

      {/* Belge Detay Modalı */}
      <EntityModal
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.ad || "Belge Detayı"}
        description={
          detail
            ? `${DOC_TYPE_LABELS[detail.belge_tipi] || detail.belge_tipi} · ${SOURCE_LABELS[detail.referans_tipi] || detail.referans_tipi}`
            : undefined
        }
        size="md"
        hideFooter
      >
        {detail ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Info
                label="Tür"
                value={DOC_TYPE_LABELS[detail.belge_tipi] || detail.belge_tipi}
              />
              <Info label="Durum" value={detail.durum || "—"} />
              <Info label="Format" value={detail.format || "—"} />
              <Info
                label="Tarih"
                value={
                  detail.olusturma_tarihi
                    ? formatDateTime(detail.olusturma_tarihi)
                    : "—"
                }
              />
              {detail.firma_ad ? <Info label="Firma" value={detail.firma_ad} /> : null}
              <Info label="Referans" value={detail.raw_ref || detail.belge_no || "—"} />
            </div>
            {detail.dosya_url ? (
              <div className="rounded-[6px] border border-border px-3 py-2 break-all">
                <div className="text-[10px] text-muted-foreground">Belge Bağlantısı</div>
                <a
                  href={detail.dosya_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground hover:underline inline-flex items-center gap-1"
                >
                  Belgeyi yeni sekmede aç
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : null}
            {detail.meta && Object.keys(detail.meta).length > 0 ? (
              <div className="rounded-[6px] border border-border px-3 py-2 space-y-1">
                <div className="text-[10px] text-muted-foreground">Ek Bilgiler</div>
                {Object.entries(detail.meta).map(([k, v]) =>
                  v == null || v === "" ? null : (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{META_LABELS[k] || k}</span>
                      <span className="font-medium text-right">{String(v)}</span>
                    </div>
                  )
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {detail.dosya_url ? (
                <>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={downloading}
                    onClick={() => void handleDownload(detail)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    İndir
                  </Button>
                  {previewable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Önizle
                    </Button>
                  ) : null}
                </>
              ) : null}
              {detail.href ? (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild>
                  <Link to={detail.href}>
                    İlgili Ekrana Git
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Belge Önizleme Modalı */}
      <EntityModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Belge Önizleme"
        description={detail?.ad}
        size="xl"
        hideFooter
      >
        {detail?.dosya_url ? (
          detail.format === "IMAGE" ? (
            <img
              src={detail.dosya_url}
              alt={detail.ad}
              className="max-h-[70vh] w-full object-contain rounded-[6px] border border-border"
            />
          ) : (
            <iframe
              title={detail.ad}
              src={detail.dosya_url}
              className="h-[70vh] w-full rounded-[6px] border border-border bg-background"
            />
          )
        ) : (
          <p className="text-xs text-muted-foreground">Önizlenebilir belge bağlantısı yok.</p>
        )}
      </EntityModal>

      {/* Teslimat Kanıtı (POD) Ekleme Modalı */}
      <EntityModal
        open={podOpen}
        onOpenChange={setPodOpen}
        title="Teslimat Kanıtı (POD) Ekle"
        description="Sevkiyat teslimat bilgisini ve tutanak bağlantısını kaydedin."
        size="sm"
        isDirty={podDirty}
        isSubmitting={isPodSubmitting}
        submitLabel="Kaydet"
        error={actionError}
        onSubmit={handlePodSubmit(onPodSave)}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Sevkiyat *</Label>
            <RelationSelect
              value={podShipmentId || null}
              onChange={(val) =>
                setPodValue("shipment_id", val ? Number(val) : 0, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              loadOptions={loadPodShipmentOptions}
              placeholder="Sevkiyat seçin…"
              searchPlaceholder="Taşıyıcı veya takip no ile ara…"
              emptyText="Uygun sevkiyat bulunamadı"
              disabled={isPodSubmitting}
            />
            {podErrors.shipment_id ? (
              <span className="text-[11px] text-destructive">
                {podErrors.shipment_id.message}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pod-teslim-alan">Teslim Alan *</Label>
            <Input
              id="pod-teslim-alan"
              placeholder="Ad Soyad"
              disabled={isPodSubmitting}
              {...registerPod("teslim_alan")}
            />
            {podErrors.teslim_alan ? (
              <span className="text-[11px] text-destructive">
                {podErrors.teslim_alan.message}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pod-ref">Tutanak Bağlantısı veya Referans Kodu</Label>
            <Input
              id="pod-ref"
              className="text-xs"
              placeholder="https://… veya dosya referansı"
              disabled={isPodSubmitting}
              {...registerPod("belgeler_ref")}
            />
            {podErrors.belgeler_ref ? (
              <span className="text-[11px] text-destructive">
                {podErrors.belgeler_ref.message}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pod-notlar">Notlar</Label>
            <Input
              id="pod-notlar"
              placeholder="Teslimat notu"
              disabled={isPodSubmitting}
              {...registerPod("notlar")}
            />
          </div>
        </div>
      </EntityModal>

      {/* Belge Ayarları Modalı */}
      <EntityModal
        open={ayarOpen}
        onOpenChange={setAyarOpen}
        title="Belge Ayarları (Proforma & İrsaliye)"
        description="Proforma fatura uyarı notu ve irsaliye başlık/alt metin şablonlarını güncelleyin."
        size="md"
        isDirty={ayarDirty}
        isSubmitting={updateAyarlarMut.isPending}
        submitLabel="Ayarları Kaydet"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateAyarlarMut.mutateAsync(ayarDraft);
            setAyarDirty(false);
            setAyarOpen(false);
            setSuccessMsg("Belge ayarları güncellendi.");
            actionToast.success("Belge ayarları kaydedildi");
          } catch (err) {
            actionToast.error("Belge ayarları kaydedilemedi", err);
          }
        }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ayar-proforma">Proforma Uyarı Metni</Label>
            <Input
              id="ayar-proforma"
              required
              value={ayarDraft.proforma_disclaimer}
              onChange={(e) => {
                setAyarDirty(true);
                setAyarDraft((d) => ({ ...d, proforma_disclaimer: e.target.value }));
              }}
              disabled={updateAyarlarMut.isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ayar-baslik">İrsaliye Başlığı</Label>
            <Input
              id="ayar-baslik"
              required
              value={ayarDraft.irsaliye_baslik}
              onChange={(e) => {
                setAyarDirty(true);
                setAyarDraft((d) => ({ ...d, irsaliye_baslik: e.target.value }));
              }}
              disabled={updateAyarlarMut.isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ayar-alt">İrsaliye Alt Metni</Label>
            <Input
              id="ayar-alt"
              required
              value={ayarDraft.irsaliye_alt_metin}
              onChange={(e) => {
                setAyarDirty(true);
                setAyarDraft((d) => ({ ...d, irsaliye_alt_metin: e.target.value }));
              }}
              disabled={updateAyarlarMut.isPending}
            />
          </div>
        </div>
      </EntityModal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-mono tabular-nums">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-border px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium break-all">{value}</div>
    </div>
  );
}
