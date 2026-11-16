import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  opsProductCreateSchema,
  opsWizardKimlikSchema,
  opsWizardTipSchema,
  zodIssuesToFieldErrors,
  type OpsMonturModu,
} from "../schemas";
import { urunlerService } from "../services";
import type { CatalogRefsResponse, CategoryItem, OpsProductCreateRequest } from "../types";
import {
  type MonturParcaRolu,
  stillerFromRefs,
} from "./montur-style-catalog";
import { MonturRingIcon, ShapeIcon, shapeLabel } from "./stone-shape-icons";

type ProductKind = "HAM_ALTIN" | "MONTUR" | "TAS";
type MonturMode = OpsMonturModu;
type WizardStep = "tip" | "kimlik" | "teknik";

function optNum(v: number | ""): number | undefined {
  return v === "" ? undefined : v;
}

function optPositiveStr(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

type WizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryItem[];
  refs: CatalogRefsResponse | null | undefined;
  satisKanaliId?: number | null;
  isPlatform?: boolean;
  lockedFirma?: { id: number; ad: string } | null;
  onCreated: (productId: number, meta?: { hazirlikYuzde?: number }) => void;
  onError: (title: string, err: unknown) => void;
};

function RefsEmpty({ label, grup }: { label: string; grup: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      {label} tanımlı değil.{" "}
      <Link to={`/tanimlar?grup=${grup}`} className="font-medium text-foreground underline">
        Tanımlar → {label}
      </Link>
    </p>
  );
}

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11px] text-destructive">{msg}</p>;
}

function StyleGrid({
  options,
  value,
  onChange,
}: {
  options: { kod: string; ad: string }[];
  value: string;
  onChange: (kod: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="listbox">
      {options.map((o) => {
        const selected = value === o.kod;
        return (
          <button
            key={o.kod}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(o.kod)}
            className={`flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center text-[10px] transition-colors ${
              selected
                ? "border-foreground bg-background shadow-sm"
                : "border-border/70 hover:border-foreground/30"
            }`}
          >
            <MonturRingIcon
              className={`h-10 w-8 ${
                selected ? "text-foreground" : "text-muted-foreground/70"
              }`}
            />
            <span className="line-clamp-2 leading-tight">{o.ad}</span>
          </button>
        );
      })}
    </div>
  );
}

function resolveTasUrunAyarId(refs: CatalogRefsResponse | null | undefined): number | null {
  const list = refs?.ayarlar ?? [];
  const neutral = list.find(
    (a) =>
      a.gram_bazli === false ||
      /ayarsiz|tas|stone|gem/i.test(
        `${a.metal_kod || ""} ${a.ayar_kodu || ""} ${a.metal_ad || ""}`
      )
  );
  return neutral?.id ?? list[0]?.id ?? null;
}

/**
 * ADR-0044 — 3 adım: tür → kimlik → teknik; tek POST create.
 */
