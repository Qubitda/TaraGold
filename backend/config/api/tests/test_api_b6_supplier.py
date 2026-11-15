"""API-B6 — tedarikçi stok yazma (teklif uçları 410)."""

from __future__ import annotations

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin
from stok.models import StockBalance


@override_settings(SECURE_SSL_REDIRECT=False)
class ApiB6SupplierTests(CheckoutFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()

    def setUp(self):
        self.api = APIClient()

    def test_offers_gone_and_stock_adjust(self):
        self.api.force_authenticate(user=self.ted_user)

        gone = self.api.get(reverse("api-supplier-offers"))
        self.assertEqual(gone.status_code, 410)

        before = StockBalance.objects.get(
            warehouse=self.wh, varyant=self.varyant
        ).on_hand
        adj = self.api.post(
            reverse("api-supplier-stock-adjust"),
            {
                "warehouse_id": self.wh.pk,
                "varyant_id": self.varyant.pk,
                "miktar": "5",
                "neden": "B6 stok duzeltme",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="b6-adj-1",
        )
        self.assertEqual(adj.status_code, 201, adj.content)
        after = StockBalance.objects.get(
            warehouse=self.wh, varyant=self.varyant
        ).on_hand
        self.assertEqual(after - before, 5)
