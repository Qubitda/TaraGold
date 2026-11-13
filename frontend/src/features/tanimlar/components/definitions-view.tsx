"use client";

import React, { useMemo, useState } from "react";
import { useAuth } from "@/features/auth";
import { OpsMarjPolitikasiCard } from "@/features/piyasa";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  useCreateOpsDefinitionMutation,
  useDeleteOpsDefinitionMutation,
  useOpsDefinitionsQuery,
  useSalesChannels,
  useUpdateOpsDefinitionMutation,
} from "../hooks";
import type {
  DefinitionCategoryId,
  DefinitionCategoryMeta,
  OpsAyarMilyem,
  OpsDefinitionKaynak,
  OpsDefinitionRow,
  OpsDovizKuru,
  OpsFiyatGrubu,
  OpsMetalKuru,
  SalesChannel,
} from "../types";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sliders,
  RefreshCw,
  AlertCircle,
  Search,
  Eye,
  Lock,
  Layers,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

const PAGE_SIZE = 10;

const CATEGORIES: DefinitionCategoryMeta[] = [
  {
    id: "sales-channels",
    label: "Satış Kanalları",
    description: "Quote TTL ve satış kanalı keşfi (GET /sales-channels/).",
    backendModel: "tanimlar.SatisKanali",
    apiAvailable: true,
    endpoint: "/api/v1/sales-channels/",
  },
  {
    id: "fiyat-gruplari",
    label: "Fiyat Grupları",
    description: "Alıcı fiyat grubu tanımları (CRUD).",
    backendModel: "tanimlar.FiyatGrubu",
    apiAvailable: true,
    endpoint: "/api/v1/ops/definitions/fiyat-gruplari/",
    kaynak: "fiyat-gruplari",
  },
  {
    id: "ayar-milyem",
    label: "Ayar / Milyem",
    description: "Metal ayar ve milyem katsayıları (CRUD).",
    backendModel: "tanimlar.AyarMilyem",
    apiAvailable: true,
    endpoint: "/api/v1/ops/definitions/ayar-milyem/",
    kaynak: "ayar-milyem",
  },
  {
    id: "kur-metal",
    label: "Metal Kurları",
    description: "XAU ve değerli metal kur kayıtları (CRUD).",
    backendModel: "tanimlar.MetalKuru",
    apiAvailable: true,
    endpoint: "/api/v1/ops/definitions/metal-kurlari/",
    kaynak: "metal-kurlari",
  },
  {
    id: "kur-doviz",
    label: "Döviz Kurları",
    description: "TRY çapraz döviz kurları (CRUD).",
    backendModel: "tanimlar.DovizKuru",
    apiAvailable: true,
    endpoint: "/api/v1/ops/definitions/doviz-kurlari/",
    kaynak: "doviz-kurlari",
  },
];

type SortKey = "kod_asc" | "kod_desc" | "ad_asc" | "ad_desc" | "ttl_asc" | "ttl_desc";

interface DefinitionFormState {
  // fiyat-gruplari
  kod: string;
  ad: string;
  sira: string;
  aktif: boolean;
  // ayar-milyem + metal-kurlari
  metal_id: string;
  fiyat_kaynagi: string;
  ayar_degeri: string;
  ayar_kodu: string;
  milyem: string;
  // metal-kurlari + doviz-kurlari
  saglayici_id: string;
  kur_tipi: string;
  saf_birim_fiyat: string;
  para_birimi: string;
  kur: string;
  manuel_neden: string;
}

