"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { RequireAuth, useAuth } from "@/features/auth";
import { authService } from "@/features/auth/services/auth-service";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, logout, refresh } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [stoppingActAs, setStoppingActAs] = useState(false);

  const handleStopActAs = async () => {
    setStoppingActAs(true);
    try {
      await authService.stopActAs();
      await refresh();
      await queryClient.invalidateQueries();
      toast.success("Act-As sonlandırıldı", "Asıl yönetici oturumuna dönüldü.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.problem.detail || err.message
          : "Act-As sonlandırılamadı.";
      toast.error("İşlem hatası", msg);
    } finally {
      setStoppingActAs(false);
    }
  };

  return (
    <RequireAuth>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <a
          href="#portal-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[110] focus:rounded-[6px] focus:bg-card focus:px-3 focus:py-2 focus:text-xs focus:shadow-sm"
        >
          İçeriğe atla
        </a>
        <Sidebar
          capabilities={user?.capabilities}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header
            user={user}
            onLogout={() => {
              void logout();
            }}
          />

          {user?.act_as?.active && (
            <div
              className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-950 dark:text-amber-200"
              role="status"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Act-As Oturumu Aktif:{" "}
                  <strong className="font-mono">
                    {user.act_as.actor_username || `#${user.act_as.actor_id ?? "?"}`}
                  </strong>{" "}
                  →{" "}
                  <strong className="font-mono">
                    {user.act_as.target_username ||
                      user.username ||
                      `#${user.act_as.target_id ?? "?"}`}
                  </strong>
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-amber-500/40 bg-background/80 hover:bg-background"
                disabled={stoppingActAs}
                onClick={() => void handleStopActAs()}
              >
                {stoppingActAs ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sonlandırılıyor…
                  </span>
                ) : (
                  "Act-As Sonlandır"
                )}
              </Button>
            </div>
          )}

          <main
            id="portal-main"
            tabIndex={-1}
            className="flex-1 overflow-y-auto p-6 md:p-8 outline-none"
          >
            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
