"""GET /ops/products/<id>/stock/ — salt okunur bakiye."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from stok.models import StockBalance, Warehouse

User = get_user_model()


class OpsProductStockTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.ops = User(
            username="ops_stock_view",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

        cls.buyer = User(
            username="buyer_stock_deny",
            firma=cls.alici,
            rol=roles.ALICI_SATINALMACI,
            is_staff=True,
        )
        cls.buyer.set_password("x")
        cls.buyer.save()
        sync_user_role_groups(cls.buyer)

    def setUp(self):
        self.api = APIClient()

    def test_ops_stock_lists_balances_for_product_variants(self):
        wh = Warehouse.objects.create(
            kod="WH_OPS_STK",
            ad="Ops Stok Depo",
            sahip_firma=self.platform,
            sahip_tipi=Warehouse.SahipTipi.PLATFORM,
        )
        StockBalance.objects.create(
            warehouse=wh,
            varyant=self.varyant,
            teklif=self.teklif,
            birim="ADET",
            on_hand=Decimal("10"),
            reserved=Decimal("2"),
            blocked=Decimal("0"),
        )
        self.api.force_authenticate(user=self.ops)
        res = self.api.get(
            reverse("api-ops-product-stock", kwargs={"pk": self.urun.pk})
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["urun_id"], self.urun.pk)
        self.assertGreaterEqual(body["count"], 1)
        row = next(r for r in body["results"] if r["varyant_id"] == self.varyant.pk)
        self.assertEqual(Decimal(row["on_hand"]), Decimal("10"))
        self.assertEqual(Decimal(row["reserved"]), Decimal("2"))
        self.assertEqual(Decimal(row["available"]), Decimal("8"))
        self.assertEqual(row["warehouse_kod"], "WH_OPS_STK")

    def test_buyer_cannot_access_ops_stock(self):
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(
            reverse("api-ops-product-stock", kwargs={"pk": self.urun.pk})
        )
        self.assertIn(res.status_code, (403, 404), res.content)
