"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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
  useOpsCategoriesQuery,
  useOpsProductActionMutation,
  useOpsProductChannelsQuery,
  useOpsProductsQuery,
  useTaslarQuery,
  useUpdateOpsProductMutation,
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
import { siparisService } from "@/features/siparis";
import { tanimlarService, useSalesChannelsQuery } from "@/features/tanimlar";
import { formatGram, formatMoney } from "@/lib/format";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
} from "@/components/crud";
import { CategoryEntityModal, CategoriesPanel } from "./categories-panel";
import { CatalogRefsPanel } from "./catalog-refs-panel";
import { VariantCompareModal } from "./variant-compare-modal";
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
type Scope = "buyer" | "monturler" | "taslar" | "ops" | "kategoriler" | "referanslar";
type DetailTab = "general" | "tech" | "variants" | "channels";

const PAGE_SIZE = 20;

interface ProductFormState {
  ad: string;
  kategori_id: string;
  ayar_id: string;
  aciklama: string;
  fiyat_tipi: string;
  temin_tipi: string;
  termin_gun: string;
  olcu_tipi: string;
  renk_ekseni: boolean;
  satis_kanali_id: string;
  koleksiyon_id: string;
  hedef_kitle: string;
  yas_grubu_id: string;
  yuzey: string;
  zincir_tipi_id: string;
  kopca_tipi_id: string;
  teknik_ids: number[];
  stil_ids: number[];
  ozel_gun_ids: number[];
}

function emptyProductForm(): ProductFormState {
  return {
    ad: "",
    kategori_id: "",
    ayar_id: "",
    aciklama: "",
    fiyat_tipi: "gram",
    temin_tipi: "hazir",
    termin_gun: "",
    olcu_tipi: "",
    renk_ekseni: false,
    satis_kanali_id: "",
    koleksiyon_id: "",
    hedef_kitle: "",
    yas_grubu_id: "",
    yuzey: "",
    zincir_tipi_id: "",
    kopca_tipi_id: "",
    teknik_ids: [],
    stil_ids: [],
    ozel_gun_ids: [],
  };
}

