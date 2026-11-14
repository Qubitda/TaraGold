"use client";

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Gem, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Capabilities } from "@/lib/api/types";
import { DOMAIN_NAV_ITEMS } from "./nav-items";

export type { NavItem } from "./nav-items";
export { DOMAIN_NAV_ITEMS } from "./nav-items";

interface SidebarProps {
  capabilities?: Capabilities | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  capabilities,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card shrink-0 transition-all duration-150 select-none",
        collapsed ? "w-[64px]" : "w-[240px]"
      )}
      aria-label="Ana Navigasyon"
    >
      {/* Platform Markası */}
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

      {/* Navigasyon Listesi */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="px-2 py-1">
          {!collapsed ? (
            <p className="text-[12px] font-medium text-muted-foreground tracking-wide">
              Yönetim Menüsü
            </p>
          ) : (
            <div className="h-px bg-border my-1" />
          )}
        </div>

        {DOMAIN_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const needsCap = Boolean(item.requiredCapability || item.requiredAnyOf?.length);
          const hasCap =
            !needsCap ||
            !capabilities ||
            (item.requiredCapability
              ? Boolean(capabilities[item.requiredCapability])
              : false) ||
            Boolean(item.requiredAnyOf?.some((k) => Boolean(capabilities[k])));

          if (needsCap && capabilities && !hasCap) {
            return null;
          }

          return (
            <Link
              key={item.href}
              to={item.href}
              title={item.label}
              className={cn(
                "group flex items-center gap-3 rounded-[6px] px-2.5 py-2 text-sm transition-colors duration-150 relative",
                isActive
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {!collapsed && (
                <span className="truncate flex-1">{item.label}</span>
              )}
              {isActive && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-[2px] bg-primary"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Alt Bilgi */}
      <div className="border-t border-border p-3">
        {onToggleCollapse && collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center rounded-[4px] p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Kenar çubuğunu genişlet"
            title="Menüyü Genişlet"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {!collapsed && (
          <div className="text-[12px] text-muted-foreground flex flex-col gap-0.5">
            <span className="font-medium text-foreground">TaraGold</span>
            <span className="text-[11px] leading-tight">B2B Kuyumculuk İşlem Merkezi</span>
          </div>
        )}
      </div>
    </aside>
  );
}
