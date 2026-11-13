"""Global pano marj modu — GoldXT sağ panel TL | % (ADR-0022 V2-4)."""

from decimal import Decimal

from django.db import models


class PiyasaMarjPolitikasi(models.Model):
    """Tek satır beklenir (`anahtar=default`)."""

    class MarjModu(models.TextChoices):
        TL = "TL", "TL (tutar)"
        YUZDE = "YUZDE", "Yüzde (%)"

    anahtar = models.CharField("Anahtar", max_length=16, unique=True, default="default")
    marj_modu = models.CharField(
        "Marj modu",
        max_length=8,
        choices=MarjModu.choices,
        default=MarjModu.YUZDE,
        help_text="Tüm pano ürünlerine uygulanır (alış↓ / satış↑).",
    )
    marj_orani = models.DecimalField(
        "Global marj oranı",
        max_digits=8,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="GAP-F3-02: küresel marj oranı (ör. 0.0850).",
    )
    aktif = models.BooleanField(
        "Aktif",
        default=True,
        help_text="GAP-F3-02: küresel marj politikası aktif mi.",
    )
    guncelleme = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Piyasa marj politikası"
        verbose_name_plural = "Piyasa marj politikası"

    def __str__(self):
        return f"marj_modu={self.marj_modu} marj_orani={self.marj_orani} aktif={self.aktif}"
