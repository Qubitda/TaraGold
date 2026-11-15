"use client";

import React, { useMemo, useState } from "react";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  useCreateOpsCategoryMutation,
  useDeleteOpsCategoryMutation,
  useOpsCategoriesQuery,
  useUpdateOpsCategoryMutation,
} from "../hooks";
import { useOpsDefinitionsQuery } from "@/features/tanimlar";
import type { OpsFiyatGrubu } from "@/features/tanimlar";
import type { CategoryItem, CategoryWriteRequest } from "../types";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
} from "@/components/crud";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderTree, Star } from "lucide-react";

interface CategoryFormState {
  kod: string;
  ad: string;
  ust_id: string;
  fiyat_grubu_id: string;
  sira: string;
  aktif: boolean;
  dahili: boolean;
  one_cikan: boolean;
  ikon: string;
  seo_baslik: string;
  seo_aciklama: string;
}

function emptyCategoryForm(): CategoryFormState {
  return {
    kod: "",
    ad: "",
    ust_id: "",
    fiyat_grubu_id: "",
    sira: "0",
    aktif: true,
    dahili: false,
    one_cikan: false,
    ikon: "",
    seo_baslik: "",
    seo_aciklama: "",
  };
}

function catToForm(cat: CategoryItem): CategoryFormState {
  return {
    kod: cat.kod,
    ad: cat.ad,
    ust_id: cat.ust_id ? String(cat.ust_id) : "",
    fiyat_grubu_id: cat.fiyat_grubu_id ? String(cat.fiyat_grubu_id) : "",
    sira: String(cat.sira ?? 0),
    aktif: Boolean(cat.aktif),
    dahili: Boolean(cat.dahili),
    one_cikan: Boolean(cat.one_cikan),
    ikon: cat.ikon || "",
    seo_baslik: cat.seo_baslik || "",
    seo_aciklama: cat.seo_aciklama || "",
  };
}

