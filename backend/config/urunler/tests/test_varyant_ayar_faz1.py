"""FAZ 1 — Varyant.ayar metal zorunlu / TAS muaf; unique (urun, renk, beden, ayar)."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from tanimlar.models import AyarMilyem, FiyatGrubu, KiymetliMetal
from urunler.models import Kategori, Renk, Varyant
from urunler.services.katalog_yazma_servisi import taslak_urun_olustur, varyant_ekle

User = get_user_model()


class VaryantAyarFaz1Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        cls.platform = Firma.objects.get(platform_mu=True)
        cls.ted = Firma.objects.create(
            ad="AyarTed", firma_kodu="AYRTD", tedarikci_mi=True, aktif=True
        )
        cls.ops = User.objects.create_user(
            username="ayar_ops",
            password="x",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)
        metal = KiymetliMetal.objects.create(kod="AU_AY", ad="Altın AY", gram_bazli=True)
        cls.ayar14 = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="14AY", ayar_degeri="14", milyem=Decimal("0.585")
        )
        cls.ayar18 = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="18AY", ayar_degeri="18", milyem=Decimal("0.750")
        )
        fg = FiyatGrubu.objects.create(kod="GENEL_AY", ad="Genel AY")
        cls.kat = Kategori.objects.create(kod="YUZUK_AY", ad="Yüzük AY", fiyat_grubu=fg)
        cls.renk = Renk.objects.create(kod="SAR_AY", ad="Sarı AY", sira=1)

    def _urun(self, **kw):
        return taslak_urun_olustur(
            actor=self.ops,
            ad=kw.pop("ad", "Metal urun"),
            kategori_id=self.kat.pk,
            ayar_id=self.ayar14.pk,
            sahiplik_firma_id=self.ted.pk,
            **kw,
        )

    def test_metal_defaults_to_urun_ayar(self):
        urun = self._urun()
        v = varyant_ekle(actor=self.ops, urun=urun, gram="2.000")
        self.assertEqual(v.ayar_id, self.ayar14.pk)

    def test_metal_explicit_ayar(self):
        urun = self._urun()
        v = varyant_ekle(
            actor=self.ops, urun=urun, gram="2.000", ayar_id=self.ayar18.pk
        )
        self.assertEqual(v.ayar_id, self.ayar18.pk)

    def test_tas_ayar_null(self):
        urun = self._urun()
        v = varyant_ekle(
            actor=self.ops,
            urun=urun,
            tip="TAS",
            karat="1.000",
            sabit_fiyat="100.00",
            ayar_id=self.ayar14.pk,
        )
        self.assertIsNone(v.ayar_id)

    def test_same_renk_beden_different_ayar_ok(self):
        urun = self._urun(renk_ekseni=True)
        varyant_ekle(
            actor=self.ops,
            urun=urun,
            gram="1.000",
            renk_id=self.renk.pk,
            ayar_id=self.ayar14.pk,
        )
        v2 = varyant_ekle(
            actor=self.ops,
            urun=urun,
            gram="1.100",
            renk_id=self.renk.pk,
            ayar_id=self.ayar18.pk,
        )
        self.assertEqual(v2.ayar_id, self.ayar18.pk)

    def test_duplicate_metal_axes_rejected(self):
        urun = self._urun()
        varyant_ekle(actor=self.ops, urun=urun, gram="1.000", ayar_id=self.ayar14.pk)
        with self.assertRaises((ValidationError, IntegrityError)):
            with transaction.atomic():
                varyant_ekle(
                    actor=self.ops, urun=urun, gram="1.200", ayar_id=self.ayar14.pk
                )

    def test_db_check_blocks_metal_null_ayar(self):
        """save() ürün ayarını doldurur; bulk_create DB check'i doğrular."""
        urun = self._urun()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Varyant.objects.bulk_create(
                    [
                        Varyant(
                            urun=urun,
                            tip=Varyant.Tip.HAM_ALTIN,
                            gram=Decimal("1.000"),
                            ayar=None,
                        )
                    ]
                )
