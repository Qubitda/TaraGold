import { apiFetch } from "@/lib/api/client";
import type {
  EmailSendTestPayload,
  EmailSettings,
  EmailSettingsUpdateRequest,
  EmailTestPayload,
  EmailTestResult,
} from "../types";

export const bildirimService = {
  getEmailSettings(): Promise<EmailSettings> {
    return apiFetch<EmailSettings>("/ops/email-settings/");
  },

  updateEmailSettings(body: EmailSettingsUpdateRequest): Promise<EmailSettings> {
    return apiFetch<EmailSettings>("/ops/email-settings/", {
      method: "PUT",
      body,
    });
  },

  testConnection(body: EmailTestPayload): Promise<EmailTestResult> {
    return apiFetch<EmailTestResult>("/ops/email-settings/test-connection/", {
      method: "POST",
      body,
      skipIdempotency: true,
    });
  },

  sendTestEmail(body: EmailSendTestPayload): Promise<EmailTestResult> {
    return apiFetch<EmailTestResult>("/ops/email-settings/send-test/", {
      method: "POST",
      body,
      skipIdempotency: true,
    });
  },
};