export function CategoryEntityModal({
  open,
  onOpenChange,
  editing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: CategoryItem | null;
  onCreated?: (cat: CategoryItem) => void;
}) {
  const actionToast = useActionToast();
  const createMut = useCreateOpsCategoryMutation();
  const updateMut = useUpdateOpsCategoryMutation();

  const allCatsQ = useOpsCategoriesQuery({ page_size: "100" }, open);
  const fgQ = useOpsDefinitionsQuery("fiyat-gruplari", open, { page_size: "100" });

  const [form, setForm] = useState<CategoryFormState>(() =>
    editing ? catToForm(editing) : emptyCategoryForm()
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(editing ? catToForm(editing) : emptyCategoryForm());
      setDirty(false);
      setError(null);
    }
  }, [open, editing]);

  const setField = <K extends keyof CategoryFormState>(
    key: K,
    val: CategoryFormState[K]
  ) => {
    setDirty(true);
    setForm((s) => ({ ...s, [key]: val }));
  };

  const parentOptions = useMemo(
    () =>
      (allCatsQ.data?.results ?? [])
        .filter((c) => !editing || c.id !== editing.id)
        .map((c) => ({
          value: String(c.id),
          label: c.tam_ad || c.ad,
          subtitle: c.kod,
        })),
    [allCatsQ.data, editing]
  );

  const fgOptions = useMemo(
    () =>
      ((fgQ.data?.results ?? []) as OpsFiyatGrubu[]).map((g) => ({
        value: String(g.id),
        label: g.ad,
        subtitle: g.kod,
      })),
    [fgQ.data]
  );

  const submitting = createMut.isPending || updateMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.kod.trim() || !form.ad.trim()) {
      setError("Kategori kodu ve adı zorunludur.");
      return;
    }
    if (!form.ust_id && !form.fiyat_grubu_id) {
      setError("Ana kategoriler için fiyat grubu seçilmesi zorunludur.");
      return;
    }
    const payload: CategoryWriteRequest = {
      kod: form.kod.trim().toUpperCase(),
      ad: form.ad.trim(),
      ust_id: form.ust_id ? Number(form.ust_id) : null,
      fiyat_grubu_id: form.fiyat_grubu_id ? Number(form.fiyat_grubu_id) : null,
      sira: Number(form.sira || "0"),
      aktif: form.aktif,
      dahili: form.dahili,
      one_cikan: form.one_cikan,
      ikon: form.ikon.trim() || undefined,
      seo_baslik: form.seo_baslik.trim() || undefined,
      seo_aciklama: form.seo_aciklama.trim() || undefined,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        actionToast.success("Kategori güncellendi");
      } else {
        const created = await createMut.mutateAsync(payload);
        actionToast.success("Yeni kategori eklendi");
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kategori kaydedilemedi.";
      setError(msg);
      actionToast.error("Kategori kaydedilemedi", err);
    }
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Kategoriyi Düzenle" : "Yeni Kategori"}
      description="Kategori bilgilerini ve vitrin sıralama ayarlarını belirleyin."
      isDirty={dirty}
      isSubmitting={submitting}
      error={error}
      onSubmit={handleSubmit}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Kategori Kodu</Label>
          <Input
            required
            maxLength={30}
            value={form.kod}
            onChange={(e) => setField("kod", e.target.value)}
            placeholder="BILEZIK"
            className="font-mono text-xs"
            disabled={submitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Kategori Adı</Label>
          <Input
            required
            maxLength={80}
            value={form.ad}
            onChange={(e) => setField("ad", e.target.value)}
            placeholder="Bilezikler"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Üst Kategori</Label>
          <RelationSelect
            value={form.ust_id}
            onChange={(v) => setField("ust_id", String(v ?? ""))}
            options={parentOptions}
            placeholder="Boş = ana kategori"
            clearable
            disabled={submitting}
          />
          <p className="text-[10px] text-muted-foreground">
            Örn. Mücevher → Yüzük → Tektaş. En fazla 3 seviye.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{form.ust_id ? "Fiyat Grubu (isteğe bağlı)" : "Fiyat Grubu *"}</Label>
          <RelationSelect
            value={form.fiyat_grubu_id}
            onChange={(v) => setField("fiyat_grubu_id", String(v ?? ""))}
            options={fgOptions}
            placeholder={
              form.ust_id
                ? "Boş bırakırsanız üstten miras alınır"
                : "Ana kategoride zorunlu"
            }
            clearable
            disabled={submitting}
          />
          <p className="text-[10px] text-muted-foreground">
            Fiyat grubu, alıcı kanal fiyatlandırmasında kategori marjını belirler. Alt
            kategoride boş bırakılırsa üst kategorinin grubu kullanılır.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label>Görüntüleme Sırası</Label>
          <Input
            type="number"
            value={form.sira}
            onChange={(e) => setField("sira", e.target.value)}
            disabled={submitting}
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={form.aktif}
            onChange={(e) => setField("aktif", e.target.checked)}
            disabled={submitting}
          />
          Aktif
        </label>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={form.one_cikan}
            onChange={(e) => setField("one_cikan", e.target.checked)}
            disabled={submitting}
          />
          Öne Çıkan
        </label>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={form.dahili}
            onChange={(e) => setField("dahili", e.target.checked)}
            disabled={submitting}
          />
          Yalnız Dahili
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Başlık Özeti</Label>
          <Input
            value={form.seo_baslik}
            onChange={(e) => setField("seo_baslik", e.target.value)}
            placeholder="Vitrin başlığı (isteğe bağlı)"
            disabled={submitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Kısa Açıklama</Label>
          <Input
            value={form.seo_aciklama}
            onChange={(e) => setField("seo_aciklama", e.target.value)}
            placeholder="Kategori açıklaması (isteğe bağlı)"
            disabled={submitting}
          />
        </div>
      </div>
    </EntityModal>
  );
}

function buildCategoryForest(items: CategoryItem[]): CategoryItem[] {
  const byParent = new Map<number | null, CategoryItem[]>();
  for (const c of items) {
    const pid = c.ust_id ?? null;
    const list = byParent.get(pid) ?? [];
    list.push(c);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || a.ad.localeCompare(b.ad, "tr"));
  }
  const out: CategoryItem[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ ...c, _depth: depth } as CategoryItem & { _depth?: number });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (üst listede yok)
  const seen = new Set(out.map((c) => c.id));
  for (const c of items) {
    if (!seen.has(c.id)) out.push(c);
  }
  return out;
}

