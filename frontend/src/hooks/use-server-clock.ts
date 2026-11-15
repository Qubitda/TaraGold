import { useMemo, useSyncExternalStore } from "react";

let offsetMs = 0;
let listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return offsetMs;
}

/** Backend `server_now` ile istemci saati farkını bir kez kalibre eder. */
export function calibrateServerClock(serverNowIso: string | null | undefined): void {
  if (!serverNowIso) return;
  const serverMs = Date.parse(serverNowIso);
  if (!Number.isFinite(serverMs)) return;
  const next = serverMs - Date.now();
  if (Math.abs(next - offsetMs) < 250) return;
  offsetMs = next;
  listeners.forEach((l) => l());
}

export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

export function useServerClock() {
  const offset = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  return useMemo(
    () => ({
      offsetMs: offset,
      nowMs: () => Date.now() + offset,
      now: () => new Date(Date.now() + offset),
    }),
    [offset]
  );
}
