"use client";

import React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SortOption {
  value: string;
  label: string;
}

export interface ListPageProps {
  title: string;
  description?: string;
  createLabel?: string;
  onCreate?: () => void;
  extraActions?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  sortOptions?: SortOption[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** İçerik kutusuna ek class (ör. vitrin grid için border/padding kaldırma). */
  contentClassName?: string;
  children: React.ReactNode;
}

export function ListPage({
  title,
  description,
  createLabel = "Yeni Ekle",
  onCreate,
  extraActions,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Ara…",
  filters,
  sortOptions,
  sortValue,
  onSortChange,
  loading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyTitle = "Kayıt bulunamadı",
  emptyDescription = "Arama veya filtre ölçütlerini değiştirin ya da yeni bir kayıt ekleyin.",
  page = 1,
  pageSize = 20,
  totalCount,
  onPageChange,
  onPageSizeChange,
  contentClassName,
  children,
}: ListPageProps) {
  const hasToolbar =
    Boolean(onSearchChange) ||
    Boolean(filters) ||
    Boolean(sortOptions && sortOptions.length > 0 && onSortChange);

  const totalPages =
    typeof totalCount === "number" && pageSize > 0
      ? Math.max(1, Math.ceil(totalCount / pageSize))
      : 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Başlık ve Birincil Aksiyon */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {extraActions}
          {onCreate ? (
            <Button type="button" size="sm" onClick={onCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>{createLabel}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Arama, Filtreler ve Sıralama Çubuğu */}
      {hasToolbar ? (
        <div className="flex flex-wrap items-center gap-2.5">
          {onSearchChange ? (
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-8 text-xs"
              />
            </div>
          ) : null}

          {filters}

          {sortOptions && sortOptions.length > 0 && onSortChange ? (
            <select
              value={sortValue ?? sortOptions[0]?.value ?? ""}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label="Sıralama"
              className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {/* Hata Durumu */}
      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-8 border-destructive/30"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Yeniden Dene
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* İçerik Alanı */}
      <div
        className={
          contentClassName ??
          "rounded-[8px] border border-border bg-card overflow-hidden"
        }
      >
        {loading ? (
          <div className="divide-y divide-border p-4 space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-[4px] bg-muted/60"
              />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {emptyDescription}
            </p>
            {onCreate ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCreate}
                className="mt-1 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{createLabel}</span>
              </Button>
            ) : null}
          </div>
        ) : (
          children
        )}
      </div>

      {/* Sunucu Taraflı Sayfalama Altbilgisi */}
      {typeof totalCount === "number" && onPageChange && totalCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3 tabular-nums">
            <span>
              Toplam <strong className="text-foreground">{totalCount}</strong> kayıt
              · Sayfa <strong className="text-foreground">{page}</strong> /{" "}
              {totalPages}
            </span>
            {onPageSizeChange ? (
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                aria-label="Sayfa başına kayıt"
                className="h-7 rounded-[4px] border border-border bg-background px-2 text-xs text-foreground"
              >
                <option value={10}>10 / sayfa</option>
                <option value={20}>20 / sayfa</option>
                <option value={50}>50 / sayfa</option>
              </select>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Önceki</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              <span>Sonraki</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
