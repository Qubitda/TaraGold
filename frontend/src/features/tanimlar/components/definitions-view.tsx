"use client";

import React, { useMemo, useState } from "react";
import { useAuth } from "@/features/auth";
import { OpsMarjPolitikasiCard } from "@/features/piyasa";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  useChannelProductsQuery,
  useCreateOpsDefinitionMutation,
  useDeleteOpsDefinitionMutation,
  useOpsDefinitionsQuery,
  useSalesChannels,
  useSetChannelProductMutation,
  useUpdateOpsDefinitionMutation,
} from "../hooks";
import type {
  DefinitionCategoryId,
  DefinitionCategoryMeta,
  OpsAyarMilyem,
  OpsBirim,
  OpsDefinitionKaynak,
  OpsDefinitionRow,
  OpsDovizKuru,
  OpsFiyatGrubu,
  OpsMetalKuru,
  OpsSatisKanali,
  SalesChannel,
} from "../types";
import { formatDateTime } from "@/lib/format";
import {
  ConfirmDialog,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sliders, Eye, Lock } from "lucide-react";

const PAGE_SIZE = 15;

const CATEGORIES: DefinitionCategoryMeta[] = [
  {
    id: "satis-kanallari",
    label: "Satış Kanalları",
    description: "Kuyumcu portalı, B2B ve dağıtım kanalları yönetimi.",
    kaynak: "satis-kanallari",
  },
  {
    id: "fiyat-gruplari",
    label: "Fiyat Grupları",
    description: "Alıcı ve kanal fiyat grubu tanımları.",
    kaynak: "fiyat-gruplari",
  },
  {
    id: "ayar-milyem",
    label: "Ayar / Milyem",
    description: "Metal ayar ve milyem katsayı tanımları.",
    kaynak: "ayar-milyem",
  },
  {
    id: "kur-metal",
    label: "Metal Kurları",
    description: "Has altın ve değerli metal kur girişleri.",
    kaynak: "metal-kurlari",
  },
  {
    id: "kur-doviz",
    label: "Döviz Kurları",
    description: "TRY çapraz döviz kurları yönetimi.",
    kaynak: "doviz-kurlari",
  },
  {
    id: "birimler",
    label: "Ölçü Birimleri",
    description: "Sistemde tanımlı stok ve satış birimleri.",
    kaynak: "birimler",
    readOnly: true,
  },
];

interface DefinitionFormState {
  kod: string;
  ad: string;
  tip: string;
  fiyat_grubu_id: string;
  varsayilan_marj_kurali_id: string;
  quote_ttl_saniye: string;
  sira: string;
  aktif: boolean;
  metal_id: string;
  fiyat_kaynagi: string;
  ayar_degeri: string;
  ayar_kodu: string;
  milyem: string;
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
    kanal_tipleri?: Array<{ kod: string; ad: string }>;
  }
): DefinitionFormState {
  const defaultMetalId = refs?.metaller?.[0]?.id ? String(refs.metaller[0].id) : "";
  const activeSag =
    refs?.saglayicilar?.find((s) => s.aktif) ?? refs?.saglayicilar?.[0];
  const defaultSagId = activeSag ? String(activeSag.id) : "";
  return {
    kod: "",
    ad: "",
    tip: refs?.kanal_tipleri?.[0]?.kod || "KUYUMCU_PORTAL",
    fiyat_grubu_id: "",
    varsayilan_marj_kurali_id: "",
    quote_ttl_saniye: "180",
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
        ? "Operatör kur girişi"
        : "",
  };
}

