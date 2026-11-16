"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { urunlerService } from "../services";
import {
  useCatalogQuery,
  useCatalogRefsQuery,
  useCategoriesQuery,
  useCreateCatalogRefMutation,
  useCreateOpsProductMutation,
  useDeleteOpsProductMutation,
  useMonturlerQuery,
  useTaslarQuery,
  useOpsCategoriesQuery,
  useOpsProductActionMutation,
  useOpsProductChannelsQuery,
  useOpsProductsQuery,
  urunlerKeys,
} from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useActionToast } from "@/hooks/use-action-toast";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type {
  BuyerCatalogDetail,
  BuyerCatalogItem,
  CategoryItem,
  OpsProduct,
  OpsProductVariant,
} from "../types";
import { fiyatlamaService, rememberQuoteId } from "@/features/fiyatlama";
import { siparisKeys, siparisService } from "@/features/siparis";
import { useSalesChannelsQuery } from "@/features/tanimlar";
import { formatGram, formatMoney, pickDisplayPrice } from "@/lib/format";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
} from "@/components/crud";
import { ProductP0Panel } from "./product-p0-panel";
import { VariantCompareModal } from "./variant-compare-modal";
import {
  BuyerCatalogGrid,
  BuyerProductDetailView,
} from "./buyer-storefront";
import {
  OpsProductWorkspace,
  type OpsWorkspaceTab,
} from "./ops-product-workspace";
import { MonturTasComposePanel } from "./montur-tas-compose-panel";
import { MonturTasCatalogGrid } from "./montur-tas-catalog-grid";
import { OpsProductCreateWizard } from "./ops-product-create-wizard";
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
  Eye,
  Gem,
  Tag,
  ShoppingCart,
  Check,
  Scale,
  LayoutGrid,
  List,
  Plus,
  Star,
  RefreshCw,
} from "lucide-react";

type ViewMode = "table" | "cards";
type Scope = "buyer" | "monturler" | "taslar" | "ops" | "imalat";
type DetailTab = OpsWorkspaceTab;

const PAGE_SIZE = 20;


interface VariantFormState {
  gram: string;
  renk_id: string;
  beden_id: string;
  ek_bedel: string;
  sabit_fiyat: string;
  tedarikci_sku: string;
  benzersiz_parca: boolean;
  aktif: boolean;
}

function emptyVariantForm(): VariantFormState {
  return {
    gram: "",
    renk_id: "",
    beden_id: "",
    ek_bedel: "",
    sabit_fiyat: "",
    tedarikci_sku: "",
    benzersiz_parca: false,
    aktif: true,
  };
}

function variantToForm(v: OpsProductVariant): VariantFormState {
  return {
    gram: v.gram ?? "",
    renk_id: v.renk_id ? String(v.renk_id) : "",
    beden_id: v.beden_id ? String(v.beden_id) : "",
    ek_bedel: v.ek_bedel ?? "",
    sabit_fiyat: v.sabit_fiyat ?? "",
    tedarikci_sku: v.tedarikci_sku ?? "",
    benzersiz_parca: Boolean(v.benzersiz_parca),
    aktif: Boolean(v.aktif),
  };
}

