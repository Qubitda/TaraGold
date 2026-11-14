"""Platform SMTP / E-posta ayarları — tek satır singleton (EmailConfiguration)."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import models

SMTP_CONFIG_CACHE_KEY = "bildirim:smtp_config:v1"


class SmtpSettings(models.Model):
    class Encryption(models.TextChoices):
        NONE = "NONE", "Yok"
        STARTTLS = "STARTTLS", "STARTTLS"
        SSL = "SSL", "SSL/TLS"

    host = models.CharField(max_length=255, blank=True, default="")
    port = models.PositiveIntegerField(default=587)
    encryption = models.CharField(
        max_length=16,
        choices=Encryption.choices,
        default=Encryption.STARTTLS,
    )
    username = models.CharField(max_length=255, blank=True, default="")
    # Şifreli saklama; plaintext asla DB'de tutulmaz.
    password_sealed = models.TextField(blank=True, default="")
    timeout = models.PositiveSmallIntegerField(
        default=15,
        help_text="SMTP bağlantı zaman aşımı (saniye).",
    )
    from_name = models.CharField(max_length=120, blank=True, default="")
    from_email = models.EmailField(blank=True, default="")
    reply_to = models.EmailField(blank=True, default="")
    enabled = models.BooleanField(default=False)
    max_attempts = models.PositiveSmallIntegerField(
        default=5,
        help_text="EmailDelivery retry üst sınırı.",
    )
    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_success = models.BooleanField(null=True, blank=True)
    last_test_message = models.TextField(blank=True, default="")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "E-posta (SMTP) yapılandırması"
        verbose_name_plural = "E-posta (SMTP) yapılandırmaları"
        permissions = [
            ("manage_smtp", "SMTP ayarlarını yönetebilir"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(encryption__in=["NONE", "STARTTLS", "SSL"]),
                name="smtp_encryption_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(port__gte=1) & models.Q(port__lte=65535),
                name="smtp_port_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(timeout__gte=1) & models.Q(timeout__lte=120),
                name="smtp_timeout_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(max_attempts__gte=1) & models.Q(max_attempts__lte=20),
                name="smtp_max_attempts_gecerli",
            ),
        ]

    def __str__(self) -> str:
        return f"SMTP {self.host or '(env fallback)'} :{self.port}"

    @classmethod
    def get_solo(cls) -> "SmtpSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_active(self) -> bool:
        return bool(self.enabled)

    @is_active.setter
    def is_active(self, value: bool) -> None:
        self.enabled = bool(value)

    @property
    def use_tls(self) -> bool:
        return self.encryption == self.Encryption.STARTTLS

    @property
    def use_ssl(self) -> bool:
        return self.encryption == self.Encryption.SSL

    @property
    def updated_at(self):
        return self.guncelleme_tarihi

    def apply_tls_ssl_flags(self, *, use_tls: bool, use_ssl: bool) -> None:
        if use_tls and use_ssl:
            raise ValidationError(
                {"use_tls": "use_tls ve use_ssl aynı anda True olamaz."}
            )
        if use_ssl:
            self.encryption = self.Encryption.SSL
        elif use_tls:
            self.encryption = self.Encryption.STARTTLS
        else:
            self.encryption = self.Encryption.NONE

    def clean(self) -> None:
        super().clean()
        if getattr(self, "_tls_ssl_conflict", False):
            raise ValidationError(
                {"use_tls": "use_tls ve use_ssl aynı anda True olamaz."}
            )
        if self.port is None or not (1 <= int(self.port) <= 65535):
            raise ValidationError({"port": "Port 1 ile 65535 arasında olmalıdır."})
        if self.timeout is None or not (1 <= int(self.timeout) <= 120):
            raise ValidationError(
                {"timeout": "Zaman aşımı 1 ile 120 saniye arasında olmalıdır."}
            )
        if self.enabled and not (self.host or "").strip():
            raise ValidationError(
                {"host": "E-posta yapılandırması aktifken SMTP sunucu adresi zorunludur."}
            )

    def save(self, *args, **kwargs):
        self.pk = 1
        self.full_clean()
        result = super().save(*args, **kwargs)
        cache.delete(SMTP_CONFIG_CACHE_KEY)
        return result

    def delete(self, *args, **kwargs):
        raise ValidationError("SmtpSettings silinemez; pasifleştirin.")


EmailConfiguration = SmtpSettings