export function CategoriesPanel() {
  const actionToast = useActionToast();
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState("");
  const [oneCikan, setOneCikan] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      aktif: aktif || undefined,
      one_cikan: oneCikan || undefined,
      page: String(page),
      page_size: String(pageSize),
    }),
    [q, aktif, oneCikan, page]
  );

  const catsQ = useOpsCategoriesQuery(filters, true);
  const updateMut = useUpdateOpsCategoryMutation();
  const deleteMut = useDeleteOpsCategoryMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);

  const rawItems = catsQ.data?.results ?? [];
  const items = useMemo(() => buildCategoryForest(rawItems), [rawItems]);
  const totalCount = catsQ.data?.count ?? 0;

  const toggleActive = async (cat: CategoryItem) => {
    try {
      await updateMut.mutateAsync({ id: cat.id, data: { aktif: !cat.aktif } });
      actionToast.success(cat.aktif ? "Kategori pasifleştirildi" : "Kategori aktifleştirildi");
    } catch (err) {
      actionToast.error("Kategori güncellenemedi", err);
    }
  };

  const toggleFeatured = async (cat: CategoryItem) => {
    try {
      await updateMut.mutateAsync({
        id: cat.id,
        data: { one_cikan: !cat.one_cikan },
      });
      actionToast.success(
        cat.one_cikan ? "Öne çıkan işareti kaldırıldı" : "Kategori öne çıkarıldı"
      );
    } catch (err) {
      actionToast.error("Güncellenemedi", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      actionToast.success("Kategori silindi");
      setDeleteTarget(null);
    } catch (err) {
      actionToast.error("Kategori silinemedi", err);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <ListPage
        title="Kategoriler"
        description="Ağaç: ana kategori → alt kategori. Fiyat grubu ana kategoride zorunlu; altta boşsa üstten miras alınır."
        createLabel="Ana / Alt Kategori"
        onCreate={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        loading={catsQ.isLoading || catsQ.isFetching}
        error={
          catsQ.isError
            ? catsQ.error instanceof Error
              ? catsQ.error.message
              : "Kategoriler alınamadı."
            : null
        }
        onRetry={() => void catsQ.refetch()}
        searchValue={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder="Kategori adı veya kodu ara…"
        filters={
          <>
            <select
              value={aktif}
              onChange={(e) => {
                setAktif(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              <option value="">Tüm Durumlar</option>
              <option value="true">Yalnız Aktif</option>
              <option value="false">Yalnız Pasif</option>
            </select>
            <select
              value={oneCikan}
              onChange={(e) => {
                setOneCikan(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              <option value="">Vitrin: Tümü</option>
              <option value="true">Yalnız Öne Çıkanlar</option>
            </select>
          </>
        }
        isEmpty={items.length === 0}
        emptyTitle="Kategori bulunamadı"
        emptyDescription={
          q ? "Arama ölçütünüze uygun kategori yok." : "Henüz kategori eklenmemiş."
        }
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kategori (ağaç)</TableHead>
              <TableHead>Kod</TableHead>
              <TableHead>Fiyat Grubu</TableHead>
              <TableHead className="text-right">Sıra</TableHead>
              <TableHead>Vitrin</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((cat) => {
              const depth = (cat as CategoryItem & { _depth?: number })._depth ?? 0;
              const miras =
                !cat.fiyat_grubu_id && Boolean(cat.etkin_fiyat_grubu_id);
              return (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">
                  <div
                    className="flex items-center gap-1.5"
                    style={{ paddingLeft: `${depth * 16}px` }}
                  >
                    <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{cat.ad}</span>
                    {depth === 0 ? (
                      <Badge variant="outline" className="text-[9px]">
                        Ana
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">
                        Alt
                      </Badge>
                    )}
                  </div>
                  {cat.dahili ? (
                    <span className="text-[11px] text-muted-foreground pl-5">
                      Dahili kategori
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold">
                  {cat.kod}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{cat.etkin_fiyat_grubu_ad || cat.fiyat_grubu_ad || "—"}</div>
                  {miras ? (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                      Üstten miras
                    </span>
                  ) : cat.fiyat_grubu_id ? (
                    <span className="text-[10px]">Kendi grubu</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {cat.sira}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => void toggleFeatured(cat)}
                    className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      cat.one_cikan
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    title="Öne çıkan durumunu değiştir"
                  >
                    <Star
                      className={`h-3 w-3 ${cat.one_cikan ? "fill-current" : ""}`}
                    />
                    {cat.one_cikan ? "Öne Çıkan" : "Standart"}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant={cat.aktif ? "success" : "secondary"} className="text-[10px]">
                    {cat.aktif ? "Aktif" : "Pasif"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    itemLabel={cat.ad}
                    onEdit={() => {
                      setEditing(cat);
                      setModalOpen(true);
                    }}
                    isActive={cat.aktif}
                    onToggleActive={() => void toggleActive(cat)}
                    onDelete={() => setDeleteTarget(cat)}
                  />
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
      </ListPage>

      <CategoryEntityModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Kategoriyi Sil"
        description={
          deleteTarget
            ? `"${deleteTarget.ad}" kategorisini silmek istediğinize emin misiniz? Bağlı ürünler varsa önce ürünleri taşıyın veya kategoriyi pasifleştirin.`
            : ""
        }
        confirmLabel="Evet, Sil"
        variant="destructive"
        loading={deleteMut.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
