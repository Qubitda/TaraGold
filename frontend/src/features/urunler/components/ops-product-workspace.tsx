"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RelationSelect } from "@/components/crud";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGram } from "@/lib/format";
import { urunlerService } from "../services";
import type {
  CatalogRefsResponse,
  CategoryItem,
  OpsProduct,
  OpsProductChannelItem,
  OpsProductStockResponse,
  OpsProductStone,
  OpsProductVariant,
  PricePreviewResponse,
  ProductMediaItem,
  ProductReadiness,
} from "../types";
import { ProductP0Panel } from "./product-p0-panel";
import { ProductStockPanel } from "./product-stock-panel";
import { VariantMatrixBlock } from "./variant-matrix-block";
import { Link } from "react-router";

export type OpsWorkspaceTab =
  | "general"
  | "features"
  | "variants"
  | "pricing"
  | "stock"
  | "media"
  | "stones"
  | "prepare"
  | "channels"
  | "audit";

type FormState = {
  ad: string;
  kategori_id: string;
  metal_id: string;
  ayar_id: string;
  aciklama: string;
  fiyat_tipi: string;
  temin_tipi: string;
  termin_gun: string;
  olcu_tipi: string;
  renk_ekseni: boolean;
  koleksiyon_id: string;
  hedef_kitle: string;
  yas_grubu_id: string;
  yuzey: string;
  zincir_tipi_id: string;
  kopca_tipi_id: string;
  teknik_ids: number[];
  stil_ids: number[];
  ozel_gun_ids: number[];
  meta_baslik: string;
  meta_aciklama: string;
  slug: string;
  canonical_url: string;
  gorsel_alt_metni: string;
};

function resolveMetalId(
  p: OpsProduct,
  refs?: CatalogRefsResponse | null
): string {
  if (p.metal_id) return String(p.metal_id);
  if (p.ayar_id && refs?.ayarlar?.length) {
    const a = refs.ayarlar.find((x) => x.id === p.ayar_id);
    if (a?.metal_id) return String(a.metal_id);
  }
  return "";
}

/** Kategori adından ölçü tipi önerisi (kullanıcı Özellikler’de değiştirebilir). */
function suggestOlcuTipiFromCategory(ad: string): string {
  const t = (ad || "").toLocaleLowerCase("tr-TR");
  if (/yüzük|yuzuk/.test(t)) return "yuzuk_no";
  if (/bilezik/.test(t)) return "bilezik_boyu";
  if (/bileklik/.test(t)) return "bileklik_boyu";
  if (/kolye|zincir|set\b|gerdan/.test(t)) return "zincir_uzunlugu";
  if (/küpe|kupe|küpesi/.test(t)) return ""; // ölçüsüz
  return "";
}

function productToForm(
  p: OpsProduct,
  refs?: CatalogRefsResponse | null
): FormState {
  return {
    ad: p.ad || "",
    kategori_id: p.kategori_id ? String(p.kategori_id) : "",
    metal_id: resolveMetalId(p, refs),
    ayar_id: p.ayar_id ? String(p.ayar_id) : "",
    aciklama: p.aciklama || "",
    fiyat_tipi: p.fiyat_tipi || "gram",
    temin_tipi: p.temin_tipi || "hazir",
    termin_gun: p.termin_gun != null ? String(p.termin_gun) : "",
    olcu_tipi: p.olcu_tipi || "",
    renk_ekseni: Boolean(p.renk_ekseni),
    koleksiyon_id: p.koleksiyon_id ? String(p.koleksiyon_id) : "",
    hedef_kitle: p.hedef_kitle || "",
    yas_grubu_id: p.yas_grubu_id ? String(p.yas_grubu_id) : "",
    yuzey: p.yuzey || "",
    zincir_tipi_id: p.zincir_tipi_id ? String(p.zincir_tipi_id) : "",
    kopca_tipi_id: p.kopca_tipi_id ? String(p.kopca_tipi_id) : "",
    teknik_ids: p.teknik_ids ? [...p.teknik_ids] : [],
    stil_ids: p.stil_ids ? [...p.stil_ids] : [],
    ozel_gun_ids: p.ozel_gun_ids ? [...p.ozel_gun_ids] : [],
    meta_baslik: p.meta_baslik || "",
    meta_aciklama: p.meta_aciklama || "",
    slug: p.slug || "",
    canonical_url: p.canonical_url || "",
    gorsel_alt_metni: p.gorsel_alt_metni || "",
  };
}

/** Tek navigasyon — sihirbaz + sekme çiftliği yok. */
const TABS: Array<[OpsWorkspaceTab, string]> = [
  ["general", "Genel"],
  ["features", "Özellikler"],
  ["variants", "Varyantlar"],
  ["pricing", "Fiyat önizleme"],
  ["stock", "Stok & Fiyat"],
  ["media", "Medya"],
  ["stones", "Taşlar"],
  ["prepare", "Hazırlık"],
  ["channels", "Yayın"],
  ["audit", "Geçmiş"],
];

const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i
  );
  return m?.[1] ?? null;
}

function VideoPreview({ url }: { url: string }) {
  const href = (url || "").trim();
  if (!href) {
    return (
      <div className="aspect-square flex items-center justify-center text-[11px] text-muted-foreground">
        Video bağlantısı yok
      </div>
    );
  }
  const yt = youtubeId(href);
  if (yt) {
    return (
      <iframe
        title="Ürün videosu"
        src={`https://www.youtube.com/embed/${yt}`}
        className="aspect-square w-full bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(href)) {
    return (
      <video
        src={href}
        className="aspect-square w-full object-contain bg-black"
        controls
        muted
        playsInline
      />
    );
  }
  return (
    <div className="aspect-square flex flex-col items-center justify-center gap-2 p-3 text-center">
      <span className="text-[11px] font-medium">Video bağlantısı</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] underline break-all text-muted-foreground"
      >
        {href}
      </a>
    </div>
  );
}

