"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateOpsUrunMutation,
  useDeleteOpsUrunMutation,
  useOpsMarjPolitikasiQuery,
  useOpsPanoDetayQuery,
  usePanoGosterTopluMutation,
  usePatchOpsUrunMutation,
  useTickerTopluMutation,
  useUpdateOpsMarjPolitikasiMutation,
} from "../hooks";
import type {
  OpsPanoDetaySatir,
  OpsPiyasaUrunCreate,
  OpsPiyasaUrunPatch,
} from "../types";
import { tanimlarService } from "@/features/tanimlar/services";
import type { OpsAyarMilyem } from "@/features/tanimlar/types";
import { useToast } from "@/components/ui/toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BaglantiTestCard } from "./live-status";

function formatOpsPara(
  value: string | null | undefined,
  paraBirimi?: string,
  ondalik = 2
): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const currency = (paraBirimi || "TRY").toUpperCase();
  const digits = Math.min(Math.max(ondalik || 2, 0), 6);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency:
        currency === "USD" ||
        currency === "EUR" ||
        currency === "GBP" ||
        currency === "CHF"
          ? currency
          : "TRY",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return formatMoney(value, currency === "USD" ? "USD" : "TRY");
  }
}

/** TR/EN sayı → API decimal string (50 | 50,5 | 1.234,56). */
function normalizeDecimalInput(raw: string): string {
  let s = (raw || "")
    .trim()
    .replace(/[₺%\s\u00a0]/g, "")
    .replace(/TRY|TL|USD|EUR|GBP|CHF/gi, "");
  if (!s) return "";
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Geçersiz sayı: ${raw}`);
  }
  return s;
}

function patchErrorMessage(err: unknown): string {
  if (err instanceof Error && !(err.name === "ApiError")) {
    return err.message;
  }
  return mapCommerceError(err, "Kalem güncellenemedi");
}

type FiyatModu = "CANLI" | "ELLE";

const GRUP_OPTIONS: { value: string; label: string }[] = [
  { value: "HAS", label: "Has / referans" },
  { value: "AYAR_GRAM", label: "Ayar / gram" },
  { value: "ISCILIK", label: "İmalat / işçilik" },
  { value: "GUMUS", label: "Gümüş" },
  { value: "SARRAFIYE", label: "Sarrafiye" },
  { value: "DIGER", label: "Diğer" },
];

const GRUP_LABEL: Record<string, string> = Object.fromEntries(
  GRUP_OPTIONS.map((g) => [g.value, g.label])
);

const BOLUM_OPTIONS: { value: string; label: string }[] = [
  { value: "ALTIN", label: "Altın" },
  { value: "ESKI_ALTIN", label: "Eski altın" },
  { value: "DOVIZ", label: "Döviz" },
];

const fieldCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs";
const numFieldCls =
  "h-8 w-[5rem] rounded-md border border-border bg-background px-1.5 text-right text-xs tabular-nums";
const unitFieldCls =
  "h-8 w-12 shrink-0 rounded-md border border-border bg-background px-1 text-center text-xs font-medium";

function PanoBaslikAyar() {
  const q = useOpsMarjPolitikasiQuery(true);
  const mut = useUpdateOpsMarjPolitikasiMutation();
  const toast = useToast();
  const [baslik, setBaslik] = useState("");

  useEffect(() => {
    if (q.data?.pano_baslik != null) setBaslik(q.data.pano_baslik);
  }, [q.data?.pano_baslik]);

  const save = async () => {
    try {
      await mut.mutateAsync({ pano_baslik: baslik.trim() });
      toast.success(
        "Başlık kaydedildi",
        baslik.trim() || "Firma adı kullanılacak"
      );
    } catch (err) {
      toast.error("Kayıt hatası", mapCommerceError(err, "Başlık kaydedilemedi"));
    }
  };

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Ekran başlığı
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Platform panosunda görünür. Boşsa firma adı kullanılır.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="pano-baslik" className="text-xs">
            Başlık
          </Label>
          <Input
            id="pano-baslik"
            className="h-8 text-xs"
            value={baslik}
            maxLength={80}
            placeholder="Aydemir Platform"
            onChange={(e) => setBaslik(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={mut.isPending}
          onClick={() => void save()}
        >
          {mut.isPending ? "…" : "Kaydet"}
        </Button>
      </div>
    </section>
  );
}

function usePiyasaRefs() {
  return useQuery({
    queryKey: ["piyasa", "ayar-refs"],
    queryFn: async () => {
      const page = await tanimlarService.getOpsDefinitions("ayar-milyem", true);
      return {
        metaller: page.refs?.metaller ?? [],
        ayarlar: (page.results ?? []) as OpsAyarMilyem[],
      };
    },
    staleTime: 60_000,
  });
}

/** Platform/ops: kategori + kalem listesi — portal tipografisi. */
export function OpsPiyasaAyarPanel() {
  const q = useOpsPanoDetayQuery(true);
  const refsQ = usePiyasaRefs();
  const patch = usePatchOpsUrunMutation();
  const createMut = useCreateOpsUrunMutation();
  const deleteMut = useDeleteOpsUrunMutation();
  const tickerToplu = useTickerTopluMutation();
  const panoToplu = usePanoGosterTopluMutation();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addForGrup, setAddForGrup] = useState<string | null>(null);

  const metaller = refsQ.data?.metaller ?? [];
  const ayarlar = refsQ.data?.ayarlar ?? [];

  const saveRow = async (
    row: OpsPanoDetaySatir,
    data: OpsPiyasaUrunPatch,
    opts?: { silent?: boolean }
  ) => {
    if (!row.id) {
      toast.error("Kayıt yok", "Bu satır güncellenemez.");
      return;
    }
    setBusyId(row.id);
    try {
      await patch.mutateAsync({ id: row.id, data });
      if (!opts?.silent) {
        toast.success("Kaydedildi", `${data.ad || row.ad || row.kod}`);
      }
    } catch (err) {
      toast.error("Kayıt hatası", patchErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const deleteRow = async (row: OpsPanoDetaySatir) => {
    if (!row.id) return;
    if (!window.confirm(`“${row.ad || row.kod}” silinsin mi?`)) return;
    setBusyId(row.id);
    try {
      await deleteMut.mutateAsync(row.id);
      toast.success("Silindi", row.ad || row.kod);
    } catch (err) {
      toast.error("Silinemedi", patchErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const createRow = async (data: OpsPiyasaUrunCreate) => {
    try {
      await createMut.mutateAsync(data);
      toast.success("Eklendi", data.ad);
      setAddForGrup(null);
    } catch (err) {
      toast.error("Eklenemedi", patchErrorMessage(err));
    }
  };

  const rows = q.data?.satirlar ?? [];
  const bulkBusy = tickerToplu.isPending || panoToplu.isPending;

  const groups = useMemo(() => {
    const order = GRUP_OPTIONS.map((g) => g.value);
    const map = new Map<string, OpsPanoDetaySatir[]>();
    for (const r of rows) {
      const g = (r.grup || "DIGER").toUpperCase();
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    const keys = [
      ...order.filter((k) => map.has(k)),
      ...[...map.keys()].filter((k) => !order.includes(k)),
    ];
    // Boş kategoriler de Ekle için görünsün
    for (const o of order) {
      if (!keys.includes(o)) keys.push(o);
    }
    return keys.map((k) => ({
      key: k,
      label: GRUP_LABEL[k] || k,
      rows: map.get(k) || [],
    }));
  }, [rows]);

  return (
    <div className="flex w-full flex-col gap-3" data-testid="piyasa-ayar-panel">
      <BaglantiTestCard />
      <PanoBaslikAyar />

      <section className="w-full rounded-md border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Kategoriler & kalemler
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Formül: saf × milyem × gram + marj (% veya TL). Kategoriler sabit;
              kalem ekle/sil.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkBusy || rows.length === 0}
              onClick={async () => {
                try {
                  const res = await panoToplu.mutateAsync(true);
                  toast.success("Hepsi ekranda", `${res.adet} kalem`);
                } catch (err) {
                  toast.error(
                    "Hata",
                    mapCommerceError(err, "Toplu ekran güncellenemedi")
                  );
                }
              }}
            >
              Hepsi ekranda
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkBusy || rows.length === 0}
              onClick={async () => {
                try {
                  const res = await tickerToplu.mutateAsync(true);
                  toast.success("Hepsi üst şeritte", `${res.adet} kalem`);
                } catch (err) {
                  toast.error(
                    "Hata",
                    mapCommerceError(err, "Toplu şerit güncellenemedi")
                  );
                }
              }}
            >
              Hepsi üst şeritte
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => void q.refetch()}
            >
              Yenile
            </Button>
          </div>
        </header>

        {q.isError ? (
          <p className="px-3 py-2 text-xs text-destructive">
            Ayarlar yüklenemedi (yetki / bağlantı).
          </p>
        ) : null}

        <div className="flex flex-col gap-3 p-3">
          {groups.map((g) => (
            <div
              key={g.key}
              className="overflow-hidden rounded-md border border-border"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-2.5 py-1.5">
                <h3 className="text-xs font-medium text-foreground">
                  {g.label}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {g.rows.length} kalem
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() =>
                      setAddForGrup((cur) => (cur === g.key ? null : g.key))
                    }
                  >
                    {addForGrup === g.key ? "Kapat" : "Ekle"}
                  </Button>
                </div>
              </div>
              {addForGrup === g.key ? (
                <KalemEkleForm
                  defaultGrup={g.key}
                  metaller={metaller}
                  ayarlar={ayarlar}
                  busy={createMut.isPending}
                  onCancel={() => setAddForGrup(null)}
                  onSubmit={createRow}
                />
              ) : null}
              {g.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[64rem] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Kalem</th>
                        <th className="px-1.5 py-1.5 font-medium">Kategori</th>
                        <th className="px-1.5 py-1.5 font-medium">Bölüm</th>
                        <th className="px-1.5 py-1.5 font-medium">Ayar</th>
                        <th className="px-1.5 py-1.5 font-medium">Gram</th>
                        <th className="px-1 py-1.5 text-center font-medium">
                          Ekran
                        </th>
                        <th className="px-1 py-1.5 text-center font-medium">
                          Şerit
                        </th>
                        <th className="px-1.5 py-1.5 font-medium">Kaynak</th>
                        <th className="px-1.5 py-1.5 font-medium">
                          <div className="flex items-center gap-1.5">
                            <span className="w-12 text-center">Birim</span>
                            <span className="w-[5rem] text-center">
                              Alış marj
                            </span>
                            <span className="w-[5rem] text-center">
                              Satış marj
                            </span>
                          </div>
                        </th>
                        <th className="min-w-[10.5rem] px-1.5 py-1.5 font-medium">
                          <div className="grid grid-cols-2 gap-1 text-center text-[11px]">
                            <span>Alış</span>
                            <span>Satış</span>
                          </div>
                          <div className="text-center text-[11px] font-normal text-muted-foreground">
                            Sonuç
                          </div>
                        </th>
                        <th className="px-1.5 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <AyarRow
                          key={`${r.kod}:${r.ad}:${r.grup}:${r.fiyat_modu}:${r.alis_marj}:${r.satis_marj}:${r.sabit_alis}:${r.sabit_satis}:${r.ticker_da_goster}:${r.aliciya_goster}:${r.gram}:${r.ayar_id}`}
                          row={r}
                          busy={busyId === r.id}
                          ayarlar={ayarlar}
                          onSave={saveRow}
                          onDelete={deleteRow}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : addForGrup !== g.key ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  Bu kategoride kalem yok.
                </p>
              ) : null}
            </div>
          ))}
          {rows.length === 0 && !q.isLoading ? (
            <p className="py-5 text-center text-xs text-muted-foreground">
              Kalem yok — seed_piyasa çalıştırın veya Ekle ile ekleyin.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function KalemEkleForm({
  defaultGrup,
  metaller,
  ayarlar,
  busy,
  onCancel,
  onSubmit,
}: {
  defaultGrup: string;
  metaller: Array<{ id: number; kod: string; ad: string }>;
  ayarlar: OpsAyarMilyem[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: OpsPiyasaUrunCreate) => Promise<void>;
}) {
  const toast = useToast();
  const defaultMetal =
    metaller.find((m) => m.kod === "ALTIN")?.id ?? metaller[0]?.id ?? 0;
  const [ad, setAd] = useState("");
  const [grup, setGrup] = useState(defaultGrup);
  const [bolum, setBolum] = useState(
    defaultGrup === "DIGER" ? "ESKI_ALTIN" : "ALTIN"
  );
  const [metalId, setMetalId] = useState(String(defaultMetal || ""));
  const [ayarId, setAyarId] = useState("");
  const [gram, setGram] = useState("1");
  const [tip, setTip] = useState("TL");
  const [alisMarj, setAlisMarj] = useState("0");
  const [satisMarj, setSatisMarj] = useState("0");
  const [pano, setPano] = useState(true);
  const [ticker, setTicker] = useState(false);

  const metalAyars = ayarlar.filter(
    (a) => !metalId || String(a.metal_id) === metalId
  );

  return (
    <div className="border-b border-border bg-muted/20 px-2.5 py-2">
      <p className="mb-2 text-[11px] text-muted-foreground">
        saf × milyem × gram + marj — işçilik alanı yok.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-0.5">
          <Label className="text-[11px]">Ad</Label>
          <input
            className={`${fieldCls} min-w-[8rem]`}
            value={ad}
            disabled={busy}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Örn. 18 Ayar Hurda"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Kategori</Label>
          <select
            className={fieldCls}
            value={grup}
            disabled={busy}
            onChange={(e) => setGrup(e.target.value)}
          >
            {GRUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Bölüm</Label>
          <select
            className={fieldCls}
            value={bolum}
            disabled={busy}
            onChange={(e) => setBolum(e.target.value)}
          >
            {BOLUM_OPTIONS.filter((b) => b.value !== "DOVIZ").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Metal</Label>
          <select
            className={fieldCls}
            value={metalId}
            disabled={busy}
            onChange={(e) => {
              setMetalId(e.target.value);
              setAyarId("");
            }}
          >
            {metaller.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ad}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Ayar / milyem</Label>
          <select
            className={fieldCls}
            value={ayarId}
            disabled={busy}
            onChange={(e) => setAyarId(e.target.value)}
          >
            <option value="">Has (1.000)</option>
            {metalAyars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ayar_kodu} ({a.milyem})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Gram</Label>
          <input
            className={numFieldCls}
            value={gram}
            disabled={busy}
            onChange={(e) => setGram(e.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Birim</Label>
          <select
            className={unitFieldCls}
            value={tip}
            disabled={busy}
            onChange={(e) => setTip(e.target.value)}
          >
            <option value="YUZDE">%</option>
            <option value="TL">TL</option>
          </select>
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Alış marj</Label>
          <input
            className={numFieldCls}
            value={alisMarj}
            disabled={busy}
            onChange={(e) => setAlisMarj(e.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Satış marj</Label>
          <input
            className={numFieldCls}
            value={satisMarj}
            disabled={busy}
            onChange={(e) => setSatisMarj(e.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-1 pb-1 text-[11px]">
          <input
            type="checkbox"
            checked={pano}
            disabled={busy}
            onChange={(e) => setPano(e.target.checked)}
          />
          Ekran
        </label>
        <label className="inline-flex items-center gap-1 pb-1 text-[11px]">
          <input
            type="checkbox"
            checked={ticker}
            disabled={busy}
            onChange={(e) => setTicker(e.target.checked)}
          />
          Şerit
        </label>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={busy || !ad.trim() || !metalId}
          onClick={() => {
            try {
              const alis = normalizeDecimalInput(alisMarj || "0");
              const satis = normalizeDecimalInput(satisMarj || "0");
              if (Number(satis) < Number(alis)) {
                toast.error(
                  "Marj geçersiz",
                  "Satış marjı alıştan küçük olamaz."
                );
                return;
              }
              void onSubmit({
                ad: ad.trim(),
                grup,
                bolum,
                metal_id: Number(metalId),
                ayar_id: ayarId ? Number(ayarId) : null,
                gram: normalizeDecimalInput(gram || "1"),
                olcek: "GRAM",
                marj_tipi: tip,
                alis_marj: alis,
                satis_marj: satis,
                aliciya_goster: pano,
                ticker_da_goster: ticker,
              });
            } catch (err) {
              toast.error(
                "Geçersiz değer",
                err instanceof Error ? err.message : "Sayıları kontrol edin."
              );
            }
          }}
        >
          {busy ? "…" : "Kaydet"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={busy}
          onClick={onCancel}
        >
          İptal
        </Button>
      </div>
    </div>
  );
}

function AyarRow({
  row,
  busy,
  ayarlar,
  onSave,
  onDelete,
}: {
  row: OpsPanoDetaySatir;
  busy: boolean;
  ayarlar: OpsAyarMilyem[];
  onSave: (
    row: OpsPanoDetaySatir,
    data: OpsPiyasaUrunPatch,
    opts?: { silent?: boolean }
  ) => Promise<void>;
  onDelete: (row: OpsPanoDetaySatir) => Promise<void>;
}) {
  const initialModu: FiyatModu =
    row.fiyat_modu === "ELLE" ? "ELLE" : "CANLI";
  const [ad, setAd] = useState(row.ad || row.kod);
  const [grup, setGrup] = useState((row.grup || "DIGER").toUpperCase());
  const [bolum, setBolum] = useState((row.bolum || "ALTIN").toUpperCase());
  const [varyant, setVaryant] = useState(row.varyant_etiket || "");
  const [modu, setModu] = useState<FiyatModu>(initialModu);
  const [alisMarj, setAlisMarj] = useState(row.alis_marj ?? "0");
  const [satisMarj, setSatisMarj] = useState(row.satis_marj ?? "0");
  const [tip, setTip] = useState(row.marj_tipi || "YUZDE");
  const [sabitAlis, setSabitAlis] = useState(row.sabit_alis ?? "");
  const [sabitSatis, setSabitSatis] = useState(row.sabit_satis ?? "");
  const [ticker, setTicker] = useState(Boolean(row.ticker_da_goster));
  const [pano, setPano] = useState(row.aliciya_goster !== false);
  const [gram, setGram] = useState(row.gram ?? "1");
  const [ayarId, setAyarId] = useState(
    row.ayar_id != null ? String(row.ayar_id) : ""
  );
  const toast = useToast();

  const metalAyars = ayarlar.filter(
    (a) => row.metal_id == null || a.metal_id === row.metal_id
  );

  return (
    <tr className="border-b border-border/80 align-middle text-foreground">
      <td className="px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <input
            className={`${fieldCls} min-w-[6.5rem] max-w-[9rem] shrink-0`}
            value={ad}
            disabled={busy || !row.id}
            onChange={(e) => setAd(e.target.value)}
          />
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {row.kod}
          </span>
          {row.fiyat_modu === "ELLE" ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[11px] text-foreground">
              elle
            </span>
          ) : row.ok === false ? (
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-px text-[11px] text-destructive">
              kopuk
            </span>
          ) : (
            <span className="shrink-0 rounded bg-emerald-600/15 px-1.5 py-px text-[11px] text-emerald-700 dark:text-emerald-400">
              canlı
            </span>
          )}
        </div>
      </td>
      <td className="px-1.5 py-1.5">
        <select
          className={`${fieldCls} min-w-[6.5rem]`}
          value={grup}
          disabled={busy || !row.id}
          onChange={(e) => setGrup(e.target.value)}
        >
          {GRUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {grup === "SARRAFIYE" ? (
          <select
            className={`${fieldCls} mt-1`}
            value={varyant}
            disabled={busy || !row.id}
            onChange={(e) => setVaryant(e.target.value)}
          >
            <option value="">—</option>
            <option value="YENI">Yeni</option>
            <option value="ESKI">Eski</option>
          </select>
        ) : null}
      </td>
      <td className="px-1.5 py-1.5">
        <select
          className={`${fieldCls} min-w-[5.5rem]`}
          value={bolum}
          disabled={busy || !row.id}
          onChange={(e) => setBolum(e.target.value)}
        >
          {BOLUM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-1.5">
        <select
          className={`${fieldCls} min-w-[5.5rem]`}
          value={ayarId}
          disabled={busy || !row.id}
          title="Ayar / milyem"
          onChange={(e) => setAyarId(e.target.value)}
        >
          <option value="">Has</option>
          {metalAyars.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ayar_kodu}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-1.5">
        <input
          className={numFieldCls}
          value={gram}
          disabled={busy || !row.id}
          title="Gram"
          onChange={(e) => setGram(e.target.value)}
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <input
          type="checkbox"
          checked={pano}
          disabled={busy || !row.id}
          title="Fiyat ekranında göster"
          onChange={(e) => {
            const next = e.target.checked;
            setPano(next);
            void onSave(row, { aliciya_goster: next }, { silent: true });
          }}
        />
      </td>
      <td className="px-1 py-1.5 text-center">
        <input
          type="checkbox"
          checked={ticker}
          disabled={busy || !row.id}
          title="Üst kayan şeritte göster"
          onChange={(e) => {
            const next = e.target.checked;
            setTicker(next);
            void onSave(row, { ticker_da_goster: next }, { silent: true });
          }}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`modu-${row.kod}`}
              checked={modu === "CANLI"}
              disabled={busy}
              onChange={() => setModu("CANLI")}
            />
            Canlı
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`modu-${row.kod}`}
              checked={modu === "ELLE"}
              disabled={busy}
              onChange={() => setModu("ELLE")}
            />
            Elle
          </label>
        </div>
      </td>
      <td className="px-1.5 py-1.5">
        {modu === "CANLI" ? (
          <div className="flex items-center gap-1.5">
            <select
              className={unitFieldCls}
              value={tip}
              disabled={busy}
              title="Marj birimi"
              onChange={(e) => setTip(e.target.value)}
            >
              <option value="YUZDE">%</option>
              <option value="TL">TL</option>
            </select>
            <input
              className={numFieldCls}
              value={alisMarj}
              disabled={busy}
              title="Alış marj"
              onChange={(e) => setAlisMarj(e.target.value)}
            />
            <input
              className={numFieldCls}
              value={satisMarj}
              disabled={busy}
              title="Satış marj"
              onChange={(e) => setSatisMarj(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="flex h-8 w-12 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground">
              TL
            </span>
            <input
              className={numFieldCls}
              value={sabitAlis}
              disabled={busy}
              placeholder="0"
              title="Sabit alış"
              onChange={(e) => setSabitAlis(e.target.value)}
            />
            <input
              className={numFieldCls}
              value={sabitSatis}
              disabled={busy}
              placeholder="0"
              title="Sabit satış"
              onChange={(e) => setSabitSatis(e.target.value)}
            />
          </div>
        )}
      </td>
      <td className="px-1.5 py-1.5">
        <div className="grid grid-cols-2 gap-1 text-xs tabular-nums text-foreground">
          <span className="truncate text-right" title={row.nihai_alis ?? undefined}>
            {formatOpsPara(row.nihai_alis, row.para_birimi, row.ondalik)}
          </span>
          <span
            className="truncate text-right"
            title={row.nihai_satis ?? undefined}
          >
            {formatOpsPara(row.nihai_satis, row.para_birimi, row.ondalik)}
          </span>
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy || !row.id}
            onClick={() => {
              const base: OpsPiyasaUrunPatch = {
                ad: ad.trim() || row.kod,
                grup,
                bolum,
                varyant_etiket: grup === "SARRAFIYE" ? varyant : "",
                ticker_da_goster: ticker,
                aliciya_goster: pano,
                ayar_id: ayarId ? Number(ayarId) : null,
              };
              try {
                base.gram = normalizeDecimalInput(gram || "1");
                if (modu === "ELLE") {
                  void onSave(row, {
                    ...base,
                    fiyat_modu: "ELLE",
                    sabit_alis: normalizeDecimalInput(sabitAlis),
                    sabit_satis: normalizeDecimalInput(sabitSatis),
                  });
                  return;
                }
                const alis = normalizeDecimalInput(alisMarj || "0");
                const satis = normalizeDecimalInput(satisMarj || "0");
                if (Number(satis) < Number(alis)) {
                  toast.error(
                    "Marj geçersiz",
                    "Satış marjı alıştan küçük olamaz (ör. alış -10, satış +10)."
                  );
                  return;
                }
                void onSave(row, {
                  ...base,
                  fiyat_modu: "CANLI",
                  alis_marj: alis,
                  satis_marj: satis,
                  marj_tipi: tip,
                });
              } catch (err) {
                toast.error(
                  "Geçersiz değer",
                  err instanceof Error ? err.message : "Sayıları kontrol edin."
                );
              }
            }}
          >
            {busy ? "…" : "Kaydet"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive"
            disabled={busy || !row.id}
            onClick={() => void onDelete(row)}
          >
            Sil
          </Button>
        </div>
      </td>
    </tr>
  );
}