export function OpsProductCreateWizard({
  open,
  onOpenChange,
  categories,
  refs,
  satisKanaliId,
  isPlatform = true,
  lockedFirma = null,
  onCreated,
  onError,
}: WizardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [kind, setKind] = useState<ProductKind | null>(null);
  const [monturMode, setMonturMode] = useState<MonturMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [sahiplikFirmaId, setSahiplikFirmaId] = useState<number | "">("");
  const [ad, setAd] = useState("");
  const [kategoriId, setKategoriId] = useState<number | "">("");
  const [olcuTipi, setOlcuTipi] = useState("");
  const [renkEkseni, setRenkEkseni] = useState(false);
  const [fiyatTipi, setFiyatTipi] = useState("");

  const [metalId, setMetalId] = useState<number | "">("");
  const [ayarId, setAyarId] = useState<number | "">("");
  const [metalRenkId, setMetalRenkId] = useState<number | "">("");
  const [gram, setGram] = useState("");
  const [basStil, setBasStil] = useState("");
  const [govdeStil, setGovdeStil] = useState("");
  const [yuva, setYuva] = useState("");
  const [izinli, setIzinli] = useState<string[]>([]);
  const [karatMin, setKaratMin] = useState("");
  const [karatMax, setKaratMax] = useState("");
  const [tasTipId, setTasTipId] = useState<number | "">("");
  const [kesimKod, setKesimKod] = useState("");
  const [karat, setKarat] = useState("");

  const [hbHeadMetal, setHbHeadMetal] = useState<number | "">("");
  const [hbHeadAyar, setHbHeadAyar] = useState<number | "">("");
  const [hbHeadRenk, setHbHeadRenk] = useState<number | "">("");
  const [hbHeadBas, setHbHeadBas] = useState("");
  const [hbHeadGram, setHbHeadGram] = useState("");
  const [hbHeadYuva, setHbHeadYuva] = useState("");
  const [hbHeadIzinli, setHbHeadIzinli] = useState<string[]>([]);
  const [hbHeadKmin, setHbHeadKmin] = useState("");
  const [hbHeadKmax, setHbHeadKmax] = useState("");

  const [hbBandMetal, setHbBandMetal] = useState<number | "">("");
  const [hbBandAyar, setHbBandAyar] = useState<number | "">("");
  const [hbBandRenk, setHbBandRenk] = useState<number | "">("");
  const [hbBandGovde, setHbBandGovde] = useState("");
  const [hbBandGram, setHbBandGram] = useState("");

  const steps: WizardStep[] = ["tip", "kimlik", "teknik"];
  const step = steps[stepIdx] ?? "tip";

  const aktifCats = categories.filter((c) => c.aktif !== false);
  const tedFirmalar = refs?.tedarikci_firmalar ?? [];
  const metaller = refs?.metaller ?? [];
  const ayarlar = refs?.ayarlar ?? [];
  const renkler = refs?.renkler ?? [];
  const kesimler = refs?.tas_kesimleri ?? [];
  const stiller = stillerFromRefs(refs?.stiller);
  const tasTipleri = refs?.tas_tipleri ?? [];
  const fiyatTipleri = refs?.fiyat_tipleri ?? [];

  const needsSocket =
    kind === "MONTUR" &&
    monturMode !== "BAND" &&
    monturMode !== null &&
    monturMode !== "HEAD_BAND";
  const needsHeadStyle =
    kind === "MONTUR" &&
    monturMode !== null &&
    monturMode !== "BAND" &&
    (monturMode === "FULL" || monturMode === "HEAD" || monturMode === "HEAD_BAND");
  const needsBandStyle =
    kind === "MONTUR" &&
    monturMode !== null &&
    monturMode !== "HEAD" &&
    (monturMode === "FULL" || monturMode === "BAND" || monturMode === "HEAD_BAND");

  const ayarForMetal = (mid: number | "") =>
    mid === ""
      ? []
      : ayarlar.filter((a) => a.metal_id === mid);

  const reset = () => {
    setStepIdx(0);
    setKind(null);
    setMonturMode(null);
    setBusy(false);
    setFieldErrors({});
    setSahiplikFirmaId("");
    setAd("");
    setKategoriId("");
    setOlcuTipi("");
    setRenkEkseni(false);
    setFiyatTipi("");
    setMetalId("");
    setAyarId("");
    setMetalRenkId("");
    setGram("");
    setBasStil("");
    setGovdeStil("");
    setYuva("");
    setIzinli([]);
    setKaratMin("");
    setKaratMax("");
    setTasTipId("");
    setKesimKod("");
    setKarat("");
    setHbHeadMetal("");
    setHbHeadAyar("");
    setHbHeadRenk("");
    setHbHeadBas("");
    setHbHeadGram("");
    setHbHeadYuva("");
    setHbHeadIzinli([]);
    setHbHeadKmin("");
    setHbHeadKmax("");
    setHbBandMetal("");
    setHbBandAyar("");
    setHbBandRenk("");
    setHbBandGovde("");
    setHbBandGram("");
  };

  const close = (v: boolean) => {
    if (!v && busy) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const toggleIzinli = (list: string[], kod: string, set: (v: string[]) => void) => {
    set(list.includes(kod) ? list.filter((x) => x !== kod) : [...list, kod]);
  };

  const validateStep = (target: WizardStep): Record<string, string> => {
    if (target === "tip") {
      const parsed = opsWizardTipSchema.safeParse({
        kind: kind ?? undefined,
        montur_modu: monturMode ?? undefined,
      });
      if (parsed.success) return {};
      return zodIssuesToFieldErrors(parsed.error.issues, {
        kind: "kind",
        montur_modu: "monturMode",
      });
    }
    if (target === "kimlik") {
      const parsed = opsWizardKimlikSchema.safeParse({
        ad,
        kategori_id: optNum(kategoriId),
        olcu_tipi: olcuTipi || undefined,
        renk_ekseni: renkEkseni,
        sahiplik_firma_id: optNum(sahiplikFirmaId),
        require_sahiplik: Boolean(isPlatform),
      });
      if (parsed.success) return {};
      return zodIssuesToFieldErrors(parsed.error.issues, {
        sahiplik_firma_id: "sahiplik",
      });
    }
    // teknik — tek kaynak: opsProductCreateSchema
    const body = buildCreateBody();
    if (!body) {
      return { ayar_id: "Taş ürünü için uygun ayar tanımı yok" };
    }
    // UI-only metal seçimi (şemada yok) — ayar seçilmeden metal boşsa işaretle
    const ui: Record<string, string> = {};
    if (kind === "HAM_ALTIN" || (kind === "MONTUR" && monturMode !== "HEAD_BAND")) {
      if (!metalId) ui.metal_id = "Metal seçin";
      if (!metalRenkId) ui.metal_renk = "Metal rengi seçin";
    }
    if (kind === "MONTUR" && monturMode === "HEAD_BAND") {
      if (!hbHeadMetal) ui.h_head_metal_id = "Baş metali seçin";
      if (!hbBandMetal) ui.h_band_metal_id = "Gövde metali seçin";
    }
    const parsed = opsProductCreateSchema.safeParse(body);
    if (!parsed.success) {
      Object.assign(ui, zodIssuesToFieldErrors(parsed.error.issues));
    }
    return ui;
  };

  const canNext = step !== "teknik" && Object.keys(validateStep(step)).length === 0;

  const next = () => {
    const err = validateStep(step);
    setFieldErrors(err);
    if (Object.keys(err).length) return;
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  const back = () => {
    setFieldErrors({});
    if (stepIdx === 0) {
      setKind(null);
      setMonturMode(null);
      return;
    }
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const parcaRolu = (): MonturParcaRolu => {
    if (monturMode === "HEAD_BAND" || monturMode === null) return "FULL";
    if (monturMode === "HEAD" || monturMode === "BAND") return monturMode;
    return "FULL";
  };

  const buildCreateBody = (): OpsProductCreateRequest | null => {
    const ft = fiyatTipi === "sabit" || fiyatTipi === "gram" ? fiyatTipi : undefined;
    const base = {
      ad: ad.trim(),
      kategori_id: optNum(kategoriId) as number,
      fiyat_tipi: (ft ?? "gram") as "gram" | "sabit",
      temin_tipi: "hazir" as const,
      aciklama: "",
      olcu_tipi: olcuTipi || undefined,
      renk_ekseni: renkEkseni,
      ...(satisKanaliId != null && satisKanaliId > 0
        ? { satis_kanali_id: satisKanaliId }
        : {}),
      ...(isPlatform && sahiplikFirmaId !== ""
        ? { sahiplik_firma_id: sahiplikFirmaId }
        : {}),
    };

    if (kind === "TAS") {
      const urunAyar = resolveTasUrunAyarId(refs);
      if (!urunAyar) return null;
      return {
        ...base,
        ayar_id: urunAyar,
        fiyat_tipi: (ft ?? "sabit") as "gram" | "sabit",
        varyantlar: [
          {
            tip: "TAS",
            karat: karat || undefined,
            kesim_kod: kesimKod || undefined,
          },
        ],
      };
    }

    if (kind === "MONTUR" && monturMode === "HEAD_BAND") {
      return {
        ...base,
        ayar_id: optNum(hbHeadAyar),
        montur_modu: "HEAD_BAND",
        parcalar: [
          {
            parca_rolu: "HEAD",
            ayar_id: optNum(hbHeadAyar) as number,
            gram: hbHeadGram,
            renk_id: optNum(hbHeadRenk),
            bas_stil: hbHeadBas || undefined,
            yuva_adedi: optPositiveStr(hbHeadYuva),
            izinli_kesimler: hbHeadIzinli.length ? hbHeadIzinli : undefined,
            karat_min: hbHeadKmin || undefined,
            karat_max: hbHeadKmax || undefined,
          },
          {
            parca_rolu: "BAND",
            ayar_id: optNum(hbBandAyar) as number,
            gram: hbBandGram,
            renk_id: optNum(hbBandRenk),
            govde_stil: hbBandGovde || undefined,
          },
        ],
      };
    }

    const rol = kind === "MONTUR" ? parcaRolu() : undefined;
    const socket =
      kind === "MONTUR" && needsSocket
        ? {
            yuva_adedi: optPositiveStr(yuva),
            izinli_kesimler: izinli.length ? izinli : undefined,
            karat_min: karatMin || undefined,
            karat_max: karatMax || undefined,
          }
        : {};

    return {
      ...base,
      ayar_id: optNum(ayarId),
      varyantlar: [
        {
          tip: kind === "MONTUR" ? "MONTUR" : "HAM_ALTIN",
          parca_rolu: rol,
          bas_stil: needsHeadStyle && basStil ? basStil : undefined,
          govde_stil: needsBandStyle && govdeStil ? govdeStil : undefined,
          gram: gram || undefined,
          renk_id: optNum(metalRenkId) ?? null,
          ayar_id: optNum(ayarId),
          ...socket,
        },
      ],
    };
  };

  const submit = async () => {
    const err = validateStep("teknik");
    setFieldErrors(err);
    if (Object.keys(err).length) return;
    const body = buildCreateBody();
    if (!body) {
      onError("Oluşturulamadı", new Error("Taş ürünü için uygun ayar tanımı yok"));
      return;
    }
    setBusy(true);
    try {
      const created = await urunlerService.createOpsProduct(body);
      const yuzde = created.hazirlik?.yuzde;
      close(false);
      onCreated(created.id, { hazirlikYuzde: yuzde });
    } catch (e) {
      onError("Ürün kaydedilemedi", e);
    } finally {
      setBusy(false);
    }
  };

  const kesimGrid = (
    selected: string[],
    onToggle: (kod: string) => void
  ) => {
    if (!kesimler.length) {
      return <RefsEmpty label="Taş kesimleri" grup="tas-kesimi" />;
    }
    return (
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
        {kesimler.map((k) => {
          const kod = (k.kod || "").toUpperCase();
          if (!kod) return null;
          const on = selected.includes(kod);
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => onToggle(kod)}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[10px] ${
                on ? "border-foreground bg-background" : "border-border/60 opacity-70"
              }`}
            >
              <ShapeIcon kod={kod} className="h-7 w-7" />
              {k.ad || shapeLabel(kod)}
            </button>
          );
        })}
      </div>
    );
  };

  const metalBlock = (
    prefix: string,
    mid: number | "",
    setMid: (v: number | "") => void,
    aid: number | "",
    setAid: (v: number | "") => void,
    rid: number | "",
    setRid: (v: number | "") => void
  ) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {!metaller.length ? (
        <RefsEmpty label="Metaller" grup="kiymetli-metaller" />
      ) : (
        <label className="text-[11px] text-muted-foreground">
          Metal
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={mid === "" ? "" : String(mid)}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : "";
              setMid(v);
              setAid("");
            }}
          >
            <option value="">Seçin…</option>
            {metaller.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ad}
              </option>
            ))}
          </select>
          <FieldErr msg={fieldErrors[`${prefix}metal_id`]} />
        </label>
      )}
      <label className="text-[11px] text-muted-foreground">
        Ayar
        <select
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
          value={aid === "" ? "" : String(aid)}
          disabled={!mid}
          onChange={(e) => setAid(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Seçin…</option>
          {ayarForMetal(mid).map((a) => (
            <option key={a.id} value={a.id}>
              {a.ayar_kodu || a.metal_ad}
            </option>
          ))}
        </select>
        <FieldErr msg={fieldErrors[`${prefix}ayar_id`]} />
      </label>
      {!renkler.length ? (
        <RefsEmpty label="Renkler" grup="renk" />
      ) : (
        <label className="text-[11px] text-muted-foreground">
          Metal rengi
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={rid === "" ? "" : String(rid)}
            onChange={(e) => setRid(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Seçin…</option>
            {renkler.map((r) => (
              <option key={r.id} value={r.id}>
                {r.ad || r.kod}
              </option>
            ))}
          </select>
          <FieldErr msg={fieldErrors[`${prefix}metal_renk`]} />
        </label>
      )}
    </div>
  );

  let body: ReactNode = null;

  if (step === "tip") {
    body = (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["HAM_ALTIN", "Ürün", "Hazır / ham altın vitrin"],
              ["MONTUR", "Montür", "Full, baş, gövde veya baş+gövde"],
              ["TAS", "Taş", "Stok taş — karat ve kesim"],
            ] as const
          ).map(([k, t, d]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                if (k !== "MONTUR") setMonturMode(null);
              }}
              className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left ${
                kind === k ? "border-foreground bg-muted/40" : "border-border"
              }`}
            >
              {k === "MONTUR" ? (
                <MonturRingIcon className="h-12 w-10 text-foreground/80" />
              ) : k === "TAS" ? (
                <ShapeIcon kod="ROUND" className="h-10 w-10" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                  Ü
                </span>
              )}
              <span className="text-sm font-semibold">{t}</span>
              <span className="text-[11px] text-muted-foreground">{d}</span>
            </button>
          ))}
        </div>
        <FieldErr msg={fieldErrors.kind} />
        {kind === "MONTUR" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["FULL", "Tam montür"],
                ["HEAD_BAND", "Baş + gövde"],
                ["HEAD", "Sadece baş"],
                ["BAND", "Sadece gövde"],
              ] as const
            ).map(([kod, t]) => (
              <button
                key={kod}
                type="button"
                onClick={() => setMonturMode(kod)}
                className={`rounded-lg border p-3 text-left text-sm ${
                  monturMode === kod ? "border-foreground bg-muted/50" : "border-border"
                }`}
              >
                {t}
              </button>
            ))}
            <FieldErr msg={fieldErrors.monturMode} />
          </div>
        ) : null}
      </div>
    );
  } else if (step === "kimlik") {
    body = (
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {isPlatform ? (
          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Sahiplik firması (tedarikçi) — alıcı katalogda görmez.
            </p>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {tedFirmalar.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSahiplikFirmaId(f.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    sahiplikFirmaId === f.id ? "border-foreground bg-muted/50" : "border-border"
                  }`}
                >
                  <div className="font-semibold">{f.ad}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {f.kod || `#${f.id}`}
                  </div>
                </button>
              ))}
            </div>
            <FieldErr msg={fieldErrors.sahiplik} />
          </div>
        ) : (
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Firma: {lockedFirma?.ad || "Kendi firma"}
          </p>
        )}
        <label className="text-[11px] text-muted-foreground sm:col-span-2">
          Ad
          <input
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
          <FieldErr msg={fieldErrors.ad} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Kategori
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={kategoriId === "" ? "" : String(kategoriId)}
            onChange={(e) => setKategoriId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Seçin…</option>
            {aktifCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tam_ad || c.ad}
              </option>
            ))}
          </select>
          <FieldErr msg={fieldErrors.kategori_id} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Ölçü tipi
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={olcuTipi}
            onChange={(e) => setOlcuTipi(e.target.value)}
          >
            <option value="">Ölçüsüz</option>
            {(refs?.olcu_tipleri ?? []).map((o) => (
              <option key={o.kod} value={o.kod}>
                {o.ad}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2">
          <input
            type="checkbox"
            checked={renkEkseni}
            onChange={(e) => setRenkEkseni(e.target.checked)}
          />
          Renk ekseni (varyant kırılımı)
        </label>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {kind === "TAS" ? (
          <>
            {!tasTipleri.length ? (
              <RefsEmpty label="Taş tipleri" grup="tas-tipi" />
            ) : (
              <label className="block text-[11px] text-muted-foreground">
                Taş tipi
                <select
                  className="mt-1 h-9 w-full max-w-sm rounded-md border border-border bg-background px-2 text-xs"
                  value={tasTipId === "" ? "" : String(tasTipId)}
                  onChange={(e) => setTasTipId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Seçin…</option>
                  {tasTipleri.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.ad || t.kod}
                    </option>
                  ))}
                </select>
                <FieldErr msg={fieldErrors.tas_tipi} />
              </label>
            )}
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                Kesim
              </h4>
              {kesimGrid([kesimKod], (k) => setKesimKod(k))}
              <FieldErr msg={fieldErrors.kesim} />
            </div>
            <label className="block max-w-xs text-[11px] text-muted-foreground">
              Karat (ct)
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={karat}
                onChange={(e) => setKarat(e.target.value)}
              />
              <FieldErr msg={fieldErrors.karat} />
            </label>
          </>
        ) : kind === "MONTUR" && monturMode === "HEAD_BAND" ? (
          <>
            <h4 className="text-sm font-semibold">Baş parçası</h4>
            {metalBlock("h_head_", hbHeadMetal, setHbHeadMetal, hbHeadAyar, setHbHeadAyar, hbHeadRenk, setHbHeadRenk)}
            {!stiller.length ? (
              <RefsEmpty label="Stiller" grup="stil" />
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">Baş stili</p>
                <StyleGrid options={stiller} value={hbHeadBas} onChange={setHbHeadBas} />
                <FieldErr msg={fieldErrors.h_head_stil} />
              </>
            )}
            <label className="block max-w-xs text-[11px] text-muted-foreground">
              Gram
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={hbHeadGram}
                onChange={(e) => setHbHeadGram(e.target.value)}
              />
              <FieldErr msg={fieldErrors.h_head_gram} />
            </label>
            <div>
              <p className="mb-2 text-[11px] text-muted-foreground">Yuva / izinli kesimler</p>
              {kesimGrid(hbHeadIzinli, (k) =>
                toggleIzinli(hbHeadIzinli, k, setHbHeadIzinli)
              )}
              <div className="mt-2 grid grid-cols-3 gap-2 max-w-md">
                <input
                  className="h-9 rounded-md border border-border px-2 text-xs"
                  placeholder="Yuva"
                  value={hbHeadYuva}
                  onChange={(e) => setHbHeadYuva(e.target.value)}
                />
                <input
                  className="h-9 rounded-md border border-border px-2 text-xs"
                  placeholder="Min ct"
                  value={hbHeadKmin}
                  onChange={(e) => setHbHeadKmin(e.target.value)}
                />
                <input
                  className="h-9 rounded-md border border-border px-2 text-xs"
                  placeholder="Max ct"
                  value={hbHeadKmax}
                  onChange={(e) => setHbHeadKmax(e.target.value)}
                />
              </div>
            </div>
            <hr className="border-border" />
            <h4 className="text-sm font-semibold">Gövde parçası</h4>
            {metalBlock("h_band_", hbBandMetal, setHbBandMetal, hbBandAyar, setHbBandAyar, hbBandRenk, setHbBandRenk)}
            {!stiller.length ? (
              <RefsEmpty label="Stiller" grup="stil" />
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">Gövde stili</p>
                <StyleGrid options={stiller} value={hbBandGovde} onChange={setHbBandGovde} />
                <FieldErr msg={fieldErrors.h_band_stil} />
              </>
            )}
            <label className="block max-w-xs text-[11px] text-muted-foreground">
              Gram
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={hbBandGram}
                onChange={(e) => setHbBandGram(e.target.value)}
              />
              <FieldErr msg={fieldErrors.h_band_gram} />
            </label>
          </>
        ) : (
          <>
            {metalBlock("", metalId, setMetalId, ayarId, setAyarId, metalRenkId, setMetalRenkId)}
            {needsHeadStyle ? (
              <div>
                {!stiller.length ? (
                  <RefsEmpty label="Stiller" grup="stil" />
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">Baş stili</p>
                    <StyleGrid options={stiller} value={basStil} onChange={setBasStil} />
                    <FieldErr msg={fieldErrors.bas_stil} />
                  </>
                )}
              </div>
            ) : null}
            {needsBandStyle ? (
              <div>
                {!stiller.length ? (
                  <RefsEmpty label="Stiller" grup="stil" />
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">Gövde stili</p>
                    <StyleGrid options={stiller} value={govdeStil} onChange={setGovdeStil} />
                    <FieldErr msg={fieldErrors.govde_stil} />
                  </>
                )}
              </div>
            ) : null}
            {needsSocket ? (
              <div>
                <p className="mb-2 text-[11px] text-muted-foreground">Yuva / uyumluluk</p>
                {kesimGrid(izinli, (k) => toggleIzinli(izinli, k, setIzinli))}
                <div className="mt-2 grid grid-cols-3 gap-2 max-w-md">
                  <input
                    className="h-9 rounded-md border border-border px-2 text-xs"
                    placeholder="Yuva adedi"
                    value={yuva}
                    onChange={(e) => setYuva(e.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-border px-2 text-xs"
                    placeholder="Min ct"
                    value={karatMin}
                    onChange={(e) => setKaratMin(e.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-border px-2 text-xs"
                    placeholder="Max ct"
                    value={karatMax}
                    onChange={(e) => setKaratMax(e.target.value)}
                  />
                </div>
                <FieldErr msg={fieldErrors.yuva || fieldErrors.kesim || fieldErrors.karat} />
              </div>
            ) : null}
            <label className="block max-w-xs text-[11px] text-muted-foreground">
              Brüt gram
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={gram}
                onChange={(e) => setGram(e.target.value)}
              />
              <FieldErr msg={fieldErrors.gram} />
            </label>
          </>
        )}
        <label className="block max-w-xs text-[11px] text-muted-foreground">
          Fiyat tipi
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={fiyatTipi}
            onChange={(e) => setFiyatTipi(e.target.value)}
          >
            <option value="">Seçin…</option>
            {fiyatTipleri.map((f) => (
              <option key={f.kod} value={f.kod}>
                {f.ad || f.kod}
              </option>
            ))}
          </select>
          <FieldErr msg={fieldErrors.fiyat_tipi} />
        </label>
      </div>
    );
  }

  const stepTitle = useMemo(
    () =>
      ({
        tip: "1 · Tür",
        kimlik: "2 · Kimlik",
        teknik: "3 · Teknik",
      })[step],
    [step]
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Yeni ürün</DialogTitle>
          <DialogDescription>
            {stepTitle} — kayıt tek istekte oluşturulur, hazırlık workspace’te
            tamamlanır.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1" aria-hidden>
          {steps.map((id, i) => (
            <span
              key={id}
              className={`h-1.5 flex-1 rounded-full ${
                i <= stepIdx ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="py-2">{body}</div>
        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" disabled={busy || stepIdx === 0} onClick={back}>
            Geri
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => close(false)}>
              İptal
            </Button>
            {step === "teknik" ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
                {busy ? "Kaydediliyor…" : "Oluştur"}
              </Button>
            ) : kind ? (
              <Button type="button" size="sm" disabled={busy || !canNext} onClick={next}>
                İleri
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}