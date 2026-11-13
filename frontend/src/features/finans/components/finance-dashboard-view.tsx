"use client";

import React, { useState } from "react";
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
} from "../hooks";
import type { CreditCheckResponse, OpsHakEdisRow, PaymentIntent } from "../types";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useActionToast } from "@/hooks/use-action-toast";
import { mapCommerceError } from "@/lib/api/commerce-errors";
import { formatGram, formatMoney, formatDateTime } from "@/lib/format";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Wallet,
  CreditCard,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Eye,
  ShieldCheck,
  Receipt,
} from "lucide-react";

export function FinanceDashboardView() {
  const actionToast = useActionToast();
  const { user } = useAuth();
  const canOpsFinance = Boolean(user?.capabilities?.can_view_ops_finance);

  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [checkAmount, setCheckAmount] = useState("10000");
  const [checkCurrency, setCheckCurrency] = useState("TRY");
  const [checkResult, setCheckResult] = useState<CreditCheckResponse | null>(
    null
  );
  const [checkError, setCheckError] = useState<string | null>(null);

  // Ops Manuel Tahsilat form state
  const [tahsilatOrderId, setTahsilatOrderId] = useState("");
  const [tahsilatTutar, setTahsilatTutar] = useState("");
  const [tahsilatYontem, setTahsilatYontem] = useState("HAVALE");
  const [tahsilatParaBirimi, setTahsilatParaBirimi] = useState("TRY");
  const [tahsilatDekont, setTahsilatDekont] = useState("");
  const [tahsilatAciklama, setTahsilatAciklama] = useState("");

  // Ops Manuel Tedarikci Odeme form state
  const [tedOdemeFirmaId, setTedOdemeFirmaId] = useState("");
  const [tedOdemeHakEdisId, setTedOdemeHakEdisId] = useState("");
  const [tedOdemeOrderId, setTedOdemeOrderId] = useState("");
  const [tedOdemeTutar, setTedOdemeTutar] = useState("");
  const [tedOdemeYontem, setTedOdemeYontem] = useState("HAVALE");
  const [tedOdemeParaBirimi, setTedOdemeParaBirimi] = useState("TRY");
  const [tedOdemeDekont, setTedOdemeDekont] = useState("");
  const [tedOdemeAciklama, setTedOdemeAciklama] = useState("");

  const [detailCariId, setDetailCariId] = useState<number | null>(null);
  const [cariLookupInput, setCariLookupInput] = useState("");
  const [intentOrderId, setIntentOrderId] = useState("");
  const [intentResult, setIntentResult] = useState<PaymentIntent | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [opsTab, setOpsTab] = useState<"cari" | "ledger" | "hak_edis" | "payments">(
    "cari"
  );

  const meQ = useFinanceMeQuery(paraBirimi, !canOpsFinance);
  const creditQ = useCreditQuery(paraBirimi, !canOpsFinance);
  const cariQ = useCariListQuery(!canOpsFinance);
  const ledgerQ = useLedgerQuery(!canOpsFinance);

  const opsQ = useOpsFinanceQuery(canOpsFinance);
  const opsCariQ = useOpsFinanceCariQuery(canOpsFinance);
  const opsLedgerQ = useOpsFinanceLedgerQuery(canOpsFinance);
  const opsHakEdisQ = useOpsFinanceHakEdisQuery(canOpsFinance);
  const opsPaymentsQ = useOpsFinancePaymentsQuery(canOpsFinance);

  const cariDetailQ = useCariDetailQuery(detailCariId, detailCariId !== null);
  const checkCreditMut = useCheckCreditMutation();
  const createIntentMut = useCreatePaymentIntentMutation();
  const tahsilatMut = useElleTahsilatMutation();
  const tedOdemeMut = useElleTedarikciOdemeMutation();

  const loading =
    (meQ.isLoading || creditQ.isLoading || cariQ.isLoading || ledgerQ.isLoading) &&
    (!canOpsFinance || opsQ.isLoading);
  const credit = creditQ.data ?? null;
  const cariList = cariQ.data ?? [];
  const ledger = ledgerQ.data ?? [];
  const opsCariList = opsCariQ.data ?? [];
  const opsLedgerList = opsLedgerQ.data ?? [];
  const opsHakEdisList = opsHakEdisQ.data ?? [];
  const opsPaymentsList = opsPaymentsQ.data ?? [];

  const hasAnyData = Boolean(
    credit ||
      cariList.length ||
      ledger.length ||
      meQ.data ||
      opsQ.data ||
      opsCariList.length ||
      opsLedgerList.length ||
      opsHakEdisList.length ||
      opsPaymentsList.length
  );

  const errorMsg =
    [creditQ, cariQ, ledgerQ].every((q) => q.isError) &&
    (!canOpsFinance || opsQ.isError) &&
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

  const handleCreditCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckError(null);
    setCheckResult(null);
    if (!checkAmount.trim()) {
      setCheckError("Tutar zorunludur.");
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
    const oid = Number(intentOrderId);
    if (!Number.isInteger(oid) || oid <= 0) {
      setIntentError("Geçerli bir Sipariş ID girin.");
      return;
    }
    try {
      const res = await createIntentMut.mutateAsync(oid);
      setIntentResult(res);
      actionToast.success("Ödeme niyeti oluşturuldu");
    } catch (err) {
      const msg = mapCommerceError(err, "Ödeme niyeti oluşturulamadı.");
      setIntentError(msg);
      actionToast.error("Ödeme niyeti başarısız", err);
    }
  };

  const handleCariLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cid = Number(cariLookupInput);
    if (!Number.isInteger(cid) || cid <= 0) {
      actionToast.error(
        "Geçersiz Cari ID",
        new Error("Pozitif bir Cari Hesap ID girin.")
      );
      return;
    }
    setDetailCariId(cid);
  };

  const handleElleTahsilat = async (e: React.FormEvent) => {
    e.preventDefault();
    const oid = Number(tahsilatOrderId);
    if (!Number.isInteger(oid) || oid <= 0) {
      actionToast.error("Geçersiz Sipariş ID", new Error("Pozitif bir sipariş numarası girin."));
      return;
    }
    if (!tahsilatTutar.trim()) {
      actionToast.error("Tutar zorunlu", new Error("Tahsilat tutarı girin."));
      return;
    }
    try {
      const res = await tahsilatMut.mutateAsync({
        orderId: oid,
        data: {
          tutar: tahsilatTutar.trim(),
          yontem: tahsilatYontem.trim() || "HAVALE",
          para_birimi: tahsilatParaBirimi,
          dekont_ref: tahsilatDekont.trim(),
          aciklama: tahsilatAciklama.trim(),
        },
      });
      actionToast.success(
        `Elle tahsilat kaydedildi (Ledger #${res.ledger_entry_id})`
      );
      setTahsilatTutar("");
      setTahsilatDekont("");
      setTahsilatAciklama("");
    } catch (err) {
      actionToast.error("Tahsilat kaydedilemedi", err);
    }
  };

  const handleElleTedarikciOdeme = async (e: React.FormEvent) => {
    e.preventDefault();
    const tedId = Number(tedOdemeFirmaId);
    if (!Number.isInteger(tedId) || tedId <= 0) {
      actionToast.error("Geçersiz Tedarikçi ID", new Error("Pozitif tedarikçi firma ID girin."));
      return;
    }
    if (!tedOdemeTutar.trim()) {
      actionToast.error("Tutar zorunlu", new Error("Ödeme tutarı girin."));
      return;
    }
    try {
      const res = await tedOdemeMut.mutateAsync({
        tedarikci_firma_id: tedId,
        ...(tedOdemeHakEdisId ? { hak_edis_id: Number(tedOdemeHakEdisId) } : {}),
        ...(tedOdemeOrderId ? { order_id: Number(tedOdemeOrderId) } : {}),
        tutar: tedOdemeTutar.trim(),
        yontem: tedOdemeYontem.trim() || "HAVALE",
        para_birimi: tedOdemeParaBirimi,
        dekont_ref: tedOdemeDekont.trim(),
        aciklama: tedOdemeAciklama.trim(),
      });
      actionToast.success(
        `Tedarikçi ödemesi kaydedildi (Ledger #${res.ledger_entry_id})`
      );
      setTedOdemeHakEdisId("");
      setTedOdemeOrderId("");
      setTedOdemeTutar("");
      setTedOdemeDekont("");
      setTedOdemeAciklama("");
    } catch (err) {
      actionToast.error("Tedarikçi ödemesi kaydedilemedi", err);
    }
  };

  const prefillHakEdisOdeme = (he: OpsHakEdisRow) => {
    setTedOdemeFirmaId(String(he.tedarikci_firma_id));
    setTedOdemeHakEdisId(String(he.id));
    setTedOdemeOrderId(String(he.order_id));
    setTedOdemeTutar(he.tutar || "");
    setTedOdemeParaBirimi(he.para_birimi || "TRY");
    setTedOdemeAciklama(`Hak ediş #${he.id} · Sipariş #${he.order_id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Finans & Cari Hesaplar
          </h1>
          <p className="text-xs text-muted-foreground">
            Cari bakiye, kredi limiti kontrolü, elle tahsilat ve tedarikçi hak
            ediş yönetimi.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {meQ.data?.server_now && (
        <p className="text-[11px] text-muted-foreground font-mono">
          server_now: {formatDateTime(meQ.data.server_now)}
          {meQ.data.para_birimi ? ` · ${meQ.data.para_birimi}` : ""}
        </p>
      )}

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
      ) : !hasAnyData ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6 text-xs text-muted-foreground border border-border rounded-[8px]">
          <Wallet className="h-8 w-8 opacity-40 mb-1" />
          <span className="text-sm font-medium text-foreground">
            Veri bulunamadı
          </span>
          <span className="max-w-sm">
            Cari, kredi veya ledger kaydı dönmedi. Yetki veya hesap tanımlarını
            kontrol edin.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Kredi Özeti + Kredi Kontrolü */}
            <div className="rounded-[8px] border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Kredi Özeti</span>
                <CreditCard className="h-4 w-4" />
              </div>
              {creditQ.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Kredi bilgisi yükleniyor…</span>
                </div>
              ) : creditQ.isError ? (
                <div className="space-y-2 rounded-[6px] border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <p>{mapCommerceError(creditQ.error, "Kredi limiti alınamadı.")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void creditQ.refetch()}
                    className="h-7 text-[11px] border-destructive/30"
                  >
                    Yeniden Dene
                  </Button>
                </div>
              ) : credit ? (
                <>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-foreground">
                    {formatMoney(credit.kredi_limiti, credit.para_birimi)}
                  </p>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <p>
                      Bakiye:{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {formatMoney(credit.bakiye, credit.para_birimi)}
                      </span>
                    </p>
                    <p>
                      Kullanılabilir:{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {credit.kullanilabilir != null
                          ? formatMoney(
                              credit.kullanilabilir,
                              credit.para_birimi
                            )
                          : "—"}
                      </span>
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {credit.limit_aktif ? "LIMIT_AKTIF" : "LIMIT_KAPALI"}
                  </Badge>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Kredi özeti bu hesap türünde bulunmuyor.
                </p>
              )}

              <form
                onSubmit={handleCreditCheck}
                className="border-t border-border pt-3 space-y-2"
              >
                <Label className="text-[11px] font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Kredi Limiti Kontrolü
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
                    {checkCreditMut.isPending ? "…" : "Kontrol"}
                  </Button>
                </div>
                {checkError && (
                  <p className="text-[11px] text-destructive">{checkError}</p>
                )}
                {checkResult && (
                  <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px]">
                    <span className="font-semibold">
                      Limit Uygun ({checkResult.ok ? "OK" : "RED"})
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

            {/* Cari Özet & Ödeme Niyeti (POST /payments/intents/) */}
            <div className="rounded-[8px] border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Cari &amp; Finans Özeti</span>
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-foreground">
                    {cariList.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Aktif tenant cari hesap sayısı
                  </p>
                </div>
                {meQ.data?.credit && (
                  <div className="text-right text-[11px]">
                    <span className="text-muted-foreground">Finans Özeti Bakiye</span>
                    <p className="font-mono font-semibold text-foreground">
                      {formatMoney(
                        meQ.data.credit.bakiye,
                        meQ.data.credit.para_birimi
                      )}
                    </p>
                  </div>
                )}
              </div>
              {meQ.isError && !canOpsFinance && (
                <p className="text-[11px] text-destructive">
                  {mapCommerceError(meQ.error, "Finans özeti alınamadı.")}
                </p>
              )}

              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5" />
                  Ödeme Niyeti / Tahsilat Akışı
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Tahsilatlar platform operasyon ekibi tarafından manuel işlenir.
                  Online ödeme niyeti başlatmayı sunucudan sorgulayabilirsiniz:
                </p>
                <form onSubmit={handlePaymentIntent} className="flex gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sipariş ID"
                    value={intentOrderId}
                    onChange={(e) => setIntentOrderId(e.target.value)}
                    disabled={createIntentMut.isPending}
                    className="h-8 text-xs font-mono tabular-nums"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={createIntentMut.isPending}
                    className="h-8 text-xs shrink-0"
                  >
                    {createIntentMut.isPending ? "Gönderiliyor…" : "Ödeme Niyeti"}
                  </Button>
                </form>
                {intentError && (
                  <p className="rounded-[6px] border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {intentError}
                  </p>
                )}
                {intentResult && (
                  <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] font-mono">
                    Intent #{intentResult.id} · {intentResult.durum} ·{" "}
                    {formatMoney(intentResult.tutar, intentResult.para_birimi)}
                  </div>
                )}
                {meQ.data?.payment_intents && meQ.data.payment_intents.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      Son Ödeme Kayıtları ({meQ.data.payment_intents.length})
                    </span>
                    <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {meQ.data.payment_intents.slice(0, 3).map((pi) => (
                        <li key={pi.id}>
                          #{pi.id} · {pi.durum} ·{" "}
                          {formatMoney(pi.tutar, pi.para_birimi)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Ops Finans Özeti */}
            {canOpsFinance && opsQ.data && (
              <div className="rounded-[8px] border border-border bg-card p-5 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Platform Ops Finans Özeti
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-[11px] text-muted-foreground">
                      Cari
                    </span>
                    <p className="text-lg font-semibold font-mono tabular-nums">
                      {opsQ.data.cari_count}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">
                      Ledger
                    </span>
                    <p className="text-lg font-semibold font-mono tabular-nums">
                      {opsQ.data.ledger_count}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">
                      Hak Ediş
                    </span>
                    <p className="text-lg font-semibold font-mono tabular-nums">
                      {opsHakEdisList.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ops Manuel Tahsilat & Tedarikçi Ödemesi Formları */}
          {canOpsFinance && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form
                onSubmit={handleElleTahsilat}
                className="rounded-[8px] border border-border bg-card p-5 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Elle Alıcı Tahsilatı Kaydet
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    POST /ops/orders/&#123;id&#125;/tahsilat/ — alıcı carisine ALACAK
                    işler ve audit kaydı üretir.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sipariş ID *"
                    value={tahsilatOrderId}
                    onChange={(e) => setTahsilatOrderId(e.target.value)}
                    className="h-8 text-xs font-mono"
                    required
                  />
                  <Input
                    placeholder="Tutar *"
                    value={tahsilatTutar}
                    onChange={(e) => setTahsilatTutar(e.target.value)}
                    className="h-8 text-xs font-mono text-right tabular-nums"
                    required
                  />
                  <select
                    aria-label="Tahsilat yöntemi"
                    value={tahsilatYontem}
                    onChange={(e) => setTahsilatYontem(e.target.value)}
                    className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
                  >
                    <option value="HAVALE">HAVALE</option>
                    <option value="EFT">EFT</option>
                    <option value="NAKIT">NAKIT</option>
                    <option value="CEK">CEK</option>
                  </select>
                  <select
                    aria-label="Tahsilat para birimi"
                    value={tahsilatParaBirimi}
                    onChange={(e) => setTahsilatParaBirimi(e.target.value)}
                    className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    placeholder="Dekont Ref"
                    value={tahsilatDekont}
                    onChange={(e) => setTahsilatDekont(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    placeholder="Açıklama"
                    value={tahsilatAciklama}
                    onChange={(e) => setTahsilatAciklama(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={tahsilatMut.isPending}
                    className="h-8 text-xs"
                  >
                    {tahsilatMut.isPending ? "Kaydediliyor…" : "Tahsilat Kaydet"}
                  </Button>
                </div>
              </form>

              <form
                onSubmit={handleElleTedarikciOdeme}
                className="rounded-[8px] border border-border bg-card p-5 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Elle Tedarikçi Ödemesi Kaydet
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    POST /ops/finance/tedarikci-odeme/ — seçili hak edişi ODENDI
                    yapar ve deftere işler.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Tedarikçi ID *"
                    value={tedOdemeFirmaId}
                    onChange={(e) => setTedOdemeFirmaId(e.target.value)}
                    className="h-8 text-xs font-mono"
                    required
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Hak Ediş ID"
                    value={tedOdemeHakEdisId}
                    onChange={(e) => setTedOdemeHakEdisId(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sipariş ID"
                    value={tedOdemeOrderId}
                    onChange={(e) => setTedOdemeOrderId(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    placeholder="Tutar *"
                    value={tedOdemeTutar}
                    onChange={(e) => setTedOdemeTutar(e.target.value)}
                    className="h-8 text-xs font-mono text-right tabular-nums"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    aria-label="Ödeme yöntemi"
                    value={tedOdemeYontem}
                    onChange={(e) => setTedOdemeYontem(e.target.value)}
                    className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
                  >
                    <option value="HAVALE">HAVALE</option>
                    <option value="EFT">EFT</option>
                    <option value="NAKIT">NAKIT</option>
                  </select>
                  <select
                    aria-label="Ödeme para birimi"
                    value={tedOdemeParaBirimi}
                    onChange={(e) => setTedOdemeParaBirimi(e.target.value)}
                    className="h-8 rounded-[6px] border border-border bg-card px-2 text-xs font-mono"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <Input
                    placeholder="Dekont Ref"
                    value={tedOdemeDekont}
                    onChange={(e) => setTedOdemeDekont(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={tedOdemeMut.isPending}
                    className="h-8 text-xs"
                  >
                    {tedOdemeMut.isPending ? "Ödeniyor…" : "Ödemeyi Kaydet"}
                  </Button>
                </div>
                <Input
                  placeholder="Açıklama (opsiyonel)"
                  value={tedOdemeAciklama}
                  onChange={(e) => setTedOdemeAciklama(e.target.value)}
                  className="h-8 text-xs"
                />
              </form>
            </div>
          )}

          {/* Alıcı Cari Hesap Dökümü */}
          <div className="rounded-[8px] border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Cari Hesap Dökümü
              </h2>
              {!canOpsFinance && (
                <form
                  onSubmit={handleCariLookup}
                  className="flex items-center gap-1.5"
                >
                  <Input
                    type="number"
                    min={1}
                    placeholder="Cari ID"
                    value={cariLookupInput}
                    onChange={(e) => setCariLookupInput(e.target.value)}
                    className="h-7 w-28 text-xs font-mono tabular-nums"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                  >
                    Cari Getir
                  </Button>
                </form>
              )}
            </div>
            {cariList.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 text-center p-6 text-xs text-muted-foreground">
                <span>
                  {cariQ.isError
                    ? mapCommerceError(
                        cariQ.error,
                        "Cari hesap verisi alınamadı."
                      )
                    : "Kayıtlı cari hesap verisi bulunamadı."}
                </span>
                {cariQ.isError && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void cariQ.refetch()}
                    className="h-7 text-xs"
                  >
                    Yeniden Dene
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hesap</TableHead>
                    <TableHead>Para Birimi</TableHead>
                    <TableHead>Güncelleme</TableHead>
                    <TableHead className="text-right">Bakiye</TableHead>
                    <TableHead className="text-right">Kredi Limiti</TableHead>
                    <TableHead className="text-right">Detay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cariList.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        #{c.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.para_birimi}
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
                          Detay
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Alıcı Ledger */}
          <div className="rounded-[8px] border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Ledger</h2>
            </div>
            {ledger.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center gap-1 text-center p-6 text-xs text-muted-foreground">
                <span>
                  {ledgerQ.isError
                    ? mapCommerceError(ledgerQ.error, "Ledger verisi alınamadı.")
                    : "Ledger kaydı bulunamadı."}
                </span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Yön / Tip</TableHead>
                    <TableHead>Referans</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        #{row.id}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {[row.yon, row.hareket_tipi].filter(Boolean).join(" · ") ||
                          "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {row.referans_tip || "—"}
                        {row.referans_id != null ? ` #${row.referans_id}` : ""}
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

          {/* Platform Ops Finans Tabloları */}
          {canOpsFinance && (
            <div className="rounded-[8px] border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Platform Ops Finans Kayıtları
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Tüm kiracıların cari, ledger, tedarikçi hak ediş ve geçmiş ödeme dökümleri.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 rounded-[6px] border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setOpsTab("cari")}
                    className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
                      opsTab === "cari"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tüm Cari ({opsCariList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsTab("ledger")}
                    className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
                      opsTab === "ledger"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tüm Ledger ({opsLedgerList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsTab("hak_edis")}
                    className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
                      opsTab === "hak_edis"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Hak Edişler ({opsHakEdisList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsTab("payments")}
                    className={`rounded-[4px] px-2.5 py-1 text-xs font-medium ${
                      opsTab === "payments"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Geçmiş Kayıtlar ({opsPaymentsList.length})
                  </button>
                </div>
              </div>

              {opsTab === "cari" ? (
                opsCariQ.isLoading ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Ops cari listesi yükleniyor…
                  </div>
                ) : opsCariQ.isError ? (
                  <div className="p-4 text-xs text-destructive">
                    {mapCommerceError(
                      opsCariQ.error,
                      "Ops cari listesi alınamadı."
                    )}
                  </div>
                ) : opsCariList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Kayıt bulunamadı.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Firma</TableHead>
                        <TableHead>Karşı Firma</TableHead>
                        <TableHead>Para Birimi</TableHead>
                        <TableHead className="text-right">Bakiye</TableHead>
                        <TableHead className="text-right">Limit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsCariList.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">
                            #{row.id}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            #{row.firma_id}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.karsi_firma_id != null
                              ? `#${row.karsi_firma_id}`
                              : "—"}
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : opsTab === "ledger" ? (
                opsLedgerQ.isLoading ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Ops ledger listesi yükleniyor…
                  </div>
                ) : opsLedgerQ.isError ? (
                  <div className="p-4 text-xs text-destructive">
                    {mapCommerceError(
                      opsLedgerQ.error,
                      "Ops ledger listesi alınamadı."
                    )}
                  </div>
                ) : opsLedgerList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Kayıt bulunamadı.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Firma</TableHead>
                        <TableHead>Yön / Tip</TableHead>
                        <TableHead>Referans</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsLedgerList.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">
                            #{row.id}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            #{row.firma_id}
                            {row.karsi_firma_id != null
                              ? ` → #${row.karsi_firma_id}`
                              : ""}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            {[row.yon, row.hareket_tipi]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {row.referans_tip || "—"}
                            {row.referans_id != null
                              ? ` #${row.referans_id}`
                              : ""}
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
                )
              ) : opsTab === "hak_edis" ? (
                opsHakEdisQ.isLoading ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Tedarikçi hak edişleri yükleniyor…
                  </div>
                ) : opsHakEdisQ.isError ? (
                  <div className="p-4 text-xs text-destructive">
                    {mapCommerceError(
                      opsHakEdisQ.error,
                      "Hak ediş listesi alınamadı."
                    )}
                  </div>
                ) : opsHakEdisList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Kayıtlı tedarikçi hak edişi bulunamadı.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Tedarikçi</TableHead>
                        <TableHead>Sipariş</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead className="text-right">Gram</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                        <TableHead className="text-right">İşlem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsHakEdisList.map((he) => (
                        <TableRow key={he.id}>
                          <TableCell className="font-mono text-xs">
                            #{he.id}
                          </TableCell>
                          <TableCell className="text-xs">
                            {he.tedarikci_firma_ad || `Firma #${he.tedarikci_firma_id}`}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            #{he.order_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">
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
                                onClick={() => prefillHakEdisOdeme(he)}
                              >
                                Ödeme Formuna Aktar
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {he.odeme_tarihi ? formatDateTime(he.odeme_tarihi) : "ODENDI"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : opsPaymentsQ.isLoading ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Kayıtlar yükleniyor…
                </div>
              ) : opsPaymentsQ.isError ? (
                <div className="p-4 text-xs text-destructive">
                  {mapCommerceError(
                    opsPaymentsQ.error,
                    "Ödeme listesi alınamadı."
                  )}
                </div>
              ) : opsPaymentsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Kayıtlı geçmiş ödeme bulunamadı.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Sipariş</TableHead>
                      <TableHead>Alıcı Firma</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsPaymentsList.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">
                          #{row.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          #{row.order_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          #{row.alici_firma_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
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
            </div>
          )}
        </div>
      )}

      {/* Cari Hesap Detay Dialog */}
      <Dialog
        open={detailCariId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailCariId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cari Hesap Detayı (#{detailCariId})</DialogTitle>
            <DialogDescription>
              Sunucudan alınan maskeli cari hesap bilgileri.
            </DialogDescription>
          </DialogHeader>
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
                <span className="text-muted-foreground">Hesap ID</span>
                <p className="font-mono font-semibold">#{cariDetailQ.data.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Para Birimi</span>
                <p className="font-mono">{cariDetailQ.data.para_birimi}</p>
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
              <div className="col-span-2">
                <span className="text-muted-foreground">Son Güncelleme</span>
                <p>
                  {cariDetailQ.data.guncelleme_tarihi
                    ? formatDateTime(cariDetailQ.data.guncelleme_tarihi)
                    : "—"}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

