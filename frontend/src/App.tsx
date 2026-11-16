import { Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/layout";
import {
  AcceptInvitePage,
  AuthProvider,
  RequireCapability,
  ResetPasswordPage,
} from "@/features/auth";
import { AppErrorBoundary } from "@/components/error-boundary";
import { DomainLoading } from "@/components/route-states";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { createAppQueryClient } from "@/lib/query-client";
import PortalLayout from "@/app/(portal)/layout";
import HomePage from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";
import NotFoundPage from "@/app/not-found";
import FirmalarPage from "@/app/(portal)/firmalar/page";
import TanimlarPage from "@/app/(portal)/tanimlar/page";
import UrunlerPage from "@/app/(portal)/urunler/page";
import FiyatlamaPage from "@/app/(portal)/fiyatlama/page";
import StokPage from "@/app/(portal)/stok/page";
import SiparisPage from "@/app/(portal)/siparis/page";
import FinansPage from "@/app/(portal)/finans/page";
import KalitePage from "@/app/(portal)/kalite/page";
import LojistikPage from "@/app/(portal)/lojistik/page";
import BelgelerPage from "@/app/(portal)/belgeler/page";
import ProfilPage from "@/app/(portal)/profil/page";
import RaporlarPage from "@/app/(portal)/raporlar/page";
import EpostaAyarlariPage from "@/app/(portal)/ayarlar/eposta/page";
import PiyasaAyarlariPage from "@/app/(portal)/ayarlar/piyasa/page";
import PiyasaPage from "@/app/(portal)/piyasa/page";
import PiyasaTvPage from "@/app/piyasa/tv/page";

const queryClient = createAppQueryClient();

/** Oturum düşüşü / CSRF hatalarını toast ile yüzeye çıkarır (tekilleştirilmiş). */
function GlobalFeedbackBridge() {
  const toast = useToast();

  useEffect(() => {
    let lastAuthToastAt = 0;
    let lastCsrfToastAt = 0;
    const DEDUPE_MS = 4_000;

    const onExpired = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { code?: string; status?: number }
        | undefined;
      const now = Date.now();
      if (now - lastAuthToastAt < DEDUPE_MS) return;
      lastAuthToastAt = now;
      if (detail?.code === "mfa_required") {
        toast.info("Doğrulama gerekli", "Oturumu tamamlamak için MFA kodunu girin.");
        return;
      }
      toast.error("Oturum sona erdi", "Yeniden giriş yapmanız gerekiyor.");
    };
    const onCsrf = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { message?: string }
        | undefined;
      const now = Date.now();
      if (now - lastCsrfToastAt < DEDUPE_MS) return;
      lastCsrfToastAt = now;
      toast.error(
        "Güvenlik jetonu alınamadı",
        detail?.message || "Sayfayı yenileyip tekrar deneyin."
      );
    };
    window.addEventListener("taragold:auth-expired", onExpired);
    window.addEventListener("taragold:csrf-failed", onCsrf);
    return () => {
      window.removeEventListener("taragold:auth-expired", onExpired);
      window.removeEventListener("taragold:csrf-failed", onCsrf);
    };
  }, [toast]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <ToastProvider>
          <BrowserRouter>
            <AppErrorBoundary label="Uygulama">
              <AuthProvider>
                <GlobalFeedbackBridge />
                <Suspense fallback={<DomainLoading label="Uygulama" />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/invite" element={<AcceptInvitePage />} />
                    <Route path="/piyasa/tv" element={<PiyasaTvPage />} />

                    <Route element={<PortalLayout />}>
                      <Route index element={<HomePage />} />
                      <Route path="piyasa" element={<PiyasaPage />} />
                      <Route path="profil" element={<ProfilPage />} />

                      <Route
                        element={
                          <RequireCapability capability="can_manage_org" />
                        }
                      >
                        <Route path="firmalar" element={<FirmalarPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_ops" />
                        }
                      >
                        <Route path="tanimlar" element={<TanimlarPage />} />
                        <Route path="raporlar" element={<RaporlarPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_catalog" />
                        }
                      >
                        <Route path="urunler" element={<UrunlerPage />} />
                        <Route path="urunler/:id" element={<UrunlerPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_lock_quote" />
                        }
                      >
                        <Route path="fiyatlama" element={<FiyatlamaPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_supplier_stock" />
                        }
                      >
                        <Route path="stok" element={<StokPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_orders" />
                        }
                      >
                        <Route path="siparis" element={<SiparisPage />} />
                        <Route path="siparis/:id" element={<SiparisPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_finance" />
                        }
                      >
                        <Route path="finans" element={<FinansPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_manage_qc" />
                        }
                      >
                        <Route path="kalite" element={<KalitePage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_view_shipments" />
                        }
                      >
                        <Route path="lojistik" element={<LojistikPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability
                            anyOf={[
                              "can_view_shipments",
                              "can_view_orders",
                              "can_view_ops",
                              "can_manage_shipment",
                            ]}
                          />
                        }
                      >
                        <Route path="belgeler" element={<BelgelerPage />} />
                      </Route>
                      <Route
                        element={
                          <RequireCapability capability="can_manage_smtp" />
                        }
                      >
                        <Route
                          path="ayarlar/eposta"
                          element={<EpostaAyarlariPage />}
                        />
                      </Route>
                      <Route
                        element={
                          <RequireCapability
                            anyOf={["can_manage_piyasa", "can_view_ops"]}
                          />
                        }
                      >
                        <Route
                          path="ayarlar/piyasa"
                          element={<PiyasaAyarlariPage />}
                        />
                      </Route>

                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </Suspense>
              </AuthProvider>
            </AppErrorBoundary>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
