"""FirmaKontak — rehber kaydı; kullanıcıya otomatik bağlanmaz (ADR-0033)."""

from __future__ import annotations

from django.db import models


class FirmaKontak(models.Model):
    class Departman(models.TextChoices):
        YETKILI = "YETKILI", "Yetkili"
        URETIM = "URETIM", "Üretim"
        SATIS = "SATIS", "Satış"
        MUHASEBE = "MUHASEBE", "Muhasebe"

    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="kontaklar",
    )
    ad_soyad = models.CharField(max_length=120)
    departman = models.CharField(
        max_length=16,
        choices=Departman.choices,
        blank=True,
        default="",
    )
    gorev = models.CharField(max_length=80, blank=True, default="")
    telefon = models.CharField(max_length=32, blank=True, default="")
    eposta = models.EmailField(blank=True, default="")
    birincil = models.BooleanField(default=False)
    notlar = models.TextField(blank=True, default="")
    olusturma = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Firma kontak"
        verbose_name_plural = "Firma kontaklar"
        ordering = ["-birincil", "ad_soyad", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["firma"],
                condition=models.Q(birincil=True),
                name="firmakontak_birincil_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.ad_soyad}@{self.firma_id}"
