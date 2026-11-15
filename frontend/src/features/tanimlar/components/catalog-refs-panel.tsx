"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useCatalogRefItemsQuery,
  useCreateCatalogRefMutation,
  useDeleteCatalogRefMutation,
  useUpdateCatalogRefMutation,
} from "@/features/urunler/hooks";
import type { CatalogRefItem, CatalogRefKaynakMeta } from "@/features/urunler/types";
import { useActionToast } from "@/hooks/use-action-toast";
import { ConfirmDialog, EntityModal, ListPage, RowActions } from "@/components/crud";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const CATALOG_REF_KAYNAKLAR: CatalogRefKaynakMeta[] = [
  { kaynak: "koleksiyon", ad: "Koleksiyonlar" },
  { kaynak: "renk", ad: "Renkler" },
  { kaynak: "olcu", ad: "Ölçü / Beden Değerleri" },
  { kaynak: "yas-grubu", ad: "Yaş Grupları" },
  { kaynak: "teknik", ad: "Teknikler" },
  { kaynak: "stil", ad: "Stiller" },
  { kaynak: "ozel-gun", ad: "Özel Günler" },
  { kaynak: "zincir-tipi", ad: "Zincir Tipleri" },
  { kaynak: "kopca-tipi", ad: "Kopça Tipleri" },
  { kaynak: "tas-tipi", ad: "Taş Tipleri" },
  { kaynak: "tas-kesimi", ad: "Taş Kesimleri" },
  { kaynak: "mihlama-tipi", ad: "Mıhlama Tipleri" },
  { kaynak: "tas-mensei", ad: "Taş Menşeleri" },
  { kaynak: "sertifika-kurumu", ad: "Sertifika Kurumları" },
  { kaynak: "berraklik", ad: "Berraklık" },
  { kaynak: "renk-derecesi", ad: "Renk Dereceleri" },
  { kaynak: "kesim-kalitesi", ad: "Kesim Kaliteleri" },
];

/** Ürün özellikleri (taş/sertifika hariç). */
export const URUN_OZELLIK_REFS = CATALOG_REF_KAYNAKLAR.filter((k) =>
  [
    "koleksiyon",
    "renk",
    "olcu",
    "yas-grubu",
    "teknik",
    "stil",
    "ozel-gun",
    "zincir-tipi",
    "kopca-tipi",
  ].includes(k.kaynak)
);

/** Taş & sertifika referansları. */
export const TAS_SERTIFIKA_REFS = CATALOG_REF_KAYNAKLAR.filter((k) =>
  [
    "tas-tipi",
    "tas-kesimi",
    "mihlama-tipi",
    "tas-mensei",
    "sertifika-kurumu",
    "berraklik",
    "renk-derecesi",
    "kesim-kalitesi",
  ].includes(k.kaynak)
);

const DEFAULT_OLCU_TIPLERI = [
  { kod: "yuzuk_no", ad: "Yüzük Numarası" },
  { kod: "bilezik_mm", ad: "Bilezik Çapı (mm)" },
  { kod: "zincir_cm", ad: "Zincir / Kolye Uzunluğu (cm)" },
  { kod: "bileklik_cm", ad: "Bileklik Uzunluğu (cm)" },
  { kod: "kupe_mm", ad: "Küpe Boyutu (mm)" },
];

interface RefFormState {
  kod: string;
  ad: string;
  tip: string;
  sayisal_deger: string;
  deger: string;
  sira: string;
  aktif: boolean;
  degerli: boolean;
}

function emptyRefForm(defaultTip: string): RefFormState {
  return {
    kod: "",
    ad: "",
    tip: defaultTip,
    sayisal_deger: "",
    deger: "",
    sira: "0",
    aktif: true,
    degerli: false,
  };
}

function itemToForm(item: CatalogRefItem, defaultTip: string): RefFormState {
  return {
    kod: item.kod || "",
    ad: item.ad || "",
    tip: item.tip || defaultTip,
    sayisal_deger: item.sayisal_deger || "",
    deger: item.deger || "",
    sira: String(item.sira ?? 0),
    aktif: Boolean(item.aktif),
    degerli: Boolean(item.degerli),
  };
}

type Props = {
  /** Zorunlu kaynak — Tanımlar sol menüsünden gelir. */
  kaynak: string;
  /** Başlık override (yoksa meta.ad). */
  title?: string;
  description?: string;
};

