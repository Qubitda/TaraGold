import type { QueryClient } from "@tanstack/react-query";

const SESSION_KEYS = [
  "taragold.session.quote_ids",
  "taragold.session.lock_ids",
] as const;

/** Logout / 401 / firma / act-as: React Query + sessionStorage temizliği. */
export function clearClientSession(queryClient: QueryClient): void {
  queryClient.clear();
  if (typeof window === "undefined") return;
  for (const key of SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // private mode / quota
    }
  }
}
