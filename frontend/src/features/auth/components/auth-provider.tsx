"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";
import { clearClientSession } from "@/lib/session-clear";
import { authService } from "../services/auth-service";
import { DomainLoading } from "@/components/route-states";

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  error: string | null;
  mfaPending: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<MeResponse | null>;
  setSessionUser: (user: MeResponse | null, opts?: { mfaPending?: boolean }) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set(["/login", "/reset-password", "/invite"]);

function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (PUBLIC_PATHS.has(raw.split("?")[0] || "")) return null;
  return raw;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState(false);

  const setSessionUser = useCallback(
    (next: MeResponse | null, opts?: { mfaPending?: boolean }) => {
      setUser(next);
      setMfaPending(Boolean(opts?.mfaPending));
      setError(null);
      setLoading(false);
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await authService.getMe();
      setUser(me);
      setMfaPending(false);
      setError(null);
      return me;
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.problem.code === "mfa_required") {
        setMfaPending(true);
        setError(null);
        return null;
      }
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setMfaPending(false);
        setError(null);
        return null;
      }
      setMfaPending(false);
      setError(err instanceof Error ? err.message : "Oturum alınamadı.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // oturum zaten düşmüş olabilir
    }
    clearClientSession(queryClient);
    setUser(null);
    setMfaPending(false);
    setError(null);
    navigate("/login", { replace: true });
  }, [navigate, queryClient]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onExpired = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { code?: string; status?: number }
        | undefined;
      clearClientSession(queryClient);
      if (detail?.code === "mfa_required") {
        setUser(null);
        setMfaPending(true);
        if (!PUBLIC_PATHS.has(pathname)) {
          const next = encodeURIComponent(`${pathname}${search}`);
          navigate(`/login?next=${next}`, { replace: true });
        }
        return;
      }
      setUser(null);
      setMfaPending(false);
      if (!PUBLIC_PATHS.has(pathname)) {
        const next = encodeURIComponent(`${pathname}${search}`);
        navigate(`/login?next=${next}`, { replace: true });
      }
    };
    window.addEventListener("taragold:auth-expired", onExpired);
    return () => window.removeEventListener("taragold:auth-expired", onExpired);
  }, [pathname, search, navigate, queryClient]);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname);

    if ((!user || mfaPending) && !isPublic) {
      const next = encodeURIComponent(`${pathname}${search}`);
      navigate(`/login?next=${next}`, { replace: true });
      return;
    }

    if (user && !mfaPending && isPublic) {
      const params = new URLSearchParams(search);
      const dest = safeReturnPath(params.get("next")) || "/";
      navigate(dest, { replace: true });
    }
  }, [loading, user, mfaPending, pathname, search, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      mfaPending,
      isAuthenticated: Boolean(user) && !mfaPending,
      refresh,
      setSessionUser,
      logout,
    }),
    [user, loading, error, mfaPending, refresh, setSessionUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext AuthProvider içinde kullanılmalıdır.");
  }
  return ctx;
}

/** Korumalı portal yüzeyi — oturum yoksa login’e yönlendirir. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuthContext();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <DomainLoading label="Oturum" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <DomainLoading label="Giriş yönlendirmesi" />
      </div>
    );
  }

  return <>{children}</>;
}
