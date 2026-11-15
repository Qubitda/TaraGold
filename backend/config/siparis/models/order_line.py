"""OrderLine — has-gram borç + yaklaşık TL (ADR-0001)."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from siparis.birim_constants import SepetBirimi


class OrderLine(models.Model):
    """Gönderimde tahmini has/TL; onayda has_gram + tl_borc kesinleşir (ADR-0001)."""

    order = models.ForeignKey(
        "siparis.Order",
        on_delete=models.PROTECT,
        related_name="lines",
    )
    varyant = models.ForeignKey(
        "urunler.Varyant",
        on_delete=models.PROTECT,
        related_name="order_lines",
    )
    price_lock = models.OneToOneField(
        "fiyatlama.PriceLock",
        on_delete=models.PROTECT,
        related_name="order_line",
        null=True,
        blank=True,
        help_text="Legacy; yeni siparişlerde boş.",
    )
    stock_reservation = models.OneToOneField(
        "stok.StockReservation",
        on_delete=models.PROTECT,
        related_name="order_line",
        null=True,
        blank=True,
        help_text="Onayda doldurulur; gönderimde boş.",
    )
    price_quote = models.ForeignKey(
        "fiyatlama.PriceQuote",
        on_delete=models.PROTECT,
        related_name="order_lines",
        null=True,
        blank=True,
    )
    miktar = models.DecimalField(max_digits=18, decimal_places=6)
    birim = models.CharField(max_length=8, choices=SepetBirimi.CHOICES)

    # ADR-0001 metal / işçilik snapshot (gönderim)
    gram_toplam = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Brüt gram toplamı.",
    )
    tas_agirligi = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, default=None
    )
    net_altin_gram = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="gram_toplam − tas_agirligi (has hesabı).",
    )
    milyem = models.DecimalField(
        max_digits=6, decimal_places=4, null=True, blank=True
    )
    iscilik_birimi = models.CharField(
        max_length=3,
        blank=True,
        default="TL",
        help_text="TL|HAS — sipariş anı snapshot.",
    )
    tahmini_has_gram = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    # Onayda kesin
    has_gram = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    tl_borc = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Metal-dışı TRY borç (işçilik TL + taş TL + ek).",
    )
    usd_borc = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Taş USD borç (onayda kesin).",
    )

    # Yaklaşık / legacy TL bilgi alanları
    tahmini_birim_fiyat_vergisiz = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    tahmini_satir_tutari_vergisiz = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    snapshot_birim_fiyat_vergisiz = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    snapshot_satir_tutari_vergisiz = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    para_birimi = models.CharField(max_length=3)

    class TeslimModeli(models.TextChoices):
        PLATFORM_QC = "PLATFORM_QC", "Platform üzerinden QC"
        DOGRUDAN = "DOGRUDAN", "Tedarikçiden doğrudan"

    teslim_modeli = models.CharField(
        max_length=16,
        choices=TeslimModeli.choices,
        default=TeslimModeli.PLATFORM_QC,
    )
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)

    _allow_kesin_write = False

    class Meta:
        verbose_name = "Sipariş satırı"
        verbose_name_plural = "Sipariş satırları"
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(miktar__gt=0),
                name="orderline_miktar_pozitif",
            ),
            models.CheckConstraint(
                condition=models.Q(birim__in=["ADET", "GRAM", "KARAT"]),
                name="orderline_birim_gecerli",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(snapshot_birim_fiyat_vergisiz__isnull=True)
                    | models.Q(snapshot_birim_fiyat_vergisiz__gte=0)
                ),
                name="orderline_birim_fiyat_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(snapshot_satir_tutari_vergisiz__isnull=True)
                    | models.Q(snapshot_satir_tutari_vergisiz__gte=0)
                ),
                name="orderline_satir_tutar_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tahmini_birim_fiyat_vergisiz__isnull=True)
                    | models.Q(tahmini_birim_fiyat_vergisiz__gte=0)
                ),
                name="orderline_tahmini_birim_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tahmini_satir_tutari_vergisiz__isnull=True)
                    | models.Q(tahmini_satir_tutari_vergisiz__gte=0)
                ),
                name="orderline_tahmini_satir_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(has_gram__isnull=True) | models.Q(has_gram__gte=0)
                ),
                name="orderline_has_gram_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tahmini_has_gram__isnull=True)
                    | models.Q(tahmini_has_gram__gte=0)
                ),
                name="orderline_tahmini_has_gram_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(tl_borc__isnull=True) | models.Q(tl_borc__gte=0)
                ),
                name="orderline_tl_borc_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(usd_borc__isnull=True) | models.Q(usd_borc__gte=0)
                ),
                name="orderline_usd_borc_negatif_degil",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(milyem__isnull=True)
                    | (models.Q(milyem__gt=0) & models.Q(milyem__lte=1))
                ),
                name="orderline_milyem_oran",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"OL#{self.pk or '?'} O#{self.order_id} "
            f"{self.miktar} {self.birim}"
        )

    def clean(self):
        super().clean()
        if self.miktar is not None and self.miktar <= 0:
            raise ValidationError({"miktar": "Miktar pozitif olmalı."})
        if self.price_lock_id and self.order_id:
            if self.price_lock.alici_firma_id != self.order.alici_firma_id:
                raise ValidationError(
                    {"price_lock": "Lock, sipariş firmasına ait olmalı."}
                )

    def save(self, *args, **kwargs):
        if not self._state.adding and not self._allow_kesin_write:
            raise ValidationError(
                "OrderLine değişmez; kesin alanlar yalnız onay yolundan (ADR-0001)."
            )
        self.full_clean()
        return super().save(*args, **kwargs)

    def write_kesin(
        self,
        *,
        has_gram=None,
        tl_borc=None,
        usd_borc=None,
        birim_fiyat=None,
        satir_tutar=None,
        stock_reservation=None,
        update_fields=None,
    ):
        """Onay yolu — has_gram / tl_borc / usd_borc (+ bilgi snapshot TL)."""
        fields: list[str] = []
        if has_gram is not None:
            self.has_gram = has_gram
            fields.append("has_gram")
        if tl_borc is not None:
            self.tl_borc = tl_borc
            fields.append("tl_borc")
        if usd_borc is not None:
            self.usd_borc = usd_borc
            fields.append("usd_borc")
        if birim_fiyat is not None:
            self.snapshot_birim_fiyat_vergisiz = birim_fiyat
            fields.append("snapshot_birim_fiyat_vergisiz")
        if satir_tutar is not None:
            self.snapshot_satir_tutari_vergisiz = satir_tutar
            fields.append("snapshot_satir_tutari_vergisiz")
        if stock_reservation is not None:
            self.stock_reservation = stock_reservation
            fields.append("stock_reservation")
        if update_fields:
            fields = list(update_fields)
        if not fields:
            return
        self._allow_kesin_write = True
        try:
            self.save(update_fields=fields)
        finally:
            self._allow_kesin_write = False

    def delete(self, *args, **kwargs):
        raise ValidationError("OrderLine silinemez.")
