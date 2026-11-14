import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bildirimService } from "../services";
import type {
  EmailSendTestPayload,
  EmailSettingsUpdateRequest,
  EmailTestPayload,
} from "../types";

export const bildirimKeys = {
  all: ["bildirim"] as const,
  emailSettings: () => [...bildirimKeys.all, "email-settings"] as const,
};

export function useEmailSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: bildirimKeys.emailSettings(),
    queryFn: () => bildirimService.getEmailSettings(),
    enabled,
  });
}

export function useUpdateEmailSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmailSettingsUpdateRequest) =>
      bildirimService.updateEmailSettings(body),
    onSuccess: (data) => {
      qc.setQueryData(bildirimKeys.emailSettings(), data);
    },
  });
}

export function useTestSmtpConnectionMutation() {
  return useMutation({
    mutationFn: (body: EmailTestPayload) => bildirimService.testConnection(body),
  });
}

export function useSendTestEmailMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmailSendTestPayload) =>
      bildirimService.sendTestEmail(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bildirimKeys.emailSettings() });
    },
  });
}
