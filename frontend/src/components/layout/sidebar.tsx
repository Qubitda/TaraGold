"use client";

import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Gem, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Capabilities, MeResponse } from "@/lib/api/types";
import { filterVisibleNavGroups } from "./nav-items";

export type { NavItem, NavGroup } from "./nav-items";
export {
  DOMAIN_NAV_ITEMS,
  NAV_GROUPS,
  filterVisibleNavGroups,
  isNavItemVisible,
} from "./nav-items";

interface SidebarProps {
  capabilities?: Capabilities | null;
  user?: MeResponse | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  capabilities,
  user,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { pathname } = useLocation();
  const groups = useMemo(
    () => filterVisibleNavGroups(capabilities),
    [capabilities]
  );

  const rolLabel = (user?.rol || "").replace(/_/g, " ");
  const firmaLabel = user?.firma?.ad || "Firma yok";

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card shrink-0 transition-all duration-150 select-none",
        collapsed ? "w-[64px]" : "w-[240px]"
      )}
      aria-label="Ana Navigasyon"
    >
      <div className="flex h-[56px] items-center justify-between border-b border-border px-4">
        {!collapsed ? (
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold text-foreground tracking-tight text-base hover:opacity-90"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary text-primary-foreground">
              <Gem className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span>TaraGold</span>
          </Link>
        ) : (
          <Link
            to="/"
            className="mx-auto flex h-7 w-7 items-center justify-center rounded-[4px] bg-primary text-primary-foreground"
            title="TaraGold Ana Sayfa"
          >
            <Gem className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}

        {onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-[4px] p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Kenar çubuğunu daralt"
            title="Menüyü Daralt"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 space-y-1.5",
          // Kaydırma çubuğu görünmesin; kısa ekranda içerik yine erişilebilir kalsın
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {groups.map((group, gi) => (
          <div key={group.id} className="space-y-0.5">
            {!collapsed ? (
              <p className="px-2 pt-0.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
            ) : gi > 0 ? (
              <div className="mx-1.5 my-0.5 h-px bg-border" aria-hidden="true" />
            ) : null}

            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  title={item.label}
                  className={cn(
                    "group flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12px] leading-tight transition-colors duration-150 relative",
                    active
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {!collapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {active && (
                    <span
                      className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-[2px] bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2 space-y-1.5 shrink-0">
        {onToggleCollapse && collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center rounded-[4px] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Kenar çubuğunu genişlet"
            title="Menüyü Genişlet"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {!collapsed && user ? (
          <Link
            to="/profil"
            className="flex items-center gap-2 rounded-[5px] px-1 py-1 hover:bg-secondary/60 transition-colors"
            title="Profilim"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
              {(user.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-foreground">
                {user.username}
              </span>
              <span className="block truncate text-[9px] text-muted-foreground leading-tight">
                {[rolLabel, firmaLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        ) : null}
        {!collapsed && !user ? (
          <div className="text-[12px] text-muted-foreground flex flex-col gap-0.5 px-1">
            <span className="font-medium text-foreground">TaraGold</span>
            <span className="text-[11px] leading-tight">
              B2B Kuyumculuk İşlem Merkezi
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
