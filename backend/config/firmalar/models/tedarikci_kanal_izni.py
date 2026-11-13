"""TedarikciKanalIzni — tedarikçi→SatisKanali lisansı (ADR-0033)."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class TedarikciKanalIzni(models.Model):
    class Durum(models.TextChoices):
        ISTENDI = "ISTENDI", "İstendi"
        ONAYLI = "ONAYLI", "Onaylı"
        REDDEDILDI = "REDDEDILDI", "Reddedildi"

    tedarikci_firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="kanal_izinleri",
    )
    satis_kanali = models.ForeignKey(
        "tanimlar.SatisKanali",
        on_delete=models.PROTECT,
        related_name="tedarikci_izinleri",
    )
    durum = models.CharField(
        max_length=16, choices=Durum.choices, default=Durum.ISTENDI, db_index=True
    )
    talep_eden = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="talep_ettigi_kanal_izinleri",
    )
    onaylayan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="onayladigi_kanal_izinleri",
    )
    talep_tarihi = models.DateTimeField(auto_now_add=True)
    karar_tarihi = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Tedarikçi kanal izni"
        verbose_name_plural = "Tedarikçi kanal izinleri"
        constraints = [
            models.UniqueConstraint(
                fields=["tedarikci_firma", "satis_kanali"],
                name="tedarikcikanalizni_firma_kanal_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"F{self.tedarikci_firma_id}/K{self.satis_kanali_id}:{self.durum}"
