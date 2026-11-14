"""ADR-0037 P0 — hazirlik, bulk varyant, gorsel, fiyat onizleme."""

from decimal import Decimal
from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from firmalar import roles
from tanimlar.models import AyarMilyem, KiymetliMetal
from urunler.models import Kategori, Renk, OlcuDegeri, Urun, Varyant
from urunler.services import (
    gorsel_ekle,
    ops_fiyat_onizleme,
    taslak_urun_olustur,
    urun_hazirlik_durumu,
    varyant_ekle,
    varyant_toplu_ekle,
)
from urunler.services.onay_servisi import onaya_gonder
from django.contrib.auth import get_user_model

User = get_user_model()


def _png():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color=(200, 160, 40)).save(buf, format="PNG")
    return SimpleUploadedFile("t.png", buf.getvalue(), content_type="image/png")


class Adr0037KatalogP0Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        platform = Firma.objects.get(platform_mu=True)
        cls.ops = User.objects.create_user(
            username="ops_p0",
            password="DemoPortal1!",
            firma=platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)
        metal = KiymetliMetal.objects.create(kod="AU_P0", ad="Altın P0", gram_bazli=True)
        cls.ayar = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="14P0", ayar_degeri="14", milyem=Decimal("0.585")
        )
        from tanimlar.models import FiyatGrubu

        fg = FiyatGrubu.objects.create(kod="GENEL_P0", ad="Genel P0")
        cls.kat = Kategori.objects.create(kod="YUZUK_P0", ad="Yüzük P0", fiyat_grubu=fg)
        cls.renk_s = Renk.objects.create(kod="SARI_P0", ad="Sarı", sira=1)
        cls.renk_b = Renk.objects.create(kod="BEYAZ_P0", ad="Beyaz", sira=2)
        cls.beden = OlcuDegeri.objects.create(
            tip="yuzuk_no", deger="14", sayisal_deger=Decimal("14"), sira=14
        )

    def _urun(self):
        return taslak_urun_olustur(
            actor=self.ops,
            ad="P0 Alyans",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            fiyat_tipi="gram",
            renk_ekseni=True,
            olcu_tipi="yuzuk_no",
        )

    def test_hazirlik_requires_variant_and_cover(self):
        urun = self._urun()
        d = urun_hazirlik_durumu(urun)
        self.assertFalse(d["hazir"])
        self.assertIn("En az bir aktif varyant", d["eksikler"])
        self.assertIn("Kapak görseli", d["eksikler"])

        varyant_ekle(actor=self.ops, urun=urun, gram="3.200", renk_id=self.renk_s.pk, beden_id=self.beden.pk)
        d2 = urun_hazirlik_durumu(urun)
        self.assertIn("Kapak görseli", d2["eksikler"])

        gorsel_ekle(actor=self.ops, urun=urun, dosya=_png(), kapak=True)
        d3 = urun_hazirlik_durumu(urun)
        self.assertTrue(d3["hazir"])

    def test_bulk_variants(self):
        urun = self._urun()
        created = varyant_toplu_ekle(
            actor=self.ops,
            urun=urun,
            satirlar=[
                {"gram": "3.2", "renk_id": self.renk_s.pk, "beden_id": self.beden.pk},
                {"gram": "3.3", "renk_id": self.renk_b.pk, "beden_id": self.beden.pk},
            ],
        )
        self.assertEqual(len(created), 2)
        self.assertEqual(Varyant.objects.filter(urun=urun).count(), 2)

    def test_onaya_gonder_blocks_without_cover(self):
        urun = self._urun()
        varyant_ekle(actor=self.ops, urun=urun, gram="3.200", renk_id=self.renk_s.pk, beden_id=self.beden.pk)
        with self.assertRaises(ValidationError):
            onaya_gonder(urun, self.ops)

    def test_price_preview_teklif_gerekli_on_draft(self):
        urun = self._urun()
        v = varyant_ekle(
            actor=self.ops, urun=urun, gram="3.200", renk_id=self.renk_s.pk, beden_id=self.beden.pk
        )
        preview = ops_fiyat_onizleme(actor=self.ops, varyant=v)
        self.assertFalse(preview["available"])
        self.assertEqual(preview["reason_code"], "urun_henuz_yayinda_degil")
        self.assertIn("tas_bedeli", preview["aciklama"])
