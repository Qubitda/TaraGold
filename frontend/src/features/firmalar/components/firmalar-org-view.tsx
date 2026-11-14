"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Check,
  CheckSquare,
  MapPin,
  RefreshCw,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
  type RelationOption,
} from "@/components/crud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authService, useAuth } from "@/features/auth";
import {
  addressSchema,
  profilKeys,
  profilService,
  type AddressInput,
  type FirmaAdresi,
} from "@/features/profil";
import { useActionToast } from "@/hooks/use-action-toast";
import type { MeResponse } from "@/lib/api/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  firmalarKeys,
  useAddressesQuery,
  useApprovalsQuery,
  useInvitesQuery,
  useMeDashboardQuery,
  useMeQuery,
} from "../hooks";
import { inviteSchema, type InviteInput } from "../schemas";
import { firmalarService } from "../services";
import { opsFirmalarService } from "../services/ops-firmalar";

type TabId = "users" | "addresses" | "invites" | "approvals";

const ROLE_OPTIONS = [
  { value: "ALICI_SATINALMA", label: "Alıcı Satınalma" },
  { value: "ALICI_FINANS", label: "Alıcı Finans" },
  { value: "ALICI_YONETICI", label: "Alıcı Yönetici" },
  { value: "TEDARIKCI_SATIS", label: "Tedarikçi Satış" },
  { value: "TEDARIKCI_ATOLYE", label: "Tedarikçi Atölye" },
  { value: "TEDARIKCI_YONETICI", label: "Tedarikçi Yönetici" },
  { value: "PLATFORM_YONETICI", label: "Platform Yönetici" },
  { value: "PLATFORM_OPS", label: "Platform Operasyon" },
  { value: "PLATFORM_FINANS", label: "Platform Finans" },
];

function firmTypeLabel(firma: MeResponse["firma"]): string {
  if (!firma) return "—";
  const parts: string[] = [];
  if (firma.platform_mu) parts.push("Platform");
  if (firma.alici_mi) parts.push("Alıcı");
  if (firma.tedarikci_mi) parts.push("Tedarikçi");
  return parts.join(" · ") || "Firma";
}

