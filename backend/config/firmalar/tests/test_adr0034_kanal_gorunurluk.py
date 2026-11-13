"""ADR-0034 / §3 — kanal görünürlük soft-launch + IDOR org (FAZ 1)."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services import org_servisi
from firmalar.services.kanal_gorunurluk_servisi import filter_buyer_catalog_queryset
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from firmalar.services.uyelik_servisi import upsert_uyelik
from urunler.models import Urun

User = get_user_model()


class KanalGorunurlukTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        ensure_platform_firma()
        cls.alici = Firma.objects.create(
            ad="KGAli",
            firma_kodu="KGALI",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )

    def test_filter_legacy_when_no_erisim(self):
        """AliciKanalErisimi yoksa qs dokunulmaz (soft-launch)."""
        buyer = User(
            username="kgb",
            firma=self.alici,
            rol=roles.ALICI_SATINALMACI,
        )
        buyer.set_password("x")
        buyer.save()
        qs = Urun.objects.all()
        before = qs.count()
        out = filter_buyer_catalog_queryset(qs, actor=buyer)
        self.assertEqual(out.count(), before)


class OrgIdorTests(TestCase):
    """Başka firmanın kullanıcısını org birimine ekleme reddedilir."""

    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        ensure_platform_firma()
        cls.a = Firma.objects.create(
            ad="OA", firma_kodu="OA", alici_mi=True, onay_durumu="onayli", aktif=True
        )
        cls.b = Firma.objects.create(
            ad="OB", firma_kodu="OB", alici_mi=True, onay_durumu="onayli", aktif=True
        )
        cls.mgr = User(
            username="oa_mgr", firma=cls.a, rol=roles.ALICI_YONETICI, is_staff=True
        )
        cls.mgr.set_password("x")
        cls.mgr.save()
        sync_user_role_groups(cls.mgr)
        upsert_uyelik(
            kullanici=cls.mgr, firma=cls.a, rol=roles.ALICI_YONETICI, aktif=True
        )
        cls.intruder = User(
            username="ob_u", firma=cls.b, rol=roles.ALICI_DENETCI
        )
        cls.intruder.set_password("x")
        cls.intruder.save()

    def test_cross_firma_org_uye_idor(self):
        ob = org_servisi.olustur_birim(
            actor=self.mgr, firma=self.a, kod="IDOR", ad="IDOR"
        )
        with self.assertRaises(ValidationError):
            org_servisi.uye_ekle(
                actor=self.mgr, org_birimi=ob, kullanici=self.intruder
            )
