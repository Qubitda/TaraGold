"""FirmaBelge — vergi levhası / imza sirküsü / sicil gazetesi metadata (normatif §3).

Binary storage yok; storage_key harici. Expand-only.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


class FirmaBelge(models.Model):
    class Tip(models.TextChoices):
        VERGI_LEVHASI = "VERGI_LEVHASI", "Vergi levhası"
        IMZA_SIRKUSU = "IMZA_SIRKUSU", "İmza sirküsü"
        SICIL_GAZETESI = "SICIL_GAZETESI", "Sicil gazetesi"
        DIGER = "DIGER", "Diğer"

    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="firma_belgeleri",
    )
    tip = models.CharField(max_length=32, choices=Tip.choices)
    baslik = models.CharField(max_length=120)
    storage_key = models.CharField(
        max_length=255,
        help_text="Harici object key; binary bu tabloda yok.",
    )
    content_type = models.CharField(max_length=64, blank=True, default="")
    byte_size = models.PositiveIntegerField(null=True, blank=True)
    notlar = models.TextField(blank=True, default="")
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="olusturdugu_firma_belgeleri",
    )
    olusturma = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Firma belgesi"
        verbose_name_plural = "Firma belgeleri"
        ordering = ["-olusturma", "-pk"]

    def __str__(self) -> str:
        return f"{self.tip}@{self.firma_id}"
