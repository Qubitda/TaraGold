"use client";

import { Eye, Gem, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatGram } from "@/lib/format";
import type { MonturCatalogItem, MonturCatalogVariant, TasCatalogItem } from "../types";
import { MonturRingIcon, ShapeIcon, shapeLabel } from "./stone-shape-icons";

type Kind = "montur" | "tas";

type CatalogRow = {
  id: number;
  ad: string;
  platform_kodu?: string;
  kategori?: string;
  ayar?: string;
  metal?: string;
  kapak_url?: string | null;
  varyantlar: MonturCatalogVariant[];
};

function normalizeMontur(item: MonturCatalogItem): CatalogRow {
  return {
    id: item.id,
    ad: item.ad,
    platform_kodu: item.platform_kodu,
    kategori: item.kategori,
    ayar: item.ayar,
    metal: item.metal,
    kapak_url: item.kapak_url,
    varyantlar: item.varyantlar ?? [],
  };
}

function normalizeTas(item: TasCatalogItem): CatalogRow {
  return {
    id: item.id,
    ad: item.ad,
    platform_kodu: item.platform_kodu || item.kod,
    kategori: item.kategori,
    ayar: item.ayar,
    kapak_url: undefined,
    varyantlar: item.varyantlar ?? [],
  };
}

function primaryVariant(vars: MonturCatalogVariant[]): MonturCatalogVariant | null {
  return vars[0] ?? null;
}

function CardMedia({
  kind,
  item,
}: {
  kind: Kind;
  item: CatalogRow;
}) {
  const v = primaryVariant(item.varyantlar);
  if (item.kapak_url) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-[linear-gradient(160deg,#f7f5f2_0%,#efeae3_55%,#e8e2d8_100%)]">
        <img
          src={item.kapak_url}
          alt={item.ad}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain p-3 sm:p-4"
        />
      </div>
    );
  }

  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[linear-gradient(160deg,#f7f5f2_0%,#efeae3_55%,#e8e2d8_100%)] text-foreground/70">
      {kind === "montur" ? (
        <MonturRingIcon className="h-24 w-20 sm:h-28 sm:w-24" title={item.ad} />
      ) : v?.kesim_kod ? (
        <ShapeIcon
          kod={v.kesim_kod}
          className="h-20 w-20 sm:h-24 sm:w-24"
          title={shapeLabel(v.kesim_kod)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
          <Gem className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.25} />
          <span className="text-[10px] uppercase tracking-wide">Görsel yok</span>
        </div>
      )}
    </div>
  );
}

function CardMeta({ kind, item }: { kind: Kind; item: CatalogRow }) {
  const v = primaryVariant(item.varyantlar);
  const metalAyar = [item.metal, item.ayar].filter(Boolean).join(" · ");

  if (kind === "montur") {
    const izinli = (v?.izinli_kesimler ?? []).slice(0, 3);
    const karat =
      v?.karat_min != null && v?.karat_max != null
        ? `${v.karat_min}–${v.karat_max} ct`
        : null;
    return (
      <>
        <div className="text-[11px] text-muted-foreground line-clamp-1">
          {metalAyar || item.kategori || "Montür"}
        </div>
        <div className="flex flex-wrap gap-1">
          {v?.gram ? (
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
              {formatGram(v.gram)}
            </span>
          ) : null}
          {karat ? (
            <span className="text-[11px] font-mono text-muted-foreground">
              {karat}
            </span>
          ) : null}
        </div>
        {izinli.length ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {izinli.map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="h-5 gap-1 px-1.5 text-[9px] font-normal"
              >
                <ShapeIcon kod={k} className="h-3.5 w-3.5" />
                {shapeLabel(k)}
              </Badge>
            ))}
            {(v?.izinli_kesimler?.length ?? 0) > 3 ? (
              <span className="text-[10px] text-muted-foreground">
                +{(v?.izinli_kesimler?.length ?? 0) - 3}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            İmalat uyumluluğu eksik
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <div className="text-[11px] text-muted-foreground line-clamp-1">
        {v?.kesim_kod
          ? shapeLabel(v.kesim_kod)
          : item.kategori || "Taş"}
      </div>
      <div className="text-[11px] font-mono tabular-nums text-muted-foreground">
        {v?.karat != null && v.karat !== ""
          ? `${v.karat} ct`
          : item.varyantlar.length > 1
            ? `${item.varyantlar.length} seçenek`
            : "—"}
        {v?.sku ? ` · ${v.sku}` : ""}
      </div>
    </>
  );
}

export function MonturTasCatalogGrid({
  kind,
  items,
  onOpen,
  onCompose,
}: {
  kind: Kind;
  items: MonturCatalogItem[] | TasCatalogItem[];
  onOpen: (id: number) => void;
  onCompose: (id: number) => void;
}) {
  const rows =
    kind === "montur"
      ? (items as MonturCatalogItem[]).map(normalizeMontur)
      : (items as TasCatalogItem[]).map(normalizeTas);

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4"
      data-testid={`catalog-grid-${kind}`}
    >
      {rows.map((item) => (
        <article
          key={item.id}
          className="group flex flex-col overflow-hidden rounded-[10px] border border-border/80 bg-card shadow-[0_1px_2px_rgba(20,16,12,0.04)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,16,12,0.08)]"
        >
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${item.ad} detayını aç`}
          >
            <CardMedia kind={kind} item={item} />
            <div className="flex flex-col gap-1.5 px-3 pb-2 pt-3 sm:px-3.5">
              <div className="font-mono text-[10px] tracking-wide text-muted-foreground">
                {item.platform_kodu || "—"}
              </div>
              <h3 className="min-h-[2.5rem] line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                {item.ad}
              </h3>
              <CardMeta kind={kind} item={item} />
            </div>
          </button>

          <div className="mt-auto flex gap-2 px-3 pb-3 sm:px-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1 text-xs"
              onClick={() => onOpen(item.id)}
            >
              <Eye className="h-3.5 w-3.5" />
              İncele
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 gap-1 text-xs"
              onClick={() => onCompose(item.id)}
            >
              <Wrench className="h-3.5 w-3.5" />
              İmalat
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
