"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
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
import { useActionToast } from "@/hooks/use-action-toast";
import { urunlerService } from "@/features/urunler/services";
import {
  feedService,
  opsFirmalarService,
  type FeedResponse,
  type OpsAliciKanalErisimi,
  type OpsApiAnahtar,
  type OpsFirma,
  type OpsFirmaAdres,
  type OpsFirmaBanka,
  type OpsFirmaBelge,
  type OpsFirmaKontak,
  type OpsKanalIzni,
} from "../services/ops-firmalar";

type OpsTab = "firmalar" | "kanal_izinleri" | "alici_erisimleri";
type FirmaDetailTab = "genel" | "kontaklar" | "adresler" | "banka" | "belgeler";

const FIRMA_DURUM_LABELS: Record<string, string> = {
  TASLAK: "Taslak",
  ONAY_BEKLIYOR: "Onay Bekliyor",
  AKTIF: "Aktif",
  ASKIDA: "Askıda",
  REDDEDILDI: "Reddedildi",
};

const KANAL_IZIN_LABELS: Record<string, string> = {
  ISTENDI: "Onay Bekliyor",
  BEKLEMEDE: "Onay Bekliyor",
  ONAYLI: "Onaylandı",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
};

const ROL_OPTIONS = [
  { value: "FIRMA_ADMIN", label: "Firma Yöneticisi" },
  { value: "ALICI_YONETICI", label: "Alıcı Yönetici" },
  { value: "ALICI_SATINALMA", label: "Alıcı Satınalma" },
  { value: "TEDARIKCI_YONETICI", label: "Tedarikçi Yönetici" },
  { value: "TEDARIKCI_SATIS", label: "Tedarikçi Satış" },
];

