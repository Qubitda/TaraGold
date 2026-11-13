"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActionToast } from "@/hooks/use-action-toast";
import { Loader2 } from "lucide-react";
import {
  feedService,
  opsFirmalarService,
  type FeedResponse,
  type OpsApiAnahtar,
  type OpsFirma,
  type OpsKanalIzni,
} from "../services/ops-firmalar";

type FirmaDetailTab = "genel" | "kontaklar" | "adresler" | "banka" | "belgeler";

export function OpsFirmalarView() {
  const toast = useActionToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailFirmaId, setDetailFirmaId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<FirmaDetailTab>("genel");
  const [keyAd, setKeyAd] = useState("feed");
  const [lastPlaintext, setLastPlaintext] = useState<string | null>(null);

  // Feed tester state
  const [feedApiKey, setFeedApiKey] = useState("");
  const [feedFormat, setFeedFormat] = useState<"json" | "xml">("json");
  const [feedUrunId, setFeedUrunId] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedResult, setFeedResult] = useState<FeedResponse | null>(null);

  // Kanal izinleri filter
  const [kanalDurum, setKanalDurum] = useState("");

  // Firma Edit draft
  const [editDraft, setEditDraft] = useState({
    ad: "",
    unvan: "",
    vergi_dairesi: "",
    mersis_no: "",
    ticaret_sicil_no: "",
    oda_adi: "",
    oda_kayit_no: "",
    web_sitesi: "",
    telefon: "",
    eposta: "",
    vade_gun: "",
  });

  // Subresource creation drafts
  const [kontakDraft, setKontakDraft] = useState({
    ad_soyad: "",
    departman: "",
    gorev: "",
    telefon: "",
    eposta: "",
    birincil: true,
    notlar: "",
  });
  const [adresDraft, setAdresDraft] = useState({
    tip: "TESLIMAT",
    il: "",
    ilce: "",
    adres: "",
    varsayilan: true,
  });
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

  const [draft, setDraft] = useState({
    ad: "",
    firma_kodu: "",
    alici_mi: true,
    tedarikci_mi: false,
    api_musterisi_mi: false,
    email: "",
    rol: "firma_admin",
  });

  // Alıcı / API Kanal Erişimi draft
  const [erisimDraft, setErisimDraft] = useState({
    firma_id: "",
    satis_kanali_id: "",
    fiyat_grubu_id: "",
  });

  const listQ = useQuery({
    queryKey: ["ops-firmalar", q],
    queryFn: () => opsFirmalarService.list(q ? { q } : undefined),
  });

  const keysQ = useQuery({
    queryKey: ["ops-firma-api-keys", selectedId],
    queryFn: () => opsFirmalarService.listApiAnahtarlar(selectedId!),
    enabled: selectedId != null,
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
    queryKey: ["ops-kanal-izinleri", kanalDurum],
    queryFn: () =>
      opsFirmalarService.listKanalIzinleri(kanalDurum || undefined),
  });

  const aliciKanalErisimQ = useQuery({
    queryKey: ["ops-alici-kanal-erisimleri"],
    queryFn: () => opsFirmalarService.listAliciKanalErisimleri(),
  });

  const fiyatGruplariQ = useQuery({
    queryKey: ["ops-fiyat-gruplari"],
    queryFn: () => opsFirmalarService.listFiyatGruplari(),
  });

  const salesChannelsQ = useQuery({
    queryKey: ["sales-channels"],
    queryFn: () => opsFirmalarService.listSalesChannels(),
  });

  useEffect(() => {
    if (!detailQ.data) return;
    const f = detailQ.data;
    setEditDraft({
      ad: f.ad || "",
      unvan: f.unvan || "",
      vergi_dairesi: f.vergi_dairesi || "",
      mersis_no: f.mersis_no || "",
      ticaret_sicil_no: f.ticaret_sicil_no || "",
      oda_adi: f.oda_adi || "",
      oda_kayit_no: f.oda_kayit_no || "",
      web_sitesi: f.web_sitesi || "",
      telefon: f.telefon || "",
      eposta: f.eposta || "",
      vade_gun: f.vade_gun != null ? String(f.vade_gun) : "",
    });
  }, [detailQ.data]);

  const createM = useMutation({
    mutationFn: async () => {
      const f = await opsFirmalarService.create({
        ad: draft.ad,
        firma_kodu: draft.firma_kodu,
        alici_mi: draft.alici_mi,
        tedarikci_mi: draft.tedarikci_mi,
        tipler: [
          ...(draft.alici_mi ? ["ALICI_KUYUMCU"] : []),
          ...(draft.tedarikci_mi ? ["TEDARIKCI"] : []),
          ...(draft.api_musterisi_mi ? ["API_MUSTERISI"] : []),
        ],
      });
      if (draft.email) {
        await opsFirmalarService.davet(f.id, {
          email: draft.email,
          rol: draft.rol,
        });
      }
      return f;
    },
    onSuccess: () => {
      toast.success("Firma oluşturuldu");
      setStep(0);
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
    },
    onError: (e: Error) => toast.error("Kayıt başarısız", e.message),
  });

  const onayM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.onayla(id),
    onSuccess: () => {
      toast.success("Firma onaylandı");
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      if (detailFirmaId != null) {
        qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
      }
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const askiyaAlM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.askiyaAl(id),
    onSuccess: () => {
      toast.success("Firma askıya alındı");
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      if (detailFirmaId != null) {
        qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
      }
    },
    onError: (e: Error) => toast.error("Askıya alma başarısız", e.message),
  });

  const updateFirmaM = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        ad: editDraft.ad,
        unvan: editDraft.unvan,
        vergi_dairesi: editDraft.vergi_dairesi,
        mersis_no: editDraft.mersis_no,
        ticaret_sicil_no: editDraft.ticaret_sicil_no,
        oda_adi: editDraft.oda_adi,
        oda_kayit_no: editDraft.oda_kayit_no,
        web_sitesi: editDraft.web_sitesi,
        telefon: editDraft.telefon,
        eposta: editDraft.eposta,
      };
      if (editDraft.vade_gun.trim() !== "") {
        body.vade_gun = Number(editDraft.vade_gun);
      }
      return opsFirmalarService.update(detailFirmaId!, body);
    },
    onSuccess: () => {
      toast.success("Firma bilgileri güncellendi");
      qc.invalidateQueries({ queryKey: ["ops-firmalar"] });
      qc.invalidateQueries({ queryKey: ["ops-firma-detail", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Güncelleme başarısız", e.message),
  });

  const createKontakM = useMutation({
    mutationFn: () => opsFirmalarService.createKontak(detailFirmaId!, kontakDraft),
    onSuccess: () => {
      toast.success("Kontak eklendi");
      setKontakDraft({
        ad_soyad: "",
        departman: "",
        gorev: "",
        telefon: "",
        eposta: "",
        birincil: true,
        notlar: "",
      });
      qc.invalidateQueries({ queryKey: ["ops-firma-kontaklar", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Kontak eklenemedi", e.message),
  });

  const createAdresM = useMutation({
    mutationFn: () => opsFirmalarService.createAdres(detailFirmaId!, adresDraft),
    onSuccess: () => {
      toast.success("Adres eklendi");
      setAdresDraft({
        tip: "TESLIMAT",
        il: "",
        ilce: "",
        adres: "",
        varsayilan: true,
      });
      qc.invalidateQueries({ queryKey: ["ops-firma-adresler", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Adres eklenemedi", e.message),
  });

  const createBankaM = useMutation({
    mutationFn: () => opsFirmalarService.createBanka(detailFirmaId!, bankaDraft),
    onSuccess: () => {
      toast.success("Banka hesabı eklendi");
      setBankaDraft({
        banka_adi: "",
        iban: "",
        swift_bic: "",
        para_birimi: "TRY",
        aktif: true,
      });
      qc.invalidateQueries({ queryKey: ["ops-firma-banka", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Banka hesabı eklenemedi", e.message),
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
      qc.invalidateQueries({ queryKey: ["ops-firma-belgeler", detailFirmaId] });
    },
    onError: (e: Error) => toast.error("Belge eklenemedi", e.message),
  });

  const createKeyM = useMutation({
    mutationFn: () =>
      opsFirmalarService.createApiAnahtar(selectedId!, {
        ad: keyAd || "feed",
        scopes: ["feed:read"],
      }),
    onSuccess: (row: OpsApiAnahtar) => {
      toast.success("API anahtarı oluşturuldu", "Plaintext yalnız bir kez gösterilir");
      const plaintext = row.api_key ?? null;
      setLastPlaintext(plaintext);
      if (plaintext) setFeedApiKey(plaintext);
      qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", selectedId] });
    },
    onError: (e: Error) => toast.error("Anahtar oluşturulamadı", e.message),
  });

  const iptalKeyM = useMutation({
    mutationFn: (anahtarId: number) =>
      opsFirmalarService.iptalApiAnahtar(selectedId!, anahtarId),
    onSuccess: () => {
      toast.success("API anahtarı iptal edildi");
      qc.invalidateQueries({ queryKey: ["ops-firma-api-keys", selectedId] });
    },
    onError: (e: Error) => toast.error("İptal başarısız", e.message),
  });

  const onaylaKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.onaylaKanalIzni(id),
    onSuccess: () => {
      toast.success("Kanal izni onaylandı");
      qc.invalidateQueries({ queryKey: ["ops-kanal-izinleri"] });
    },
    onError: (e: Error) => toast.error("Onay başarısız", e.message),
  });

  const reddetKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.reddetKanalIzni(id),
    onSuccess: () => {
      toast.success("Kanal izni reddedildi");
      qc.invalidateQueries({ queryKey: ["ops-kanal-izinleri"] });
    },
    onError: (e: Error) => toast.error("Reddetme başarısız", e.message),
  });

  const createAliciKanalM = useMutation({
    mutationFn: () =>
      opsFirmalarService.createAliciKanalErisimi({
        firma_id: Number(erisimDraft.firma_id),
        satis_kanali_id: Number(erisimDraft.satis_kanali_id),
        fiyat_grubu_id: Number(erisimDraft.fiyat_grubu_id),
        aktif: true,
      }),
    onSuccess: () => {
      toast.success("Alıcı/API kanal erişimi tanımlandı");
      setErisimDraft({ firma_id: "", satis_kanali_id: "", fiyat_grubu_id: "" });
      qc.invalidateQueries({ queryKey: ["ops-alici-kanal-erisimleri"] });
    },
    onError: (e: Error) => toast.error("Erişim tanımlanamadı", e.message),
  });

  const toggleAliciKanalM = useMutation({
    mutationFn: (id: number) => opsFirmalarService.toggleAliciKanalErisimi(id),
    onSuccess: () => {
      toast.success("Kanal erişim durumu güncellendi");
      qc.invalidateQueries({ queryKey: ["ops-alici-kanal-erisimleri"] });
    },
    onError: (e: Error) => toast.error("Durum güncellenemedi", e.message),
  });

  const runFeedTest = async (
    mode: "urunler" | "urun_detail" | "stok_fiyat" | "schema_xsd"
  ) => {
    setFeedError(null);
    setFeedResult(null);
    if (!feedApiKey.trim()) {
      setFeedError("Önce geçerli bir X-Api-Key girin.");
      return;
    }
    if (mode === "urun_detail" && !feedUrunId.trim()) {
      setFeedError("Ürün detayı için ürün ID girin.");
      return;
    }
    setFeedLoading(true);
    try {
      const res =
        mode === "urunler"
          ? await feedService.getUrunler(feedApiKey, feedFormat)
          : mode === "urun_detail"
            ? await feedService.getUrunDetail(feedApiKey, feedUrunId.trim(), feedFormat)
            : mode === "schema_xsd"
              ? await feedService.getSchemaXsd(feedApiKey)
              : await feedService.getStokFiyat(feedApiKey, feedFormat);
      setFeedResult(res);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Feed isteği başarısız.");
    } finally {
      setFeedLoading(false);
    }
  };

  const rows: OpsFirma[] = listQ.data?.results ?? [];
  const keys: OpsApiAnahtar[] = keysQ.data ?? [];
  const kanalIzinleri: OpsKanalIzni[] = kanalIzinleriQ.data?.results ?? [];
  const aliciKanalErisimleri = aliciKanalErisimQ.data?.results ?? [];
  const fiyatGruplari = fiyatGruplariQ.data?.results ?? [];
  const salesChannels = Array.isArray(salesChannelsQ.data)
    ? salesChannelsQ.data
    : salesChannelsQ.data?.results ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="text-sm text-muted-foreground">Ara</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ad / kod" />
        </div>
        <Button type="button" onClick={() => setStep(1)}>
          Yeni firma
        </Button>
      </div>

      {step > 0 ? (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm text-muted-foreground">Adım {step}/4</p>
          {step === 1 && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.alici_mi}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, alici_mi: e.target.checked }))
                  }
                />
                Alıcı (Kuyumcu)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.tedarikci_mi}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, tedarikci_mi: e.target.checked }))
                  }
                />
                Tedarikçi
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.api_musterisi_mi}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      api_musterisi_mi: e.target.checked,
                    }))
                  }
                />
                API Müşterisi
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Ad</label>
                <Input
                  value={draft.ad}
                  onChange={(e) => setDraft((d) => ({ ...d, ad: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Kod</label>
                <Input
                  value={draft.firma_kodu}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, firma_kodu: e.target.value }))
                  }
                />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Davet e-posta</label>
                <Input
                  value={draft.email}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, email: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Rol</label>
                <Input
                  value={draft.rol}
                  onChange={(e) => setDraft((d) => ({ ...d, rol: e.target.value }))}
                />
              </div>
            </div>
          )}
          {step === 4 && (
            <p className="text-sm text-muted-foreground">
              {draft.ad} / {draft.firma_kodu} — kaydı onaylayın.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              İptal
            </Button>
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                Geri
              </Button>
            ) : null}
            {step < 4 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                İleri
              </Button>
            ) : (
              <Button
                type="button"
                disabled={createM.isPending}
                onClick={() => createM.mutate()}
              >
                Kaydet + davet
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kod</TableHead>
            <TableHead>Ad</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((f) => (
            <TableRow
              key={f.id}
              className={selectedId === f.id ? "bg-muted/40" : undefined}
            >
              <TableCell className="font-mono text-sm">{f.firma_kodu}</TableCell>
              <TableCell>{f.ad}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    f.durum === "AKTIF"
                      ? "success"
                      : f.durum === "ASKIDA"
                        ? "destructive"
                        : "secondary"
                  }
                  className="font-mono text-[10px]"
                >
                  {f.durum}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetailFirmaId(f.id);
                    setDetailTab("genel");
                  }}
                >
                  Detay & Yönetim
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedId(f.id);
                    setLastPlaintext(null);
                  }}
                >
                  API anahtarları
                </Button>
                {f.durum !== "AKTIF" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={onayM.isPending}
                    onClick={() => onayM.mutate(f.id)}
                  >
                    Onayla
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedId != null ? (
        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">
                Feed API anahtarları
                {selected ? ` — ${selected.ad}` : ""}
              </h2>
              <p className="text-xs text-muted-foreground">
                Plaintext yalnız oluşturma anında; sonra yalnız prefix görünür.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedId(null);
                setLastPlaintext(null);
              }}
            >
              Kapat
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-sm text-muted-foreground">Anahtar adı</label>
              <Input
                value={keyAd}
                onChange={(e) => setKeyAd(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              type="button"
              disabled={createKeyM.isPending}
              onClick={() => createKeyM.mutate()}
            >
              Yeni anahtar
            </Button>
          </div>

          {lastPlaintext ? (
            <p className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs break-all">
              {lastPlaintext}
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>{k.ad}</TableCell>
                  <TableCell className="font-mono text-sm">{k.key_prefix}</TableCell>
                  <TableCell>{k.iptal ? "iptal" : "aktif"}</TableCell>
                  <TableCell className="text-right">
                    {!k.iptal ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={iptalKeyM.isPending}
                        onClick={() => iptalKeyM.mutate(k.id)}
                      >
                        İptal et
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!keys.length && !keysQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Anahtar yok.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          {/* Canlı Feed Doğrulama (X-Api-Key) */}
          <div className="rounded-[8px] border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-foreground">
                  Canlı Feed Doğrulama (X-Api-Key)
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  <code className="font-mono">/feed/urunler/</code>,{" "}
                  <code className="font-mono">/feed/urunler/{"{id}"}/</code> ve{" "}
                  <code className="font-mono">/feed/stok-fiyat/</code> uçlarını gerçek anahtarla test edin.
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <Label htmlFor="feed-key-input" className="text-[11px]">
                  X-Api-Key
                </Label>
                <Input
                  id="feed-key-input"
                  value={feedApiKey}
                  onChange={(e) => setFeedApiKey(e.target.value)}
                  placeholder="tg_..."
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label htmlFor="feed-urun-id" className="text-[11px]">
                  Ürün ID (Detay için)
                </Label>
                <Input
                  id="feed-urun-id"
                  value={feedUrunId}
                  onChange={(e) => setFeedUrunId(e.target.value)}
                  placeholder="Örn: 1"
                  className="font-mono text-xs"
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
                Ürün Feed’i Getir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("urun_detail")}
              >
                Ürün Detay Feed’i
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("stok_fiyat")}
              >
                Stok & Fiyat Feed’i
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={feedLoading}
                onClick={() => void runFeedTest("schema_xsd")}
              >
                XSD Şema Getir
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
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-muted-foreground">
                  Content-Type: {feedResult.contentType || feedResult.format}
                </div>
                <pre className="max-h-60 overflow-auto rounded-[6px] border border-border bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap">
                  {feedResult.format === "json"
                    ? JSON.stringify(feedResult.data, null, 2)
                    : feedResult.raw}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Kanal İzinleri Bölümü */}
      <div className="space-y-3 border-t pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Satış Kanalı İzinleri
            </h2>
            <p className="text-xs text-muted-foreground">
              Tedarikçilerin satış kanallarına erişim talepleri (<code className="font-mono">/ops/kanal-izinleri/</code>).
            </p>
          </div>
          <select
            value={kanalDurum}
            onChange={(e) => setKanalDurum(e.target.value)}
            className="h-9 rounded-[6px] border border-border bg-background px-2.5 text-xs"
          >
            <option value="">Tüm durumlar</option>
            <option value="BEKLEMEDE">BEKLEMEDE</option>
            <option value="ONAYLANDI">ONAYLANDI</option>
            <option value="REDDEDILDI">REDDEDILDI</option>
          </select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Tedarikçi Firma</TableHead>
              <TableHead>Satış Kanalı</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kanalIzinleri.map((iz) => (
              <TableRow key={iz.id}>
                <TableCell className="font-mono text-xs">#{iz.id}</TableCell>
                <TableCell className="font-mono text-xs">
                  Firma #{iz.tedarikci_firma_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  Kanal #{iz.satis_kanali_id}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      iz.durum === "ONAYLANDI"
                        ? "success"
                        : iz.durum === "REDDEDILDI"
                          ? "destructive"
                          : "warning"
                    }
                    className="font-mono text-[10px]"
                  >
                    {iz.durum}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {iz.durum === "BEKLEMEDE" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={onaylaKanalM.isPending || reddetKanalM.isPending}
                        onClick={() => onaylaKanalM.mutate(iz.id)}
                      >
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={onaylaKanalM.isPending || reddetKanalM.isPending}
                        onClick={() => reddetKanalM.mutate(iz.id)}
                      >
                        Reddet
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!kanalIzinleri.length && !kanalIzinleriQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-xs text-muted-foreground">
                  Kanal izin talebi yok.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Alıcı / API Kanal Erişimleri Bölümü */}
      <div className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Alıcı / API Kanal Erişimleri &amp; Fiyat Grupları
          </h2>
          <p className="text-xs text-muted-foreground">
            Firmaların satış kanalı (<code className="font-mono">KUYUMCU_PORTAL / B2B_API / B2C</code>) ve fiyat grubu yetkileri (<code className="font-mono">/ops/alici-kanal-erisimleri/</code>).
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createAliciKanalM.mutate();
          }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-[8px] border border-border bg-card p-3"
        >
          <select
            required
            value={erisimDraft.firma_id}
            onChange={(e) =>
              setErisimDraft((d) => ({ ...d, firma_id: e.target.value }))
            }
            className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
          >
            <option value="">Alıcı / API Firma seçin…</option>
            {rows.map((f) => (
              <option key={f.id} value={f.id}>
                #{f.id} · {f.ad}
              </option>
            ))}
          </select>
          <select
            required
            value={erisimDraft.satis_kanali_id}
            onChange={(e) =>
              setErisimDraft((d) => ({ ...d, satis_kanali_id: e.target.value }))
            }
            className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
          >
            <option value="">Satış Kanalı seçin…</option>
            {salesChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.kod} — {ch.ad}
              </option>
            ))}
          </select>
          <select
            required
            value={erisimDraft.fiyat_grubu_id}
            onChange={(e) =>
              setErisimDraft((d) => ({ ...d, fiyat_grubu_id: e.target.value }))
            }
            className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs"
          >
            <option value="">Fiyat Grubu seçin…</option>
            {fiyatGruplari.map((fg) => (
              <option key={fg.id} value={fg.id}>
                {fg.kod} — {fg.ad}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={createAliciKanalM.isPending}>
            {createAliciKanalM.isPending ? "Kaydediliyor…" : "Kanal Erişimi Tanımla"}
          </Button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead>Satış Kanalı</TableHead>
              <TableHead>Fiyat Grubu</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aliciKanalErisimleri.map((er) => (
              <TableRow key={er.id}>
                <TableCell className="font-mono text-xs">#{er.id}</TableCell>
                <TableCell className="text-xs font-medium">
                  {er.firma_ad || `Firma #${er.firma_id}`}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {er.satis_kanali_kod}
                  {er.satis_kanali_ad ? ` (${er.satis_kanali_ad})` : ""}
                </TableCell>
                <TableCell className="text-xs">
                  {er.fiyat_grubu_ad || er.fiyat_grubu_kod || `#${er.fiyat_grubu_id}`}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={er.aktif ? "success" : "secondary"}
                    className="font-mono text-[10px]"
                  >
                    {er.aktif ? "AKTIF" : "PASIF"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleAliciKanalM.isPending}
                    onClick={() => toggleAliciKanalM.mutate(er.id)}
                  >
                    {er.aktif ? "Pasife Al" : "Aktif Et"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!aliciKanalErisimleri.length && !aliciKanalErisimQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-xs text-muted-foreground">
                  Tanımlı alıcı/API kanal erişimi yok.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Firma Detay & Alt Kaynaklar Dialog */}
      <Dialog
        open={detailFirmaId != null}
        onOpenChange={(open) => {
          if (!open) setDetailFirmaId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Firma Detay & Yönetim {detailQ.data ? `— ${detailQ.data.ad}` : ""}
            </DialogTitle>
            <DialogDescription>
              Firma profilini düzenleyin, askıya alın veya kontak/adres/banka/belge kayıtlarını yönetin.
            </DialogDescription>
          </DialogHeader>

          {detailQ.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
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
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["genel", "Genel Bilgiler"],
                      ["kontaklar", "Kontaklar"],
                      ["adresler", "Adresler"],
                      ["banka", "Banka"],
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
                {detailQ.data.durum !== "ASKIDA" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={askiyaAlM.isPending}
                    onClick={() => askiyaAlM.mutate(detailQ.data.id)}
                  >
                    {askiyaAlM.isPending ? "Askıya alınıyor…" : "Askıya Al"}
                  </Button>
                )}
              </div>

              {detailTab === "genel" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateFirmaM.mutate();
                  }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <div>
                    <Label className="text-xs">Firma Adı</Label>
                    <Input
                      value={editDraft.ad}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, ad: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Resmi Ünvan</Label>
                    <Input
                      value={editDraft.unvan}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, unvan: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vergi Dairesi</Label>
                    <Input
                      value={editDraft.vergi_dairesi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, vergi_dairesi: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">MERSİS No</Label>
                    <Input
                      value={editDraft.mersis_no}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, mersis_no: e.target.value }))
                      }
                    />
                  </div>
                  <div>
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
                  <div>
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
                  <div>
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      value={editDraft.telefon}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, telefon: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">E-posta</Label>
                    <Input
                      value={editDraft.eposta}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, eposta: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Web Sitesi</Label>
                    <Input
                      value={editDraft.web_sitesi}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, web_sitesi: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vade (Gün)</Label>
                    <Input
                      type="number"
                      value={editDraft.vade_gun}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, vade_gun: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end pt-2">
                    <Button type="submit" disabled={updateFirmaM.isPending}>
                      {updateFirmaM.isPending ? "Güncelleniyor…" : "Değişiklikleri Kaydet"}
                    </Button>
                  </div>
                </form>
              )}

              {detailTab === "kontaklar" && (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad Soyad</TableHead>
                        <TableHead>Departman / Görev</TableHead>
                        <TableHead>İletişim</TableHead>
                        <TableHead>Birincil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(kontaklarQ.data ?? []).map((k) => (
                        <TableRow key={k.id}>
                          <TableCell className="font-medium">{k.ad_soyad}</TableCell>
                          <TableCell className="text-xs">
                            {[k.departman, k.gorev].filter(Boolean).join(" / ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {[k.telefon, k.eposta].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell>{k.birincil ? "Evet" : "Hayır"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createKontakM.mutate();
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
                    <Button type="submit" disabled={createKontakM.isPending}>
                      {createKontakM.isPending ? "Ekleniyor…" : "Kontak Ekle"}
                    </Button>
                  </form>
                </div>
              )}

              {detailTab === "adresler" && (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tip</TableHead>
                        <TableHead>İl / İlçe</TableHead>
                        <TableHead>Adres</TableHead>
                        <TableHead>Varsayılan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(adreslerQ.data ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs">{a.tip}</TableCell>
                          <TableCell className="text-xs">
                            {a.il} {a.ilce ? `/ ${a.ilce}` : ""}
                          </TableCell>
                          <TableCell className="text-xs">{a.adres}</TableCell>
                          <TableCell>{a.varsayilan ? "Evet" : "Hayır"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createAdresM.mutate();
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
                      <option value="TESLIMAT">TESLIMAT</option>
                      <option value="FATURA">FATURA</option>
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
                    <Button
                      type="submit"
                      className="sm:col-span-4 justify-self-end"
                      disabled={createAdresM.isPending}
                    >
                      {createAdresM.isPending ? "Ekleniyor…" : "Adres Ekle"}
                    </Button>
                  </form>
                </div>
              )}

              {detailTab === "banka" && (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Banka</TableHead>
                        <TableHead>IBAN</TableHead>
                        <TableHead>SWIFT</TableHead>
                        <TableHead>Birim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bankaQ.data ?? []).map((b) => (
                        <TableRow key={b.id}>
                          <TableCell>{b.banka_adi}</TableCell>
                          <TableCell className="font-mono text-xs">{b.iban}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.swift_bic || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.para_birimi}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createBankaM.mutate();
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
                    <Button type="submit" disabled={createBankaM.isPending}>
                      {createBankaM.isPending ? "Ekleniyor…" : "Banka Hesabı Ekle"}
                    </Button>
                  </form>
                </div>
              )}

              {detailTab === "belgeler" && (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tip</TableHead>
                        <TableHead>Başlık</TableHead>
                        <TableHead>Storage Key</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(belgelerQ.data ?? []).map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.tip}</TableCell>
                          <TableCell>{b.baslik}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.storage_key}
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
                    <Input
                      placeholder="Tip (VERGI_LEVHASI)"
                      required
                      value={belgeDraft.tip}
                      onChange={(e) =>
                        setBelgeDraft((d) => ({ ...d, tip: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Başlık *"
                      required
                      value={belgeDraft.baslik}
                      onChange={(e) =>
                        setBelgeDraft((d) => ({ ...d, baslik: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Storage Key *"
                      required
                      value={belgeDraft.storage_key}
                      onChange={(e) =>
                        setBelgeDraft((d) => ({ ...d, storage_key: e.target.value }))
                      }
                    />
                    <Button type="submit" disabled={createBelgeM.isPending}>
                      {createBelgeM.isPending ? "Ekleniyor…" : "Belge Ekle"}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
