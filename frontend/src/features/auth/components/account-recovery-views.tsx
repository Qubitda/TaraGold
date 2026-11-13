"use client";

import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authService } from "../services/auth-service";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiStudioFrame } from "@/components/ui/ai-studio-frame";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  UserPlus,
} from "lucide-react";

const resetRequestSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta adresi girin."),
});

const resetConfirmSchema = z
  .object({
    uid: z.string().trim().min(1, "UID zorunludur."),
    token: z.string().trim().min(1, "Token zorunludur."),
    new_password: z
      .string()
      .min(8, "Yeni parola en az 8 karakter olmalıdır.")
      .regex(/[A-Za-z]/, "En az bir harf içermelidir.")
      .regex(/[0-9]/, "En az bir rakam içermelidir."),
    new_password_confirm: z.string().min(1, "Parola tekrarı zorunludur."),
  })
  .refine((d) => d.new_password === d.new_password_confirm, {
    message: "Parolalar eşleşmiyor.",
    path: ["new_password_confirm"],
  });

const inviteAcceptSchema = z
  .object({
    token: z.string().trim().min(1, "Davet tokenı zorunludur."),
    username: z
      .string()
      .trim()
      .min(3, "Kullanıcı adı en az 3 karakter olmalıdır."),
    password: z
      .string()
      .min(8, "Parola en az 8 karakter olmalıdır.")
      .regex(/[A-Za-z]/, "En az bir harf içermelidir.")
      .regex(/[0-9]/, "En az bir rakam içermelidir."),
    password_confirm: z.string().min(1, "Parola tekrarı zorunludur."),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: "Parolalar eşleşmiyor.",
    path: ["password_confirm"],
  });

