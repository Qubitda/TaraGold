"""HazirlamaEmri — tedarikçi bazlı kör sipariş hazırlama emri (ADR-0036)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class HazirlamaEmri(models.Model):
    """Sipariş onaylandığında tedarikçi başına bir emir açılır; alıcı kimliği içermez."""

    class Durum(models.TextChoices):
        HAZIRLANIYOR = "HAZIRLANIYOR", "Hazırlanıyor"
        HAZIR = "HAZIR", "Hazır"
        IPTAL = "IPTAL", "İptal"

    class TeslimModeli(models.TextChoices):
        PLATFORM_QC = "PLATFORM_QC", "Platform üzerinden QC"
        DOGRUDAN = "DOGRUDAN", "Tedarikçiden doğrudan"

    order = models.ForeignKey(
        "siparis.Order",
        on_delete=models.PROTECT,
        related_name="hazirlama_emirleri",
    )
    tedarikci_firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.PROTECT,
        related_name="hazirlama_emirleri",
    )
    durum = models.CharField(
        max_length=16, choices=Durum.choices, default=Durum.HAZIRLANIYOR
    )
    teslim_modeli = models.CharField(
        max_length=16,
        choices=TeslimModeli.choices,
        default=TeslimModeli.PLATFORM_QC,
    )
    hazir_zamani = models.DateTimeField(null=True, blank=True)
    hazir_isaretleyen = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hazirladigi_emirler",
    )
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    _allow_status_transition = False

    class Meta:
        verbose_name = "Hazırlama emri"
        verbose_name_plural = "Hazırlama emirleri"
        ordering = ["-olusturma_tarihi", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "tedarikci_firma"],
                name="hazirlamaemri_order_tedarikci_uniq",
            ),
            models.CheckConstraint(
                condition=models.Q(durum__in=["HAZIRLANIYOR", "HAZIR", "IPTAL"]),
                name="hazirlamaemri_durum_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(teslim_modeli__in=["PLATFORM_QC", "DOGRUDAN"]),
                name="hazirlamaemri_teslim_modeli_gecerli",
            ),
        ]
        indexes = [
            models.Index(fields=["tedarikci_firma", "durum"]),
            models.Index(fields=["order", "durum"]),
        ]

    def __str__(self) -> str:
        return (
            f"HE#{self.pk or '?'} O#{self.order_id} "
            f"T#{self.tedarikci_firma_id} {self.durum}"
        )

    def clean(self):
        super().clean()
        firma = getattr(self, "tedarikci_firma", None)
        if firma is not None and not getattr(firma, "tedarikci_mi", False):
            raise ValidationError(
                {"tedarikci_firma": "Hazırlama emri yalnız tedarikçi firmaya açılır."}
            )

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.full_clean()
            return super().save(*args, **kwargs)
        if self._allow_status_transition:
            update_fields = kwargs.get("update_fields")
            if update_fields is not None and set(update_fields) <= {
                "durum",
                "hazir_zamani",
                "hazir_isaretleyen",
                "teslim_modeli",
                "guncelleme_tarihi",
            }:
                return super().save(*args, **kwargs)
            raise ValidationError(
                "HazirlamaEmri güncellemesi yalnız izinli geçiş alanlarıyla yapılır."
            )
        raise ValidationError(
            "HazirlamaEmri değişmez; geçiş yalnız order_onay_servisi ile."
        )

    def delete(self, *args, **kwargs):
        raise ValidationError("HazirlamaEmri silinemez.")
