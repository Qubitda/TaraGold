"""OdemeKaydi — append-only ödeme / bağlantı kaydı (ADR-0001)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from finans.constants import KurKaynagi, OdemeTipi


class OdemeKaydiQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError(
            "OdemeKaydi değişmez; QuerySet.update yasak (ADR-0001)."
        )

    def delete(self):
        raise ValidationError(
            "OdemeKaydi değişmez; QuerySet.delete yasak (ADR-0001)."
        )


class OdemeKaydiManager(models.Manager.from_queryset(OdemeKaydiQuerySet)):
    def bulk_update(self, objs, fields, batch_size=None):
        raise ValidationError(
            "OdemeKaydi değişmez; bulk_update yasak (ADR-0001)."
        )


class OdemeKaydi(models.Model):
    """Ödeme cariye yazılır; sipariş referansı opsiyonel (A5)."""

    class Tip(models.TextChoices):
        HAS = OdemeTipi.HAS, "Has altın"
        HURDA = OdemeTipi.HURDA, "Hurda altın"
        TL = OdemeTipi.TL, "TL"
        USD = OdemeTipi.USD, "USD"

    class KurKaynagiChoices(models.TextChoices):
        CANLI = KurKaynagi.CANLI, "Canlı piyasa"
        MANUEL = KurKaynagi.MANUEL, "Manuel bağlantı"

    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.PROTECT,
        related_name="odeme_kayitlari",
        help_text="Ödemeyi yapan / bakiyesi etkilenen alıcı.",
    )
    order = models.ForeignKey(
        "siparis.Order",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="odeme_kayitlari",
        help_text="Opsiyonel referans; cari kapanışı siparişten bağımsızdır.",
    )
    tip = models.CharField(max_length=8, choices=Tip.choices)
    brut_gram = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    olculen_milyem = models.DecimalField(
        max_digits=6, decimal_places=4, null=True, blank=True
    )
    has_karsiligi = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        default=0,
        help_text="HAS/HURDA/TL→HAS karşılığı; USD ödemede 0 olabilir.",
    )
    tl_tutar = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    usd_tutar = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    kur_has_birim_fiyat = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Has birim veya döviz (USD) birim fiyat snapshot.",
    )
    doviz_kuru_gozlem = models.ForeignKey(
        "tanimlar.DovizKuru",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="odeme_kayitlari",
    )
    kur_kaynagi = models.CharField(
        max_length=8, choices=KurKaynagiChoices.choices, blank=True, default=""
    )
    kur_zamani = models.DateTimeField(null=True, blank=True)
    metal_kuru_gozlem = models.ForeignKey(
        "tanimlar.MetalKuru",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="odeme_kayitlari",
    )
    manuel_kur_gerekce = models.CharField(max_length=255, blank=True, default="")
    dekont_ref = models.CharField(max_length=120, blank=True, default="")
    idempotency_key = models.CharField(max_length=64)
    ledger_entry_idler = models.JSONField(default=list, blank=True)
    olusturan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="olusturdugu_odeme_kayitlari",
    )
    olusturma_tarihi = models.DateTimeField(default=timezone.now)

    objects = OdemeKaydiManager()

    class Meta:
        verbose_name = "Ödeme kaydı"
        verbose_name_plural = "Ödeme kayıtları"
        ordering = ["-olusturma_tarihi", "-pk"]
        indexes = [
            models.Index(fields=["firma", "-olusturma_tarihi"]),
            models.Index(fields=["tip", "-olusturma_tarihi"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["firma", "idempotency_key"],
                name="odemekaydi_firma_idempotency_uniq",
            ),
            models.CheckConstraint(
                condition=models.Q(tip__in=["HAS", "HURDA", "TL", "USD"]),
                name="odemekaydi_tip_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(has_karsiligi__gte=0),
                name="odemekaydi_has_karsiligi_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(tip__in=["HAS", "HURDA", "TL"])
                    | models.Q(has_karsiligi__gt=0)
                ),
                name="odemekaydi_altin_tl_has_pozitif",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(tip="USD")
                    | (
                        models.Q(usd_tutar__isnull=False)
                        | models.Q(tl_tutar__isnull=False)
                    )
                ),
                name="odemekaydi_usd_alanlari",
            ),
            # TL → tl_tutar + kur zorunlu
            models.CheckConstraint(
                condition=(
                    ~models.Q(tip="TL")
                    | (
                        models.Q(tl_tutar__isnull=False)
                        & models.Q(kur_has_birim_fiyat__isnull=False)
                        & models.Q(kur_kaynagi__in=["CANLI", "MANUEL"])
                    )
                ),
                name="odemekaydi_tl_alanlari",
            ),
            # HAS/HURDA → brut_gram zorunlu; HURDA'da milyem zorunlu
            models.CheckConstraint(
                condition=(
                    ~models.Q(tip__in=["HAS", "HURDA"])
                    | models.Q(brut_gram__isnull=False)
                ),
                name="odemekaydi_altin_brut_gram",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(tip="HURDA") | models.Q(olculen_milyem__isnull=False)
                ),
                name="odemekaydi_hurda_milyem",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"Odeme#{self.pk or '?'} {self.tip} "
            f"has={self.has_karsiligi} F{self.firma_id}"
        )

    def clean(self):
        super().clean()
        if self.tip != self.Tip.USD and self.has_karsiligi is not None and self.has_karsiligi <= 0:
            raise ValidationError(
                {"has_karsiligi": "Has karşılığı pozitif olmalı."}
            )
        if self.tip == self.Tip.USD:
            if (self.usd_tutar is None or self.usd_tutar <= 0) and (
                self.tl_tutar is None or self.tl_tutar <= 0
            ):
                raise ValidationError(
                    {"usd_tutar": "USD ödemede usd_tutar veya tl_tutar zorunlu."}
                )
        if self.tip == self.Tip.TL:
            if self.tl_tutar is None or self.tl_tutar <= 0:
                raise ValidationError({"tl_tutar": "TL ödemede tutar zorunlu."})
            if self.kur_has_birim_fiyat is None or self.kur_has_birim_fiyat <= 0:
                raise ValidationError(
                    {"kur_has_birim_fiyat": "TL ödemede kur zorunlu."}
                )
        if self.tip in (self.Tip.HAS, self.Tip.HURDA):
            if self.brut_gram is None or self.brut_gram <= 0:
                raise ValidationError({"brut_gram": "Altın ödemede gram zorunlu."})
        if self.tip == self.Tip.HURDA:
            if self.olculen_milyem is None or self.olculen_milyem <= 0:
                raise ValidationError(
                    {"olculen_milyem": "Hurdada ölçülen milyem zorunlu."}
                )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "OdemeKaydi değişmez; UPDATE yasak (ADR-0001)."
            )
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("OdemeKaydi silinemez; CONTRA kullanın.")
