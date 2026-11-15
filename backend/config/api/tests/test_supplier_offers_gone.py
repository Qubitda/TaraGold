"""Teklif API 410 — VaryantFiyat yoluna geçildi."""

from __future__ import annotations

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin


@override_settings(SECURE_SSL_REDIRECT=False)
class SupplierOffersGoneTests(CheckoutFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()

    def setUp(self):
        self.api = APIClient()

    def test_offers_list_gone(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.get(reverse("api-supplier-offers"))
        self.assertEqual(r.status_code, status.HTTP_410_GONE)
        self.assertEqual(r.json().get("code"), "teklif_api_kaldirildi")

    def test_offers_post_gone(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.post(
            reverse("api-supplier-offers"),
            {"varyant_id": self.varyant.pk, "fiyat_modeli": "SABIT_PARCA"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_410_GONE)

    def test_stock_adjust_varyant(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.post(
            reverse("api-supplier-stock-adjust"),
            {
                "warehouse_id": self.wh.pk,
                "varyant_id": self.varyant.pk,
                "miktar": "3",
                "neden": "Gone-test stok duzeltme",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="gone-adj-1",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        self.assertEqual(r.json()["varyant_id"], self.varyant.pk)
        self.assertNotIn("teklif_id", r.json())
