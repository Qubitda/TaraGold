"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

export interface EntityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  isDirty?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  error?: string | null;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  size?: "sm" | "md" | "lg" | "xl";
  footerExtra?: React.ReactNode;
  hideFooter?: boolean;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<EntityModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function EntityModal({
  open,
  onOpenChange,
  title,
  description,
  isDirty = false,
  isSubmitting = false,
  submitLabel = "Kaydet",
  cancelLabel = "Vazgeç",
  error,
  onSubmit,
  size = "md",
  footerExtra,
  hideFooter = false,
  children,
}: EntityModalProps) {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
          } else {
            requestClose();
          }
        }}
      >
        <DialogContent className={SIZE_CLASSES[size]}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>

          {error ? (
            <div
              className="rounded-[6px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {onSubmit ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-4">{children}</div>
              {!hideFooter ? (
                <DialogFooter className="pt-2 gap-2">
                  {footerExtra}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestClose}
                    disabled={isSubmitting}
                  >
                    {cancelLabel}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Kaydediliyor…
                      </span>
                    ) : (
                      submitLabel
                    )}
                  </Button>
                </DialogFooter>
              ) : null}
            </form>
          ) : (
            <div className="space-y-4">
              {children}
              {!hideFooter ? (
                <DialogFooter className="pt-2 gap-2">
                  {footerExtra}
                  <Button type="button" variant="outline" onClick={requestClose}>
                    Kapat
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Kaydedilmemiş Değişiklikler"
        description="Formda kaydedilmemiş değişiklikler bulunuyor. Pencereyi kapatırsanız bu değişiklikler kaybolacaktır."
        confirmLabel="Değişiklikleri At ve Kapat"
        cancelLabel="Düzenlemeye Dön"
        variant="destructive"
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
