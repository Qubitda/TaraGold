"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fiyatlamaService } from "../services";
import type { PriceLock, PriceQuote } from "../types";

const QUOTE_KEY = "taragold.session.quote_ids";
const LOCK_KEY = "taragold.session.lock_ids";

function readIds(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify([...new Set(ids)]));
}

export function rememberQuoteId(id: number) {
  writeIds(QUOTE_KEY, [...readIds(QUOTE_KEY), id]);
}

export function rememberLockId(id: number) {
  writeIds(LOCK_KEY, [...readIds(LOCK_KEY), id]);
}

export const fiyatlamaKeys = {
  all: ["fiyatlama"] as const,
  quotesList: (params?: Record<string, string | undefined>) =>
    [...fiyatlamaKeys.all, "quotes-list", params ?? {}] as const,
  locksList: (params?: Record<string, string | undefined>) =>
    [...fiyatlamaKeys.all, "locks-list", params ?? {}] as const,
  session: (extraQuoteIds: number[] = []) =>
    [...fiyatlamaKeys.all, "session", [...extraQuoteIds].sort((a, b) => a - b)] as const,
  quote: (id: number | string) =>
    [...fiyatlamaKeys.all, "quote", String(id)] as const,
  lock: (id: number | string) =>
    [...fiyatlamaKeys.all, "lock", String(id)] as const,
};

export function useQuotesListQuery(
  params?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: fiyatlamaKeys.quotesList(params),
    queryFn: () => fiyatlamaService.getQuotes(params),
    enabled,
  });
}

export function usePriceLocksListQuery(
  params?: Record<string, string | undefined>,
  enabled = true
) {
  return useQuery({
    queryKey: fiyatlamaKeys.locksList(params),
    queryFn: () => fiyatlamaService.getPriceLocks(params),
    enabled,
  });
}

async function loadSessionQuotesAndLocks(
  extraQuoteIds: number[] = []
): Promise<{ quotes: PriceQuote[]; locks: PriceLock[] }> {
  const quoteIds = [...new Set([...readIds(QUOTE_KEY), ...extraQuoteIds])];
  const lockIds = readIds(LOCK_KEY);

  const quoteSettled = await Promise.allSettled(
    quoteIds.map((id) => fiyatlamaService.getQuote(id))
  );
  const lockSettled = await Promise.allSettled(
    lockIds.map((id) => fiyatlamaService.getPriceLock(id))
  );

  const quotes = quoteSettled
    .filter((r): r is PromiseFulfilledResult<PriceQuote> => r.status === "fulfilled")
    .map((r) => r.value);
  const locks = lockSettled
    .filter((r): r is PromiseFulfilledResult<PriceLock> => r.status === "fulfilled")
    .map((r) => r.value);

  writeIds(
    QUOTE_KEY,
    quotes.map((q) => q.id)
  );
  writeIds(
    LOCK_KEY,
    locks.map((l) => l.id)
  );

  return { quotes, locks };
}

export function useSessionQuotesAndLocksQuery(extraQuoteIds: number[] = []) {
  return useQuery({
    queryKey: fiyatlamaKeys.session(extraQuoteIds),
    queryFn: () => loadSessionQuotesAndLocks(extraQuoteIds),
  });
}

export function useSessionQuotesAndLocks() {
  const qc = useQueryClient();
  const query = useSessionQuotesAndLocksQuery();

  const refresh = useCallback(
    async (extraQuoteIds: number[] = []) => {
      writeIds(QUOTE_KEY, [...readIds(QUOTE_KEY), ...extraQuoteIds]);
      await qc.invalidateQueries({ queryKey: fiyatlamaKeys.all });
      return qc.fetchQuery({
        queryKey: fiyatlamaKeys.session(extraQuoteIds),
        queryFn: () => loadSessionQuotesAndLocks(extraQuoteIds),
      });
    },
    [qc]
  );

  return {
    quotes: query.data?.quotes ?? [],
    locks: query.data?.locks ?? [],
    loading: query.isLoading || query.isFetching,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Fiyatlama kayıtları alınamadı."
      : null,
    refresh,
    setError: (_msg: string | null) => {},
  };
}

export function useCreatePriceLockMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quoteId: number) => fiyatlamaService.createPriceLock(quoteId),
    onSuccess: (lock) => {
      rememberLockId(lock.id);
      void qc.invalidateQueries({ queryKey: fiyatlamaKeys.all });
    },
  });
}



export function useFiyatlamaInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: fiyatlamaKeys.all });
}
