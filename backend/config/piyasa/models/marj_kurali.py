"""Kapsam bazlı kâr marjı kuralları (Tümü | Satış Kanalı | Kategori | Fiyat Grubu)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class MarjKurali(models.Model):
    class Kapsam(models.TextChoices):
        TUMU = "TUMU", "Tümü (Global Varsayılan)"
        SATIS_KANALI = "SATIS_KANALI", "Satış Kanalı"
        KATEGORI = "KATEGORI", "Kategori"
        FIYAT_GRUBU = "FIYAT_GRUBU", "Fiyat Grubu"

    class MarjTuru(models.TextChoices):
        YUZDE = "YUZDE", "Yüzde (%)"
        GRAM_BASI_SABIT = "GRAM_BASI_SABIT", "Gram Başı Sabit"

    ad = models.CharField("Kural adı", max_length=120, blank=True, default="")
    kapsam = models.CharField(
        "Kapsam",
        max_length=24,
        choices=Kapsam.choices,
        default=Kapsam.TUMU,
    )
    satis_kanali = models.ForeignKey(
        "tanimlar.SatisKanali",
        verbose_name="Satış kanalı",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="marj_kurallari",
    )
    kategori = models.ForeignKey(
        "urunler.Kategori",
        verbose_name="Kategori",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="marj_kurallari",
    )
    fiyat_grubu = models.ForeignKey(
        "tanimlar.FiyatGrubu",
        verbose_name="Fiyat grubu",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="marj_kurallari",
    )
    marj_turu = models.CharField(
        "Marj türü",
        max_length=24,
        choices=MarjTuru.choices,
        default=MarjTuru.YUZDE,
    )
    deger = models.DecimalField(
        "Değer",
        max_digits=14,
        decimal_places=4,
        default=Decimal("0.0000"),
    )
    aktif = models.BooleanField("Aktif", default=True)
    olusturma = models.DateTimeField(auto_now_add=True)
    guncelleme = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Marj kuralı"
        verbose_name_plural = "Marj kuralları"
        ordering = ["kapsam", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(deger__gte=0),
                name="piyasa_marj_kurali_deger_non_neg",
            ),
            models.UniqueConstraint(
                fields=["kapsam"],
                condition=Q(kapsam="TUMU"),
                name="piyasa_marj_kurali_tek_tumu",
            ),
        ]

    def clean(self):
        super().clean()
        errors: dict[str, str] = {}
        if self.deger is not None and self.deger < Decimal("0"):
            errors["deger"] = "Marj değeri negatif olamaz."

        if self.kapsam == self.Kapsam.TUMU:
            self.satis_kanali = None
            self.kategori = None
            self.fiyat_grubu = None
        elif self.kapsam == self.Kapsam.SATIS_KANALI:
            if not self.satis_kanali_id:
                errors["satis_kanali"] = "Satış kanalı seçilmelidir."
            self.kategori = None
            self.fiyat_grubu = None
        elif self.kapsam == self.Kapsam.KATEGORI:
            if not self.kategori_id:
                errors["kategori"] = "Kategori seçilmelidir."
            self.satis_kanali = None
            self.fiyat_grubu = None
        elif self.kapsam == self.Kapsam.FIYAT_GRUBU:
            if not self.fiyat_grubu_id:
                errors["fiyat_grubu"] = "Fiyat grubu seçilmelidir."
            self.satis_kanali = None
            self.kategori = None
        else:
            errors["kapsam"] = "Geçersiz kapsam."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.ad or f"{self.kapsam}:{self.marj_turu}={self.deger}"
