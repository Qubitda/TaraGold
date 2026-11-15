"""Servis bedeli kuralı — özet öncelik: platform → kanal → tedarikçi → tedarikçi+kanal.

Tarihli kampanya (gecerlilik) sürekli kuraldan üstündür; kampanya maker-checker.
Birim: TRL | GRAM | YUZDE | CURRENCY.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class ServisBedeliKurali(models.Model):
    class Kapsam(models.TextChoices):
        PLATFORM = "PLATFORM", "Platform varsayılan"
        KANAL = "KANAL", "Kanal"
        TEDARIKCI = "TEDARIKCI", "Tedarikçi"
        TEDARIKCI_KANAL = "TEDARIKCI_KANAL", "Tedarikçi + kanal"

    class BirimTipi(models.TextChoices):
        TRL = "TRL", "Sabit TL"
        GRAM = "GRAM", "TL / has gram (veya gram)"
        YUZDE = "YUZDE", "Ham fiyatın yüzdesi"
        CURRENCY = "CURRENCY", "Sabit tutar (kur ile döviz)"

    class Durum(models.TextChoices):
        TASLAK = "TASLAK", "Taslak"
        AKTIF = "AKTIF", "Aktif"
        PASIF = "PASIF", "Pasif"

    ad = models.CharField(max_length=128)
    kapsam = models.CharField(max_length=16, choices=Kapsam.choices)
    satis_kanali = models.ForeignKey(
        "tanimlar.SatisKanali",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="servis_bedeli_kurallari",
    )
    tedarikci = models.ForeignKey(
        "firmalar.Firma",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="servis_bedeli_kurallari",
    )
    birim_tipi = models.CharField(max_length=8, choices=BirimTipi.choices)
    deger = models.DecimalField(max_digits=18, decimal_places=6)
    para_birimi = models.CharField(
        max_length=3,
        default="TRY",
        help_text="CURRENCY biriminde kaynak tutar PB.",
    )
    kampanya_mi = models.BooleanField(default=False)
    gecerlilik_baslangic = models.DateField(null=True, blank=True)
    gecerlilik_bitis = models.DateField(null=True, blank=True)
    durum = models.CharField(
        max_length=8, choices=Durum.choices, default=Durum.TASLAK
    )
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="olusturdugu_servis_bedeli_kurallari",
    )
    onaylayan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="onayladigi_servis_bedeli_kurallari",
    )
    onay_zamani = models.DateTimeField(null=True, blank=True)
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Servis bedeli kuralı"
        verbose_name_plural = "Servis bedeli kuralları"
        ordering = ["-kampanya_mi", "kapsam", "-id"]
        permissions = [
            ("approve_servis_bedeli_kampanya", "Servis bedeli kampanyasını onaylar"),
        ]
        indexes = [
            models.Index(fields=["kapsam", "durum"]),
            models.Index(fields=["satis_kanali", "tedarikci"]),
        ]

    def __str__(self) -> str:
        return f"{self.ad} [{self.kapsam}/{self.birim_tipi}]"

    def clean(self):
        if self.deger < 0:
            raise ValidationError({"deger": "Negatif olamaz."})
        if self.kapsam == self.Kapsam.PLATFORM:
            if self.satis_kanali_id or self.tedarikci_id:
                raise ValidationError("PLATFORM kapsamda kanal/tedarikçi boş olmalı.")
        elif self.kapsam == self.Kapsam.KANAL:
            if not self.satis_kanali_id or self.tedarikci_id:
                raise ValidationError("KANAL: yalnız satis_kanali zorunlu.")
        elif self.kapsam == self.Kapsam.TEDARIKCI:
            if not self.tedarikci_id or self.satis_kanali_id:
                raise ValidationError("TEDARIKCI: yalnız tedarikci zorunlu.")
        elif self.kapsam == self.Kapsam.TEDARIKCI_KANAL:
            if not self.tedarikci_id or not self.satis_kanali_id:
                raise ValidationError("TEDARIKCI_KANAL: ikisi de zorunlu.")
        if self.kampanya_mi:
            if not self.gecerlilik_baslangic or not self.gecerlilik_bitis:
                raise ValidationError("Kampanyada tarih aralığı zorunlu.")
            if self.gecerlilik_bitis < self.gecerlilik_baslangic:
                raise ValidationError("gecerlilik_bitis >= baslangic olmalı.")
