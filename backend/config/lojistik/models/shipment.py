"""Shipment — sipariş sevkiyat SM (ADR-0013 F6-K6 / F6-020)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Shipment(models.Model):
    class Durum(models.TextChoices):
        TASLAK = "TASLAK", "Taslak"
        HAZIR = "HAZIR", "Hazır"
        YOLDA = "YOLDA", "Yolda"
        TESLIM = "TESLIM", "Teslim"
        IPTAL = "IPTAL", "İptal"

    class TeslimModeli(models.TextChoices):
        PLATFORM_QC = "PLATFORM_QC", "Platform QC üzerinden"
        DOGRUDAN = "DOGRUDAN", "Tedarikçiden doğrudan"

    class SevkYonu(models.TextChoices):
        TEDARIKCI_TO_PLATFORM = "TEDARIKCI_TO_PLATFORM", "Tedarikçi → Platform (QC)"
        PLATFORM_TO_ALICI = "PLATFORM_TO_ALICI", "Platform → Alıcı"
        DOGRUDAN = "DOGRUDAN", "Tedarikçi → Alıcı (Doğrudan)"

    order = models.ForeignKey(
        "siparis.Order",
        on_delete=models.PROTECT,
        related_name="shipments",
    )
    durum = models.CharField(
        max_length=16, choices=Durum.choices, default=Durum.TASLAK
    )
    teslim_modeli = models.CharField(
        max_length=16,
        choices=TeslimModeli.choices,
        default=TeslimModeli.PLATFORM_QC,
    )
    sevk_yonu = models.CharField(
        max_length=24,
        choices=SevkYonu.choices,
        default=SevkYonu.PLATFORM_TO_ALICI,
    )
    kargo_firma = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="ADR-0034: elle taşıyıcı adı; entegrasyon yok.",
    )
    takip_no = models.CharField(
        max_length=64,
        blank=True,
        help_text="ADR-0034: elle takip no zorunlu (sevk).",
    )
    notlar = models.CharField(max_length=255, blank=True)
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="olusturdugu_shipments",
    )
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    _allow_status_transition = False

    class Meta:
        verbose_name = "Sevkiyat"
        verbose_name_plural = "Sevkiyatlar"
        ordering = ["-olusturma_tarihi", "-pk"]
        permissions = [
            ("manage_shipment", "Sevkiyat oluşturup yönetebilir"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    durum__in=["TASLAK", "HAZIR", "YOLDA", "TESLIM", "IPTAL"]
                ),
                name="shipment_durum_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(teslim_modeli__in=["PLATFORM_QC", "DOGRUDAN"]),
                name="shipment_teslim_modeli_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    sevk_yonu__in=[
                        "TEDARIKCI_TO_PLATFORM",
                        "PLATFORM_TO_ALICI",
                        "DOGRUDAN",
                    ]
                ),
                name="shipment_sevk_yonu_gecerli",
            ),
        ]
        indexes = [
            models.Index(fields=["order", "durum"]),
            models.Index(fields=["durum"]),
        ]

    def __str__(self) -> str:
        return f"SH#{self.pk or '?'} O#{self.order_id} {self.durum}"

    def save(self, *args, **kwargs):
        if self._state.adding:
            return super().save(*args, **kwargs)
        if self._allow_status_transition:
            update_fields = kwargs.get("update_fields")
            if update_fields is not None and set(update_fields) <= {
                "durum",
                "takip_no",
                "kargo_firma",
                "teslim_modeli",
                "sevk_yonu",
                "notlar",
                "guncelleme_tarihi",
            }:
                return super().save(*args, **kwargs)
            raise ValidationError(
                "Shipment güncellemesi yalnız izinli alanlarla yapılır (F6-020)."
            )
        raise ValidationError(
            "Shipment değişmez; geçiş yalnız shipment_servisi (F6-020)."
        )

    def delete(self, *args, **kwargs):
        raise ValidationError("Shipment silinemez.")
