"""E-posta (SMTP) yapılandırması, şifreleme, yetki, test ve dinamik backend testleri."""

from __future__ import annotations

import smtplib
import socket
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import get_connection, send_mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from bildirim.backends import DynamicDatabaseEmailBackend
from bildirim.models import EmailConfiguration, SmtpSettings
from bildirim.models.smtp_settings import SMTP_CONFIG_CACHE_KEY
from bildirim.services import crypto_servisi, smtp_servisi
from firmalar import roles
from firmalar.models import Firma, Kullanici
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups


class EmailConfigurationBackendTests(TestCase):
    def setUp(self):
        cache.clear()
        self.platform = ensure_platform_firma()
        self.buyer_firma = Firma.objects.create(
            firma_kodu="BUY01",
            ad="Test Kuyumcu",
            alici_mi=True,
            aktif=True,
        )
        seed_role_permissions()
        self.admin = Kullanici.objects.create_user(
            username="smtp_admin",
            email="admin@taragold.test",
            password="StrongPass!1234",
            firma=self.platform,
            rol=roles.PLATFORM_ADMIN,
        )
        sync_user_role_groups(self.admin)

        self.ops_user = Kullanici.objects.create_user(
            username="ops_non_admin",
            email="ops@taragold.test",
            password="StrongPass!1234",
            firma=self.platform,
            rol=roles.PLATFORM_OPS,
        )
        sync_user_role_groups(self.ops_user)

        self.buyer = Kullanici.objects.create_user(
            username="buyer_user",
            email="buyer@taragold.test",
            password="StrongPass!1234",
            firma=self.buyer_firma,
            rol=roles.ALICI_YONETICI,
        )
        sync_user_role_groups(self.buyer)

    def _auth_client(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_encryption_hides_plaintext_and_rotates(self):
        cfg = EmailConfiguration.get_solo()
        smtp_servisi.set_password(cfg, "super-secret-smtp-pass")
        cfg.save()
        cfg.refresh_from_db()
        self.assertTrue(cfg.password_sealed.startswith("enc:v1:"))
        self.assertNotIn("super-secret-smtp-pass", cfg.password_sealed)
        self.assertEqual(
            crypto_servisi.unseal_password(cfg.password_sealed),
            "super-secret-smtp-pass",
        )

    def test_tls_and_ssl_cannot_both_be_true(self):
        cfg = EmailConfiguration.get_solo()
        with self.assertRaises(ValidationError):
            cfg.apply_tls_ssl_flags(use_tls=True, use_ssl=True)

        client = self._auth_client(self.admin)
        resp = client.patch(
            "/api/v1/ops/email-settings/",
            {"host": "smtp.example.com", "use_tls": True, "use_ssl": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_permissions_deny_non_admin_with_403(self):
        for non_admin in (self.buyer, self.ops_user):
            c = self._auth_client(non_admin)
            self.assertEqual(c.get("/api/v1/ops/email-settings/").status_code, 403)
            self.assertEqual(
                c.patch(
                    "/api/v1/ops/email-settings/",
                    {"host": "evil.example.com"},
                    format="json",
                ).status_code,
                403,
            )
            self.assertEqual(
                c.post("/api/v1/ops/email-settings/test-connection/", {}, format="json").status_code,
                403,
            )
            self.assertEqual(
                c.post(
                    "/api/v1/ops/email-settings/send-test/",
                    {"to": "a@b.com"},
                    format="json",
                ).status_code,
                403,
            )

    def test_password_never_returned_and_preserved_when_empty(self):
        client = self._auth_client(self.admin)
        resp1 = client.put(
            "/api/v1/ops/email-settings/",
            {
                "host": "smtp.example.com",
                "port": 587,
                "username": "mailer@example.com",
                "password": "MySecretPassword99",
                "use_tls": True,
                "use_ssl": False,
                "from_email": "noreply@example.com",
                "from_name": "TaraGold",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, 200)
        data1 = resp1.json()
        self.assertNotIn("password", data1)
        self.assertNotIn("password_sealed", data1)
        self.assertTrue(data1["has_password"])

        # Boş parola ile güncelleme: mevcut şifre korunmalı
        resp2 = client.patch(
            "/api/v1/ops/email-settings/",
            {"host": "smtp2.example.com", "password": ""},
            format="json",
        )
        self.assertEqual(resp2.status_code, 200)
        cfg = SmtpSettings.get_solo()
        self.assertEqual(cfg.host, "smtp2.example.com")
        self.assertEqual(
            crypto_servisi.unseal_password(cfg.password_sealed),
            "MySecretPassword99",
        )

    @patch("bildirim.services.smtp_servisi.smtplib.SMTP")
    def test_connection_endpoint_with_unsaved_values_and_error_classification(
        self, mock_smtp_cls
    ):
        mock_srv = MagicMock()
        mock_smtp_cls.return_value = mock_srv
        client = self._auth_client(self.admin)

        resp = client.post(
            "/api/v1/ops/email-settings/test-connection/",
            {
                "host": "smtp.gmail.com",
                "port": 587,
                "username": "u@gmail.com",
                "password": "app-password",
                "use_tls": True,
                "use_ssl": False,
                "timeout": 10,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        mock_srv.starttls.assert_called_once()
        mock_srv.login.assert_called_once_with("u@gmail.com", "app-password")
        mock_srv.noop.assert_called_once()

        # DNS hatası sınıflandırması & şifre sızmaması
        mock_smtp_cls.side_effect = socket.gaierror("Name or service not known")
        resp_err = client.post(
            "/api/v1/ops/email-settings/test-connection/",
            {"host": "bad.invalid", "port": 587, "password": "secret-should-not-leak"},
            format="json",
        )
        self.assertEqual(resp_err.status_code, 200)
        err_body = resp_err.json()
        self.assertFalse(err_body["success"])
        self.assertIn("DNS", err_body["message"])
        self.assertNotIn("secret-should-not-leak", err_body.get("detail") or "")

    @patch("bildirim.services.smtp_servisi.smtplib.SMTP")
    def test_send_test_endpoint_updates_last_test_fields(self, mock_smtp_cls):
        mock_srv = MagicMock()
        mock_smtp_cls.return_value = mock_srv
        client = self._auth_client(self.admin)

        resp = client.post(
            "/api/v1/ops/email-settings/send-test/",
            {
                "to": "dest@example.com",
                "host": "smtp.example.com",
                "port": 587,
                "username": "mailer",
                "password": "pw",
                "use_tls": True,
                "from_name": "TaraGold Ops",
                "from_email": "noreply@example.com",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])
        mock_srv.sendmail.assert_called_once()

        cfg = SmtpSettings.get_solo()
        self.assertIsNotNone(cfg.last_test_at)
        self.assertTrue(cfg.last_test_success)
        self.assertIn("dest@example.com", cfg.last_test_message)

    @override_settings(
        EMAIL_BACKEND="bildirim.backends.DynamicDatabaseEmailBackend",
        EMAIL_FALLBACK_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_dynamic_backend_fallback_and_active_db_override(self):
        mail.outbox.clear()
        cfg = SmtpSettings.get_solo()
        cfg.enabled = False
        cfg.save()

        # DB aktif değilken fallback (locmem) kullanılmalı
        send_mail("Fallback Test", "Merhaba", "webmaster@localhost", ["a@b.com"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Fallback Test")

        # DB aktif edilince cache temizlenmeli ve SMTP backend delegesi kullanılmalı
        cfg.host = "smtp.live.example.com"
        cfg.port = 587
        cfg.username = "u"
        smtp_servisi.set_password(cfg, "p")
        cfg.from_name = "TaraGold Platform"
        cfg.from_email = "info@taragold.com"
        cfg.enabled = True
        cfg.save()
        self.assertIsNone(cache.get(SMTP_CONFIG_CACHE_KEY))

        with patch(
            "bildirim.backends.DjangoSmtpEmailBackend.send_messages", return_value=1
        ) as mock_send:
            conn = get_connection()
            self.assertIsInstance(conn, DynamicDatabaseEmailBackend)
            sent_count = send_mail(
                "DB Config Test",
                "Gövde",
                "webmaster@localhost",
                ["c@d.com"],
            )
            self.assertEqual(sent_count, 1)
            mock_send.assert_called_once()
            sent_msg = mock_send.call_args[0][0][0]
            self.assertIn("TaraGold Platform <info@taragold.com>", sent_msg.from_email)
