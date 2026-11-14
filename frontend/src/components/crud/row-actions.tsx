"use client";

import React, { useState } from "react";
import { Eye, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "./confirm-dialog";

export interface ExtraRowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
  variant?: "default" | "destructive";
  confirmTitle?: string;
  confirmDescription?: string;
  disabled?: boolean;
}

export interface RowActionsProps {
  itemLabel?: string;
  onView?: () => void;
  onEdit?: () => void;
  isActive?: boolean;
  onToggleActive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  extraActions?: ExtraRowAction[];
  /** true ise butonları menü yerine satır içi ikon olarak gösterir */
  inline?: boolean;
}

export function RowActions({
  itemLabel = "bu kayıt",
  onView,
  onEdit,
  isActive,
  onToggleActive,
  onDelete,
  extraActions = [],
  inline = false,
}: RowActionsProps) {
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: "default" | "destructive";
    action: () => void | Promise<void>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const hasToggle = typeof isActive === "boolean" && Boolean(onToggleActive);
  const hasAny =
    Boolean(onView) ||
    Boolean(onEdit) ||
    hasToggle ||
    Boolean(onDelete) ||
    extraActions.length > 0;

  if (!hasAny) return null;

  const runAction = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setConfirmState(null);
    } finally {
      setBusy(false);
    }
  };

  const askToggle = () => {
    if (!onToggleActive) return;
    if (isActive) {
      setConfirmState({
        open: true,
        title: "Kaydı Pasifleştir",
        description: `${itemLabel} pasif duruma alınacak. Mevcut kayıtlar korunur, yeni işlemlerde görünmez.`,
        confirmLabel: "Pasifleştir",
        variant: "destructive",
        action: onToggleActive,
      });
    } else {
      void onToggleActive();
    }
  };

  const askDelete = () => {
    if (!onDelete) return;
    setConfirmState({
      open: true,
      title: "Kaydı Sil",
      description: `${itemLabel} kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: "Evet, Sil",
      variant: "destructive",
      action: onDelete,
    });
  };

  return (
    <>
      {inline ? (
        <div className="inline-flex items-center justify-end gap-1">
          {onView ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onView}
              title="Görüntüle"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="sr-only">Görüntüle</span>
            </Button>
          ) : null}
          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onEdit}
              title="Düzenle"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Düzenle</span>
            </Button>
          ) : null}
          {hasToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={askToggle}
              title={isActive ? "Pasifleştir" : "Aktifleştir"}
            >
              {isActive ? (
                <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Power className="h-3.5 w-3.5 text-emerald-600" />
              )}
              <span className="sr-only">
                {isActive ? "Pasifleştir" : "Aktifleştir"}
              </span>
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={askDelete}
              title="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Sil</span>
            </Button>
          ) : null}
          {extraActions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Diğer işlemler</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {extraActions.map((act, idx) => (
                  <DropdownMenuItem
                    key={idx}
                    disabled={act.disabled}
                    className={
                      act.variant === "destructive"
                        ? "text-destructive focus:text-destructive cursor-pointer text-xs"
                        : "cursor-pointer text-xs"
                    }
                    onClick={() => {
                      if (act.confirmTitle) {
                        setConfirmState({
                          open: true,
                          title: act.confirmTitle,
                          description: act.confirmDescription || "",
                          confirmLabel: act.label,
                          variant: act.variant || "default",
                          action: act.onClick,
                        });
                      } else {
                        void act.onClick();
                      }
                    }}
                  >
                    {act.icon ? <span className="mr-2">{act.icon}</span> : null}
                    {act.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1">
              <span>İşlemler</span>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onView ? (
              <DropdownMenuItem onClick={onView} className="cursor-pointer text-xs">
                <Eye className="mr-2 h-3.5 w-3.5" />
                Görüntüle
              </DropdownMenuItem>
            ) : null}
            {onEdit ? (
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer text-xs">
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Düzenle
              </DropdownMenuItem>
            ) : null}
            {extraActions.map((act, idx) => (
              <DropdownMenuItem
                key={idx}
                disabled={act.disabled}
                className={
                  act.variant === "destructive"
                    ? "text-destructive focus:text-destructive cursor-pointer text-xs"
                    : "cursor-pointer text-xs"
                }
                onClick={() => {
                  if (act.confirmTitle) {
                    setConfirmState({
                      open: true,
                      title: act.confirmTitle,
                      description: act.confirmDescription || "",
                      confirmLabel: act.label,
                      variant: act.variant || "default",
                      action: act.onClick,
                    });
                  } else {
                    void act.onClick();
                  }
                }}
              >
                {act.icon ? <span className="mr-2">{act.icon}</span> : null}
                {act.label}
              </DropdownMenuItem>
            ))}
            {(hasToggle || onDelete) && (onView || onEdit || extraActions.length > 0) ? (
              <DropdownMenuSeparator />
            ) : null}
            {hasToggle ? (
              <DropdownMenuItem onClick={askToggle} className="cursor-pointer text-xs">
                {isActive ? (
                  <>
                    <PowerOff className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    Pasifleştir
                  </>
                ) : (
                  <>
                    <Power className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                    Aktifleştir
                  </>
                )}
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem
                onClick={askDelete}
                className="cursor-pointer text-xs text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Sil
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {confirmState ? (
        <ConfirmDialog
          open={confirmState.open}
          onOpenChange={(open) => !open && setConfirmState(null)}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          loading={busy}
          onConfirm={() => runAction(confirmState.action)}
        />
      ) : null}
    </>
  );
}
