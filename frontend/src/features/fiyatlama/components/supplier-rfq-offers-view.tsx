"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { fiyatlamaService } from "../services";
import type {
  OpsRfqMatch,
  OpsRfqMatchCandidate,
  SupplierOffer,
  SupplierOfferImportSatir,
  SupplierRfq,
} from "../types";
import { formatMoney } from "@/lib/format";
import {
  useBuyerRfqsQuery,
  useFiyatlamaInvalidate,
  useSupplierOffersQuery,
  useSupplierRfqQuery,
  useSupplierRfqsQuery,
} from "../hooks";
import { useAuth } from "@/features/auth";
import { useMonturlerQuery, useTaslarQuery } from "@/features/urunler";
import { ApiError } from "@/lib/api/client";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import {
  ConfirmDialog,
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
} from "@/components/crud";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Briefcase,
  Eye,
  EyeOff,
  FileCheck2,
  GitBranch,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { useActionToast } from "@/hooks/use-action-toast";
import { BlindPoolCallout } from "./blind-pool-callout";
import { RfqStatusTracker } from "./rfq-status-tracker";
import { buildOzelUretimAciklama } from "../lib/ozel-uretim-aciklama";

const offerSchema = z.object({
  varyant_id: z
    .number({ message: "Lütfen bir ürün varyantı seçin." })
    .int()
    .positive("Lütfen bir ürün varyantı seçin."),
  fiyat_modeli: z.enum(["METAL_BAZLI", "GRAM_BIRIM", "SABIT_PARCA"]),
  birim_fiyat: z.string().trim().optional(),
  gram: z.string().trim().optional(),
  iscilik_override: z.string().trim().optional(),
  para_birimi: z.string(),
  uretim_suresi_gun: z.number().int().positive().optional(),
  rfq_id: z.number().int().positive().optional(),
  rfq_line_id: z.number().int().positive().optional(),
});

type OfferFormValues = z.infer<typeof offerSchema>;

const buyerRfqSchema = z.object({
  baslik: z.string().trim().min(3, "Talep başlığı en az 3 karakter olmalıdır."),
  talep_tipi: z.enum(["STANDART", "KATALOG_DISI", "OZEL_URETIM"]),
  montur_ad: z.string().trim().optional(),
  montur_varyant_id: z.string().trim().optional(),
  tas_ozeti: z.string().trim().optional(),
  hedef_ayar: z.string().trim().min(1, "Ayar bilgisi zorunludur (örn: 14, 18, 22)."),
  hedef_gram: z.string().trim().min(1, "Hedef gram zorunludur."),
  miktar: z.string().trim().min(1, "Talep adedi zorunludur."),
  aciklama: z.string().trim().optional(),
});

type BuyerRfqFormValues = z.infer<typeof buyerRfqSchema>;

const TALEP_TIPI_LABEL: Record<string, string> = {
  STANDART: "Standart Alım",
  KATALOG_DISI: "Katalog Dışı Model",
  OZEL_URETIM: "Özel Üretim / Tasarım",
};

const FIYAT_MODELI_LABEL: Record<string, string> = {
  GRAM_BIRIM: "Gram × Birim Fiyat",
  SABIT_PARCA: "Sabit Parça Fiyatı",
  METAL_BAZLI: "Metal Bazlı (Ayar + İşçilik)",
};

