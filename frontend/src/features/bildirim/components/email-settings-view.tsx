"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  PlugZap,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { ApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useActionToast } from "@/hooks/use-action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useEmailSettingsQuery,
  useSendTestEmailMutation,
  useTestSmtpConnectionMutation,
  useUpdateEmailSettingsMutation,
} from "../hooks";
import type {
  EmailSettings,
  EmailSettingsUpdateRequest,
  EmailTestResult,
  SmtpEncryption,
  SmtpPreset,
} from "../types";

export const SMTP_PRESETS: SmtpPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    encryption: "STARTTLS",
    hint: "Google hesabınızda 2FA açık olmalı ve Uygulama Şifresi kullanılmalıdır.",
  },
  {
    id: "outlook",
    label: "Outlook / Office 365",
    host: "smtp.office365.com",
    port: 587,
    encryption: "STARTTLS",
    hint: "Microsoft 365 SMTP AUTH politikasının kullanıcı için etkin olduğundan emin olun.",
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    encryption: "STARTTLS",
    hint: "Kullanıcı adı olarak genellikle 'apikey', şifre olarak API anahtarı girilir.",
  },
  {
    id: "mailgun",
    label: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    encryption: "STARTTLS",
    hint: "AB bölgesi için smtp.eu.mailgun.org adresini kullanabilirsiniz.",
  },
  {
    id: "ses",
    label: "Amazon SES",
    host: "email-smtp.eu-west-1.amazonaws.com",
    port: 587,
    encryption: "STARTTLS",
    hint: "AWS bölgenize uygun SMTP sunucusu ve IAM SMTP kimlik bilgilerini girin.",
  },
  {
    id: "yandex",
    label: "Yandex",
    host: "smtp.yandex.com",
    port: 465,
    encryption: "SSL",
    hint: "Yandex Mail için Uygulama Şifresi ve 465 SSL önerilir.",
  },
  {
    id: "zoho",
    label: "Zoho",
    host: "smtp.zoho.com",
    port: 587,
    encryption: "STARTTLS",
    hint: "Kurumsal Zoho hesaplarında smtppro.zoho.com gerekebilir.",
  },
];

interface FormState {
  host: string;
  port: string;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  timeout: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  is_active: boolean;
}

type FieldErrors = Partial<Record<keyof FormState | "to" | "general", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function settingsToForm(data: EmailSettings): FormState {
  const encryption: SmtpEncryption = data.use_ssl
    ? "SSL"
    : data.use_tls
      ? "STARTTLS"
      : data.encryption === "SSL" || data.encryption === "STARTTLS"
        ? data.encryption
        : "NONE";
  return {
    host: data.host || "",
    port: String(data.port || 587),
    username: data.username || "",
    password: "",
    encryption,
    timeout: String(data.timeout || 15),
    from_email: data.from_email || "",
    from_name: data.from_name || "",
    reply_to: data.reply_to || "",
    is_active: Boolean(data.is_active),
  };
}

function emptyForm(): FormState {
  return {
    host: "",
    port: "587",
    username: "",
    password: "",
    encryption: "STARTTLS",
    timeout: "15",
    from_email: "",
    from_name: "TaraGold Portal",
    reply_to: "",
    is_active: false,
  };
}

function extractApiError(err: unknown): { message: string; fieldErrors: FieldErrors } {
  if (err instanceof ApiError) {
    const fieldErrors: FieldErrors = {};
    const errors = err.problem.errors as Record<string, unknown> | undefined;
    if (errors && typeof errors === "object") {
      for (const [key, val] of Object.entries(errors)) {
        const msg = Array.isArray(val) ? val.join(" ") : String(val);
        if (key in emptyForm() || key === "to") {
          fieldErrors[key as keyof FieldErrors] = msg;
        }
      }
    }
    return {
      message: err.problem.detail || err.problem.title || err.message,
      fieldErrors,
    };
  }
  return {
    message: err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.",
    fieldErrors: {},
  };
}