export function FirmalarOrgView() {
  const actionToast = useActionToast();
  const qc = useQueryClient();
  const { refresh: refreshAuth } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [firmaUsersFilterId, setFirmaUsersFilterId] = useState<number | string | null>(null);
  const [firmaUsersFilterLabel, setFirmaUsersFilterLabel] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");

  const meQ = useMeQuery();
  const dashQ = useMeDashboardQuery();
  const approvalsQ = useApprovalsQuery();
  const invitesQ = useInvitesQuery();
  const addressesQ = useAddressesQuery();

  const me = meQ.data ?? null;
  const dashboard = dashQ.data ?? null;
  const approvals = approvalsQ.data ?? [];
  const invites = invitesQ.data ?? [];
  const addresses = addressesQ.data ?? [];

  // Address modal state
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<FirmaAdresi | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<FirmaAdresi | null>(null);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  // Invite modal
  const [createInviteOpen, setCreateInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["firma-kullanicilar", firmaUsersFilterId, userSearch],
    queryFn: () =>
      opsFirmalarService.listKullanicilar({
        ...(firmaUsersFilterId ? { firma_id: firmaUsersFilterId } : {}),
        ...(userSearch.trim() ? { q: userSearch.trim() } : {}),
      }),
  });

  const {
    register: registerAddress,
    handleSubmit: handleAddressSubmit,
    reset: resetAddress,
    formState: { errors: addressErrors, isDirty: isAddressDirty, isSubmitting: isAddressSubmitting },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      tip: "TESLIMAT",
      il: "",
      ilce: "",
      adres: "",
      varsayilan: true,
    },
  });

  const {
    register: registerInvite,
    handleSubmit: handleInviteSubmit,
    reset: resetInvite,
    setValue: setInviteValue,
    watch: watchInvite,
    formState: { errors: inviteErrors, isDirty: isInviteDirty, isSubmitting: isInviteSubmitting },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", rol: "ALICI_SATINALMA", firma_id: null },
  });

  const watchedInviteFirmaId = watchInvite("firma_id");

  const loadFirmaOptions = useCallback(async (qText: string): Promise<RelationOption[]> => {
    const res = await opsFirmalarService.list(qText ? { q: qText } : undefined);
    return (res.results ?? []).map((f) => ({
      value: f.id,
      label: f.ad,
      subtitle: f.firma_kodu,
    }));
  }, []);

  const updateUserM = useMutation({
    mutationFn: (vars: { userId: number; rol?: string; aktif?: boolean }) =>
      opsFirmalarService.updateKullanici(vars.userId, {
        ...(vars.rol !== undefined ? { rol: vars.rol } : {}),
        ...(vars.aktif !== undefined ? { aktif: vars.aktif } : {}),
      }),
    onSuccess: () => {
      actionToast.success("Kullanıcı güncellendi");
      void qc.invalidateQueries({ queryKey: ["firma-kullanicilar"] });
    },
    onError: (err: Error) => actionToast.error("Kullanıcı güncellenemedi", err.message),
  });

  const actAsUserM = useMutation({
    mutationFn: (userId: number) => authService.startActAs(userId),
    onSuccess: async (res) => {
      await refreshAuth();
      await qc.invalidateQueries();
      actionToast.success("Kullanıcı oturumu başlatıldı", res.target_username);
    },
    onError: (err: Error) => actionToast.error("İşlem başlatılamadı", err.message),
  });

  const fetchData = async () => {
    await Promise.all([
      meQ.refetch(),
      dashQ.refetch(),
      approvalsQ.refetch(),
      invitesQ.refetch(),
      addressesQ.refetch(),
      usersQ.refetch(),
    ]);
  };

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.durum === "BEKLEMEDE").length,
    [approvals]
  );

  const filteredAddresses = useMemo(() => {
    const term = addressSearch.trim().toLowerCase();
    if (!term) return addresses;
    return addresses.filter((a) =>
      `${a.tip} ${a.il} ${a.ilce ?? ""} ${a.adres}`.toLowerCase().includes(term)
    );
  }, [addresses, addressSearch]);

  const primaryCity =
    addresses.find((a) => a.varsayilan)?.il || addresses[0]?.il || null;

  const openCreateAddressModal = () => {
    setEditingAddress(null);
    setAddressFormError(null);
    resetAddress({
      tip: "TESLIMAT",
      il: "",
      ilce: "",
      adres: "",
      varsayilan: true,
    });
    setAddressModalOpen(true);
  };

  const openEditAddressModal = (addr: FirmaAdresi) => {
    setEditingAddress(addr);
    setAddressFormError(null);
    resetAddress({
      tip: addr.tip === "FATURA" ? "FATURA" : "TESLIMAT",
      il: addr.il || "",
      ilce: addr.ilce || "",
      adres: addr.adres || "",
      varsayilan: Boolean(addr.varsayilan),
    });
    setAddressModalOpen(true);
  };

  const onSaveAddressSubmit = async (formData: AddressInput) => {
    setAddressFormError(null);
    try {
      if (editingAddress) {
        await profilService.updateAddress(editingAddress.id, {
          tip: formData.tip,
          il: formData.il,
          ilce: formData.ilce,
          adres: formData.adres,
          varsayilan: formData.varsayilan,
        });
        actionToast.success("Firma adresi güncellendi");
      } else {
        await profilService.createAddress({
          tip: formData.tip,
          il: formData.il,
          ilce: formData.ilce,
          adres: formData.adres,
          varsayilan: formData.varsayilan,
        });
        actionToast.success("Firma adresi eklendi");
      }
      setAddressModalOpen(false);
      setEditingAddress(null);
      resetAddress();
      await qc.invalidateQueries({ queryKey: firmalarKeys.all });
      await qc.invalidateQueries({ queryKey: profilKeys.all });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Adres kaydedilemedi.";
      setAddressFormError(msg);
      actionToast.error("Adres kaydedilemedi", msg);
    }
  };

  const onDeleteAddressConfirm = async () => {
    if (!deletingAddress) return;
    try {
      await profilService.deleteAddress(deletingAddress.id);
      setDeletingAddress(null);
      actionToast.success("Firma adresi silindi");
      await qc.invalidateQueries({ queryKey: firmalarKeys.all });
      await qc.invalidateQueries({ queryKey: profilKeys.all });
    } catch (err) {
      actionToast.error("Adres silinemedi", err);
    }
  };

  const onCreateInviteSubmit = async (formData: InviteInput) => {
    setInviteError(null);
    try {
      await firmalarService.createInvite({
        email: formData.email,
        rol: formData.rol,
        ...(formData.firma_id ? { firma_id: formData.firma_id } : {}),
      });
      setCreateInviteOpen(false);
      resetInvite();
      actionToast.success("Davet gönderildi", formData.email);
      await invitesQ.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Davet gönderilemedi.";
      setInviteError(msg);
      actionToast.error("Davet gönderilemedi", msg);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await firmalarService.approveApproval(id);
      actionToast.success("Onay talebi onaylandı");
      await fetchData();
    } catch (err) {
      actionToast.error("Onaylama başarısız", err);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await firmalarService.rejectApproval(id);
      actionToast.success("Onay talebi reddedildi");
      await fetchData();
    } catch (err) {
      actionToast.error("Reddetme başarısız", err);
    }
  };

  const handleSubmitApproval = async (id: number) => {
    try {
      await firmalarService.submitApproval(id);
      actionToast.success("Onay talebi gönderildi");
      await fetchData();
    } catch (err) {
      actionToast.error("Gönderim başarısız", err);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Ekip, Adresler ve Kullanıcılar
          </h2>
          <p className="text-xs text-muted-foreground max-w-[60ch] leading-relaxed">
            Aktif firmanızın kullanıcı rollerini, teslimat/fatura adreslerini, onay taleplerini ve ekip davetlerini yönetin.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          onClick={() => void fetchData()}
          disabled={meQ.isLoading || usersQ.isLoading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${meQ.isLoading || usersQ.isLoading ? "animate-spin" : ""}`}
          />
          Yenile
        </Button>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Kullanıcılar" value={String((usersQ.data ?? []).length)} />
        <Stat label="Adresler" value={String(addresses.length)} />
        <Stat label="Davetler" value={String(invites.length)} />
        <Stat label="Bekleyen Onay" value={String(pendingApprovals)} />
      </div>

      {/* Oturum Firması Özeti */}
      <div className="rounded-[8px] border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Aktif Çalışma Firması</h3>
        </div>
        {!me?.firma ? (
          <div className="p-6 text-xs text-muted-foreground">Firma bilgisi bulunamadı.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma Adı</TableHead>
                <TableHead>Firma Kodu</TableHead>
                <TableHead>Firma Türü</TableHead>
                <TableHead>Aktif Kullanıcı</TableHead>
                <TableHead>Şehir</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">{me.firma.ad}</TableCell>
                <TableCell className="font-mono text-xs">
                  {dashboard?.firma_kodu || "—"}
                </TableCell>
                <TableCell className="text-xs">{firmTypeLabel(me.firma)}</TableCell>
                <TableCell className="text-xs font-mono">{me.username}</TableCell>
                <TableCell className="text-xs">{primaryCity || "—"}</TableCell>
                <TableCell>
                  <Badge variant={me.firma.aktif ? "success" : "secondary"} className="text-[10px]">
                    {me.firma.aktif ? "Aktif" : "Pasif"}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>

      {/* Alt Sekmeler */}
      <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-border bg-muted/40 p-1 w-fit">
        {(
          [
            ["users", "Kullanıcılar & Roller", (usersQ.data ?? []).length, UserCog],
            ["addresses", "Adresler", addresses.length, MapPin],
            ["invites", "Davetler", invites.length, Users],
            ["approvals", "Onay Talepleri", approvals.length, CheckSquare],
          ] as const
        ).map(([id, label, count, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === id
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>
              {label} ({count})
            </span>
          </button>
        ))}
      </div>

      {/* SEKME 1: FİRMA ADRESLERİ */}
      {activeTab === "addresses" ? (
        <ListPage
          title="Firma Adresleri"
          description="Firmanızın teslimat ve fatura adreslerini ekleyin, düzenleyin veya silin."
          createLabel="Yeni Adres Ekle"
          onCreate={openCreateAddressModal}
          searchValue={addressSearch}
          onSearchChange={setAddressSearch}
          searchPlaceholder="İl, ilçe veya açık adres ara…"
          loading={addressesQ.isLoading}
          error={addressesQ.isError ? "Adres listesi alınamadı." : null}
          onRetry={() => void addressesQ.refetch()}
          isEmpty={!addressesQ.isLoading && filteredAddresses.length === 0}
          emptyTitle="Kayıtlı adres bulunamadı"
          emptyDescription="Teslimat veya fatura için yeni bir firma adresi ekleyebilirsiniz."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tip</TableHead>
                <TableHead>İl / İlçe</TableHead>
                <TableHead>Açık Adres</TableHead>
                <TableHead>Varsayılan</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAddresses.map((addr) => (
                <TableRow key={addr.id}>
                  <TableCell>
                    <Badge
                      variant={addr.tip === "TESLIMAT" ? "default" : "secondary"}
                      className="font-mono text-[10px]"
                    >
                      {addr.tip}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {addr.il}
                    {addr.ilce ? ` / ${addr.ilce}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                    {addr.adres}
                  </TableCell>
                  <TableCell>
                    {addr.varsayilan ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        VARSAYILAN
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={`${addr.il} adresi`}
                      onEdit={() => openEditAddressModal(addr as FirmaAdresi)}
                      onDelete={() => setDeletingAddress(addr as FirmaAdresi)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* SEKME 2: ONAY TALEPLERİ */}
      {activeTab === "approvals" ? (
        <ListPage
          title="İç Onay Talepleri"
          description="Limit veya yönetici onayı gerektiren satınalma taleplerini inceleyin ve karara bağlayın."
          loading={approvalsQ.isLoading}
          error={approvalsQ.isError ? "Onay talepleri alınamadı." : null}
          onRetry={() => void approvalsQ.refetch()}
          isEmpty={!approvalsQ.isLoading && approvals.length === 0}
          emptyTitle="Onay talebi bulunamadı"
          emptyDescription="Şu an bekleyen veya geçmiş bir onay talebi yok."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Gerekçe</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.map((a) => {
                const actions = a.allowed_actions || [];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.olusturma_tarihi ? formatDateTime(a.olusturma_tarihi) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">
                      {formatMoney(a.tutar, a.para_birimi || "TRY")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                      {a.gerekce || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.durum === "ONAYLANDI"
                            ? "success"
                            : a.durum === "REDDEDILDI"
                              ? "destructive"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {a.durum}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {actions.includes("submit") ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => void handleSubmitApproval(a.id)}
                          >
                            Onaya Gönder
                          </Button>
                        ) : null}
                        {actions.includes("approve") ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => void handleApprove(a.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Onayla
                          </Button>
                        ) : null}
                        {actions.includes("reject") ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => void handleReject(a.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reddet
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* SEKME 3: EKİP DAVETLERİ */}
      {activeTab === "invites" ? (
        <ListPage
          title="Ekip Davetleri"
          description="Firmaya yeni kullanıcı davetleri gönderin ve bekleyen davetlerin geçerlilik süresini izleyin."
          createLabel="Yeni Davet Gönder"
          onCreate={() => {
            setInviteError(null);
            resetInvite({ email: "", rol: "ALICI_SATINALMA", firma_id: null });
            setCreateInviteOpen(true);
          }}
          loading={invitesQ.isLoading}
          error={invitesQ.isError ? "Davet listesi alınamadı." : null}
          onRetry={() => void invitesQ.refetch()}
          isEmpty={!invitesQ.isLoading && invites.length === 0}
          emptyTitle="Bekleyen davet bulunmuyor"
          emptyDescription="Ekibinize katmak istediğiniz kullanıcıların e-posta adresine davet gönderebilirsiniz."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-posta Adresi</TableHead>
                <TableHead>Atanan Rol</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Son Geçerlilik</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {ROLE_OPTIONS.find((r) => r.value === inv.rol)?.label || inv.rol}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {inv.firma_ad || me?.firma?.ad || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={inv.expired ? "destructive" : "warning"}
                      className="text-[10px]"
                    >
                      {inv.expired ? "Süresi Doldu" : "Kabul Bekliyor"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.expires_at ? formatDateTime(inv.expires_at) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* SEKME 4: KULLANICILAR & ROLLER */}
      {activeTab === "users" ? (
        <ListPage
          title="Kullanıcılar ve Yetki Rolleri"
          description="Kullanıcıların erişim rollerini değiştirin veya hesapları aktif/pasif duruma getirin."
          searchValue={userSearch}
          onSearchChange={setUserSearch}
          searchPlaceholder="Kullanıcı adı, ad soyad veya e-posta ara…"
          filters={
            me?.capabilities?.can_view_ops ? (
              <div className="w-64">
                <RelationSelect
                  value={firmaUsersFilterId}
                  selectedLabel={firmaUsersFilterLabel}
                  onChange={(val, opt) => {
                    setFirmaUsersFilterId(val);
                    setFirmaUsersFilterLabel(opt?.label ?? "");
                  }}
                  loadOptions={loadFirmaOptions}
                  placeholder="Tüm firmalar (Filtrele)…"
                  clearable
                />
              </div>
            ) : undefined
          }
          loading={usersQ.isLoading}
          error={usersQ.isError ? "Kullanıcı listesi alınamadı." : null}
          onRetry={() => void usersQ.refetch()}
          isEmpty={!usersQ.isLoading && (usersQ.data ?? []).length === 0}
          emptyTitle="Kullanıcı bulunamadı"
          emptyDescription="Seçilen arama veya firma filtresine uygun kullanıcı yok."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad / Kullanıcı Adı</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQ.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {u.ad_soyad || u.username}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      @{u.username}
                      {u.email ? ` · ${u.email}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.firma_ad || me?.firma?.ad || "—"}
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label={`${u.username} rolü`}
                      value={u.rol}
                      disabled={updateUserM.isPending}
                      onChange={(e) =>
                        updateUserM.mutate({
                          userId: u.kullanici_id,
                          rol: e.target.value,
                        })
                      }
                      className="h-8 rounded-[6px] border border-border bg-background px-2 text-xs"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.aktif ? "success" : "secondary"}
                      className="text-[10px]"
                    >
                      {u.aktif ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={u.ad_soyad || u.username}
                      isActive={u.aktif}
                      onToggleActive={() =>
                        updateUserM
                          .mutateAsync({ userId: u.kullanici_id, aktif: !u.aktif })
                          .then(() => undefined)
                      }
                      extraActions={
                        me?.capabilities?.can_act_as
                          ? [
                              {
                                label: "Bu Kullanıcı Adına İşlem Yap",
                                icon: <UserCog className="h-3.5 w-3.5" />,
                                onClick: () =>
                                  actAsUserM
                                    .mutateAsync(u.kullanici_id)
                                    .then(() => undefined),
                              },
                            ]
                          : []
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* MODAL: FİRMA ADRESİ EKLE / DÜZENLE */}
      <EntityModal
        open={addressModalOpen}
        onOpenChange={(open) => {
          setAddressModalOpen(open);
          if (!open) setEditingAddress(null);
        }}
        title={editingAddress ? "Firma Adresini Düzenle" : "Yeni Firma Adresi"}
        description="Teslimat veya fatura adresi bilgilerini girin."
        size="sm"
        error={addressFormError}
        isDirty={isAddressDirty}
        isSubmitting={isAddressSubmitting}
        submitLabel="Kaydet"
        onSubmit={handleAddressSubmit(onSaveAddressSubmit)}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="addr-tip" className="text-xs">Adres Türü *</Label>
            <select
              id="addr-tip"
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs"
              disabled={isAddressSubmitting}
              {...registerAddress("tip")}
            >
              <option value="TESLIMAT">Teslimat Adresi</option>
              <option value="FATURA">Fatura Adresi</option>
            </select>
            {addressErrors.tip ? (
              <span className="text-[11px] text-destructive">{addressErrors.tip.message}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="addr-il" className="text-xs">İl *</Label>
              <Input id="addr-il" disabled={isAddressSubmitting} {...registerAddress("il")} />
              {addressErrors.il ? (
                <span className="text-[11px] text-destructive">{addressErrors.il.message}</span>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-ilce" className="text-xs">İlçe</Label>
              <Input id="addr-ilce" disabled={isAddressSubmitting} {...registerAddress("ilce")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addr-adres" className="text-xs">Açık Adres *</Label>
            <Input id="addr-adres" disabled={isAddressSubmitting} {...registerAddress("adres")} />
            {addressErrors.adres ? (
              <span className="text-[11px] text-destructive">{addressErrors.adres.message}</span>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-[4px] border-border"
              disabled={isAddressSubmitting}
              {...registerAddress("varsayilan")}
            />
            Varsayılan adres
          </label>
        </div>
      </EntityModal>

      {/* MODAL: EKİP DAVETİ GÖNDER */}
      <EntityModal
        open={createInviteOpen}
        onOpenChange={setCreateInviteOpen}
        title="Ekip Daveti Gönder"
        description="Davet edilen e-posta adresine kayıt bağlantısı gönderilir."
        error={inviteError}
        isDirty={isInviteDirty}
        isSubmitting={isInviteSubmitting}
        submitLabel="Davet Gönder"
        onSubmit={handleInviteSubmit(onCreateInviteSubmit)}
      >
        <div className="space-y-3">
          {me?.capabilities?.can_view_ops ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Firma (Boş bırakılırsa aktif firmanız)</Label>
              <RelationSelect
                value={watchedInviteFirmaId ?? null}
                onChange={(val) =>
                  setInviteValue("firma_id", val ? Number(val) : null, { shouldDirty: true })
                }
                loadOptions={loadFirmaOptions}
                placeholder="Aktif firma veya başka firma seçin…"
                clearable
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="inv-email" className="text-xs">E-posta Adresi *</Label>
            <Input
              id="inv-email"
              type="email"
              placeholder="personel@firma.com"
              disabled={isInviteSubmitting}
              {...registerInvite("email")}
            />
            {inviteErrors.email ? (
              <span className="text-[11px] text-destructive">
                {inviteErrors.email.message}
              </span>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-role" className="text-xs">Atanacak Rol *</Label>
            <select
              id="inv-role"
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs"
              disabled={isInviteSubmitting}
              {...registerInvite("rol")}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </EntityModal>

      <ConfirmDialog
        open={Boolean(deletingAddress)}
        onOpenChange={(open) => {
          if (!open) setDeletingAddress(null);
        }}
        title="Adresi Sil"
        description={`${deletingAddress?.il || "Bu"} adresi kalıcı olarak silinecek.`}
        confirmLabel="Evet, Sil"
        variant="destructive"
        onConfirm={onDeleteAddressConfirm}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-card p-4 space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-mono tabular-nums">{value}</div>
    </div>
  );
}