function productToForm(p: OpsProduct): ProductFormState {
  return {
    ad: p.ad,
    kategori_id: p.kategori_id ? String(p.kategori_id) : "",
    ayar_id: p.ayar_id ? String(p.ayar_id) : "",
    aciklama: p.aciklama || "",
    fiyat_tipi: p.fiyat_tipi || "gram",
    temin_tipi: p.temin_tipi || "hazir",
    termin_gun: p.termin_gun != null ? String(p.termin_gun) : "",
    olcu_tipi: p.olcu_tipi || "",
    renk_ekseni: Boolean(p.renk_ekseni),
    satis_kanali_id: "",
    koleksiyon_id: p.koleksiyon_id ? String(p.koleksiyon_id) : "",
    hedef_kitle: p.hedef_kitle || "",
    yas_grubu_id: p.yas_grubu_id ? String(p.yas_grubu_id) : "",
    yuzey: p.yuzey || "",
    zincir_tipi_id: p.zincir_tipi_id ? String(p.zincir_tipi_id) : "",
    kopca_tipi_id: p.kopca_tipi_id ? String(p.kopca_tipi_id) : "",
    teknik_ids: p.teknik_ids ? [...p.teknik_ids] : [],
    stil_ids: p.stil_ids ? [...p.stil_ids] : [],
    ozel_gun_ids: p.ozel_gun_ids ? [...p.ozel_gun_ids] : [],
  };
}

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
  const { user } = useAuth();
  const actionToast = useActionToast();
  const queryClient = useQueryClient();
  const canOps = Boolean(user?.capabilities?.can_view_ops && user?.firma?.platform_mu);
  const canCatalog = Boolean(user?.capabilities?.can_view_catalog || canOps);
  const canQuote = Boolean(
    user?.capabilities?.can_lock_quote || user?.capabilities?.can_view_cart
  );

  const { get, setMany, page } = useUrlState();
  const scopeParam = get("scope");
  const scope: Scope =
    scopeParam === "referanslar" && canOps
      ? "referanslar"
      : scopeParam === "kategoriler" && canOps
        ? "kategoriler"
        : scopeParam === "ops" && canOps
          ? "ops"
          : scopeParam === "monturler"
            ? "monturler"
            : scopeParam === "taslar"
              ? "taslar"
              : scopeParam === "buyer"
                ? "buyer"
                : canOps
                  ? "ops"
                  : "buyer";

  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const q = get("q");
  const ordering = get("ordering", scope === "ops" ? "vitrin" : "vitrin") || "vitrin";
  const onayDurumu = get("onay");
  const yayinDurumu = get("yayin");
  const kategoriFilter = get("kategori");
  const [qInput, setQInput] = useState(q);

  const createOpsMutation = useCreateOpsProductMutation();
  const updateOpsMutation = useUpdateOpsProductMutation();
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
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<OpsProduct | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [productDirty, setProductDirty] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [nestedCategoryOpen, setNestedCategoryOpen] = useState(false);
  const [recentCreatedCategory, setRecentCreatedCategory] = useState<CategoryItem | null>(
    null
  );

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

  // Confirmations
  const [deleteProductTarget, setDeleteProductTarget] = useState<OpsProduct | null>(null);
  const [deleteVariantTarget, setDeleteVariantTarget] = useState<OpsProductVariant | null>(
    null
  );
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [quoteState, setQuoteState] = useState<
    Record<
      number,
      {
        loading: boolean;
        price?: string;
        currency?: string;
        quoteId?: number;
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
      onay_durumu: onayDurumu || undefined,
      yayin_durumu: yayinDurumu || undefined,
    }),
    [catalogFilters, onayDurumu, yayinDurumu]
  );

  const catalogQuery = useCatalogQuery(
    catalogFilters,
    scope === "buyer" && (canCatalog || canOps)
  );
  const monturlerQuery = useMonturlerQuery(
    catalogFilters,
    scope === "monturler" && (canCatalog || canOps)
  );
  const taslarQuery = useTaslarQuery(
    { q: q || undefined, page: String(page), page_size: String(PAGE_SIZE) },
    scope === "taslar" && (canCatalog || canOps)
  );
  const opsQuery = useOpsProductsQuery(opsFilters, scope === "ops" && canOps);

  const buyerCatsQ = useCategoriesQuery({ page_size: "100" }, canCatalog || canOps);
  const opsCatsQ = useOpsCategoriesQuery(
    { aktif: "true", page_size: "100" },
    canOps && (productModalOpen || scope === "ops")
  );
  const refsQ = useCatalogRefsQuery(canOps && (productModalOpen || variantModalOpen || detailOpen));
  const channelsQ = useSalesChannelsQuery(canOps && productModalOpen);
  const prodChannelsQ = useOpsProductChannelsQuery(
    opsDetail?.id,
    Boolean(opsDetail?.id) && detailOpen && detailTab === "channels" && canOps
  );

  const buyerItems = catalogQuery.data?.results || [];
  const monturItems = monturlerQuery.data?.results || [];
  const tasItems = taslarQuery.data?.results || [];
  const tasReferanslar = taslarQuery.data?.referanslar;
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
    setDetailOpen(true);
    setDetailTab("general");
    setLoadingDetail(true);
    setBuyerDetail(null);
    setOpsDetail(null);
    try {
      const d = await urunlerService.getProductDetail(id);
      setBuyerDetail(d);
    } catch (err) {
      actionToast.error("Ürün detayı alınamadı", err);
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openOpsDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailTab("general");
    setLoadingDetail(true);
    setBuyerDetail(null);
    setOpsDetail(null);
    try {
      const d = await urunlerService.getOpsProduct(id);
      setOpsDetail(d);
    } catch (err) {
      actionToast.error("Ürün detayı alınamadı", err);
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!routeId) return;
    const n = Number(routeId);
    if (!Number.isFinite(n) || n <= 0) return;
    if (scope === "ops" && canOps) void openOpsDetail(n);
    else void openBuyerDetail(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleGetQuote = async (variantId: number) => {
    setQuoteState((prev) => ({ ...prev, [variantId]: { loading: true } }));
    try {
      const list = await tanimlarService.getSalesChannels();
      const channelId = list[0]?.id;
      if (!channelId) throw new Error("Aktif satış kanalı bulunamadı.");
      const quote = await fiyatlamaService.createQuote({
        varyant_id: variantId,
        satis_kanali_id: channelId,
      });
      const price = quote.toplam_vergisiz || quote.gram_basi_vergisiz || quote.birim_fiyat;
      if (!price) throw new Error("Fiyat bilgisi alınamadı.");
      rememberQuoteId(quote.id);
      setQuoteState((prev) => ({
        ...prev,
        [variantId]: {
          loading: false,
          price,
          currency: quote.para_birimi,
          quoteId: quote.id,
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

  const handleAddToCart = async (variantId: number, quoteId: number) => {
    try {
      await siparisService.addCartLine(quoteId, "1");
      setQuoteState((prev) => ({
        ...prev,
        [variantId]: { ...prev[variantId], added: true },
      }));
      actionToast.success("Ürün sepete eklendi");
    } catch (err) {
      actionToast.error("Sepete eklenemedi", err);
    }
  };

  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm());
    setProductDirty(false);
    setProductFormError(null);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: OpsProduct) => {
    setEditingProduct(p);
    setProductForm(productToForm(p));
    setProductDirty(false);
    setProductFormError(null);
    setProductModalOpen(true);
  };

  const onSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);
    if (!productForm.ad.trim()) {
      setProductFormError("Ürün adı zorunludur.");
      return;
    }
    if (!productForm.kategori_id) {
      setProductFormError("Kategori seçimi zorunludur.");
      return;
    }
    if (!productForm.ayar_id) {
      setProductFormError("Ayar seçimi zorunludur.");
      return;
    }
    if (
      productForm.temin_tipi === "siparis_ozel" &&
      (!productForm.termin_gun.trim() || Number(productForm.termin_gun) <= 0)
    ) {
      setProductFormError("Siparişe özel üründe termin süresi (gün) zorunludur.");
      return;
    }

    const vitrinPayload = {
      koleksiyon_id: productForm.koleksiyon_id ? Number(productForm.koleksiyon_id) : null,
      hedef_kitle: productForm.hedef_kitle || "",
      yas_grubu_id: productForm.yas_grubu_id ? Number(productForm.yas_grubu_id) : null,
      yuzey: productForm.yuzey || "",
      zincir_tipi_id: productForm.zincir_tipi_id ? Number(productForm.zincir_tipi_id) : null,
      kopca_tipi_id: productForm.kopca_tipi_id ? Number(productForm.kopca_tipi_id) : null,
      teknik_ids: productForm.teknik_ids,
      stil_ids: productForm.stil_ids,
      ozel_gun_ids: productForm.ozel_gun_ids,
    };

    try {
      if (editingProduct) {
        const updated = await updateOpsMutation.mutateAsync({
          id: editingProduct.id,
          data: {
            ad: productForm.ad.trim(),
            kategori_id: Number(productForm.kategori_id),
            ayar_id: Number(productForm.ayar_id),
            aciklama: productForm.aciklama.trim(),
            fiyat_tipi: productForm.fiyat_tipi || "gram",
            temin_tipi: productForm.temin_tipi || "hazir",
            termin_gun: productForm.termin_gun.trim()
              ? Number(productForm.termin_gun)
              : null,
            olcu_tipi: productForm.olcu_tipi,
            renk_ekseni: productForm.renk_ekseni,
            ...vitrinPayload,
          },
        });
        actionToast.success("Ürün güncellendi");
        setProductModalOpen(false);
        if (opsDetail?.id === updated.id) setOpsDetail(updated);
      } else {
        const created = await createOpsMutation.mutateAsync({
          ad: productForm.ad.trim(),
          kategori_id: Number(productForm.kategori_id),
          ayar_id: Number(productForm.ayar_id),
          aciklama: productForm.aciklama.trim(),
          fiyat_tipi: productForm.fiyat_tipi || "gram",
          temin_tipi: productForm.temin_tipi || "hazir",
          termin_gun: productForm.termin_gun.trim()
            ? Number(productForm.termin_gun)
            : null,
          olcu_tipi: productForm.olcu_tipi,
          renk_ekseni: productForm.renk_ekseni,
          ...vitrinPayload,
          ...(productForm.satis_kanali_id
            ? { satis_kanali_id: Number(productForm.satis_kanali_id) }
            : {}),
        });
        actionToast.success("Yeni taslak ürün oluşturuldu");
        setProductModalOpen(false);
        await openOpsDetail(created.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ürün kaydedilemedi.";
      setProductFormError(msg);
      actionToast.error("Ürün kaydedilemedi", err);
    }
  };

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
    action: "submit" | "approve" | "publish" | "unpublish",
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

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opsDetail || !rejectReason.trim()) return;
    try {
      await opsActionMutation.mutateAsync({
        action: "reject",
        id: opsDetail.id,
        neden: rejectReason.trim(),
      });
      setRejectOpen(false);
      setRejectReason("");
      actionToast.success("Ürün reddedildi");
      await openOpsDetail(opsDetail.id);
    } catch (err) {
      actionToast.error("Reddetme başarısız", err);
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

  const kategoriOptions = useMemo(() => {
    const base = opsCatsQ.data?.results ?? [];
    const list =
      recentCreatedCategory &&
      recentCreatedCategory.aktif &&
      !base.some((c) => c.id === recentCreatedCategory.id)
        ? [recentCreatedCategory, ...base]
        : base;
    return list.map((c) => ({
      value: String(c.id),
      label: c.tam_ad || c.ad,
      subtitle: c.kod,
    }));
  }, [opsCatsQ.data, recentCreatedCategory]);

  const ayarOptions = useMemo(
    () =>
      (refsQ.data?.ayarlar ?? []).map((a) => ({
        value: String(a.id),
        label: `${a.ayar_kodu} (${a.metal_ad})`,
        subtitle: a.milyem,
      })),
    [refsQ.data]
  );

  const channelOptions = useMemo(
    () =>
      (channelsQ.data?.results ?? []).map((c) => ({
        value: String(c.id),
        label: c.ad,
        subtitle: c.kod,
      })),
    [channelsQ.data]
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

  const koleksiyonOptions = useMemo(
    () =>
      (refsQ.data?.koleksiyonlar ?? []).map((k) => ({
        value: String(k.id),
        label: k.ad || k.kod || String(k.id),
        subtitle: k.kod,
      })),
    [refsQ.data]
  );

  const yasGrubuOptions = useMemo(
    () =>
      (refsQ.data?.yas_gruplari ?? []).map((y) => ({
        value: String(y.id),
        label: y.ad || y.kod || String(y.id),
        subtitle: y.kod,
      })),
    [refsQ.data]
  );

  const zincirTipiOptions = useMemo(
    () =>
      (refsQ.data?.zincir_tipleri ?? []).map((z) => ({
        value: String(z.id),
        label: z.ad || z.kod || String(z.id),
        subtitle: z.kod,
      })),
    [refsQ.data]
  );

  const kopcaTipiOptions = useMemo(
    () =>
      (refsQ.data?.kopca_tipleri ?? []).map((k) => ({
        value: String(k.id),
        label: k.ad || k.kod || String(k.id),
        subtitle: k.kod,
      })),
    [refsQ.data]
  );

  const toggleFormId = (
    field: "teknik_ids" | "stil_ids" | "ozel_gun_ids",
    id: number
  ) => {
    setProductDirty(true);
    setProductForm((f) => {
      const current = f[field];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return { ...f, [field]: next };
    });
  };

  const activeDetail = opsDetail || buyerDetail;
  const actions = opsDetail?.allowed_actions || [];
  const productMutating = createOpsMutation.isPending || updateOpsMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      {/* Sekme geçiş çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap rounded-[6px] border border-border bg-muted/40 p-1">
          {(
            [
              canOps ? ["ops", "Ürün Yönetimi"] : null,
              ["buyer", "Satış Kataloğu"],
              ["monturler", "Montürler"],
              ["taslar", "Taşlar & Sertifika"],
              canOps ? ["kategoriler", "Kategoriler"] : null,
              canOps ? ["referanslar", "Referans Tanımları"] : null,
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
                  onay: undefined,
                  yayin: undefined,
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {scope === "referanslar" && canOps ? (
        <CatalogRefsPanel />
      ) : scope === "kategoriler" && canOps ? (
        <CategoriesPanel />
      ) : (
        <ListPage
          title={
            scope === "ops"
              ? "Ürün Yönetimi"
              : scope === "monturler"
                ? "Montür Kataloğu"
                : scope === "taslar"
                  ? "Taş & Pırlanta Referansları"
                  : "Satış Kataloğu"
          }
          description={
            scope === "ops"
              ? "Taslak ürünleri oluşturun, varyantları tanımlayın ve yayın onay sürecini yönetin."
              : "Onaylı ve yayındaki ürünleri inceleyin, anlık fiyat alıp sepete ekleyin."
          }
          createLabel={scope === "ops" && canOps ? "Yeni Ürün" : undefined}
          onCreate={scope === "ops" && canOps ? openCreateProduct : undefined}
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
          searchPlaceholder="Ürün adı veya kodu ara…"
          filters={
            <>
              {scope !== "taslar" ? (
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
              ) : null}
              {scope !== "taslar" ? (
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
              ) : null}
              {scope === "ops" ? (
                <>
                  <select
                    value={onayDurumu}
                    onChange={(e) =>
                      setMany({ onay: e.target.value || undefined, page: 1 })
                    }
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Tüm Onaylar</option>
                    <option value="taslak">Taslak</option>
                    <option value="onay_bekliyor">Onay Bekliyor</option>
                    <option value="onayli">Onaylı</option>
                    <option value="reddedildi">Reddedildi</option>
                  </select>
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
                </>
              ) : null}
              {scope === "buyer" || scope === "ops" ? (
                <div className="flex rounded-[6px] border border-border p-0.5">
                  <button
                    type="button"
                    className={`rounded-[4px] p-1.5 ${viewMode === "table" ? "bg-secondary" : ""}`}
                    onClick={() => setViewMode("table")}
                    aria-label="Tablo görünümü"
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
            q || onayDurumu || yayinDurumu || kategoriFilter
              ? "Arama veya filtre ölçütlerine uygun kayıt yok."
              : "Henüz ürün bulunmuyor."
          }
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={(p) => setMany({ page: p })}
        >
          {scope === "monturler" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün Kodu</TableHead>
                  <TableHead>Montür</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Ayar</TableHead>
                  <TableHead>Seçenekler</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monturItems.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.platform_kodu || "—"}</TableCell>
                    <TableCell className="font-medium">{m.ad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.kategori || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.ayar || "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(m.varyantlar || []).slice(0, 4).map((v) => (
                          <Badge key={v.id} variant="outline" className="font-mono text-[10px]">
                            {v.sku} {v.gram ? `(${v.gram}g)` : ""}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => void openBuyerDetail(m.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Görüntüle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : scope === "taslar" ? (
            <div className="space-y-4 p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kod</TableHead>
                    <TableHead>Taş Adı</TableHead>
                    <TableHead>Sınıf</TableHead>
                    <TableHead className="text-right">Sıra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasItems.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {t.kod}
                      </TableCell>
                      <TableCell className="font-medium">{t.ad}</TableCell>
                      <TableCell>
                        <Badge
                          variant={t.degerli ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          {t.degerli ? "Değerli Taş" : "Standart"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        {t.sira}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {tasReferanslar ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(
                    [
                      ["Kesimler", tasReferanslar.kesimler],
                      ["Berraklıklar", tasReferanslar.berrakliklar],
                      ["Renk Dereceleri", tasReferanslar.renk_dereceleri],
                      ["Kesim Kaliteleri", tasReferanslar.kesim_kaliteleri],
                      ["Sertifika Kurumları", tasReferanslar.sertifika_kurumlari],
                      ["Menşeiler", tasReferanslar.menseiler],
                    ] as const
                  ).map(([title, list]) =>
                    list && list.length > 0 ? (
                      <div
                        key={title}
                        className="rounded-[8px] border border-border bg-background p-3 space-y-2"
                      >
                        <div className="text-xs font-semibold">{title}</div>
                        <div className="flex flex-wrap gap-1">
                          {list.map((r) => (
                            <Badge key={r.id} variant="outline" className="text-[10px]">
                              {r.kod} · {r.ad}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              ) : null}
            </div>
          ) : viewMode === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {scope === "buyer" ? <TableHead className="w-10" /> : null}
                  <TableHead>Ürün Kodu</TableHead>
                  <TableHead>Ürün Adı</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Ayar</TableHead>
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
                          {item.ayar || "—"}
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
                        <TableCell className="font-mono text-xs">
                          {item.ayar || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {item.varyant_count}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {item.onay_durumu}
                            </Badge>
                            <Badge
                              variant={
                                item.yayin_durumu === "aktif" ? "success" : "outline"
                              }
                              className="text-[10px]"
                            >
                              {item.yayin_durumu === "aktif" ? "Yayında" : "Pasif"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={item.ad}
                            onView={() => void openOpsDetail(item.id)}
                            onEdit={
                              item.yayin_durumu !== "aktif"
                                ? () => openEditProduct(item)
                                : undefined
                            }
                            isActive={item.yayin_durumu === "aktif"}
                            onToggleActive={
                              item.onay_durumu === "onayli"
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
                              item.onay_durumu !== "onayli" &&
                              item.yayin_durumu !== "aktif"
                                ? () => setDeleteProductTarget(item)
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {(scope === "buyer" ? buyerItems : opsItems).map((item) => {
                const isBuyer = scope === "buyer";
                const buyer = item as BuyerCatalogItem;
                const ops = item as OpsProduct;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      void (isBuyer ? openBuyerDetail(item.id) : openOpsDetail(item.id))
                    }
                    className="rounded-[8px] border border-border bg-card p-4 text-left hover:bg-muted/40 transition-colors space-y-3"
                  >
                    <div className="flex h-20 items-center justify-center rounded-[6px] border border-dashed border-border bg-muted/30">
                      <Gem className="h-7 w-7 text-muted-foreground opacity-40" />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {isBuyer ? buyer.platform_kodu : ops.platform_kodu || "—"}
                      </div>
                      <div className="text-sm font-semibold line-clamp-2 flex items-center gap-1">
                        {item.ad}
                        {item.kategori_one_cikan ? (
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {item.kategori || "—"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.varyant_count} varyant
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ListPage>
      )}

      {/* Ürün Detay Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeDetail?.ad || "Ürün Detayı"}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {buyerDetail?.platform_kodu || opsDetail?.platform_kodu || "—"}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex h-32 items-center justify-center">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : activeDetail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1 rounded-[6px] border border-border bg-muted/40 p-1 w-fit">
                {(
                  [
                    ["general", "Genel Bilgiler"],
                    ["tech", "Özellikler"],
                    ["variants", "Varyantlar"],
                    opsDetail ? ["channels", "Satış Kanalları"] : null,
                  ].filter(Boolean) as Array<[DetailTab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDetailTab(id)}
                    className={`rounded-[4px] px-2.5 py-1.5 text-xs font-medium ${
                      detailTab === id ? "bg-card shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {detailTab === "general" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Info label="Ürün Adı" value={activeDetail.ad} />
                  <Info
                    label="Ürün Kodu"
                    value={
                      buyerDetail?.platform_kodu || opsDetail?.platform_kodu || "—"
                    }
                    mono
                  />
                  <Info
                    label="Kategori"
                    value={buyerDetail?.kategori || opsDetail?.kategori || "—"}
                  />
                  <Info
                    label="Ayar / Milyem"
                    value={buyerDetail?.ayar || opsDetail?.ayar || "—"}
                  />
                  {opsDetail ? (
                    <>
                      <Info label="Onay Durumu" value={opsDetail.onay_durumu} />
                      <Info label="Yayın Durumu" value={opsDetail.yayin_durumu} />
                      {opsDetail.red_nedeni ? (
                        <Info label="Red Nedeni" value={opsDetail.red_nedeni} />
                      ) : null}
                    </>
                  ) : (
                    <Info label="Yayın Durumu" value="Yayında" />
                  )}
                  <div className="col-span-2 rounded-[6px] border border-border px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">Açıklama</div>
                    <p className="text-xs mt-1">
                      {buyerDetail?.aciklama || opsDetail?.aciklama || "—"}
                    </p>
                  </div>
                </div>
              )}

              {detailTab === "tech" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info
                      label="Fiyatlandırma Tipi"
                      value={
                        buyerDetail?.fiyat_tipi || opsDetail?.fiyat_tipi || "—"
                      }
                    />
                    <Info
                      label="Temin Tipi"
                      value={
                        buyerDetail?.temin_tipi || opsDetail?.temin_tipi || "—"
                      }
                    />
                    <Info
                      label="Ölçü Tipi"
                      value={buyerDetail?.olcu_tipi || opsDetail?.olcu_tipi || "—"}
                    />
                    <Info
                      label="Termin Süresi"
                      value={
                        (buyerDetail?.termin_gun ?? opsDetail?.termin_gun) != null
                          ? `${buyerDetail?.termin_gun ?? opsDetail?.termin_gun} gün`
                          : "Hazır stok"
                      }
                    />
                    {opsDetail ? (
                      <>
                        <Info label="Koleksiyon" value={opsDetail.koleksiyon || "—"} />
                        <Info label="Hedef Kitle" value={opsDetail.hedef_kitle || "—"} />
                        <Info label="Yaş Grubu" value={opsDetail.yas_grubu || "—"} />
                        <Info label="Yüzey" value={opsDetail.yuzey || "—"} />
                        <Info label="Zincir Tipi" value={opsDetail.zincir_tipi || "—"} />
                        <Info label="Kopça Tipi" value={opsDetail.kopca_tipi || "—"} />
                      </>
                    ) : null}
                  </div>
                  {opsDetail &&
                  ((opsDetail.teknikler?.length ?? 0) > 0 ||
                    (opsDetail.stiller?.length ?? 0) > 0 ||
                    (opsDetail.ozel_gunler?.length ?? 0) > 0) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-[6px] border border-border px-3 py-2">
                        <div className="text-[10px] text-muted-foreground mb-1">Teknikler</div>
                        <div className="flex flex-wrap gap-1">
                          {(opsDetail.teknikler ?? []).length > 0
                            ? opsDetail.teknikler!.map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]">
                                  {t}
                                </Badge>
                              ))
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-[6px] border border-border px-3 py-2">
                        <div className="text-[10px] text-muted-foreground mb-1">Stiller</div>
                        <div className="flex flex-wrap gap-1">
                          {(opsDetail.stiller ?? []).length > 0
                            ? opsDetail.stiller!.map((s) => (
                                <Badge key={s} variant="outline" className="text-[10px]">
                                  {s}
                                </Badge>
                              ))
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-[6px] border border-border px-3 py-2">
                        <div className="text-[10px] text-muted-foreground mb-1">Özel Günler</div>
                        <div className="flex flex-wrap gap-1">
                          {(opsDetail.ozel_gunler ?? []).length > 0
                            ? opsDetail.ozel_gunler!.map((o) => (
                                <Badge key={o} variant="outline" className="text-[10px]">
                                  {o}
                                </Badge>
                              ))
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {detailTab === "variants" && (
                <div className="space-y-3">
                  {opsDetail &&
                  (opsDetail.onay_durumu === "taslak" ||
                    opsDetail.onay_durumu === "reddedildi") ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={openCreateVariant}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Yeni Varyant Ekle
                      </Button>
                    </div>
                  ) : null}

                  {buyerDetail ? (
                    buyerDetail.varyantlar.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Varyant Kodu</TableHead>
                            <TableHead>Ölçü / Beden</TableHead>
                            <TableHead>Renk</TableHead>
                            <TableHead className="text-right">Gram</TableHead>
                            <TableHead className="text-right">Fiyat / Sepet</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {buyerDetail.varyantlar.map((v) => {
                            const st = quoteState[v.id];
                            return (
                              <TableRow key={v.id}>
                                <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                                <TableCell className="text-xs">{v.beden || "—"}</TableCell>
                                <TableCell className="text-xs">{v.renk || "—"}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-xs">
                                  {formatGram(v.gram)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {!canQuote ? (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  ) : !st?.price ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      disabled={st?.loading}
                                      onClick={() => void handleGetQuote(v.id)}
                                    >
                                      <Tag className="h-3 w-3" />
                                      {st?.loading ? "Hesaplanıyor…" : "Fiyat Al"}
                                    </Button>
                                  ) : st.added ? (
                                    <Badge variant="success" className="text-[10px] gap-1">
                                      <Check className="h-3 w-3" />
                                      Sepette
                                    </Badge>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2">
                                      <span className="font-mono text-xs tabular-nums font-semibold">
                                        {formatMoney(st.price, st.currency || "TRY")}
                                      </span>
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs gap-1"
                                        onClick={() =>
                                          void handleAddToCart(v.id, st.quoteId!)
                                        }
                                      >
                                        <ShoppingCart className="h-3 w-3" />
                                        Sepete Ekle
                                      </Button>
                                    </div>
                                  )}
                                  {st?.error ? (
                                    <div className="text-[10px] text-destructive mt-1">
                                      {st.error}
                                    </div>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-xs text-muted-foreground">Henüz varyant eklenmemiş.</p>
                    )
                  ) : opsDetail?.varyantlar?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Varyant Kodu</TableHead>
                          <TableHead>Renk</TableHead>
                          <TableHead>Ölçü</TableHead>
                          <TableHead className="text-right">Gram</TableHead>
                          <TableHead className="text-right">Ek Bedel</TableHead>
                          <TableHead>Durum</TableHead>
                          <TableHead className="text-right">İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {opsDetail.varyantlar.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                            <TableCell className="text-xs">{v.renk || "—"}</TableCell>
                            <TableCell className="text-xs">{v.beden || "—"}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {formatGram(v.gram)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {v.ek_bedel ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={v.aktif ? "success" : "secondary"}
                                className="text-[10px]"
                              >
                                {v.aktif ? "Aktif" : "Pasif"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <RowActions
                                itemLabel={v.sku}
                                onEdit={() => openEditVariant(v)}
                                isActive={v.aktif}
                                onToggleActive={() =>
                                  void opsActionMutation
                                    .mutateAsync({
                                      action: "updateVariant",
                                      id: opsDetail.id,
                                      variantId: v.id,
                                      variantUpdate: { aktif: !v.aktif },
                                    })
                                    .then(() => openOpsDetail(opsDetail.id))
                                }
                                onDelete={() => setDeleteVariantTarget(v)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-muted-foreground">Henüz varyant eklenmemiş.</p>
                  )}
                </div>
              )}

              {detailTab === "channels" && opsDetail ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Bu ürünün hangi satış kanallarında görüneceğini belirleyin.
                  </p>
                  {prodChannelsQ.isLoading ? (
                    <div className="text-xs text-muted-foreground">Kanallar yükleniyor…</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(prodChannelsQ.data?.results ?? []).map((ch) => (
                        <label
                          key={ch.kanal_id}
                          className="flex items-center justify-between rounded-[6px] border border-border px-3 py-2.5 text-xs cursor-pointer hover:bg-muted/40"
                        >
                          <div>
                            <div className="font-medium text-foreground">{ch.ad}</div>
                            <div className="text-[11px] text-muted-foreground">{ch.kod}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={ch.aktif}
                            onChange={(e) => {
                              void opsActionMutation
                                .mutateAsync({
                                  action: "setChannel",
                                  id: opsDetail.id,
                                  kanalId: ch.kanal_id,
                                  kanalAktif: e.target.checked,
                                })
                                .then(() => {
                                  actionToast.success("Kanal ayarı güncellendi");
                                  void prodChannelsQ.refetch();
                                });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {opsDetail ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {opsDetail.yayin_durumu !== "aktif" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openEditProduct(opsDetail)}
                    >
                      Ürünü Düzenle
                    </Button>
                  )}
                  {actions.includes("submit") && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => void runOpsAction("submit", opsDetail.id)}
                    >
                      Onaya Gönder
                    </Button>
                  )}
                  {actions.includes("approve") && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => void runOpsAction("approve", opsDetail.id)}
                    >
                      Onayla
                    </Button>
                  )}
                  {actions.includes("reject") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={() => setRejectOpen(true)}
                    >
                      Reddet
                    </Button>
                  )}
                  {actions.includes("publish") && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => void runOpsAction("publish", opsDetail.id)}
                    >
                      Yayınla
                    </Button>
                  )}
                  {actions.includes("unpublish") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => void runOpsAction("unpublish", opsDetail.id)}
                    >
                      Yayından Kaldır
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Unified Create / Edit Product EntityModal */}
      <EntityModal
        open={productModalOpen}
        onOpenChange={(o) => {
          setProductModalOpen(o);
          if (!o) setEditingProduct(null);
        }}
        title={editingProduct ? "Ürünü Düzenle" : "Yeni Taslak Ürün"}
        description="Kategori, ayar ve fiyatlandırma bilgilerini seçin."
        isDirty={productDirty}
        isSubmitting={productMutating}
        error={productFormError}
        onSubmit={onSubmitProduct}
        size="lg"
      >
        <div className="flex flex-col gap-1.5">
          <Label>Ürün Adı</Label>
          <Input
            required
            value={productForm.ad}
            onChange={(e) => {
              setProductDirty(true);
              setProductForm((f) => ({ ...f, ad: e.target.value }));
            }}
            placeholder="Örn: 22 Ayar Adana Burma Bilezik"
            disabled={productMutating}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Kategori</Label>
            <RelationSelect
              value={productForm.kategori_id}
              onChange={(v) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, kategori_id: String(v ?? "") }));
              }}
              options={kategoriOptions}
              placeholder="Kategori seçin…"
              emptyText="Aktif kategori bulunamadı"
              createLabel="Yeni kategori ekle"
              onCreateNew={() => setNestedCategoryOpen(true)}
              disabled={productMutating}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Ayar / Milyem</Label>
            <RelationSelect
              value={productForm.ayar_id}
              onChange={(v) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, ayar_id: String(v ?? "") }));
              }}
              options={ayarOptions}
              placeholder="Ayar seçin…"
              emptyText="Ayar tanımı bulunamadı"
              disabled={productMutating}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Fiyatlandırma Tipi</Label>
            <select
              value={productForm.fiyat_tipi}
              onChange={(e) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, fiyat_tipi: e.target.value }));
              }}
              disabled={productMutating}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              {(
                refsQ.data?.fiyat_tipleri ?? [
                  { kod: "gram", ad: "Gram bazlı" },
                  { kod: "sabit", ad: "Sabit fiyat" },
                ]
              ).map((ft) => (
                <option key={ft.kod} value={ft.kod}>
                  {ft.ad}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Temin Tipi</Label>
            <select
              value={productForm.temin_tipi}
              onChange={(e) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, temin_tipi: e.target.value }));
              }}
              disabled={productMutating}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              {(
                refsQ.data?.temin_tipleri ?? [
                  { kod: "hazir", ad: "Hazır stok" },
                  { kod: "siparis_ozel", ad: "Siparişe özel üretim" },
                ]
              ).map((tt) => (
                <option key={tt.kod} value={tt.kod}>
                  {tt.ad}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ölçü Tipi</Label>
            <select
              value={productForm.olcu_tipi}
              onChange={(e) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, olcu_tipi: e.target.value }));
              }}
              disabled={productMutating}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              <option value="">Ölçüsüz</option>
              {(refsQ.data?.olcu_tipleri ?? []).map((ot) => (
                <option key={ot.kod} value={ot.kod}>
                  {ot.ad}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <Label>
              Üretim Termin Süresi (Gün)
              {productForm.temin_tipi === "siparis_ozel" ? " *" : ""}
            </Label>
            <Input
              type="number"
              min={1}
              value={productForm.termin_gun}
              onChange={(e) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, termin_gun: e.target.value }));
              }}
              placeholder={
                productForm.temin_tipi === "siparis_ozel"
                  ? "Zorunlu (ör. 7)"
                  : "Hazır stok için boş bırakın"
              }
              disabled={productMutating}
            />
          </div>

          {!editingProduct ? (
            <div className="flex flex-col gap-1.5">
              <Label>Başlangıç Satış Kanalı (İsteğe Bağlı)</Label>
              <RelationSelect
                value={productForm.satis_kanali_id}
                onChange={(v) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, satis_kanali_id: String(v ?? "") }));
                }}
                options={channelOptions}
                placeholder="Kanal seçin…"
                clearable
                disabled={productMutating}
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={productForm.renk_ekseni}
              onChange={(e) => {
                setProductDirty(true);
                setProductForm((f) => ({ ...f, renk_ekseni: e.target.checked }));
              }}
              disabled={productMutating}
            />
            Varyantlarda renk seçimi kullanılsın
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Açıklama</Label>
          <Input
            value={productForm.aciklama}
            onChange={(e) => {
              setProductDirty(true);
              setProductForm((f) => ({ ...f, aciklama: e.target.value }));
            }}
            placeholder="Ürün detay açıklaması (isteğe bağlı)"
            disabled={productMutating}
          />
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <div className="text-xs font-semibold text-foreground">
            Vitrin & Tasarım Özellikleri
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Koleksiyon</Label>
              <RelationSelect
                value={productForm.koleksiyon_id}
                onChange={(v) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, koleksiyon_id: String(v ?? "") }));
                }}
                options={koleksiyonOptions}
                placeholder="Koleksiyon seçin…"
                clearable
                disabled={productMutating}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Yaş Grubu</Label>
              <RelationSelect
                value={productForm.yas_grubu_id}
                onChange={(v) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, yas_grubu_id: String(v ?? "") }));
                }}
                options={yasGrubuOptions}
                placeholder="Yaş grubu seçin…"
                clearable
                disabled={productMutating}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Hedef Kitle</Label>
              <select
                value={productForm.hedef_kitle}
                onChange={(e) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, hedef_kitle: e.target.value }));
                }}
                disabled={productMutating}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="">Seçilmedi</option>
                {(refsQ.data?.hedef_kitleler ?? []).map((hk) => (
                  <option key={hk.kod} value={hk.kod}>
                    {hk.ad}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Yüzey İşlemi</Label>
              <select
                value={productForm.yuzey}
                onChange={(e) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, yuzey: e.target.value }));
                }}
                disabled={productMutating}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="">Seçilmedi</option>
                {(refsQ.data?.yuzeyler ?? []).map((yz) => (
                  <option key={yz.kod} value={yz.kod}>
                    {yz.ad}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Zincir Tipi</Label>
              <RelationSelect
                value={productForm.zincir_tipi_id}
                onChange={(v) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, zincir_tipi_id: String(v ?? "") }));
                }}
                options={zincirTipiOptions}
                placeholder="Zincir tipi seçin…"
                clearable
                disabled={productMutating}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Kopça Tipi</Label>
              <RelationSelect
                value={productForm.kopca_tipi_id}
                onChange={(v) => {
                  setProductDirty(true);
                  setProductForm((f) => ({ ...f, kopca_tipi_id: String(v ?? "") }));
                }}
                options={kopcaTipiOptions}
                placeholder="Kopça tipi seçin…"
                clearable
                disabled={productMutating}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Teknikler</Label>
            <div className="flex flex-wrap gap-1.5">
              {(refsQ.data?.teknikler ?? []).map((t) => {
                const selected = productForm.teknik_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={productMutating}
                    onClick={() => toggleFormId("teknik_ids", t.id)}
                    className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.ad || t.kod}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stiller</Label>
            <div className="flex flex-wrap gap-1.5">
              {(refsQ.data?.stiller ?? []).map((s) => {
                const selected = productForm.stil_ids.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={productMutating}
                    onClick={() => toggleFormId("stil_ids", s.id)}
                    className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.ad || s.kod}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Özel Günler</Label>
            <div className="flex flex-wrap gap-1.5">
              {(refsQ.data?.ozel_gunler ?? []).map((o) => {
                const selected = productForm.ozel_gun_ids.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={productMutating}
                    onClick={() => toggleFormId("ozel_gun_ids", o.id)}
                    className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.ad || o.kod}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </EntityModal>

      {/* Nested Quick Category Modal (from Product Modal) */}
      <CategoryEntityModal
        open={nestedCategoryOpen}
        onOpenChange={setNestedCategoryOpen}
        onCreated={(cat: CategoryItem) => {
          setRecentCreatedCategory(cat);
          if (!cat.aktif) {
            setProductFormError(
              "Oluşturulan kategori pasif olduğu için aktif ürüne bağlanamaz; lütfen Kategoriler sekmesinden aktifleştirin."
            );
            return;
          }
          setProductFormError(null);
          setProductForm((f) => ({ ...f, kategori_id: String(cat.id) }));
          setProductDirty(true);
        }}
      />

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

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ürünü Reddet</DialogTitle>
            <DialogDescription>Lütfen red gerekçesini yazın.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReject} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Red Gerekçesi</Label>
              <Input
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Eksik bilgi veya hatalı ayar…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRejectOpen(false)}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={opsActionMutation.isPending}
              >
                Reddet
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
