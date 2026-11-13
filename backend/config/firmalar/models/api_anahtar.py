"""API anahtarı — API_MUSTERISI firması (ADR-0034 FAZ 2/4). Hash saklanır."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class ApiAnahtar(models.Model):
    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="api_anahtarlari",
    )
    satis_kanali = models.ForeignKey(
        "tanimlar.SatisKanali",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="api_anahtarlari",
    )
    ad = models.CharField(max_length=80)
    key_prefix = models.CharField(max_length=12, db_index=True)
    key_hash = models.CharField(max_length=64, unique=True)
    scopes = models.JSONField(default=list, blank=True)
    iptal = models.BooleanField(default=False)
    ip_allowlist = models.JSONField(default=list, blank=True)
    rate_limit_per_min = models.PositiveIntegerField(default=60)
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="olusturdugu_api_anahtarlari",
    )
    olusturma = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "API anahtarı"
        verbose_name_plural = "API anahtarları"
        ordering = ["-olusturma", "-pk"]

    def __str__(self) -> str:
        return f"{self.key_prefix}…@{self.firma_id}"
