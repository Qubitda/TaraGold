"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { fiyatlamaService } from "@/features/fiyatlama/services";
import { siparisService } from "@/features/siparis/services";
import { useMonturlerQuery, useTaslarQuery } from "../hooks";
import type { MonturCatalogVariant } from "../types";
import {
  MonturRingIcon,
  ShapeIcon,
  caratPreviewScale,
  previewCaratOptions,
  shapeLabel,
} from "./stone-shape-icons";

type MonturPick = {
  urunId: number;
  urunAd: string;
  ayar: string;
  varyantId: number;
  sku: string;
  gram: string | null;
  yuva: number;
  izinli: string[];
  karatMin: number | null;
  karatMax: number | null;
  parcaRolu: "FULL" | "HEAD" | "BAND" | string;
  basStil: string;
  govdeStil: string;
};

type BandPick = {
  urunId: number;
  urunAd: string;
  varyantId: number;
  sku: string;
  gram: string | null;
  govdeStil: string;
};

type TasPick = {
  urunId: number;
  urunAd: string;
  varyantId: number;
  sku: string;
  karat: number | null;
  kesimKod: string;
};

type ChannelOpt = { id: number; ad?: string; kod?: string };

function numOrNull(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tasUyumlu(montur: MonturPick, tas: TasPick, adet: number): boolean {
  if (!montur.izinli.length || !montur.yuva) return false;
  if (!tas.kesimKod || !montur.izinli.includes(tas.kesimKod)) return false;
  if (tas.karat == null || montur.karatMin == null || montur.karatMax == null) {
    return false;
  }
  const toplam = tas.karat * adet;
  if (toplam < montur.karatMin || toplam > montur.karatMax) return false;
  if (adet < 1 || adet > montur.yuva) return false;
  return true;
}

/**
 * ADR-0044 — İmalat: görsel montür+taş kurucu (önizleme şekil/karat) + İmal et.
 */
export function MonturTasComposePanel({
  enabled,
  satisKanaliId,
  channelList = [],
  onKanalChange,
}: {
  enabled: boolean;
  satisKanaliId?: number | null;
  channelList?: ChannelOpt[];
  onKanalChange?: (kanalId: string | undefined) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const monturQ = useMonturlerQuery({ page_size: "50" }, enabled);
  const tasQ = useTaslarQuery({ page_size: "50" }, enabled);

  const [monturQtext, setMonturQtext] = useState("");
  const [tasQtext, setTasQtext] = useState("");
  const [monturVid, setMonturVid] = useState<number | "">("");
  const [bandVid, setBandVid] = useState<number | "">("");
  const [tasVid, setTasVid] = useState<number | "">("");
  const [adet, setAdet] = useState("1");
  const [busy, setBusy] = useState(false);

  /** Visual-only preview (not the sold stone until a stock stone is picked). */
  const [previewShape, setPreviewShape] = useState<string>("ROUND");
  const [previewCarat, setPreviewCarat] = useState<number>(1);

  const monturRows = useMemo(() => {
    const out: MonturPick[] = [];
    for (const u of monturQ.data?.results ?? []) {
      for (const v of (u.varyantlar ?? []) as MonturCatalogVariant[]) {
        if (!v?.id || v.imalata_acik === false) continue;
        const rol = (v.parca_rolu || "FULL").toUpperCase();
        if (rol === "BAND") continue;
        const izinli = (v.izinli_kesimler ?? [])
          .map((x) => String(x).trim().toUpperCase())
          .filter(Boolean);
        const yuva = Number(v.yuva_adedi ?? 0);
        if (!izinli.length || yuva < 1) continue;
        if (v.karat_min == null || v.karat_max == null) continue;
        out.push({
          urunId: u.id,
          urunAd: u.ad || `Ürün #${u.id}`,
          ayar: u.ayar || "",
          varyantId: v.id,
          sku: v.sku || String(v.id),
          gram: v.gram ?? null,
          yuva,
          izinli,
          karatMin: numOrNull(v.karat_min),
          karatMax: numOrNull(v.karat_max),
          parcaRolu: rol,
          basStil: v.bas_stil || "",
          govdeStil: v.govde_stil || "",
        });
      }
    }
    return out;
  }, [monturQ.data]);

  const bandRows = useMemo(() => {
    const out: BandPick[] = [];
    for (const u of monturQ.data?.results ?? []) {
      for (const v of (u.varyantlar ?? []) as MonturCatalogVariant[]) {
        if (!v?.id) continue;
        if ((v.parca_rolu || "").toUpperCase() !== "BAND") continue;
        out.push({
          urunId: u.id,
          urunAd: u.ad || `Ürün #${u.id}`,
          varyantId: v.id,
          sku: v.sku || String(v.id),
          gram: v.gram ?? null,
          govdeStil: v.govde_stil || "",
        });
      }
    }
    return out;
  }, [monturQ.data]);

  const allTasRows = useMemo(() => {
    const out: TasPick[] = [];
    for (const u of tasQ.data?.results ?? []) {
      for (const v of (u.varyantlar ?? []) as MonturCatalogVariant[]) {
        if (!v?.id) continue;
        out.push({
          urunId: u.id,
          urunAd: u.ad || `Ürün #${u.id}`,
          varyantId: v.id,
          sku: v.sku || String(v.id),
          karat: numOrNull(v.karat),
          kesimKod: (v.kesim_kod || "").trim().toUpperCase(),
        });
      }
    }
    return out;
  }, [tasQ.data]);

  const selectedMontur = useMemo(
    () => monturRows.find((r) => r.varyantId === monturVid) ?? null,
    [monturRows, monturVid]
  );

  const adetN = Math.max(1, Number.parseInt(adet, 10) || 1);

  const filteredMontur = useMemo(() => {
    const q = monturQtext.trim().toLowerCase();
    if (!q) return monturRows;
    return monturRows.filter(
      (r) =>
        r.urunAd.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.ayar.toLowerCase().includes(q)
    );
  }, [monturRows, monturQtext]);

  const caratChips = useMemo(
    () =>
      previewCaratOptions(
        selectedMontur?.karatMin ?? null,
        selectedMontur?.karatMax ?? null
      ),
    [selectedMontur]
  );

  const shapeChoices = useMemo(() => {
    if (!selectedMontur) return [];
    return selectedMontur.izinli;
  }, [selectedMontur]);

  const tasRows = useMemo(() => {
    if (!selectedMontur) return [];
    const uyumlu = allTasRows.filter((t) =>
      tasUyumlu(selectedMontur, t, adetN)
    );
    const byShape = uyumlu.filter((t) =>
      previewShape ? t.kesimKod === previewShape : true
    );
    const pool = byShape.length > 0 ? byShape : uyumlu;
    const q = tasQtext.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (r) =>
        r.urunAd.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.kesimKod.toLowerCase().includes(q)
    );
  }, [allTasRows, selectedMontur, adetN, tasQtext, previewShape]);

  const selectedTas = useMemo(
    () => allTasRows.find((r) => r.varyantId === tasVid) ?? null,
    [allTasRows, tasVid]
  );

  const displayShape =
    selectedTas?.kesimKod ||
    previewShape ||
    selectedMontur?.izinli[0] ||
    "ROUND";
  const displayCarat =
    selectedTas?.karat != null ? selectedTas.karat : previewCarat;
  const stoneScale = caratPreviewScale(displayCarat);

  useEffect(() => {
    if (monturVid !== "" && !monturRows.some((r) => r.varyantId === monturVid)) {
      setMonturVid("");
      setTasVid("");
    }
  }, [monturRows, monturVid]);

  useEffect(() => {
    if (tasVid === "") return;
    const row = allTasRows.find((r) => r.varyantId === tasVid);
    if (
      !selectedMontur ||
      !row ||
      !tasUyumlu(selectedMontur, row, adetN)
    ) {
      setTasVid("");
    }
  }, [allTasRows, tasVid, selectedMontur, adetN]);

  useEffect(() => {
    if (!selectedMontur) return;
    if (!selectedMontur.izinli.includes(previewShape)) {
      setPreviewShape(selectedMontur.izinli[0] ?? "ROUND");
    }
    const chips = previewCaratOptions(
      selectedMontur.karatMin,
      selectedMontur.karatMax
    );
    if (!chips.includes(previewCarat)) {
      setPreviewCarat(chips[Math.floor(chips.length / 2)] ?? 1);
    }
  }, [selectedMontur, previewShape, previewCarat]);

  const selectMontur = (vid: number) => {
    const m = monturRows.find((r) => r.varyantId === vid);
    setMonturVid(vid);
    setBandVid("");
    setTasVid("");
    setAdet("1");
    if (m) {
      setPreviewShape(m.izinli[0] ?? "ROUND");
      const chips = previewCaratOptions(m.karatMin, m.karatMax);
      setPreviewCarat(chips[Math.floor(chips.length / 2)] ?? 1);
    }
  };

  const needsBand = selectedMontur?.parcaRolu === "HEAD";

  const pickShape = (kod: string) => {
    setPreviewShape(kod);
    if (selectedTas && selectedTas.kesimKod !== kod) {
      setTasVid("");
    }
  };

  const pickPreviewCarat = (c: number) => {
    setPreviewCarat(c);
    // Clear stock stone if its karat no longer matches preview intent loosely —
    // keep selection; preview is visual-only when stone selected.
  };

  const submit = async () => {
    if (!monturVid || !tasVid) {
      toast.error("Eksik seçim", "Montür ve stokta taş seçin.");
      return;
    }
    if (!satisKanaliId) {
      toast.error("Kanal gerekli", "Önce satış kanalı seçin.");
      return;
    }
    setBusy(true);
    try {
      const mq = await fiyatlamaService.createQuote({
        varyant_id: Number(monturVid),
        satis_kanali_id: satisKanaliId,
      });
      let bandQuoteId: number | undefined;
      if (needsBand && bandVid) {
        const bq = await fiyatlamaService.createQuote({
          varyant_id: Number(bandVid),
          satis_kanali_id: satisKanaliId,
        });
        bandQuoteId = bq.id;
      }
      const tq = await fiyatlamaService.createQuote({
        varyant_id: Number(tasVid),
        satis_kanali_id: satisKanaliId,
      });
      await siparisService.addCartLineBilesim({
        montur_quote_id: mq.id,
        band_quote_id: bandQuoteId,
        taslar: [{ quote_id: tq.id, miktar: String(adetN) }],
        miktar: "1",
      });
      toast.success(
        "İmal edildi",
        bandQuoteId
          ? "Baş + gövde + taş imalat satırı sepete eklendi."
          : "Montür + taş imalat satırı sepete eklendi."
      );
      navigate("/siparis");
    } catch (err) {
      toast.error(
        "İmalat eklenemedi",
        mapCommerceError(err, "Montür/taş imalat satırı oluşturulamadı")
      );
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="montur-tas-compose"
      aria-label="İmalat eşleştirme"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">İmalat</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Montür seçin, şekil ve karat önizleyin, uyumlu taşı kilitleyin.
            Önizleme ölçeği görseldir; fiyat seçilen stok taşından gelir. CTA:
            İmal et.
          </p>
        </div>
        <label className="text-[11px] font-medium text-muted-foreground">
          Satış kanalı
          <select
            className="mt-1 h-9 min-w-[10rem] rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={satisKanaliId != null ? String(satisKanaliId) : ""}
            onChange={(e) => onKanalChange?.(e.target.value || undefined)}
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
        </label>
      </header>

      {/* Stage: live composition preview */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted/50 via-card to-muted/30"
        data-testid="imalat-preview-stage"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:18px_18px]" />
        <div className="relative grid gap-4 p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:p-6">
          <div className="flex flex-col items-center justify-center py-4">
            <div
              className="relative flex h-[220px] w-[200px] items-center justify-center transition-transform duration-300 ease-out"
              aria-hidden
            >
              <MonturRingIcon
                className={`h-[200px] w-[170px] transition-colors duration-300 ${
                  selectedMontur
                    ? "text-foreground/80"
                    : "text-muted-foreground/40"
                }`}
              />
              <div
                className="absolute left-1/2 top-[18%] -translate-x-1/2 text-foreground transition-[transform,opacity] duration-300 ease-out"
                style={{
                  transform: `translateX(-50%) scale(${stoneScale})`,
                  opacity: selectedMontur ? 1 : 0.25,
                }}
              >
                <ShapeIcon
                  kod={displayShape}
                  className="h-14 w-14 drop-shadow-sm"
                />
              </div>
            </div>
            <p className="mt-1 max-w-sm text-center text-[11px] text-muted-foreground">
              Dijital önizleme — nihai ürün seçilen montür + stok taşa göredir.
              {selectedTas
                ? ` Ölçek: ${displayCarat} ct (${shapeLabel(displayShape)}).`
                : ` Önizleme: ${displayCarat} ct (${shapeLabel(displayShape)}).`}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Önizleme şekli
              </div>
              {!selectedMontur ? (
                <p className="text-xs text-muted-foreground">
                  Önce aşağıdan montür seçin.
                </p>
              ) : (
                <div
                  className="grid grid-cols-5 gap-1.5 sm:grid-cols-6"
                  role="listbox"
                  aria-label="Önizleme şekli"
                >
                  {shapeChoices.map((kod) => {
                    const active = displayShape === kod;
                    return (
                      <button
                        key={kod}
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={busy}
                        onClick={() => pickShape(kod)}
                        className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[10px] transition-colors ${
                          active
                            ? "border-foreground bg-background text-foreground shadow-sm"
                            : "border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                        }`}
                        title={shapeLabel(kod)}
                      >
                        <ShapeIcon kod={kod} className="h-8 w-8" />
                        <span className="max-w-full truncate">
                          {shapeLabel(kod)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Önizleme karat
                {selectedMontur?.karatMin != null &&
                selectedMontur?.karatMax != null
                  ? ` · yuva ${selectedMontur.karatMin}–${selectedMontur.karatMax} ct`
                  : ""}
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role="listbox"
                aria-label="Önizleme karat"
              >
                {caratChips.map((c) => {
                  const active =
                    Math.abs(displayCarat - c) < 1e-9 && !selectedTas;
                  const locked =
                    selectedTas?.karat != null &&
                    Math.abs(selectedTas.karat - c) < 1e-9;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="option"
                      aria-selected={active || locked}
                      disabled={busy || !selectedMontur}
                      onClick={() => {
                        pickPreviewCarat(c);
                        if (selectedTas) setTasVid("");
                      }}
                      className={`min-w-[3rem] rounded-md border px-3 py-2 text-xs tabular-nums transition-colors disabled:opacity-40 ${
                        active || locked
                          ? "border-foreground bg-background font-semibold text-foreground shadow-sm"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {selectedTas ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Stok taş seçili — ölçek {selectedTas.karat} ct. Karat chip’e
                  basınca önizleme moduna döner.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Montür grid */}
        <div className="flex min-h-[22rem] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Montür stili</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {filteredMontur.length}
              </span>
            </div>
            <input
              type="search"
              placeholder="Montür ara…"
              value={monturQtext}
              onChange={(e) => setMonturQtext(e.target.value)}
              className="mt-2 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              aria-label="Montür ara"
            />
          </div>
          <div
            className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3"
            role="listbox"
            aria-label="Montür listesi"
          >
            {monturQ.isLoading ? (
              <p className="col-span-full p-2 text-xs text-muted-foreground">
                Yükleniyor…
              </p>
            ) : filteredMontur.length === 0 ? (
              <p className="col-span-full p-2 text-xs text-amber-700 dark:text-amber-400">
                İmalata açık montür yok. Ürün Yönetimi’nde yuva, izinli kesim ve
                karat aralığı doldurun.
              </p>
            ) : (
              filteredMontur.map((r) => {
                const selected = r.varyantId === monturVid;
                return (
                  <button
                    key={r.varyantId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => selectMontur(r.varyantId)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-all ${
                      selected
                        ? "border-foreground bg-muted/70 shadow-sm"
                        : "border-border/70 hover:border-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <MonturRingIcon
                      className={`h-14 w-12 ${
                        selected
                          ? "text-foreground"
                          : "text-muted-foreground/70"
                      }`}
                    />
                    <div className="line-clamp-2 w-full text-[11px] font-medium leading-snug text-foreground">
                      {r.urunAd}
                    </div>
                    <div className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.parcaRolu}
                    </div>
                    <div className="w-full truncate font-mono text-[10px] text-muted-foreground">
                      {r.sku}
                      {r.gram ? ` · ${r.gram}g` : ""}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {r.karatMin}–{r.karatMax} ct · {r.izinli.length} şekil
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {needsBand ? (
            <div className="border-t border-border p-2">
              <div className="mb-1.5 text-[11px] font-semibold text-foreground">
                Gövde (BAND) — isteğe bağlı
              </div>
              {bandRows.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  Kayıtlı BAND yok. Yalnız baş ile devam edilebilir.
                </p>
              ) : (
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setBandVid("")}
                    className={`rounded border px-2 py-1.5 text-left text-[10px] ${
                      bandVid === ""
                        ? "border-foreground bg-muted/50"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    Gövde yok (yalnız baş)
                  </button>
                  {bandRows.map((b) => (
                    <button
                      key={b.varyantId}
                      type="button"
                      disabled={busy}
                      onClick={() => setBandVid(b.varyantId)}
                      className={`rounded border px-2 py-1.5 text-left text-[10px] ${
                        bandVid === b.varyantId
                          ? "border-foreground bg-muted/50"
                          : "border-transparent hover:bg-muted/40"
                      }`}
                    >
                      <span className="font-medium">{b.urunAd}</span>
                      <span className="block font-mono text-muted-foreground">
                        {b.sku}
                        {b.govdeStil ? ` · ${b.govdeStil}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Uyumlu taş */}
        <div className="flex min-h-[22rem] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Uyumlu taş (stok)</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {selectedMontur ? tasRows.length : "—"}
              </span>
            </div>
            <input
              type="search"
              placeholder={
                selectedMontur ? "Taş ara…" : "Önce montür seçin"
              }
              value={tasQtext}
              onChange={(e) => setTasQtext(e.target.value)}
              disabled={!selectedMontur}
              className="mt-2 h-8 w-full rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
              aria-label="Taş ara"
            />
          </div>
          <div
            className="flex-1 space-y-1.5 overflow-y-auto p-2"
            role="listbox"
            aria-label="Uyumlu taş listesi"
          >
            {!selectedMontur ? (
              <p className="p-2 text-xs text-muted-foreground">
                Montür seçildiğinde uyumlu taşlar burada görünür.
              </p>
            ) : tasQ.isLoading ? (
              <p className="p-2 text-xs text-muted-foreground">Yükleniyor…</p>
            ) : tasRows.length === 0 ? (
              <p className="p-2 text-xs text-amber-700 dark:text-amber-400">
                Bu montür / şekil için uygun taş yok (kesim / karat / yuva).
              </p>
            ) : (
              tasRows.map((r) => {
                const selected = r.varyantId === tasVid;
                return (
                  <button
                    key={r.varyantId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => {
                      setTasVid(r.varyantId);
                      if (r.kesimKod) setPreviewShape(r.kesimKod);
                      if (r.karat != null) setPreviewCarat(r.karat);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-foreground/30 bg-muted/60"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <ShapeIcon
                      kod={r.kesimKod || "ROUND"}
                      className="h-9 w-9 shrink-0 text-foreground/80"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">
                        {r.urunAd}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                        {r.sku}
                        {r.kesimKod ? ` · ${shapeLabel(r.kesimKod)}` : ""}
                        {r.karat != null ? ` · ${r.karat} ct` : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur-sm">
        <div className="min-w-0 text-xs text-muted-foreground">
          {selectedMontur ? (
            <span>
              <span className="font-medium text-foreground">
                {selectedMontur.urunAd}
              </span>
              <span className="text-muted-foreground">
                {" "}
                ({selectedMontur.parcaRolu})
              </span>
              {needsBand && bandVid
                ? ` + ${bandRows.find((b) => b.varyantId === bandVid)?.urunAd ?? "gövde"}`
                : ""}
              {" + "}
              {selectedTas ? (
                <span className="font-medium text-foreground">
                  {selectedTas.urunAd} ({selectedTas.karat} ct)
                </span>
              ) : (
                <span>stok taş seçin</span>
              )}
            </span>
          ) : (
            <span>Montür ve taş seçilmedi</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Adet
            <input
              type="number"
              min={1}
              max={selectedMontur?.yuva ?? 1}
              className="h-8 w-14 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={adet}
              onChange={(e) => {
                setAdet(e.target.value);
                setTasVid("");
              }}
              disabled={!selectedMontur || busy}
              aria-label="Taş adedi"
            />
          </label>
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-[5.5rem] text-xs"
            disabled={busy || !monturVid || !tasVid || !satisKanaliId}
            onClick={() => void submit()}
          >
            {busy ? "İmal ediliyor…" : "İmal et"}
          </Button>
        </div>
      </div>
    </section>
  );
}