function emptyFormState(
  kaynak: OpsDefinitionKaynak,
  refs?: {
    metaller?: Array<{ id: number }>;
    saglayicilar?: Array<{ id: number; aktif: boolean }>;
    kur_tipleri?: string[];
    fiyat_kaynaklari?: string[];
    para_birimleri?: string[];
  }
): DefinitionFormState {
  const defaultMetalId = refs?.metaller?.[0]?.id ? String(refs.metaller[0].id) : "";
  const activeSag =
    refs?.saglayicilar?.find((s) => s.aktif) ?? refs?.saglayicilar?.[0];
  const defaultSagId = activeSag ? String(activeSag.id) : "";
  return {
    kod: "",
    ad: "",
    sira: "0",
    aktif: true,
    metal_id: defaultMetalId,
    fiyat_kaynagi: refs?.fiyat_kaynaklari?.[0] || "MIRAS",
    ayar_degeri: "",
    ayar_kodu: "",
    milyem: "",
    saglayici_id: defaultSagId,
    kur_tipi: refs?.kur_tipleri?.includes("SATIS")
      ? "SATIS"
      : refs?.kur_tipleri?.[0] || "SATIS",
    saf_birim_fiyat: "",
    para_birimi: refs?.para_birimleri?.[0] || "USD",
    kur: "",
    manuel_neden:
      kaynak === "metal-kurlari" || kaynak === "doviz-kurlari"
        ? "Ops tanım girişi"
        : "",
  };
}

function rowToFormState(
  kaynak: OpsDefinitionKaynak,
  row: OpsDefinitionRow
): DefinitionFormState {
  const base = emptyFormState(kaynak);
  if (kaynak === "fiyat-gruplari") {
    const r = row as OpsFiyatGrubu;
    return {
      ...base,
      kod: r.kod,
      ad: r.ad,
      sira: String(r.sira),
      aktif: r.aktif,
    };
  }
  if (kaynak === "ayar-milyem") {
    const r = row as OpsAyarMilyem;
    return {
      ...base,
      metal_id: String(r.metal_id),
      fiyat_kaynagi: r.fiyat_kaynagi,
      ayar_degeri: String(r.ayar_degeri),
      ayar_kodu: r.ayar_kodu,
      milyem: r.milyem,
    };
  }
  if (kaynak === "metal-kurlari") {
    const r = row as OpsMetalKuru;
    return {
      ...base,
      metal_id: String(r.metal_id),
      saglayici_id: String(r.saglayici_id),
      kur_tipi: r.kur_tipi,
      saf_birim_fiyat: r.saf_birim_fiyat,
      manuel_neden: r.manuel_neden || "",
    };
  }
  const r = row as OpsDovizKuru;
  return {
    ...base,
    para_birimi: r.para_birimi,
    saglayici_id: String(r.saglayici_id),
    kur_tipi: r.kur_tipi,
    kur: r.kur,
    manuel_neden: r.manuel_neden || "",
  };
}