function formatErr(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.problem.errors) {
      const msgs = Object.entries(err.problem.errors).flatMap(([k, v]) =>
        (Array.isArray(v) ? v : [v]).map((m) => `${k}: ${String(m)}`)
      );
      if (msgs.length) return msgs.join(" · ");
    }
    return err.problem.detail || err.problem.title || err.message;
  }
  return err instanceof Error ? err.message : "İşlem tamamlanamadı.";
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialUid = searchParams.get("uid") || "";
  const initialToken = searchParams.get("token") || "";
  const [mode, setMode] = useState<"request" | "confirm">(
    initialUid || initialToken ? "confirm" : "request"
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reqForm = useForm<z.infer<typeof resetRequestSchema>>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: "" },
  });

  const confirmForm = useForm<z.infer<typeof resetConfirmSchema>>({
    resolver: zodResolver(resetConfirmSchema),
    defaultValues: {
      uid: initialUid,
      token: initialToken,
      new_password: "",
      new_password_confirm: "",
    },
  });

  const onRequestSubmit = async (data: z.infer<typeof resetRequestSchema>) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await authService.requestPasswordReset(data.email);
      setSuccess(
        res.detail ||
          "Eğer e-posta kayıtlı ise parola sıfırlama talimatları gönderildi."
      );
      reqForm.reset();
    } catch (err) {
      setError(formatErr(err));
    }
  };

  const onConfirmSubmit = async (data: z.infer<typeof resetConfirmSchema>) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await authService.confirmPasswordReset(data);
      setSuccess(res.detail || "Parolanız güncellendi. Artık giriş yapabilirsiniz.");
      confirmForm.reset();
    } catch (err) {
      setError(formatErr(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <AiStudioFrame
        className="w-full max-w-[440px]"
        contentClassName="flex flex-col gap-5 p-6 sm:p-8 shadow-sm"
      >
        <div className="flex items-start justify-between border-b border-border pb-4 gap-3">
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span>Parola Sıfırlama</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              E-posta bağlantısı isteyin veya elinizdeki UID / token ile yeni
              parola belirleyin.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("request");
              setError(null);
              setSuccess(null);
            }}
            className={`rounded-[4px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
              mode === "request"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Bağlantı İste
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("confirm");
              setError(null);
              setSuccess(null);
            }}
            className={`rounded-[4px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
              mode === "confirm"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Kodla Sıfırla
          </button>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 rounded-[6px] border border-border bg-muted/50 p-3 text-xs text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <span>{success}</span>
          </div>
        )}

        {mode === "request" ? (
          <form
            onSubmit={reqForm.handleSubmit(onRequestSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-email">Kayıtlı e-posta</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="kullanici@firma.com"
                disabled={reqForm.formState.isSubmitting}
                {...reqForm.register("email")}
              />
              {reqForm.formState.errors.email && (
                <span className="text-[11px] text-destructive">
                  {reqForm.formState.errors.email.message}
                </span>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={reqForm.formState.isSubmitting}
            >
              {reqForm.formState.isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gönderiliyor…
                </span>
              ) : (
                "Sıfırlama Bağlantısı Gönder"
              )}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={confirmForm.handleSubmit(onConfirmSubmit)}
            className="flex flex-col gap-3.5"
            noValidate
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-uid">UID</Label>
                <Input
                  id="reset-uid"
                  className="font-mono text-xs"
                  disabled={confirmForm.formState.isSubmitting}
                  {...confirmForm.register("uid")}
                />
                {confirmForm.formState.errors.uid && (
                  <span className="text-[11px] text-destructive">
                    {confirmForm.formState.errors.uid.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-token">Token</Label>
                <Input
                  id="reset-token"
                  className="font-mono text-xs"
                  disabled={confirmForm.formState.isSubmitting}
                  {...confirmForm.register("token")}
                />
                {confirmForm.formState.errors.token && (
                  <span className="text-[11px] text-destructive">
                    {confirmForm.formState.errors.token.message}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-pw1">Yeni parola</Label>
              <Input
                id="reset-pw1"
                type="password"
                autoComplete="new-password"
                disabled={confirmForm.formState.isSubmitting}
                {...confirmForm.register("new_password")}
              />
              {confirmForm.formState.errors.new_password && (
                <span className="text-[11px] text-destructive">
                  {confirmForm.formState.errors.new_password.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-pw2">Yeni parola (tekrar)</Label>
              <Input
                id="reset-pw2"
                type="password"
                autoComplete="new-password"
                disabled={confirmForm.formState.isSubmitting}
                {...confirmForm.register("new_password_confirm")}
              />
              {confirmForm.formState.errors.new_password_confirm && (
                <span className="text-[11px] text-destructive">
                  {confirmForm.formState.errors.new_password_confirm.message}
                </span>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={confirmForm.formState.isSubmitting}
            >
              {confirmForm.formState.isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Güncelleniyor…
                </span>
              ) : (
                "Parolayı Güncelle"
              )}
            </Button>
          </form>
        )}

        <div className="border-t border-border pt-3 flex items-center justify-between text-xs">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Giriş ekranına dön
          </Link>
          <Link
            to="/invite"
            className="text-foreground hover:underline underline-offset-4"
          >
            Davet kabulü →
          </Link>
        </div>
      </AiStudioFrame>
    </div>
  );
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") || "";
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ detail: string; username: string } | null>(
    null
  );

  const form = useForm<z.infer<typeof inviteAcceptSchema>>({
    resolver: zodResolver(inviteAcceptSchema),
    defaultValues: {
      token: initialToken,
      username: "",
      password: "",
      password_confirm: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof inviteAcceptSchema>) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await authService.acceptInvite(data);
      setSuccess(res);
      form.reset();
    } catch (err) {
      setError(formatErr(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <AiStudioFrame
        className="w-full max-w-[440px]"
        contentClassName="flex flex-col gap-5 p-6 sm:p-8 shadow-sm"
      >
        <div className="space-y-1 border-b border-border pb-4">
          <h1 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span>Firma Daveti Kabulü</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Size gönderilen davet tokenı ile kullanıcı adınızı ve parolanızı
            tanımlayarak hesabınızı aktifleştirin.
          </p>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="flex flex-col gap-3 rounded-[6px] border border-border bg-muted/50 p-4 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{success.detail}</p>
                <p className="text-muted-foreground">
                  Kullanıcı adı:{" "}
                  <span className="font-mono text-foreground">
                    {success.username}
                  </span>
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="w-full">
              <Link to="/login">Giriş Ekranına Git</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-3.5"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-token">Davet tokenı</Label>
              <Input
                id="inv-token"
                className="font-mono text-xs"
                placeholder="Davet bağlantısındaki token"
                disabled={form.formState.isSubmitting}
                {...form.register("token")}
              />
              {form.formState.errors.token && (
                <span className="text-[11px] text-destructive">
                  {form.formState.errors.token.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-user">Kullanıcı adı</Label>
              <Input
                id="inv-user"
                placeholder="kullanici_adi"
                disabled={form.formState.isSubmitting}
                {...form.register("username")}
              />
              {form.formState.errors.username && (
                <span className="text-[11px] text-destructive">
                  {form.formState.errors.username.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-pw1">Parola</Label>
              <Input
                id="inv-pw1"
                type="password"
                autoComplete="new-password"
                disabled={form.formState.isSubmitting}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <span className="text-[11px] text-destructive">
                  {form.formState.errors.password.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-pw2">Parola (tekrar)</Label>
              <Input
                id="inv-pw2"
                type="password"
                autoComplete="new-password"
                disabled={form.formState.isSubmitting}
                {...form.register("password_confirm")}
              />
              {form.formState.errors.password_confirm && (
                <span className="text-[11px] text-destructive">
                  {form.formState.errors.password_confirm.message}
                </span>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Hesap oluşturuluyor…
                </span>
              ) : (
                "Daveti Kabul Et ve Hesabı Aç"
              )}
            </Button>
          </form>
        )}

        <div className="border-t border-border pt-3 flex items-center justify-between text-xs">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Giriş ekranına dön
          </Link>
          <Link
            to="/reset-password"
            className="text-foreground hover:underline underline-offset-4"
          >
            Parolamı unuttum →
          </Link>
        </div>
      </AiStudioFrame>
    </div>
  );
}