export function SupplierRfqOffersView({
  focusRfqId,
}: {
  focusRfqId?: string;
}) {
  const actionToast = useActionToast();
  const { user } = useAuth();
  const invalidateFiyatlama = useFiyatlamaInvalidate();

  const [activeTab, setActiveTab] = useState<"rfqs" | "offers" | "buyer_rfqs">("rfqs");
  const [rfqPage, setRfqPage] = useState(1);
  const [offerPage, setOfferPage] = useState(1);
  const [offerDurumFilter, setOfferDurumFilter] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [buyerRfqPage, setBuyerRfqPage] = useState(1);

  const rfqsQuery = useSupplierRfqsQuery({
    page: String(rfqPage),
    page_size: "20",
  });
  const offersQuery = useSupplierOffersQuery({
    page: String(offerPage),
    page_size: "20",
    ...(offerDurumFilter ? { durum: offerDurumFilter } : {}),
    ...(offerSearch.trim() ? { q: offerSearch.trim() } : {}),
  });
  const buyerRfqsQuery = useBuyerRfqsQuery({
    page: String(buyerRfqPage),
    page_size: "20",
  });

  const focusIdNum =
    focusRfqId && Number.isFinite(Number(focusRfqId))
      ? Number(focusRfqId)
      : undefined;
  const focusRfqQuery = useSupplierRfqQuery(focusIdNum, Boolean(focusIdNum));

  const rfqs = rfqsQuery.data?.results || [];
  const offers = offersQuery.data?.results || [];
  const buyerRfqs = buyerRfqsQuery.data?.results || [];

  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerModalError, setOfferModalError] = useState<string | null>(null);
  const [selectedRfq, setSelectedRfq] = useState<SupplierRfq | null>(null);

  const [buyerRfqModalOpen, setBuyerRfqModalOpen] = useState(false);
  const [buyerRfqModalError, setBuyerRfqModalError] = useState<string | null>(null);
  const monturlerQuery = useMonturlerQuery({ page_size: "50" }, buyerRfqModalOpen);
  const taslarQuery = useTaslarQuery({ page_size: "50" }, buyerRfqModalOpen);
  const monturlerList = monturlerQuery.data?.results || [];
  const taslarList = taslarQuery.data?.results || [];

  // Offer detail & versioning
  const [offerDetail, setOfferDetail] = useState<SupplierOffer | null>(null);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailOpen, setOfferDetailOpen] = useState(false);
  const [versionDraft, setVersionDraft] = useState({
    fiyat_modeli: "GRAM_BIRIM",
    gram: "",
    birim_fiyat: "",
  });
  const [versionSaving, setVersionSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<SupplierOffer | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // RFQ detail, messages, revisions & ops matching
  const [rfqDetailOpen, setRfqDetailOpen] = useState(false);
  const [rfqDetailMode, setRfqDetailMode] = useState<"buyer" | "supplier">("supplier");
  const [rfqDetail, setRfqDetail] = useState<SupplierRfq | null>(null);
  const [rfqDetailLoading, setRfqDetailLoading] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [revText, setRevText] = useState("");
  const [revSending, setRevSending] = useState(false);

  const [matchCandidates, setMatchCandidates] = useState<
    Record<number, OpsRfqMatchCandidate[]>
  >({});
  const [lineMatches, setLineMatches] = useState<Record<number, OpsRfqMatch[]>>({});
  const [matchSuggestInput, setMatchSuggestInput] = useState<
    Record<number, { varyant_id?: number; varyant_label?: string; kanit: string; skor: string }>
  >({});
  const [matchBusyLineId, setMatchBusyLineId] = useState<number | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<
    SupplierOfferImportSatir[]
  >([]);
  const [importErrors, setImportErrors] = useState<
    Array<{ satir_no: number; hata: string }>
  >([]);

  const offerForm = useForm<OfferFormValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      varyant_id: undefined,
      fiyat_modeli: "GRAM_BIRIM",
      birim_fiyat: "",
      gram: "",
      iscilik_override: "",
      para_birimi: "TRY",
      uretim_suresi_gun: 3,
      rfq_id: undefined,
      rfq_line_id: undefined,
    },
  });

  const buyerRfqForm = useForm<BuyerRfqFormValues>({
    resolver: zodResolver(buyerRfqSchema),
    defaultValues: {
      baslik: "",
      talep_tipi: "OZEL_URETIM",
      montur_ad: "",
      montur_varyant_id: "",
      tas_ozeti: "",
      hedef_ayar: "14",
      hedef_gram: "25.00",
      miktar: "1",
      aciklama: "",
    },
  });

  useEffect(() => {
    if (focusRfqQuery.data) {
      setSelectedRfq(focusRfqQuery.data);
      setActiveTab("rfqs");
    }
  }, [focusRfqQuery.data]);

  const handleOpenOfferModal = (rfq?: SupplierRfq) => {
    setOfferModalError(null);
    setSelectedRfq(rfq ?? null);
    const firstLine = rfq?.lines?.[0];
    offerForm.reset({
      varyant_id: firstLine?.varyant_id ?? undefined,
      fiyat_modeli: "GRAM_BIRIM",
      birim_fiyat: "",
      gram: "",
      iscilik_override: "",
      para_birimi: "TRY",
      uretim_suresi_gun: 3,
      rfq_id: rfq?.id,
      rfq_line_id: firstLine?.id,
    });
    setOfferModalOpen(true);
  };

  const onOfferSubmit = offerForm.handleSubmit(async (data) => {
    setOfferModalError(null);
    try {
      await fiyatlamaService.createSupplierOffer({
        varyant_id: Number(data.varyant_id),
        fiyat_modeli: data.fiyat_modeli,
        birim_fiyat: data.birim_fiyat?.trim() || undefined,
        gram: data.gram?.trim() || undefined,
        iscilik_override: data.iscilik_override?.trim() || undefined,
        para_birimi: data.para_birimi,
        uretim_suresi_gun: data.uretim_suresi_gun
          ? Number(data.uretim_suresi_gun)
          : undefined,
        ...(data.rfq_id ? { rfq_id: Number(data.rfq_id) } : {}),
        ...(data.rfq_line_id ? { rfq_line_id: Number(data.rfq_line_id) } : {}),
      });
      setOfferModalOpen(false);
      offerForm.reset();
      actionToast.success("Taslak teklif oluşturuldu");
      invalidateFiyatlama();
      setActiveTab("offers");
    } catch (err) {
      const msg = mapCommerceError(err, "Teklif oluşturulamadı.");
      setOfferModalError(msg);
      actionToast.error("Teklif oluşturulamadı", err);
    }
  });

  const onBuyerRfqSubmit = buyerRfqForm.handleSubmit(async (data) => {
    setBuyerRfqModalError(null);
    try {
      const monturId = data.montur_varyant_id
        ? Number(data.montur_varyant_id)
        : undefined;
      const aciklama = buildOzelUretimAciklama({
        monturAd: data.montur_ad,
        monturVaryantId:
          monturId && Number.isFinite(monturId) ? monturId : undefined,
        tasOzeti: data.tas_ozeti,
        hedefAyar: data.hedef_ayar,
        hedefGram: data.hedef_gram,
        not: data.aciklama,
      });
      await fiyatlamaService.createBuyerRfq({
        baslik: data.baslik,
        talep_tipi: data.talep_tipi,
        lines: [
          {
            miktar: data.miktar,
            birim: "ADET",
            varyant_id:
              monturId && Number.isFinite(monturId) ? monturId : undefined,
            aciklama,
          },
        ],
      });
      setBuyerRfqModalOpen(false);
      buyerRfqForm.reset();
      actionToast.success("Özel talep taslağı oluşturuldu");
      invalidateFiyatlama();
    } catch (err) {
      const msg = mapCommerceError(err, "Özel talep oluşturulamadı.");
      setBuyerRfqModalError(msg);
      actionToast.error("Özel talep oluşturulamadı", err);
    }
  });

  const handleSendBuyerRfq = async (id: number) => {
    try {
      await fiyatlamaService.sendBuyerRfq(id);
      actionToast.success("Talep tedarikçi havuzunda yayınlandı");
      invalidateFiyatlama();
    } catch (err) {
      actionToast.error("Talep yayınlanamadı", err);
    }
  };

  const handleSubmitOffer = async (id: number) => {
    try {
      await fiyatlamaService.submitSupplierOffer(id);
      actionToast.success("Teklif onay için iletildi");
      invalidateFiyatlama();
    } catch (err) {
      actionToast.error("Teklif iletilemedi", err);
    }
  };

  const confirmDeactivateOffer = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await fiyatlamaService.deactivateSupplierOffer(deactivateTarget.id);
      actionToast.success("Teklif pasif hale getirildi");
      setDeactivateTarget(null);
      invalidateFiyatlama();
    } catch (err) {
      actionToast.error("Teklif pasifleştirilemedi", err);
    } finally {
      setDeactivating(false);
    }
  };

  const openOfferDetail = async (id: number) => {
    setOfferDetailOpen(true);
    setOfferDetailLoading(true);
    try {
      const detail = await fiyatlamaService.getSupplierOfferDetail(id);
      setOfferDetail(detail);
      setVersionDraft({
        fiyat_modeli: detail.fiyat_modeli || "GRAM_BIRIM",
        gram: detail.gram || "",
        birim_fiyat: detail.birim_fiyat || "",
      });
    } catch (err) {
      actionToast.error("Teklif detayı alınamadı", err);
    } finally {
      setOfferDetailLoading(false);
    }
  };

  const handleCreateOfferVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerDetail) return;
    setVersionSaving(true);
    try {
      const created = await fiyatlamaService.createSupplierOfferVersion(
        offerDetail.id,
        {
          fiyat_modeli: versionDraft.fiyat_modeli || undefined,
          gram: versionDraft.gram.trim() || undefined,
          birim_fiyat: versionDraft.birim_fiyat.trim() || undefined,
        }
      );
      setOfferDetail(created);
      actionToast.success("Yeni teklif versiyonu oluşturuldu");
      invalidateFiyatlama();
    } catch (err) {
      actionToast.error("Yeni versiyon oluşturulamadı", err);
    } finally {
      setVersionSaving(false);
    }
  };

  const openRfqDetail = async (id: number, mode: "buyer" | "supplier") => {
    setRfqDetailOpen(true);
    setRfqDetailMode(mode);
    setRfqDetailLoading(true);
    setRfqDetail(null);
    setMatchCandidates({});
    setLineMatches({});
    setMsgText("");
    setRevText("");
    try {
      const detail =
        mode === "buyer"
          ? await fiyatlamaService.getBuyerRfqDetail(id)
          : await fiyatlamaService.getSupplierRfq(id);
      setRfqDetail(detail);
    } catch (err) {
      actionToast.error("Talep detayı alınamadı", err);
    } finally {
      setRfqDetailLoading(false);
    }
  };

  const reloadActiveRfqDetail = async () => {
    if (!rfqDetail) return;
    const detail =
      rfqDetailMode === "buyer"
        ? await fiyatlamaService.getBuyerRfqDetail(rfqDetail.id)
        : await fiyatlamaService.getSupplierRfq(rfqDetail.id);
    setRfqDetail(detail);
  };

  const handleSendRfqMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfqDetail || !msgText.trim()) return;
    setMsgSending(true);
    try {
      if (rfqDetailMode === "buyer") {
        await fiyatlamaService.addBuyerRfqMessage(rfqDetail.id, msgText.trim());
      } else {
        await fiyatlamaService.addSupplierRfqMessage(rfqDetail.id, msgText.trim());
      }
      setMsgText("");
      actionToast.success("Mesaj gönderildi");
      await reloadActiveRfqDetail();
    } catch (err) {
      actionToast.error("Mesaj gönderilemedi", err);
    } finally {
      setMsgSending(false);
    }
  };

  const handleAddRfqRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfqDetail || !revText.trim()) return;
    setRevSending(true);
    try {
      if (rfqDetailMode === "buyer") {
        await fiyatlamaService.addBuyerRfqRevision(rfqDetail.id, revText.trim());
      } else {
        await fiyatlamaService.addSupplierRfqRevision(rfqDetail.id, revText.trim());
      }
      setRevText("");
      actionToast.success("Revizyon eklendi");
      await reloadActiveRfqDetail();
    } catch (err) {
      actionToast.error("Revizyon eklenemedi", err);
    } finally {
      setRevSending(false);
    }
  };

  const handleLoadCandidates = async (lineId: number) => {
    setMatchBusyLineId(lineId);
    try {
      const res = await fiyatlamaService.getRfqMatchCandidates(lineId);
      setMatchCandidates((prev) => ({ ...prev, [lineId]: res.results || [] }));
    } catch (err) {
      actionToast.error("Aday ürünler alınamadı", err);
    } finally {
      setMatchBusyLineId(null);
    }
  };

  const handleLoadMatches = async (lineId: number) => {
    setMatchBusyLineId(lineId);
    try {
      const res = await fiyatlamaService.getRfqLineMatches(lineId);
      setLineMatches((prev) => ({ ...prev, [lineId]: res.results || [] }));
    } catch (err) {
      actionToast.error("Eşleştirmeler alınamadı", err);
    } finally {
      setMatchBusyLineId(null);
    }
  };

  const handleSuggestMatch = async (lineId: number) => {
    const form = matchSuggestInput[lineId];
    const varyantId = Number(form?.varyant_id);
    if (!Number.isInteger(varyantId) || varyantId <= 0) {
      actionToast.error("Lütfen bir katalog varyantı seçin", null);
      return;
    }
    setMatchBusyLineId(lineId);
    try {
      await fiyatlamaService.createRfqLineMatch(lineId, {
        varyant_id: varyantId,
        kanit: form?.kanit || undefined,
        skor: form?.skor || undefined,
      });
      actionToast.success("Eşleştirme önerildi");
      await handleLoadMatches(lineId);
    } catch (err) {
      actionToast.error("Eşleştirme önerilemedi", err);
    } finally {
      setMatchBusyLineId(null);
    }
  };

  const handleApproveMatch = async (lineId: number, matchId: number) => {
    setMatchBusyLineId(lineId);
    try {
      await fiyatlamaService.approveRfqMatch(matchId);
      actionToast.success("Eşleştirme onaylandı");
      await handleLoadMatches(lineId);
    } catch (err) {
      actionToast.error("Onay başarısız", err);
    } finally {
      setMatchBusyLineId(null);
    }
  };

  const handleRejectMatch = async (lineId: number, matchId: number) => {
    setMatchBusyLineId(lineId);
    try {
      await fiyatlamaService.rejectRfqMatch(matchId);
      actionToast.success("Eşleştirme reddedildi");
      await handleLoadMatches(lineId);
    } catch (err) {
      actionToast.error("Reddetme başarısız", err);
    } finally {
      setMatchBusyLineId(null);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".pdf")) {
      actionToast.error("PDF dosyası desteklenmiyor; lütfen CSV dosyası seçin.", null);
      return;
    }
    setImportBusy(true);
    try {
      const text = await file.text();
      const preview = await fiyatlamaService.previewOfferImport(text);
      setImportPreviewRows(preview.satirlar || []);
      setImportErrors(preview.hatalar || []);
      if ((preview.satirlar || []).length === 0) {
        actionToast.error("Dosyada geçerli satır bulunamadı", null);
      } else {
        actionToast.success(
          `${preview.satirlar.length} satır içe aktarmaya hazır` +
            (preview.hatalar?.length ? `, ${preview.hatalar.length} hatalı satır` : "")
        );
      }
    } catch (err) {
      setImportPreviewRows([]);
      setImportErrors([]);
      actionToast.error("Dosya önizlemesi başarısız", err);
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportCommit = async () => {
    if (importPreviewRows.length === 0) return;
    setImportBusy(true);
    try {
      const result = await fiyatlamaService.commitOfferImport(importPreviewRows);
      actionToast.success(`${result.created.length} taslak teklif oluşturuldu`);
      setImportPreviewRows([]);
      setImportErrors([]);
      invalidateFiyatlama();
    } catch (err) {
      if (err instanceof ApiError) {
        const hatalar = (err.problem as { hatalar?: typeof importErrors }).hatalar;
        if (Array.isArray(hatalar)) setImportErrors(hatalar);
      }
      actionToast.error("Toplu teklif aktarımı başarısız", err);
    } finally {
      setImportBusy(false);
    }
  };

  const tabSwitcher = (
    <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
      <Button
        type="button"
        variant={activeTab === "rfqs" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("rfqs")}
      >
        <Briefcase className="h-3.5 w-3.5" />
        Açık Talep Havuzu
      </Button>
      <Button
        type="button"
        variant={activeTab === "offers" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("offers")}
      >
        <FileCheck2 className="h-3.5 w-3.5" />
        Teklifler
      </Button>
      <Button
        type="button"
        variant={activeTab === "buyer_rfqs" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setActiveTab("buyer_rfqs")}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Özel Taleplerim
      </Button>
    </div>
  );

  const selectedRfqLines = useMemo(() => {
    const rfqId = offerForm.watch("rfq_id");
    if (selectedRfq && selectedRfq.id === rfqId) return selectedRfq.lines ?? [];
    const found = rfqs.find((r) => r.id === rfqId);
    return found?.lines ?? [];
  }, [offerForm, selectedRfq, rfqs]);

  return (
    <div className="flex flex-col gap-6">
      <BlindPoolCallout role="both" />

      {activeTab === "rfqs" ? (
        <ListPage
          title="Tedarikçi Talepleri & Özel Üretim"
          description="Kör havuzdaki açık alım ve özel üretim taleplerini inceleyip teklif verebilirsiniz."
          createLabel="Teklif Ver"
          onCreate={() => handleOpenOfferModal()}
          extraActions={tabSwitcher}
          loading={rfqsQuery.isLoading}
          error={
            rfqsQuery.isError
              ? mapCommerceError(rfqsQuery.error, "Talep havuzu alınamadı.")
              : null
          }
          onRetry={() => void rfqsQuery.refetch()}
          isEmpty={rfqs.length === 0}
          emptyTitle="Açık talep bulunmuyor"
          emptyDescription="Alıcılar tarafından yayınlanmış yeni bir talep olduğunda burada listelenir."
          page={rfqPage}
          pageSize={20}
          totalCount={rfqsQuery.data?.count ?? rfqs.length}
          onPageChange={setRfqPage}
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
            <span>Kör Havuz: Alıcı firma kimliği platform tarafından gizlenir.</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talep Başlığı</TableHead>
                <TableHead>Talep Türü</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Kalem Adedi</TableHead>
                <TableHead className="w-[140px] text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfqs.map((rfq) => (
                <TableRow key={rfq.id}>
                  <TableCell className="text-xs font-medium text-foreground">
                    {rfq.baslik || "Özel Mücevher Talebi"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {TALEP_TIPI_LABEL[rfq.talep_tipi] || rfq.talep_tipi}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {rfq.durum}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">
                    {rfq.lines?.length || 1}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      itemLabel={rfq.baslik || "Talep"}
                      onView={() => void openRfqDetail(rfq.id, "supplier")}
                      extraActions={[
                        {
                          label: "Teklif Ver",
                          icon: <Plus className="h-3.5 w-3.5" />,
                          onClick: () => handleOpenOfferModal(rfq),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListPage>
      ) : activeTab === "offers" ? (
        <div className="flex flex-col gap-4">
          <ListPage
            title="Tedarikçi Teklifleri"
            description="Katalog ürünlerine verdiğiniz taslak ve yayındaki teklifleri yönetin."
            createLabel="Yeni Teklif Oluştur"
            onCreate={() => handleOpenOfferModal()}
            extraActions={tabSwitcher}
            searchValue={offerSearch}
            onSearchChange={(val) => {
              setOfferSearch(val);
              setOfferPage(1);
            }}
            searchPlaceholder="Ürün, stok kodu veya tedarikçi kodu ara…"
            filters={
              <select
                value={offerDurumFilter}
                onChange={(e) => {
                  setOfferDurumFilter(e.target.value);
                  setOfferPage(1);
                }}
                className="h-9 rounded-[6px] border border-border bg-background px-2 text-xs text-foreground"
                aria-label="Teklif durum filtresi"
              >
                <option value="">Tüm Durumlar</option>
                <option value="TASLAK">Taslak</option>
                <option value="ONAY_BEKLIYOR">Onay Bekliyor</option>
                <option value="YAYINDA">Yayında</option>
                <option value="PASIF">Pasif</option>
              </select>
            }
            loading={offersQuery.isLoading}
            error={
              offersQuery.isError
                ? mapCommerceError(offersQuery.error, "Teklifler alınamadı.")
                : null
            }
            onRetry={() => void offersQuery.refetch()}
            isEmpty={offers.length === 0}
            emptyTitle="Henüz teklif kaydı bulunmuyor"
            emptyDescription="Yeni Teklif Oluştur butonuyla veya aşağıdaki toplu CSV aktarımıyla teklif girebilirsiniz."
            page={offerPage}
            pageSize={20}
            totalCount={offersQuery.data?.count ?? offers.length}
            onPageChange={setOfferPage}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün & Varyant</TableHead>
                  <TableHead>Fiyat Modeli</TableHead>
                  <TableHead className="text-right">Birim Teklif</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-[140px] text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => {
                  const actions = offer.allowed_actions || [];
                  return (
                    <TableRow key={offer.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">
                          {offer.urun_ad || offer.tedarikci_kodu || "Katalog Ürünü"}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {offer.varyant_sku || offer.platform_kodu || "—"}
                          {offer.versiyon ? ` · v${offer.versiyon}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {FIYAT_MODELI_LABEL[offer.fiyat_modeli || ""] ||
                          offer.fiyat_modeli ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold text-foreground">
                        {offer.birim_fiyat
                          ? formatMoney(offer.birim_fiyat, offer.para_birimi)
                          : "Metal Bazlı"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            offer.durum === "YAYINDA" || offer.durum === "ONAYLANDI"
                              ? "success"
                              : offer.durum === "PASIF"
                              ? "destructive"
                              : offer.durum === "ONAY_BEKLIYOR"
                              ? "warning"
                              : "outline"
                          }
                          className="text-[10px]"
                        >
                          {offer.durum}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          itemLabel={offer.urun_ad || offer.varyant_sku || "Teklif"}
                          onView={() => void openOfferDetail(offer.id)}
                          extraActions={[
                            ...(actions.includes("submit")
                              ? [
                                  {
                                    label: "Onaya Gönder",
                                    icon: <Send className="h-3.5 w-3.5" />,
                                    onClick: () => void handleSubmitOffer(offer.id),
                                  },
                                ]
                              : []),
                            ...(actions.includes("deactivate")
                              ? [
                                  {
                                    label: "Yayından Kaldır",
                                    variant: "destructive" as const,
                                    onClick: () => setDeactivateTarget(offer),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ListPage>

          {/* Toplu CSV Teklif Yükleme Kartı */}
          <div className="rounded-[8px] border border-border bg-card p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Toplu Teklif Föyü Yükle (CSV)
                </p>
                <p className="text-xs text-muted-foreground">
                  Fiyat modeli, stok kodu (SKU), gram ve birim fiyat sütunlarını içeren CSV dosyası yükleyin.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="text-xs file:mr-2 file:rounded-[4px] file:border file:border-border file:bg-muted file:px-2.5 file:py-1.5"
                  disabled={importBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void handleImportFile(f);
                    e.target.value = "";
                  }}
                />
                <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
              </label>
            </div>
            {importErrors.length > 0 ? (
              <ul className="text-xs text-destructive space-y-0.5">
                {importErrors.slice(0, 8).map((h) => (
                  <li key={`${h.satir_no}-${h.hata}`}>
                    Satır {h.satir_no}: {h.hata}
                  </li>
                ))}
              </ul>
            ) : null}
            {importPreviewRows.length > 0 ? (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Önizleme: {importPreviewRows.length} geçerli satır taslak teklif olarak kaydedilmeye hazır.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={importBusy}
                  onClick={() => void handleImportCommit()}
                >
                  Toplu Kaydet ({importPreviewRows.length})
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <ListPage
          title="Özel Üretim & Talep Oluşturma"
          description="Katalogda bulunmayan özel ayar, gram veya tasarım taleplerinizi tedarikçi havuzunda yayınlayın."
          createLabel="Yeni Özel Talep Başlat"
          onCreate={() => {
            setBuyerRfqModalError(null);
            buyerRfqForm.reset();
            setBuyerRfqModalOpen(true);
          }}
          extraActions={tabSwitcher}
          loading={buyerRfqsQuery.isLoading}
          error={
            buyerRfqsQuery.isError
              ? mapCommerceError(buyerRfqsQuery.error, "Özel talepler alınamadı.")
              : null
          }
          onRetry={() => void buyerRfqsQuery.refetch()}
          isEmpty={buyerRfqs.length === 0}
          emptyTitle="Henüz özel talebiniz yok"
          emptyDescription="Yeni Özel Talep Başlat butonuna tıklayarak özel üretim veya katalog dışı ürün talebi açabilirsiniz."
          page={buyerRfqPage}
          pageSize={20}
          totalCount={buyerRfqsQuery.data?.count ?? buyerRfqs.length}
          onPageChange={setBuyerRfqPage}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talep Başlığı</TableHead>
                <TableHead>Talep Türü</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Kalem Sayısı</TableHead>
                <TableHead className="w-[140px] text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyerRfqs.map((b) => {
                const actions = b.allowed_actions || [];
                return (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs font-medium text-foreground">
                      {b.baslik || "Özel Mücevher Talebi"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {TALEP_TIPI_LABEL[b.talep_tipi] || b.talep_tipi}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Badge
                          variant={b.durum === "GONDERILDI" ? "default" : "outline"}
                          className="text-[10px] w-fit"
                        >
                          {b.durum}
                        </Badge>
                        <RfqStatusTracker durum={b.durum} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {b.lines?.length || 1}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        itemLabel={b.baslik || "Özel Talep"}
                        onView={() => void openRfqDetail(b.id, "buyer")}
                        extraActions={
                          actions.includes("send")
                            ? [
                                {
                                  label: "Havuzda Yayınla",
                                  icon: <Send className="h-3.5 w-3.5" />,
                                  onClick: () => void handleSendBuyerRfq(b.id),
                                },
                              ]
                            : []
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ListPage>
      )}

      {/* Tedarikçi Teklif Verme Modalı */}
      <EntityModal
        open={offerModalOpen}
        onOpenChange={setOfferModalOpen}
        title={
          selectedRfq
            ? `${selectedRfq.baslik || "Talep"} için Teklif Taslağı`
            : "Yeni Tedarikçi Teklifi"
        }
        description="Katalog varyantını seçerek fiyat teklifi taslağı oluşturun."
        isDirty={offerForm.formState.isDirty}
        isSubmitting={offerForm.formState.isSubmitting}
        submitLabel="Teklifi Oluştur"
        error={offerModalError}
        onSubmit={onOfferSubmit}
        size="md"
      >
        <div className="space-y-4">
          <BlindPoolCallout role="supplier" />

          <div className="space-y-1.5">
            <Label>Ürün / Varyant</Label>
            <Controller
              name="varyant_id"
              control={offerForm.control}
              render={({ field }) => (
                <RelationSelect
                  value={field.value ?? null}
                  onChange={(val) => field.onChange(val ? Number(val) : undefined)}
                  placeholder="Ürün adı veya stok kodu ile seçin…"
                  searchPlaceholder="Ürün adı veya stok kodu ara…"
                  loadOptions={async (q) => {
                    const page = await fiyatlamaService.getSupplierVariants({
                      page_size: "30",
                      ...(q ? { q } : {}),
                    });
                    return (page.results ?? []).map((v) => ({
                      value: v.id,
                      label: v.etiket || `${v.urun_ad} · ${v.sku}`,
                      subtitle: v.platform_kodu || undefined,
                    }));
                  }}
                />
              )}
            />
            {offerForm.formState.errors.varyant_id ? (
              <p className="text-xs text-destructive">
                {offerForm.formState.errors.varyant_id.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bağlı Talep (Opsiyonel)</Label>
              <Controller
                name="rfq_id"
                control={offerForm.control}
                render={({ field }) => (
                  <RelationSelect
                    value={field.value ?? null}
                    onChange={(val) => {
                      const nextId = val ? Number(val) : undefined;
                      field.onChange(nextId);
                      offerForm.setValue("rfq_line_id", undefined);
                    }}
                    placeholder="Doğrudan katalog teklifi…"
                    searchPlaceholder="Talep ara…"
                    clearable
                    loadOptions={async () => {
                      const page = await fiyatlamaService.getSupplierRfqs({
                        page_size: "30",
                      });
                      return (page.results ?? []).map((r) => ({
                        value: r.id,
                        label: r.baslik || "Özel Mücevher Talebi",
                        subtitle: TALEP_TIPI_LABEL[r.talep_tipi] || r.talep_tipi,
                      }));
                    }}
                  />
                )}
              />
            </div>

            {selectedRfqLines.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-rfq-line">Talep Satırı</Label>
                <select
                  id="offer-rfq-line"
                  className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                  {...offerForm.register("rfq_line_id", {
                    setValueAs: (v) =>
                      v === "" || Number.isNaN(Number(v)) ? undefined : Number(v),
                  })}
                >
                  <option value="">Satır seçin…</option>
                  {selectedRfqLines.map((ln, idx) =>
                    ln.id ? (
                      <option key={ln.id} value={ln.id}>
                        Kalem {idx + 1} · {ln.miktar || "1"} {ln.birim || "ADET"}
                        {ln.aciklama ? ` — ${ln.aciklama.slice(0, 40)}` : ""}
                      </option>
                    ) : null
                  )}
                </select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="offer-model">Fiyat Modeli</Label>
              <select
                id="offer-model"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                {...offerForm.register("fiyat_modeli")}
              >
                <option value="GRAM_BIRIM">Gram × Birim Fiyat</option>
                <option value="SABIT_PARCA">Sabit Parça Fiyatı</option>
                <option value="METAL_BAZLI">Metal Bazlı</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-gram">Gram</Label>
              <Input
                id="offer-gram"
                className="font-mono tabular-nums text-right"
                placeholder="Örn: 12.500"
                {...offerForm.register("gram")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="offer-price">Birim Fiyat</Label>
              <Input
                id="offer-price"
                className="font-mono tabular-nums text-right"
                placeholder="Örn: 2450.00"
                {...offerForm.register("birim_fiyat")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-isci">İşçilik (Gram başı, opsiyonel)</Label>
              <Input
                id="offer-isci"
                className="font-mono tabular-nums text-right"
                placeholder="Örn: 150.00"
                {...offerForm.register("iscilik_override")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="offer-curr">Para Birimi</Label>
              <select
                id="offer-curr"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                {...offerForm.register("para_birimi")}
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-days">Üretim Süresi (Gün)</Label>
              <Input
                id="offer-days"
                type="number"
                placeholder="Örn: 3"
                {...offerForm.register("uretim_suresi_gun", {
                  setValueAs: (v) =>
                    v === "" || Number.isNaN(Number(v)) ? undefined : Number(v),
                })}
              />
            </div>
          </div>
        </div>
      </EntityModal>

      {/* Alıcı Özel Talep Oluşturma Modalı */}
      <EntityModal
        open={buyerRfqModalOpen}
        onOpenChange={setBuyerRfqModalOpen}
        title="Özel Üretim / Tasarım Talebi"
        description="Montür ve taş kataloglarından seçim yapabilir veya özel ölçü ve ayar bilgisi girebilirsiniz."
        isDirty={buyerRfqForm.formState.isDirty}
        isSubmitting={buyerRfqForm.formState.isSubmitting}
        submitLabel="Talebi Kaydet"
        error={buyerRfqModalError}
        onSubmit={onBuyerRfqSubmit}
        size="md"
      >
        <div className="space-y-4">
          <BlindPoolCallout role="buyer" />
          <div className="space-y-1.5">
            <Label htmlFor="rfq-title">Talep Başlığı</Label>
            <Input
              id="rfq-title"
              placeholder="Örn: 22 Ayar Özel Burma Bilezik"
              {...buyerRfqForm.register("baslik")}
            />
            {buyerRfqForm.formState.errors.baslik ? (
              <p className="text-xs text-destructive">
                {buyerRfqForm.formState.errors.baslik.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rfq-type">Talep Türü</Label>
            <select
              id="rfq-type"
              className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
              {...buyerRfqForm.register("talep_tipi")}
            >
              <option value="OZEL_URETIM">Özel Üretim / Tasarım</option>
              <option value="KATALOG_DISI">Katalog Dışı Model</option>
              <option value="STANDART">Standart Toplu Alım</option>
            </select>
          </div>

          {monturlerList.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="rfq-montur-select">Montür Kataloğundan Seç (Opsiyonel)</Label>
              <select
                id="rfq-montur-select"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    buyerRfqForm.setValue("montur_varyant_id", "");
                    return;
                  }
                  const [prodIdStr, varIdStr] = val.split(":");
                  const prod = monturlerList.find((m) => String(m.id) === prodIdStr);
                  if (prod) {
                    buyerRfqForm.setValue(
                      "montur_ad",
                      `${prod.ad} (${prod.platform_kodu})`
                    );
                    if (prod.ayar) buyerRfqForm.setValue("hedef_ayar", prod.ayar);
                  }
                  if (varIdStr) {
                    buyerRfqForm.setValue("montur_varyant_id", varIdStr);
                    const v = prod?.varyantlar.find((x) => String(x.id) === varIdStr);
                    if (v?.gram) buyerRfqForm.setValue("hedef_gram", v.gram);
                  }
                }}
              >
                <option value="">Katalog montürü seçin…</option>
                {monturlerList.map((m) =>
                  m.varyantlar.length > 0 ? (
                    m.varyantlar.map((v) => (
                      <option key={`${m.id}-${v.id}`} value={`${m.id}:${v.id}`}>
                        {m.ad} · {v.sku} {v.gram ? `(${v.gram}g)` : ""}
                      </option>
                    ))
                  ) : (
                    <option key={m.id} value={`${m.id}:`}>
                      {m.ad} ({m.platform_kodu})
                    </option>
                  )
                )}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rfq-montur">Montür Açıklaması</Label>
            <Input
              id="rfq-montur"
              placeholder="Örn: Burma bilezik montürü"
              {...buyerRfqForm.register("montur_ad")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rfq-tas">Taş Seçimi</Label>
            {taslarList.length > 0 ? (
              <select
                aria-label="Taş kataloğundan seç"
                className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs mb-1"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  buyerRfqForm.setValue("tas_ozeti", e.target.value);
                }}
              >
                <option value="">Taş kataloğundan seç (opsiyonel)…</option>
                {taslarList.map((t) => (
                  <option key={t.id} value={`${t.ad} (${t.kod})`}>
                    {t.ad} ({t.kod}) {t.degerli ? "· Değerli" : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <Input
              id="rfq-tas"
              placeholder="Örn: 0.30ct baget, G-VS"
              {...buyerRfqForm.register("tas_ozeti")}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rfq-ayar">Hedef Ayar</Label>
              <Input
                id="rfq-ayar"
                placeholder="14 / 18 / 22"
                {...buyerRfqForm.register("hedef_ayar")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-gram">Hedef Gram</Label>
              <Input
                id="rfq-gram"
                className="font-mono tabular-nums text-right"
                placeholder="35.50"
                {...buyerRfqForm.register("hedef_gram")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-qty">Adet</Label>
              <Input
                id="rfq-qty"
                className="font-mono tabular-nums text-right"
                placeholder="5"
                {...buyerRfqForm.register("miktar")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rfq-desc">Tasarım / İşçilik Notu</Label>
            <Input
              id="rfq-desc"
              placeholder="Örn: Mat rodajlı, el işçiliği kalem işlemeli"
              {...buyerRfqForm.register("aciklama")}
            />
          </div>
        </div>
      </EntityModal>

      {/* Teklif Detay & Yeni Versiyon Dialog */}
      <Dialog open={offerDetailOpen} onOpenChange={setOfferDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Teklif Detayı{" "}
              {offerDetail ? `— ${offerDetail.urun_ad || offerDetail.varyant_sku || "Teklif"}` : ""}
            </DialogTitle>
            <DialogDescription>
              Teklif koşullarını inceleyin; yayındaki teklifler için yeni versiyon oluşturabilirsiniz.
            </DialogDescription>
          </DialogHeader>
          {offerDetailLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Teklif detayı yükleniyor…
            </div>
          ) : offerDetail ? (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[6px] border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground">Ürün / Varyant</div>
                  <div className="font-semibold">
                    {offerDetail.urun_ad || "Katalog Ürünü"}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {offerDetail.varyant_sku || "—"}
                  </div>
                </div>
                <div className="rounded-[6px] border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground">Versiyon / Durum</div>
                  <div className="font-semibold">
                    Versiyon {offerDetail.versiyon ?? 1} · {offerDetail.durum}
                  </div>
                </div>
                <div className="rounded-[6px] border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground">Model / Gram</div>
                  <div className="font-mono">
                    {FIYAT_MODELI_LABEL[offerDetail.fiyat_modeli || ""] ||
                      offerDetail.fiyat_modeli ||
                      "—"}{" "}
                    / {offerDetail.gram || "—"} gr
                  </div>
                </div>
                <div className="rounded-[6px] border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground">Birim Fiyat</div>
                  <div className="font-mono font-semibold">
                    {offerDetail.birim_fiyat
                      ? formatMoney(offerDetail.birim_fiyat, offerDetail.para_birimi)
                      : "—"}
                  </div>
                </div>
              </div>

              {(offerDetail.allowed_actions ?? []).includes("new_version") ? (
                <form
                  onSubmit={handleCreateOfferVersion}
                  className="space-y-3 border-t pt-3"
                >
                  <h3 className="text-xs font-semibold">Yeni Teklif Versiyonu Oluştur</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">Fiyat Modeli</Label>
                      <select
                        value={versionDraft.fiyat_modeli}
                        onChange={(e) =>
                          setVersionDraft((d) => ({
                            ...d,
                            fiyat_modeli: e.target.value,
                          }))
                        }
                        className="h-9 w-full rounded-[6px] border border-border bg-background px-2 text-xs"
                      >
                        <option value="GRAM_BIRIM">Gram × Birim</option>
                        <option value="SABIT_PARCA">Sabit Parça</option>
                        <option value="METAL_BAZLI">Metal Bazlı</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[11px]">Gram</Label>
                      <Input
                        value={versionDraft.gram}
                        onChange={(e) =>
                          setVersionDraft((d) => ({ ...d, gram: e.target.value }))
                        }
                        placeholder="12.500"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Birim Fiyat</Label>
                      <Input
                        value={versionDraft.birim_fiyat}
                        onChange={(e) =>
                          setVersionDraft((d) => ({
                            ...d,
                            birim_fiyat: e.target.value,
                          }))
                        }
                        placeholder="2500.00"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={versionSaving}>
                      {versionSaving ? "Oluşturuluyor…" : "Yeni Versiyon Oluştur"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* RFQ Detay, Mesajlaşma, Revizyon ve Ops Katalog Eşleştirme Dialog */}
      <Dialog open={rfqDetailOpen} onOpenChange={setRfqDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Talep Detayı {rfqDetail ? `— ${rfqDetail.baslik || "Özel Talep"}` : ""}
            </DialogTitle>
            <DialogDescription>
              Satır detayları, kör mesajlaşma, revizyon geçmişi ve katalog eşleştirmesi.
            </DialogDescription>
          </DialogHeader>

          {rfqDetailLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Talep detayı yükleniyor…
            </div>
          ) : rfqDetail ? (
            <div className="space-y-5 pt-2 text-xs">
              <div className="space-y-2">
                <h3 className="font-semibold">
                  Talep Kalemleri ({rfqDetail.lines?.length ?? 0})
                </h3>
                <div className="space-y-2">
                  {(rfqDetail.lines ?? []).map((ln, idx) => {
                    const lineId = ln.id;
                    const candidates = lineId ? matchCandidates[lineId] : undefined;
                    const matches = lineId ? lineMatches[lineId] : undefined;
                    const suggest = lineId ? matchSuggestInput[lineId] : undefined;
                    return (
                      <div
                        key={lineId ?? idx}
                        className="rounded-[6px] border border-border p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            Kalem {idx + 1} · Miktar: {ln.miktar || "1"}{" "}
                            {ln.birim || "ADET"}
                          </span>
                          <span className="text-muted-foreground">
                            {ln.varyant_id ? "Katalog Ürünü Eşleşti" : "Eşleştirme Bekliyor"}
                          </span>
                        </div>
                        {ln.aciklama ? (
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {ln.aciklama}
                          </p>
                        ) : null}

                        {user?.capabilities?.can_view_ops && lineId ? (
                          <div className="border-t border-border pt-2 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={matchBusyLineId === lineId}
                                onClick={() => void handleLoadCandidates(lineId)}
                              >
                                Adayları Getir
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={matchBusyLineId === lineId}
                                onClick={() => void handleLoadMatches(lineId)}
                              >
                                Mevcut Eşleştirmeler
                              </Button>
                            </div>

                            {candidates && (
                              <div className="rounded bg-muted/40 p-2 space-y-1">
                                <div className="font-medium text-[11px]">
                                  Aday Varyantlar ({candidates.length})
                                </div>
                                {candidates.map((c) => (
                                  <div
                                    key={c.varyant_id}
                                    className="flex items-center justify-between text-[11px]"
                                  >
                                    <span>
                                      {c.urun_ad || "Ürün"} ·{" "}
                                      <span className="font-mono">{c.sku || "—"}</span>
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-[11px]"
                                      onClick={() =>
                                        setMatchSuggestInput((prev) => ({
                                          ...prev,
                                          [lineId]: {
                                            varyant_id: c.varyant_id,
                                            varyant_label: `${c.urun_ad || ""} · ${
                                              c.sku || ""
                                            }`.trim(),
                                            kanit: c.neden || "Aday seçimi",
                                            skor: String(c.skor ?? "0.90"),
                                          },
                                        }))
                                      }
                                    >
                                      Seç
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                              <div className="sm:col-span-2">
                                <RelationSelect
                                  value={suggest?.varyant_id ?? null}
                                  selectedLabel={suggest?.varyant_label}
                                  onChange={(val, opt) =>
                                    setMatchSuggestInput((prev) => ({
                                      ...prev,
                                      [lineId]: {
                                        varyant_id: val ? Number(val) : undefined,
                                        varyant_label: opt?.label,
                                        kanit: prev[lineId]?.kanit ?? "",
                                        skor: prev[lineId]?.skor ?? "0.95",
                                      },
                                    }))
                                  }
                                  placeholder="Katalog varyantı seçin…"
                                  searchPlaceholder="Ürün veya stok kodu ara…"
                                  loadOptions={async (q) => {
                                    const page = await fiyatlamaService.getSupplierVariants({
                                      page_size: "30",
                                      ...(q ? { q } : {}),
                                    });
                                    return (page.results ?? []).map((v) => ({
                                      value: v.id,
                                      label: v.etiket || `${v.urun_ad} · ${v.sku}`,
                                    }));
                                  }}
                                />
                              </div>
                              <Input
                                placeholder="Eşleştirme notu"
                                className="h-9 text-xs"
                                value={suggest?.kanit ?? ""}
                                onChange={(e) =>
                                  setMatchSuggestInput((prev) => ({
                                    ...prev,
                                    [lineId]: {
                                      varyant_id: prev[lineId]?.varyant_id,
                                      varyant_label: prev[lineId]?.varyant_label,
                                      kanit: e.target.value,
                                      skor: prev[lineId]?.skor ?? "0.95",
                                    },
                                  }))
                                }
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-9 text-xs"
                                disabled={matchBusyLineId === lineId}
                                onClick={() => void handleSuggestMatch(lineId)}
                              >
                                Eşleştirme Öner
                              </Button>
                            </div>

                            {matches && matches.length > 0 && (
                              <div className="space-y-1">
                                {matches.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-center justify-between rounded border border-border px-2 py-1 text-[11px]"
                                  >
                                    <span>
                                      Durum: <strong>{m.durum}</strong>
                                    </span>
                                    <div className="flex gap-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-6 text-[10px]"
                                        disabled={matchBusyLineId === lineId}
                                        onClick={() =>
                                          void handleApproveMatch(lineId, m.id)
                                        }
                                      >
                                        Onayla
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        className="h-6 text-[10px]"
                                        disabled={matchBusyLineId === lineId}
                                        onClick={() =>
                                          void handleRejectMatch(lineId, m.id)
                                        }
                                      >
                                        Reddet
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Mesajlar ({rfqDetail.messages?.length ?? 0})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 rounded border border-border p-2">
                    {(rfqDetail.messages ?? []).length === 0 ? (
                      <p className="text-muted-foreground">Henüz mesaj yok.</p>
                    ) : (
                      (rfqDetail.messages ?? []).map((m, i) => (
                        <div
                          key={m.id ?? i}
                          className="border-b border-border/50 pb-1 last:border-0"
                        >
                          <span className="text-[10px] font-medium text-muted-foreground">
                            [{m.gonderen_rol || "KULLANICI"}]
                          </span>{" "}
                          <span>{m.govde}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleSendRfqMessage} className="flex gap-2">
                    <Input
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder="Mesaj yazın…"
                      disabled={msgSending}
                    />
                    <Button type="submit" size="sm" disabled={msgSending}>
                      {msgSending ? "…" : "Gönder"}
                    </Button>
                  </form>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <GitBranch className="h-3.5 w-3.5" />
                    Revizyonlar ({rfqDetail.revizyonlar?.length ?? 0})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 rounded border border-border p-2">
                    {(rfqDetail.revizyonlar ?? []).length === 0 ? (
                      <p className="text-muted-foreground">Henüz revizyon yok.</p>
                    ) : (
                      (rfqDetail.revizyonlar ?? []).map((r, i) => (
                        <div
                          key={r.id ?? i}
                          className="border-b border-border/50 pb-1 last:border-0"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            v{r.versiyon ?? i + 1}
                          </span>{" "}
                          <span>{r.ozet}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleAddRfqRevision} className="flex gap-2">
                    <Input
                      value={revText}
                      onChange={(e) => setRevText(e.target.value)}
                      placeholder="Revizyon özeti…"
                      disabled={revSending}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={revSending}
                    >
                      {revSending ? "…" : "Revizyon Ekle"}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title="Teklifi Yayından Kaldır"
        description={
          deactivateTarget
            ? `"${
                deactivateTarget.urun_ad ||
                deactivateTarget.varyant_sku ||
                "Seçili"
              }" teklifini pasif duruma almak istediğinize emin misiniz?`
            : ""
        }
        confirmLabel="Yayından Kaldır"
        variant="destructive"
        loading={deactivating}
        onConfirm={confirmDeactivateOffer}
      />
    </div>
  );
}
