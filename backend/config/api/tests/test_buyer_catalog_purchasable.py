"""Alıcı vitrin: yalnız aktif varyantı olan yayınlı ürünler listelenir."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from urunler.models import Urun, Varyant

User = get_user_model()


class BuyerCatalogPurchasableTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.buyer = User(
            username="buyer_cat_purch",
            firma=cls.alici,
            rol=roles.ALICI_SATINALMACI,
            is_staff=True,
        )
        cls.buyer.set_password("x")
        cls.buyer.save()
        sync_user_role_groups(cls.buyer)

        cls.orphan = Urun.objects.create(
            ad="Varyantsız Yayın",
            kategori=cls.urun.kategori,
            ayar=cls.ayar,
            olusturan_firma=cls.platform,
        )
        Urun.objects.filter(pk=cls.orphan.pk).update(
            onay_durumu="onayli",
            yayin_durumu="aktif",
            platform_kodu="ORPHAN-001",
            onaylayan_kullanici=cls.finance,
            onay_zamani=timezone.now(),
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.buyer)

    def test_list_excludes_zero_variant_products(self):
        res = self.api.get(reverse("api-buyer-catalog"))
        self.assertEqual(res.status_code, 200, res.content)
        ids = {r["id"] for r in res.json()["results"]}
        self.assertIn(self.urun.pk, ids)
        self.assertNotIn(self.orphan.pk, ids)
        for row in res.json()["results"]:
            self.assertGreaterEqual(row["varyant_count"], 1)
            self.assertIsNotNone(row.get("varsayilan_varyant_id"))

    def test_deactivated_only_variant_drops_from_list(self):
        Varyant.objects.filter(urun=self.urun).update(aktif=False)
        res = self.api.get(reverse("api-buyer-catalog"))
        self.assertEqual(res.status_code, 200, res.content)
        ids = {r["id"] for r in res.json()["results"]}
        self.assertNotIn(self.urun.pk, ids)
