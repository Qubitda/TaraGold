"use client";

import React, { useMemo, useState } from "react";
import {
  useCreateMarjKuraliMutation,
  useDeleteMarjKuraliMutation,
  useMarjKurallariQuery,
  useOpsCanliPiyasaQuery,
  useUpdateMarjKuraliMutation,
} from "../hooks";
import type { MarjKapsam, MarjKuraliRow, MarjTuru } from "../types";
import { formatDateTime } from "@/lib/format";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { useActionToast } from "@/hooks/use-action-toast";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, LineChart, Lock, Percent, RefreshCw } from "lucide-react";

type SectionTab = "kurallar" | "canli";

interface MarjFormState {
  ad: string;
  kapsam: MarjKapsam;
  satis_kanali_id: string;
  kategori_id: string;
  fiyat_grubu_id: string;
  marj_turu: MarjTuru;
  deger: string;
  aktif: boolean;
}

function emptyMarjForm(): MarjFormState {
  return {
    ad: "",
    kapsam: "SATIS_KANALI",
    satis_kanali_id: "",
    kategori_id: "",
    fiyat_grubu_id: "",
    marj_turu: "YUZDE",
    deger: "0",
    aktif: true,
  };
}

function ruleToForm(rule: MarjKuraliRow): MarjFormState {
  const kapsam = (
    ["TUMU", "SATIS_KANALI", "KATEGORI", "FIYAT_GRUBU"].includes(rule.kapsam)
      ? rule.kapsam
      : "TUMU"
  ) as MarjKapsam;
  return {
    ad: rule.ad || "",
    kapsam,
    satis_kanali_id: rule.satis_kanali_id ? String(rule.satis_kanali_id) : "",
    kategori_id: rule.kategori_id ? String(rule.kategori_id) : "",
    fiyat_grubu_id: rule.fiyat_grubu_id ? String(rule.fiyat_grubu_id) : "",
    marj_turu: rule.marj_turu === "GRAM_BASI_SABIT" ? "GRAM_BASI_SABIT" : "YUZDE",
    deger: rule.deger ?? "0",
    aktif: Boolean(rule.aktif),
  };
}

