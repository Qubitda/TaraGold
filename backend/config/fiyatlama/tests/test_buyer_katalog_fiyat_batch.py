"""Alıcı katalog fiyat batch — sahte fiyat yok; reason_code döner."""

from django.test import TestCase
from django.contrib.auth import get_user_model

from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from firmalar import roles
from fiyatlama.services.buyer_katalog_fiyat_servisi import alici_varyant_fiyati

User = get_user_model()


class BuyerKatalogFiyatBatchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        platform = Firma.objects.get(platform_mu=True)
        cls.ops = User.objects.create_user(
            username="ops_bf",
            password="DemoPortal1!",
            firma=platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)

    def test_ops_cannot_get_buyer_price(self):
        res = alici_varyant_fiyati(
            actor=self.ops, varyant_id=1, satis_kanali_id=1
        )
        self.assertFalse(res["ok"])
        self.assertEqual(res["reason_code"], "ops_quote_yasak")

    def test_missing_variant_reason(self):
        alici = Firma.objects.create(
            ad="Alıcı BF",
            firma_kodu="ALICI_BF",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        buyer = User.objects.create_user(
            username="buyer_bf",
            password="DemoPortal1!",
            firma=alici,
            rol=roles.ALICI_SATINALMACI,
        )
        sync_user_role_groups(buyer)
        res = alici_varyant_fiyati(
            actor=buyer, varyant_id=999999, satis_kanali_id=1
        )
        self.assertFalse(res["ok"])
        self.assertIn(res["reason_code"], ("varyant_yok", "kanal_yok"))
