"use client";

import React, { useCallback, useState } from "react";
import {
  useCariDetailQuery,
  useCariListQuery,
  useCheckCreditMutation,
  useCreatePaymentIntentMutation,
  useCreditQuery,
  useElleTahsilatMutation,
  useElleTedarikciOdemeMutation,
  useFinanceMeQuery,
  useLedgerQuery,
  useOpsFinanceCariQuery,
  useOpsFinanceHakEdisQuery,
  useOpsFinanceLedgerQuery,
  useOpsFinancePaymentsQuery,
  useOpsFinanceQuery,
  useUpdateOpsCariLimitMutation,
} from "../hooks";
import { finansService } from "../services";
import type {
  CreditCheckResponse,
  OpsCariRow,
  OpsHakEdisRow,
  PaymentIntent,
} from "../types";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { formatDateTime, formatGram, formatMoney } from "@/lib/format";
import {
  EntityModal,
  ListPage,
  RelationSelect,
  RowActions,
  type RelationOption,
} from "@/components/crud";
import {
  opsFirmalarService,
  opsOrdersService,
} from "@/features/firmalar/services/ops-firmalar";
import { siparisService } from "@/features/siparis/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  BookOpen,
  CreditCard,
  Eye,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

const HAREKET_LABELS: Record<string, string> = {
  SIPARIS_BORC: "Sipariş Borcu",
  TAHSILAT: "Tahsilat",
  IADE_MAHSUP: "İade Mahsubu",
  TEDARIKCI_ODEME: "Tedarikçi Ödemesi",
  TEDARIKCI_HAK_EDIS: "Tedarikçi Hak Ediş",
  BORC: "Borç",
  ALACAK: "Alacak",
};

function labelHareket(val?: string | null): string {
  if (!val) return "—";
  return HAREKET_LABELS[val] || val;
}

