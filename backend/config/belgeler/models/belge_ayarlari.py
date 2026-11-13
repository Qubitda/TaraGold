"""BelgeAyarlari — Proforma ve İrsaliye metinleri için yönetilebilir tekil ayar (ADR-0036)."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class BelgeAyarlari(models.Model):
    proforma_disclaimer = models.CharField(
        max_length=255,
        default="Resmi fatura yerine geçmez.",
        help_text="Proforma üzerinde zorunlu bilgilendirme metni.",
    )
    irsaliye_baslik = models.CharField(
        max_length=120,
        default="İrsaliye",
        help_text="Sevk belgesi başlığı (varsayılan: İrsaliye).",
    )
    irsaliye_alt_metin = models.CharField(
        max_length=255,
        default="Hukuki geçerliliği mali müşavir teyidine tabidir.",
        help_text="Sevk belgesi alt notu.",
    )
    guncelleyen = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="guncelledigi_belge_ayarlari",
    )
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Belge ayarları"
        verbose_name_plural = "Belge ayarları"

    def __str__(self) -> str:
        return f"BelgeAyarlari#{self.pk or 1} ({self.irsaliye_baslik})"

    @classmethod
    def get_solo(cls) -> "BelgeAyarlari":
        defaults = {
            "proforma_disclaimer": str(
                getattr(settings, "PROFORMA_DISCLAIMER", "")
                or "Resmi fatura yerine geçmez."
            )[:255],
            "irsaliye_baslik": str(
                getattr(settings, "IRSALIYE_BASLIK", "") or "İrsaliye"
            )[:120],
            "irsaliye_alt_metin": str(
                getattr(settings, "IRSALIYE_ALT_METIN", "")
                or "Hukuki geçerliliği mali müşavir teyidine tabidir."
            )[:255],
        }
        obj, _ = cls.objects.get_or_create(pk=1, defaults=defaults)
        return obj