function matchesChannelQuery(row: SalesChannel, q: string): boolean {
  if (!q) return true;
  const hay = `${row.kod} ${row.ad} ${row.id}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesOpsQuery(
  kaynak: OpsDefinitionKaynak,
  row: OpsDefinitionRow,
  q: string
): boolean {
  if (!q) return true;
  const qq = q.toLowerCase();
  if (kaynak === "fiyat-gruplari") {
    const r = row as OpsFiyatGrubu;
    return `${r.id} ${r.kod} ${r.ad}`.toLowerCase().includes(qq);
  }
  if (kaynak === "ayar-milyem") {
    const r = row as OpsAyarMilyem;
    return `${r.id} ${r.metal_kod} ${r.metal_ad} ${r.ayar_kodu} ${r.ayar_degeri} ${r.milyem} ${r.fiyat_kaynagi}`
      .toLowerCase()
      .includes(qq);
  }
  if (kaynak === "metal-kurlari") {
    const r = row as OpsMetalKuru;
    return `${r.id} ${r.metal_kod} ${r.metal_ad} ${r.saglayici_kod} ${r.kur_tipi} ${r.saf_birim_fiyat} ${r.manuel_neden}`
      .toLowerCase()
      .includes(qq);
  }
  const r = row as OpsDovizKuru;
  return `${r.id} ${r.para_birimi} ${r.saglayici_kod} ${r.kur_tipi} ${r.kur} ${r.manuel_neden}`
    .toLowerCase()
    .includes(qq);
}

function sortChannels(rows: SalesChannel[], sort: SortKey): SalesChannel[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sort) {
      case "kod_desc":
        return b.kod.localeCompare(a.kod, "tr");
      case "ad_asc":
        return a.ad.localeCompare(b.ad, "tr");
      case "ad_desc":
        return b.ad.localeCompare(a.ad, "tr");
      case "ttl_asc":
        return (a.quote_ttl_saniye ?? -1) - (b.quote_ttl_saniye ?? -1);
      case "ttl_desc":
        return (b.quote_ttl_saniye ?? -1) - (a.quote_ttl_saniye ?? -1);
      case "kod_asc":
      default:
        return a.kod.localeCompare(b.kod, "tr");
    }
  });
  return copy;
}

export function DefinitionsView() {
  const { user } = useAuth();
  const actionToast = useActionToast();
  const canOps = Boolean(
    user?.capabilities?.can_view_ops ||
      user?.capabilities?.can_view_ops_finance ||
      user?.firma?.platform_mu
  );

  const { page, channels, loading: channelsLoading, error: channelsError, refresh: refreshChannels } =
    useSalesChannels();

  const [categoryId, setCategoryId] = useState<DefinitionCategoryId>("sales-channels");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("kod_asc");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState<SalesChannel | null>(null);

  const activeCategory = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
  const activeKaynak = activeCategory.kaynak;

  const opsDefQ = useOpsDefinitionsQuery(
    activeKaynak,
    Boolean(activeKaynak) && canOps
  );
  const createMut = useCreateOpsDefinitionMutation();
  const updateMut = useUpdateOpsDefinitionMutation();
  const deleteMut = useDeleteOpsDefinitionMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<OpsDefinitionRow | null>(null);
  const [formState, setFormState] = useState<DefinitionFormState>(() =>
    emptyFormState("fiyat-gruplari")
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filteredChannels = useMemo(() => {
    const matched = channels.filter((c) => matchesChannelQuery(c, query.trim()));
    return sortChannels(matched, sort);
  }, [channels, query, sort]);

  const opsRows = useMemo(() => opsDefQ.data?.results ?? [], [opsDefQ.data]);
  const filteredOpsRows = useMemo(() => {
    if (!activeKaynak) return [];
    const qTrim = query.trim();
    return opsRows.filter((row) => matchesOpsQuery(activeKaynak, row, qTrim));
  }, [activeKaynak, opsRows, query]);

  const activeRowsCount = activeKaynak ? filteredOpsRows.length : filteredChannels.length;
  const totalPages = Math.max(1, Math.ceil(activeRowsCount / PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const pagedChannels = filteredChannels.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );
  const pagedOpsRows = filteredOpsRows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const isLoading = activeKaynak ? opsDefQ.isLoading : channelsLoading;
  const activeError = activeKaynak
    ? opsDefQ.isError
      ? opsDefQ.error instanceof Error
        ? opsDefQ.error.message
        : "Ops tanım verileri alınamadı."
      : null
    : channelsError;

  const totalCount = activeKaynak
    ? opsDefQ.data?.count ?? opsRows.length
    : page?.count ?? channels.length;
  const activeCount = activeKaynak
    ? activeKaynak === "fiyat-gruplari"
      ? (opsRows as OpsFiyatGrubu[]).filter((r) => r.aktif).length
      : opsRows.length
    : channels.length;
  const passiveCount = activeKaynak
    ? activeKaynak === "fiyat-gruplari"
      ? (opsRows as OpsFiyatGrubu[]).filter((r) => !r.aktif).length
      : 0
    : 0;
  const categoryCount = CATEGORIES.filter((c) => c.apiAvailable).length;

  const onRefresh = () => {
    if (activeKaynak) {
      void opsDefQ.refetch();
    } else {
      refreshChannels();
    }
  };

  const onSelectCategory = (id: DefinitionCategoryId) => {
    setCategoryId(id);
    setQuery("");
    setPageIndex(0);
    setSelectedChannel(null);
    setConfirmDeleteId(null);
    setDeleteError(null);
  };

  const openCreateModal = () => {
    if (!activeKaynak) return;
    setEditingRow(null);
    setFormState(emptyFormState(activeKaynak, opsDefQ.data?.refs));
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (row: OpsDefinitionRow) => {
    if (!activeKaynak) return;
    setEditingRow(row);
    setFormState(rowToFormState(activeKaynak, row));
    setFormError(null);
    setFormOpen(true);
  };

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeKaynak) return;
    setFormError(null);

    let body: Record<string, unknown> = {};
    if (activeKaynak === "fiyat-gruplari") {
      body = {
        kod: formState.kod.trim(),
        ad: formState.ad.trim(),
        sira: Number(formState.sira || "0"),
        aktif: formState.aktif,
      };
    } else if (activeKaynak === "ayar-milyem") {
      body = {
        metal_id: Number(formState.metal_id),
        fiyat_kaynagi: formState.fiyat_kaynagi,
        ayar_degeri: Number(formState.ayar_degeri),
        ayar_kodu: formState.ayar_kodu.trim(),
        milyem: formState.milyem.trim(),
      };
    } else if (activeKaynak === "metal-kurlari") {
      body = {
        metal_id: Number(formState.metal_id),
        saglayici_id: formState.saglayici_id ? Number(formState.saglayici_id) : undefined,
        kur_tipi: formState.kur_tipi,
        saf_birim_fiyat: formState.saf_birim_fiyat.trim(),
        manuel_neden: formState.manuel_neden.trim(),
      };
    } else {
      body = {
        para_birimi: formState.para_birimi,
        saglayici_id: formState.saglayici_id ? Number(formState.saglayici_id) : undefined,
        kur_tipi: formState.kur_tipi,
        kur: formState.kur.trim(),
        manuel_neden: formState.manuel_neden.trim(),
      };
    }

    try {
      if (editingRow) {
        await updateMut.mutateAsync({
          kaynak: activeKaynak,
          id: editingRow.id,
          body,
        });
        actionToast.success("Tanım kaydı güncellendi");
      } else {
        await createMut.mutateAsync({
          kaynak: activeKaynak,
          body,
        });
        actionToast.success("Yeni tanım kaydı eklendi");
      }
      setFormOpen(false);
      setEditingRow(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "İşlem başarısız.";
      setFormError(msg);
      actionToast.error("Tanım kaydedilemedi", err);
    }
  };

  const onConfirmDelete = async (id: number) => {
    if (!activeKaynak) return;
    setDeleteError(null);
    try {
      await deleteMut.mutateAsync({ kaynak: activeKaynak, id });
      setConfirmDeleteId(null);
      actionToast.success("Tanım kaydı silindi");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Silme işlemi başarısız.";
      setDeleteError(msg);
      actionToast.error("Silme başarısız", err);
    }
  };

  const refs = opsDefQ.data?.refs;
  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tanımlar
          </h1>
          <p className="text-xs text-muted-foreground max-w-[60ch] leading-relaxed">
            Satış kanalları keşfi (<code className="font-mono">/sales-channels/</code>) ve platform
            ops için fiyat grupları, ayar/milyem, metal ve döviz kurları CRUD yönetimi (
            <code className="font-mono">/ops/definitions/&#123;kaynak&#125;/</code>).
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {activeKaynak && canOps ? (
            <Button size="sm" className="gap-1.5" onClick={openCreateModal}>
              <Plus className="h-3.5 w-3.5" />
              Yeni Kayıt
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Toplam kayıt" value={String(totalCount)} />
        <StatCard label="Aktif (API)" value={String(activeCount)} />
        <StatCard
          label="Pasif (API)"
          value={String(passiveCount)}
          hint={activeKaynak === "fiyat-gruplari" ? undefined : "Liste yalnız aktif döner"}
        />
        <StatCard label="HTTP kategorisi" value={String(categoryCount)} />
      </div>

      {(activeError || deleteError) && (
        <div
          className="flex items-center justify-between rounded-[8px] border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{deleteError || activeError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              onRefresh();
            }}
            className="h-8 border-destructive/30"
          >
            Yeniden Dene
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
        <nav
          className="rounded-[8px] border border-border bg-card p-2 h-fit"
          aria-label="Tanım kategorileri"
        >
          <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Kategoriler
          </div>
          <ul className="flex flex-col gap-0.5">
            {CATEGORIES.map((cat) => {
              const selectedCat = cat.id === categoryId;
              const count =
                cat.id === "sales-channels"
                  ? channels.length
                  : selectedCat && opsDefQ.data
                    ? opsDefQ.data.count
                    : null;
              const requiresOps = Boolean(cat.kaynak) && !canOps;
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className={`w-full rounded-[6px] px-2.5 py-2 text-left transition-colors ${
                      selectedCat
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{cat.label}</span>
                      {requiresOps ? (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          Ops
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {count ?? "CRUD"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                      {cat.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="rounded-[8px] border border-border bg-card overflow-hidden min-w-0">
          <div className="border-b border-border px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 min-w-0">
              <Sliders className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  {activeCategory.label}
                </h2>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {activeCategory.backendModel}
                  {activeCategory.endpoint ? ` · ${activeCategory.endpoint}` : ""}
                </p>
              </div>
            </div>
          </div>

          {activeKaynak && !canOps ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <Lock className="h-7 w-7 opacity-40" />
              <span className="text-sm font-medium text-foreground">
                Platform Ops yetkisi gerekir
              </span>
              <span className="max-w-md leading-relaxed">
                Fiyat grupları, ayar/milyem ve metal/döviz kurları yönetimi yalnız
                platform ops / finans ekibi tarafından görüntülenebilir ve düzenlenebilir.
              </span>
            </div>
          ) : isLoading ? (
            <div className="flex h-56 items-center justify-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Tanımlar yükleniyor…
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPageIndex(0);
                    }}
                    placeholder={
                      activeKaynak
                        ? "Kod, ad, metal, para birimi veya neden ara…"
                        : "Kod veya ad ara…"
                    }
                    className="pl-8 h-9"
                    aria-label="Tanım ara"
                  />
                </div>
                {!activeKaynak ? (
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as SortKey);
                      setPageIndex(0);
                    }}
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
                    aria-label="Sıralama"
                  >
                    <option value="kod_asc">Kod (A→Z)</option>
                    <option value="kod_desc">Kod (Z→A)</option>
                    <option value="ad_asc">Ad (A→Z)</option>
                    <option value="ad_desc">Ad (Z→A)</option>
                    <option value="ttl_asc">Quote TTL ↑</option>
                    <option value="ttl_desc">Quote TTL ↓</option>
                  </select>
                ) : null}
              </div>

              {activeRowsCount === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                  <Layers className="h-7 w-7 opacity-40" />
                  <span className="text-sm font-medium text-foreground">
                    Veri bulunamadı
                  </span>
                  <span>
                    {(activeKaynak ? opsRows.length === 0 : channels.length === 0)
                      ? "Henüz kayıt bulunamadı."
                      : "Arama ölçütlerine uygun kayıt yok."}
                  </span>
                </div>
              ) : !activeKaynak ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Kod</TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead className="text-right">Quote TTL (sn)</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedChannels.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.kod}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {row.ad}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.quote_ttl_saniye != null ? row.quote_ttl_saniye : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success" className="font-mono text-[10px]">
                            AKTİF
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setSelectedChannel(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detay
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <OpsDefinitionsTable
                  kaynak={activeKaynak}
                  rows={pagedOpsRows}
                  confirmDeleteId={confirmDeleteId}
                  isDeleting={deleteMut.isPending}
                  onEdit={openEditModal}
                  onRequestDelete={(id) => {
                    setDeleteError(null);
                    setConfirmDeleteId(id);
                  }}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={(id) => void onConfirmDelete(id)}
                />
              )}

              {activeRowsCount > 0 ? (
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  <span>
                    {activeRowsCount} kayıt · sayfa {safePage + 1}/{totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={safePage <= 0}
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    >
                      Önceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={safePage >= totalPages - 1}
                      onClick={() =>
                        setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                      }
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
                {activeKaynak
                  ? "Değişiklikler doğrudan PostgreSQL ve AuditOlay kaydına yazılır."
                  : "Satış kanalları listesi salt okunurdur (GET /sales-channels/)."}
                {(activeKaynak ? opsDefQ.data?.server_now : page?.server_now)
                  ? ` · Sunucu: ${formatDateTime(
                      (activeKaynak ? opsDefQ.data?.server_now : page?.server_now)!
                    )}`
                  : null}
              </div>
            </>
          )}
        </section>
      </div>

      {canOps ? <OpsMarjPolitikasiCard /> : null}

      <Dialog
        open={Boolean(selectedChannel)}
        onOpenChange={(open) => !open && setSelectedChannel(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Satış kanalı detayı</DialogTitle>
            <DialogDescription>
              Salt okunur — `GET /sales-channels/` alanları.
            </DialogDescription>
          </DialogHeader>
          {selectedChannel && (
            <div className="flex flex-col gap-3 pt-1 text-sm">
              <DetailRow label="ID" value={`#${selectedChannel.id}`} mono />
              <DetailRow label="Kod" value={selectedChannel.kod} mono />
              <DetailRow label="Ad" value={selectedChannel.ad} />
              <DetailRow
                label="Quote TTL"
                value={
                  selectedChannel.quote_ttl_saniye != null
                    ? `${selectedChannel.quote_ttl_saniye} sn`
                    : "Tanımsız (quote üretilmez)"
                }
                mono
              />
              <DetailRow label="Durum" value="AKTİF (API filtresi)" />
              <DetailRow label="Model" value="tanimlar.SatisKanali" mono />
              <div className="pt-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedChannel(null)}
                >
                  Kapat
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingRow(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRow
                ? `${activeCategory.label} — Düzenle (#${editingRow.id})`
                : `${activeCategory.label} — Yeni Kayıt`}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {activeCategory.endpoint}
            </DialogDescription>
          </DialogHeader>
          {activeKaynak ? (
            <form onSubmit={onSubmitForm} className="flex flex-col gap-3 pt-1">
              {formError ? (
                <div
                  className="rounded-[6px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}

              {activeKaynak === "fiyat-gruplari" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Kod</Label>
                    <Input
                      required
                      maxLength={20}
                      value={formState.kod}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, kod: e.target.value }))
                      }
                      placeholder="ORNEK_GRP"
                      className="font-mono text-xs"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Ad</Label>
                    <Input
                      required
                      maxLength={80}
                      value={formState.ad}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, ad: e.target.value }))
                      }
                      placeholder="Özel Fiyat Grubu"
                      disabled={isMutating}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Sıra</Label>
                      <Input
                        type="number"
                        value={formState.sira}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, sira: e.target.value }))
                        }
                        disabled={isMutating}
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formState.aktif}
                          onChange={(e) =>
                            setFormState((s) => ({ ...s, aktif: e.target.checked }))
                          }
                          disabled={isMutating}
                        />
                        Aktif
                      </label>
                    </div>
                  </div>
                </>
              ) : null}

              {activeKaynak === "ayar-milyem" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Kıymetli Metal</Label>
                    <select
                      required
                      value={formState.metal_id}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, metal_id: e.target.value }))
                      }
                      disabled={isMutating}
                      className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                    >
                      <option value="">Seçiniz…</option>
                      {(refs?.metaller ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.kod} — {m.ad}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Ayar Kodu</Label>
                      <Input
                        required
                        maxLength={15}
                        value={formState.ayar_kodu}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, ayar_kodu: e.target.value }))
                        }
                        placeholder="14K"
                        className="font-mono text-xs"
                        disabled={isMutating}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Ayar Değeri</Label>
                      <Input
                        required
                        type="number"
                        value={formState.ayar_degeri}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, ayar_degeri: e.target.value }))
                        }
                        placeholder="14"
                        disabled={isMutating}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Milyem (Decimal)</Label>
                      <Input
                        required
                        value={formState.milyem}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, milyem: e.target.value }))
                        }
                        placeholder="0.585"
                        className="font-mono text-xs"
                        disabled={isMutating}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Fiyat Kaynağı</Label>
                      <select
                        value={formState.fiyat_kaynagi}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            fiyat_kaynagi: e.target.value,
                          }))
                        }
                        disabled={isMutating}
                        className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                      >
                        {(refs?.fiyat_kaynaklari ?? ["MIRAS"]).map((fk) => (
                          <option key={fk} value={fk}>
                            {fk}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : null}

              {activeKaynak === "metal-kurlari" ? (
                <>
                  {!editingRow ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label>Kıymetli Metal</Label>
                        <select
                          required
                          value={formState.metal_id}
                          onChange={(e) =>
                            setFormState((s) => ({ ...s, metal_id: e.target.value }))
                          }
                          disabled={isMutating}
                          className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Seçiniz…</option>
                          {(refs?.metaller ?? []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.kod} — {m.ad}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Kur Sağlayıcı</Label>
                        <select
                          value={formState.saglayici_id}
                          onChange={(e) =>
                            setFormState((s) => ({
                              ...s,
                              saglayici_id: e.target.value,
                            }))
                          }
                          disabled={isMutating}
                          className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Varsayılan sağlayıcı</option>
                          {(refs?.saglayicilar ?? []).map((sag) => (
                            <option key={sag.id} value={sag.id}>
                              {sag.kod} — {sag.ad}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Kur Tipi</Label>
                      <select
                        value={formState.kur_tipi}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, kur_tipi: e.target.value }))
                        }
                        disabled={isMutating}
                        className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                      >
                        {(refs?.kur_tipleri ?? ["ALIS", "SATIS"]).map((kt) => (
                          <option key={kt} value={kt}>
                            {kt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Saf Birim Fiyat (TRY)</Label>
                      <Input
                        required
                        value={formState.saf_birim_fiyat}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            saf_birim_fiyat: e.target.value,
                          }))
                        }
                        placeholder="3150.00"
                        className="font-mono text-xs"
                        disabled={isMutating}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Manuel Neden</Label>
                    <Input
                      value={formState.manuel_neden}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          manuel_neden: e.target.value,
                        }))
                      }
                      placeholder="Ops kur girişi"
                      disabled={isMutating}
                    />
                  </div>
                </>
              ) : null}

              {activeKaynak === "doviz-kurlari" ? (
                <>
                  {!editingRow ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label>Para Birimi</Label>
                        <select
                          required
                          value={formState.para_birimi}
                          onChange={(e) =>
                            setFormState((s) => ({
                              ...s,
                              para_birimi: e.target.value,
                            }))
                          }
                          disabled={isMutating}
                          className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                        >
                          {(refs?.para_birimleri ?? ["USD", "EUR"]).map((pb) => (
                            <option key={pb} value={pb}>
                              {pb}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Kur Sağlayıcı</Label>
                        <select
                          value={formState.saglayici_id}
                          onChange={(e) =>
                            setFormState((s) => ({
                              ...s,
                              saglayici_id: e.target.value,
                            }))
                          }
                          disabled={isMutating}
                          className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Varsayılan sağlayıcı</option>
                          {(refs?.saglayicilar ?? []).map((sag) => (
                            <option key={sag.id} value={sag.id}>
                              {sag.kod} — {sag.ad}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Kur Tipi</Label>
                      <select
                        value={formState.kur_tipi}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, kur_tipi: e.target.value }))
                        }
                        disabled={isMutating}
                        className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                      >
                        {(refs?.kur_tipleri ?? ["ALIS", "SATIS"]).map((kt) => (
                          <option key={kt} value={kt}>
                            {kt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Kur (TRY)</Label>
                      <Input
                        required
                        value={formState.kur}
                        onChange={(e) =>
                          setFormState((s) => ({ ...s, kur: e.target.value }))
                        }
                        placeholder="34.50"
                        className="font-mono text-xs"
                        disabled={isMutating}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Manuel Neden</Label>
                    <Input
                      value={formState.manuel_neden}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          manuel_neden: e.target.value,
                        }))
                      }
                      placeholder="Ops kur girişi"
                      disabled={isMutating}
                    />
                  </div>
                </>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormOpen(false)}
                  disabled={isMutating}
                >
                  İptal
                </Button>
                <Button type="submit" size="sm" disabled={isMutating}>
                  {isMutating
                    ? "Kaydediliyor…"
                    : editingRow
                      ? "Güncelle"
                      : "Oluştur"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpsDefinitionsTable({
  kaynak,
  rows,
  confirmDeleteId,
  isDeleting,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  kaynak: OpsDefinitionKaynak;
  rows: OpsDefinitionRow[];
  confirmDeleteId: number | null;
  isDeleting: boolean;
  onEdit: (row: OpsDefinitionRow) => void;
  onRequestDelete: (id: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: number) => void;
}) {
  const renderActions = (row: OpsDefinitionRow) => {
    const isConfirming = confirmDeleteId === row.id;
    return (
      <div className="flex items-center justify-end gap-1">
        {isConfirming ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isDeleting}
              onClick={() => onConfirmDelete(row.id)}
            >
              {isDeleting ? "Siliniyor…" : "Onayla"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isDeleting}
              onClick={onCancelDelete}
            >
              Vazgeç
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => onEdit(row)}
            >
              <Pencil className="h-3 w-3" />
              Düzenle
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
              onClick={() => onRequestDelete(row.id)}
            >
              <Trash2 className="h-3 w-3" />
              Sil
            </Button>
          </>
        )}
      </div>
    );
  };

  if (kaynak === "fiyat-gruplari") {
    const list = rows as OpsFiyatGrubu[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Kod</TableHead>
            <TableHead>Ad</TableHead>
            <TableHead className="text-right">Sıra</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.kod}
              </TableCell>
              <TableCell className="font-medium text-foreground">{row.ad}</TableCell>
              <TableCell className="text-right font-mono text-xs">{row.sira}</TableCell>
              <TableCell>
                <Badge
                  variant={row.aktif ? "success" : "secondary"}
                  className="font-mono text-[10px]"
                >
                  {row.aktif ? "AKTİF" : "PASİF"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{renderActions(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (kaynak === "ayar-milyem") {
    const list = rows as OpsAyarMilyem[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metal</TableHead>
            <TableHead>Ayar Kodu</TableHead>
            <TableHead className="text-right">Ayar</TableHead>
            <TableHead className="text-right">Milyem</TableHead>
            <TableHead>Kaynak</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.metal_kod} ({row.metal_ad})
              </TableCell>
              <TableCell className="font-mono text-xs">{row.ayar_kodu}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {row.ayar_degeri}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {row.milyem}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.fiyat_kaynagi}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{renderActions(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (kaynak === "metal-kurlari") {
    const list = rows as OpsMetalKuru[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metal</TableHead>
            <TableHead>Sağlayıcı</TableHead>
            <TableHead>Tip</TableHead>
            <TableHead className="text-right">Saf Fiyat</TableHead>
            <TableHead>Zaman / Neden</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.metal_kod}
              </TableCell>
              <TableCell className="font-mono text-xs">{row.saglayici_kod}</TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.kur_tipi}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
                {row.saf_birim_fiyat}
              </TableCell>
              <TableCell className="text-[11px] text-muted-foreground">
                <div>{row.zaman ? formatDateTime(row.zaman) : "—"}</div>
                {row.manuel_neden ? (
                  <div className="truncate max-w-[180px]">{row.manuel_neden}</div>
                ) : null}
              </TableCell>
              <TableCell className="text-right">{renderActions(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const list = rows as OpsDovizKuru[];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Para Birimi</TableHead>
          <TableHead>Sağlayıcı</TableHead>
          <TableHead>Tip</TableHead>
          <TableHead className="text-right">Kur</TableHead>
          <TableHead>Zaman / Neden</TableHead>
          <TableHead className="text-right">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs font-semibold">
              {row.para_birimi}
            </TableCell>
            <TableCell className="font-mono text-xs">{row.saglayici_kod}</TableCell>
            <TableCell>
              <Badge variant="outline" className="font-mono text-[10px]">
                {row.kur_tipi}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
              {row.kur}
            </TableCell>
            <TableCell className="text-[11px] text-muted-foreground">
              <div>{row.zaman ? formatDateTime(row.zaman) : "—"}</div>
              {row.manuel_neden ? (
                <div className="truncate max-w-[180px]">{row.manuel_neden}</div>
              ) : null}
            </TableCell>
            <TableCell className="text-right">{renderActions(row)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
        {value}
      </div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span
        className={`text-xs text-foreground text-right ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}
