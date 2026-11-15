"""VaryantBilesen — TASLI ürünün montür/taş/çakım bileşenleri (ADR-0001 v2)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models


class VaryantBilesen(models.Model):
    """Bitmiş (TASLI) satış varyantına bağlı montür veya taş satırı."""

    class Rol(models.TextChoices):
        MONTUR = "MONTUR", "Montür"
        TAS = "TAS", "Taş"

    class FiyatBirimi(models.TextChoices):
        USD = "USD", "USD"
        TL = "TL", "TL"

    class FiyatTipi(models.TextChoices):
        KARAT_BASI = "KARAT_BASI", "Karat başı"
        PARCA_BASI = "PARCA_BASI", "Parça başı"

    class IscilikBirimi(models.TextChoices):
        TL = "TL", "TL"
        HAS = "HAS", "Has gram"

    ana_varyant = models.ForeignKey(
        "urunler.Varyant",
        on_delete=models.CASCADE,
        related_name="bilesenler",
        help_text="Alıcının satın aldığı bitmiş ürün varyantı.",
    )
    rol = models.CharField(max_length=8, choices=Rol.choices)
    bilesen_varyant = models.ForeignKey(
        "urunler.Varyant",
        on_delete=models.PROTECT,
        related_name="kullanim_bilesenleri",
        help_text="Montür veya taş stok varyantı.",
    )
    tedarikci = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.PROTECT,
        related_name="varyant_bilesen_tedarikleri",
    )
    adet = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("1"))
    karat = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    tas_agirligi_gram = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("0")
    )
    fiyat = models.DecimalField(max_digits=18, decimal_places=4, default=Decimal("0"))
    fiyat_birimi = models.CharField(
        max_length=3, choices=FiyatBirimi.choices, default=FiyatBirimi.TL
    )
    fiyat_tipi = models.CharField(
        max_length=12, choices=FiyatTipi.choices, default=FiyatTipi.PARCA_BASI
    )
    # Çakım alanları (ana ürün düzeyinde tek satırda da tutulabilir; MONTUR satırında)
    cakim_iscilik = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("0")
    )
    cakim_iscilik_birimi = models.CharField(
        max_length=3, choices=IscilikBirimi.choices, default=IscilikBirimi.TL
    )
    varsayilan_usta = models.ForeignKey(
        "firmalar.Firma",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="varsayilan_usta_oldugu_bilesenler",
    )
    sira = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Varyant bileşeni"
        verbose_name_plural = "Varyant bileşenleri"
        ordering = ["ana_varyant_id", "sira", "pk"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rol__in=["MONTUR", "TAS"]),
                name="varyantbilesen_rol_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(adet__gt=0),
                name="varyantbilesen_adet_pozitif",
            ),
            models.CheckConstraint(
                condition=models.Q(tas_agirligi_gram__gte=0),
                name="varyantbilesen_tas_agirlik_negatif_degil",
            ),
            models.CheckConstraint(
                condition=models.Q(fiyat__gte=0),
                name="varyantbilesen_fiyat_negatif_degil",
            ),
        ]
        indexes = [
            models.Index(fields=["ana_varyant", "rol"]),
            models.Index(fields=["tedarikci"]),
        ]

    def clean(self):
        super().clean()
        if self.ana_varyant_id and self.bilesen_varyant_id:
            if self.ana_varyant_id == self.bilesen_varyant_id:
                raise ValidationError(
                    {"bilesen_varyant": "Ana ve bileşen aynı olamaz."}
                )
        if self.tedarikci_id and not getattr(self.tedarikci, "tedarikci_mi", True):
            raise ValidationError({"tedarikci": "Yalnız tedarikçi firma."})

    def satir_tutari(self) -> Decimal:
        raw = Decimal(self.fiyat or 0)
        if self.fiyat_tipi == self.FiyatTipi.KARAT_BASI:
            return (raw * Decimal(self.karat or 0)).quantize(Decimal("0.01"))
        return (raw * Decimal(self.adet or 1)).quantize(Decimal("0.01"))

    def __str__(self) -> str:
        return (
            f"VB#{self.pk or '?'} {self.rol} "
            f"ana={self.ana_varyant_id} bil={self.bilesen_varyant_id}"
        )
