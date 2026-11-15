"""Teklif create kaldırıldı — 410 Gone."""

from __future__ import annotations

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin


@override_settings(SECURE_SSL_REDIRECT=False)
class OfferCreateApiTests(CheckoutFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()

    def setUp(self):
        self.api = APIClient()

    def test_supplier_offer_create_gone(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.post(
            reverse("api-supplier-offers"),
            {
                "varyant_id": self.varyant.pk,
                "fiyat_modeli": "METAL_BAZLI",
                "gram": "1.0",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="offer-create-gone",
        )
        self.assertEqual(r.status_code, 410)
