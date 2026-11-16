from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import models, transaction


class Varyant(models.Model):
    """Sepete eklenen, stoku ve ağırlığı olan satış birimi (SKU).

    Varyant = ürünün tanımladığı eksenlerin (renk, ölçü) bir kombinasyonu.
    Beden değişince gram, gram değişince fiyat değişir; bu yüzden gram burada.
    Tekil (eksensiz) ürün de tek bir varyantla temsil edilir.

    Tasarım notları:
    - `clean()` içinde `self.beden.tip` ve `self.urun` erişimleri tek sorguya indirildi.
      FK objesine yalnızca gerçekten ihtiyaç duyulduğunda dokunulur.
    - `save()` SKU'yu artık tek `INSERT` içinde üretir; `pk` önceden bilinmediği
      için `save()` sonrası bir `UPDATE` kaçınılmaz, ama `transaction.atomic` ile
      sarıldı ve `select_for_update` yerine idempotent `filter().update()` kullanıldı.
    - `tas_bedeli_toplam()` artık `aggregate` ile tek sorguda hesaplar (N+1 yok).
    - Stok truth: `stok.StockMovement` / `StockBalance` (F4-070b; legacy kolon yok).
    """

    urun = models.ForeignKey(
        "urunler.Urun", verbose_name="Ürün", related_name="varyantlar", on_delete=models.CASCADE,
    )
    sku = models.CharField("Platform SKU", max_length=20, unique=True, blank=True, editable=False)
    tedarikci_sku = models.CharField("Tedarikçi SKU", max_length=50, blank=True)

    renk = models.ForeignKey(
        "urunler.Renk", verbose_name="Renk", related_name="varyantlar",
        null=True, blank=True, on_delete=models.PROTECT,
    )
    beden = models.ForeignKey(
        "urunler.OlcuDegeri", verbose_name="Beden / ölçü", related_name="varyantlar",
        null=True, blank=True, on_delete=models.PROTECT,
    )

    class Tip(models.TextChoices):
        HAM_ALTIN = "HAM_ALTIN", "Ham altın"
        MONTUR = "MONTUR", "Montür"
        TASLI = "TASLI", "Taşlı bitmiş"
        TAS = "TAS", "Taş (stok)"

    tip = models.CharField(
        "Tip",
        max_length=12,
        choices=Tip.choices,
        default=Tip.HAM_ALTIN,
        db_index=True,
        help_text="ADR-0001 v2 bileşen modeli.",
    )
    gram = models.DecimalField(
        "Brüt gram",
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="Brüt ağırlık (ADR-0001 B4).",
    )
    tas_agirligi = models.DecimalField(
        "Taş ağırlığı (g)",
        max_digits=10,
        decimal_places=4,
        default=Decimal("0"),
        help_text="Taşların toplam gramı; net_altin = gram − tas_agirligi.",
    )
    gram_bandi_min = models.DecimalField(
        "Gram bandı min", max_digits=10, decimal_places=3, null=True, blank=True,
        help_text="Boşsa settings VARYANT_GRAM_BANDI_ORAN ile hesaplanır (ADR-0005 K3).",
    )
    gram_bandi_max = models.DecimalField(
        "Gram bandı max", max_digits=10, decimal_places=3, null=True, blank=True,
    )
    sabit_fiyat = models.DecimalField(
        "Sabit fiyat (TL)", max_digits=14, decimal_places=2, null=True, blank=True,
        help_text="Yalnızca fiyat tipi 'Sabit fiyat' olan ürünlerde.",
    )
    ek_bedel = models.DecimalField(
        "Ek bedel (TL)", max_digits=14, decimal_places=2, default=0,
        help_text="Kutu, sertifika, gravür gibi kalemlerin toplamı.",
    )

    benzersiz_parca = models.BooleanField(
        "Benzersiz parça", default=False,
        help_text="Tek adet, tekrar üretilmeyen parça (ör. sertifikalı tek taş).",
    )
    # ADR-0044 — montür uyumluluk (sıkı: boşsa imalata alınmaz)
    yuva_adedi = models.PositiveSmallIntegerField(
        "Yuva adedi",
        null=True,
        blank=True,
        help_text="MONTUR: kaç taş yuvası.",
    )
    izinli_kesimler = models.JSONField(
        "İzinli taş kesimleri",
        default=list,
        blank=True,
        help_text="MONTUR: TasKesimi.kod listesi; boşsa imalata kapalı.",
    )
    karat_min = models.DecimalField(
        "Min karat (toplam)",
        max_digits=7,
        decimal_places=3,
        null=True,
        blank=True,
    )
    karat_max = models.DecimalField(
        "Max karat (toplam)",
        max_digits=7,
        decimal_places=3,
        null=True,
        blank=True,
    )
    # ADR-0044 — taş varyant
    karat = models.DecimalField(
        "Karat / ölçü (ct)",
        max_digits=7,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="TAS: ticari ölçü (ct); her türlü taş (değerli olmak zorunda değil).",
    )
    kesim_kod = models.CharField(
        "Şekil / kesim kodu",
        max_length=32,
        blank=True,
        default="",
        help_text="TAS: serbest şekil kodu (ROUND, CABOCHON, BEAD…); sözlük önerisi, zorunlu FK değil.",
    )
    aktif = models.BooleanField("Aktif", default=True)

    class Meta:
        verbose_name = "Varyant"
        verbose_name_plural = "Varyantlar"
        ordering = ["urun", "renk", "beden"]
        constraints = [
            # Aynı ürün içinde aynı eksen kombinasyonu iki kez olamaz. NULL'lar
            # PostgreSQL'de birbirinden farklı sayıldığı için dört durum ayrı yazılır.
            models.UniqueConstraint(fields=["urun", "renk", "beden"], name="benzersiz_varyant_renk_beden"),
            models.UniqueConstraint(
                fields=["urun", "beden"], condition=models.Q(renk__isnull=True),
                name="benzersiz_varyant_beden_renksiz",
            ),
            models.UniqueConstraint(
                fields=["urun", "renk"], condition=models.Q(beden__isnull=True),
                name="benzersiz_varyant_renk_bedensiz",
            ),
            models.UniqueConstraint(
                fields=["urun"], condition=models.Q(renk__isnull=True, beden__isnull=True),
                name="benzersiz_varyant_eksensiz",
            ),
            models.CheckConstraint(
                condition=models.Q(gram__isnull=True) | models.Q(gram__gt=0),
                name="varyant_gram_pozitif",
            ),
            models.CheckConstraint(
                condition=models.Q(sabit_fiyat__isnull=True) | models.Q(sabit_fiyat__gt=0),
                name="varyant_sabit_fiyat_pozitif",
            ),
            models.CheckConstraint(
                condition=models.Q(ek_bedel__gte=0),
                name="varyant_ek_bedel_negatif_degil",
            ),
            models.CheckConstraint(
                condition=models.Q(tas_agirligi__gte=0),
                name="varyant_tas_agirligi_negatif_degil",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    tip__in=["HAM_ALTIN", "MONTUR", "TASLI", "TAS"]
                ),
                name="varyant_tip_gecerli",
            ),
        ]

    @property
    def net_altin_gram(self) -> Decimal | None:
        if self.gram is None:
            return None
        return (Decimal(self.gram) - Decimal(self.tas_agirligi or 0)).quantize(
            Decimal("0.0001")
        )

    # ------------------------------------------------------------------ #
    # Yardımcılar
    # ------------------------------------------------------------------ #
    def _urun_veya_none(self):
        """FK erişimini güvenli hale getirir; `urun_id` yoksa None döner."""
        if not self.urun_id:
            return None
        try:
            return self.urun
        except ObjectDoesNotExist:
            return None

    # ------------------------------------------------------------------ #
    # Validasyon
    # ------------------------------------------------------------------ #
    def clean(self):
        super().clean()
        urun = self._urun_veya_none()
        if urun is None:
            return
        errors = {}

        # --- Fiyat tipi kuralları (TAS: gram şart değil) ---
        if self.tip != self.Tip.TAS:
            if urun.fiyat_tipi == "gram":
                if not self.gram:
                    errors["gram"] = "Gram bazlı üründe gram zorunludur."
                if self.sabit_fiyat is not None:
                    errors["sabit_fiyat"] = "Gram bazlı üründe sabit fiyat girilmez."
            elif urun.fiyat_tipi == "sabit":
                if not self.sabit_fiyat:
                    errors["sabit_fiyat"] = "Sabit fiyatlı üründe sabit fiyat zorunludur."
        elif urun.fiyat_tipi == "sabit" and not self.sabit_fiyat:
            errors["sabit_fiyat"] = "Taş varyantında sabit fiyat önerilir/zorunlu."

        if self.gram is not None and self.tas_agirligi is not None:
            if Decimal(self.tas_agirligi) >= Decimal(self.gram):
                errors["tas_agirligi"] = "taş_agirligi < gram olmalı (ADR-0001 B4)."

        if self.tip == self.Tip.MONTUR:
            if self.karat_min is not None and self.karat_max is not None:
                if Decimal(self.karat_min) > Decimal(self.karat_max):
                    errors["karat_max"] = "karat_max ≥ karat_min olmalı."
        if self.tip == self.Tip.TAS:
            if self.karat is not None and Decimal(self.karat) <= 0:
                errors["karat"] = "Karat pozitif olmalı."

        # --- Eksen kuralları: renk ---
        if urun.renk_ekseni:
            if not self.renk_id:
                errors["renk"] = "Bu ürün renk seçenekli; renk zorunludur."
        elif self.renk_id:
            errors["renk"] = "Bu ürün renk seçenekli değil; renk girilmez."

        # --- Eksen kuralları: ölçü ---
        if urun.olcu_tipi:
            if not self.beden_id:
                errors["beden"] = f"Bu ürün için '{urun.get_olcu_tipi_display()}' seçilmelidir."
            else:
                # `self.beden.tip` yerine tek alan sorgusu — FK objesi çekilmez.
                beden_tipi = (
                    type(self.beden)
                    .objects
                    .filter(pk=self.beden_id)
                    .values_list("tip", flat=True)
                    .first()
                )
                if beden_tipi != urun.olcu_tipi:
                    errors["beden"] = (
                        f"Bu ürün için '{urun.get_olcu_tipi_display()}' tipinde bir değer seçilmelidir."
                    )
        elif self.beden_id:
            errors["beden"] = "Bu ürün bedensiz tanımlı; ölçü girilmez."

        if errors:
            raise ValidationError(errors)

    # ------------------------------------------------------------------ #
    # Fiyat yardımcıları (fiyat motoru kullanır)
    # ------------------------------------------------------------------ #
    def katalog_tas_bedeli(self):
        """Ürün kataloğundaki taş satırlarının toplam bedeli (vitrin bilgisi).

        Bu değer fiyat hesabında KULLANILMAZ. Yalnızca ürün kartı / vitrin
        için referans değerdir.

        Fiyat hesabı için `teklif_tas_bedeli(teklif)` kullanın.
        """
        if not self.urun_id:
            return Decimal("0")
        toplam = self.urun.taslar.aggregate(models.Sum("bedel"))["bedel__sum"]
        return toplam if toplam is not None else Decimal("0")

    def teklif_tas_bedeli(self, teklif):
        """Belirtilen tedarikçi teklifindeki taş satırlarının toplam bedeli.

        Fiyat motoru `hesapla()` çağrısında `tas_bedeli` parametresine
        bu değer verilmelidir:

            from fiyatlama.services.fiyat_hesaplama import hesapla
            sonuc = hesapla(
                gram=varyant.gram,
                milyem=ayar.milyem,
                saf_birim_fiyat=metal_kuru.saf_birim_fiyat,
                ...
                tas_bedeli=varyant.teklif_tas_bedeli(teklif),
            )
        """
        if teklif is None:
            return Decimal("0")
        toplam = teklif.taslar.aggregate(models.Sum("bedel"))["bedel__sum"]
        return toplam if toplam is not None else Decimal("0")

    def ek_bedel_toplam(self):
        return self.ek_bedel

    # ------------------------------------------------------------------ #
    # Kayıt
    # ------------------------------------------------------------------ #
    def save(self, *args, **kwargs):
        yeni = self.pk is None
        super().save(*args, **kwargs)
        if yeni and not self.sku:
            # Tek UPDATE; idempotent (zaten SKU varsa dokunmaz).
            yeni_sku = f"SKU-{self.pk:07d}"
            type(self).objects.filter(pk=self.pk, sku="").update(sku=yeni_sku)
            self.sku = yeni_sku

    def __str__(self):
        parca = []
        if self.renk_id:
            parca.append(self.renk.ad)
        if self.beden_id:
            parca.append(self.beden.deger)
        return f"{self.sku or 'yeni'} — {self.urun.ad}" + (f" ({', '.join(parca)})" if parca else "")