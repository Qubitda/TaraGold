"""Ürün yayın: taslak → Yayınla (çift onay / dört göz kaldırıldı)."""

from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from firmalar import roles
from firmalar.services.rol_servisi import sync_user_role_groups
from urunler.models import UrunKanal, Varyant
from urunler.services import gorsel_ekle
from urunler.services import onay_servisi as svc
from urunler.tests._base import KatalogTestTaban

User = get_user_model()


def _png():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color=(200, 160, 40)).save(buf, format="PNG")
    return SimpleUploadedFile("t.png", buf.getvalue(), content_type="image/png")


class YayinTaslakO5Tests(KatalogTestTaban):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.psuper = User(
            username="psuper_o5",
            firma=cls.platform.firma,
            rol=roles.PLATFORM_SUPER,
            is_staff=True,
            is_superuser=True,
        )
        cls.psuper.set_password("x")
        cls.psuper.save()
        sync_user_role_groups(cls.psuper)

        cls.padmin = User(
            username="padmin_o5",
            firma=cls.platform.firma,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.padmin.set_password("x")
        cls.padmin.save()
        sync_user_role_groups(cls.padmin)

    def setUp(self):
        self.u = self.urun(
            olusturan_firma=self.platform.firma,
            olusturan_kullanici=self.platform,
        )
        Varyant.objects.create(urun=self.u, gram=Decimal("2.0"))
        gorsel_ekle(actor=self.platform, urun=self.u, dosya=_png(), kapak=True)

    def test_yayina_al_from_taslak_same_actor(self):
        """Aynı aktör taslaktan doğrudan yayınlayabilir (dört göz yok)."""
        self.assertEqual(self.u.onay_durumu, "taslak")
        UrunKanal.objects.create(urun=self.u, kanal=self.kanal, aktif=True)
        yayin = svc.yayina_al(self.u, self.platform, durum="aktif")
        self.assertEqual(yayin.yayin_durumu, "aktif")
        self.assertEqual(yayin.onay_durumu, "onayli")

    def test_yayina_al_requires_channel(self):
        with self.assertRaises(ValidationError):
            svc.yayina_al(self.u, self.platform, durum="aktif")

    def test_platform_super_publish_from_taslak(self):
        self.u.olusturan_kullanici = self.psuper
        self.u.save(update_fields=["olusturan_kullanici"])
        UrunKanal.objects.create(urun=self.u, kanal=self.kanal, aktif=True)
        yayin = svc.yayina_al(self.u, self.psuper, durum="aktif")
        self.assertEqual(yayin.yayin_durumu, "aktif")
        self.assertEqual(yayin.onay_durumu, "onayli")

    def test_pasife_al_returns_to_taslak(self):
        UrunKanal.objects.create(urun=self.u, kanal=self.kanal, aktif=True)
        svc.yayina_al(self.u, self.padmin, durum="aktif")
        pasif = svc.pasife_al(self.u, self.padmin)
        self.assertEqual(pasif.yayin_durumu, "pasif")
        self.assertEqual(pasif.onay_durumu, "taslak")

    def test_republish_after_pasife(self):
        UrunKanal.objects.create(urun=self.u, kanal=self.kanal, aktif=True)
        svc.yayina_al(self.u, self.platform, durum="aktif")
        svc.pasife_al(self.u, self.platform)
        again = svc.yayina_al(self.u, self.platform, durum="aktif")
        self.assertEqual(again.yayin_durumu, "aktif")
        self.assertEqual(again.onay_durumu, "onayli")
