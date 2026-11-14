"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RelationOption {
  value: number | string;
  label: string;
  subtitle?: string;
  disabled?: boolean;
}

export interface RelationSelectProps {
  value: number | string | null | undefined;
  onChange: (value: number | string | null, option?: RelationOption | null) => void;
  options?: RelationOption[];
  loadOptions?: (query: string) => Promise<RelationOption[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  createLabel?: string;
  onCreateNew?: () => void;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
  /** Seçili değer mevcut listede yoksa ekranda gösterilecek yedek etiket */
  selectedLabel?: string;
}

export function RelationSelect({
  value,
  onChange,
  options: staticOptions,
  loadOptions,
  placeholder = "Seçiniz…",
  searchPlaceholder = "İsim veya kod ile ara…",
  emptyText = "Kayıt bulunamadı",
  createLabel,
  onCreateNew,
  disabled = false,
  clearable = false,
  id,
  className,
  selectedLabel,
}: RelationSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<RelationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cachedSelected, setCachedSelected] = useState<RelationOption | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isAsync = Boolean(loadOptions);
  const sourceOptions = isAsync ? asyncOptions : staticOptions ?? [];

  const filteredOptions = useMemo(() => {
    if (isAsync) return sourceOptions;
    const q = query.trim().toLowerCase();
    if (!q) return sourceOptions;
    return sourceOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(q))
    );
  }, [isAsync, sourceOptions, query]);

  useEffect(() => {
    if (!open || !loadOptions) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const timer = setTimeout(() => {
      loadOptions(query.trim())
        .then((res) => {
          if (!cancelled) {
            setAsyncOptions(res);
            setActiveIndex(0);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : "Seçenekler yüklenemedi.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, loadOptions]);

  // İlk renderda seçili değer için etiket çözümü gerekiyorsa async yükle
  useEffect(() => {
    if (!loadOptions || value === null || value === undefined || value === "" || value === 0) {
      return;
    }
    const found = asyncOptions.find((o) => String(o.value) === String(value));
    if (found) {
      setCachedSelected(found);
      return;
    }
    if (selectedLabel) return;
    let cancelled = false;
    loadOptions("")
      .then((res) => {
        if (!cancelled) {
          setAsyncOptions(res);
          const match = res.find((o) => String(o.value) === String(value));
          if (match) setCachedSelected(match);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, loadOptions, selectedLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const hasValue =
    value !== null && value !== undefined && value !== "" && value !== 0;

  const currentOption = useMemo(() => {
    if (!hasValue) return null;
    return (
      sourceOptions.find((o) => String(o.value) === String(value)) ||
      (cachedSelected && String(cachedSelected.value) === String(value)
        ? cachedSelected
        : null)
    );
  }, [hasValue, sourceOptions, value, cachedSelected]);

  const displayLabel = currentOption?.label || (hasValue ? selectedLabel : undefined);

  const handleSelect = (opt: RelationOption) => {
    if (opt.disabled) return;
    setCachedSelected(opt);
    onChange(opt.value, opt);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        if (!disabled) setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length > 0
          ? (prev - 1 + filteredOptions.length) % filteredOptions.length
          : 0
      );
      return;
    }
    if (e.key === "Enter" && filteredOptions[activeIndex]) {
      e.preventDefault();
      handleSelect(filteredOptions[activeIndex]);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)} onKeyDown={handleKeyDown}>
      <div className="relative flex items-center">
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-[6px] border border-border bg-background px-3 py-1.5 text-sm text-left ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            clearable && hasValue ? "pr-14" : "pr-8"
          )}
        >
          <span
            className={cn(
              "truncate",
              displayLabel ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {displayLabel || placeholder}
          </span>
        </button>

        <div className="pointer-events-none absolute right-2.5 flex items-center gap-1">
          {clearable && hasValue && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Seçimi temizle"
              onClick={(e) => {
                e.stopPropagation();
                setCachedSelected(null);
                onChange(null, null);
              }}
              className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground opacity-60" />
        </div>
      </div>

      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] rounded-[8px] border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <div className="flex items-center border-b border-border px-2.5 py-2 gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={searchPlaceholder}
              className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Aranıyor…</span>
              </div>
            ) : loadError ? (
              <div className="px-3 py-4 text-center text-xs text-destructive">
                {loadError}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  {onCreateNew && createLabel
                    ? `${emptyText} — ${createLabel}`
                    : emptyText}
                </p>
                {onCreateNew ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setOpen(false);
                      onCreateNew();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{createLabel || "Yeni Kayıt Ekle"}</span>
                  </Button>
                ) : null}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = hasValue && String(opt.value) === String(value);
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[5px] px-2.5 py-2 text-left text-xs transition-colors",
                      isActive ? "bg-muted text-foreground" : "text-foreground",
                      opt.disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{opt.label}</div>
                      {opt.subtitle ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {opt.subtitle}
                        </div>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {onCreateNew && filteredOptions.length > 0 ? (
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="flex w-full items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{createLabel || "Yeni kayıt ekle"}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
