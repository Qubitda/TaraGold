"""ADR-0041 — Alıcı/kuyumcu firma pano başlığı + ek marj (platform fiyatının üstüne)."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models


class FirmaPanoTercih(models.Model):
    """Her alıcı firma kendi vitrin adı ve ek marjını tutar."""

    class MarjTipi(models.TextChoices):
        TL = "TL", "TL (tutar)"
        YUZDE = "YUZDE", "Yüzde (%)"

    firma = models.OneToOneField(
        "firmalar.Firma",
        verbose_name="Firma",
        on_delete=models.CASCADE,
        related_name="piyasa_pano_tercih",
    )
    pano_baslik = models.CharField(
        "Pano başlığı",
        max_length=80,
        blank=True,
        default="",
        help_text="Boşsa firma adı kullanılır.",
    )
    marj_tipi = models.CharField(
        "Ek marj tipi",
        max_length=8,
        choices=MarjTipi.choices,
        default=MarjTipi.YUZDE,
    )
    alis_marj = models.DecimalField(
        "Ek alış marjı",
        max_digits=14,
        decimal_places=4,
        default=Decimal("0"),
        help_text="Platform nihai alışın üstüne (işaretli).",
    )
    satis_marj = models.DecimalField(
        "Ek satış marjı",
        max_digits=14,
        decimal_places=4,
        default=Decimal("0"),
        help_text="Platform nihai satışın üstüne (işaretli).",
    )
    guncelleme = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Firma pano tercihi"
        verbose_name_plural = "Firma pano tercihleri"

    def __str__(self):
        return f"pano@{self.firma_id} «{self.pano_baslik or 'firma.ad'}»"

    def clean(self):
        super().clean()
        from piyasa.services import hesap

        try:
            hesap.hesapla_cift(
                ham_alis=Decimal("1000"),
                ham_satis=Decimal("1000"),
                marj_modu=self.marj_tipi or hesap.YUZDE,
                alis_marj=self.alis_marj or 0,
                satis_marj=self.satis_marj or 0,
                yuvarlama_adimi=0,
                yuvarlama_yontemi=hesap.YAKIN,
            )
        except ValueError as exc:
            raise ValidationError({"__all__": str(exc)}) from exc

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def etkin_baslik(self) -> str:
        t = (self.pano_baslik or "").strip()
        if t:
            return t
        return (getattr(self.firma, "ad", None) or "").strip()