export function CatalogView() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const actionToast = useActionToast();
  const queryClient = useQueryClient();
  const isPlatform = Boolean(user?.firma?.platform_mu);
  /** Liste/görüntüleme: platform ops veya yazma yetkili tedarikçi */
  const canOps = Boolean(
    (user?.capabilities?.can_view_ops && isPlatform) ||
      (user?.capabilities?.can_submit_urun && user?.firma?.tedarikci_mi)
  );
  /** Sihirbaz / create — submit_urun gerekir */
  const canOpsWrite = Boolean(user?.capabilities?.can_submit_urun);
  const canCatalog = Boolean(user?.capabilities?.can_view_catalog || canOps);
  const canQuote = Boolean(
    user?.capabilities?.can_lock_quote || user?.capabilities?.can_view_cart
  );

  const { get, setMany, page } = useUrlState();
  const scopeParam = get("scope");
  /** Eski tanım sekmeleri → /tanimlar (hook sonrası Navigate). */
  const redirectToTanimlar =
    scopeParam === "referanslar"
      ? "/tanimlar?grup=koleksiyon"
      : scopeParam === "kategoriler"
        ? "/tanimlar?grup=kategoriler"
        : null;
  const scope: Scope =
    scopeParam === "ops" && canOps
      ? "ops"
      : scopeParam === "monturler"
        ? "monturler"
        : scopeParam === "taslar"
          ? "taslar"
          : scopeParam === "imalat"
            ? "imalat"
            : scopeParam === "buyer"
              ? "buyer"
              : canOps
                ? "ops"
                : "buyer";

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [createWizardOpen, setCreateWizardOpen] = useState(false);

  useEffect(() => {
    setViewMode(scope === "ops" ? "table" : "cards");
  }, [scope]);

  const q = get("q");
  const ordering = get("ordering", scope === "ops" ? "vitrin" : "vitrin") || "vitrin";
  const yayinDurumu = get("yayin");
  const kategoriFilter = get("kategori");
  const eksikGorsel = get("eksik_gorsel");
  const eksikVaryant = get("eksik_varyant");
  const kanalParam = get("kanal");
  const [qInput, setQInput] = useState(q);
  const [cardPrices, setCardPrices] = useState<
    Record<
      number,
      {
        loading?: boolean;
        price?: string;
        currency?: string;
        quoteId?: number;
        error?: string;
        gram?: string | null;
        expiresAt?: string | null;
        adding?: boolean;
        added?: boolean;
      }
    >
  >({});
  const [selectedBuyerVariantId, setSelectedBuyerVariantId] = useState<number | null>(
    null
  );
  const detailReqSeq = useRef(0);

  const createOpsMutation = useCreateOpsProductMutation();
  const deleteOpsMutation = useDeleteOpsProductMutation();
  const opsActionMutation = useOpsProductActionMutation();
  const createCatalogRefMutation = useCreateCatalogRefMutation();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("general");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [buyerDetail, setBuyerDetail] = useState<BuyerCatalogDetail | null>(null);
  const [opsDetail, setOpsDetail] = useState<OpsProduct | null>(null);

  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Unified Create / Edit Product modal

  // Unified Create / Edit Variant modal
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<OpsProductVariant | null>(null);
  const [variantForm, setVariantForm] = useState<VariantFormState>(emptyVariantForm);
  const [variantDirty, setVariantDirty] = useState(false);
  const [variantFormError, setVariantFormError] = useState<string | null>(null);

  // Quick-add Renk / Olcu inside variant modal
  const [quickRefKind, setQuickRefKind] = useState<"renk" | "olcu" | null>(null);
  const [quickRefKod, setQuickRefKod] = useState("");
  const [quickRefAd, setQuickRefAd] = useState("");
  const [quickRefVal, setQuickRefVal] = useState("");

  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"view" | "edit">("edit");

  // Confirmations
  const [deleteProductTarget, setDeleteProductTarget] = useState<OpsProduct | null>(null);
  const [deleteVariantTarget, setDeleteVariantTarget] = useState<OpsProductVariant | null>(
    null
  );

  const [quoteState, setQuoteState] = useState<
    Record<
      number,
      {
        loading: boolean;
        price?: string;
        currency?: string;
        quoteId?: number;
        expiresAt?: string | null;
        adding?: boolean;
        added?: boolean;
        error?: string;
      }
    >
  >({});

  useEffect(() => {
    setQInput(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qInput.trim();
      if (next === q) return;
      setMany({ q: next || undefined, page: 1 });
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput, q, setMany]);

  const catalogFilters = useMemo(
    () => ({
      q: q || undefined,
      ordering: ordering || undefined,
      kategori_id: kategoriFilter || undefined,
      page: String(page),
      page_size: String(PAGE_SIZE),
    }),
    [q, ordering, kategoriFilter, page]
  );

  const opsFilters = useMemo(
    () => ({
      ...catalogFilters,
      yayin_durumu: yayinDurumu || undefined,
      eksik_gorsel: eksikGorsel || undefined,
      eksik_varyant: eksikVaryant || undefined,
    }),
    [catalogFilters, yayinDurumu, eksikGorsel, eksikVaryant]
  );

  useEffect(() => {
    if (!variantDirty && !workspaceDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [variantDirty, workspaceDirty]);

  const catalogQuery = useCatalogQuery(
    catalogFilters,
    scope === "buyer" && (canCatalog || canOps)
  );
  const monturlerQuery = useMonturlerQuery(
    catalogFilters,
    scope === "monturler" && (canCatalog || canOps)
  );
  const taslarQuery = useTaslarQuery(
    catalogFilters,
    scope === "taslar" && (canCatalog || canOps)
  );
  const opsQuery = useOpsProductsQuery(opsFilters, scope === "ops" && canOps);

  const buyerCatsQ = useCategoriesQuery({ page_size: "100" }, canCatalog || canOps);
  const opsCatsQ = useOpsCategoriesQuery(
    { aktif: "true", page_size: "100" },
    canOps && scope === "ops"
  );
  const refsQ = useCatalogRefsQuery(
    canOps && (scope === "ops" || variantModalOpen || detailOpen)
  );
  const channelsQ = useSalesChannelsQuery(
    (canCatalog || canOps) &&
      (scope === "buyer" ||
        scope === "ops" ||
        scope === "imalat" ||
        scope === "monturler" ||
        scope === "taslar")
  );
  const channelList = channelsQ.data?.results ?? [];
  const selectedKanalId = useMemo(() => {
    if (kanalParam && channelList.some((c) => String(c.id) === kanalParam)) {
      return Number(kanalParam);
    }
    return channelList[0]?.id ?? null;
  }, [kanalParam, channelList]);

  useEffect(() => {
    setQuoteState({});
    setCardPrices({});
  }, [selectedKanalId]);

  const prodChannelsQ = useOpsProductChannelsQuery(
    opsDetail?.id,
    Boolean(opsDetail?.id) && detailOpen && canOps
  );

  const buyerItems = catalogQuery.data?.results || [];
  const buyerItemsKey = useMemo(
    () =>
      buyerItems
        .map((it) => `${it.id}:${it.varsayilan_varyant_id ?? ""}`)
        .join("|"),
    [buyerItems]
  );
  const monturItems = monturlerQuery.data?.results || [];
  const tasItems = taslarQuery.data?.results || [];
  const opsItems = opsQuery.data?.results || [];

  const totalCount =
    scope === "ops"
      ? opsQuery.data?.count ?? 0
      : scope === "monturler"
        ? monturlerQuery.data?.count ?? 0
        : scope === "taslar"
          ? taslarQuery.data?.count ?? 0
          : catalogQuery.data?.count ?? 0;

  const pageSize =
    (scope === "ops"
      ? opsQuery.data?.page_size
      : scope === "monturler"
        ? monturlerQuery.data?.page_size
        : scope === "taslar"
          ? taslarQuery.data?.page_size
          : catalogQuery.data?.page_size) || PAGE_SIZE;

  const loading =
    scope === "ops"
      ? opsQuery.isLoading || opsQuery.isFetching
      : scope === "monturler"
        ? monturlerQuery.isLoading || monturlerQuery.isFetching
        : scope === "taslar"
          ? taslarQuery.isLoading || taslarQuery.isFetching
          : catalogQuery.isLoading || catalogQuery.isFetching;

  const listErrorObj =
    scope === "ops"
      ? opsQuery.error
      : scope === "monturler"
        ? monturlerQuery.error
        : scope === "taslar"
          ? taslarQuery.error
          : catalogQuery.error;

  const fetchList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: urunlerKeys.all });
  }, [queryClient]);

  const openBuyerDetail = async (id: number) => {
    const seq = ++detailReqSeq.current;
    setDetailOpen(true);
    setDetailTab("variants");
    setLoadingDetail(true);
    setBuyerDetail(null);
    setOpsDetail(null);
    setQuoteState({});
    setSelectedBuyerVariantId(null);
    try {
      const d = await urunlerService.getProductDetail(id);
      if (seq !== detailReqSeq.current) return;
      setBuyerDetail(d);
      setSelectedBuyerVariantId(d.varyantlar?.[0]?.id ?? null);
    } catch (err) {
      if (seq !== detailReqSeq.current) return;
      actionToast.error("Ürün detayı alınamadı", err);
      setDetailOpen(false);
    } finally {
      if (seq === detailReqSeq.current) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (scope !== "buyer" || !canQuote || !selectedKanalId || !buyerItems.length) {
      return;
    }
    const pairs = buyerItems
      .map((it) => ({
        urunId: it.id,
        vid: it.varsayilan_varyant_id,
      }))
      .filter((p): p is { urunId: number; vid: number } => Boolean(p.vid));
    if (!pairs.length) return;
    let cancelled = false;
    setCardPrices((prev) => {
      const next = { ...prev };
      for (const p of pairs) next[p.urunId] = { loading: true };
      return next;
    });
    void fiyatlamaService
      .batchQuotes({
        satis_kanali_id: selectedKanalId,
        varyant_ids: pairs.map((p) => p.vid),
      })
      .then((res) => {
        if (cancelled) return;
        const byVid = new Map(res.results.map((r) => [r.varyant_id, r]));
        setCardPrices((prev) => {
          const next = { ...prev };
          for (const p of pairs) {
            const r = byVid.get(p.vid);
            if (!r) {
              next[p.urunId] = { error: "Fiyat alınamadı" };
              continue;
            }
            if (!r.ok || !r.quote) {
              next[p.urunId] = {
                error: r.detail || r.reason_code || "Fiyat üretilemedi",
              };
              continue;
            }
            const price = pickDisplayPrice({
              toplam: r.quote.toplam_vergisiz,
              gram_basi: r.quote.gram_basi_vergisiz,
            });
            if (!price) {
              next[p.urunId] = { error: "Fiyat bilgisi alınamadı" };
              continue;
            }
            next[p.urunId] = {
              price,
              currency: r.quote.para_birimi,
              quoteId: r.quote.id,
              gram: r.quote.gram ?? null,
              expiresAt: r.quote.expires_at ?? null,
            };
          }
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Fiyatlar yüklenemedi";
        setCardPrices((prev) => {
          const next = { ...prev };
          for (const p of pairs) next[p.urunId] = { error: msg };
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, canQuote, selectedKanalId, buyerItemsKey]);

  const openOpsDetail = async (
    id: number,
    opts?: { resetTab?: boolean; soft?: boolean; mode?: "view" | "edit" }
  ) => {
    const seq = ++detailReqSeq.current;
    setDetailOpen(true);
    if (opts?.mode) setWorkspaceMode(opts.mode);
    const soft = Boolean(opts?.soft) || opsDetail?.id === id;
    if (opts?.resetTab !== false && !soft) {
      setDetailTab("general");
    }
    if (!soft) {
      setLoadingDetail(true);
      setBuyerDetail(null);
      setOpsDetail(null);
      setWorkspaceDirty(false);
    }
    try {
      const d = await urunlerService.getOpsProduct(id);
      if (seq !== detailReqSeq.current) return;
      setOpsDetail(d);
    } catch (err) {
      if (seq !== detailReqSeq.current) return;
      actionToast.error("Ürün detayı alınamadı", err);
      if (!soft) setDetailOpen(false);
    } finally {
      if (seq === detailReqSeq.current) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!routeId) return;
    const n = Number(routeId);
    if (!Number.isFinite(n) || n <= 0) return;
    if (scope === "ops" && canOps) openOpsView(n);
    else void openBuyerDetail(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleGetQuote = async (variantId: number) => {
    setQuoteState((prev) => ({ ...prev, [variantId]: { loading: true } }));
    try {
      if (!selectedKanalId) throw new Error("Satış kanalı seçin.");
      const quote = await fiyatlamaService.createQuote({
        varyant_id: variantId,
        satis_kanali_id: selectedKanalId,
      });
      const price = pickDisplayPrice({
        toplam: quote.toplam_vergisiz,
        gram_basi: quote.gram_basi_vergisiz,
        birim: quote.birim_fiyat,
      });
      if (!price) throw new Error("Fiyat bilgisi alınamadı.");
      rememberQuoteId(quote.id);
      setQuoteState((prev) => ({
        ...prev,
        [variantId]: {
          loading: false,
          price,
          currency: quote.para_birimi,
          quoteId: quote.id,
          expiresAt: quote.expires_at ?? null,
        },
      }));
    } catch (err) {
      setQuoteState((prev) => ({
        ...prev,
        [variantId]: {
          loading: false,
          error: err instanceof Error ? err.message : "Fiyat alınamadı",
        },
      }));
    }
  };

  useEffect(() => {
    if (!buyerDetail || !selectedBuyerVariantId || !canQuote || !selectedKanalId) {
      return;
    }
    const st = quoteState[selectedBuyerVariantId];
    if (st?.price || st?.loading || st?.error) return;
    void handleGetQuote(selectedBuyerVariantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerDetail?.id, selectedBuyerVariantId, selectedKanalId, canQuote]);

  const handleAddToCart = async (
    variantId: number,
    quoteId: number,
    opts?: { productId?: number; expiresAt?: string | null }
  ) => {
    const alreadyAdding =
      quoteState[variantId]?.adding ||
      (opts?.productId != null && cardPrices[opts.productId]?.adding);
    if (alreadyAdding) return;

    if (opts?.productId != null) {
      setCardPrices((prev) => ({
        ...prev,
        [opts.productId!]: { ...prev[opts.productId!], adding: true },
      }));
    }
    setQuoteState((prev) => {
      const cur = prev[variantId] ?? { loading: false };
      return { ...prev, [variantId]: { ...cur, adding: true } };
    });
    try {
      await siparisService.addCartLine(quoteId, "1");
      void queryClient.invalidateQueries({ queryKey: siparisKeys.all });
      setQuoteState((prev) => {
        const cur = prev[variantId] ?? { loading: false };
        return {
          ...prev,
          [variantId]: { ...cur, adding: false, added: true },
        };
      });
      if (opts?.productId != null) {
        setCardPrices((prev) => ({
          ...prev,
          [opts.productId!]: {
            ...prev[opts.productId!],
            adding: false,
            added: true,
          },
        }));
      }
      actionToast.success("Sipariş listesine eklendi");
      navigate("/siparis?tab=cart");
    } catch (err) {
      setQuoteState((prev) => {
        const cur = prev[variantId] ?? { loading: false };
        return { ...prev, [variantId]: { ...cur, adding: false } };
      });
      if (opts?.productId != null) {
        setCardPrices((prev) => ({
          ...prev,
          [opts.productId!]: { ...prev[opts.productId!], adding: false },
        }));
      }
      actionToast.error("Sipariş listesine eklenemedi", err);
    }
  };

  /** Yeni ürün = görsel sihirbaz (ADR-0044 tip → rol → alanlar → özet). */
  const openCreateProduct = async () => {
    try {
      let refs = refsQ.data;
      if (!refs) {
        refs = await urunlerService.getCatalogRefs();
      }
      const cats =
        (opsCatsQ.data?.results ?? []).filter((c) => c.aktif !== false) || [];
      const ayarlar = refs?.ayarlar ?? [];
      const metaller = refs?.metaller ?? [];
      if (!cats.length) {
        actionToast.error(
          "Kategori gerekli",
          "Önce Tanımlar & Kanallar → Kategoriler’den en az bir kategori tanımlayın."
        );
        navigate("/tanimlar?grup=kategoriler");
        return;
      }
      if (!ayarlar.length || !metaller.length) {
        actionToast.error(
          "Metal / ayar gerekli",
          "Önce Tanımlar & Kanallar → Metal / Materyal ve Ayar / Milyem tanımlayın."
        );
        return;
      }
      setCreateWizardOpen(true);
    } catch (err) {
      actionToast.error("Yeni ürün açılamadı", err);
    }
  };

  /** Ops: aynı detay modalında düzenle; yayındaysa önce pasife al. */
  const startEditProduct = async (item: OpsProduct) => {
    const acts = item.allowed_actions || [];
    try {
      if (!acts.includes("edit") && acts.includes("unpublish")) {
        await opsActionMutation.mutateAsync({
          action: "unpublish",
          id: item.id,
        });
        actionToast.success("Ürün düzenleme için yayından alındı");
      }
      await openOpsDetail(item.id, { mode: "edit", resetTab: true });
      setDetailTab("general");
      setWorkspaceDirty(false);
    } catch (err) {
      actionToast.error("Düzenleme açılamadı", err);
    }
  };

  const openOpsView = (id: number) => {
    void openOpsDetail(id, { mode: "view" });
  };

  const canOpsEditProduct = (item: OpsProduct) => {
    const acts = item.allowed_actions || [];
    return acts.includes("edit") || acts.includes("unpublish");
  };

  const canOpsDeleteProduct = (item: OpsProduct) =>
    (item.allowed_actions || []).includes("delete");


  const openCreateVariant = () => {
    setEditingVariant(null);
    setVariantForm(emptyVariantForm());
    setVariantDirty(false);
    setVariantFormError(null);
    setQuickRefKind(null);
    setVariantModalOpen(true);
  };

  const openEditVariant = (v: OpsProductVariant) => {
    setEditingVariant(v);
    setVariantForm(variantToForm(v));
    setVariantDirty(false);
    setVariantFormError(null);
    setQuickRefKind(null);
    setVariantModalOpen(true);
  };

  const onSubmitVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opsDetail) return;
    setVariantFormError(null);
    try {
      if (editingVariant) {
        await opsActionMutation.mutateAsync({
          action: "updateVariant",
          id: opsDetail.id,
          variantId: editingVariant.id,
          variantUpdate: {
            gram: variantForm.gram.trim() || undefined,
            renk_id: variantForm.renk_id ? Number(variantForm.renk_id) : null,
            beden_id: variantForm.beden_id ? Number(variantForm.beden_id) : null,
            ek_bedel: variantForm.ek_bedel.trim() || undefined,
            sabit_fiyat: variantForm.sabit_fiyat.trim() || undefined,
            tedarikci_sku: variantForm.tedarikci_sku.trim(),
            benzersiz_parca: variantForm.benzersiz_parca,
            aktif: variantForm.aktif,
          },
        });
        actionToast.success("Varyant güncellendi");
      } else {
        await opsActionMutation.mutateAsync({
          action: "addVariant",
          id: opsDetail.id,
          variant: {
            tip: "HAM_ALTIN",
            gram: variantForm.gram.trim() || undefined,
            renk_id: variantForm.renk_id ? Number(variantForm.renk_id) : undefined,
            beden_id: variantForm.beden_id ? Number(variantForm.beden_id) : undefined,
            ek_bedel: variantForm.ek_bedel.trim() || undefined,
            sabit_fiyat: variantForm.sabit_fiyat.trim() || undefined,
            tedarikci_sku: variantForm.tedarikci_sku.trim() || undefined,
            benzersiz_parca: variantForm.benzersiz_parca,
          },
        });
        actionToast.success("Varyant eklendi");
      }
      setVariantModalOpen(false);
      await openOpsDetail(opsDetail.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Varyant kaydedilemedi.";
      setVariantFormError(msg);
      actionToast.error("Varyant kaydedilemedi", err);
    }
  };

  const handleQuickRefSave = async () => {
    try {
      if (quickRefKind === "renk") {
        const res = await createCatalogRefMutation.mutateAsync({
          kaynak: "renk",
          kod: quickRefKod.trim().toUpperCase(),
          ad: quickRefAd.trim(),
        });
        if (res.id) {
          setVariantForm((f) => ({ ...f, renk_id: String(res.id) }));
          setVariantDirty(true);
        }
        actionToast.success("Yeni renk eklendi");
      } else if (quickRefKind === "olcu") {
        const res = await createCatalogRefMutation.mutateAsync({
          kaynak: "olcu",
          tip: opsDetail?.olcu_tipi || "yuzuk_no",
          sayisal_deger: quickRefVal.trim(),
          deger: quickRefAd.trim() || quickRefVal.trim(),
        });
        if (res.id) {
          setVariantForm((f) => ({ ...f, beden_id: String(res.id) }));
          setVariantDirty(true);
        }
        actionToast.success("Yeni ölçü değeri eklendi");
      }
      setQuickRefKind(null);
      setQuickRefKod("");
      setQuickRefAd("");
      setQuickRefVal("");
    } catch (err) {
      actionToast.error("Referans eklenemedi", err);
    }
  };

  const runOpsAction = async (
    action: "publish" | "unpublish",
    id: number
  ) => {
    try {
      await opsActionMutation.mutateAsync({
        action,
        id,
        durum: action === "publish" ? "aktif" : undefined,
      });
      actionToast.success("Ürün durumu güncellendi");
      if (opsDetail?.id === id) await openOpsDetail(id);
    } catch (err) {
      actionToast.error("İşlem başarısız", err);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProductTarget) return;
    try {
      await deleteOpsMutation.mutateAsync(deleteProductTarget.id);
      actionToast.success("Ürün silindi");
      setDeleteProductTarget(null);
      if (opsDetail?.id === deleteProductTarget.id) {
        setDetailOpen(false);
        setOpsDetail(null);
      }
    } catch (err) {
      actionToast.error("Ürün silinemedi", err);
      setDeleteProductTarget(null);
    }
  };

  const confirmDeleteVariant = async () => {
    if (!opsDetail || !deleteVariantTarget) return;
    try {
      await opsActionMutation.mutateAsync({
        action: "deleteVariant",
        id: opsDetail.id,
        variantId: deleteVariantTarget.id,
      });
      actionToast.success("Varyant silindi");
      setDeleteVariantTarget(null);
      await openOpsDetail(opsDetail.id);
    } catch (err) {
      actionToast.error("Varyant silinemedi", err);
      setDeleteVariantTarget(null);
    }
  };

  const toggleCompare = (id: number) => {
    setSelectedForCompare((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : prev.length < 4
          ? [...prev, id]
          : prev
    );
  };

  const activeCategoryFilterList = useMemo(
    () => (scope === "ops" ? opsCatsQ.data?.results : buyerCatsQ.data?.results) ?? [],
    [scope, opsCatsQ.data, buyerCatsQ.data]
  );


  const renkOptions = useMemo(
    () =>
      (refsQ.data?.renkler ?? []).map((r) => ({
        value: String(r.id),
        label: r.ad || r.kod || String(r.id),
        subtitle: r.kod,
      })),
    [refsQ.data]
  );

  const bedenOptions = useMemo(
    () =>
      (refsQ.data?.olculer ?? []).map((o) => ({
        value: String(o.id),
        label: o.deger || o.sayisal_deger || String(o.id),
        subtitle: o.tip,
      })),
    [refsQ.data]
  );

  const activeDetail = opsDetail || buyerDetail;
  const actions = opsDetail?.allowed_actions || [];

  if (redirectToTanimlar) {
    return <Navigate to={redirectToTanimlar} replace />;
  }

  return (
    <div className="flex flex-col gap-5">
      {canOpsWrite ? (
        <OpsProductCreateWizard
          open={createWizardOpen}
          onOpenChange={setCreateWizardOpen}
          categories={opsCatsQ.data?.results ?? []}
          refs={refsQ.data}
          satisKanaliId={selectedKanalId}
          isPlatform={isPlatform}
          lockedFirma={
            user?.firma && !isPlatform
              ? { id: user.firma.id, ad: user.firma.ad || "" }
              : null
          }
          onCreated={(id, meta) => {
            const pct = meta?.hazirlikYuzde;
            actionToast.success(
              pct != null
                ? `Ürün kaydedildi · Hazırlık %${pct}`
                : "Ürün kaydedildi — düzenlemeye devam edin"
            );
            setWorkspaceDirty(false);
            setDetailTab("variants");
            void openOpsDetail(id, { mode: "edit" });
            void queryClient.invalidateQueries({ queryKey: urunlerKeys.ops() });
          }}
          onError={(title, err) => actionToast.error(title, err)}
        />
      ) : null}
      {/* Sekme geçiş çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap rounded-[6px] border border-border bg-muted/40 p-1">
          {(
            [
              canOps ? ["ops", "Ürün Yönetimi"] : null,
              ["buyer", "Satış Kataloğu"],
              ["monturler", "Montürler"],
              ["taslar", "Taşlar"],
              canCatalog || canOps ? ["imalat", "İmalat"] : null,
            ].filter(Boolean) as Array<[Scope, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setMany({
                  scope: key,
                  page: 1,
                  ordering: "vitrin",
                  yayin: undefined,
                });
              }}
            >
              {label}
            </button>
          ))}
          {canOps ? (
            <Link
              to="/tanimlar?grup=kategoriler"
              className="ml-1 rounded-[4px] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Tanımlar →
            </Link>
          ) : null}
        </div>
      </div>

      {scope === "imalat" ? (
        <MonturTasComposePanel
          enabled={canCatalog || canOps}
          satisKanaliId={selectedKanalId}
          channelList={channelList}
          onKanalChange={(kanal) =>
            setMany({ kanal, page: 1 })
          }
        />
      ) : null}

      {scope !== "imalat" ? (
      <ListPage
          title={
            scope === "ops"
              ? "Ürün Yönetimi"
              : scope === "monturler"
                ? "Montür Kataloğu"
                : scope === "taslar"
                  ? "Taş Kataloğu"
                  : "Satış Kataloğu"
          }
          description={
            scope === "ops"
              ? "Yeni Ürün sihirbazı: tip (ürün/montür/taş) → görsel alanlar → özet → kaydet. Detay sonra workspace’te."
              : scope === "monturler"
                ? "Yayındaki montür ürünleri. Eşleştirme için İmalat sekmesini kullanın."
                : scope === "taslar"
                  ? "Her türlü taş (değerli olmak zorunda değil). Montür ile birleştirmek için İmalat’ı kullanın."
                  : "Onaylı ve yayındaki ürünleri inceleyin; Sipariş Ver ile miktarlı siparişinizi oluşturun."
          }
          createLabel={scope === "ops" && canOpsWrite ? "Yeni Ürün" : undefined}
          onCreate={
            scope === "ops" && canOpsWrite
              ? () => void openCreateProduct()
              : undefined
          }
          contentClassName={
            (scope === "buyer" ||
              scope === "monturler" ||
              scope === "taslar") &&
            viewMode === "cards"
              ? "bg-transparent overflow-visible"
              : undefined
          }
          loading={loading}
          error={
            listErrorObj
              ? listErrorObj instanceof Error
                ? listErrorObj.message
                : "Katalog verileri alınamadı."
              : null
          }
          onRetry={() => void fetchList()}
          searchValue={qInput}
          onSearchChange={setQInput}
          searchPlaceholder="Ad, platform kodu veya SKU ara…"
          filters={
            <>
              <select
                  value={kategoriFilter}
                  onChange={(e) => {
                    setMany({ kategori: e.target.value || undefined, page: 1 });
                  }}
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  aria-label="Kategori filtresi"
                >
                  <option value="">Tüm Kategoriler</option>
                  {activeCategoryFilterList.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.one_cikan ? "★ " : ""}
                      {c.tam_ad || c.ad}
                    </option>
                  ))}
                </select>
              <select
                  value={ordering}
                  onChange={(e) => setMany({ ordering: e.target.value, page: 1 })}
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  aria-label="Sıralama"
                >
                  <option value="vitrin">Vitrin Sırası (Öne Çıkanlar)</option>
                  <option value="-pk">En Yeni Eklenen</option>
                  <option value="ad">Ürün Adı (A → Z)</option>
                  <option value="-ad">Ürün Adı (Z → A)</option>
                  <option value="platform_kodu">Ürün Kodu (A → Z)</option>
                </select>
              {scope === "ops" ? (
                <>
                  <select
                    value={yayinDurumu}
                    onChange={(e) =>
                      setMany({ yayin: e.target.value || undefined, page: 1 })
                    }
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Tüm Yayın Durumları</option>
                    <option value="aktif">Yayında</option>
                    <option value="pasif">Pasif</option>
                  </select>
                  <label className="flex h-9 items-center gap-1.5 rounded-[6px] border border-border px-2 text-xs">
                    <input
                      type="checkbox"
                      checked={eksikGorsel === "1"}
                      onChange={(e) =>
                        setMany({
                          eksik_gorsel: e.target.checked ? "1" : undefined,
                          page: 1,
                        })
                      }
                    />
                    Eksik görsel
                  </label>
                  <label className="flex h-9 items-center gap-1.5 rounded-[6px] border border-border px-2 text-xs">
                    <input
                      type="checkbox"
                      checked={eksikVaryant === "1"}
                      onChange={(e) =>
                        setMany({
                          eksik_varyant: e.target.checked ? "1" : undefined,
                          page: 1,
                        })
                      }
                    />
                    Eksik varyant
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-[6px] border border-border px-2 text-xs hover:bg-muted/50"
                    onClick={() => {
                      void (async () => {
                        try {
                          const blob = await urunlerService.downloadOpsProductsCsv(
                            opsFilters
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "urunler.csv";
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
                        } catch (err) {
                          actionToast.error("CSV indirilemedi", err);
                        }
                      })();
                    }}
                  >
                    CSV dışa aktar
                  </button>
                </>
              ) : null}
              {scope === "buyer" ? (
                <select
                  value={selectedKanalId != null ? String(selectedKanalId) : ""}
                  onChange={(e) =>
                    setMany({ kanal: e.target.value || undefined, page: 1 })
                  }
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  aria-label="Satış kanalı"
                >
                  {channelList.length === 0 ? (
                    <option value="">Kanal yok</option>
                  ) : (
                    channelList.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.ad || c.kod || `Kanal #${c.id}`}
                      </option>
                    ))
                  )}
                </select>
              ) : null}
              {scope === "buyer" ||
              scope === "ops" ||
              scope === "monturler" ||
              scope === "taslar" ? (
                <div className="flex rounded-[6px] border border-border p-0.5">
                  <button
                    type="button"
                    className={`rounded-[4px] p-1.5 ${viewMode === "table" ? "bg-secondary" : ""}`}
                    onClick={() => setViewMode("table")}
                    aria-label="Liste / tablo görünümü"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className={`rounded-[4px] p-1.5 ${viewMode === "cards" ? "bg-secondary" : ""}`}
                    onClick={() => setViewMode("cards")}
                    aria-label="Kart görünümü"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </>
          }
          isEmpty={
            (scope === "buyer"
              ? buyerItems
              : scope === "monturler"
                ? monturItems
                : scope === "taslar"
                  ? tasItems
                  : opsItems
            ).length === 0
          }
          emptyTitle="Kayıt bulunamadı"
          emptyDescription={
            q || yayinDurumu || kategoriFilter
              ? "Arama veya filtre ölçütlerine uygun kayıt yok."
              : "Henüz ürün bulunmuyor."
          }
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={(p) => setMany({ page: p })}
        >
          {scope === "monturler" || scope === "taslar" ? (
            viewMode === "cards" ? (
              <div className="py-1">
                <MonturTasCatalogGrid
                  kind={scope === "monturler" ? "montur" : "tas"}
                  items={scope === "monturler" ? monturItems : tasItems}
                  onOpen={(id) => {
                    if (canOps) openOpsView(id);
                    else void openBuyerDetail(id);
                  }}
                  onCompose={() => {
                    setMany({
                      scope: "imalat",
                      page: 1,
                      ordering: "vitrin",
                      yayin: undefined,
                    });
                  }}
                />
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün Kodu</TableHead>
                  <TableHead>
                    {scope === "monturler" ? "Montür" : "Taş"}
                  </TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Ayar</TableHead>
                  <TableHead>Seçenekler</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(scope === "monturler" ? monturItems : tasItems).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">
                      {"platform_kodu" in m ? m.platform_kodu || "—" : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{m.ad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {"kategori" in m ? m.kategori || "—" : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {"ayar" in m ? m.ayar || "—" : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(m.varyantlar || []).slice(0, 4).map((v) => (
                          <Badge
                            key={v.id}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {v.sku}
                            {v.gram ? ` (${v.gram}g)` : ""}
                            {v.kesim_kod ? ` · ${v.kesim_kod}` : ""}
                            {v.karat ? ` · ${v.karat}ct` : ""}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {canOps ? (
                          <RowActions
                            itemLabel={m.ad}
                            onView={() => openOpsView(m.id)}
                            onEdit={() => {
                              void urunlerService
                                .getOpsProduct(m.id)
                                .then((p) => startEditProduct(p))
                                .catch((err) =>
                                  actionToast.error("Düzenleme açılamadı", err)
                                );
                            }}
                          />
                        ) : (
                          <RowActions
                            itemLabel={m.ad}
                            onView={() => void openBuyerDetail(m.id)}
                          />
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            setMany({
                              scope: "imalat",
                              page: 1,
                              ordering: "vitrin",
                              yayin: undefined,
                            })
                          }
                        >
                          İmalat
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )
          ) : viewMode === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {scope === "buyer" ? <TableHead className="w-10" /> : null}
                  <TableHead>Ürün Kodu</TableHead>
                  <TableHead>Ürün Adı</TableHead>
                  <TableHead>Kategori</TableHead>
                  {scope === "ops" ? <TableHead>Firma</TableHead> : null}
                  <TableHead>Metal / Ayar</TableHead>
                  <TableHead className="text-right">Varyant</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scope === "buyer"
                  ? buyerItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedForCompare.includes(item.id)}
                            onChange={() => toggleCompare(item.id)}
                            className="h-4 w-4 rounded-[4px] border-border"
                            aria-label="Karşılaştır"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.platform_kodu || "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{item.ad}</span>
                            {item.kategori_one_cikan ? (
                              <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-600 dark:text-amber-300 border-amber-500/40">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Öne Çıkan
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.kategori || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {[item.metal, item.ayar].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {item.varyant_count}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success" className="text-[10px]">
                            Yayında
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            onView={() => void openBuyerDetail(item.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  : opsItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {item.platform_kodu || "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{item.ad}</span>
                            {item.kategori_one_cikan ? (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.kategori || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="max-w-[10rem] truncate text-[10px]">
                            {item.sahiplik_firma_ad || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {[item.metal, item.ayar].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {item.varyant_count}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.yayin_durumu === "aktif" ? "success" : "outline"
                            }
                            className="text-[10px]"
                          >
                            {item.yayin_durumu === "aktif" ? "Yayında" : "Taslak"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={item.ad}
                            onView={() => openOpsView(item.id)}
                            onEdit={
                              canOpsEditProduct(item)
                                ? () => void startEditProduct(item)
                                : undefined
                            }
                            isActive={item.yayin_durumu === "aktif"}
                            onToggleActive={
                              (item.allowed_actions || []).includes("publish") ||
                              (item.allowed_actions || []).includes("unpublish")
                                ? () =>
                                    void runOpsAction(
                                      item.yayin_durumu === "aktif"
                                        ? "unpublish"
                                        : "publish",
                                      item.id
                                    )
                                : undefined
                            }
                            onDelete={
                              canOpsDeleteProduct(item)
                                ? () => setDeleteProductTarget(item)
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          ) : scope === "buyer" ? (
            <div className="py-1">
              <BuyerCatalogGrid
                items={buyerItems}
                prices={cardPrices}
                canQuote={canQuote}
                channelSelected={Boolean(selectedKanalId)}
                onOpen={(id) => void openBuyerDetail(id)}
                onAddToCart={(item, quoteId) => {
                  if (!item.varsayilan_varyant_id) return;
                  const cp = cardPrices[item.id];
                  void handleAddToCart(item.varsayilan_varyant_id, quoteId, {
                    productId: item.id,
                    expiresAt: cp?.expiresAt,
                  });
                }}
                onOrderBlocked={(msg) => {
                  actionToast.error("Sipariş verilemedi", msg);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 p-4">
              {opsItems.map((ops) => (
                <button
                  key={ops.id}
                  type="button"
                  onClick={() =>
                    canOpsEditProduct(ops)
                      ? void startEditProduct(ops)
                      : openOpsView(ops.id)
                  }
                  className="rounded-[10px] border border-border bg-card text-left overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-square bg-[linear-gradient(160deg,#f7f5f2_0%,#efeae3_100%)] overflow-hidden">
                    {ops.kapak_url ? (
                      <img
                        src={ops.kapak_url}
                        alt={ops.ad}
                        className="absolute inset-0 h-full w-full object-contain p-3"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Gem className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {ops.platform_kodu || "—"}
                    </div>
                    <div className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">
                      {ops.ad}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {[ops.metal, ops.ayar].filter(Boolean).join(" · ") ||
                        ops.kategori ||
                        "—"}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {ops.sahiplik_firma_ad ? (
                        <Badge
                          variant="outline"
                          className="max-w-full truncate text-[10px]"
                        >
                          {ops.sahiplik_firma_ad}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={ops.yayin_durumu === "aktif" ? "success" : "outline"}
                        className="text-[10px]"
                      >
                        {ops.yayin_durumu === "aktif" ? "Yayında" : "Taslak"}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ListPage>
      ) : null}

      {/* Ürün Detay Dialog */}
      <Dialog
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next && workspaceDirty) {
            if (!window.confirm("Kaydedilmemiş değişiklikler var. Kapatılsın mı?")) return;
            setWorkspaceDirty(false);
          }
          setDetailOpen(next);
          if (!next) {
            setOpsDetail(null);
            setBuyerDetail(null);
          }
        }}
      >
        <DialogContent
          className={`${
            opsDetail || (buyerDetail && !opsDetail) ? "max-w-5xl" : "max-w-3xl"
          } max-h-[92vh] overflow-x-hidden overflow-y-auto`}
        >
          {buyerDetail && !opsDetail ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{buyerDetail.ad}</DialogTitle>
                <DialogDescription>{buyerDetail.platform_kodu}</DialogDescription>
              </DialogHeader>
              <BuyerProductDetailView
                detail={buyerDetail}
                loading={loadingDetail}
                selectedVariantId={selectedBuyerVariantId}
                onSelectVariant={(vid) => {
                  setSelectedBuyerVariantId(vid);
                  setQuoteState((prev) => {
                    const next = { ...prev };
                    delete next[vid];
                    return next;
                  });
                  if (canQuote && selectedKanalId) void handleGetQuote(vid);
                }}
                quoteState={quoteState}
                canQuote={canQuote}
                channelSelected={Boolean(selectedKanalId)}
                onRetryQuote={(vid) => void handleGetQuote(vid)}
                onAddToCart={(vid, quoteId) => {
                  const st = quoteState[vid];
                  void handleAddToCart(vid, quoteId, {
                    expiresAt: st?.expiresAt,
                  });
                }}
              />
            </>
          ) : loadingDetail ? (
            <div className="flex h-32 items-center justify-center">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : opsDetail ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{opsDetail.ad}</DialogTitle>
                <DialogDescription>{opsDetail.platform_kodu}</DialogDescription>
              </DialogHeader>
              <OpsProductWorkspace
                product={opsDetail}
                refs={refsQ.data}
                categories={opsCatsQ.data?.results ?? []}
                channels={prodChannelsQ.data?.results ?? []}
                channelsLoading={prodChannelsQ.isLoading}
                canEdit={canOpsEditProduct(opsDetail)}
                canDelete={canOpsDeleteProduct(opsDetail)}
                mode={workspaceMode}
                onRequestEdit={() => {
                  void startEditProduct(opsDetail);
                }}
                tab={detailTab}
                onTabChange={(t) => setDetailTab(t)}
                onOpenProduct={(id) => void openOpsDetail(id, { mode: "view" })}
                dirty={workspaceDirty}
                onDirtyChange={setWorkspaceDirty}
                onRefresh={async () => {
                  await openOpsDetail(opsDetail.id, {
                    soft: true,
                    resetTab: false,
                    mode: workspaceMode,
                  });
                  await prodChannelsQ.refetch();
                }}
                onToast={actionToast}
                onCopy={() => {
                  void urunlerService
                    .copyOpsProduct(opsDetail.id)
                    .then(async (kopya) => {
                      actionToast.success("Ürün kopyalandı");
                      await queryClient.invalidateQueries({ queryKey: urunlerKeys.ops() });
                      setWorkspaceDirty(false);
                      await openOpsDetail(kopya.id, { mode: "edit" });
                      setDetailTab("general");
                    })
                    .catch((err) => actionToast.error("Kopyalama başarısız", err));
                }}
                onDelete={() => setDeleteProductTarget(opsDetail)}
                onPublish={
                  actions.includes("publish")
                    ? () => void runOpsAction("publish", opsDetail.id)
                    : undefined
                }
                onUnpublish={
                  actions.includes("unpublish")
                    ? () => void runOpsAction("unpublish", opsDetail.id)
                    : undefined
                }
                actionPending={opsActionMutation.isPending}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Unified Create / Edit Variant EntityModal */}
      <EntityModal
        open={variantModalOpen}
        onOpenChange={(o) => {
          setVariantModalOpen(o);
          if (!o) setEditingVariant(null);
        }}
        title={editingVariant ? "Varyantı Düzenle" : "Yeni Varyant Ekle"}
        description="Ağırlık, renk, ölçü ve ek işçilik bilgilerini girin."
        isDirty={variantDirty}
        isSubmitting={opsActionMutation.isPending}
        error={variantFormError}
        onSubmit={onSubmitVariant}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Ağırlık (Gram)</Label>
            <Input
              value={variantForm.gram}
              onChange={(e) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, gram: e.target.value }));
              }}
              placeholder="30.000"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ek İşçilik / Bedel</Label>
            <Input
              value={variantForm.ek_bedel}
              onChange={(e) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, ek_bedel: e.target.value }));
              }}
              placeholder="0.00"
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Renk</Label>
            <RelationSelect
              value={variantForm.renk_id}
              onChange={(v) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, renk_id: String(v ?? "") }));
              }}
              options={renkOptions}
              placeholder="Renk seçin…"
              clearable
              createLabel="Yeni renk ekle"
              onCreateNew={() => setQuickRefKind("renk")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ölçü / Beden</Label>
            <RelationSelect
              value={variantForm.beden_id}
              onChange={(v) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, beden_id: String(v ?? "") }));
              }}
              options={bedenOptions}
              placeholder="Ölçü seçin…"
              clearable
              createLabel="Yeni ölçü ekle"
              onCreateNew={() => setQuickRefKind("olcu")}
            />
          </div>
        </div>

        {quickRefKind ? (
          <div className="rounded-[6px] border border-border bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium">
              {quickRefKind === "renk" ? "Hızlı Yeni Renk" : "Hızlı Yeni Ölçü Değeri"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickRefKind === "renk" ? (
                <>
                  <Input
                    value={quickRefKod}
                    onChange={(e) => setQuickRefKod(e.target.value)}
                    placeholder="Kod (örn: SARI)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={quickRefAd}
                    onChange={(e) => setQuickRefAd(e.target.value)}
                    placeholder="Ad (örn: Sarı Altın)"
                    className="h-8 text-xs"
                  />
                </>
              ) : (
                <>
                  <Input
                    value={quickRefVal}
                    onChange={(e) => setQuickRefVal(e.target.value)}
                    placeholder="Sayısal değer (örn: 14)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={quickRefAd}
                    onChange={(e) => setQuickRefAd(e.target.value)}
                    placeholder="Görünüm (örn: 14 No)"
                    className="h-8 text-xs"
                  />
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setQuickRefKind(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={createCatalogRefMutation.isPending}
                onClick={() => void handleQuickRefSave()}
              >
                Kaydet & Seç
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Sabit Fiyat (İsteğe Bağlı)</Label>
            <Input
              value={variantForm.sabit_fiyat}
              onChange={(e) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, sabit_fiyat: e.target.value }));
              }}
              placeholder="Adet fiyatlı ürünlerde"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Üretici Kodu (İsteğe Bağlı)</Label>
            <Input
              value={variantForm.tedarikci_sku}
              onChange={(e) => {
                setVariantDirty(true);
                setVariantForm((f) => ({ ...f, tedarikci_sku: e.target.value }));
              }}
              placeholder="Özel referans"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deleteProductTarget)}
        onOpenChange={(o) => !o && setDeleteProductTarget(null)}
        title="Ürünü Sil"
        description={
          deleteProductTarget
            ? `"${deleteProductTarget.ad}" ürününü silmek istediğinize emin misiniz?`
            : ""
        }
        confirmLabel="Evet, Sil"
        variant="destructive"
        loading={deleteOpsMutation.isPending}
        onConfirm={() => void confirmDeleteProduct()}
      />

      <ConfirmDialog
        open={Boolean(deleteVariantTarget)}
        onOpenChange={(o) => !o && setDeleteVariantTarget(null)}
        title="Varyantı Sil"
        description={
          deleteVariantTarget
            ? `"${deleteVariantTarget.sku}" varyantını silmek istediğinize emin misiniz?`
            : ""
        }
        confirmLabel="Evet, Sil"
        variant="destructive"
        loading={opsActionMutation.isPending}
        onConfirm={() => void confirmDeleteVariant()}
      />

      {selectedForCompare.length > 0 && scope === "buyer" && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-[8px] border border-border bg-card/95 backdrop-blur-sm p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span className="text-xs font-semibold">
              {selectedForCompare.length} ürün karşılaştırma için seçildi
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedForCompare([])}
            >
              Temizle
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={selectedForCompare.length < 2}
              onClick={() => setCompareModalOpen(true)}
            >
              Karşılaştır
            </Button>
          </div>
        </div>
      )}

      <VariantCompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        selectedItems={buyerItems.filter((i) => selectedForCompare.includes(i.id))}
        onRemoveItem={(id) =>
          setSelectedForCompare((prev) => prev.filter((x) => x !== id))
        }
        onInspectItem={(id) => void openBuyerDetail(id)}
      />
    </div>
  );
}

function AuditPanel({ productId }: { productId: number }) {
  const [rows, setRows] = useState<
    Array<{
      id: number;
      action: string;
      success: boolean;
      reason: string;
      actor: string;
      created_at: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void urunlerService
      .getOpsProductAudit(productId)
      .then((res) => {
        if (!cancelled) setRows(res.results);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Geçmiş yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Geçmiş yükleniyor…</p>;
  }
  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">Kayıtlı işlem yok.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-[6px] border border-border px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{r.action}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {r.created_at || "—"}
            </span>
          </div>
          <div className="mt-1 text-muted-foreground">
            {r.actor || "—"}
            {r.reason ? ` · ${r.reason}` : ""}
            {!r.success ? " · başarısız" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[6px] border border-border px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-xs font-medium mt-0.5 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