export function OpsFirmalarView() {
  const toast = useActionToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<OpsTab>("firmalar");

  // Firmalar list filters & pagination
  const [q, setQ] = useState("");
  const [durumFilter, setDurumFilter] = useState("");
  const [tipFilter, setTipFilter] = useState<"" | "alici" | "tedarikci">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Create Firma modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    ad: "",
    firma_kodu: "",
    vergi_no: "",
    alici_mi: true,
    tedarikci_mi: false,
    api_musterisi_mi: false,
    vade_gun: "0",
    email: "",
    rol: "FIRMA_ADMIN",
  });
  const [createError, setCreateError] = useState<string | null>(null);

  // Firma Detail / Edit modal
  const [detailFirmaId, setDetailFirmaId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<FirmaDetailTab>("genel");
  const [editDraft, setEditDraft] = useState({
    ad: "",
    unvan: "",
    vergi_no: "",
    vergi_dairesi: "",
    mersis_no: "",
    ticaret_sicil_no: "",
    oda_adi: "",
    oda_kayit_no: "",
    web_sitesi: "",
    telefon: "",
    eposta: "",
    vade_gun: "",
    alici_mi: false,
    tedarikci_mi: false,
    api_musterisi_mi: false,
  });

  // Subresources editing states
  const [editingKontakId, setEditingKontakId] = useState<number | null>(null);
  const [kontakDraft, setKontakDraft] = useState({
    ad_soyad: "",
    departman: "",
    gorev: "",
    telefon: "",
    eposta: "",
    birincil: true,
    notlar: "",
  });

  const [editingAdresId, setEditingAdresId] = useState<number | null>(null);
  const [adresDraft, setAdresDraft] = useState({
    tip: "TESLIMAT",
    il: "",
    ilce: "",
    adres: "",
    varsayilan: true,
  });

  const [editingBankaId, setEditingBankaId] = useState<number | null>(null);
  const [bankaDraft, setBankaDraft] = useState({
    banka_adi: "",
    iban: "",
    swift_bic: "",
    para_birimi: "TRY",
    aktif: true,
  });

  const [belgeDraft, setBelgeDraft] = useState({
    tip: "VERGI_LEVHASI",
    baslik: "",
    storage_key: "",
    content_type: "application/pdf",
  });

  const [subConfirm, setSubConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // API Anahtarları modal
  const [apiKeyFirma, setApiKeyFirma] = useState<OpsFirma | null>(null);
  const [keyAd, setKeyAd] = useState("Entegrasyon Anahtarı");
  const [lastPlaintext, setLastPlaintext] = useState<string | null>(null);
  const [feedApiKey, setFeedApiKey] = useState("");
  const [feedFormat, setFeedFormat] = useState<"json" | "xml">("json");
  const [feedUrunId, setFeedUrunId] = useState<number | string | null>(null);
  const [feedUrunLabel, setFeedUrunLabel] = useState<string>("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedResult, setFeedResult] = useState<FeedResponse | null>(null);

  // Tedarikçi Kanal İzinleri filters
  const [kanalQ, setKanalQ] = useState("");
  const [kanalDurum, setKanalDurum] = useState("");
  const [kanalPage, setKanalPage] = useState(1);

  // Alıcı / API Kanal Erişimleri filters + modal
  const [erisimQ, setErisimQ] = useState("");
  const [erisimPage, setErisimPage] = useState(1);
  const [erisimModalOpen, setErisimModalOpen] = useState(false);
  const [editingErisim, setEditingErisim] = useState<OpsAliciKanalErisimi | null>(null);
  const [erisimForm, setErisimForm] = useState<{
    firma_id: number | string | null;
    firma_ad?: string;
    satis_kanali_id: number | string | null;
    satis_kanali_label?: string;
    fiyat_grubu_id: number | string | null;
    fiyat_grubu_label?: string;
    aktif: boolean;
  }>({
    firma_id: null,
    satis_kanali_id: null,
    fiyat_grubu_id: null,
    aktif: true,
  });
  const [erisimError, setErisimError] = useState<string | null>(null);

  // Queries
  const listQ = useQuery({
    queryKey: ["ops-firmalar", q, durumFilter, tipFilter, page, pageSize],
    queryFn: () => {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
      };
      if (q.trim()) params.q = q.trim();
      if (durumFilter) params.durum = durumFilter;
      if (tipFilter === "alici") params.alici_mi = "true";
      if (tipFilter === "tedarikci") params.tedarikci_mi = "true";
      return opsFirmalarService.list(params);
    },
  });

  const keysQ = useQuery({
    queryKey: ["ops-firma-api-keys", apiKeyFirma?.id],
    queryFn: () => opsFirmalarService.listApiAnahtarlar(apiKeyFirma!.id),
    enabled: apiKeyFirma != null,
  });

  const detailQ = useQuery({
    queryKey: ["ops-firma-detail", detailFirmaId],
    queryFn: () => opsFirmalarService.get(detailFirmaId!),
    enabled: detailFirmaId != null,
  });

  const kontaklarQ = useQuery({
    queryKey: ["ops-firma-kontaklar", detailFirmaId],
    queryFn: () => opsFirmalarService.listKontaklar(detailFirmaId!),
    enabled: detailFirmaId != null && detailTab === "kontaklar",
  });

  const adreslerQ = useQuery({
    queryKey: ["ops-firma-adresler", detailFirmaId],
    queryFn: () => opsFirmalarService.listAdresler(detailFirmaId!),
    enabled: detailFirmaId != null && detailTab === "adresler",
  });

  const bankaQ = useQuery({
    queryKey: ["ops-firma-banka", detailFirmaId],
    queryFn: () => opsFirmalarService.listBanka(detailFirmaId!),
    enabled: detailFirmaId != null && detailTab === "banka",
  });

  const belgelerQ = useQuery({
    queryKey: ["ops-firma-belgeler", detailFirmaId],
    queryFn: () => opsFirmalarService.listBelgeler(detailFirmaId!),
    enabled: detailFirmaId != null && detailTab === "belgeler",
  });

  const kanalIzinleriQ = useQuery({
    queryKey: ["ops-kanal-izinleri", kanalDurum, kanalQ, kanalPage],
    queryFn: () => {
      const p: Record<string, string> = { page: String(kanalPage), page_size: "20" };
      if (kanalDurum) p.durum = kanalDurum;
      if (kanalQ.trim()) p.q = kanalQ.trim();
      return opsFirmalarService.listKanalIzinleri(p);
    },
  });

  const aliciKanalErisimQ = useQuery({
    queryKey: ["ops-alici-kanal-erisimleri", erisimQ, erisimPage],
    queryFn: () => {
      const p: Record<string, string> = { page: String(erisimPage), page_size: "20" };
      if (erisimQ.trim()) p.q = erisimQ.trim();
      return opsFirmalarService.listAliciKanalErisimleri(p);
    },
  });

  useEffect(() => {
    if (!detailQ.data) return;
    const f = detailQ.data;
    const tips = f.tipler ?? [];
    setEditDraft({
      ad: f.ad || "",
      unvan: f.unvan || "",
      vergi_no: f.vergi_no || "",
      vergi_dairesi: f.vergi_dairesi || "",
      mersis_no: f.mersis_no || "",
      ticaret_sicil_no: f.ticaret_sicil_no || "",
      oda_adi: f.oda_adi || "",
      oda_kayit_no: f.oda_kayit_no || "",
      web_sitesi: f.web_sitesi || "",
      telefon: f.telefon || "",
      eposta: f.eposta || "",
      vade_gun: f.vade_gun != null ? String(f.vade_gun) : "0",
      alici_mi: f.alici_mi || tips.includes("ALICI_KUYUMCU"),
      tedarikci_mi: f.tedarikci_mi || tips.includes("TEDARIKCI"),
      api_musterisi_mi: tips.includes("API_MUSTERISI"),
    });
  }, [detailQ.data]);

  // Relation loaders (zero raw IDs!)
  const loadAliciFirmaOptions = useCallback(async (queryText: string): Promise<RelationOption[]> => {
    const res = await opsFirmalarService.list({
      alici_mi: "true",
      ...(queryText ? { q: queryText } : {}),
    });
    return (res.results ?? []).map((f) => ({
      value: f.id,
      label: f.ad,
      subtitle: f.firma_kodu,
    }));
  }, []);

  const loadSalesChannelOptions = useCallback(async (queryText: string): Promise<RelationOption[]> => {
    const res = await opsFirmalarService.listSalesChannels();
    const list = Array.isArray(res) ? res : res.results ?? [];
    const ql = queryText.trim().toLowerCase();
    return list
      .filter((c) => !ql || `${c.kod} ${c.ad}`.toLowerCase().includes(ql))
      .map((c) => ({
        value: c.id,
        label: c.ad,
        subtitle: c.kod,
      }));
  }, []);

  const loadFiyatGrubuOptions = useCallback(async (queryText: string): Promise<RelationOption[]> => {
    const res = await opsFirmalarService.listFiyatGruplari(queryText || undefined);
    return (res.results ?? []).map((g) => ({
      value: g.id,
      label: g.ad,
      subtitle: g.kod,
    }));
  }, []);

  const loadProductOptions = useCallback(async (queryText: string): Promise<RelationOption[]> => {
    const res = await urunlerService.getOpsProducts({
      ...(queryText ? { q: queryText } : {}),
      page_size: "20",
    });
    return (res.results ?? []).map((p) => ({
      value: p.id,
      label: p.ad,
      subtitle: p.platform_kodu,
    }));
  }, []);

  // Mutations
  const createM = useMutation({
    mutationFn: async () => {
      setCreateError(null);
      if (!createForm.ad.trim() || !createForm.firma_kodu.trim()) {
        throw new Error("Firma adı ve firma kodu zorunludur.");
      }
      if (!createForm.alici_mi && !createForm.tedarikci_mi && !createForm.api_musterisi_mi) {
        throw new Error("En az bir firma rolü (Alıcı, Tedarikçi veya API Müşterisi) seçin.");
      }
      const tipler: string[] = [];
      if (createForm.alici_mi) tipler.push("ALICI_KUYUMCU");
      if (createForm.tedarikci_mi) tipler.push("TEDARIKCI");
      if (createForm.api_musterisi_mi) tipler.push("API_MUSTERISI");

      const f = await opsFirmalarService.create({
        ad: createForm.ad.trim(),
        firma_kodu: createForm.firma_kodu.trim().toUpperCase(),
        vergi_no: createForm.vergi_no.trim() || undefined,
        alici_mi: createForm.alici_mi || createForm.api_musterisi_mi,
        tedarikci_mi: createForm.tedarikci_mi,
        vade_gun: Number(createForm.vade_gun || 0),
        tipler,
      });
      if (createForm.email.trim()) {
        await opsFirmalarService.davet(f.id, {
          email: createForm.email.trim(),
          rol: createForm.rol,
        });
      }
      return f;
    },
    onSuccess: () => {
      toast.success("Firma başarıyla oluşturuldu");
      setCreateOpen(false);
      setCreateForm({
        ad: "",
        firma_kodu: "",
        vergi_no: "",
        alici_mi: true,
        tedarikci_mi: false,
        api_musterisi_mi: false,
        vade_gun: "0",
        email: "",
        rol: "FIRMA_ADMIN",
      });
      void qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
    },
    onError: (e: Error) => {
      setCreateError(e.message || "Firma kaydedilemedi.");
      toast.error("Firma oluşturulamadı", e.message);
    },
  });

  const onayM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.onayla(id),
    onSuccess: () => {
      toast.success("Firma aktifleştirildi");
      void qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      if (detailFirmaId != null) {
        void qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
      }
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const askiyaAlM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.askiyaAl(id),
    onSuccess: () => {
      toast.success("Firma askıya alındı");
      void qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      if (detailFirmaId != null) {
        void qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
      }
    },
    onError: (e: Error) => toast.error("Askıya alma başarısız", e.message),
  });

  const deleteFirmaM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.delete(id),
    onSuccess: () => {
      toast.success("Firma silindi");
      void qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
    },
    onError: (e: Error) => toast.error("Firma silinemedi", e.message),
  });

  const updateFirmaM = useMutation({
    mutationFn: () => {
      const tipler: string[] = [];
      if (editDraft.alici_mi) tipler.push("ALICI_KUYUMCU");
      if (editDraft.tedarikci_mi) tipler.push("TEDARIKCI");
      if (editDraft.api_musterisi_mi) tipler.push("API_MUSTERISI");
      const body: Record<string, unknown> = {
        ad: editDraft.ad,
        unvan: editDraft.unvan,
        vergi_no: editDraft.vergi_no,
        vergi_dairesi: editDraft.vergi_dairesi,
        mersis_no: editDraft.mersis_no,
        ticaret_sicil_no: editDraft.ticaret_sicil_no,
        oda_adi: editDraft.oda_adi,
        oda_kayit_no: editDraft.oda_kayit_no,
        web_sitesi: editDraft.web_sitesi,
        telefon: editDraft.telefon,
        eposta: editDraft.eposta,
        tipler,
      };
      if (editDraft.vade_gun.trim() !== "") {
        body.vade_gun = Number(editDraft.vade_gun);
      }
      return opsFirmalarService.update(detailFirmaId!, body);
    },
    onSuccess: () => {
      toast.success("Firma bilgileri güncellendi");
      void qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      void qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Güncelleme başarısız", e.message),
  });

  const saveKontakM = useMutation({
    mutationFn: () =>
      editingKontakId
        ? opsFirmalarService.updateKontak(detailFirmaId!, editingKontakId, kontakDraft)
        : opsFirmalarService.createKontak(detailFirmaId!, kontakDraft),
    onSuccess: () => {
      toast.success(editingKontakId ? "Yetkili kişi güncellendi" : "Yetkili kişi eklendi");
      setEditingKontakId(null);
      setKontakDraft({
        ad_soyad: "",
        departman: "",
        gorev: "",
        telefon: "",
        eposta: "",
        birincil: true,
        notlar: "",
      });
      void qc.invalidateQueries({ queryKey: ["ops-firma-kontaklar", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Yetkili kişi kaydedilemedi", e.message),
  });

  const saveAdresM = useMutation({
    mutationFn: () =>
      editingAdresId
        ? opsFirmalarService.updateAdres(detailFirmaId!, editingAdresId, adresDraft)
        : opsFirmalarService.createAdres(detailFirmaId!, adresDraft),
    onSuccess: () => {
      toast.success(editingAdresId ? "Adres güncellendi" : "Adres eklendi");
      setEditingAdresId(null);
      setAdresDraft({ tip: "TESLIMAT", il: "", ilce: "", adres: "", varsayilan: true });
      void qc.invalidateQueries({ queryKey: ["ops-firma-adresler", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Adres kaydedilemedi", e.message),
  });

  const saveBankaM = useMutation({
    mutationFn: () =>
      editingBankaId
        ? opsFirmalarService.updateBanka(detailFirmaId!, editingBankaId, bankaDraft)
        : opsFirmalarService.createBanka(detailFirmaId!, bankaDraft),
    onSuccess: () => {
      toast.success(editingBankaId ? "Banka hesabı güncellendi" : "Banka hesabı eklendi");
      setEditingBankaId(null);
      setBankaDraft({ banka_adi: "", iban: "", swift_bic: "", para_birimi: "TRY", aktif: true });
      void qc.invalidateQueries({ queryKey: ["ops-firma-banka", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Banka hesabı kaydedilemedi", e.message),
  });

  const createBelgeM = useMutation({
    mutationFn: () => opsFirmalarService.createBelge(detailFirmaId!, belgeDraft),
    onSuccess: () => {
      toast.success("Belge kaydı eklendi");
      setBelgeDraft({
        tip: "VERGI_LEVHASI",
        baslik: "",
        storage_key: "",
        content_type: "application/pdf",
      });
      void qc.invalidateQueries({ queryKey: ["ops-firma-belgeler", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Belge eklenemedi", e.message),
  });

  const createKeyM = useMutation({
    mutationFn: () =>
      opsFirmalarService.createApiAnahtar(apiKeyFirma!.id, {
        ad: keyAd || "Entegrasyon Anahtarı",
        scopes: ["feed:read"],
      }),
    onSuccess: (row: OpsApiAnahtar) => {
      toast.success("API anahtarı oluşturuldu", "Açık anahtar yalnızca bu ekranda bir kez gösterilir");
      const plaintext = row.api_key ?? null;
      setLastPlaintext(plaintext);
      if (plaintext) setFeedApiKey(plaintext);
      void qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", apiKeyFirma?.id] });
    },
    onError: (e: Error) => toast.error("Anahtar oluşturulamadı", e.message),
  });

  const iptalKeyM = useMutation({
    mutationFn: (anahtarId: number) =>
      opsFirmalarService.iptalApiAnahtar(apiKeyFirma!.id, anahtarId),
    onSuccess: () => {
      toast.success("API anahtarı iptal edildi");
      void qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", apiKeyFirma?.id] });
    },
    onError: (e: Error) => toast.error("İptal başarısız", e.message),
  });

  const onaylaKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.onaylaKanalIzni(id),
    onSuccess: () => {
      toast.success("Satış kanalı izni onaylandı");
      void qc.invalidateQueries({ queryKey: ["ops-kanal-izinleri"] });
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const reddetKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.reddetKanalIzni(id),
    onSuccess: () => {
      toast.success("Satış kanalı izni reddedildi");
      void qc.invalidateQueries({ queryKey: ["ops-kanal-izinleri"] });
    },
    onError: (e: Error) => toast.error("Reddetme başarısız", e.message),
  });

  const saveAliciKanalM = useMutation({
    mutationFn: async () => {
      setErisimError(null);
      if (!erisimForm.fiyat_grubu_id) {
        throw new Error("Lütfen bir fiyat grubu seçin.");
      }
      if (editingErisim) {
        return opsFirmalarService.updateAliciKanalErisimi(editingErisim.id, {
          fiyat_grubu_id: Number(erisimForm.fiyat_grubu_id),
          aktif: erisimForm.aktif,
        });
      }
      if (!erisimForm.firma_id || !erisimForm.satis_kanali_id) {
        throw new Error("Firma, satış kanalı ve fiyat grubu seçimi zorunludur.");
      }
      return opsFirmalarService.createAliciKanalErisimi({
        firma_id: Number(erisimForm.firma_id),
        satis_kanali_id: Number(erisimForm.satis_kanali_id),
        fiyat_grubu_id: Number(erisimForm.fiyat_grubu_id),
        aktif: erisimForm.aktif,
      });
    },
    onSuccess: () => {
      toast.success(editingErisim ? "Kanal erişimi güncellendi" : "Kanal erişimi tanımlandı");
      setErisimModalOpen(false);
      setEditingErisim(null);
      void qc.invalidateQueries({ queryKey: ["ops-alici-kanal-erisimleri"] });
    },
    onError: (e: Error) => {
      setErisimError(e.message || "İşlem başarısız.");
      toast.error("İşlem başarısız", e.message);
    },
  });

  const toggleAliciKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.toggleAliciKanalErisimi(id),
    onSuccess: () => {
      toast.success("Kanal erişim durumu güncellendi");
      void qc.invalidateQueries({ queryKey: ["ops-alici-kanal-erisimleri"] });
    },
    onError: (e: Error) => toast.error("Durum güncellenemedi", e.message),
  });

  const deleteAliciKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.deleteAliciKanalErisimi(id),
    onSuccess: () => {
      toast.success("Kanal erişimi silindi");
      void qc.invalidateQueries({ queryKey: ["ops-alici-kanal-erisimleri"] });
    },
    onError: (e: Error) => toast.error("Silinemedi", e.message),
  });

  const runFeedTest = async (
    mode: "urunler" | "urun_detail" | "stok_fiyat" | "schema_xsd"
  ) => {
    setFeedError(null);
    setFeedResult(null);
    if (!feedApiKey.trim()) {
      setFeedError("Önce geçerli bir entegrasyon anahtarı girin veya oluşturun.");
      return;
    }
    if (mode === "urun_detail" && !feedUrunId) {
      setFeedError("Lütfen ürün detayı testi için listeden bir ürün seçin.");
      return;
    }
    setFeedLoading(true);
    try {
      const res =
        mode === "urunler"
          ? await feedService.getUrunler(feedApiKey, feedFormat)
          : mode === "urun_detail"
            ? await feedService.getUrunDetail(feedApiKey, feedUrunId!, feedFormat)
            : mode === "schema_xsd"
              ? await feedService.getSchemaXsd(feedApiKey)
              : await feedService.getStokFiyat(feedApiKey, feedFormat);
      setFeedResult(res);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Veri akışı isteği başarısız.");
    } finally {
      setFeedLoading(false);
    }
  };

  const rows: OpsFirma[] = listQ.data?.results ?? [];
  const keys: OpsApiAnahtar[] = keysQ.data ?? [];
  const kanalIzinleri: OpsKanalIzni[] = kanalIzinleriQ.data?.results ?? [];
  const aliciKanalErisimleri = aliciKanalErisimQ.data?.results ?? [];
  const pendingKanalCount = kanalIzinleri.filter(
    (iz) => iz.durum === "ISTENDI" || iz.durum === "BEKLEMEDE"
  ).length;

  const openCreateErisim = () => {
    setEditingErisim(null);
    setErisimError(null);
    setErisimForm({
      firma_id: null,
      satis_kanali_id: null,
      fiyat_grubu_id: null,
      aktif: true,
    });
    setErisimModalOpen(true);
  };

  const openEditErisim = (er: OpsAliciKanalErisimi) => {
    setEditingErisim(er);
    setErisimError(null);
    setErisimForm({
      firma_id: er.firma_id,
      firma_ad: er.firma_ad,
      satis_kanali_id: er.satis_kanali_id,
      satis_kanali_label: `${er.satis_kanali_ad || er.satis_kanali_kod}`,
      fiyat_grubu_id: er.fiyat_grubu_id,
      fiyat_grubu_label: er.fiyat_grubu_ad || er.fiyat_grubu_kod,
      aktif: er.aktif,
    });
    setErisimModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Üst Sekmeler */}
      <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-border bg-muted/40 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("firmalar")}
          className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "firmalar"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Firmalar ({listQ.data?.count ?? rows.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kanal_izinleri")}
          className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "kanal_izinleri"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Tedarikçi Kanal İzinleri</span>
          {pendingKanalCount > 0 ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
              {pendingKanalCount}
            </Badge>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("alici_erisimleri")}
          className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "alici_erisimleri"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Alıcı &amp; API Kanal Erişimleri
        </button>
      </div>

      {/* SEKME 1: FİRMALAR */}
      {activeTab === "firmalar" ? (
        <ListPage
          title="Kayıtlı Firmalar"
          description="Platformdaki alıcı kuyumcuları, tedarikçileri ve API müşterilerini oluşturun, onaylayın ve bilgilerini yönetin."
          createLabel="Yeni Firma Ekle"
          onCreate={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
          searchValue={q}
          onSearchChange={(val) => {
            setQ(val);
            setPage(1);
          }}
          searchPlaceholder="Firma adı, kodu veya vergi no ara…"
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={durumFilter}
                onChange={(e) => {
                  setDurumFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Firma durum filtresi"
                className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
              >
                <option value="">Tüm durumlar</option>
                <option value="ONAY_BEKLIYOR">Onay Bekliyor</option>
                <option value="AKTIF">Aktif</option>
                <option value="ASKIDA">Askıda</option>
                <option value="REDDEDILDI">Reddedildi</option>
              </select>
              <select
                value={tipFilter}
                onChange={(e) => {
                  setTipFilter(e.target.value as "" | "alici" | "tedarikci");
                  setPage(1);
                }}
                aria-label="Firma rol filtresi"
                className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
              >
                <option value="">Tüm firma tipleri</option>
                <option value="alici">Alıcı / API Müşterisi</option>
                <option value="tedarikci">Tedarikçi</option>
              </select>
            </div>
          }
          loading={listQ.isLoading}
          error={listQ.isError ? "Firma listesi yüklenemedi." : null}
          onRetry={() => void listQ.refetch()}
          isEmpty={!listQ.isLoading && rows.length === 0}
          emptyTitle="Firma kaydı bulunamadı"
          emptyDescription="Arama ölçütlerini değiştirin veya yeni bir firma ekleyin."
          page={page}
          pageSize={pageSize}
          totalCount={listQ.data?.count ?? rows.length}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma Kodu</TableHead>
                <TableHead>Firma Adı</TableHead>
                <TableHead>Roller</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => {
                const roller: string[] = [];
                if (f.alici_mi) roller.push("Alıcı");
                if (f.tedarikci_mi) roller.push("Tedarikçi");
                if (f.tipler?.includes("API_MUSTERISI")) roller.push("API Müşterisi");
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {f.firma_kodu}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{f.ad}</div>
                      {f.unvan ? (
                        <div className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                          {f.unvan}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {roller.length > 0 ? (
                          roller.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">
                              {r}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[f.telefon, f.eposta].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          f.durum === "AKTIF"
                            ? "success"
                            : f.durum === "ASKIDA" || f.durum === "REDDEDILDI"
                              ? "destructive"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {FIRMA_DURUM_LABELS[f.durum] || f.durum}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel={f.ad}
                        onView={() => {
                          setDetailFirmaId(f.id);
                          setDetailTab("genel");
                        }}
                        onEdit={() => {
                          setDetailFirmaId(f.id);
                          setDetailTab("genel");
                        }}
                        isActive={f.durum === "AKTIF"}
                        onToggleActive={
                          f.durum === "AKTIF"
                            ? () => askiyaAlM.mutateAsync(f.id).then(() => undefined)
                            : () => onayM.mutateAsync(f.id).then(() => undefined)
                        }
                        onDelete={() => deleteFirmaM.mutateAsync(f.id)}
                        extraActions={[
                          {
                            label: "API Anahtarları & Veri Akışı",
                            icon: <KeyRound className="h-3.5 w-3.5" />,
                            onClick: () => {
                              setApiKeyFirma(f);
                              setLastPlaintext(null);
                              setFeedResult(null);
                              setFeedError(null);
                            },
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* SEKME 2: TEDARİKÇİ KANAL İZİNLERİ */}
      {activeTab === "kanal_izinleri" ? (
        <ListPage
          title="Tedarikçi Satış Kanalı İzinleri"
          description="Tedarikçilerin satış kanallarında ürün yayınlama ve teklif verme taleplerini onaylayın veya reddedin."
          searchValue={kanalQ}
          onSearchChange={(val) => {
            setKanalQ(val);
            setKanalPage(1);
          }}
          searchPlaceholder="Tedarikçi veya kanal adı ara…"
          filters={
            <select
              value={kanalDurum}
              onChange={(e) => {
                setKanalDurum(e.target.value);
                setKanalPage(1);
              }}
              aria-label="Kanal izin durum filtresi"
              className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
            >
              <option value="">Tüm durumlar</option>
              <option value="ISTENDI">Onay Bekleyenler</option>
              <option value="ONAYLI">Onaylananlar</option>
              <option value="REDDEDILDI">Reddedilenler</option>
            </select>
          }
          loading={kanalIzinleriQ.isLoading}
          error={kanalIzinleriQ.isError ? "Kanal izinleri yüklenemedi." : null}
          onRetry={() => void kanalIzinleriQ.refetch()}
          isEmpty={!kanalIzinleriQ.isLoading && kanalIzinleri.length === 0}
          emptyTitle="Kanal izin talebi yok"
          emptyDescription="Seçilen filtreye uygun bir tedarikçi kanal izni bulunmuyor."
          page={kanalPage}
          pageSize={20}
          totalCount={kanalIzinleriQ.data?.count ?? kanalIzinleri.length}
          onPageChange={setKanalPage}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tedarikçi Firma</TableHead>
                <TableHead>Satış Kanalı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Karar İşlemi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kanalIzinleri.map((iz) => {
                const isPending = iz.durum === "ISTENDI" || iz.durum === "BEKLEMEDE";
                return (
                  <TableRow key={iz.id}>
                    <TableCell className="font-medium">
                      {iz.tedarikci_ad || "Belirtilmemiş Tedarikçi"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{iz.satis_kanali_ad || iz.satis_kanali_kod}</span>
                      {iz.satis_kanali_ad && iz.satis_kanali_kod ? (
                        <span className="ml-1.5 font-mono text-muted-foreground">
                          ({iz.satis_kanali_kod})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          iz.durum === "ONAYLI" || iz.durum === "ONAYLANDI"
                            ? "success"
                            : iz.durum === "REDDEDILDI"
                              ? "destructive"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {KANAL_IZIN_LABELS[iz.durum] || iz.durum}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isPending ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            disabled={onaylaKanalM.isPending || reddetKanalM.isPending}
                            onClick={() => onaylaKanalM.mutate(iz.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Onayla
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 gap-1 text-xs"
                            disabled={onaylaKanalM.isPending || reddetKanalM.isPending}
                            onClick={() => reddetKanalM.mutate(iz.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reddet
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Karar verildi</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* SEKME 3: ALICI & API KANAL ERİŞİMLERİ */}
      {activeTab === "alici_erisimleri" ? (
        <ListPage
          title="Alıcı & API Kanal Erişimleri"
          description="Kuyumcuların ve API müşterilerinin hangi satış kanalından hangi fiyat grubuyla sipariş verebileceğini tanımlayın."
          createLabel="Yeni Kanal Erişimi"
          onCreate={openCreateErisim}
          searchValue={erisimQ}
          onSearchChange={(val) => {
            setErisimQ(val);
            setErisimPage(1);
          }}
          searchPlaceholder="Firma, kanal veya fiyat grubu ara…"
          loading={aliciKanalErisimQ.isLoading}
          error={aliciKanalErisimQ.isError ? "Kanal erişimleri yüklenemedi." : null}
          onRetry={() => void aliciKanalErisimQ.refetch()}
          isEmpty={!aliciKanalErisimQ.isLoading && aliciKanalErisimleri.length === 0}
          emptyTitle="Alıcı kanal erişimi tanımlı değil"
          emptyDescription="Firmaların katalog ve fiyat görmesi için bir kanal ve fiyat grubu eşleştirin."
          page={erisimPage}
          pageSize={20}
          totalCount={aliciKanalErisimQ.data?.count ?? aliciKanalErisimleri.length}
          onPageChange={setErisimPage}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>Satış Kanalı</TableHead>
                <TableHead>Fiyat Grubu</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aliciKanalErisimleri.map((er) => (
                <TableRow key={er.id}>
                  <TableCell className="font-medium">
                    {er.firma_ad || "Belirtilmemiş Firma"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{er.satis_kanali_ad || er.satis_kanali_kod}</span>
                    {er.satis_kanali_ad && er.satis_kanali_kod ? (
                      <span className="ml-1.5 font-mono text-muted-foreground">
                        ({er.satis_kanali_kod})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {er.fiyat_grubu_ad || er.fiyat_grubu_kod || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={er.aktif ? "success" : "secondary"}
                      className="text-[10px]"
                    >
                      {er.aktif ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={`${er.firma_ad} - ${er.satis_kanali_ad || er.satis_kanali_kod}`}
                      onEdit={() => openEditErisim(er)}
                      isActive={er.aktif}
                      onToggleActive={() =>
                        toggleAliciKanalM.mutateAsync(er.id).then(() => undefined)
                      }
                      onDelete={() => deleteAliciKanalM.mutateAsync(er.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : null}

      {/* MODAL: YENİ FİRMA OLUŞTUR */}
      <EntityModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Yeni Firma Oluştur"
        description="Firma bilgilerini ve çalışma rollerini tanımlayın. İsterseniz ilk yönetici davetini de aynı anda gönderebilirsiniz."
        size="lg"
        error={createError}
        isDirty={Boolean(createForm.ad || createForm.firma_kodu || createForm.email)}
        isSubmitting={createM.isPending}
        submitLabel={createForm.email.trim() ? "Firmayı Oluştur ve Davet Et" : "Firmayı Oluştur"}
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Firma Rolleri</Label>
            <div className="flex flex-wrap gap-4 rounded-[6px] border border-border bg-muted/20 p-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.alici_mi}
                  onChange={(e) =>
                    setCreateForm((d) => ({ ...d, alici_mi: e.target.checked }))
                  }
                />
                Alıcı (Kuyumcu)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.tedarikci_mi}
                  onChange={(e) =>
                    setCreateForm((d) => ({ ...d, tedarikci_mi: e.target.checked }))
                  }
                />
                Tedarikçi (Üretici / Toptancı)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.api_musterisi_mi}
                  onChange={(e) =>
                    setCreateForm((d) => ({ ...d, api_musterisi_mi: e.target.checked }))
                  }
                />
                API Müşterisi
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-ad" className="text-xs">Firma Adı *</Label>
              <Input
                id="cf-ad"
                required
                placeholder="Örn: Altınbaş Kuyumculuk"
                value={createForm.ad}
                onChange={(e) => setCreateForm((d) => ({ ...d, ad: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-kod" className="text-xs">Firma Kodu *</Label>
              <Input
                id="cf-kod"
                required
                placeholder="Örn: ALTINBAS"
                className="font-mono uppercase"
                value={createForm.firma_kodu}
                onChange={(e) =>
                  setCreateForm((d) => ({ ...d, firma_kodu: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-vkn" className="text-xs">Vergi Numarası</Label>
              <Input
                id="cf-vkn"
                placeholder="10 veya 11 hane"
                className="font-mono"
                value={createForm.vergi_no}
                onChange={(e) => setCreateForm((d) => ({ ...d, vergi_no: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-vade" className="text-xs">Ödeme Vadesi (Gün)</Label>
              <Input
                id="cf-vade"
                type="number"
                min={0}
                value={createForm.vade_gun}
                onChange={(e) => setCreateForm((d) => ({ ...d, vade_gun: e.target.value }))}
              />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div className="text-xs font-semibold">İlk Yönetici Daveti (İsteğe Bağlı)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-email" className="text-xs">Yönetici E-posta Adresi</Label>
                <Input
                  id="cf-email"
                  type="email"
                  placeholder="yetkili@firma.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((d) => ({ ...d, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-rol" className="text-xs">Atanacak Rol</Label>
                <select
                  id="cf-rol"
                  value={createForm.rol}
                  onChange={(e) => setCreateForm((d) => ({ ...d, rol: e.target.value }))}
                  className="h-9 w-full rounded-[6px] border border-border bg-background px-2.5 text-xs"
                >
                  {ROL_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </EntityModal>

      {/* MODAL: FİRMA DETAY & YÖNETİM (GENEL + KONTAK + ADRES + BANKA + BELGE) */}
      <EntityModal
        open={detailFirmaId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailFirmaId(null);
            setEditingKontakId(null);
            setEditingAdresId(null);
            setEditingBankaId(null);
          }
        }}
        title={detailQ.data ? `${detailQ.data.ad} — Firma Yönetimi` : "Firma Yönetimi"}
        description="Firma profilini, ticari rollerini, yetkililerini, adreslerini, banka hesaplarını ve belgelerini düzenleyin."
        size="xl"
        hideFooter
      >
        {detailQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Firma bilgileri yükleniyor…
          </div>
        ) : detailQ.isError ? (
          <div className="rounded-[6px] border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {detailQ.error instanceof Error
              ? detailQ.error.message
              : "Firma detayı alınamadı."}
          </div>
        ) : detailQ.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["genel", "Genel Bilgiler"],
                    ["kontaklar", "Yetkili Kişiler"],
                    ["adresler", "Adresler"],
                    ["banka", "Banka Hesapları"],
                    ["belgeler", "Belgeler"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={detailTab === id ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {detailQ.data.durum !== "AKTIF" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={onayM.isPending}
                    onClick={() => onayM.mutate(detailQ.data.id)}
                  >
                    Firmayı Onayla
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs gap-1"
                    disabled={askiyaAlM.isPending}
                    onClick={() => askiyaAlM.mutate(detailQ.data.id)}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Askıya Al
                  </Button>
                )}
              </div>
            </div>

            {detailTab === "genel" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateFirmaM.mutate();
                }}
                className="space-y-4"
              >
                <div className="flex flex-wrap gap-4 rounded-[6px] border border-border bg-muted/20 p-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDraft.alici_mi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, alici_mi: e.target.checked }))
                      }
                    />
                    Alıcı (Kuyumcu)
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDraft.tedarikci_mi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, tedarikci_mi: e.target.checked }))
                      }
                    />
                    Tedarikçi
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDraft.api_musterisi_mi}
                      onChange={(e) =>
                        setEditDraft((d) => ({
                          ...d,
                          api_musterisi_mi: e.target.checked,
                        }))
                      }
                    />
                    API Müşterisi
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Firma Adı</Label>
                    <Input
                      required
                      value={editDraft.ad}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, ad: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Resmi Ünvan</Label>
                    <Input
                      value={editDraft.unvan}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, unvan: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vergi Numarası</Label>
                    <Input
                      className="font-mono"
                      value={editDraft.vergi_no}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, vergi_no: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vergi Dairesi</Label>
                    <Input
                      value={editDraft.vergi_dairesi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, vergi_dairesi: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">MERSİS No</Label>
                    <Input
                      value={editDraft.mersis_no}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, mersis_no: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ticaret Sicil No</Label>
                    <Input
                      value={editDraft.ticaret_sicil_no}
                      onChange={(e) =>
                        setEditDraft((d) => ({
                          ...d,
                          ticaret_sicil_no: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Oda Adı / Kayıt No</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Oda"
                        value={editDraft.oda_adi}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, oda_adi: e.target.value }))
                        }
                      />
                      <Input
                        placeholder="Kayıt no"
                        value={editDraft.oda_kayit_no}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            oda_kayit_no: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      value={editDraft.telefon}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, telefon: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">E-posta</Label>
                    <Input
                      type="email"
                      value={editDraft.eposta}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, eposta: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Web Sitesi</Label>
                    <Input
                      value={editDraft.web_sitesi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, web_sitesi: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vade (Gün)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editDraft.vade_gun}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, vade_gun: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDetailFirmaId(null)}
                  >
                    Kapat
                  </Button>
                  <Button type="submit" disabled={updateFirmaM.isPending}>
                    {updateFirmaM.isPending ? "Güncelleniyor…" : "Değişiklikleri Kaydet"}
                  </Button>
                </div>
              </form>
            ) : null}

            {detailTab === "kontaklar" ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad Soyad</TableHead>
                      <TableHead>Departman / Görev</TableHead>
                      <TableHead>İletişim</TableHead>
                      <TableHead>Birincil</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(kontaklarQ.data ?? []).map((k: OpsFirmaKontak) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.ad_soyad}</TableCell>
                        <TableCell className="text-xs">
                          {[k.departman, k.gorev].filter(Boolean).join(" / ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[k.telefon, k.eposta].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>{k.birincil ? "Evet" : "Hayır"}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingKontakId(k.id);
                                setKontakDraft({
                                  ad_soyad: k.ad_soyad,
                                  departman: k.departman || "",
                                  gorev: k.gorev || "",
                                  telefon: k.telefon || "",
                                  eposta: k.eposta || "",
                                  birincil: Boolean(k.birincil),
                                  notlar: k.notlar || "",
                                });
                              }}
                              aria-label="Kontağı düzenle"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                setSubConfirm({
                                  title: "Yetkili Kişiyi Sil",
                                  description: `${k.ad_soyad} kaydı silinecek.`,
                                  onConfirm: async () => {
                                    await opsFirmalarService.deleteKontak(detailFirmaId!, k.id);
                                    toast.success("Yetkili kişi silindi");
                                    void qc.invalidateQueries({
                                      queryKey: ["ops-firma-kontaklar", detailFirmaId],
                                    });
                                  },
                                })
                              }
                              aria-label="Kontağı sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(kontaklarQ.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-xs text-muted-foreground text-center py-4">
                          Henüz yetkili kişi eklenmemiş.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveKontakM.mutate();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t pt-3"
                >
                  <Input
                    placeholder="Ad Soyad *"
                    required
                    value={kontakDraft.ad_soyad}
                    onChange={(e) =>
                      setKontakDraft((d) => ({ ...d, ad_soyad: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Departman"
                    value={kontakDraft.departman}
                    onChange={(e) =>
                      setKontakDraft((d) => ({ ...d, departman: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Görev"
                    value={kontakDraft.gorev}
                    onChange={(e) =>
                      setKontakDraft((d) => ({ ...d, gorev: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Telefon"
                    value={kontakDraft.telefon}
                    onChange={(e) =>
                      setKontakDraft((d) => ({ ...d, telefon: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="E-posta"
                    value={kontakDraft.eposta}
                    onChange={(e) =>
                      setKontakDraft((d) => ({ ...d, eposta: e.target.value }))
                    }
                  />
                  <div className="flex items-center gap-2">
                    {editingKontakId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingKontakId(null);
                          setKontakDraft({
                            ad_soyad: "",
                            departman: "",
                            gorev: "",
                            telefon: "",
                            eposta: "",
                            birincil: true,
                            notlar: "",
                          });
                        }}
                      >
                        Vazgeç
                      </Button>
                    ) : null}
                    <Button type="submit" size="sm" className="flex-1" disabled={saveKontakM.isPending}>
                      {editingKontakId ? "Güncelle" : "Yetkili Ekle"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}

            {detailTab === "adresler" ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adres Türü</TableHead>
                      <TableHead>İl / İlçe</TableHead>
                      <TableHead>Açık Adres</TableHead>
                      <TableHead>Varsayılan</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(adreslerQ.data ?? []).map((a: OpsFirmaAdres) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs font-medium">{a.tip}</TableCell>
                        <TableCell className="text-xs">
                          {a.il} {a.ilce ? `/ ${a.ilce}` : ""}
                        </TableCell>
                        <TableCell className="text-xs">{a.adres}</TableCell>
                        <TableCell>{a.varsayilan ? "Evet" : "Hayır"}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingAdresId(a.id);
                                setAdresDraft({
                                  tip: a.tip,
                                  il: a.il,
                                  ilce: a.ilce || "",
                                  adres: a.adres,
                                  varsayilan: Boolean(a.varsayilan),
                                });
                              }}
                              aria-label="Adresi düzenle"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                setSubConfirm({
                                  title: "Adresi Sil",
                                  description: `${a.il} adresi silinecek.`,
                                  onConfirm: async () => {
                                    await opsFirmalarService.deleteAdres(detailFirmaId!, a.id);
                                    toast.success("Adres silindi");
                                    void qc.invalidateQueries({
                                      queryKey: ["ops-firma-adresler", detailFirmaId],
                                    });
                                  },
                                })
                              }
                              aria-label="Adresi sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveAdresM.mutate();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 border-t pt-3"
                >
                  <select
                    value={adresDraft.tip}
                    onChange={(e) =>
                      setAdresDraft((d) => ({ ...d, tip: e.target.value }))
                    }
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  >
                    <option value="TESLIMAT">Teslimat Adresi</option>
                    <option value="FATURA">Fatura Adresi</option>
                  </select>
                  <Input
                    placeholder="İl *"
                    required
                    value={adresDraft.il}
                    onChange={(e) =>
                      setAdresDraft((d) => ({ ...d, il: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="İlçe"
                    value={adresDraft.ilce}
                    onChange={(e) =>
                      setAdresDraft((d) => ({ ...d, ilce: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Açık Adres *"
                    required
                    value={adresDraft.adres}
                    onChange={(e) =>
                      setAdresDraft((d) => ({ ...d, adres: e.target.value }))
                    }
                  />
                  <div className="sm:col-span-4 flex justify-end gap-2">
                    {editingAdresId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingAdresId(null);
                          setAdresDraft({
                            tip: "TESLIMAT",
                            il: "",
                            ilce: "",
                            adres: "",
                            varsayilan: true,
                          });
                        }}
                      >
                        Vazgeç
                      </Button>
                    ) : null}
                    <Button type="submit" size="sm" disabled={saveAdresM.isPending}>
                      {editingAdresId ? "Adresi Güncelle" : "Adres Ekle"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}

            {detailTab === "banka" ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banka Adı</TableHead>
                      <TableHead>IBAN</TableHead>
                      <TableHead>SWIFT</TableHead>
                      <TableHead>Para Birimi</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(bankaQ.data ?? []).map((b: OpsFirmaBanka) => (
                      <TableRow key={b.id}>
                        <TableCell>{b.banka_adi}</TableCell>
                        <TableCell className="font-mono text-xs">{b.iban}</TableCell>
                        <TableCell className="font-mono text-xs">{b.swift_bic || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{b.para_birimi}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingBankaId(b.id);
                                setBankaDraft({
                                  banka_adi: b.banka_adi,
                                  iban: b.iban,
                                  swift_bic: b.swift_bic || "",
                                  para_birimi: b.para_birimi,
                                  aktif: b.aktif !== false,
                                });
                              }}
                              aria-label="Banka hesabını düzenle"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                setSubConfirm({
                                  title: "Banka Hesabını Sil",
                                  description: `${b.banka_adi} hesabı silinecek.`,
                                  onConfirm: async () => {
                                    await opsFirmalarService.deleteBanka(detailFirmaId!, b.id);
                                    toast.success("Banka hesabı silindi");
                                    void qc.invalidateQueries({
                                      queryKey: ["ops-firma-banka", detailFirmaId],
                                    });
                                  },
                                })
                              }
                              aria-label="Banka hesabını sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveBankaM.mutate();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 border-t pt-3"
                >
                  <Input
                    placeholder="Banka Adı *"
                    required
                    value={bankaDraft.banka_adi}
                    onChange={(e) =>
                      setBankaDraft((d) => ({ ...d, banka_adi: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="IBAN *"
                    required
                    value={bankaDraft.iban}
                    onChange={(e) =>
                      setBankaDraft((d) => ({ ...d, iban: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="SWIFT / BIC"
                    value={bankaDraft.swift_bic}
                    onChange={(e) =>
                      setBankaDraft((d) => ({ ...d, swift_bic: e.target.value }))
                    }
                  />
                  <div className="flex items-center gap-2">
                    {editingBankaId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingBankaId(null);
                          setBankaDraft({
                            banka_adi: "",
                            iban: "",
                            swift_bic: "",
                            para_birimi: "TRY",
                            aktif: true,
                          });
                        }}
                      >
                        Vazgeç
                      </Button>
                    ) : null}
                    <Button type="submit" size="sm" className="flex-1" disabled={saveBankaM.isPending}>
                      {editingBankaId ? "Güncelle" : "Hesap Ekle"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}

            {detailTab === "belgeler" ? (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Belge Tipi</TableHead>
                      <TableHead>Başlık</TableHead>
                      <TableHead>Dosya Anahtarı</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(belgelerQ.data ?? []).map((b: OpsFirmaBelge) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs font-medium">{b.tip}</TableCell>
                        <TableCell>{b.baslik}</TableCell>
                        <TableCell className="font-mono text-xs">{b.storage_key}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() =>
                              setSubConfirm({
                                title: "Belge Kaydını Sil",
                                description: `${b.baslik} belgesi silinecek.`,
                                onConfirm: async () => {
                                  await opsFirmalarService.deleteBelge(detailFirmaId!, b.id);
                                  toast.success("Belge silindi");
                                  void qc.invalidateQueries({
                                    queryKey: ["ops-firma-belgeler", detailFirmaId],
                                  });
                                },
                              })
                            }
                            aria-label="Belgeyi sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createBelgeM.mutate();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 border-t pt-3"
                >
                  <select
                    value={belgeDraft.tip}
                    onChange={(e) =>
                      setBelgeDraft((d) => ({ ...d, tip: e.target.value }))
                    }
                    className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
                  >
                    <option value="VERGI_LEVHASI">Vergi Levhası</option>
                    <option value="IMZA_SIRKUSU">İmza Sirküleri</option>
                    <option value="TICARET_SICIL">Ticaret Sicil Gazetesi</option>
                    <option value="SOZLESME">Çerçeve Sözleşme</option>
                  </select>
                  <Input
                    placeholder="Başlık *"
                    required
                    value={belgeDraft.baslik}
                    onChange={(e) =>
                      setBelgeDraft((d) => ({ ...d, baslik: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Dosya Referansı / Yolu *"
                    required
                    value={belgeDraft.storage_key}
                    onChange={(e) =>
                      setBelgeDraft((d) => ({ ...d, storage_key: e.target.value }))
                    }
                  />
                  <Button type="submit" size="sm" disabled={createBelgeM.isPending}>
                    Belge Ekle
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
      </EntityModal>

      {/* MODAL: API ANAHTARLARI & VERİ AKIŞI DOĞRULAMA */}
      <EntityModal
        open={apiKeyFirma != null}
        onOpenChange={(open) => {
          if (!open) {
            setApiKeyFirma(null);
            setLastPlaintext(null);
          }
        }}
        title={apiKeyFirma ? `${apiKeyFirma.ad} — API Anahtarları` : "API Anahtarları"}
        description="B2B entegrasyon anahtarlarını oluşturun, iptal edin veya canlı ürün/stok akışını doğrulayın."
        size="xl"
        hideFooter
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label className="text-xs">Yeni Anahtar Etiketi</Label>
              <Input
                value={keyAd}
                onChange={(e) => setKeyAd(e.target.value)}
                placeholder="Örn: ERP Entegrasyonu"
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={createKeyM.isPending}
              onClick={() => createKeyM.mutate()}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni Anahtar Oluştur
            </Button>
          </div>

          {lastPlaintext ? (
            <div className="rounded-[6px] border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
              <div className="text-xs font-medium text-foreground">
                Yeni Anahtar (Yalnızca bir kez gösterilir, güvenli bir yere kopyalayın):
              </div>
              <p className="font-mono text-xs break-all select-all">{lastPlaintext}</p>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etiket</TableHead>
                <TableHead>Anahtar Ön Eki</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.ad}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                  <TableCell>
                    <Badge variant={k.iptal ? "destructive" : "success"} className="text-[10px]">
                      {k.iptal ? "İptal Edildi" : "Aktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!k.iptal ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={iptalKeyM.isPending}
                        onClick={() => iptalKeyM.mutate(k.id)}
                      >
                        İptal Et
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!keys.length && !keysQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground text-center py-4">
                    Tanımlı API anahtarı bulunmuyor.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="rounded-[8px] border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-foreground">
                  Canlı Veri Akışı Doğrulama
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  API anahtarı ile ürün kataloğu ve stok-fiyat çıktısını test edin.
                </p>
              </div>
              <select
                value={feedFormat}
                onChange={(e) => setFeedFormat(e.target.value as "json" | "xml")}
                className="h-8 rounded-[6px] border border-border bg-background px-2 text-xs"
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">API Anahtarı</Label>
                <Input
                  value={feedApiKey}
                  onChange={(e) => setFeedApiKey(e.target.value)}
                  placeholder="Anahtarı yapıştırın…"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ürün Seçimi (Tekil Detay Testi İçin)</Label>
                <RelationSelect
                  value={feedUrunId}
                  selectedLabel={feedUrunLabel}
                  onChange={(val, opt) => {
                    setFeedUrunId(val);
                    setFeedUrunLabel(opt?.label ?? "");
                  }}
                  loadOptions={loadProductOptions}
                  placeholder="Ürün ara ve seç…"
                  clearable
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("urunler")}
              >
                {feedLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Ürün Listesi Testi
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("urun_detail")}
              >
                Seçili Ürün Detayı
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("stok_fiyat")}
              >
                Stok &amp; Fiyat Akışı
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("schema_xsd")}
              >
                XML Şema İndir
              </Button>
            </div>

            {feedError ? (
              <div
                className="rounded-[6px] border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
                role="alert"
              >
                {feedError}
              </div>
            ) : null}

            {feedResult ? (
              <pre className="max-h-56 overflow-auto rounded-[6px] border border-border bg-background p-3 font-mono text-[11px] whitespace-pre-wrap">
                {feedResult.format === "json"
                  ? JSON.stringify(feedResult.data, null, 2)
                  : feedResult.raw}
              </pre>
            ) : null}
          </div>
        </div>
      </EntityModal>

      {/* MODAL: ALICI / API KANAL ERİŞİMİ EKLE & DÜZENLE */}
      <EntityModal
        open={erisimModalOpen}
        onOpenChange={(open) => {
          setErisimModalOpen(open);
          if (!open) setEditingErisim(null);
        }}
        title={editingErisim ? "Kanal Erişimini Düzenle" : "Yeni Alıcı / API Kanal Erişimi"}
        description="Firmanın erişebileceği satış kanalını ve bu kanalda geçerli fiyat grubunu seçin."
        size="md"
        error={erisimError}
        isSubmitting={saveAliciKanalM.isPending}
        submitLabel={editingErisim ? "Güncelle" : "Erişim Tanımla"}
        onSubmit={(e) => {
          e.preventDefault();
          saveAliciKanalM.mutate();
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Alıcı veya API Müşterisi Firma *</Label>
            <RelationSelect
              value={erisimForm.firma_id}
              selectedLabel={erisimForm.firma_ad}
              onChange={(val, opt) =>
                setErisimForm((d) => ({
                  ...d,
                  firma_id: val,
                  firma_ad: opt?.label,
                }))
              }
              loadOptions={loadAliciFirmaOptions}
              placeholder="Firma adı ile ara…"
              disabled={Boolean(editingErisim)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Satış Kanalı *</Label>
            <RelationSelect
              value={erisimForm.satis_kanali_id}
              selectedLabel={erisimForm.satis_kanali_label}
              onChange={(val, opt) =>
                setErisimForm((d) => ({
                  ...d,
                  satis_kanali_id: val,
                  satis_kanali_label: opt?.label,
                }))
              }
              loadOptions={loadSalesChannelOptions}
              placeholder="Satış kanalı seçin…"
              disabled={Boolean(editingErisim)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fiyat Grubu *</Label>
            <RelationSelect
              value={erisimForm.fiyat_grubu_id}
              selectedLabel={erisimForm.fiyat_grubu_label}
              onChange={(val, opt) =>
                setErisimForm((d) => ({
                  ...d,
                  fiyat_grubu_id: val,
                  fiyat_grubu_label: opt?.label,
                }))
              }
              loadOptions={loadFiyatGrubuOptions}
              placeholder="Fiyat grubu seçin…"
            />
          </div>
          <label className="flex items-center gap-2 text-xs pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={erisimForm.aktif}
              onChange={(e) =>
                setErisimForm((d) => ({ ...d, aktif: e.target.checked }))
              }
            />
            Erişim aktif olsun
          </label>
        </div>
      </EntityModal>

      {/* ALT KAYIT SİLME ONAYI */}
      {subConfirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setSubConfirm(null);
          }}
          title={subConfirm.title}
          description={subConfirm.description}
          confirmLabel="Evet, Sil"
          variant="destructive"
          onConfirm={async () => {
            await subConfirm.onConfirm();
            setSubConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
