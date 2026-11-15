"""HazirlamaEmri — tedarikçi emri + teyit + tip (ADR-0001 v2 / ADR-0036)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class HazirlamaEmri(models.Model):
    """Sipariş onayında bileşen tedarikçisine emir; alıcı kimliği yok."""

    class Durum(models.TextChoices):
        TEDARIK_BEKLIYOR = "TEDARIK_BEKLIYOR", "Tedarikçi teyidi bekleniyor"
        HAZIRLANIYOR = "HAZIRLANIYOR", "Hazırlanıyor"
        HAZIR = "HAZIR", "Hazır"
        REDDEDILDI = "REDDEDILDI", "Tedarikçi reddetti"
        IPTAL = "IPTAL", "İptal"

    class Tip(models.TextChoices):
        HAM_ALTIN = "HAM_ALTIN", "Ham altın"
        MONTUR = "MONTUR", "Montür"
        TAS = "TAS", "Taş"
        CAKIM = "CAKIM", "Çakım"

    class TeslimModeli(models.TextChoices):
        PLATFORM_QC = "PLATFORM_QC", "Platform üzerinden QC"
        DOGRUDAN = "DOGRUDAN", "Tedarikçiden doğrudan"

    order = models.ForeignKey(
        "siparis.Order",
        on_delete=models.PROTECT,
        related_name="hazirlama_emirleri",
    )
    tedarikci_firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.PROTECT,
        related_name="hazirlama_emirleri",
    )
    tip = models.CharField(
        max_length=12, choices=Tip.choices, default=Tip.MONTUR, db_index=True
    )
    durum = models.CharField(
        max_length=20, choices=Durum.choices, default=Durum.TEDARIK_BEKLIYOR
    )
    teslim_modeli = models.CharField(
        max_length=16,
        choices=TeslimModeli.choices,
        default=TeslimModeli.PLATFORM_QC,
    )
    fiyat_degisti = models.BooleanField(
        default=False,
        help_text="Teyitte fiyat değişti; ops onayı gerekir.",
    )
    teyit_notu = models.CharField(max_length=255, blank=True, default="")
    order_line = models.ForeignKey(
        "siparis.OrderLine",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hazirlama_emirleri",
    )
    bilesen = models.ForeignKey(
        "urunler.VaryantBilesen",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hazirlama_emirleri",
    )
    hazir_zamani = models.DateTimeField(null=True, blank=True)
    hazir_isaretleyen = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hazirladigi_emirler",
    )
    olusturma_tarihi = models.DateTimeField(auto_now_add=True)
    guncelleme_tarihi = models.DateTimeField(auto_now=True)

    _allow_status_transition = False

    class Meta:
        verbose_name = "Hazırlama emri"
        verbose_name_plural = "Hazırlama emirleri"
        ordering = ["-olusturma_tarihi", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "tedarikci_firma", "tip"],
                name="hazirlamaemri_order_tedarikci_tip_uniq",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    durum__in=[
                        "TEDARIK_BEKLIYOR",
                        "HAZIRLANIYOR",
                        "HAZIR",
                        "REDDEDILDI",
                        "IPTAL",
                    ]
                ),
                name="hazirlamaemri_durum_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    tip__in=["HAM_ALTIN", "MONTUR", "TAS", "CAKIM"]
                ),
                name="hazirlamaemri_tip_gecerli",
            ),
            models.CheckConstraint(
                condition=models.Q(teslim_modeli__in=["PLATFORM_QC", "DOGRUDAN"]),
                name="hazirlamaemri_teslim_modeli_gecerli",
            ),
        ]
        indexes = [
            models.Index(fields=["tedarikci_firma", "durum"]),
            models.Index(fields=["order", "durum"]),
            models.Index(fields=["order", "tip"]),
        ]

    def __str__(self) -> str:
        return (
            f"HE#{self.pk or '?'} O#{self.order_id} "
            f"{self.tip} T#{self.tedarikci_firma_id} {self.durum}"
        )

    def clean(self):
        super().clean()
        firma = getattr(self, "tedarikci_firma", None)
        if firma is not None and not getattr(firma, "tedarikci_mi", False):
            raise ValidationError(
                {"tedarikci_firma": "Hazırlama emri yalnız tedarikçi firmaya açılır."}
            )

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.full_clean()
            return super().save(*args, **kwargs)
        if self._allow_status_transition:
            update_fields = kwargs.get("update_fields")
            allowed = {
                "durum",
                "hazir_zamani",
                "hazir_isaretleyen",
                "teslim_modeli",
                "fiyat_degisti",
                "teyit_notu",
                "tedarikci_firma",
                "guncelleme_tarihi",
            }
            if update_fields is not None and set(update_fields) <= allowed:
                return super().save(*args, **kwargs)
            raise ValidationError(
                "HazirlamaEmri güncellemesi yalnız izinli geçiş alanlarıyla yapılır."
            )
        raise ValidationError(
            "HazirlamaEmri değişmez; geçiş yalnız order_onay_servisi ile."
        )

    def delete(self, *args, **kwargs):
        raise ValidationError("HazirlamaEmri silinemez.")