export function OpsMarjPolitikasiCard() {
  const actionToast = useActionToast();
  const [section, setSection] = useState<SectionTab>("kurallar");
  const [qFilter, setQFilter] = useState("");
  const [kapsamFilter, setKapsamFilter] = useState("");

  const canliQ = useOpsCanliPiyasaQuery(true);
  const rulesQ = useMarjKurallariQuery(
    {
      q: qFilter.trim() || undefined,
      kapsam: kapsamFilter || undefined,
    },
    true
  );

  const createMut = useCreateMarjKuraliMutation();
  const updateMut = useUpdateMarjKuraliMutation();
  const deleteMut = useDeleteMarjKuraliMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MarjKuraliRow | null>(null);
  const [form, setForm] = useState<MarjFormState>(emptyMarjForm);
  const [formDirty, setFormDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MarjKuraliRow | null>(null);

  const refs = rulesQ.data?.refs;
  const rules = rulesQ.data?.results ?? [];

  const kanalOptions = useMemo(
    () =>
      (refs?.satis_kanallari ?? []).map((k) => ({
        value: String(k.id),
        label: k.ad,
        subtitle: k.kod,
      })),
    [refs?.satis_kanallari]
  );

  const kategoriOptions = useMemo(
    () =>
      (refs?.kategoriler ?? []).map((k) => ({
        value: String(k.id),
        label: k.ad,
        subtitle: k.kod,
      })),
    [refs?.kategoriler]
  );

  const fiyatGrubuOptions = useMemo(
    () =>
      (refs?.fiyat_gruplari ?? []).map((f) => ({
        value: String(f.id),
        label: f.ad,
        subtitle: f.kod,
      })),
    [refs?.fiyat_gruplari]
  );

  const openCreateModal = () => {
    setEditingRule(null);
    setForm(emptyMarjForm());
    setFormDirty(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (rule: MarjKuraliRow) => {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setFormDirty(false);
    setFormError(null);
    setModalOpen(true);
  };

  const setField = <K extends keyof MarjFormState>(key: K, val: MarjFormState[K]) => {
    setFormDirty(true);
    setForm((s) => ({ ...s, [key]: val }));
  };

  const onSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (form.kapsam === "SATIS_KANALI" && !form.satis_kanali_id) {
      setFormError("Lütfen bir satış kanalı seçin.");
      return;
    }
    if (form.kapsam === "KATEGORI" && !form.kategori_id) {
      setFormError("Lütfen bir kategori seçin.");
      return;
    }
    if (form.kapsam === "FIYAT_GRUBU" && !form.fiyat_grubu_id) {
      setFormError("Lütfen bir fiyat grubu seçin.");
      return;
    }
    if (!form.deger.trim()) {
      setFormError("Marj değeri zorunludur.");
      return;
    }

    const payload = {
      ad: form.ad.trim(),
      kapsam: form.kapsam,
      satis_kanali_id:
        form.kapsam === "SATIS_KANALI" && form.satis_kanali_id
          ? Number(form.satis_kanali_id)
          : null,
      kategori_id:
        form.kapsam === "KATEGORI" && form.kategori_id ? Number(form.kategori_id) : null,
      fiyat_grubu_id:
        form.kapsam === "FIYAT_GRUBU" && form.fiyat_grubu_id
          ? Number(form.fiyat_grubu_id)
          : null,
      marj_turu: form.marj_turu,
      deger: form.deger.trim(),
      aktif: form.aktif,
    };

    try {
      if (editingRule) {
        await updateMut.mutateAsync({ id: editingRule.id, data: payload });
        actionToast.success("Marj kuralı güncellendi");
      } else {
        await createMut.mutateAsync(payload);
        actionToast.success("Yeni marj kuralı oluşturuldu");
      }
      setModalOpen(false);
      setEditingRule(null);
      setFormDirty(false);
    } catch (err) {
      const msg = mapCommerceError(err, "Marj kuralı kaydedilemedi.");
      setFormError(msg);
      actionToast.error("Marj kuralı kaydedilemedi", msg);
    }
  };

  const toggleRuleAktif = async (rule: MarjKuraliRow) => {
    try {
      await updateMut.mutateAsync({
        id: rule.id,
        data: { aktif: !rule.aktif },
      });
      actionToast.success(rule.aktif ? "Kural pasifleştirildi" : "Kural aktifleştirildi");
    } catch (err) {
      actionToast.error("Durum güncellenemedi", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      actionToast.success("Marj kuralı silindi");
      setDeleteTarget(null);
    } catch (err) {
      actionToast.error("Kural silinemedi", err);
      setDeleteTarget(null);
    }
  };

  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-4">
      {/* Başlık & Bölüm Geçişi */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Piyasa ve Marj Politikası
            </h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Kuyumcu net fiyatı = Tedarikçi fiyatı + Marj. En dar kapsam kazanır (Kategori → Fiyat Grubu → Satış Kanalı → Global Varsayılan). Alıcı tedarikçiyi, tedarikçi alıcıyı görmez.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setSection("canli")}
            className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              section === "canli"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart className="h-3.5 w-3.5" />
            Canlı Piyasa
          </button>
          <button
            type="button"
            onClick={() => setSection("kurallar")}
            className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors ${
              section === "kurallar"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Percent className="h-3.5 w-3.5" />
            Marj Kuralları ({rules.length})
          </button>
        </div>
      </div>

      {/* BÖLÜM A: CANLI PİYASA (SALT OKUNUR) */}
      {section === "canli" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              <span>
                Salt okunur canlı has/gram ve döviz kurları. Kur düzenlemeleri yalnızca Tanımlar sekmesinden yapılır.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={canliQ.isFetching}
              onClick={() => void canliQ.refetch()}
            >
              <RefreshCw className={`h-3 w-3 ${canliQ.isFetching ? "animate-spin" : ""}`} />
              Yenile
            </Button>
          </div>

          {canliQ.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Canlı piyasa verileri yükleniyor…
            </div>
          ) : canliQ.isError ? (
            <div className="flex items-center justify-between rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {mapCommerceError(canliQ.error, "Canlı piyasa verileri alınamadı.")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void canliQ.refetch()}
              >
                Yeniden Dene
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Has / Gram Metal Kurları */}
              <div className="rounded-[8px] border border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Has / Gram Metal Kurları</span>
                  <Badge variant="outline" className="text-[10px]">
                    Salt Okunur
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metal</TableHead>
                      <TableHead className="text-right">Alış</TableHead>
                      <TableHead className="text-right">Satış</TableHead>
                      <TableHead>Güncelleme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(canliQ.data?.has_gram ?? []).length === 0 &&
                    (canliQ.data?.pano_satirlari ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                          Henüz metal kuru kaydı yok.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {(canliQ.data?.has_gram ?? []).map((m) => (
                          <TableRow key={`metal-${m.metal_id}`}>
                            <TableCell>
                              <div className="text-xs font-medium">{m.ad}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {m.kod} · {m.olcek}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {m.alis ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                              {m.satis ?? "—"}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {m.guncelleme ? formatDateTime(m.guncelleme) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(canliQ.data?.pano_satirlari ?? []).map((p) => (
                          <TableRow key={`pano-${p.kod}`}>
                            <TableCell>
                              <div className="text-xs font-medium">{p.ad}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {p.kod} · {p.olcek} ({p.para_birimi})
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {p.alis ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                              {p.satis ?? "—"}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {p.guncelleme ? formatDateTime(p.guncelleme) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Döviz Kurları */}
              <div className="rounded-[8px] border border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Döviz Kurları (TRY)</span>
                  <Badge variant="outline" className="text-[10px]">
                    Salt Okunur
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Para Birimi</TableHead>
                      <TableHead className="text-right">Alış</TableHead>
                      <TableHead className="text-right">Satış</TableHead>
                      <TableHead>Güncelleme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(canliQ.data?.doviz ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                          Henüz döviz kuru kaydı yok.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (canliQ.data?.doviz ?? []).map((d) => (
                        <TableRow key={d.para_birimi}>
                          <TableCell>
                            <div className="font-mono text-xs font-semibold">{d.para_birimi}</div>
                            {d.saglayici ? (
                              <div className="text-[10px] text-muted-foreground">{d.saglayici}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs">
                            {d.alis ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                            {d.satis ?? "—"}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {d.guncelleme ? formatDateTime(d.guncelleme) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* BÖLÜM B: MARJ KURALLARI (CRUD) */
        <ListPage
          title="Marj Kuralları"
          description="Global varsayılan, satış kanalı, fiyat grubu ve kategori bazlı marj kurallarını yönetin."
          createLabel="Yeni Marj Kuralı"
          onCreate={openCreateModal}
          searchValue={qFilter}
          onSearchChange={setQFilter}
          searchPlaceholder="Kural adı, kanal, kategori veya fiyat grubu ara…"
          filters={
            <select
              value={kapsamFilter}
              onChange={(e) => setKapsamFilter(e.target.value)}
              aria-label="Kapsam filtresi"
              className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
            >
              <option value="">Tüm Kapsamlar</option>
              <option value="TUMU">Tümü (Global Varsayılan)</option>
              <option value="SATIS_KANALI">Satış Kanalı</option>
              <option value="FIYAT_GRUBU">Fiyat Grubu</option>
              <option value="KATEGORI">Kategori</option>
            </select>
          }
          loading={rulesQ.isLoading}
          error={
            rulesQ.isError
              ? mapCommerceError(rulesQ.error, "Marj kuralları alınamadı.")
              : null
          }
          onRetry={() => void rulesQ.refetch()}
          isEmpty={!rulesQ.isLoading && rules.length === 0}
          emptyTitle="Marj kuralı bulunamadı"
          emptyDescription="Yeni bir kanal, fiyat grubu veya kategori marj kuralı ekleyebilirsiniz."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kapsam</TableHead>
                <TableHead>Hedef / Kural Adı</TableHead>
                <TableHead>Marj Türü</TableHead>
                <TableHead className="text-right">Değer</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge
                      variant={r.kapsam === "TUMU" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {r.kapsam_etiket}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-foreground">
                      {r.hedef_ad}
                    </div>
                    {r.ad && r.ad !== r.hedef_ad ? (
                      <div className="text-[11px] text-muted-foreground">{r.ad}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.marj_turu === "GRAM_BASI_SABIT"
                      ? "Gram Başı Sabit (TL)"
                      : "Yüzde (%)"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs font-semibold">
                    {r.marj_turu === "YUZDE" ? `% ${r.deger}` : `${r.deger} TL/gr`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.aktif ? "success" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.aktif ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={r.ad || r.hedef_ad}
                      onEdit={() => openEditModal(r)}
                      isActive={r.aktif}
                      onToggleActive={() => void toggleRuleAktif(r)}
                      onDelete={
                        r.kapsam !== "TUMU" ? () => setDeleteTarget(r) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* KURAL OLUŞTUR / DÜZENLE MODALI */}
      <EntityModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingRule(null);
            setFormDirty(false);
            setFormError(null);
          }
        }}
        title={editingRule ? "Marj Kuralını Düzenle" : "Yeni Marj Kuralı"}
        description="Kuyumcu net fiyatı = Tedarikçi fiyatı + Marj kuralı."
        isDirty={formDirty}
        isSubmitting={isMutating}
        error={formError}
        submitLabel={editingRule ? "Güncelle" : "Kuralı Kaydet"}
        onSubmit={onSubmitRule}
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marj-kapsam">Kapsam</Label>
            <select
              id="marj-kapsam"
              value={form.kapsam}
              disabled={isMutating || editingRule?.kapsam === "TUMU"}
              onChange={(e) => {
                const next = e.target.value as MarjKapsam;
                setFormDirty(true);
                setForm((s) => ({
                  ...s,
                  kapsam: next,
                  satis_kanali_id: "",
                  kategori_id: "",
                  fiyat_grubu_id: "",
                }));
              }}
              className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
            >
              <option value="KATEGORI">Kategori</option>
              <option value="FIYAT_GRUBU">Fiyat Grubu</option>
              <option value="SATIS_KANALI">Satış Kanalı</option>
              {editingRule?.kapsam === "TUMU" ? (
                <option value="TUMU">Tümü (Global Varsayılan)</option>
              ) : null}
            </select>
          </div>

          {form.kapsam === "SATIS_KANALI" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Satış Kanalı *</Label>
              <RelationSelect
                value={form.satis_kanali_id}
                onChange={(val) => setField("satis_kanali_id", String(val ?? ""))}
                options={kanalOptions}
                placeholder="Satış kanalı seçin…"
                disabled={isMutating}
              />
            </div>
          ) : null}

          {form.kapsam === "FIYAT_GRUBU" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Fiyat Grubu *</Label>
              <RelationSelect
                value={form.fiyat_grubu_id}
                onChange={(val) => setField("fiyat_grubu_id", String(val ?? ""))}
                options={fiyatGrubuOptions}
                placeholder="Fiyat grubu seçin…"
                disabled={isMutating}
              />
            </div>
          ) : null}

          {form.kapsam === "KATEGORI" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Kategori *</Label>
              <RelationSelect
                value={form.kategori_id}
                onChange={(val) => setField("kategori_id", String(val ?? ""))}
                options={kategoriOptions}
                placeholder="Kategori seçin…"
                disabled={isMutating}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marj-turu">Marj Türü *</Label>
              <select
                id="marj-turu"
                value={form.marj_turu}
                onChange={(e) =>
                  setField(
                    "marj_turu",
                    e.target.value === "GRAM_BASI_SABIT" ? "GRAM_BASI_SABIT" : "YUZDE"
                  )
                }
                disabled={isMutating}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="YUZDE">Yüzde (%)</option>
                <option value="GRAM_BASI_SABIT">Gram Başı Sabit (TL)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marj-deger">
                {form.marj_turu === "YUZDE" ? "Marj Oranı (%)" : "Gram Başı Tutar (TL)"} *
              </Label>
              <Input
                id="marj-deger"
                required
                value={form.deger}
                onChange={(e) => setField("deger", e.target.value)}
                placeholder={form.marj_turu === "YUZDE" ? "8.50" : "25.00"}
                className="font-mono text-xs tabular-nums"
                disabled={isMutating}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marj-ad">Açıklayıcı Ad (İsteğe Bağlı)</Label>
            <Input
              id="marj-ad"
              value={form.ad}
              onChange={(e) => setField("ad", e.target.value)}
              placeholder="Örn: Bilezik Özel Marjı"
              disabled={isMutating}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.aktif}
              onChange={(e) => setField("aktif", e.target.checked)}
              disabled={isMutating}
            />
            Kural Aktif
          </label>
        </div>
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Marj Kuralını Sil"
        description={
          deleteTarget
            ? `"${deleteTarget.ad || deleteTarget.hedef_ad}" marj kuralını silmek istediğinize emin misiniz?`
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
