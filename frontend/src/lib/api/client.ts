import type {
  CsrfResponse,
  MeDashboard,
  MeResponse,
  Paginated,
  ProblemDetail,
} from "./types";

const API_PREFIX = "/api/v1";

/** Login/logout/CSRF/MFA — Idempotency-Key gönderilmez (ADR-0017 NX-6). */
const IDEMPOTENCY_EXEMPT = [
  "/auth/login/",
  "/auth/logout/",
  "/auth/csrf/",
  "/auth/mfa/verify/",
  "/auth/mfa/resend/",
  "/auth/password-reset/",
  "/auth/password-reset/confirm/",
  "/payments/webhook/",
];

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback (HTTP LAN / eski tarayıcı)
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function unwrapResults<T>(
  data: Paginated<T> | T[] | null | undefined
): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title || `HTTP ${problem.status}`);
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`
    )
  );
  return match?.[1] != null ? decodeURIComponent(match[1]) : null;
}

async function parseProblem(res: Response): Promise<ProblemDetail> {
  try {
    const body = (await res.json()) as Partial<ProblemDetail>;
    return {
      type: body.type,
      title: body.title,
      status: body.status ?? res.status,
      detail: body.detail,
      code: body.code,
      request_id: body.request_id,
      errors: body.errors,
    };
  } catch {
    return { status: res.status, title: res.statusText || "Sunucu Hatası" };
  }
}

function needsIdempotency(path: string, method: string): boolean {
  if (method === "GET" || method === "HEAD") return false;
  return !IDEMPOTENCY_EXEMPT.some(
    (p) => path === p || path.startsWith(p.replace(/\/$/, ""))
  );
}

/**
 * NX-1: session cookie + CSRF; tarayıcıda Token yok.
 * Başarısızlık sessiz yutulmaz — ApiError fırlatır.
 */
function emitCsrfFailed(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("taragold:csrf-failed", { detail: { message } })
  );
}

let csrfInflight: Promise<string> | null = null;

export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie("csrftoken");
  if (existing) return existing;
  if (csrfInflight) return csrfInflight;

  csrfInflight = (async () => {
    let res: Response;
    try {
      res = await fetch(`${API_PREFIX}/auth/csrf/`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      const message = "CSRF isteği ağ hatası.";
      emitCsrfFailed(message);
      throw new ApiError({
        status: 0,
        title: "CSRF",
        detail: message,
        code: "csrf_network",
      });
    }

    if (!res.ok) {
      const problem = await parseProblem(res);
      emitCsrfFailed(problem.detail || problem.title || "CSRF alınamadı.");
      throw new ApiError(problem);
    }
    const data = (await res.json()) as CsrfResponse;
    if (!data.csrf_token) {
      const problem: ProblemDetail = {
        status: 500,
        title: "CSRF",
        detail: "CSRF token yanıtta yok.",
        code: "csrf_missing",
      };
      emitCsrfFailed(problem.detail!);
      throw new ApiError(problem);
    }
    return data.csrf_token;
  })().finally(() => {
    csrfInflight = null;
  });

  return csrfInflight;
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  /** Verilmezse yazma isteklerinde otomatik üretilir (exempt path hariç). */
  idempotencyKey?: string;
  headers?: Record<string, string>;
  /** true ise Idempotency-Key gönderilmez (nadir; varsayılan otomatik). */
  skipIdempotency?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  const isMutating = method !== "GET" && method !== "HEAD";

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (isMutating) {
    if (
      !isFormData &&
      !headers["Content-Type"] &&
      options.body !== undefined
    ) {
      headers["Content-Type"] = "application/json";
    }
    if (isFormData && headers["Content-Type"]) {
      delete headers["Content-Type"];
    }
    headers["X-CSRFToken"] = await ensureCsrfToken();

    if (
      !options.skipIdempotency &&
      needsIdempotency(path, method) &&
      !headers["Idempotency-Key"]
    ) {
      headers["Idempotency-Key"] =
        options.idempotencyKey || newIdempotencyKey();
    } else if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
  }

  const res = await fetch(`${API_PREFIX}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    body:
      options.body === undefined
        ? undefined
        : isFormData || typeof options.body === "string"
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const problem = await parseProblem(res);
    const isAuthProbe =
      path === "/me/" ||
      path === "/auth/login/" ||
      path === "/auth/csrf/" ||
      path === "/auth/logout/" ||
      path.startsWith("/auth/password-reset") ||
      path.startsWith("/auth/mfa/");

    if (
      typeof window !== "undefined" &&
      !isAuthProbe &&
      (res.status === 401 ||
        (res.status === 403 && problem.code === "mfa_required"))
    ) {
      window.dispatchEvent(
        new CustomEvent("taragold:auth-expired", {
          detail: { status: res.status, code: problem.code, path },
        })
      );
    }
    throw new ApiError(problem);
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      status: res.status,
      title: "Geçersiz JSON",
      detail: "Sunucu yanıtı JSON değil.",
      code: "invalid_json",
    });
  }
}

export function login(username: string, password: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/login/", {
    method: "POST",
    body: { username, password },
    skipIdempotency: true,
  });
}

export function verifyMfa(code: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/mfa/verify/", {
    method: "POST",
    body: { code },
    skipIdempotency: true,
  });
}

export function resendMfa(): Promise<{ detail?: string; mfa_ok?: boolean }> {
  return apiFetch<{ detail?: string; mfa_ok?: boolean }>("/auth/mfa/resend/", {
    method: "POST",
    body: {},
    skipIdempotency: true,
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/logout/", {
    method: "POST",
    body: {},
    skipIdempotency: true,
  });
}

export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me/");
}

export function fetchMeDashboard(): Promise<MeDashboard> {
  return apiFetch<MeDashboard>("/me/dashboard/");
}

/**
 * Same-origin binary GET (session cookie) → Blob.
 * apiFetch JSON bekler; CSV/dosya için bunu kullan.
 */
export async function apiFetchBlob(
  path: string,
  accept = "*/*"
): Promise<Blob> {
  const headers: Record<string, string> = { Accept: accept };
  const token = readCookie("csrftoken");
  if (token) headers["X-CSRFToken"] = token;

  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    throw new ApiError(await parseProblem(res));
  }
  return res.blob();
}

/**
 * Same-origin binary/download helper (session cookie).
 */
export async function apiDownload(
  path: string,
  filename?: string
): Promise<void> {
  const headers: Record<string, string> = { Accept: "*/*" };
  const token = readCookie("csrftoken");
  if (token) headers["X-CSRFToken"] = token;

  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    throw new ApiError(await parseProblem(res));
  }

  await _saveBlob(res, filename);
}

/** POST + CSRF + Idempotency → dosya indir (proforma/irsaliye). */
export async function apiDownloadPost(
  path: string,
  body: Record<string, unknown> = {},
  filename?: string
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Content-Type": "application/json",
  };
  const token = await ensureCsrfToken();
  headers["X-CSRFToken"] = token;
  headers["Idempotency-Key"] = newIdempotencyKey();

  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ApiError(await parseProblem(res));
  }

  await _saveBlob(res, filename);
}

async function _saveBlob(res: Response, filename?: string): Promise<void> {
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  let name = filename || `download-${Date.now()}`;
  if (!filename && match?.[1] != null) {
    try {
      name = decodeURIComponent(match[1]);
    } catch {
      name = match[1];
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari: hemen revoke indirmeyi kesebilir
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
