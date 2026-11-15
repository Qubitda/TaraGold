from django.db import models


class UrunGorsel(models.Model):
    """Ürün / varyant galeri satırı — ADR-0037 P0."""

    TIP = [
        ("kapak", "Kapak"),
        ("galeri", "Galeri"),
        ("detay", "Detay / yakın plan"),
        ("video", "Video"),
    ]

    urun = models.ForeignKey(
        "urunler.Urun",
        verbose_name="Ürün",
        related_name="gorseller",
        on_delete=models.CASCADE,
    )
    varyant = models.ForeignKey(
        "urunler.Varyant",
        verbose_name="Varyant",
        related_name="gorseller",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        help_text="Boşsa ürün düzeyinde görsel.",
    )
    dosya = models.ImageField(
        "Dosya", upload_to="urunler/gorseller/", blank=True, null=True
    )
    harici_url = models.URLField(
        "Harici URL",
        max_length=500,
        blank=True,
        default="",
        help_text="Video veya harici medya bağlantısı (dosya yoksa).",
    )
    tip = models.CharField("Tip", max_length=16, choices=TIP, default="galeri")
    sira = models.PositiveIntegerField("Sıra", default=0)
    kapak = models.BooleanField("Kapak", default=False)
    alt_metin = models.CharField("Alt metin", max_length=255, blank=True)
    olusturma_zamani = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ürün görseli"
        verbose_name_plural = "Ürün görselleri"
        ordering = ["urun_id", "sira", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["urun"],
                condition=models.Q(kapak=True, varyant__isnull=True),
                name="urun_gorsel_tek_urun_kapak",
            ),
        ]

    def __str__(self):
        return f"{self.urun_id}:{self.tip}:{self.pk}"
