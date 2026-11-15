"use client";

import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, LogIn, LogOut, ShieldCheck, UserCog, Loader2, Building2, Check } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RelationSelect } from "@/components/crud";
import { apiFetch, unwrapResults } from "@/lib/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeResponse } from "@/lib/api/types";
import { PiyasaPanoStrip } from "@/features/piyasa";
import { authService } from "@/features/auth/services/auth-service";
import { useAuth } from "@/features/auth";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface HeaderProps {
  user?: MeResponse | null;
  onLogout?: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  "/": "Genel Bakış",
  "/firmalar": "Firmalar",
  "/tanimlar": "Tanımlar & Kanallar",
  "/urunler": "Ürünler & Katalog",
  "/fiyatlama": "Fiyatlandırma",
  "/stok": "Stok & Depolar",
  "/siparis": "Sipariş Listem",
  "/finans": "Finans & Cari",
  "/kalite": "Kalite Kontrol",
  "/lojistik": "Lojistik & İadeler",
  "/belgeler": "Belgeler",
  "/profil": "Profilim",
  "/raporlar": "Raporlar & Analitik",
  "/ayarlar/eposta": "E-posta (SMTP)",
  "/login": "Kullanıcı Girişi",
};

export function Header({ user, onLogout }: HeaderProps) {
  const { pathname } = useLocation();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [actAsOpen, setActAsOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [actAsLoading, setActAsLoading] = useState(false);
  const [actAsError, setActAsError] = useState<string | null>(null);
  const [switchingFirmaId, setSwitchingFirmaId] = useState<number | null>(null);

  const uyeliklerQ = useQuery({
    queryKey: ["me-uyelikler", user?.id],
    queryFn: () => authService.getUyelikler(),
    enabled: Boolean(user),
  });
  const uyelikler = uyeliklerQ.data?.results ?? [];

  const handleSwitchFirma = async (firmaId: number) => {
    setSwitchingFirmaId(firmaId);
    try {
      const res = await authService.switchFirma(firmaId);
      await refresh();
      await queryClient.invalidateQueries();
      toast.success(
        "Aktif firma değiştirildi",
        `${res.uyelik.firma_ad} (${res.uyelik.rol})`
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.problem.detail || err.message
          : "Firma değiştirilemedi.";
      toast.error("Firma geçiş hatası", msg);
    } finally {
      setSwitchingFirmaId(null);
    }
  };

  const basePath = (() => {
    const seg = pathname.split("/").filter(Boolean)[0];
    return seg ? `/${seg}` : "/";
  })();
  const currentTitle =
    ROUTE_TITLES[pathname] || ROUTE_TITLES[basePath] || "TaraGold Portal";

  const canStartActAs = Boolean(
    user?.capabilities?.can_act_as && !user?.act_as?.active
  );

  const handleStartActAs = async (e: React.FormEvent) => {
    e.preventDefault();
    setActAsError(null);
    const parsedId = Number(targetUserId.trim());
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setActAsError("Lütfen listeden bir kullanıcı seçin.");
      return;
    }
    setActAsLoading(true);
    try {
      const res = await authService.startActAs(parsedId);
      await refresh();
      await queryClient.invalidateQueries();
      setActAsOpen(false);
      setTargetUserId("");
      toast.success(
        "Kullanıcı oturumu devralındı",
        `${res.target_username} adına işlem yapılıyor.`
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.problem.detail || err.message
          : "Kullanıcı değiştirilemedi.";
      setActAsError(msg);
      toast.error("İşlem başarısız", msg);
    } finally {
      setActAsLoading(false);
    }
  };

  return (
    <>
      <header
        className="flex h-[56px] w-full items-center justify-between border-b border-border bg-card px-6"
        role="banner"
      >
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground shrink-0">
            {currentTitle}
          </h1>
          {user ? <PiyasaPanoStrip /> : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 border-border text-foreground"
                  aria-label={`Hesap menüsü: ${user.username}`}
                >
                  {user.profil_foto ? (
                    <img
                      src={user.profil_foto}
                      alt={user.username}
                      className="h-5 w-5 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <User className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="max-w-[120px] truncate text-xs font-medium">
                    {user.username}
                  </span>
                  {user.rol && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ({user.rol})
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-medium text-foreground">
                      {user.username}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Firma: {user.firma ? user.firma.ad : "— (Platform)"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profil" className="cursor-pointer text-xs">
                    <User className="mr-2 h-3.5 w-3.5" />
                    Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/" className="cursor-pointer text-xs">
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                    Oturum & Yetkiler
                  </Link>
                </DropdownMenuItem>
                {uyelikler.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Firma / Rol Değiştir
                    </DropdownMenuLabel>
                    {uyelikler.map((u) => {
                      const isCurrent = user.firma?.id === u.firma_id;
                      return (
                        <DropdownMenuItem
                          key={u.id}
                          disabled={isCurrent || switchingFirmaId === u.firma_id}
                          onClick={() => void handleSwitchFirma(u.firma_id)}
                          className="cursor-pointer text-xs justify-between gap-2"
                        >
                          <span className="inline-flex items-center gap-1.5 truncate">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{u.firma_ad}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              ({u.rol})
                            </span>
                          </span>
                          {isCurrent ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
                {canStartActAs && (
                  <DropdownMenuItem
                    onClick={() => {
                      setActAsError(null);
                      setActAsOpen(true);
                    }}
                    className="cursor-pointer text-xs"
                  >
                    <UserCog className="mr-2 h-3.5 w-3.5" />
                    Kullanıcı Adına İşlem Yap
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onLogout && (
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="cursor-pointer text-xs text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Güvenli Çıkış
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-2 h-9">
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                <span>Giriş Yap</span>
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Dialog open={actAsOpen} onOpenChange={setActAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Farklı Kullanıcı Adına İşlem Yap</DialogTitle>
            <DialogDescription>
              İşlem yapmak istediğiniz kullanıcıyı ada veya firmaya göre arayıp seçin. Tüm işlemler denetim günlüğüne kaydedilir.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStartActAs} className="space-y-4">
            {actAsError && (
              <div
                className="rounded-[6px] border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
                role="alert"
              >
                {actAsError}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="header-act-as-user">Hedef Kullanıcı</Label>
              <RelationSelect
                id="header-act-as-user"
                value={targetUserId ? Number(targetUserId) : null}
                onChange={(val) => setTargetUserId(val ? String(val) : "")}
                placeholder="Kullanıcı ara ve seç…"
                searchPlaceholder="Kullanıcı adı veya e-posta yazın…"
                emptyText="Uygun kullanıcı bulunamadı"
                disabled={actAsLoading}
                loadOptions={async (q) => {
                  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
                  const res = await apiFetch<{
                    results?: Array<{
                      id: number;
                      kullanici_id?: number;
                      username: string;
                      rol: string;
                      firma_ad?: string;
                    }>;
                  }>(`/firma/kullanicilar/${qs}`);
                  const list = unwrapResults(res as never) as Array<{
                    id: number;
                    kullanici_id?: number;
                    username: string;
                    rol: string;
                    firma_ad?: string;
                  }>;
                  return list.map((u) => ({
                    value: u.kullanici_id ?? u.id,
                    label: u.username,
                    subtitle: [u.firma_ad, u.rol].filter(Boolean).join(" · "),
                  }));
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActAsOpen(false)}
                disabled={actAsLoading}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={actAsLoading || !targetUserId}>
                {actAsLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Başlatılıyor…
                  </span>
                ) : (
                  "Oturumu Devral"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