/** Tek kaynaklı ürün referans CRUD (sol menü Tanımlar’da). */
export function CatalogRefsPanel({
  kaynak,
  title,
  description = "Ürün formunda seçilen katalog özelliklerini ekleyin, düzenleyin veya pasifleştirin.",
}: Props) {
  const actionToast = useActionToast();
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [kaynak]);

  const query = useCatalogRefItemsQuery(kaynak, search.trim() || undefined);
  const createMut = useCreateCatalogRefMutation();
  const updateMut = useUpdateCatalogRefMutation();
  const deleteMut = useDeleteCatalogRefMutation();

  const kaynaklar = useMemo(
    () =>
      query.data?.kaynaklar?.length ? query.data.kaynaklar : CATALOG_REF_KAYNAKLAR,
    [query.data?.kaynaklar]
  );
  const olcuTipleri = useMemo(
    () =>
      query.data?.olcu_tipleri?.length
        ? query.data.olcu_tipleri
        : DEFAULT_OLCU_TIPLERI,
    [query.data?.olcu_tipleri]
  );
  const currentMeta = useMemo(
    () =>
      kaynaklar.find((k) => k.kaynak === kaynak) ?? {
        kaynak,
        ad: title || "Referans",
      },
    [kaynaklar, kaynak, title]
  );

  const items = query.data?.items ?? [];
  const isOlcu = kaynak === "olcu";
  const isTasTipi = kaynak === "tas-tipi";
  const displayTitle = title || currentMeta.ad;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRefItem | null>(null);
  const [form, setForm] = useState<RefFormState>(() =>
    emptyRefForm(DEFAULT_OLCU_TIPLERI[0]?.kod ?? "yuzuk_no")
  );
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogRefItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyRefForm(olcuTipleri[0]?.kod || "yuzuk_no"));
    setDirty(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: CatalogRefItem) => {
    setEditing(item);
    setForm(itemToForm(item, olcuTipleri[0]?.kod || "yuzuk_no"));
    setDirty(false);
    setFormError(null);
    setModalOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: Record<string, unknown> = {
      sira: Number(form.sira || "0") || 0,
      aktif: form.aktif,
    };

    if (isOlcu) {
      if (!form.sayisal_deger.trim()) {
        setFormError("Sayısal değer zorunludur.");
        return;
      }
      payload.tip = form.tip || "yuzuk_no";
      payload.sayisal_deger = form.sayisal_deger.trim();
      payload.deger = form.deger.trim() || form.sayisal_deger.trim();
    } else {
      if (!form.kod.trim() || !form.ad.trim()) {
        setFormError("Kod ve ad alanları zorunludur.");
        return;
      }
      payload.kod = form.kod.trim().toUpperCase();
      payload.ad = form.ad.trim();
      if (isTasTipi) {
        payload.degerli = form.degerli;
      }
    }

    try {
      if (editing) {
        await updateMut.mutateAsync({
          kaynak,
          id: editing.id,
          body: payload,
        });
        actionToast.success(`${displayTitle} kaydı güncellendi`);
      } else {
        await createMut.mutateAsync({
          kaynak,
          ...payload,
        });
        actionToast.success(`${displayTitle} kaydı oluşturuldu`);
      }
      setModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kayıt kaydedilemedi.";
      setFormError(msg);
      actionToast.error("Referans kaydedilemedi", err);
    }
  };

  const handleToggleActive = async (item: CatalogRefItem) => {
    try {
      await updateMut.mutateAsync({
        kaynak,
        id: item.id,
        body: { aktif: !item.aktif },
      });
      actionToast.success(
        item.aktif ? "Kayıt pasifleştirildi" : "Kayıt aktifleştirildi"
      );
    } catch (err) {
      actionToast.error("Durum değiştirilemedi", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({
        kaynak,
        id: deleteTarget.id,
      });
      actionToast.success("Kayıt silindi");
      setDeleteTarget(null);
    } catch (err) {
      actionToast.error("Kayıt silinemedi", err);
      setDeleteTarget(null);
    }
  };

  const mutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-w-0">
      <ListPage
        title={displayTitle}
        description={description}
        createLabel={`Yeni ${displayTitle.replace(/ları$|leri$|lar$|ler$/i, "")}`}
        onCreate={openCreate}
        loading={query.isLoading || query.isFetching}
        error={
          query.error
            ? query.error instanceof Error
              ? query.error.message
              : "Referans listesi alınamadı."
            : null
        }
        onRetry={() => void query.refetch()}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Kod veya ad ara…"
        isEmpty={items.length === 0}
        emptyTitle="Henüz referans kaydı yok"
        emptyDescription="Sağ üstteki ekle butonu ile yeni bir tanım oluşturabilirsiniz."
      >
        <Table>
          <TableHeader>
            <TableRow>
              {isOlcu ? (
                <>
                  <TableHead>Ölçü Tipi</TableHead>
                  <TableHead>Sayısal Değer</TableHead>
                  <TableHead>Görünüm</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Kod</TableHead>
                  <TableHead>Ad</TableHead>
                  {isTasTipi ? <TableHead>Sınıf</TableHead> : null}
                </>
              )}
              <TableHead className="text-right">Sıra</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                {isOlcu ? (
                  <>
                    <TableCell className="text-xs">
                      {item.tip_ad || item.tip || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.sayisal_deger || "—"}
                    </TableCell>
                    <TableCell className="font-medium text-xs">
                      {item.deger || "—"}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-mono text-xs font-semibold">
                      {item.kod || "—"}
                    </TableCell>
                    <TableCell className="font-medium text-xs">
                      {item.ad || "—"}
                    </TableCell>
                    {isTasTipi ? (
                      <TableCell>
                        <Badge
                          variant={item.degerli ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          {item.degerli ? "Değerli Taş" : "Standart"}
                        </Badge>
                      </TableCell>
                    ) : null}
                  </>
                )}
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {item.sira}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={item.aktif ? "success" : "secondary"}
                    className="text-[10px]"
                  >
                    {item.aktif ? "Aktif" : "Pasif"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    itemLabel={item.ad || item.deger || item.kod}
                    onEdit={() => openEdit(item)}
                    isActive={item.aktif}
                    onToggleActive={() => void handleToggleActive(item)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListPage>

      <EntityModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? `${displayTitle} Düzenle` : `Yeni ${displayTitle}`}
        description="Ürün tanımlama ve filtreleme ekranlarında kullanılacak referans değerini girin."
        isDirty={dirty}
        isSubmitting={mutating}
        error={formError}
        onSubmit={onSubmit}
      >
        {isOlcu ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Ölçü Tipi *</Label>
              <select
                value={form.tip}
                onChange={(e) => {
                  setDirty(true);
                  setForm((f) => ({ ...f, tip: e.target.value }));
                }}
                disabled={mutating}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                {olcuTipleri.map((t) => (
                  <option key={t.kod} value={t.kod}>
                    {t.ad}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Sayısal Değer *</Label>
                <Input
                  required
                  value={form.sayisal_deger}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((f) => ({ ...f, sayisal_deger: e.target.value }));
                  }}
                  placeholder="Örn: 14 veya 45.0"
                  className="font-mono text-xs"
                  disabled={mutating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Görünüm Metni</Label>
                <Input
                  value={form.deger}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((f) => ({ ...f, deger: e.target.value }));
                  }}
                  placeholder="Örn: 14 No veya 45 cm"
                  disabled={mutating}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Kod *</Label>
              <Input
                required
                value={form.kod}
                onChange={(e) => {
                  setDirty(true);
                  setForm((f) => ({ ...f, kod: e.target.value.toUpperCase() }));
                }}
                placeholder="Örn: KLASIK"
                className="font-mono text-xs"
                disabled={mutating}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ad *</Label>
              <Input
                required
                value={form.ad}
                onChange={(e) => {
                  setDirty(true);
                  setForm((f) => ({ ...f, ad: e.target.value }));
                }}
                placeholder="Örn: Klasik Seri"
                disabled={mutating}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <Label>Görüntüleme Sırası</Label>
            <Input
              type="number"
              value={form.sira}
              onChange={(e) => {
                setDirty(true);
                setForm((f) => ({ ...f, sira: e.target.value }));
              }}
              className="font-mono text-xs"
              disabled={mutating}
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={form.aktif}
              onChange={(e) => {
                setDirty(true);
                setForm((f) => ({ ...f, aktif: e.target.checked }));
              }}
              disabled={mutating}
            />
            Aktif (ürün seçimlerinde görünsün)
          </label>
        </div>

        {isTasTipi ? (
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.degerli}
              onChange={(e) => {
                setDirty(true);
                setForm((f) => ({ ...f, degerli: e.target.checked }));
              }}
              disabled={mutating}
            />
            Değerli Taş (pırlanta / yakut / zümrüt vb.)
          </label>
        ) : null}
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Referans Kaydını Sil"
        description={
          deleteTarget
            ? `"${deleteTarget.ad || deleteTarget.deger || deleteTarget.kod}" kaydını silmek istediğinize emin misiniz?`
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
