from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


class Firma(models.Model):
    """Tenant firma — ADR-0003 + ADR-0033 genişletme.

    Boolean `alici_mi`/`tedarikci_mi`/`platform_mu` denormalize kalır (geriye uyum).
    Tip çokluluğu: `FirmaTipAtama`; tedarikçi alt tip: `FirmaTedarikciAltTip`.
    Durum SM: `durum` (servis); `onay_durumu`+`aktif` senkron tutulur.
    """

    ONAY = [("bekliyor", "Bekliyor"), ("onayli", "Onaylı"), ("reddedildi", "Reddedildi")]

    class Durum(models.TextChoices):
        TASLAK = "TASLAK", "Taslak"
        ONAY_BEKLIYOR = "ONAY_BEKLIYOR", "Onay bekliyor"
        AKTIF = "AKTIF", "Aktif"
        ASKIDA = "ASKIDA", "Askıda"
        REDDEDILDI = "REDDEDILDI", "Reddedildi"

    ad = models.CharField("Firma adı", max_length=150)
    unvan = models.CharField("Ticari unvan", max_length=200, blank=True)
    firma_kodu = models.CharField(
        "Firma kodu",
        max_length=32,
        unique=True,
        help_text="Değişmez iş anahtarı. Platform için PLATFORM.",
    )
    vergi_no = models.CharField(
        "Vergi no", max_length=11, unique=True, null=True, blank=True,
        validators=[RegexValidator(r"^\d{10,11}$", "10 veya 11 haneli rakam girin")],
    )
    vergi_dairesi = models.CharField("Vergi dairesi", max_length=80, blank=True)
    telefon = models.CharField("Telefon", max_length=20, blank=True)
    eposta = models.EmailField("E-posta", blank=True)
    mersis_no = models.CharField("MERSİS no", max_length=32, blank=True, default="")
    ticaret_sicil_no = models.CharField(
        "Ticaret sicil no", max_length=64, blank=True, default=""
    )
    oda_adi = models.CharField(
        "Oda adı",
        max_length=120,
        blank=True,
        default="",
        help_text="Kuyumcular Odası vb.",
    )
    oda_kayit_no = models.CharField(
        "Oda kayıt no", max_length=64, blank=True, default=""
    )
    web_sitesi = models.URLField("Web sitesi", blank=True, default="")
    vade_gun = models.PositiveIntegerField(
        "Vade (gün)",
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Ödeme vadesi günü. Kredi limiti SSOT: finans.CariHesap.kredi_limiti.",
    )

    alici_mi = models.BooleanField("Alıcı (müşteri)", default=False)
    tedarikci_mi = models.BooleanField("Tedarikçi", default=False)
    platform_mu = models.BooleanField("Platform (biz)", default=False)

    durum = models.CharField(
        "Durum",
        max_length=16,
        choices=Durum.choices,
        default=Durum.ONAY_BEKLIYOR,
        db_index=True,
    )
    # Legacy senkron (ADR-0033); yazma yalnız servis/migration
    onay_durumu = models.CharField(
        "Onay durumu", max_length=10, choices=ONAY, default="bekliyor"
    )
    aktif = models.BooleanField("Aktif", default=False)
    olusturma_zamani = models.DateTimeField(auto_now_add=True)
    guncelleme_zamani = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Firma"
        verbose_name_plural = "Firmalar"
        ordering = ["ad"]
        permissions = [
            ("approve_firma", "Firma onaylayabilir"),
            ("view_all_tenants", "Tüm firmaların verilerini görebilir"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["platform_mu"],
                condition=models.Q(platform_mu=True),
                name="tek_platform_firmasi",
            ),
        ]

    def clean(self):
        super().clean()
        if not self.pk:
            return

        from .kullanici import Kullanici

        assigned_roles = set(self.kullanicilar.exclude(rol="").values_list("rol", flat=True))
        errors = {}
        if assigned_roles.intersection(Kullanici.PLATFORM_ROLLERI) and not self.platform_mu:
            errors["platform_mu"] = "Bu firmaya atanmış platform rolleri var; önce kullanıcı rollerini taşıyın."
        if assigned_roles.intersection(Kullanici.ALICI_ROLLERI) and not self.alici_mi:
            errors["alici_mi"] = "Bu firmaya atanmış alıcı rolleri var; önce kullanıcı rollerini değiştirin."
        if assigned_roles.intersection(Kullanici.TEDARIKCI_ROLLERI) and not self.tedarikci_mi:
            errors["tedarikci_mi"] = "Bu firmaya atanmış tedarikçi rolleri var; önce kullanıcı rollerini değiştirin."
        if errors:
            raise ValidationError(errors)

    def sync_legacy_flags_from_durum(self):
        """durum → onay_durumu + aktif (denormalize)."""
        if self.durum == self.Durum.AKTIF:
            self.onay_durumu = "onayli"
            self.aktif = True
        elif self.durum == self.Durum.ASKIDA:
            self.onay_durumu = "onayli"
            self.aktif = False
        elif self.durum == self.Durum.REDDEDILDI:
            self.onay_durumu = "reddedildi"
            self.aktif = False
        else:
            # TASLAK / ONAY_BEKLIYOR
            self.onay_durumu = "bekliyor"
            self.aktif = False

    def save(self, *args, **kwargs):
        # Geriye uyum: test/admin eski stil (onay_durumu+aktif) → durum
        if getattr(self, "_sync_from_durum", False):
            self.sync_legacy_flags_from_durum()
        elif self.onay_durumu == "onayli" and self.aktif:
            self.durum = self.Durum.AKTIF
        elif self.onay_durumu == "onayli" and not self.aktif:
            self.durum = self.Durum.ASKIDA
        elif self.onay_durumu == "reddedildi":
            self.durum = self.Durum.REDDEDILDI
        elif self.onay_durumu == "bekliyor" and self.durum == self.Durum.TASLAK:
            pass
        elif self.onay_durumu == "bekliyor":
            if self.durum not in (self.Durum.TASLAK, self.Durum.ONAY_BEKLIYOR):
                self.durum = self.Durum.ONAY_BEKLIYOR
        super().save(*args, **kwargs)

    def __str__(self):
        return self.ad
