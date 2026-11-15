"""VaryantFiyat — ops Stok & Fiyat kaynaklı tek aktif fiyat satırı (teklif yok)."""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class VaryantFiyat(models.Model):
    """Varyant başına en fazla bir AKTIF satır; versiyon ile geçmiş."""

    class FiyatModeli(models.TextChoices):
        METAL_BAZLI = "METAL_BAZLI", "Metal bazlı (gram × milyem × birim)"
        GRAM_BIRIM = "GRAM_BIRIM", "Gram × birim fiyat"
        SABIT_PARCA = "SABIT_PARCA", "Parça başı sabit tutar"

    class Durum(models.TextChoices):
        AKTIF = "AKTIF", "Aktif"
        PASIF = "PASIF", "Pasif"

    class IscilikBirimi(models.TextChoices):
        TL = "TL", "TL"
        HAS = "HAS", "Has gram"

    class IscilikTipi(models.TextChoices):
        PARCA = "PARCA", "Parça başı"
        GRAM = "GRAM", "Gram başı"

    varyant = models.ForeignKey(
        "urunler.Varyant",
        on_delete=models.PROTECT,
        related_name="fiyatlar",
    )
    tedarikci = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.PROTECT,
        related_name="varyant_fiyatlari",
        help_text="Stok/sevkiyat/hak ediş için tedarikçi (kör havuz).",
    )
    versiyon = models.PositiveIntegerField(default=1)
    onceki = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sonraki_versiyonlar",
    )
    durum = models.CharField(
        max_length=8, choices=Durum.choices, default=Durum.AKTIF
    )
    fiyat_modeli = models.CharField(max_length=16, choices=FiyatModeli.choices)
    gram = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    birim_fiyat = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    para_birimi = models.CharField(max_length=3, default="TRY")
    iscilik = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("0")
    )
    iscilik_birimi = models.CharField(
        max_length=3,
        choices=IscilikBirimi.choices,
        default=IscilikBirimi.TL,
        help_text="ADR-0001: HAS ise değer has gram; TL ise TRY borç.",
    )
    iscilik_tipi = models.CharField(
        max_length=8,
        choices=IscilikTipi.choices,
        default=IscilikTipi.PARCA,
    )
    tas_bedeli = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0")
    )
    ek_bedel = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0")
    )
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="olusturdugu_varyant_fiyatlari",
    )
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Varyant fiyat"
        verbose_name_plural = "Varyant fiyatları"
        ordering = ["varyant_id", "-versiyon"]
        constraints = [
            models.UniqueConstraint(
                fields=["varyant"],
                condition=models.Q(durum="AKTIF"),
                name="varyantfiyat_tek_aktif",
            ),
            models.CheckConstraint(
                condition=models.Q(fiyat_modeli__in=["METAL_BAZLI", "GRAM_BIRIM", "SABIT_PARCA"]),
                name="varyantfiyat_model_gecerli",
            ),
        ]
        indexes = [
            models.Index(fields=["varyant", "durum"]),
            models.Index(fields=["tedarikci"]),
        ]
        permissions = [
            ("manage_varyant_fiyat", "Varyant fiyatını yönetebilir"),
        ]

    def __str__(self) -> str:
        return f"VF#{self.pk or '?'} V{self.varyant_id} v{self.versiyon} {self.durum}"

    def clean(self):
        if self.fiyat_modeli == self.FiyatModeli.METAL_BAZLI and self.gram is None:
            raise ValidationError({"gram": "METAL_BAZLI için gram zorunlu."})
        if self.fiyat_modeli == self.FiyatModeli.GRAM_BIRIM:
            if self.gram is None or self.birim_fiyat is None:
                raise ValidationError("GRAM_BIRIM için gram ve birim_fiyat zorunlu.")
        if self.fiyat_modeli == self.FiyatModeli.SABIT_PARCA and self.birim_fiyat is None:
            raise ValidationError({"birim_fiyat": "SABIT_PARCA için birim_fiyat zorunlu."})
        if self.iscilik < 0 or self.tas_bedeli < 0 or self.ek_bedel < 0:
            raise ValidationError("iscilik/tas/ek negatif olamaz.")
