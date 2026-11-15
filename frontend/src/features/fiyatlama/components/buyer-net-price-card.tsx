"use client";

import { formatGram, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { PriceQuote } from "../types";

/**
 * Alıcı net fiyat — yalnızca BuyerQuote alanları.
 * Marj / maliyet / tedarikçi alanları buraya eklenmez.
 * ADR-0038: gösterim tahmini; kesin fiyat sipariş onayında.
 */
export function BuyerNetPriceCard({ quote }: { quote: PriceQuote }) {
  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Tahmini fiyat</p>
          <p className="text-sm font-semibold text-foreground">
            {quote.urun || quote.varyant_sku || "Katalog Ürünü"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {quote.varyant_sku || "—"}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          TAHMİNİ
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Net toplam (tahmini)</dt>
          <dd className="text-right font-mono tabular-nums font-semibold text-foreground">
            {formatMoney(
              quote.toplam_vergisiz || (quote.birim_fiyat ? quote.birim_fiyat : null),
              quote.para_birimi
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gram başı (net)</dt>
          <dd className="text-right font-mono tabular-nums text-foreground">
            {quote.gram_basi_vergisiz
              ? formatMoney(quote.gram_basi_vergisiz, quote.para_birimi)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Has (g)</dt>
          <dd className="text-right font-mono tabular-nums">
            {quote.has_gram ? formatGram(quote.has_gram) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gram</dt>
          <dd className="text-right font-mono tabular-nums">
            {formatGram(quote.gram)}
          </dd>
        </div>
      </dl>

      <p className="text-[11px] text-muted-foreground">
        Kesin tutar sipariş onayında güncel kura göre yazılır.
      </p>
    </div>
  );
}
