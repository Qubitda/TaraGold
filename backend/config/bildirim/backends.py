"""Dinamik veritabanı tabanlı Django EMAIL_BACKEND.

Her gönderimde (kısa süreli cache ile) aktif SmtpSettings / EmailConfiguration kaydını okur.
DB'de aktif kayıt yoksa settings.EMAIL_FALLBACK_BACKEND (varsayılan console) kullanır.
"""

from __future__ import annotations

from email.utils import formataddr
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.backends.smtp import EmailBackend as DjangoSmtpEmailBackend
from django.db import DatabaseError

from bildirim.models.smtp_settings import SMTP_CONFIG_CACHE_KEY, SmtpSettings
from bildirim.services.crypto_servisi import unseal_password

_CONFIG_CACHE_TTL = 60  # saniye; save() işleminde anında invalidate edilir
_DEFAULT_FALLBACK = "django.core.mail.backends.console.EmailBackend"


def _load_active_db_config() -> dict[str, Any] | None:
    """Aktif DB SMTP yapılandırmasını cache üzerinden döner; yoksa None."""
    cached = cache.get(SMTP_CONFIG_CACHE_KEY)
    if cached is not None:
        return cached or None

    try:
        row = SmtpSettings.objects.filter(pk=1).first()
    except DatabaseError:
        return None

    if row is None or not row.enabled or not (row.host or "").strip():
        cache.set(SMTP_CONFIG_CACHE_KEY, {}, _CONFIG_CACHE_TTL)
        return None

    snapshot = {
        "host": row.host.strip(),
        "port": int(row.port or 587),
        "username": (row.username or "").strip(),
        # Cache içinde plaintext parola tutmuyoruz; bellek içinde açılır.
        "password_sealed": row.password_sealed or "",
        "use_tls": row.encryption == SmtpSettings.Encryption.STARTTLS,
        "use_ssl": row.encryption == SmtpSettings.Encryption.SSL,
        "timeout": int(row.timeout or 15),
        "from_name": (row.from_name or "").strip(),
        "from_email": (row.from_email or "").strip(),
        "reply_to": (row.reply_to or "").strip(),
    }
    cache.set(SMTP_CONFIG_CACHE_KEY, snapshot, _CONFIG_CACHE_TTL)
    return snapshot


def _format_from_header(from_name: str, from_email: str) -> str:
    if from_name and from_email:
        return formataddr((from_name, from_email))
    return from_email


class DynamicDatabaseEmailBackend(BaseEmailBackend):
    """DB'deki aktif SMTP ayarlarını kullanan, yoksa settings fallback'e düşen backend."""

    def __init__(self, fail_silently: bool = False, **kwargs: Any) -> None:
        super().__init__(fail_silently=fail_silently, **kwargs)
        self._overrides = kwargs

    def _build_delegate(self) -> tuple[BaseEmailBackend, dict[str, Any] | None]:
        cfg = _load_active_db_config()
        if cfg is not None:
            password = unseal_password(cfg.get("password_sealed") or "")
            backend = DjangoSmtpEmailBackend(
                host=cfg["host"],
                port=cfg["port"],
                username=cfg["username"] or None,
                password=password or None,
                use_tls=cfg["use_tls"],
                use_ssl=cfg["use_ssl"],
                fail_silently=self.fail_silently,
                timeout=cfg["timeout"],
            )
            return backend, cfg

        fallback_path = (
            getattr(settings, "EMAIL_FALLBACK_BACKEND", None) or _DEFAULT_FALLBACK
        )
        if fallback_path.endswith("DynamicDatabaseEmailBackend"):
            fallback_path = _DEFAULT_FALLBACK

        extra_kwargs: dict[str, Any] = {}
        if fallback_path == "django.core.mail.backends.smtp.EmailBackend":
            for key in (
                "host",
                "port",
                "username",
                "password",
                "use_tls",
                "use_ssl",
                "timeout",
            ):
                if key in self._overrides:
                    extra_kwargs[key] = self._overrides[key]
        delegate = get_connection(
            backend=fallback_path,
            fail_silently=self.fail_silently,
            **extra_kwargs,
        )
        return delegate, None

    def _apply_defaults(self, email_messages, cfg: dict[str, Any] | None) -> None:
        if not cfg:
            return
        cfg_from_email = cfg.get("from_email") or ""
        cfg_from_name = cfg.get("from_name") or ""
        cfg_reply_to = cfg.get("reply_to") or ""
        default_from = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()

        formatted_from = _format_from_header(cfg_from_name, cfg_from_email)
        for msg in email_messages:
            cur_from = (getattr(msg, "from_email", None) or "").strip()
            if formatted_from and (
                not cur_from
                or cur_from == "webmaster@localhost"
                or cur_from == default_from
            ):
                msg.from_email = formatted_from
            if cfg_reply_to and not getattr(msg, "reply_to", None):
                msg.reply_to = [cfg_reply_to]

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        delegate, cfg = self._build_delegate()
        self._apply_defaults(email_messages, cfg)
        return delegate.send_messages(email_messages)
