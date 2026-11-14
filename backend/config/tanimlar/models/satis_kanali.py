from django.db import models

from .taban import TanimTaban


class SatisKanali(TanimTaban):
    TIP_KUYUMCU_PORTAL = "KUYUMCU_PORTAL"
    TIP_B2B_API = "B2B_API"
    TIP_B2C_API = "B2C_API"
    TIP_CHOICES = [
        (TIP_KUYUMCU_PORTAL, "Kuyumcu Portal"),
        (TIP_B2B_API, "B2B API"),
        (TIP_B2C_API, "B2C API"),
    ]

    tip = models.CharField(
        "Kanal tipi",
        max_length=24,
        choices=TIP_CHOICES,
        default=TIP_KUYUMCU_PORTAL,
    )
    fiyat_grubu = models.ForeignKey(
        "tanimlar.FiyatGrubu",
        verbose_name="Fiyat grubu",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="satis_kanallari",
    )
    varsayilan_marj_kurali = models.ForeignKey(
        "piyasa.MarjKurali",
        verbose_name="Varsayılan marj kuralı",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="varsayilan_kanallar",
    )
    quote_ttl_saniye = models.PositiveIntegerField(
        "Quote TTL (sn)",
        null=True,
        blank=True,
        help_text="ADR-0008 B-03: kanal bazlı quote geçerliliği. Boşsa quote üretilmez (3.5).",
    )

    class Meta:
        verbose_name = "Satış kanalı"
        verbose_name_plural = "Satış kanalları"
        ordering = ["sira", "ad"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quote_ttl_saniye__isnull=True)
                | models.Q(quote_ttl_saniye__gt=0),
                name="satis_kanali_quote_ttl_pozitif",
            ),
        ]
