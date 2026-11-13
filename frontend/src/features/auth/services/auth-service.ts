import {
  apiFetch,
  ensureCsrfToken,
  login as apiLogin,
  logout as apiLogout,
  fetchMe as apiFetchMe,
  verifyMfa as apiVerifyMfa,
  resendMfa as apiResendMfa,
  newIdempotencyKey,
} from "@/lib/api/client";
import type {
  CsrfResponse,
  LoginResponse,
  MeResponse,
  ReadyResponse,
} from "@/lib/api/types";

export const authService = {
  async ensureCsrf(): Promise<string> {
    return ensureCsrfToken();
  },
  getCsrfToken(): Promise<CsrfResponse> {
    return apiFetch<CsrfResponse>("/auth/csrf/");
  },
  getReady(): Promise<ReadyResponse> {
    return apiFetch<ReadyResponse>("/ready/");
  },
  async login(username: string, password: string): Promise<LoginResponse> {
    await ensureCsrfToken();
    return apiLogin(username, password);
  },
  logout(): Promise<{ ok: boolean }> {
    return apiLogout();
  },
  getMe(): Promise<MeResponse> {
    return apiFetchMe();
  },
  verifyMfa(code: string): Promise<MeResponse> {
    return apiVerifyMfa(code);
  },
  resendMfa(): Promise<{ detail?: string; mfa_ok?: boolean }> {
    return apiResendMfa();
  },
  async requestPasswordReset(email: string): Promise<{ detail: string }> {
    await ensureCsrfToken();
    return apiFetch<{ detail: string }>("/auth/password-reset/", {
      method: "POST",
      body: { email },
    });
  },
  async confirmPasswordReset(data: {
    uid: string;
    token: string;
    new_password: string;
    new_password_confirm: string;
  }): Promise<{ detail: string }> {
    await ensureCsrfToken();
    return apiFetch<{ detail: string }>("/auth/password-reset/confirm/", {
      method: "POST",
      body: data,
    });
  },
  async acceptInvite(data: {
    token: string;
    username: string;
    password: string;
    password_confirm: string;
  }): Promise<{ detail: string; username: string }> {
    await ensureCsrfToken();
    return apiFetch<{ detail: string; username: string }>(
      "/auth/invites/accept/",
      {
        method: "POST",
        body: data,
      }
    );
  },
  startActAs(userId: number): Promise<{
    act_as: boolean;
    target_id: number;
    target_username: string;
    redirect_url: string;
  }> {
    return apiFetch("/act-as/start/", {
      method: "POST",
      body: { user_id: userId },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  stopActAs(): Promise<{
    act_as: boolean;
    actor_id: number | null;
    redirect_url: string;
  }> {
    return apiFetch("/act-as/stop/", {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
};
