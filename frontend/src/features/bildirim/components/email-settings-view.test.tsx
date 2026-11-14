import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { EmailSettingsView } from "./email-settings-view";
import { bildirimService } from "../services";
import type { EmailSettings } from "../types";

vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "admin@taragold.test", rol: "platform_super" },
  }),
}));

function renderView(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

const baseSettings: EmailSettings = {
  host: "smtp.example.com",
  port: 587,
  username: "mailer@example.com",
  has_password: true,
  encryption: "STARTTLS",
  use_tls: true,
  use_ssl: false,
  timeout: 15,
  from_email: "noreply@example.com",
  from_name: "TaraGold",
  reply_to: "",
  is_active: true,
  enabled: true,
  last_test_at: "2026-11-14T08:00:00Z",
  last_test_success: true,
  last_test_message: "Test e-postası gönderildi.",
  updated_by: 1,
  updated_by_username: "admin",
  updated_at: "2026-11-14T07:55:00Z",
};

describe("EmailSettingsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mevcut ayarları yükler, parolayı maskeli bırakır ve boş bırakıldığında parolayı göndermeden kaydeder", async () => {
    const user = userEvent.setup();
    vi.spyOn(bildirimService, "getEmailSettings").mockResolvedValue(baseSettings);
    const updateSpy = vi
      .spyOn(bildirimService, "updateEmailSettings")
      .mockResolvedValue({ ...baseSettings, host: "smtp.yandex.com", port: 465, use_tls: false, use_ssl: true, encryption: "SSL" });

    renderView(<EmailSettingsView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("smtp.example.com")).toBeInTheDocument();
    });

    const pwdInput = screen.getByLabelText("Parola / Uygulama Şifresi") as HTMLInputElement;
    expect(pwdInput.value).toBe("");
    expect(pwdInput.placeholder).toContain("•••••••");

    await user.click(screen.getByRole("button", { name: "Yandex" }));
    expect((screen.getByLabelText("SMTP Sunucusu (Host)") as HTMLInputElement).value).toBe(
      "smtp.yandex.com"
    );
    expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe("465");

    await user.click(screen.getByRole("button", { name: /Ayarları Kaydet/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    const sentPayload = updateSpy.mock.calls[0][0];
    expect(sentPayload.host).toBe("smtp.yandex.com");
    expect(sentPayload.port).toBe(465);
    expect(sentPayload.use_ssl).toBe(true);
    expect(sentPayload.use_tls).toBe(false);
    expect(sentPayload.password).toBeUndefined();
  });

  it("bağlantı testi ve test e-postası gönderimi sonuçlarını gösterir", async () => {
    const user = userEvent.setup();
    vi.spyOn(bildirimService, "getEmailSettings").mockResolvedValue(baseSettings);
    const connSpy = vi
      .spyOn(bildirimService, "testConnection")
      .mockResolvedValue({
        success: true,
        message: "SMTP sunucusuna bağlantı ve kimlik doğrulama başarılı.",
        detail: null,
      });
    const sendSpy = vi
      .spyOn(bildirimService, "sendTestEmail")
      .mockResolvedValue({
        success: false,
        message: "SMTP kimlik doğrulama başarısız.",
        detail: "535 5.7.8 Authentication failed",
      });

    renderView(<EmailSettingsView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("smtp.example.com")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Bağlantıyı Test Et/i }));
    await waitFor(() => {
      expect(connSpy).toHaveBeenCalledTimes(1);
      expect(
        screen.getAllByText(
          "SMTP sunucusuna bağlantı ve kimlik doğrulama başarılı."
        ).length
      ).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getByRole("button", { name: /Test E-postası Gönder/i }));
    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0].to).toBe("admin@taragold.test");
      expect(
        screen.getAllByText("SMTP kimlik doğrulama başarısız.").length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("535 5.7.8 Authentication failed")).toBeInTheDocument();
    });
  });
});