export function EmailSettingsView() {
  const { user } = useAuth();
  const actionToast = useActionToast();

  const settingsQ = useEmailSettingsQuery(true);
  const saveMut = useUpdateEmailSettingsMutation();
  const testConnMut = useTestSmtpConnectionMutation();
  const sendTestMut = useSendTestEmailMutation();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [baseline, setBaseline] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
  const [testRecipient, setTestRecipient] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);

  useEffect(() => {
    if (settingsQ.data) {
      const next = settingsToForm(settingsQ.data);
      setForm(next);
      setBaseline(next);
      const matched = SMTP_PRESETS.find(
        (p) => p.host.toLowerCase() === next.host.trim().toLowerCase()
      );
      setSelectedPresetId(matched ? matched.id : "custom");
    }
  }, [settingsQ.data]);

  useEffect(() => {
    if (!testRecipient && user?.username && EMAIL_RE.test(user.username)) {
      setTestRecipient(user.username);
    }
  }, [user?.username, testRecipient]);

  const isDirty = useMemo(() => {
    return (
      form.host !== baseline.host ||
      form.port !== baseline.port ||
      form.username !== baseline.username ||
      form.password !== "" ||
      form.encryption !== baseline.encryption ||
      form.timeout !== baseline.timeout ||
      form.from_email !== baseline.from_email ||
      form.from_name !== baseline.from_name ||
      form.reply_to !== baseline.reply_to ||
      form.is_active !== baseline.is_active
    );
  }, [form, baseline]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const activePreset = useMemo(
    () => SMTP_PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId]
  );

  const hasSavedPassword = Boolean(settingsQ.data?.has_password);
  const busy = saveMut.isPending || testConnMut.isPending || sendTestMut.isPending;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key] && !prev.general) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.general;
      return next;
    });
  };

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = SMTP_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      host: preset.host,
      port: String(preset.port),
      encryption: preset.encryption,
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.host;
      delete next.port;
      delete next.encryption;
      delete next.general;
      return next;
    });
  };

  const validateForm = (opts: { requireHost: boolean; requireTo?: boolean }): boolean => {
    const nextErrors: FieldErrors = {};
    const host = form.host.trim();
    const portNum = Number(form.port);
    const timeoutNum = Number(form.timeout);
    const fromEmail = form.from_email.trim();
    const replyTo = form.reply_to.trim();

    if ((opts.requireHost || form.is_active) && !host) {
      nextErrors.host = "SMTP sunucu adresi zorunludur.";
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      nextErrors.port = "Port 1 ile 65535 arasında bir tamsayı olmalıdır.";
    }
    if (!Number.isInteger(timeoutNum) || timeoutNum < 1 || timeoutNum > 120) {
      nextErrors.timeout = "Zaman aşımı 1 ile 120 saniye arasında olmalıdır.";
    }
    if (form.is_active && !fromEmail) {
      nextErrors.from_email = "Aktif yapılandırmada gönderen e-posta adresi zorunludur.";
    } else if (fromEmail && !EMAIL_RE.test(fromEmail)) {
      nextErrors.from_email = "Geçerli bir gönderen e-posta adresi girin.";
    }
    if (replyTo && !EMAIL_RE.test(replyTo)) {
      nextErrors.reply_to = "Geçerli bir yanıt adresi (Reply-To) girin.";
    }
    if (opts.requireTo) {
      const to = testRecipient.trim();
      if (!to) {
        nextErrors.to = "Test alıcı e-posta adresi zorunludur.";
      } else if (!EMAIL_RE.test(to)) {
        nextErrors.to = "Geçerli bir alıcı e-posta adresi girin.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = (): EmailSettingsUpdateRequest => {
    const use_tls = form.encryption === "STARTTLS";
    const use_ssl = form.encryption === "SSL";
    const payload: EmailSettingsUpdateRequest = {
      host: form.host.trim(),
      port: Number(form.port) || 587,
      username: form.username.trim(),
      encryption: form.encryption,
      use_tls,
      use_ssl,
      timeout: Number(form.timeout) || 15,
      from_email: form.from_email.trim(),
      from_name: form.from_name.trim(),
      reply_to: form.reply_to.trim(),
      is_active: form.is_active,
    };
    if (form.password.trim() !== "") {
      payload.password = form.password;
    }
    return payload;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm({ requireHost: form.is_active })) return;

    try {
      const saved = await saveMut.mutateAsync(buildPayload());
      const next = settingsToForm(saved);
      setForm(next);
      setBaseline(next);
      setShowPassword(false);
      actionToast.success(
        "SMTP ayarları kaydedildi",
        saved.is_active
          ? "Sistem e-postaları bu yapılandırma üzerinden gönderilecek."
          : "Ayarlar kaydedildi (pasif — varsayılan sistem backend’i aktif)."
      );
    } catch (err) {
      const parsed = extractApiError(err);
      setErrors((prev) => ({
        ...prev,
        ...parsed.fieldErrors,
        general: parsed.message,
      }));
      actionToast.error("Ayarlar kaydedilemedi", new Error(parsed.message));
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    if (!validateForm({ requireHost: true })) return;

    try {
      const res = await testConnMut.mutateAsync(buildPayload());
      setTestResult(res);
      if (res.success) {
        actionToast.success("Bağlantı testi başarılı", res.message);
      } else {
        actionToast.error("Bağlantı testi başarısız", new Error(res.message));
      }
    } catch (err) {
      const parsed = extractApiError(err);
      setErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
      setTestResult({
        success: false,
        message: parsed.message,
        detail: null,
      });
      actionToast.error("Bağlantı testi başarısız", new Error(parsed.message));
    }
  };

  const handleSendTestEmail = async () => {
    setTestResult(null);
    if (!validateForm({ requireHost: true, requireTo: true })) return;

    try {
      const res = await sendTestMut.mutateAsync({
        ...buildPayload(),
        to: testRecipient.trim(),
      });
      setTestResult(res);
      if (res.success) {
        actionToast.success("Test e-postası gönderildi", res.message);
      } else {
        actionToast.error("Test e-postası gönderilemedi", new Error(res.message));
      }
    } catch (err) {
      const parsed = extractApiError(err);
      setErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
      setTestResult({
        success: false,
        message: parsed.message,
        detail: null,
      });
      actionToast.error("Test e-postası gönderilemedi", new Error(parsed.message));
    }
  };

  if (settingsQ.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-[8px] border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>E-posta (SMTP) yapılandırması yükleniyor…</span>
      </div>
    );
  }

  if (settingsQ.isError) {
    const parsed = extractApiError(settingsQ.error);
    return (
      <div
        className="rounded-[8px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive space-y-2"
        role="alert"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>SMTP yapılandırması okunamadı</span>
        </div>
        <p className="text-xs opacity-90">{parsed.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void settingsQ.refetch()}
        >
          Tekrar Dene
        </Button>
      </div>
    );
  }

  const data = settingsQ.data;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Üst Başlık ve Durum Özeti */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[8px] border border-border bg-card p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              E-posta (SMTP) Ayarları
            </h2>
            <Badge variant={form.is_active ? "default" : "outline"}>
              {form.is_active ? "Aktif" : "Pasif (Yedek Backend)"}
            </Badge>
            {isDirty ? (
              <Badge variant="warning" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                Kaydedilmemiş Değişiklik
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Şifre sıfırlama, kullanıcı davetleri, MFA doğrulama kodları ve sistem bildirimleri aktif olduğunda bu veritabanı SMTP yapılandırmasını kullanır. Parola veritabanında şifreli saklanır ve API üzerinden asla geri döndürülmez.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-[6px] border border-border bg-background px-3 py-1.5 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateField("is_active", e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-primary rounded"
            />
            <span>DB SMTP Aktif</span>
          </label>
        </div>
      </div>

      {/* Kaydedilmemiş Değişiklik Uyarısı */}
      {isDirty && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300"
          role="status"
        >
          <span className="inline-flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Formda kaydedilmemiş değişiklikler var. Bağlantı/gönderim testlerini mevcut form değerleriyle hemen çalıştırabilirsiniz; kalıcı olması için kaydetmeyi unutmayın.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (settingsQ.data) {
                setForm(settingsToForm(settingsQ.data));
                setErrors({});
              }
            }}
          >
            Değişiklikleri Geri Al
          </Button>
        </div>
      )}

      {errors.general && (
        <div
          className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errors.general}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Ana SMTP Formu */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-2 space-y-5 rounded-[8px] border border-border bg-card p-5"
          noValidate
        >
          {/* Hızlı Sağlayıcı Şablonları */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Sağlayıcı Şablonu (Hızlı Doldur)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {SMTP_PRESETS.map((preset) => {
                const active = selectedPresetId === preset.id;
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => applyPreset(preset.id)}
                    disabled={busy}
                    className="h-7 px-2.5 text-xs"
                  >
                    {preset.label}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={selectedPresetId === "custom" ? "secondary" : "ghost"}
                onClick={() => setSelectedPresetId("custom")}
                disabled={busy}
                className="h-7 px-2.5 text-xs"
              >
                Özel / Manuel
              </Button>
            </div>
            {activePreset?.hint && (
              <p className="text-[11px] text-muted-foreground">
                İpucu ({activePreset.label}): {activePreset.hint}
              </p>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Sunucu & Port & Zaman Aşımı */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-6 space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Sunucusu (Host)</Label>
              <Input
                id="smtp-host"
                type="text"
                value={form.host}
                onChange={(e) => {
                  setSelectedPresetId("custom");
                  updateField("host", e.target.value);
                }}
                placeholder="smtp.example.com"
                disabled={busy}
                aria-invalid={Boolean(errors.host)}
              />
              {errors.host && (
                <p className="text-[11px] text-destructive">{errors.host}</p>
              )}
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => updateField("port", e.target.value)}
                disabled={busy}
                aria-invalid={Boolean(errors.port)}
              />
              {errors.port && (
                <p className="text-[11px] text-destructive">{errors.port}</p>
              )}
            </div>

            <div className="sm:col-span-3 space-y-1.5">
              <Label htmlFor="smtp-timeout">Zaman Aşımı (sn)</Label>
              <Input
                id="smtp-timeout"
                type="number"
                min={1}
                max={120}
                value={form.timeout}
                onChange={(e) => updateField("timeout", e.target.value)}
                disabled={busy}
                aria-invalid={Boolean(errors.timeout)}
              />
              {errors.timeout && (
                <p className="text-[11px] text-destructive">{errors.timeout}</p>
              )}
            </div>
          </div>

          {/* Şifreleme Seçimi (Karşılıklı Dışlayıcı TLS / SSL) */}
          <div className="space-y-1.5">
            <Label>Güvenlik / Şifreleme</Label>
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-label="SMTP şifreleme protokolü"
            >
              {(
                [
                  {
                    value: "STARTTLS",
                    title: "STARTTLS (TLS)",
                    desc: "Port 587 önerilir",
                  },
                  {
                    value: "SSL",
                    title: "SSL / TLS",
                    desc: "Port 465 önerilir",
                  },
                  {
                    value: "NONE",
                    title: "Şifrelemesiz",
                    desc: "Yalnızca iç ağ / test",
                  },
                ] as const
              ).map((opt) => {
                const selected = form.encryption === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => updateField("encryption", opt.value)}
                    className={`rounded-[6px] border px-3 py-2 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.title}</div>
                    <div className="text-[11px] opacity-80">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kullanıcı Adı & Parola */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">Kullanıcı Adı</Label>
              <Input
                id="smtp-username"
                type="text"
                autoComplete="off"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="noreply@firma.com veya apikey"
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">Parola / Uygulama Şifresi</Label>
              <div className="relative">
                <Input
                  id="smtp-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder={
                    hasSavedPassword
                      ? "••••••• (değiştirmek için yeni şifre girin)"
                      : "SMTP parolası"
                  }
                  disabled={busy}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {hasSavedPassword
                  ? "Kayıtlı parola mevcut (şifreli saklanır). Boş bırakırsanız mevcut parola korunur."
                  : "Henüz kayıtlı parola yok."}
              </p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Gönderen Bilgileri */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">Gönderen Adı</Label>
              <Input
                id="smtp-from-name"
                type="text"
                value={form.from_name}
                onChange={(e) => updateField("from_name", e.target.value)}
                placeholder="TaraGold Portal"
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-email">Gönderen E-posta (From)</Label>
              <Input
                id="smtp-from-email"
                type="email"
                value={form.from_email}
                onChange={(e) => updateField("from_email", e.target.value)}
                placeholder="noreply@firma.com"
                disabled={busy}
                aria-invalid={Boolean(errors.from_email)}
              />
              {errors.from_email && (
                <p className="text-[11px] text-destructive">{errors.from_email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-reply-to">Yanıt Adresi (Reply-To)</Label>
              <Input
                id="smtp-reply-to"
                type="email"
                value={form.reply_to}
                onChange={(e) => updateField("reply_to", e.target.value)}
                placeholder="destek@firma.com (opsiyonel)"
                disabled={busy}
                aria-invalid={Boolean(errors.reply_to)}
              />
              {errors.reply_to && (
                <p className="text-[11px] text-destructive">{errors.reply_to}</p>
              )}
            </div>
          </div>

          {/* Kaydet & Bağlantıyı Test Et */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleTestConnection()}
              className="gap-2"
            >
              {testConnMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              <span>
                {testConnMut.isPending
                  ? "Bağlantı Test Ediliyor…"
                  : "Bağlantıyı Test Et"}
              </span>
            </Button>

            <Button type="submit" disabled={busy} className="gap-2">
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {saveMut.isPending ? "Kaydediliyor…" : "Ayarları Kaydet"}
              </span>
            </Button>
          </div>
        </form>

        {/* Sağ Panel: Test E-postası Gönder + Son Test Durumu */}
        <div className="space-y-5">
          {/* Test E-postası Gönder */}
          <div className="rounded-[8px] border border-border bg-card p-5 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                Test E-postası Gönder
              </h3>
              <p className="text-xs text-muted-foreground">
                Soldaki form bilgileriyle (kaydedilmemiş olsa bile) gerçek bir test e-postası göndererek uçtan uca teslimatı doğrulayın.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-test-to">Alıcı E-posta</Label>
              <Input
                id="smtp-test-to"
                type="email"
                value={testRecipient}
                onChange={(e) => {
                  setTestRecipient(e.target.value);
                  setErrors((prev) => {
                    if (!prev.to) return prev;
                    const next = { ...prev };
                    delete next.to;
                    return next;
                  });
                }}
                placeholder="ornek@firma.com"
                disabled={busy}
                aria-invalid={Boolean(errors.to)}
              />
              {errors.to && (
                <p className="text-[11px] text-destructive">{errors.to}</p>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              disabled={busy}
              onClick={() => void handleSendTestEmail()}
            >
              {sendTestMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>
                {sendTestMut.isPending
                  ? "Gönderiliyor…"
                  : "Test E-postası Gönder"}
              </span>
            </Button>

            {/* Anlık Test Sonucu */}
            {testResult && (
              <div
                role="status"
                className={`rounded-[6px] border p-3 text-xs space-y-1.5 ${
                  testResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                <div className="flex items-start gap-2 font-medium">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.detail && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-[11px] opacity-80 hover:opacity-100">
                      Teknik Detayı Göster
                    </summary>
                    <pre className="mt-1.5 whitespace-pre-wrap break-all rounded bg-background/60 p-2 font-mono text-[10px]">
                      {testResult.detail}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Son Test & Güncelleme Özeti */}
          <div className="rounded-[8px] border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Son Test & Denetim Durumu
            </h3>

            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Test Sonucu</dt>
                <dd>
                  {data?.last_test_success === true ? (
                    <Badge className="bg-emerald-600 text-white">Başarılı</Badge>
                  ) : data?.last_test_success === false ? (
                    <Badge variant="destructive">Başarısız</Badge>
                  ) : (
                    <Badge variant="outline">Henüz Test Edilmedi</Badge>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Son Test Zamanı</dt>
                <dd className="font-mono text-[11px]">
                  {formatDateTime(data?.last_test_at)}
                </dd>
              </div>

              {data?.last_test_message && (
                <div className="space-y-1 pt-1 border-t border-border">
                  <dt className="text-muted-foreground">Son Test Mesajı</dt>
                  <dd className="text-[11px] text-foreground break-words">
                    {data.last_test_message}
                  </dd>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                <dt className="text-muted-foreground">Son Güncelleyen</dt>
                <dd className="font-medium">
                  {data?.updated_by_username || "—"}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Güncelleme Zamanı</dt>
                <dd className="font-mono text-[11px]">
                  {formatDateTime(data?.updated_at)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
