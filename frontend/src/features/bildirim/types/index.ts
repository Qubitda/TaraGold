export type SmtpEncryption = "STARTTLS" | "SSL" | "NONE";

export interface EmailSettings {
  host: string;
  port: number;
  username: string;
  has_password: boolean;
  encryption: SmtpEncryption;
  use_tls: boolean;
  use_ssl: boolean;
  timeout: number;
  from_email: string;
  from_name: string;
  reply_to: string;
  is_active: boolean;
  enabled: boolean;
  last_test_at: string | null;
  last_test_success: boolean | null;
  last_test_message: string;
  updated_by: number | null;
  updated_by_username: string;
  updated_at: string | null;
}

export interface EmailSettingsUpdateRequest {
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: SmtpEncryption;
  use_tls: boolean;
  use_ssl: boolean;
  timeout: number;
  from_email: string;
  from_name: string;
  reply_to: string;
  is_active: boolean;
}

export type EmailTestPayload = Partial<EmailSettingsUpdateRequest>;

export interface EmailSendTestPayload extends EmailTestPayload {
  to: string;
}

export interface EmailTestResult {
  success: boolean;
  message: string;
  detail: string | null;
}

export interface SmtpPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  hint?: string;
}
