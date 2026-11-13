"""Firma tip / tedarikçi alt tip atamaları (ADR-0033) — M2M yerine ara tablo."""

from __future__ import annotations

from django.db import models


class FirmaTipAtama(models.Model):
    class Tip(models.TextChoices):
        TEDARIKCI = "TEDARIKCI", "Tedarikçi"
        ALICI_KUYUMCU = "ALICI_KUYUMCU", "Alıcı kuyumcu"
        API_MUSTERISI = "API_MUSTERISI", "API müşterisi"

    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="tip_atamalari",
    )
    tip = models.CharField(max_length=16, choices=Tip.choices)

    class Meta:
        verbose_name = "Firma tip ataması"
        verbose_name_plural = "Firma tip atamaları"
        constraints = [
            models.UniqueConstraint(
                fields=["firma", "tip"], name="firmatipatama_firma_tip_uniq"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.firma_id}:{self.tip}"


class FirmaTedarikciAltTip(models.Model):
    class AltTip(models.TextChoices):
        IMALATCI = "IMALATCI", "İmalatçı"
        TOPTANCI = "TOPTANCI", "Toptancı"
        BELIRSIZ = "BELIRSIZ", "Belirsiz"

    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="tedarikci_alt_tipleri",
    )
    alt_tip = models.CharField(max_length=16, choices=AltTip.choices)

    class Meta:
        verbose_name = "Tedarikçi alt tip"
        verbose_name_plural = "Tedarikçi alt tipleri"
        constraints = [
            models.UniqueConstraint(
                fields=["firma", "alt_tip"],
                name="firmatedarikcialttip_firma_alt_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.firma_id}:{self.alt_tip}"
