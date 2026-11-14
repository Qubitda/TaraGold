"use client";

import React, { useMemo, useState } from "react";
import {
  useCatalogRefItemsQuery,
  useCreateCatalogRefMutation,
  useDeleteCatalogRefMutation,
  useUpdateCatalogRefMutation,
} from "../hooks";
import type { CatalogRefItem, CatalogRefKaynakMeta } from "../types";
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

const FALLBACK_KAYNAKLAR: CatalogRefKaynakMeta[] = [
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

function itemToForm(item: CatalogRefItem, kaynak: string, defaultTip: string): RefFormState {
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

export function CatalogRefsPanel() {
  const actionToast = useActionToast();
  const [selectedKaynak, setSelectedKaynak] = useState<string>("koleksiyon");
  const [search, setSearch] = useState("");

  const query = useCatalogRefItemsQuery(selectedKaynak, search.trim() || undefined);
  const createMut = useCreateCatalogRefMutation();
  const updateMut = useUpdateCatalogRefMutation();
  const deleteMut = useDeleteCatalogRefMutation();

  const kaynaklar = useMemo(
    () =>
      query.data?.kaynaklar?.length ? query.data.kaynaklar : FALLBACK_KAYNAKLAR,
    [query.data?.kaynaklar]
  );
  const olcuTipleri = useMemo(
    () =>
      query.data?.olcu_tipleri?.length ? query.data.olcu_tipleri : DEFAULT_OLCU_TIPLERI,
    [query.data?.olcu_tipleri]
  );
  const currentMeta = useMemo(
    () =>
      kaynaklar.find((k) => k.kaynak === selectedKaynak) ?? {
        kaynak: selectedKaynak,
        ad: "Referans",
      },
    [kaynaklar, selectedKaynak]
  );

  const items = query.data?.items ?? [];
  const isOlcu = selectedKaynak === "olcu";
  const isTasTipi = selectedKaynak === "tas-tipi";

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRefItem | null>(null);
  const [form, setForm] = useState<RefFormState>(() =>
    emptyRefForm(DEFAULT_OLCU_TIPLERI[0].kod)
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
    setForm(itemToForm(item, selectedKaynak, olcuTipleri[0]?.kod || "yuzuk_no"));
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
          kaynak: selectedKaynak,
          id: editing.id,
          body: payload,
        });
        actionToast.success(`${currentMeta.ad} kaydı güncellendi`);
      } else {
        await createMut.mutateAsync({
          kaynak: selectedKaynak,
          ...payload,
        });
        actionToast.success(`${currentMeta.ad} kaydı oluşturuldu`);
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
        kaynak: selectedKaynak,
        id: item.id,
        body: { aktif: !item.aktif },
      });
      actionToast.success(item.aktif ? "Kayıt pasifleştirildi" : "Kayıt aktifleştirildi");
    } catch (err) {
      actionToast.error("Durum değiştirilemedi", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({
        kaynak: selectedKaynak,
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
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
      <div className="rounded-[8px] border border-border bg-card p-2 space-y-1">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ürün Referans Tabloları (17)
        </div>
        {kaynaklar.map((k) => (
          <button
            key={k.kaynak}
            type="button"
            onClick={() => {
              setSelectedKaynak(k.kaynak);
              setSearch("");
            }}
            className={`w-full rounded-[6px] px-2.5 py-2 text-left text-xs font-medium transition-colors ${
              selectedKaynak === k.kaynak
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-muted/60"
            }`}
          >
            {k.ad}
          </button>
        ))}
      </div>

      <div className="min-w-0">
        <ListPage
          title={currentMeta.ad}
          description="Ürün formunda seçilen katalog özelliklerini ekleyin, düzenleyin veya pasifleştirin."
          createLabel={`Yeni ${currentMeta.ad.replace(/ları$|leri$|lar$|ler$/i, "")}`}
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
      </div>

      <EntityModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? `${currentMeta.ad} Düzenle` : `Yeni ${currentMeta.ad}`}
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