export function FinanceDashboardView() {
  const actionToast = useActionToast();
  const { user } = useAuth();
  const canOpsFinance = Boolean(user?.capabilities?.can_view_ops_finance);

  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [checkAmount, setCheckAmount] = useState("10000");
  const [checkCurrency, setCheckCurrency] = useState("TRY");
  const [checkResult, setCheckResult] = useState<CreditCheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Ödeme niyeti (alıcı)
  const [intentOrderId, setIntentOrderId] = useState<number | null>(null);
  const [intentResult, setIntentResult] = useState<PaymentIntent | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);

  // Ops tab + server pagination / search
  const [opsTab, setOpsTab] = useState<"cari" | "ledger" | "hak_edis" | "payments">(
    "cari"
  );
  const [opsSearch, setOpsSearch] = useState("");
  const [opsPage, setOpsPage] = useState(1);
  const [opsPageSize, setOpsPageSize] = useState(20);
  const [hakEdisDurum, setHakEdisDurum] = useState("");

  // Modallar
  const [detailCariId, setDetailCariId] = useState<number | null>(null);

  const [limitEditTarget, setLimitEditTarget] = useState<OpsCariRow | null>(null);
  const [limitEditValue, setLimitEditValue] = useState("");
  const [limitEditError, setLimitEditError] = useState<string | null>(null);

  const [tahsilatOpen, setTahsilatOpen] = useState(false);
  const [tahsilatOrderId, setTahsilatOrderId] = useState<number | null>(null);
  const [tahsilatTutar, setTahsilatTutar] = useState("");
  const [tahsilatYontem, setTahsilatYontem] = useState("HAVALE");
  const [tahsilatParaBirimi, setTahsilatParaBirimi] = useState("TRY");
  const [tahsilatDekont, setTahsilatDekont] = useState("");
  const [tahsilatAciklama, setTahsilatAciklama] = useState("");
  const [tahsilatError, setTahsilatError] = useState<string | null>(null);

  const [tedOdemeOpen, setTedOdemeOpen] = useState(false);
  const [tedOdemeFirmaId, setTedOdemeFirmaId] = useState<number | null>(null);
  const [tedOdemeFirmaLabel, setTedOdemeFirmaLabel] = useState<string>("");
  const [tedOdemeHakEdisId, setTedOdemeHakEdisId] = useState<number | null>(null);
  const [tedOdemeOrderId, setTedOdemeOrderId] = useState<number | null>(null);
  const [tedOdemeTutar, setTedOdemeTutar] = useState("");
  const [tedOdemeYontem, setTedOdemeYontem] = useState("HAVALE");
  const [tedOdemeParaBirimi, setTedOdemeParaBirimi] = useState("TRY");
  const [tedOdemeDekont, setTedOdemeDekont] = useState("");
  const [tedOdemeAciklama, setTedOdemeAciklama] = useState("");
  const [tedOdemeError, setTedOdemeError] = useState<string | null>(null);

  // Queries
  const meQ = useFinanceMeQuery(paraBirimi, !canOpsFinance);
  const creditQ = useCreditQuery(paraBirimi, !canOpsFinance);
  const cariQ = useCariListQuery(!canOpsFinance);
  const ledgerQ = useLedgerQuery(!canOpsFinance);

  const opsParams = {
    q: opsSearch || undefined,
    page: opsPage,
    page_size: opsPageSize,
  };
  const opsQ = useOpsFinanceQuery(canOpsFinance);
  const opsCariQ = useOpsFinanceCariQuery(canOpsFinance && opsTab === "cari", opsParams);
  const opsLedgerQ = useOpsFinanceLedgerQuery(
    canOpsFinance && opsTab === "ledger",
    opsParams
  );
  const opsHakEdisQ = useOpsFinanceHakEdisQuery(
    canOpsFinance && opsTab === "hak_edis",
    { ...opsParams, durum: hakEdisDurum || undefined }
  );
  const opsPaymentsQ = useOpsFinancePaymentsQuery(
    canOpsFinance && opsTab === "payments",
    opsParams
  );

  const cariDetailQ = useCariDetailQuery(detailCariId, detailCariId !== null);
  const checkCreditMut = useCheckCreditMutation();
  const createIntentMut = useCreatePaymentIntentMutation();
  const tahsilatMut = useElleTahsilatMutation();
  const tedOdemeMut = useElleTedarikciOdemeMutation();
  const updateLimitMut = useUpdateOpsCariLimitMutation();

  const loading =
    (meQ.isLoading || creditQ.isLoading || cariQ.isLoading || ledgerQ.isLoading) &&
    (!canOpsFinance || opsQ.isLoading);
  const credit = creditQ.data ?? null;
  const cariList = cariQ.data ?? [];
  const ledger = ledgerQ.data ?? [];

  const opsCariList = opsCariQ.data?.results ?? [];
  const opsLedgerList = opsLedgerQ.data?.results ?? [];
  const opsHakEdisList = opsHakEdisQ.data?.results ?? [];
  const opsPaymentsList = opsPaymentsQ.data?.results ?? [];

  const hasAnyData = Boolean(
    credit ||
      cariList.length ||
      ledger.length ||
      meQ.data ||
      opsQ.data ||
      opsCariList.length ||
      opsLedgerList.length ||
      opsHakEdisList.length ||
      opsPaymentsList.length ||
      canOpsFinance
  );

  const errorMsg =
    !canOpsFinance &&
    [creditQ, cariQ, ledgerQ].every((q) => q.isError) &&
    !hasAnyData
      ? "Finansal veriler alınamadı."
      : null;

  const refetchAll = () => {
    void meQ.refetch();
    void creditQ.refetch();
    void cariQ.refetch();
    void ledgerQ.refetch();
    if (canOpsFinance) {
      void opsQ.refetch();
      void opsCariQ.refetch();
      void opsLedgerQ.refetch();
      void opsHakEdisQ.refetch();
      void opsPaymentsQ.refetch();
    }
  };

  // RelationSelect loaders
  const loadBuyerOrders = useCallback(async (q: string): Promise<RelationOption[]> => {
    const res = await siparisService.getOrders(
      q ? { q, page_size: "20" } : { page_size: "20" }
    );
    return (res.results ?? []).map((o) => ({
      value: o.id,
      label: o.alici_firma_ad
        ? `${o.alici_firma_ad} · ${formatDateTime(o.olusturma_tarihi)}`
        : `Sipariş (${formatDateTime(o.olusturma_tarihi)})`,
      subtitle: `${o.durum} · ${o.line_count} kalem`,
    }));
  }, []);

  const loadOpsOrders = useCallback(async (q: string): Promise<RelationOption[]> => {
    const res = await opsOrdersService.listAll({ q: q || undefined, page_size: 20 });
    return (res.results ?? []).map((o) => {
      const tots = o.toplamlar
        ? Object.entries(o.toplamlar)
            .map(([pb, v]) => `${v} ${pb}`)
            .join(" / ")
        : "";
      return {
        value: o.id,
        label: o.alici_firma_ad
          ? `${o.alici_firma_ad} (${tots || o.durum})`
          : `Alıcı Siparişi (${tots || o.durum})`,
        subtitle: `${o.durum}${o.olusturma_tarihi ? ` · ${formatDateTime(o.olusturma_tarihi)}` : ""}`,
      };
    });
  }, []);

  const loadSupplierFirms = useCallback(async (q: string): Promise<RelationOption[]> => {
    const res = await opsFirmalarService.list({
      ...(q ? { q } : {}),
      page_size: "30",
    });
    return (res.results ?? [])
      .filter((f) => f.tedarikci_mi)
      .map((f) => ({
        value: f.id,
        label: f.ad,
        subtitle: f.firma_kodu || undefined,
      }));
  }, []);

  const loadHakEdisOptions = useCallback(
    async (q: string): Promise<RelationOption[]> => {
      const res = await finansService.getOpsFinanceHakEdis({
        ...(q ? { q } : {}),
        ...(tedOdemeFirmaId ? { tedarikci_firma_id: tedOdemeFirmaId } : {}),
        page_size: 20,
      });
      return (res.results ?? []).map((he) => ({
        value: he.id,
        label: `${he.tedarikci_firma_ad || "Tedarikçi"} · ${
          he.tutar != null ? formatMoney(he.tutar, he.para_birimi) : formatGram(he.gram)
        }`,
        subtitle: `Durum: ${he.durum}${he.aciklama ? ` · ${he.aciklama}` : ""}`,
      }));
    },
    [tedOdemeFirmaId]
  );

  const handleCreditCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckError(null);
    setCheckResult(null);
    if (!checkAmount.trim() || Number(checkAmount) <= 0) {
      setCheckError("Lütfen sıfırdan büyük geçerli bir tutar girin.");
      return;
    }
    try {
      const res = await checkCreditMut.mutateAsync({
        tutar: checkAmount.trim(),
        para_birimi: checkCurrency,
      });
      setCheckResult(res);
      actionToast.success("Kredi limiti uygun");
    } catch (err) {
      const msg = mapCommerceError(err, "Kredi kontrolü başarısız.");
      setCheckError(msg);
      actionToast.error("Kredi kontrolü başarısız", err);
    }
  };

  const handlePaymentIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntentError(null);
    setIntentResult(null);
    if (!intentOrderId) {
      setIntentError("Lütfen listeden bir sipariş seçin.");
      return;
    }
    try {
      const res = await createIntentMut.mutateAsync(intentOrderId);
      setIntentResult(res);
      actionToast.success("Ödeme niyeti oluşturuldu");
    } catch (err) {
      const msg = mapCommerceError(err, "Ödeme niyeti oluşturulamadı.");
      setIntentError(msg);
      actionToast.error("Ödeme niyeti başarısız", err);
    }
  };

  const handleElleTahsilat = async (e: React.FormEvent) => {
    e.preventDefault();
    setTahsilatError(null);
    if (!tahsilatOrderId) {
      setTahsilatError("Lütfen bir sipariş seçin.");
      return;
    }
    if (!tahsilatTutar.trim() || Number(tahsilatTutar) <= 0) {
      setTahsilatError("Lütfen sıfırdan büyük bir tahsilat tutarı girin.");
      return;
    }
    try {
      await tahsilatMut.mutateAsync({
        orderId: tahsilatOrderId,
        data: {
          tutar: tahsilatTutar.trim(),
          yontem: tahsilatYontem.trim() || "HAVALE",
          para_birimi: tahsilatParaBirimi,
          dekont_ref: tahsilatDekont.trim(),
          aciklama: tahsilatAciklama.trim(),
        },
      });
      actionToast.success("Alıcı tahsilatı kaydedildi");
      setTahsilatOpen(false);
      setTahsilatOrderId(null);
      setTahsilatTutar("");
      setTahsilatDekont("");
      setTahsilatAciklama("");
    } catch (err) {
      const msg = mapCommerceError(err, "Tahsilat kaydedilemedi.");
      setTahsilatError(msg);
      actionToast.error("Tahsilat kaydedilemedi", err);
    }
  };

  const handleElleTedarikciOdeme = async (e: React.FormEvent) => {
    e.preventDefault();
    setTedOdemeError(null);
    if (!tedOdemeFirmaId) {
      setTedOdemeError("Lütfen tedarikçi firma seçin.");
      return;
    }
    if (!tedOdemeTutar.trim() || Number(tedOdemeTutar) <= 0) {
      setTedOdemeError("Lütfen sıfırdan büyük bir ödeme tutarı girin.");
      return;
    }
    try {
      await tedOdemeMut.mutateAsync({
        tedarikci_firma_id: tedOdemeFirmaId,
        ...(tedOdemeHakEdisId ? { hak_edis_id: tedOdemeHakEdisId } : {}),
        ...(tedOdemeOrderId ? { order_id: tedOdemeOrderId } : {}),
        tutar: tedOdemeTutar.trim(),
        yontem: tedOdemeYontem.trim() || "HAVALE",
        para_birimi: tedOdemeParaBirimi,
        dekont_ref: tedOdemeDekont.trim(),
        aciklama: tedOdemeAciklama.trim(),
      });
      actionToast.success("Tedarikçi ödemesi kaydedildi");
      setTedOdemeOpen(false);
      setTedOdemeFirmaId(null);
      setTedOdemeFirmaLabel("");
      setTedOdemeHakEdisId(null);
      setTedOdemeOrderId(null);
      setTedOdemeTutar("");
      setTedOdemeDekont("");
      setTedOdemeAciklama("");
    } catch (err) {
      const msg = mapCommerceError(err, "Tedarikçi ödemesi kaydedilemedi.");
      setTedOdemeError(msg);
      actionToast.error("Tedarikçi ödemesi kaydedilemedi", err);
    }
  };

  const handleSaveCreditLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limitEditTarget) return;
    setLimitEditError(null);
    if (limitEditValue.trim() === "" || Number(limitEditValue) < 0) {
      setLimitEditError("Kredi limiti sıfır veya pozitif bir tutar olmalıdır.");
      return;
    }
    try {
      await updateLimitMut.mutateAsync({
        id: limitEditTarget.id,
        kredi_limiti: limitEditValue.trim(),
      });
      actionToast.success("Kredi limiti güncellendi");
      setLimitEditTarget(null);
    } catch (err) {
      const msg = mapCommerceError(err, "Kredi limiti güncellenemedi.");
      setLimitEditError(msg);
      actionToast.error("Kredi limiti güncellenemedi", err);
    }
  };

  const openHakEdisOdemeModal = (he: OpsHakEdisRow) => {
    setTedOdemeError(null);
    setTedOdemeFirmaId(he.tedarikci_firma_id);
    setTedOdemeFirmaLabel(he.tedarikci_firma_ad || "Tedarikçi Firma");
    setTedOdemeHakEdisId(he.id);
    setTedOdemeOrderId(he.order_id);
    setTedOdemeTutar(he.tutar || "");
    setTedOdemeParaBirimi(he.para_birimi || "TRY");
    setTedOdemeDekont("");
    setTedOdemeAciklama(he.aciklama || "Tedarikçi hak ediş ödemesi");
    setTedOdemeOpen(true);
  };

  const activeOpsQuery =
    opsTab === "cari"
      ? opsCariQ
      : opsTab === "ledger"
        ? opsLedgerQ
        : opsTab === "hak_edis"
          ? opsHakEdisQ
          : opsPaymentsQ;

  const activeOpsTotalCount =
    opsTab === "cari"
      ? opsCariQ.data?.count ?? opsCariList.length
      : opsTab === "ledger"
        ? opsLedgerQ.data?.count ?? opsLedgerList.length
        : opsTab === "hak_edis"
          ? opsHakEdisQ.data?.count ?? opsHakEdisList.length
          : opsPaymentsQ.data?.count ?? opsPaymentsList.length;

  const activeOpsEmpty =
    opsTab === "cari"
      ? opsCariList.length === 0
      : opsTab === "ledger"
        ? opsLedgerList.length === 0
        : opsTab === "hak_edis"
          ? opsHakEdisList.length === 0
          : opsPaymentsList.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Finans &amp; Cari Hesaplar
          </h1>
          <p className="text-xs text-muted-foreground">
            Cari bakiye, kredi limiti kontrolü, tahsilat ve tedarikçi hak ediş yönetimi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canOpsFinance && (
            <select
              aria-label="Para birimi"
              value={paraBirimi}
              onChange={(e) => setParaBirimi(e.target.value)}
              className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          )}
          {canOpsFinance && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTahsilatError(null);
                  setTahsilatOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tahsilat Kaydet</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTedOdemeError(null);
                  setTedOdemeFirmaId(null);
                  setTedOdemeFirmaLabel("");
                  setTedOdemeHakEdisId(null);
                  setTedOdemeOrderId(null);
                  setTedOdemeTutar("");
                  setTedOdemeOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tedarikçi Ödemesi</span>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div
          className="flex items-center justify-between rounded-[8px] border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            className="h-8 border-destructive/30"
          >
            Yeniden Dene
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 w-full items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Finansal veriler yükleniyor…</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Üst Özet Kartları */}
          {!canOpsFinance ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kredi Özeti + Kredi Kontrolü */}
              <div className="rounded-[8px] border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Kredi Özeti</span>
                  <CreditCard className="h-4 w-4" />
                </div>
                {credit ? (
                  <>
                    <p className="text-2xl font-semibold font-mono tabular-nums text-foreground">
                      {formatMoney(credit.kredi_limiti, credit.para_birimi)}
                    </p>
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      <p>
                        Güncel Bakiye:{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatMoney(credit.bakiye, credit.para_birimi)}
                        </span>
                      </p>
                      <p>
                        Kullanılabilir Limit:{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {credit.kullanilabilir != null
                            ? formatMoney(credit.kullanilabilir, credit.para_birimi)
                            : "—"}
                        </span>
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {credit.limit_aktif ? "Kredi Limiti Aktif" : "Kredi Limiti Kapalı"}
                    </Badge>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Seçili para biriminde tanımlı kredi özeti bulunmuyor.
                  </p>
                )}

                <form
                  onSubmit={handleCreditCheck}
                  className="border-t border-border pt-3 space-y-2"
                >
                  <Label className="text-[11px] font-medium flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Kredi Limiti Uygunluk Kontrolü
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={checkAmount}
                      onChange={(e) => setCheckAmount(e.target.value)}
                      placeholder="Tutar"
                      className="h-8 text-xs font-mono tabular-nums"
                      disabled={checkCreditMut.isPending}
                    />
                    <select
                      aria-label="Kontrol para birimi"
                      value={checkCurrency}
                      onChange={(e) => setCheckCurrency(e.target.value)}
                      disabled={checkCreditMut.isPending}
                      className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
                    >
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={checkCreditMut.isPending}
                      className="h-8 text-xs shrink-0"
                    >
                      {checkCreditMut.isPending ? "…" : "Kontrol Et"}
                    </Button>
                  </div>
                  {checkError && (
                    <p className="text-[11px] text-destructive">{checkError}</p>
                  )}
                  {checkResult && (
                    <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
                      <span className="font-semibold">
                        {checkResult.ok ? "Limit Uygun" : "Limit Yetersiz"}
                      </span>{" "}
                      — Kullanılabilir:{" "}
                      <span className="font-mono">
                        {checkResult.credit.kullanilabilir != null
                          ? formatMoney(
                              checkResult.credit.kullanilabilir,
                              checkResult.credit.para_birimi
                            )
                          : "—"}
                      </span>
                    </div>
                  )}
                </form>
              </div>

              {/* Cari Özet & Ödeme Niyeti */}
              <div className="rounded-[8px] border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Cari &amp; Ödeme Özeti</span>
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-semibold font-mono tabular-nums text-foreground">
                      {cariList.length}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Aktif cari hesap sayısı
                    </p>
                  </div>
                  {meQ.data?.credit && (
                    <div className="text-right text-[11px]">
                      <span className="text-muted-foreground">Toplam Bakiye</span>
                      <p className="font-mono font-semibold text-foreground">
                        {formatMoney(
                          meQ.data.credit.bakiye,
                          meQ.data.credit.para_birimi
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    Ödeme Bildirimi Başlat
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tahsilatlar platform finans ekibi tarafından onaylanır. Ödeme niyeti oluşturmak için siparişinizi seçin:
                  </p>
                  <form onSubmit={handlePaymentIntent} className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <RelationSelect
                        value={intentOrderId}
                        onChange={(v) => setIntentOrderId(v ? Number(v) : null)}
                        loadOptions={loadBuyerOrders}
                        placeholder="Sipariş seçiniz…"
                        searchPlaceholder="Sipariş ara…"
                        clearable
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={createIntentMut.isPending || !intentOrderId}
                      className="h-9 text-xs shrink-0"
                    >
                      {createIntentMut.isPending ? "Gönderiliyor…" : "Ödeme Niyeti Oluştur"}
                    </Button>
                  </form>
                  {intentError && (
                    <p className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                      {intentError}
                    </p>
                  )}
                  {intentResult && (
                    <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
                      Ödeme talebi kaydedildi · Durum: <strong>{intentResult.durum}</strong> ·{" "}
                      <span className="font-mono">
                        {formatMoney(intentResult.tutar, intentResult.para_birimi)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            opsQ.data && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-[8px] border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">Toplam Cari Hesap</span>
                  <p className="mt-1 text-2xl font-semibold font-mono tabular-nums">
                    {opsQ.data.cari_count}
                  </p>
                </div>
                <div className="rounded-[8px] border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">Defter Hareketi</span>
                  <p className="mt-1 text-2xl font-semibold font-mono tabular-nums">
                    {opsQ.data.ledger_count}
                  </p>
                </div>
                <div className="rounded-[8px] border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">Ödeme Kaydı</span>
                  <p className="mt-1 text-2xl font-semibold font-mono tabular-nums">
                    {opsQ.data.payment_intent_count}
                  </p>
                </div>
              </div>
            )
          )}

          {/* Alıcı Kendi Cari & Defter Görünümü */}
          {!canOpsFinance && (
            <>
              <div className="rounded-[8px] border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Cari Hesaplarım
                  </h2>
                </div>
                {cariList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Kayıtlı cari hesap verisi bulunamadı.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Para Birimi</TableHead>
                        <TableHead>Son Güncelleme</TableHead>
                        <TableHead className="text-right">Bakiye</TableHead>
                        <TableHead className="text-right">Kredi Limiti</TableHead>
                        <TableHead className="text-right">Detay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cariList.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs font-medium">
                            {c.para_birimi} Cari Hesabı
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.guncelleme_tarihi
                              ? formatDateTime(c.guncelleme_tarihi)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-semibold">
                            {formatMoney(c.bakiye, c.para_birimi)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {c.kredi_limiti != null
                              ? formatMoney(c.kredi_limiti, c.para_birimi)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetailCariId(c.id)}
                              className="h-7 text-xs gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              İncele
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="rounded-[8px] border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Hesap Hareketleri
                  </h2>
                </div>
                {ledger.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Henüz hesap hareketi bulunmuyor.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>İşlem Türü</TableHead>
                        <TableHead>Yön</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs font-medium">
                            {labelHareket(row.hareket_tipi)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {labelHareket(row.yon)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.olusturma_tarihi
                              ? formatDateTime(row.olusturma_tarihi)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-semibold">
                            {formatMoney(row.tutar, row.para_birimi)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}

          {/* Platform Ops Finans Yönetimi (ListPage + Arama + Sayfalama + Satır Aksiyonları) */}
          {canOpsFinance && (
            <ListPage
              title="Finans Defteri ve Cari Yönetimi"
              description="Tüm firmaların cari limitlerini düzenleyin, tahsilat ve tedarikçi hak ediş ödemelerini izleyin."
              searchValue={opsSearch}
              onSearchChange={(val) => {
                setOpsSearch(val);
                setOpsPage(1);
              }}
              searchPlaceholder="Firma adı, hareket türü veya tutar ile ara…"
              filters={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
                    {(
                      [
                        ["cari", "Cari Hesaplar"],
                        ["ledger", "Defter Hareketleri"],
                        ["hak_edis", "Tedarikçi Hak Edişleri"],
                        ["payments", "Ödeme Kayıtları"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setOpsTab(k);
                          setOpsPage(1);
                        }}
                        className={`rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors ${
                          opsTab === k
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {opsTab === "hak_edis" && (
                    <select
                      aria-label="Hak ediş durumu"
                      value={hakEdisDurum}
                      onChange={(e) => {
                        setHakEdisDurum(e.target.value);
                        setOpsPage(1);
                      }}
                      className="h-9 rounded-[6px] border border-border bg-background px-3 text-xs text-foreground"
                    >
                      <option value="">Tüm Durumlar</option>
                      <option value="BEKLEMEDE">Beklemede</option>
                      <option value="HAZIR">Ödemeye Hazır</option>
                      <option value="ODENDI">Ödendi</option>
                      <option value="IPTAL">İptal</option>
                    </select>
                  )}
                </div>
              }
              loading={activeOpsQuery.isLoading}
              error={
                activeOpsQuery.isError
                  ? mapCommerceError(
                      activeOpsQuery.error,
                      "Finans verileri alınamadı."
                    )
                  : null
              }
              onRetry={() => void activeOpsQuery.refetch()}
              isEmpty={activeOpsEmpty}
              emptyTitle="Kayıt bulunamadı"
              emptyDescription="Arama ölçütünü temizleyin veya yeni bir finans işlemi oluşturun."
              page={opsPage}
              pageSize={opsPageSize}
              totalCount={activeOpsTotalCount}
              onPageChange={setOpsPage}
              onPageSizeChange={(next) => {
                setOpsPageSize(next);
                setOpsPage(1);
              }}
            >
              {opsTab === "cari" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>Karşı Taraf</TableHead>
                      <TableHead>Para Birimi</TableHead>
                      <TableHead className="text-right">Güncel Bakiye</TableHead>
                      <TableHead className="text-right">Kredi Limiti</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsCariList.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs font-medium">
                          {row.firma_ad || "Cari Hesap"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.karsi_firma_ad || "Platform"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.para_birimi}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatMoney(row.bakiye, row.para_birimi)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.kredi_limiti != null
                            ? formatMoney(row.kredi_limiti, row.para_birimi)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            itemLabel={`${row.firma_ad || "Bu"} cari hesabı`}
                            extraActions={[
                              {
                                label: "Kredi Limitini Düzenle",
                                icon: <Pencil className="h-3.5 w-3.5" />,
                                onClick: () => {
                                  setLimitEditError(null);
                                  setLimitEditTarget(row);
                                  setLimitEditValue(row.kredi_limiti ?? "0.00");
                                },
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : opsTab === "ledger" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>İşlem Türü</TableHead>
                      <TableHead>Yön</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsLedgerList.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs font-medium">
                          {row.firma_ad || "Firma"}
                          {row.karsi_firma_ad ? (
                            <span className="text-muted-foreground">
                              {" "}
                              → {row.karsi_firma_ad}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {labelHareket(row.hareket_tipi)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {labelHareket(row.yon)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.olusturma_tarihi
                            ? formatDateTime(row.olusturma_tarihi)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatMoney(row.tutar, row.para_birimi)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : opsTab === "hak_edis" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tedarikçi</TableHead>
                      <TableHead>Açıklama</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">Gram</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsHakEdisList.map((he) => (
                      <TableRow key={he.id}>
                        <TableCell className="text-xs font-medium">
                          {he.tedarikci_firma_ad || "Tedarikçi Firma"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {he.aciklama || "Kalite kontrol sonrası hak ediş"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              he.durum === "ODENDI"
                                ? "success"
                                : he.durum === "IPTAL"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-[10px]"
                          >
                            {he.durum}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          {formatGram(he.gram)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {he.tutar != null
                            ? formatMoney(he.tutar, he.para_birimi)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {he.durum !== "ODENDI" && he.durum !== "IPTAL" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openHakEdisOdemeModal(he)}
                            >
                              Ödeme Yap
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {he.odeme_tarihi
                                ? formatDateTime(he.odeme_tarihi)
                                : "Ödendi"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alıcı Firma</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsPaymentsList.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs font-medium">
                          {row.alici_firma_ad || "Alıcı Firma"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {row.durum}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.olusturma_tarihi
                            ? formatDateTime(row.olusturma_tarihi)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatMoney(row.tutar, row.para_birimi)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ListPage>
          )}
        </div>
      )}

      {/* Alıcı Cari Detay Modalı */}
      <EntityModal
        open={detailCariId !== null}
        onOpenChange={(open) => !open && setDetailCariId(null)}
        title="Cari Hesap Detayı"
        description="Güncel bakiye ve tanımlı kredi limiti özeti."
        size="sm"
      >
        {cariDetailQ.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Yükleniyor…</span>
          </div>
        ) : cariDetailQ.isError ? (
          <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {mapCommerceError(cariDetailQ.error, "Cari detay alınamadı.")}
          </div>
        ) : cariDetailQ.data ? (
          <div className="grid grid-cols-2 gap-3 text-xs rounded-[6px] border border-border p-3">
            <div>
              <span className="text-muted-foreground">Para Birimi</span>
              <p className="font-mono font-semibold">{cariDetailQ.data.para_birimi}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Son Güncelleme</span>
              <p>
                {cariDetailQ.data.guncelleme_tarihi
                  ? formatDateTime(cariDetailQ.data.guncelleme_tarihi)
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Bakiye</span>
              <p className="font-mono font-semibold">
                {formatMoney(
                  cariDetailQ.data.bakiye,
                  cariDetailQ.data.para_birimi
                )}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Kredi Limiti</span>
              <p className="font-mono">
                {cariDetailQ.data.kredi_limiti != null
                  ? formatMoney(
                      cariDetailQ.data.kredi_limiti,
                      cariDetailQ.data.para_birimi
                    )
                  : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </EntityModal>

      {/* Ops Kredi Limiti Düzenleme Modalı */}
      <EntityModal
        open={Boolean(limitEditTarget)}
        onOpenChange={(open) => !open && setLimitEditTarget(null)}
        title="Kredi Limitini Düzenle"
        description={
          limitEditTarget
            ? `${limitEditTarget.firma_ad || "Firma"} (${limitEditTarget.para_birimi}) hesabı için yeni kredi limitini belirleyin. Sıfır girilirse açık limit kontrolü kapanır.`
            : undefined
        }
        isDirty={
          Boolean(limitEditTarget) &&
          limitEditValue !== (limitEditTarget?.kredi_limiti ?? "")
        }
        isSubmitting={updateLimitMut.isPending}
        submitLabel="Limiti Kaydet"
        error={limitEditError}
        size="sm"
        onSubmit={handleSaveCreditLimit}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            Yeni Kredi Limiti ({limitEditTarget?.para_birimi})
          </Label>
          <Input
            value={limitEditValue}
            onChange={(e) => setLimitEditValue(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="text-right font-mono tabular-nums"
          />
        </div>
      </EntityModal>

      {/* Ops Alıcı Tahsilatı Modalı */}
      <EntityModal
        open={tahsilatOpen}
        onOpenChange={setTahsilatOpen}
        title="Alıcı Tahsilatı Kaydet"
        description="Seçili sipariş için alıcı cari hesabına tahsilat işleyin."
        isDirty={Boolean(tahsilatTutar.trim() || tahsilatDekont.trim())}
        isSubmitting={tahsilatMut.isPending}
        submitLabel="Tahsilatı Kaydet"
        error={tahsilatError}
        onSubmit={handleElleTahsilat}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Sipariş</Label>
          <RelationSelect
            value={tahsilatOrderId}
            onChange={(v) => setTahsilatOrderId(v ? Number(v) : null)}
            loadOptions={loadOpsOrders}
            placeholder="Alıcı siparişi seçiniz…"
            searchPlaceholder="Alıcı firma adı veya ürün ile ara…"
            clearable
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tutar</Label>
            <Input
              value={tahsilatTutar}
              onChange={(e) => setTahsilatTutar(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ödeme Yöntemi</Label>
            <select
              value={tahsilatYontem}
              onChange={(e) => setTahsilatYontem(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs"
            >
              <option value="HAVALE">Havale</option>
              <option value="EFT">EFT</option>
              <option value="NAKIT">Nakit</option>
              <option value="CEK">Çek</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Para Birimi</Label>
            <select
              value={tahsilatParaBirimi}
              onChange={(e) => setTahsilatParaBirimi(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs font-mono"
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Dekont Referansı</Label>
            <Input
              value={tahsilatDekont}
              onChange={(e) => setTahsilatDekont(e.target.value)}
              placeholder="Banka dekont numarası"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Açıklama</Label>
            <Input
              value={tahsilatAciklama}
              onChange={(e) => setTahsilatAciklama(e.target.value)}
              placeholder="İsteğe bağlı not"
            />
          </div>
        </div>
      </EntityModal>

      {/* Ops Tedarikçi Ödemesi Modalı */}
      <EntityModal
        open={tedOdemeOpen}
        onOpenChange={setTedOdemeOpen}
        title="Tedarikçi Ödemesi Kaydet"
        description="Seçili tedarikçi firmaya ödeme kaydedin ve bağlı hak edişi kapatın."
        isDirty={Boolean(tedOdemeTutar.trim() || tedOdemeDekont.trim())}
        isSubmitting={tedOdemeMut.isPending}
        submitLabel="Ödemeyi Kaydet"
        error={tedOdemeError}
        onSubmit={handleElleTedarikciOdeme}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Tedarikçi Firma</Label>
          <RelationSelect
            value={tedOdemeFirmaId}
            selectedLabel={tedOdemeFirmaLabel || undefined}
            onChange={(v, opt) => {
              setTedOdemeFirmaId(v ? Number(v) : null);
              setTedOdemeFirmaLabel(opt?.label || "");
              setTedOdemeHakEdisId(null);
            }}
            loadOptions={loadSupplierFirms}
            placeholder="Tedarikçi firma seçiniz…"
            searchPlaceholder="Firma adı ile ara…"
            clearable
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Bağlı Hak Ediş (İsteğe Bağlı)
            </Label>
            <RelationSelect
              value={tedOdemeHakEdisId}
              onChange={(v) => setTedOdemeHakEdisId(v ? Number(v) : null)}
              loadOptions={loadHakEdisOptions}
              placeholder="Hak ediş seçiniz…"
              searchPlaceholder="Açıklama veya firma ile ara…"
              clearable
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              İlgili Sipariş (İsteğe Bağlı)
            </Label>
            <RelationSelect
              value={tedOdemeOrderId}
              onChange={(v) => setTedOdemeOrderId(v ? Number(v) : null)}
              loadOptions={loadOpsOrders}
              placeholder="Sipariş seçiniz…"
              searchPlaceholder="Alıcı veya ürün ile ara…"
              clearable
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ödeme Tutarı</Label>
            <Input
              value={tedOdemeTutar}
              onChange={(e) => setTedOdemeTutar(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ödeme Yöntemi</Label>
            <select
              value={tedOdemeYontem}
              onChange={(e) => setTedOdemeYontem(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs"
            >
              <option value="HAVALE">Havale</option>
              <option value="EFT">EFT</option>
              <option value="NAKIT">Nakit</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Para Birimi</Label>
            <select
              value={tedOdemeParaBirimi}
              onChange={(e) => setTedOdemeParaBirimi(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-border bg-background px-3 text-xs font-mono"
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Dekont Referansı</Label>
            <Input
              value={tedOdemeDekont}
              onChange={(e) => setTedOdemeDekont(e.target.value)}
              placeholder="Dekont no"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Açıklama</Label>
            <Input
              value={tedOdemeAciklama}
              onChange={(e) => setTedOdemeAciklama(e.target.value)}
              placeholder="İsteğe bağlı not"
            />
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