type Props = {
  product: OpsProduct;
  refs?: CatalogRefsResponse | null;
  categories: CategoryItem[];
  channels: OpsProductChannelItem[];
  channelsLoading?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  tab: OpsWorkspaceTab;
  onTabChange: (t: OpsWorkspaceTab) => void;
  dirty: boolean;
  onDirtyChange: (v: boolean) => void;
  onRefresh: () => Promise<void>;
  onToast: {
    success: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  };
  onCopy: () => void;
  onDelete: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  actionPending?: boolean;
};

export function OpsProductWorkspace({
  product,
  refs,
  categories,
  channels,
  channelsLoading,
  canEdit,
  canDelete,
  tab,
  onTabChange,
  dirty,
  onDirtyChange,
  onRefresh,
  onToast,
  onCopy,
  onDelete,
  onPublish,
  onUnpublish,
  actionPending,
}: Props) {
  const [form, setForm] = useState<FormState>(() => productToForm(product, refs));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ProductReadiness | null>(
    product.hazirlik ?? null
  );
  const [mediaBusy, setMediaBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaVariantId, setMediaVariantId] = useState("");
  const [stockData, setStockData] = useState<OpsProductStockResponse | null>(null);
  const [pricePreview, setPricePreview] = useState<PricePreviewResponse | null>(
    null
  );
  const [priceVariantId, setPriceVariantId] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [variantForm, setVariantForm] = useState({
    gram: "",
    renk_id: "",
    beden_id: "",
    ek_bedel: "0",
    sabit_fiyat: "",
    tedarikci_sku: "",
  });
  const [stoneForm, setStoneForm] = useState({
    tas_tipi_id: "",
    adet: "1",
    karat: "",
    bedel: "0",
  });
  const [auditRows, setAuditRows] = useState<
    Array<{
      id: number;
      action: string;
      success: boolean;
      reason: string;
      actor: string;
      created_at: string | null;
    }>
  >([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const acts = product.allowed_actions || [];
  // Yayında düzenleme yok; taslak → Yayınla (çift onay yok)
  const editable = canEdit && product.yayin_durumu !== "aktif";

  useEffect(() => {
    // Soft refresh (medya/kanal) kaydedilmemiş Genel/Özellikler editini silmesin
    if (dirty && product.id) {
      setReadiness(product.hazirlik ?? null);
      return;
    }
    setForm(productToForm(product, refs));
    onDirtyChange(false);
    setFieldErrors({});
    setSaveError(null);
    setReadiness(product.hazirlik ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.guncelleme_zamani]);

  // Metal API'den gelmezse ayar → metal doldur (Kaydet validasyonunu kırmaz)
  useEffect(() => {
    if (form.metal_id || !form.ayar_id || !refs?.ayarlar?.length) return;
    const a = refs.ayarlar.find((x) => String(x.id) === form.ayar_id);
    if (a?.metal_id) {
      setForm((f) => ({ ...f, metal_id: String(a.metal_id) }));
    }
  }, [form.metal_id, form.ayar_id, refs]);

  const olcuTipiLabel = useMemo(() => {
    const kod = form.olcu_tipi || product.olcu_tipi || "";
    if (!kod) return "Ölçüsüz";
    return (
      (refs?.olcu_tipleri ?? []).find((o) => o.kod === kod)?.ad || kod
    );
  }, [form.olcu_tipi, product.olcu_tipi, refs]);

  const bedenOptions = useMemo(() => {
    const tip = form.olcu_tipi || product.olcu_tipi || "";
    return (refs?.olculer ?? [])
      .filter((o) => !tip || o.tip === tip)
      .map((o) => ({
        value: String(o.id),
        label: o.deger || o.ad || String(o.id),
        subtitle: o.tip,
      }));
  }, [form.olcu_tipi, product.olcu_tipi, refs]);

  useEffect(() => {
    if (tab !== "audit") return;
    setAuditLoading(true);
    void urunlerService
      .getOpsProductAudit(product.id)
      .then((r) => setAuditRows(r.results || []))
      .catch(() => setAuditRows([]))
      .finally(() => setAuditLoading(false));
  }, [tab, product.id]);

  // Üst özet: satılabilir toplam (Stok sekmesi paneli ayrı yükler)
  useEffect(() => {
    void urunlerService
      .getOpsProductStock(product.id)
      .then(setStockData)
      .catch(() => setStockData(null));
  }, [product.id, product.guncelleme_zamani]);

  useEffect(() => {
    const variants = product.varyantlar ?? [];
    if (!priceVariantId && variants[0]?.id) {
      setPriceVariantId(String(variants[0].id));
    }
  }, [product.varyantlar, priceVariantId]);

  useEffect(() => {
    if (tab !== "pricing" || !priceVariantId) return;
    setPriceLoading(true);
    void urunlerService
      .getOpsPricePreview(product.id, priceVariantId)
      .then(setPricePreview)
      .catch(() => setPricePreview(null))
      .finally(() => setPriceLoading(false));
  }, [tab, product.id, priceVariantId]);

  const patchForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onDirtyChange(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const metalOptions = useMemo(
    () =>
      (refs?.metaller ?? []).map((m) => ({
        value: String(m.id),
        label: m.ad,
        subtitle: m.kod,
      })),
    [refs]
  );
  const ayarOptions = useMemo(() => {
    const all = refs?.ayarlar ?? [];
    const filtered = form.metal_id
      ? all.filter((a) => String(a.metal_id) === form.metal_id)
      : all;
    return filtered.map((a) => ({
      value: String(a.id),
      label: a.ayar_kodu,
      subtitle: `milyem ${a.milyem}`,
    }));
  }, [refs, form.metal_id]);
  const kategoriOptions = useMemo(
    () =>
      categories
        .filter((c) => c.aktif !== false)
        .map((c: CategoryItem) => ({
          value: String(c.id),
          label: c.tam_ad || c.ad,
          subtitle: c.kod,
        })),
    [categories]
  );
  const opt = (items?: Array<{ id: number; ad?: string; kod?: string; deger?: string }>) =>
    (items ?? []).map((i) => ({
      value: String(i.id),
      label: i.ad || i.deger || i.kod || String(i.id),
      subtitle: i.kod,
    }));

  const saveGeneral = async (): Promise<boolean> => {
    if (!editable) return false;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    const metalFromAyar =
      form.ayar_id && refs?.ayarlar
        ? String(
            refs.ayarlar.find((x) => String(x.id) === form.ayar_id)?.metal_id ||
              ""
          )
        : "";
    const metalId = form.metal_id || metalFromAyar || resolveMetalId(product, refs);
    const errors: Record<string, string> = {};
    if (!form.ad.trim()) errors.ad = "Ürün adı zorunlu";
    if (!form.kategori_id) errors.kategori_id = "Kategori zorunlu";
    if (!metalId) errors.metal_id = "Metal zorunlu";
    if (!form.ayar_id) errors.ayar_id = "Ayar zorunlu";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setSaving(false);
      onToast.error("Eksik alanlar var — Genel Bilgiler sekmesini kontrol edin");
      onTabChange("general");
      return false;
    }
    try {
      await urunlerService.updateOpsProduct(product.id, {
        ad: form.ad.trim(),
        kategori_id: Number(form.kategori_id),
        ayar_id: Number(form.ayar_id),
        aciklama: form.aciklama.trim(),
        fiyat_tipi: form.fiyat_tipi || "gram",
        temin_tipi: form.temin_tipi || "hazir",
        termin_gun: form.termin_gun.trim() ? Number(form.termin_gun) : null,
        olcu_tipi: form.olcu_tipi,
        renk_ekseni: form.renk_ekseni,
        koleksiyon_id: form.koleksiyon_id ? Number(form.koleksiyon_id) : null,
        hedef_kitle: form.hedef_kitle || "",
        yas_grubu_id: form.yas_grubu_id ? Number(form.yas_grubu_id) : null,
        yuzey: form.yuzey || "",
        zincir_tipi_id: form.zincir_tipi_id ? Number(form.zincir_tipi_id) : null,
        kopca_tipi_id: form.kopca_tipi_id ? Number(form.kopca_tipi_id) : null,
        teknik_ids: form.teknik_ids,
        stil_ids: form.stil_ids,
        ozel_gun_ids: form.ozel_gun_ids,
        meta_baslik: form.meta_baslik.trim(),
        meta_aciklama: form.meta_aciklama.trim(),
        slug: form.slug.trim(),
        canonical_url: form.canonical_url.trim(),
        gorsel_alt_metni: form.gorsel_alt_metni.trim(),
      });
      onDirtyChange(false);
      onToast.success("Ürün kaydedildi");
      await onRefresh();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kayıt başarısız";
      setSaveError(msg);
      onToast.error("Kayıt başarısız", err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refreshReadiness = async (): Promise<ProductReadiness | null> => {
    try {
      const r = await urunlerService.getOpsProductReadiness(product.id);
      setReadiness(r);
      return r;
    } catch {
      return null;
    }
  };

  const handlePublish = async () => {
    if (!onPublish) return;
    if (dirty) {
      const ok = await saveGeneral();
      if (!ok) return;
    }
    const r = await refreshReadiness();
    if (!r) {
      onToast.error("Hazırlık durumu alınamadı");
      return;
    }
    if (!r.hazir) {
      onToast.error(`Yayınlamadan önce eksikler: ${r.eksikler.join("; ")}`);
      if (r.eksikler.some((e) => /kapak|görsel/i.test(e))) onTabChange("media");
      else if (r.eksikler.some((e) => /varyant|gram|sabit/i.test(e)))
        onTabChange("variants");
      else if (r.eksikler.some((e) => /kanal/i.test(e))) onTabChange("channels");
      else onTabChange("prepare");
      return;
    }
    onPublish();
  };

  const addVariant = async (): Promise<boolean> => {
    if (!editable) return false;
    const fiyatTipi = form.fiyat_tipi || product.fiyat_tipi || "gram";
    const renkEkseni = form.renk_ekseni || product.renk_ekseni;
    const olcuTipi = form.olcu_tipi || product.olcu_tipi || "";

    if (fiyatTipi === "gram" && !variantForm.gram.trim()) {
      onToast.error("Gram bazlı üründe gram zorunlu");
      return false;
    }
    if (fiyatTipi === "sabit" && !variantForm.sabit_fiyat.trim()) {
      onToast.error("Sabit fiyatlı üründe sabit fiyat zorunlu");
      return false;
    }
    if (renkEkseni && !variantForm.renk_id) {
      onToast.error("Renk ekseni açık — renk seçin (veya Özellikler’den kapatın)");
      return false;
    }
    if (olcuTipi && !variantForm.beden_id) {
      onToast.error(`Ölçü tipi «${olcuTipiLabel}» — ölçü seçin`);
      return false;
    }
    if (dirty) {
      const ok = await saveGeneral();
      if (!ok) return false;
    }
    try {
      await urunlerService.addOpsVariant(product.id, {
        gram: fiyatTipi === "gram" ? variantForm.gram || undefined : undefined,
        sabit_fiyat:
          fiyatTipi === "sabit" ? variantForm.sabit_fiyat || undefined : undefined,
        renk_id:
          renkEkseni && variantForm.renk_id
            ? Number(variantForm.renk_id)
            : null,
        beden_id:
          olcuTipi && variantForm.beden_id
            ? Number(variantForm.beden_id)
            : null,
        ek_bedel: variantForm.ek_bedel || "0",
        tedarikci_sku: variantForm.tedarikci_sku || "",
      });
      onToast.success("Varyant eklendi");
      setVariantForm({
        gram: "",
        renk_id: "",
        beden_id: "",
        ek_bedel: "0",
        sabit_fiyat: "",
        tedarikci_sku: "",
      });
      await onRefresh();
      await refreshReadiness();
      return true;
    } catch (err) {
      onToast.error("Varyant eklenemedi", err);
      return false;
    }
  };

  const uploadFiles = async (files: File[], asCover: boolean) => {
    if (!editable || !files.length) return;
    setMediaBusy(true);
    try {
      const hasCover = (product.gorseller ?? []).some((g) => g.kapak);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.size > MAX_IMAGE_BYTES) {
          onToast.error(`${f.name}: en fazla 8 MB`);
          continue;
        }
        const makeCover = asCover ? i === 0 : !hasCover && i === 0;
        await urunlerService.uploadOpsProductMedia(product.id, f, {
          kapak: makeCover && !mediaVariantId,
          tip: makeCover && !mediaVariantId ? "kapak" : "galeri",
          varyant_id: mediaVariantId ? Number(mediaVariantId) : null,
        });
      }
      onToast.success("Medya yüklendi");
      await onRefresh();
      await refreshReadiness();
    } catch (err) {
      onToast.error("Medya yüklenemedi", err);
    } finally {
      setMediaBusy(false);
    }
  };

  const addVideoUrl = async () => {
    if (!editable || !videoUrl.trim()) return;
    setMediaBusy(true);
    try {
      const fd = new FormData();
      fd.append("tip", "video");
      fd.append("harici_url", videoUrl.trim());
      fd.append("alt_metin", "Video");
      // apiFetch for FormData without file — use dedicated path via fetch-like service
      await urunlerService.addOpsProductVideoUrl(product.id, videoUrl.trim());
      setVideoUrl("");
      onToast.success("Video bağlantısı eklendi");
      await onRefresh();
    } catch (err) {
      onToast.error("Video eklenemedi", err);
    } finally {
      setMediaBusy(false);
    }
  };

  const gorseller = product.gorseller ?? [];
  const variants = product.varyantlar ?? [];
  const stones = product.taslar ?? [];

  const FieldError = ({ name }: { name: string }) =>
    fieldErrors[name] ? (
      <p className="text-[11px] text-destructive">{fieldErrors[name]}</p>
    ) : null;

  return (
    <div className="flex flex-col gap-3 min-h-0 min-w-0 w-full overflow-x-hidden">
      {/* pr-10: dialog X özet kutularına binmesin */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3 pr-10 shrink-0">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight truncate">
            {product.ad}
          </h2>
          <div className="font-mono text-[11px] text-muted-foreground">
            {product.platform_kodu || "—"}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge
              variant={product.yayin_durumu === "aktif" ? "success" : "outline"}
              className="text-[10px]"
            >
              {product.yayin_durumu === "aktif" ? "Yayında" : "Taslak / Pasif"}
            </Badge>
            {product.metal || product.ayar ? (
              <Badge variant="outline" className="text-[10px]">
                {[product.metal, product.ayar].filter(Boolean).join(" · ")}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] shrink-0">
          <div className="rounded-[6px] border border-border bg-muted/30 px-2.5 py-1.5 min-w-[5.5rem]">
            <div className="text-muted-foreground leading-tight">Varyant</div>
            <div className="font-medium tabular-nums leading-tight">
              {(product.varyantlar ?? []).filter((v) => v.aktif !== false).length}
            </div>
          </div>
          {readiness ? (
            <div className="rounded-[6px] border border-border bg-muted/30 px-2.5 py-1.5 min-w-[8rem]">
              <div className="font-medium leading-tight">
                Hazırlık {readiness.yuzde}%
              </div>
              <div className="text-muted-foreground leading-tight">
                {readiness.tamamlanan}/{readiness.toplam} zorunlu
              </div>
            </div>
          ) : null}
          {stockData ? (
            <div className="rounded-[6px] border border-border bg-muted/30 px-2.5 py-1.5 min-w-[5.5rem]">
              <div className="text-muted-foreground leading-tight">Satılabilir</div>
              <div className="font-medium tabular-nums leading-tight">
                {stockData.results.reduce(
                  (s, r) => s + (Number(r.available) || 0),
                  0
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1 w-full shrink-0"
        role="tablist"
        aria-label="Ürün workspace sekmeleri"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTabChange(id)}
            className={`inline-flex h-8 items-center rounded-[4px] px-2.5 text-[11px] font-medium leading-none whitespace-nowrap ${
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 min-w-0 flex-1 max-h-[min(55vh,28rem)] overflow-y-auto overflow-x-hidden space-y-4">
        {tab === "general" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4 min-w-0">
            <div className="sm:col-span-2 flex flex-col gap-1.5 min-w-0">
              <Label>Ürün Adı</Label>
              <Input
                value={form.ad}
                disabled={!editable || saving}
                onChange={(e) => patchForm("ad", e.target.value)}
              />
              <FieldError name="ad" />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Ürün Kodu</Label>
              <Input value={product.platform_kodu || ""} disabled className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Kategori</Label>
              <RelationSelect
                value={form.kategori_id}
                onChange={(v) => {
                  const id = String(v ?? "");
                  const cat = categories.find((c) => String(c.id) === id);
                  const suggested = cat
                    ? suggestOlcuTipiFromCategory(cat.tam_ad || cat.ad || "")
                    : "";
                  onDirtyChange(true);
                  setForm((f) => ({
                    ...f,
                    kategori_id: id,
                    ...(f.olcu_tipi ? {} : { olcu_tipi: suggested }),
                  }));
                }}
                options={kategoriOptions}
                disabled={!editable || saving}
                placeholder="Kategori…"
              />
              <FieldError name="kategori_id" />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1.5 min-w-0">
              <Label>Açıklama</Label>
              <textarea
                value={form.aciklama}
                disabled={!editable || saving}
                onChange={(e) => patchForm("aciklama", e.target.value)}
                className="min-h-[80px] w-full min-w-0 rounded-[6px] border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Fiyat tipi</Label>
              <select
                value={form.fiyat_tipi}
                disabled={!editable || saving}
                onChange={(e) => patchForm("fiyat_tipi", e.target.value)}
                className="h-9 w-full min-w-0 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="gram">Gram bazlı</option>
                <option value="sabit">Sabit fiyat</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Temin tipi</Label>
              <select
                value={form.temin_tipi}
                disabled={!editable || saving}
                onChange={(e) => patchForm("temin_tipi", e.target.value)}
                className="h-9 w-full min-w-0 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="hazir">Hazır stok</option>
                <option value="siparis_ozel">Siparişe özel</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Meta başlık</Label>
              <Input
                value={form.meta_baslik}
                disabled={!editable || saving}
                onChange={(e) => patchForm("meta_baslik", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                disabled={!editable || saving}
                onChange={(e) => patchForm("slug", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        ) : null}

        {tab === "features" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4 min-w-0">
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Metal / Materyal</Label>
              <RelationSelect
                value={form.metal_id}
                onChange={(v) => {
                  const next = String(v ?? "");
                  onDirtyChange(true);
                  setForm((f) => {
                    const ok =
                      f.ayar_id &&
                      (refs?.ayarlar ?? []).some(
                        (a) =>
                          String(a.id) === f.ayar_id && String(a.metal_id) === next
                      );
                    return { ...f, metal_id: next, ayar_id: ok ? f.ayar_id : "" };
                  });
                }}
                options={metalOptions}
                disabled={!editable || saving}
                placeholder="Metal…"
              />
              <FieldError name="metal_id" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ayar / Saflık</Label>
              <RelationSelect
                value={form.ayar_id}
                onChange={(v) => patchForm("ayar_id", String(v ?? ""))}
                options={ayarOptions}
                disabled={!editable || saving || !form.metal_id}
                placeholder="Ayar…"
              />
              <FieldError name="ayar_id" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Koleksiyon</Label>
              <RelationSelect
                value={form.koleksiyon_id}
                onChange={(v) => patchForm("koleksiyon_id", String(v ?? ""))}
                options={opt(refs?.koleksiyonlar)}
                disabled={!editable || saving}
                clearable
                placeholder="Koleksiyon…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ölçü tipi</Label>
              <select
                value={form.olcu_tipi}
                disabled={!editable || saving}
                onChange={(e) => {
                  patchForm("olcu_tipi", e.target.value);
                  setVariantForm((f) => ({ ...f, beden_id: "" }));
                }}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="">Ölçüsüz (küpe vb.)</option>
                {(refs?.olcu_tipleri ?? []).map((o) => (
                  <option key={o.kod} value={o.kod}>
                    {o.ad}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Yüzük → yüzük no · Bilezik → cm · Kolye → zincir uzunluğu · Küpe → ölçüsüz.
                Kaydet’ten sonra varyantta yalnızca bu tipteki ölçüler listelenir.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Zincir tipi</Label>
              <RelationSelect
                value={form.zincir_tipi_id}
                onChange={(v) => patchForm("zincir_tipi_id", String(v ?? ""))}
                options={opt(refs?.zincir_tipleri)}
                disabled={!editable || saving}
                clearable
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Kopça tipi</Label>
              <RelationSelect
                value={form.kopca_tipi_id}
                onChange={(v) => patchForm("kopca_tipi_id", String(v ?? ""))}
                options={opt(refs?.kopca_tipleri)}
                disabled={!editable || saving}
                clearable
              />
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={form.renk_ekseni}
                disabled={!editable || saving}
                onChange={(e) => patchForm("renk_ekseni", e.target.checked)}
              />
              Renk ekseni aktif
            </label>
            <div className="sm:col-span-2 space-y-2">
              <Label>Teknikler</Label>
              <div className="flex flex-wrap gap-1.5">
                {(refs?.teknikler ?? []).map((t) => {
                  const on = form.teknik_ids.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!editable || saving}
                      onClick={() => {
                        onDirtyChange(true);
                        setForm((f) => ({
                          ...f,
                          teknik_ids: on
                            ? f.teknik_ids.filter((x) => x !== t.id)
                            : [...f.teknik_ids, t.id],
                        }));
                      }}
                      className={`rounded border px-2 py-1 text-[11px] ${
                        on ? "border-foreground bg-foreground text-background" : "border-border"
                      }`}
                    >
                      {t.ad}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Stiller</Label>
              <div className="flex flex-wrap gap-1.5">
                {(refs?.stiller ?? []).map((t) => {
                  const on = form.stil_ids.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!editable || saving}
                      onClick={() => {
                        onDirtyChange(true);
                        setForm((f) => ({
                          ...f,
                          stil_ids: on
                            ? f.stil_ids.filter((x) => x !== t.id)
                            : [...f.stil_ids, t.id],
                        }));
                      }}
                      className={`rounded border px-2 py-1 text-[11px] ${
                        on ? "border-foreground bg-foreground text-background" : "border-border"
                      }`}
                    >
                      {t.ad}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ölçü tipi ürün düzeyinde seçilir (Özellikler sekmesi): yüzük → yüzük no,
              bilezik → cm, kolye/zincir → uzunluk, küpe → genelde ölçüsüz. Şu an:{" "}
              <button
                type="button"
                className="underline font-medium text-foreground"
                onClick={() => onTabChange("features")}
              >
                {olcuTipiLabel}
              </button>
              {form.renk_ekseni ? " · Renk ekseni açık" : " · Renk kapalı"}
            </p>
            {editable ? (
              <VariantMatrixBlock
                product={{ ...product, olcu_tipi: form.olcu_tipi || product.olcu_tipi, renk_ekseni: form.renk_ekseni, fiyat_tipi: form.fiyat_tipi || product.fiyat_tipi }}
                refs={refs}
                disabled={saving}
                onToast={onToast}
                onDone={async () => {
                  await onRefresh();
                  await refreshReadiness();
                }}
              />
            ) : null}
            {editable ? (
              <div className="rounded-[8px] border border-border p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(form.fiyat_tipi || product.fiyat_tipi) !== "sabit" ? (
                  <Input
                    placeholder="Gram *"
                    value={variantForm.gram}
                    onChange={(e) =>
                      setVariantForm((f) => ({ ...f, gram: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    placeholder="Sabit fiyat *"
                    value={variantForm.sabit_fiyat}
                    onChange={(e) =>
                      setVariantForm((f) => ({
                        ...f,
                        sabit_fiyat: e.target.value,
                      }))
                    }
                  />
                )}
                {form.renk_ekseni ? (
                  <RelationSelect
                    value={variantForm.renk_id}
                    onChange={(v) =>
                      setVariantForm((f) => ({
                        ...f,
                        renk_id: String(v ?? ""),
                      }))
                    }
                    options={opt(refs?.renkler)}
                    placeholder="Renk *"
                    clearable
                  />
                ) : null}
                {form.olcu_tipi || product.olcu_tipi ? (
                  <RelationSelect
                    value={variantForm.beden_id}
                    onChange={(v) =>
                      setVariantForm((f) => ({
                        ...f,
                        beden_id: String(v ?? ""),
                      }))
                    }
                    options={bedenOptions}
                    placeholder={`${olcuTipiLabel} *`}
                    clearable
                  />
                ) : null}
                <Input
                  placeholder="Tedarikçi SKU"
                  value={variantForm.tedarikci_sku}
                  onChange={(e) =>
                    setVariantForm((f) => ({
                      ...f,
                      tedarikci_sku: e.target.value,
                    }))
                  }
                />
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={mediaBusy || saving}
                  onClick={() => void addVariant()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Varyant ekle
                </Button>
                {!form.olcu_tipi && !product.olcu_tipi ? (
                  <p className="col-span-full text-[11px] text-muted-foreground">
                    Ölçü alanı yok çünkü ürün ölçüsüz. Yüzük/bilezik için Özellikler → Ölçü
                    tipini seçip Kaydet, sonra ölçü seçerek varyant ekleyin.
                  </p>
                ) : null}
                {form.olcu_tipi && bedenOptions.length === 0 ? (
                  <p className="col-span-full text-[11px] text-destructive">
                    Bu ölçü tipi için referans değer yok.{" "}
                    <Link
                      to="/tanimlar?grup=olcu"
                      className="underline underline-offset-2"
                    >
                      Tanımlar → Ölçü / Beden
                    </Link>{" "}
                    üzerinden ekleyin.
                  </p>
                ) : null}
              </div>
            ) : null}
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aktif varyant yok. Gram (veya sabit fiyat) girip «Varyant ekle»ye basın —
                alttaki Kaydet yalnızca ürün bilgilerini kaydeder.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Renk</TableHead>
                    <TableHead>Ölçü</TableHead>
                    <TableHead className="text-right">Gram</TableHead>
                    <TableHead className="text-right">Sabit</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v: OpsProductVariant) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell className="text-xs">{v.renk || "—"}</TableCell>
                      <TableCell className="text-xs">{v.beden || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatGram(v.gram)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {v.sabit_fiyat ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => {
                              void urunlerService
                                .deleteOpsVariant(product.id, v.id)
                                .then(async () => {
                                  onToast.success("Varyant silindi");
                                  await onRefresh();
                                  await refreshReadiness();
                                })
                                .catch((err) =>
                                  onToast.error("Varyant silinemedi", err)
                                );
                            }}
                          >
                            Sil
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}

        {tab === "pricing" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Fiyat motoru yeniden yazılmaz. Önizleme mevcut quote / teklif kurallarından gelir;
              teklif yoksa sahte fiyat üretilmez. Ürün fiyat tipi:{" "}
              <strong>{form.fiyat_tipi || product.fiyat_tipi}</strong>.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1 min-w-[12rem]">
                <Label className="text-[11px]">Varyant</Label>
                <select
                  className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  value={priceVariantId}
                  onChange={(e) => setPriceVariantId(e.target.value)}
                >
                  {(product.varyantlar ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku || v.id} · {v.renk || "—"} / {v.beden || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!priceVariantId || priceLoading}
                onClick={() => {
                  if (!priceVariantId) return;
                  setPriceLoading(true);
                  void urunlerService
                    .getOpsPricePreview(product.id, priceVariantId)
                    .then(setPricePreview)
                    .catch((err) => onToast.error("Önizleme alınamadı", err))
                    .finally(() => setPriceLoading(false));
                }}
              >
                Yenile
              </Button>
            </div>
            {priceLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : pricePreview ? (
              <div className="rounded-[8px] border border-border p-3 space-y-2 text-xs">
                <div className="font-medium">
                  {pricePreview.available
                    ? "Önizleme hazır"
                    : pricePreview.reason_code || "Fiyat üretilemedi"}
                </div>
                {pricePreview.detail ? (
                  <p className="text-muted-foreground">{pricePreview.detail}</p>
                ) : null}
                {pricePreview.hint ? (
                  <p className="text-muted-foreground">{pricePreview.hint}</p>
                ) : null}
                {pricePreview.teklif?.birim_fiyat ? (
                  <p className="font-mono text-sm">
                    {pricePreview.teklif.birim_fiyat}{" "}
                    {pricePreview.teklif.para_birimi || ""}
                  </p>
                ) : null}
                {pricePreview.aciklama ? (
                  <dl className="grid grid-cols-2 gap-1">
                    {Object.entries(pricePreview.aciklama).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono">{v}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : null}
                <p className="text-[10px] text-muted-foreground">
                  Gram: {pricePreview.gram ?? "—"} · Ek bedel:{" "}
                  {pricePreview.ek_bedel ?? "0"} · Sabit:{" "}
                  {pricePreview.sabit_fiyat ?? "—"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Önce varyant ekleyin, sonra bu sekmeden önizleyin.
              </p>
            )}
          </div>
        ) : null}

        {tab === "stock" ? (
          <ProductStockPanel
            product={product}
            canAdjust={canEdit}
            onToast={onToast}
          />
        ) : null}

        {tab === "media" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              JPEG/PNG/WebP/GIF, en fazla 8 MB. Kapak görseli yayınlamak için zorunludur.
              Video için yalnızca URL desteklenir. İsteğe bağlı varyant görseli bağlayın.
            </p>
            {editable ? (
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px]">Varyant görseli (isteğe bağlı)</Label>
                  <select
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs min-w-[10rem]"
                    value={mediaVariantId}
                    onChange={(e) => setMediaVariantId(e.target.value)}
                    disabled={mediaBusy}
                  >
                    <option value="">Ürün geneli</option>
                    {(product.varyantlar ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.sku || v.id} {v.renk || ""} {v.beden || ""}
                      </option>
                    ))}
                  </select>
                </div>
                <Label className="cursor-pointer rounded-md border px-3 py-2 text-xs">
                  Kapak yükle
                  <input
                    type="file"
                    accept={ACCEPT_IMAGES}
                    className="hidden"
                    disabled={mediaBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFiles([f], true);
                      e.target.value = "";
                    }}
                  />
                </Label>
                <Label className="cursor-pointer rounded-md border px-3 py-2 text-xs">
                  Galeri (çoklu)
                  <input
                    type="file"
                    accept={ACCEPT_IMAGES}
                    multiple
                    className="hidden"
                    disabled={mediaBusy}
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      if (list.length) void uploadFiles(list, false);
                      e.target.value = "";
                    }}
                  />
                </Label>
                <div className="flex gap-2 items-center flex-1 min-w-[16rem]">
                  <Input
                    placeholder="https://… video URL"
                    value={videoUrl}
                    disabled={mediaBusy}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mediaBusy || !videoUrl.trim()}
                    onClick={() => void addVideoUrl()}
                  >
                    Video ekle
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gorseller.map((g: ProductMediaItem) => (
                <div
                  key={g.id}
                  className="rounded-[8px] border border-border overflow-hidden bg-muted/20"
                >
                  {g.tip === "video" ? (
                    <VideoPreview url={g.harici_url || g.url || ""} />
                  ) : g.url ? (
                    <img
                      src={g.url}
                      alt={g.alt_metin || ""}
                      className="aspect-square w-full object-contain bg-[linear-gradient(160deg,#f7f5f2,#efeae3)] p-2"
                    />
                  ) : (
                    <div className="aspect-square border-dashed" />
                  )}
                  <div className="p-2 space-y-1 text-[10px]">
                    <div className="font-medium">
                      {g.kapak ? "Kapak" : g.tip} · sıra {g.sira}
                      {g.varyant_id ? ` · var#${g.varyant_id}` : ""}
                    </div>
                    {editable ? (
                      <div className="flex flex-wrap gap-1">
                        {!g.kapak && g.tip !== "video" ? (
                          <button
                            type="button"
                            className="rounded border px-1"
                            disabled={mediaBusy}
                            onClick={() => {
                              void urunlerService
                                .setOpsProductMediaCover(product.id, g.id)
                                .then(async () => {
                                  await onRefresh();
                                  await refreshReadiness();
                                })
                                .catch((err) =>
                                  onToast.error("Kapak seçilemedi", err)
                                );
                            }}
                          >
                            Kapak yap
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded border px-1 text-destructive"
                          disabled={mediaBusy}
                          onClick={() => {
                            void urunlerService
                              .deleteOpsProductMedia(product.id, g.id)
                              .then(async () => {
                                onToast.success("Medya silindi");
                                await onRefresh();
                                await refreshReadiness();
                              })
                              .catch((err) => onToast.error("Silinemedi", err));
                          }}
                        >
                          Sil
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {gorseller.length === 0 ? (
              <p className="text-xs text-muted-foreground">Henüz medya yok.</p>
            ) : null}
          </div>
        ) : null}

        {tab === "stones" ? (
          <div className="space-y-3">
            {editable ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-[8px] border p-3">
                <RelationSelect
                  value={stoneForm.tas_tipi_id}
                  onChange={(v) =>
                    setStoneForm((f) => ({ ...f, tas_tipi_id: String(v ?? "") }))
                  }
                  options={opt(refs?.tas_tipleri)}
                  placeholder="Taş türü"
                />
                <Input
                  value={stoneForm.adet}
                  onChange={(e) =>
                    setStoneForm((f) => ({ ...f, adet: e.target.value }))
                  }
                  placeholder="Adet"
                />
                <Input
                  value={stoneForm.karat}
                  onChange={(e) =>
                    setStoneForm((f) => ({ ...f, karat: e.target.value }))
                  }
                  placeholder="Karat"
                />
                <Button
                  size="sm"
                  disabled={!stoneForm.tas_tipi_id}
                  onClick={() => {
                    void urunlerService
                      .addOpsProductStone(product.id, {
                        tas_tipi_id: Number(stoneForm.tas_tipi_id),
                        adet: Number(stoneForm.adet || "1"),
                        karat: stoneForm.karat || null,
                        bedel: stoneForm.bedel || "0",
                      })
                      .then(async () => {
                        onToast.success("Taş eklendi");
                        setStoneForm({
                          tas_tipi_id: "",
                          adet: "1",
                          karat: "",
                          bedel: "0",
                        });
                        await onRefresh();
                      })
                      .catch((err) => onToast.error("Taş eklenemedi", err));
                  }}
                >
                  Ekle
                </Button>
              </div>
            ) : null}
            {(stones as OpsProductStone[]).length === 0 ? (
              <p className="text-xs text-muted-foreground">Taş kaydı yok.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {(stones as OpsProductStone[]).map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between gap-2 rounded border px-3 py-2"
                  >
                    <span>
                      {t.tas_tipi} · {t.adet} adet
                      {t.karat ? ` · ${t.karat} ct` : ""}
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        className="text-destructive"
                        onClick={() => {
                          void urunlerService
                            .deleteOpsProductStone(product.id, t.id)
                            .then(async () => {
                              onToast.success("Taş silindi");
                              await onRefresh();
                            })
                            .catch((err) => onToast.error("Silinemedi", err));
                        }}
                      >
                        Sil
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "prepare" ? (
          <ProductP0Panel product={product} refs={refs} onChanged={() => void onRefresh()} />
        ) : null}

        {tab === "channels" ? (
          <div className="space-y-2">
            {channelsLoading ? (
              <p className="text-xs text-muted-foreground">Kanallar yükleniyor…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {channels.map((ch) => (
                  <label
                    key={ch.kanal_id}
                    className="flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-medium">{ch.ad}</div>
                      <div className="text-muted-foreground font-mono">{ch.kod}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={ch.aktif}
                      disabled={!canEdit || actionPending}
                      onChange={(e) => {
                        void urunlerService
                          .setOpsProductChannel(product.id, ch.kanal_id, e.target.checked)
                          .then(async () => {
                            onToast.success("Kanal güncellendi");
                            await onRefresh();
                          })
                          .catch((err) => onToast.error("Kanal güncellenemedi", err));
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "audit" ? (
          auditLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {auditRows.map((r) => (
                <li key={r.id} className="rounded border px-3 py-2">
                  <div className="font-medium">
                    {r.action}{" "}
                    <Badge
                      variant={r.success ? "success" : "destructive"}
                      className="text-[9px]"
                    >
                      {r.success ? "ok" : "fail"}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">
                    {r.actor} · {r.created_at || "—"}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </li>
              ))}
              {auditRows.length === 0 ? (
                <p className="text-muted-foreground">Geçmiş kaydı yok.</p>
              ) : null}
            </ul>
          )
        ) : null}
      </div>

      {saveError ? (
        <p className="text-xs text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3 shrink-0 bg-card">
        {editable ? (
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={saving}
            onClick={() => {
              void (async () => {
                const pendingVariant =
                  tab === "variants" &&
                  Boolean(
                    variantForm.gram.trim() ||
                      variantForm.sabit_fiyat.trim() ||
                      variantForm.renk_id ||
                      variantForm.beden_id ||
                      variantForm.tedarikci_sku.trim()
                  );
                if (pendingVariant) {
                  await addVariant();
                  return;
                }
                if (!dirty) {
                  onToast.success(
                    tab === "variants"
                      ? "Varyant için gram girip «Varyant ekle» veya Kaydet’e basın"
                      : "Kaydedilecek değişiklik yok"
                  );
                  return;
                }
                await saveGeneral();
              })();
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Kaydet
          </Button>
        ) : null}
        {acts.includes("publish") && onPublish ? (
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={actionPending || saving}
            onClick={() => void handlePublish()}
          >
            Yayınla
          </Button>
        ) : null}
        {acts.includes("unpublish") && onUnpublish ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onUnpublish}
          >
            Yayından Kaldır
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCopy}>
          Kopyala
        </Button>
        {canDelete ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            onClick={onDelete}
          >
            Sil
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs ml-auto"
          onClick={() => void refreshReadiness()}
        >
          Checklist yenile
        </Button>
      </div>
    </div>
  );
}
