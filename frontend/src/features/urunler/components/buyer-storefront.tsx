"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Gem, ShoppingCart, Eye } from "lucide-react";
import type { BuyerCatalogDetail, BuyerCatalogItem } from "../types";
import {
  isQuoteExpired,
  QuoteCountdown,
} from "@/components/commerce/quote-countdown";
import { formatGram, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type CardPriceState = {
  loading?: boolean;
  price?: string;
  currency?: string;
  quoteId?: number;
  gram?: string | null;
  expiresAt?: string | null;
  adding?: boolean;
  added?: boolean;
  error?: string;
};

type QuoteLineState = {
  loading?: boolean;
  price?: string;
  currency?: string;
  quoteId?: number;
  expiresAt?: string | null;
  error?: string;
  adding?: boolean;
  added?: boolean;
};

function ProductImage({
  src,
  alt,
  className = "",
  size = "card",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  size?: "card" | "hero" | "thumb";
}) {
  const ratio =
    size === "hero"
      ? "aspect-[4/5] sm:aspect-square"
      : size === "thumb"
        ? "aspect-square"
        : "aspect-square";

  return (
    <div
      className={`relative w-full overflow-hidden bg-[linear-gradient(160deg,#f7f5f2_0%,#efeae3_55%,#e8e2d8_100%)] ${ratio} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain p-3 sm:p-4"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
          <Gem className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.25} />
          <span className="text-[10px] tracking-wide uppercase">Görsel yok</span>
        </div>
      )}
    </div>
  );
}

export function BuyerCatalogGrid({
  items,
  prices,
  canQuote,
  channelSelected,
  onOpen,
  onAddToCart,
}: {
  items: BuyerCatalogItem[];
  prices: Record<number, CardPriceState>;
  canQuote: boolean;
  channelSelected: boolean;
  onOpen: (id: number) => void;
  onAddToCart: (item: BuyerCatalogItem, quoteId: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
      {items.map((item) => {
        const purchasable = Boolean(item.varsayilan_varyant_id) && item.varyant_count > 0;
        const price = prices[item.id];
        const metalAyar = [item.metal, item.ayar].filter(Boolean).join(" · ");
        const measure =
          item.gram != null && item.gram !== ""
            ? formatGram(item.gram)
            : item.varyant_count > 1
              ? `${item.varyant_count} ölçü`
              : null;

        return (
          <article
            key={item.id}
            className="group flex flex-col rounded-[10px] border border-border/80 bg-card shadow-[0_1px_2px_rgba(20,16,12,0.04)] overflow-hidden transition-[box-shadow,transform] hover:shadow-[0_8px_24px_rgba(20,16,12,0.08)] hover:-translate-y-0.5"
          >
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${item.ad} detayını aç`}
            >
              <ProductImage src={item.kapak_url} alt={item.ad} />
              <div className="flex flex-col gap-1.5 px-3 pt-3 pb-2 sm:px-3.5">
                <div className="font-mono text-[10px] text-muted-foreground tracking-wide">
                  {item.platform_kodu || "—"}
                </div>
                <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2 min-h-[2.5rem]">
                  {item.ad}
                </h3>
                <div className="text-[11px] text-muted-foreground line-clamp-1">
                  {metalAyar || item.kategori || "—"}
                </div>
                {measure ? (
                  <div className="text-[11px] font-mono tabular-nums text-muted-foreground">
                    {measure}
                  </div>
                ) : null}
              </div>
            </button>

            <div className="mt-auto flex flex-col gap-2 px-3 pb-3 sm:px-3.5">
              <div className="min-h-[1.5rem]">
                {!purchasable ? (
                  <span className="text-[11px] text-muted-foreground">
                    Satışa hazır değil
                  </span>
                ) : !canQuote ? (
                  <span className="text-[11px] text-muted-foreground">
                    Fiyat için yetki gerekli
                  </span>
                ) : !channelSelected ? (
                  <span className="text-[11px] text-muted-foreground">
                    Satış kanalı seçin
                  </span>
                ) : price?.loading ? (
                  <span className="text-[11px] text-muted-foreground animate-pulse">
                    Fiyat hesaplanıyor…
                  </span>
                ) : price?.price ? (
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold font-mono tabular-nums tracking-tight">
                      {formatMoney(price.price, price.currency || "TRY")}
                    </div>
                    {price.expiresAt ? (
                      <QuoteCountdown expiresAt={price.expiresAt} />
                    ) : null}
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {price?.error || "Fiyat için teklif alın"}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs gap-1"
                  onClick={() => onOpen(item.id)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  İncele
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 text-xs gap-1"
                  disabled={
                    !purchasable ||
                    !canQuote ||
                    !channelSelected ||
                    !price?.quoteId ||
                    !price?.price ||
                    Boolean(price?.adding) ||
                    Boolean(price?.added) ||
                    isQuoteExpired(price?.expiresAt)
                  }
                  onClick={() => {
                    if (price?.quoteId) onAddToCart(item, price.quoteId);
                  }}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {price?.added
                    ? "Eklendi"
                    : price?.adding
                      ? "Ekleniyor…"
                      : "Sipariş Ver"}
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function BuyerProductDetailView({
  detail,
  loading,
  selectedVariantId,
  onSelectVariant,
  quoteState,
  canQuote,
  channelSelected,
  onRetryQuote,
  onAddToCart,
}: {
  detail: BuyerCatalogDetail | null;
  loading: boolean;
  selectedVariantId: number | null;
  onSelectVariant: (id: number) => void;
  quoteState: Record<number, QuoteLineState>;
  canQuote: boolean;
  channelSelected: boolean;
  onRetryQuote: (variantId: number) => void;
  onAddToCart: (variantId: number, quoteId: number) => void;
}) {
  const images = useMemo(() => {
    if (!detail) return [] as Array<{ id: number; url: string; alt: string }>;
    const all = detail.gorseller || [];
    const forVariant = selectedVariantId
      ? all.filter((g) => g.varyant_id === selectedVariantId && g.url)
      : [];
    const general = all.filter((g) => !g.varyant_id && g.url);
    const pool = forVariant.length ? forVariant : general.length ? general : all.filter((g) => g.url);
    const fromGallery = pool.map((g) => ({
      id: g.id,
      url: g.url!,
      alt: g.alt_metin || detail.ad,
    }));
    if (fromGallery.length) return fromGallery;
    if (detail.kapak_url) {
      return [{ id: 0, url: detail.kapak_url, alt: detail.ad }];
    }
    return [];
  }, [detail, selectedVariantId]);

  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => {
    setActiveImage(0);
  }, [detail?.id, selectedVariantId]);
  const activeSrc = images[Math.min(activeImage, Math.max(0, images.length - 1))]?.url;

  const stokLabel =
    detail?.stok_durumu === "var"
      ? "Stokta var"
      : detail?.stok_durumu === "siparise_ozel"
        ? "Siparişe özel"
        : detail?.stok_durumu === "yok"
          ? "Stokta yok"
          : null;

  const selected = detail?.varyantlar.find((v) => v.id === selectedVariantId);
  const st = selectedVariantId != null ? quoteState[selectedVariantId] : undefined;
  const purchasable = (detail?.varyantlar.length ?? 0) > 0;
  const metalAyar = [detail?.metal, detail?.ayar].filter(Boolean).join(" · ");

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Ürün yükleniyor…
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
      <div className="space-y-3">
        <ProductImage src={activeSrc} alt={detail.ad} size="hero" className="rounded-[10px] border border-border/70" />
        {images.length > 1 ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {images.map((img, idx) => (
              <button
                key={img.id || img.url}
                type="button"
                onClick={() => setActiveImage(idx)}
                className={`rounded-[6px] overflow-hidden border ${
                  idx === activeImage ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border"
                }`}
                aria-label={`Görsel ${idx + 1}`}
              >
                <ProductImage src={img.url} alt={img.alt} size="thumb" className="!p-1" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <div className="space-y-1.5">
          <div className="font-mono text-[11px] text-muted-foreground tracking-wide">
            {detail.platform_kodu || "—"}
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
            {detail.ad}
          </h2>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {detail.kategori ? (
              <Badge variant="outline" className="text-[10px]">
                {detail.kategori}
              </Badge>
            ) : null}
            {metalAyar ? (
              <Badge variant="secondary" className="text-[10px]">
                {metalAyar}
              </Badge>
            ) : null}
            {detail.milyem ? (
              <Badge variant="outline" className="text-[10px] font-mono">
                milyem {detail.milyem}
              </Badge>
            ) : null}
            {stokLabel ? (
              <Badge
                variant={
                  detail.stok_durumu === "var"
                    ? "success"
                    : detail.stok_durumu === "siparise_ozel"
                      ? "secondary"
                      : "outline"
                }
                className="text-[10px]"
              >
                {stokLabel}
              </Badge>
            ) : null}
          </div>
        </div>

        {detail.aciklama ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{detail.aciklama}</p>
        ) : null}

        {(detail.taslar?.length ?? 0) > 0 ? (
          <div className="rounded-[8px] border border-border bg-muted/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Taşlar
            </div>
            <ul className="space-y-1 text-xs">
              {detail.taslar!.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span>{t.tas_tipi}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {t.adet} adet
                    {t.karat ? ` · ${t.karat} ct` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!purchasable ? (
          <div className="rounded-[8px] border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            Bu ürün için aktif varyant bulunmuyor; siparişe eklenemez.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Ölçü / varyant
              </span>
              <select
                className="h-10 w-full rounded-[8px] border border-border bg-background px-3 text-sm"
                value={selectedVariantId ?? ""}
                onChange={(e) => onSelectVariant(Number(e.target.value))}
              >
                {detail.varyantlar.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.sku, v.renk, v.beden, v.gram ? `${v.gram}g` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </label>

            {selected ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-[8px] border border-border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">Renk</div>
                  <div className="mt-0.5 font-medium">{selected.renk || "—"}</div>
                </div>
                <div className="rounded-[8px] border border-border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">Ölçü</div>
                  <div className="mt-0.5 font-medium">{selected.beden || "—"}</div>
                </div>
                <div className="rounded-[8px] border border-border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">Gram</div>
                  <div className="mt-0.5 font-mono tabular-nums">
                    {formatGram(selected.gram)}
                  </div>
                </div>
                <div className="rounded-[8px] border border-border px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">Fiyat tipi</div>
                  <div className="mt-0.5 font-medium">
                    {detail.fiyat_tipi === "sabit" ? "Sabit" : "Gram bazlı"}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-[10px] border border-border bg-[linear-gradient(180deg,#fff_0%,#faf8f5_100%)] px-4 py-3 space-y-3">
              {!canQuote ? (
                <p className="text-sm text-muted-foreground">Fiyat görüntüleme yetkiniz yok.</p>
              ) : !channelSelected ? (
                <p className="text-sm text-muted-foreground">
                  Anlık fiyat için önce satış kanalı seçin.
                </p>
              ) : st?.loading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Fiyat hesaplanıyor…</p>
              ) : st?.price ? (
                <>
                  <div className="text-2xl font-semibold font-mono tabular-nums tracking-tight">
                    {formatMoney(st.price, st.currency || "TRY")}
                  </div>
                  {st.expiresAt ? (
                    <QuoteCountdown expiresAt={st.expiresAt} />
                  ) : null}
                  {st.added ? (
                    <Badge variant="success" className="gap-1 text-[11px]">
                      <Check className="h-3 w-3" />
                      Sepete eklendi
                    </Badge>
                  ) : (
                    <Button
                      className="w-full h-10 gap-2"
                      disabled={
                        !st.quoteId ||
                        Boolean(st.adding) ||
                        isQuoteExpired(st.expiresAt)
                      }
                      onClick={() => {
                        if (selectedVariantId && st.quoteId) {
                          onAddToCart(selectedVariantId, st.quoteId);
                        }
                      }}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {st.adding ? "Ekleniyor…" : "Sipariş Ver"}
                    </Button>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {st?.error || "Fiyat şu an üretilemedi."}
                  </p>
                  {selectedVariantId ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onRetryQuote(selectedVariantId)}
                    >
                      Fiyatı yenile
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