function rowToFormState(
  kaynak: OpsDefinitionKaynak,
  row: OpsDefinitionRow
): DefinitionFormState {
  const base = emptyFormState(kaynak);
  if (kaynak === "satis-kanallari") {
    const r = row as OpsSatisKanali;
    return {
      ...base,
      kod: r.kod,
      ad: r.ad,
      tip: r.tip || "KUYUMCU_PORTAL",
      fiyat_grubu_id: r.fiyat_grubu_id ? String(r.fiyat_grubu_id) : "",
      varsayilan_marj_kurali_id: r.varsayilan_marj_kurali_id
        ? String(r.varsayilan_marj_kurali_id)
        : "",
      quote_ttl_saniye:
        r.quote_ttl_saniye != null ? String(r.quote_ttl_saniye) : "",
      sira: String(r.sira ?? 0),
      aktif: r.aktif,
    };
  }
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
  if (kaynak === "doviz-kurlari") {
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
  return base;
}

const KANAL_TIP_ETIKET: Record<string, string> = {
  KUYUMCU_PORTAL: "Kuyumcu Portal",
  B2B_API: "B2B API",
  B2C_API: "B2C API",
};

export function DefinitionsView() {
  const { user } = useAuth();
  const actionToast = useActionToast();
  const canOps = Boolean(
    user?.capabilities?.can_view_ops ||
      user?.capabilities?.can_view_ops_finance ||
      user?.firma?.platform_mu
  );

  const {
    channels: buyerChannels,
    loading: buyerChannelsLoading,
    error: buyerChannelsError,
    refresh: refreshBuyerChannels,
  } = useSalesChannels();

  const [categoryId, setCategoryId] = useState<DefinitionCategoryId>("satis-kanallari");
  const [query, setQuery] = useState("");
  const [aktifFilter, setAktifFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const activeCategory = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
  const activeKaynak = activeCategory.kaynak;
  const isReadOnlyCategory = Boolean(activeCategory.readOnly);

  const queryParams = useMemo(
    () => ({
      q: query.trim() || undefined,
      aktif:
        activeKaynak === "satis-kanallari" || activeKaynak === "fiyat-gruplari"
          ? aktifFilter || undefined
          : undefined,
      page: String(page),
      page_size: String(PAGE_SIZE),
    }),
    [query, aktifFilter, page, activeKaynak]
  );

  const opsDefQ = useOpsDefinitionsQuery(activeKaynak, canOps, queryParams);
  const createMut = useCreateOpsDefinitionMutation();
  const updateMut = useUpdateOpsDefinitionMutation();
  const deleteMut = useDeleteOpsDefinitionMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<OpsDefinitionRow | null>(null);
  const [formState, setFormState] = useState<DefinitionFormState>(() =>
    emptyFormState("satis-kanallari")
  );
  const [formDirty, setFormDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [detailRow, setDetailRow] = useState<OpsDefinitionRow | SalesChannel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [channelProdSearch, setChannelProdSearch] = useState("");
  const [channelProdOnlyAssigned, setChannelProdOnlyAssigned] = useState(false);

  const selectedKanalId =
    activeKaynak === "satis-kanallari" && detailRow && "id" in detailRow
      ? Number(detailRow.id)
      : undefined;
  const channelProductsQ = useChannelProductsQuery(
    selectedKanalId,
    {
      q: channelProdSearch.trim() || undefined,
      atanmis: channelProdOnlyAssigned ? "true" : undefined,
    },
    Boolean(selectedKanalId) && canOps
  );
  const setChannelProductMut = useSetChannelProductMutation();

  const updateField = <K extends keyof DefinitionFormState>(
    key: K,
    value: DefinitionFormState[K]
  ) => {
    setFormDirty(true);
    setFormState((s) => ({ ...s, [key]: value }));
  };

  const onSelectCategory = (id: DefinitionCategoryId) => {
    setCategoryId(id);
    setQuery("");
    setAktifFilter("");
    setPage(1);
    setDetailRow(null);
  };

  const openCreateModal = () => {
    if (isReadOnlyCategory || !canOps) return;
    setEditingRow(null);
    setFormState(emptyFormState(activeKaynak, opsDefQ.data?.refs));
    setFormError(null);
    setFormDirty(false);
    setFormOpen(true);
  };

  const openEditModal = (row: OpsDefinitionRow) => {
    if (isReadOnlyCategory || !canOps) return;
    setEditingRow(row);
    setFormState(rowToFormState(activeKaynak, row));
    setFormError(null);
    setFormDirty(false);
    setFormOpen(true);
  };

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyCategory) return;
    setFormError(null);

    let body: Record<string, unknown> = {};
    if (activeKaynak === "satis-kanallari") {
      if (!formState.kod.trim() || !formState.ad.trim()) {
        setFormError("Kanal kodu ve adı zorunludur.");
        return;
      }
      body = {
        kod: formState.kod.trim().toUpperCase(),
        ad: formState.ad.trim(),
        tip: formState.tip || "KUYUMCU_PORTAL",
        fiyat_grubu_id: formState.fiyat_grubu_id ? Number(formState.fiyat_grubu_id) : null,
        varsayilan_marj_kurali_id: formState.varsayilan_marj_kurali_id
          ? Number(formState.varsayilan_marj_kurali_id)
          : null,
        quote_ttl_saniye: formState.quote_ttl_saniye.trim()
          ? Number(formState.quote_ttl_saniye)
          : null,
        sira: Number(formState.sira || "0"),
        aktif: formState.aktif,
      };
    } else if (activeKaynak === "fiyat-gruplari") {
      if (!formState.kod.trim() || !formState.ad.trim()) {
        setFormError("Grup kodu ve adı zorunludur.");
        return;
      }
      body = {
        kod: formState.kod.trim().toUpperCase(),
        ad: formState.ad.trim(),
        sira: Number(formState.sira || "0"),
        aktif: formState.aktif,
      };
    } else if (activeKaynak === "ayar-milyem") {
      if (!formState.metal_id || !formState.ayar_kodu.trim() || !formState.milyem.trim()) {
        setFormError("Metal, ayar kodu ve milyem değeri zorunludur.");
        return;
      }
      body = {
        metal_id: Number(formState.metal_id),
        fiyat_kaynagi: formState.fiyat_kaynagi,
        ayar_degeri: Number(formState.ayar_degeri),
        ayar_kodu: formState.ayar_kodu.trim(),
        milyem: formState.milyem.trim(),
      };
    } else if (activeKaynak === "metal-kurlari") {
      if (!formState.metal_id || !formState.saf_birim_fiyat.trim()) {
        setFormError("Metal ve saf birim fiyat zorunludur.");
        return;
      }
      body = {
        metal_id: Number(formState.metal_id),
        saglayici_id: formState.saglayici_id ? Number(formState.saglayici_id) : undefined,
        kur_tipi: formState.kur_tipi,
        saf_birim_fiyat: formState.saf_birim_fiyat.trim(),
        manuel_neden: formState.manuel_neden.trim(),
      };
    } else if (activeKaynak === "doviz-kurlari") {
      if (!formState.para_birimi || !formState.kur.trim()) {
        setFormError("Para birimi ve kur değeri zorunludur.");
        return;
      }
      body = {
        para_birimi: formState.para_birimi,
        saglayici_id: formState.saglayici_id ? Number(formState.saglayici_id) : undefined,
        kur_tipi: formState.kur_tipi,
        kur: formState.kur.trim(),
        manuel_neden: formState.manuel_neden.trim(),
      };
    }

    try {
      if (editingRow && typeof editingRow.id === "number") {
        await updateMut.mutateAsync({
          kaynak: activeKaynak,
          id: editingRow.id,
          body,
        });
        actionToast.success("Kayıt güncellendi");
      } else {
        await createMut.mutateAsync({
          kaynak: activeKaynak,
          body,
        });
        actionToast.success("Yeni kayıt eklendi");
      }
      setFormOpen(false);
      setEditingRow(null);
      setFormDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "İşlem başarısız.";
      setFormError(msg);
      actionToast.error("Kayıt kaydedilemedi", err);
    }
  };

  const toggleAktif = async (row: OpsSatisKanali | OpsFiyatGrubu) => {
    try {
      await updateMut.mutateAsync({
        kaynak: activeKaynak,
        id: row.id,
        body: { aktif: !row.aktif },
      });
      actionToast.success(row.aktif ? "Kayıt pasifleştirildi" : "Kayıt aktifleştirildi");
    } catch (err) {
      actionToast.error("Durum güncellenemedi", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ kaynak: activeKaynak, id: deleteTarget.id });
      actionToast.success("Kayıt silindi");
      setDeleteTarget(null);
    } catch (err) {
      actionToast.error("Kayıt silinemedi", err);
      setDeleteTarget(null);
    }
  };

  const refs = opsDefQ.data?.refs;
  const isMutating = createMut.isPending || updateMut.isPending;

  const metalOptions = useMemo(
    () =>
      (refs?.metaller ?? []).map((m) => ({
        value: String(m.id),
        label: m.ad,
        subtitle: m.kod,
      })),
    [refs?.metaller]
  );

  const saglayiciOptions = useMemo(
    () =>
      (refs?.saglayicilar ?? []).map((s) => ({
        value: String(s.id),
        label: s.ad,
        subtitle: s.kod,
        disabled: !s.aktif,
      })),
    [refs?.saglayicilar]
  );

  const fiyatGrubuOptions = useMemo(
    () =>
      (refs?.fiyat_gruplari ?? []).map((fg) => ({
        value: String(fg.id),
        label: fg.ad,
        subtitle: fg.kod,
      })),
    [refs?.fiyat_gruplari]
  );

  const marjKuraliOptions = useMemo(
    () =>
      (refs?.marj_kurallari ?? []).map((mk) => ({
        value: String(mk.id),
        label: mk.ad,
        subtitle: `${mk.kapsam} · ${mk.deger}`,
      })),
    [refs?.marj_kurallari]
  );

  const opsRows = useMemo(() => opsDefQ.data?.results ?? [], [opsDefQ.data]);
  const nonOpsChannels = useMemo(() => {
    const term = query.trim().toLowerCase();
    return buyerChannels.filter(
      (c) =>
        !term ||
        c.ad.toLowerCase().includes(term) ||
        c.kod.toLowerCase().includes(term)
    );
  }, [buyerChannels, query]);

  const effectiveLoading = canOps ? opsDefQ.isLoading || opsDefQ.isFetching : buyerChannelsLoading;
  const effectiveError = canOps
    ? opsDefQ.isError
      ? opsDefQ.error instanceof Error
        ? opsDefQ.error.message
        : "Tanım verileri alınamadı."
      : null
    : buyerChannelsError;

  const totalCount = canOps ? opsDefQ.data?.count ?? opsRows.length : nonOpsChannels.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
        <nav
          className="rounded-[8px] border border-border bg-card p-2 h-fit"
          aria-label="Tanım kategorileri"
        >
          <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tanım Grupları
          </div>
          <ul className="flex flex-col gap-0.5">
            {CATEGORIES.map((cat) => {
              const selectedCat = cat.id === categoryId;
              const requiresOps = !canOps && cat.id !== "satis-kanallari";
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
                        <Badge variant="secondary" className="text-[10px]">
                          Yetkili
                        </Badge>
                      ) : cat.readOnly ? (
                        <Badge variant="outline" className="text-[10px]">
                          Liste
                        </Badge>
                      ) : null}
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

        <div className="min-w-0">
          {!canOps && categoryId !== "satis-kanallari" ? (
            <div className="rounded-[8px] border border-border bg-card flex h-60 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <Lock className="h-7 w-7 opacity-40" />
              <span className="text-sm font-medium text-foreground">
                Platform Yönetici Yetkisi Gerekir
              </span>
              <span className="max-w-md leading-relaxed">
                Bu bölüm yalnızca platform yöneticileri tarafından görüntülenebilir ve
                düzenlenebilir.
              </span>
            </div>
          ) : (
            <ListPage
              title={activeCategory.label}
              description={activeCategory.description}
              createLabel={
                canOps && !isReadOnlyCategory
                  ? `Yeni ${activeCategory.label}`
                  : undefined
              }
              onCreate={
                canOps && !isReadOnlyCategory ? openCreateModal : undefined
              }
              loading={effectiveLoading}
              error={effectiveError}
              onRetry={() => {
                if (canOps) void opsDefQ.refetch();
                else refreshBuyerChannels();
              }}
              searchValue={query}
              onSearchChange={(v) => {
                setQuery(v);
                setPage(1);
              }}
              searchPlaceholder="Kod, ad veya açıklama ara…"
              filters={
                canOps &&
                (activeKaynak === "satis-kanallari" || activeKaynak === "fiyat-gruplari") ? (
                  <select
                    value={aktifFilter}
                    onChange={(e) => {
                      setAktifFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
                    aria-label="Durum filtresi"
                  >
                    <option value="">Tüm Durumlar</option>
                    <option value="true">Yalnız Aktif</option>
                    <option value="false">Yalnız Pasif</option>
                  </select>
                ) : undefined
              }
              isEmpty={(canOps ? opsRows.length : nonOpsChannels.length) === 0}
              emptyTitle="Kayıt bulunamadı"
              emptyDescription={
                query
                  ? "Arama ölçütünüze uygun kayıt bulunamadı."
                  : "Bu grupta henüz kayıt bulunmuyor."
              }
              page={canOps ? page : 1}
              pageSize={PAGE_SIZE}
              totalCount={canOps ? totalCount : undefined}
              onPageChange={canOps ? setPage : undefined}
            >
              {!canOps ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Kanal Adı</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Fiyat Geçerlilik (sn)</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nonOpsChannels.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.kod}
                        </TableCell>
                        <TableCell className="font-medium">{row.ad}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {KANAL_TIP_ETIKET[row.tip || ""] || row.tip || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.quote_ttl_saniye != null ? row.quote_ttl_saniye : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success" className="text-[10px]">
                            Aktif
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setDetailRow(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Görüntüle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : activeKaynak === "satis-kanallari" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Kanal Adı</TableHead>
                      <TableHead>Kanal Tipi</TableHead>
                      <TableHead>Fiyat Grubu / Marj</TableHead>
                      <TableHead className="text-right">Teklif Süresi (sn)</TableHead>
                      <TableHead className="text-right">Sıra</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsSatisKanali[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.kod}
                        </TableCell>
                        <TableCell className="font-medium">{row.ad}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {KANAL_TIP_ETIKET[row.tip] || row.tip}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>{row.fiyat_grubu_ad || "—"}</div>
                          {row.varsayilan_marj_kurali_ad ? (
                            <div className="text-[11px]">{row.varsayilan_marj_kurali_ad}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.quote_ttl_saniye != null ? row.quote_ttl_saniye : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.sira}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.aktif ? "success" : "secondary"}
                            className="text-[10px]"
                          >
                            {row.aktif ? "Aktif" : "Pasif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={row.ad}
                            onView={() => {
                              setChannelProdSearch("");
                              setChannelProdOnlyAssigned(false);
                              setDetailRow(row);
                            }}
                            onEdit={() => openEditModal(row)}
                            isActive={row.aktif}
                            onToggleActive={() => void toggleAktif(row)}
                            onDelete={() =>
                              setDeleteTarget({ id: row.id, label: row.ad })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : activeKaynak === "fiyat-gruplari" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Grup Adı</TableHead>
                      <TableHead className="text-right">Sıra</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsFiyatGrubu[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.kod}
                        </TableCell>
                        <TableCell className="font-medium">{row.ad}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.sira}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.aktif ? "success" : "secondary"}
                            className="text-[10px]"
                          >
                            {row.aktif ? "Aktif" : "Pasif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={row.ad}
                            onView={() => setDetailRow(row)}
                            onEdit={() => openEditModal(row)}
                            isActive={row.aktif}
                            onToggleActive={() => void toggleAktif(row)}
                            onDelete={() =>
                              setDeleteTarget({ id: row.id, label: row.ad })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : activeKaynak === "ayar-milyem" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metal</TableHead>
                      <TableHead>Ayar Kodu</TableHead>
                      <TableHead className="text-right">Ayar</TableHead>
                      <TableHead className="text-right">Milyem</TableHead>
                      <TableHead>Fiyat Kaynağı</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsAyarMilyem[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.metal_ad} ({row.metal_kod})
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.ayar_kodu}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.ayar_degeri}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {row.milyem}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {row.fiyat_kaynagi}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={`${row.metal_ad} ${row.ayar_kodu}`}
                            onView={() => setDetailRow(row)}
                            onEdit={() => openEditModal(row)}
                            onDelete={() =>
                              setDeleteTarget({
                                id: row.id,
                                label: `${row.metal_ad} ${row.ayar_kodu}`,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : activeKaynak === "metal-kurlari" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metal</TableHead>
                      <TableHead>Sağlayıcı</TableHead>
                      <TableHead>Kur Tipi</TableHead>
                      <TableHead className="text-right">Saf Birim Fiyat</TableHead>
                      <TableHead>Tarih / Açıklama</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsMetalKuru[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.metal_ad || row.metal_kod}</TableCell>
                        <TableCell className="text-xs">{row.saglayici_kod}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
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
                        <TableCell className="text-right">
                          <RowActions
                            onView={() => setDetailRow(row)}
                            onEdit={() => openEditModal(row)}
                            onDelete={() =>
                              setDeleteTarget({
                                id: row.id,
                                label: `${row.metal_kod} (${row.saf_birim_fiyat})`,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : activeKaynak === "doviz-kurlari" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Para Birimi</TableHead>
                      <TableHead>Sağlayıcı</TableHead>
                      <TableHead>Kur Tipi</TableHead>
                      <TableHead className="text-right">Kur</TableHead>
                      <TableHead>Tarih / Açıklama</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsDovizKuru[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.para_birimi}
                        </TableCell>
                        <TableCell className="text-xs">{row.saglayici_kod}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
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
                        <TableCell className="text-right">
                          <RowActions
                            onView={() => setDetailRow(row)}
                            onEdit={() => openEditModal(row)}
                            onDelete={() =>
                              setDeleteTarget({
                                id: row.id,
                                label: `${row.para_birimi} (${row.kur})`,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Birim Kodu</TableHead>
                      <TableHead>Birim Adı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(opsRows as OpsBirim[]).map((row) => (
                      <TableRow key={row.kod}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.kod}
                        </TableCell>
                        <TableCell className="font-medium">{row.ad}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ListPage>
          )}
        </div>
      </div>

      {canOps ? <OpsMarjPolitikasiCard /> : null}

      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => !open && setDetailRow(null)}
      >
        <DialogContent className={activeKaynak === "satis-kanallari" ? "max-w-2xl max-h-[85vh] overflow-y-auto" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle>{activeCategory.label} Detayı</DialogTitle>
            <DialogDescription>Seçili kayda ait özet bilgiler ve ilişkiler.</DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <div className="flex flex-col gap-3 pt-1 text-sm">
              {Object.entries(detailRow)
                .filter(([k]) => k !== "id" && !k.endsWith("_id"))
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-4 border-b border-border pb-2"
                  >
                    <span className="text-xs text-muted-foreground capitalize">
                      {k.replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-foreground font-medium text-right">
                      {typeof v === "boolean"
                        ? v
                          ? "Evet"
                          : "Hayır"
                        : v == null || v === ""
                          ? "—"
                          : String(v)}
                    </span>
                  </div>
                ))}

              {activeKaynak === "satis-kanallari" && canOps && selectedKanalId ? (
                <div className="border-t border-border pt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">
                        Kanalda Görünen Ürünler
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Bu satış kanalında görünmesini istediğiniz ürünleri işaretleyin.
                      </p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={channelProdOnlyAssigned}
                        onChange={(e) => setChannelProdOnlyAssigned(e.target.checked)}
                      />
                      Yalnız atananlar
                    </label>
                  </div>
                  <Input
                    value={channelProdSearch}
                    onChange={(e) => setChannelProdSearch(e.target.value)}
                    placeholder="Ürün kodu veya adı ara…"
                    className="h-8 text-xs"
                  />
                  {channelProductsQ.isLoading ? (
                    <div className="text-xs text-muted-foreground py-3">Ürünler yükleniyor…</div>
                  ) : (channelProductsQ.data?.results ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground py-3">Eşleşen ürün bulunamadı.</div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto rounded-[6px] border border-border divide-y divide-border">
                      {(channelProductsQ.data?.results ?? []).map((prod) => (
                        <label
                          key={prod.urun_id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{prod.ad}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {prod.platform_kodu || `#${prod.urun_id}`}
                              {prod.kategori_ad ? ` · ${prod.kategori_ad}` : ""}
                              {prod.ayar_kod ? ` · ${prod.ayar_kod}` : ""}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={prod.aktif}
                            disabled={setChannelProductMut.isPending}
                            onChange={(e) => {
                              void setChannelProductMut
                                .mutateAsync({
                                  kanalId: selectedKanalId,
                                  urunId: prod.urun_id,
                                  aktif: e.target.checked,
                                })
                                .then(() => {
                                  actionToast.success(
                                    e.target.checked
                                      ? "Ürün kanala eklendi"
                                      : "Ürün kanaldan kaldırıldı"
                                  );
                                })
                                .catch((err) => {
                                  actionToast.error("Kanal ürün ayarı güncellenemedi", err);
                                });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="pt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDetailRow(null)}>
                  Kapat
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <EntityModal
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingRow(null);
            setFormDirty(false);
            setFormError(null);
          }
        }}
        title={
          editingRow
            ? `${activeCategory.label} Düzenle`
            : `Yeni ${activeCategory.label}`
        }
        description="Form bilgilerini doldurup kaydedin."
        isDirty={formDirty}
        isSubmitting={isMutating}
        error={formError}
        onSubmit={onSubmitForm}
      >
        {activeKaynak === "satis-kanallari" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Kanal Tipi *</Label>
              <select
                value={formState.tip}
                onChange={(e) => updateField("tip", e.target.value)}
                disabled={isMutating}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                {(
                  refs?.kanal_tipleri ?? [
                    { kod: "KUYUMCU_PORTAL", ad: "Kuyumcu Portal" },
                    { kod: "B2B_API", ad: "B2B API" },
                    { kod: "B2C_API", ad: "B2C API" },
                  ]
                ).map((kt) => (
                  <option key={kt.kod} value={kt.kod}>
                    {kt.ad}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Kanal Adı *</Label>
              <Input
                required
                maxLength={80}
                value={formState.ad}
                onChange={(e) => updateField("ad", e.target.value)}
                placeholder="Kuyumcu Portalı"
                disabled={isMutating}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Fiyat Grubu</Label>
                <RelationSelect
                  value={formState.fiyat_grubu_id}
                  onChange={(val) => updateField("fiyat_grubu_id", String(val ?? ""))}
                  options={fiyatGrubuOptions}
                  placeholder="Fiyat grubu seçin…"
                  clearable
                  disabled={isMutating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Varsayılan Marj Kuralı</Label>
                <RelationSelect
                  value={formState.varsayilan_marj_kurali_id}
                  onChange={(val) =>
                    updateField("varsayilan_marj_kurali_id", String(val ?? ""))
                  }
                  options={marjKuraliOptions}
                  placeholder="Marj kuralı seçin…"
                  clearable
                  disabled={isMutating}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Kanal Kodu *</Label>
                <Input
                  required
                  maxLength={30}
                  value={formState.kod}
                  onChange={(e) => updateField("kod", e.target.value)}
                  placeholder="KUYUMCU_PORTAL"
                  className="font-mono text-xs"
                  disabled={isMutating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Teklif Süresi (sn)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formState.quote_ttl_saniye}
                  onChange={(e) => updateField("quote_ttl_saniye", e.target.value)}
                  placeholder="180"
                  disabled={isMutating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sıra</Label>
                <Input
                  type="number"
                  value={formState.sira}
                  onChange={(e) => updateField("sira", e.target.value)}
                  disabled={isMutating}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={formState.aktif}
                onChange={(e) => updateField("aktif", e.target.checked)}
                disabled={isMutating}
              />
              Kanal aktif (kullanıma açık)
            </label>
          </>
        ) : null}

        {activeKaynak === "fiyat-gruplari" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Grup Kodu</Label>
              <Input
                required
                maxLength={20}
                value={formState.kod}
                onChange={(e) => updateField("kod", e.target.value)}
                placeholder="VIP_KUYUMCU"
                className="font-mono text-xs"
                disabled={isMutating}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Grup Adı</Label>
              <Input
                required
                maxLength={80}
                value={formState.ad}
                onChange={(e) => updateField("ad", e.target.value)}
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
                  onChange={(e) => updateField("sira", e.target.value)}
                  disabled={isMutating}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.aktif}
                    onChange={(e) => updateField("aktif", e.target.checked)}
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
              <RelationSelect
                value={formState.metal_id}
                onChange={(val) => updateField("metal_id", String(val ?? ""))}
                options={metalOptions}
                placeholder="Metal seçiniz…"
                disabled={isMutating}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Ayar Kodu</Label>
                <Input
                  required
                  maxLength={15}
                  value={formState.ayar_kodu}
                  onChange={(e) => updateField("ayar_kodu", e.target.value)}
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
                  onChange={(e) => updateField("ayar_degeri", e.target.value)}
                  placeholder="14"
                  disabled={isMutating}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Milyem</Label>
                <Input
                  required
                  value={formState.milyem}
                  onChange={(e) => updateField("milyem", e.target.value)}
                  placeholder="0.585"
                  className="font-mono text-xs"
                  disabled={isMutating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Fiyat Kaynağı</Label>
                <select
                  value={formState.fiyat_kaynagi}
                  onChange={(e) => updateField("fiyat_kaynagi", e.target.value)}
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
                  <RelationSelect
                    value={formState.metal_id}
                    onChange={(val) => updateField("metal_id", String(val ?? ""))}
                    options={metalOptions}
                    placeholder="Metal seçiniz…"
                    disabled={isMutating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Kur Sağlayıcı</Label>
                  <RelationSelect
                    value={formState.saglayici_id}
                    onChange={(val) => updateField("saglayici_id", String(val ?? ""))}
                    options={saglayiciOptions}
                    placeholder="Varsayılan sağlayıcı"
                    clearable
                    disabled={isMutating}
                  />
                </div>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Kur Tipi</Label>
                <select
                  value={formState.kur_tipi}
                  onChange={(e) => updateField("kur_tipi", e.target.value)}
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
                  onChange={(e) => updateField("saf_birim_fiyat", e.target.value)}
                  placeholder="3150.00"
                  className="font-mono text-xs"
                  disabled={isMutating}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Açıklama / Neden</Label>
              <Input
                value={formState.manuel_neden}
                onChange={(e) => updateField("manuel_neden", e.target.value)}
                placeholder="Kur güncelleme açıklaması"
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
                    onChange={(e) => updateField("para_birimi", e.target.value)}
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
                  <RelationSelect
                    value={formState.saglayici_id}
                    onChange={(val) => updateField("saglayici_id", String(val ?? ""))}
                    options={saglayiciOptions}
                    placeholder="Varsayılan sağlayıcı"
                    clearable
                    disabled={isMutating}
                  />
                </div>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Kur Tipi</Label>
                <select
                  value={formState.kur_tipi}
                  onChange={(e) => updateField("kur_tipi", e.target.value)}
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
                  onChange={(e) => updateField("kur", e.target.value)}
                  placeholder="35.8000"
                  className="font-mono text-xs"
                  disabled={isMutating}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Açıklama / Neden</Label>
              <Input
                value={formState.manuel_neden}
                onChange={(e) => updateField("manuel_neden", e.target.value)}
                placeholder="Kur güncelleme açıklaması"
                disabled={isMutating}
              />
            </div>
          </>
        ) : null}
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Kaydı Sil"
        description={
          deleteTarget
            ? `"${deleteTarget.label}" kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
            : ""
        }
        confirmLabel="Evet, Sil"
        variant="destructive"
        loading={deleteMut.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
