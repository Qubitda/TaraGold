"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { firmalarService } from "../services";
import {
  addressSchema,
  profileSchema,
  type AddressInput,
  type ProfileInput,
} from "../schemas";
import type { FirmaAdresi, MeProfile } from "../types";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, EntityModal, RowActions } from "@/components/crud";
import {
  User,
  MapPin,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export function ProfileAddressesView() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [addresses, setAddresses] = useState<FirmaAdresi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<FirmaAdresi | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<FirmaAdresi | null>(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { isSubmitting: isProfileSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "" },
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
      il: "İstanbul",
      ilce: "Fatih",
      adres: "",
      varsayilan: true,
    },
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, addressRes] = await Promise.allSettled([
        firmalarService.getProfile(),
        firmalarService.getAddresses(),
      ]);

      if (profileRes.status === "fulfilled") {
        setProfile(profileRes.value);
        resetProfile({
          first_name: profileRes.value.first_name || "",
          last_name: profileRes.value.last_name || "",
        });
      }
      if (addressRes.status === "fulfilled") {
        setAddresses(addressRes.value?.results || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil ve adres bilgisi alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onProfileSave = async (data: ProfileInput) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await firmalarService.updateProfile(data);
      setProfile(updated);
      setSuccessMsg("Profil bilgileri başarıyla güncellendi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil kaydedilemedi.");
    }
  };

  const openCreateAddressModal = () => {
    setEditingAddress(null);
    resetAddress({
      tip: "TESLIMAT",
      il: "İstanbul",
      ilce: "Fatih",
      adres: "",
      varsayilan: true,
    });
    setAddressModalOpen(true);
  };

  const openEditAddressModal = (addr: FirmaAdresi) => {
    setEditingAddress(addr);
    resetAddress({
      tip: addr.tip === "FATURA" ? "FATURA" : "TESLIMAT",
      il: addr.il || "",
      ilce: addr.ilce || "",
      adres: addr.adres || "",
      varsayilan: Boolean(addr.varsayilan),
    });
    setAddressModalOpen(true);
  };

  const onAddressSave = async (data: AddressInput) => {
    setError(null);
    setSuccessMsg(null);
    try {
      if (editingAddress) {
        await firmalarService.updateAddress(editingAddress.id, data);
        setSuccessMsg("Adres başarıyla güncellendi.");
      } else {
        await firmalarService.createAddress(data);
        setSuccessMsg("Yeni adres başarıyla kaydedildi.");
      }
      setAddressModalOpen(false);
      setEditingAddress(null);
      resetAddress();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adres kaydedilemedi.");
    }
  };

  const confirmDeleteAddress = async () => {
    if (!deletingAddress) return;
    try {
      await firmalarService.deleteAddress(deletingAddress.id);
      setDeletingAddress(null);
      await fetchData();
      setSuccessMsg("Adres silindi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adres silinemedi.");
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Kullanıcı Profili &amp; Firma Adresleri
        </h1>
        <p className="text-xs text-muted-foreground">
          Kişisel hesap ayarlarınız, fatura ve zırhlı kargo teslimat adreslerinizin yönetimi.
        </p>
      </div>

      {successMsg ? (
        <div className="flex items-center gap-2 rounded-[6px] border border-border bg-muted/60 p-3 text-xs text-foreground font-medium">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {error ? (
        <div
          className="flex items-center justify-between rounded-[8px] border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            className="h-8 border-destructive/30"
          >
            Yeniden Dene
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-48 w-full items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Veriler alınıyor…</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="rounded-[8px] border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Kişisel Bilgiler</h2>
            </div>

            <form
              onSubmit={handleProfileSubmit(onProfileSave)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prof-first">Ad</Label>
                <Input
                  id="prof-first"
                  placeholder="Adınız"
                  disabled={isProfileSubmitting}
                  {...registerProfile("first_name")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prof-last">Soyad</Label>
                <Input
                  id="prof-last"
                  placeholder="Soyadınız"
                  disabled={isProfileSubmitting}
                  {...registerProfile("last_name")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prof-email">E-posta</Label>
                <Input id="prof-email" type="email" value={profile?.email || ""} disabled readOnly />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prof-username">Kullanıcı Adı</Label>
                <Input
                  id="prof-username"
                  value={profile?.username || ""}
                  disabled
                  readOnly
                  className="font-mono"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={isProfileSubmitting}>
                  {isProfileSubmitting ? "Kaydediliyor…" : "Profili Güncelle"}
                </Button>
              </div>
            </form>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Kayıtlı Firma Adresleri (Teslimat &amp; Fatura)
                </h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={openCreateAddressModal}
                className="h-8 text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Yeni Adres Ekle</span>
              </Button>
            </div>

            <div className="rounded-[8px] border border-border bg-card overflow-hidden">
              {addresses.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Tanımlı teslimat veya fatura adresi bulunmamaktadır.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Adres Tipi</TableHead>
                      <TableHead>İl / İlçe</TableHead>
                      <TableHead>Açık Adres</TableHead>
                      <TableHead>Varsayılan</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addresses.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge
                            variant={a.tip === "TESLIMAT" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {a.tip === "TESLIMAT" ? "Teslimat" : "Fatura"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {a.il} {a.ilce ? `/ ${a.ilce}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-sm truncate">
                          {a.adres}
                        </TableCell>
                        <TableCell>
                          {a.varsayilan ? (
                            <Badge variant="outline" className="text-[10px]">
                              Varsayılan
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={`${a.il} adresi`}
                            onEdit={() => openEditAddressModal(a)}
                            onDelete={() => setDeletingAddress(a)}
                            inline
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}

      <EntityModal
        open={addressModalOpen}
        onOpenChange={(open) => {
          setAddressModalOpen(open);
          if (!open) setEditingAddress(null);
        }}
        title={editingAddress ? "Adresi Düzenle" : "Yeni Adres Tanımı"}
        description={
          editingAddress
            ? "Mevcut firma adresi bilgilerini güncelleyin."
            : "Sigortalı teslimat veya e-fatura için firma adresi ekleyin."
        }
        size="sm"
        isDirty={isAddressDirty}
        isSubmitting={isAddressSubmitting}
        submitLabel="Adresi Kaydet"
        onSubmit={handleAddressSubmit(onAddressSave)}
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-tip" className="text-xs">Adres Türü</Label>
            <select
              id="addr-tip"
              className="h-9 w-full rounded-[6px] border border-input bg-background px-3 py-1 text-xs"
              disabled={isAddressSubmitting}
              {...registerAddress("tip")}
            >
              <option value="TESLIMAT">Teslimat Adresi (Zırhlı Kargo)</option>
              <option value="FATURA">Fatura Adresi (Resmi)</option>
            </select>
            {addressErrors.tip ? (
              <span className="text-[11px] text-destructive">{addressErrors.tip.message}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addr-il" className="text-xs">İl</Label>
              <Input
                id="addr-il"
                placeholder="Örn: İstanbul"
                disabled={isAddressSubmitting}
                {...registerAddress("il")}
              />
              {addressErrors.il ? (
                <span className="text-[11px] text-destructive">{addressErrors.il.message}</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addr-ilce" className="text-xs">İlçe</Label>
              <Input
                id="addr-ilce"
                placeholder="Örn: Fatih"
                disabled={isAddressSubmitting}
                {...registerAddress("ilce")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-text" className="text-xs">Açık Adres</Label>
            <Input
              id="addr-text"
              placeholder="Kapalıçarşı Kalpakçılar Cad. No: 42"
              disabled={isAddressSubmitting}
              {...registerAddress("adres")}
            />
            {addressErrors.adres ? (
              <span className="text-[11px] text-destructive">{addressErrors.adres.message}</span>
            ) : null}
          </div>

          <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-[4px] border-border"
              disabled={isAddressSubmitting}
              {...registerAddress("varsayilan")}
            />
            Bu adresi varsayılan olarak belirle
          </label>
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
        onConfirm={confirmDeleteAddress}
      />
    </div>
  );
}
