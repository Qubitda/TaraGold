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
 * ADR-0044 — İmalat eşleştirme: sol montür, sağ uyumlu taş, tek CTA İmal et.
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
  const [tasVid, setTasVid] = useState<number | "">("");
  const [adet, setAdet] = useState("1");
  const [busy, setBusy] = useState(false);

  const monturRows = useMemo(() => {
    const out: MonturPick[] = [];
    for (const u of monturQ.data?.results ?? []) {
      for (const v of (u.varyantlar ?? []) as MonturCatalogVariant[]) {
        if (!v?.id || v.imalata_acik === false) continue;
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

  const tasRows = useMemo(() => {
    if (!selectedMontur) return [];
    const uyumlu = allTasRows.filter((t) =>
      tasUyumlu(selectedMontur, t, adetN)
    );
    const q = tasQtext.trim().toLowerCase();
    if (!q) return uyumlu;
    return uyumlu.filter(
      (r) =>
        r.urunAd.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.kesimKod.toLowerCase().includes(q)
    );
  }, [allTasRows, selectedMontur, adetN, tasQtext]);

  const selectedTas = useMemo(
    () => tasRows.find((r) => r.varyantId === tasVid) ?? null,
    [tasRows, tasVid]
  );

  // Filtre/adet değişince uyumsuz kalan seçimi temizle (stale submit önlemi)
  useEffect(() => {
    if (monturVid !== "" && !monturRows.some((r) => r.varyantId === monturVid)) {
      setMonturVid("");
      setTasVid("");
    }
  }, [monturRows, monturVid]);

  useEffect(() => {
    if (tasVid !== "" && !tasRows.some((r) => r.varyantId === tasVid)) {
      setTasVid("");
    }
  }, [tasRows, tasVid]);

  const selectMontur = (vid: number) => {
    setMonturVid(vid);
    setTasVid("");
    setAdet("1");
  };

  const submit = async () => {
    if (!monturVid || !tasVid) {
      toast.error("Eksik seçim", "Soldan montür, sağdan uyumlu taş seçin.");
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
      const tq = await fiyatlamaService.createQuote({
        varyant_id: Number(tasVid),
        satis_kanali_id: satisKanaliId,
      });
      await siparisService.addCartLineBilesim({
        montur_quote_id: mq.id,
        taslar: [{ quote_id: tq.id, miktar: String(adetN) }],
        miktar: "1",
      });
      toast.success("İmal edildi", "Montür + taş imalat satırı sepete eklendi.");
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
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            Soldan montür, sağdan uyumlu taş. Taş mücevher olmak zorunda değil
            (sentetik, cam, inci, ham…). Eşleşmeyenler listelenmez. CTA: İmal et.
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

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Sol — Montür */}
        <div className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Montür</h2>
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
            className="flex-1 space-y-1.5 overflow-y-auto p-2"
            role="listbox"
            aria-label="Montür listesi"
          >
            {monturQ.isLoading ? (
              <p className="p-2 text-xs text-muted-foreground">Yükleniyor…</p>
            ) : filteredMontur.length === 0 ? (
              <p className="p-2 text-xs text-amber-700 dark:text-amber-400">
                İmalata açık montür yok. Ürün Yönetimi’nde yuva, izinli kesim ve karat
                aralığı doldurun.
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
                    className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-foreground/30 bg-muted/60"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-xs font-medium text-foreground">
                      {r.urunAd}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {r.sku}
                      {r.gram ? ` · ${r.gram}g` : ""}
                      {r.ayar ? ` · ${r.ayar}` : ""}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Yuva {r.yuva} · {r.karatMin}–{r.karatMax} ct ·{" "}
                      {r.izinli.join(", ")}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Sağ — Taş */}
        <div className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Uyumlu taş</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {selectedMontur ? tasRows.length : "—"}
              </span>
            </div>
            <input
              type="search"
              placeholder={
                selectedMontur ? "Taş ara…" : "Önce soldan montür seçin"
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
                Bu montüre uygun taş yok (kesim / karat / yuva).
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
                    onClick={() => setTasVid(r.varyantId)}
                    className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-foreground/30 bg-muted/60"
                        : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-xs font-medium text-foreground">
                      {r.urunAd}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {r.sku}
                      {r.kesimKod ? ` · ${r.kesimKod}` : ""}
                      {r.karat != null ? ` · ${r.karat} ct` : ""}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Özet + tek CTA */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur-sm">
        <div className="min-w-0 text-xs text-muted-foreground">
          {selectedMontur ? (
            <span>
              <span className="font-medium text-foreground">
                {selectedMontur.urunAd}
              </span>
              {" + "}
              {selectedTas ? (
                <span className="font-medium text-foreground">
                  {selectedTas.urunAd}
                </span>
              ) : (
                <span>taş seçin</span>
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
