"""Teklif import kaldırıldı — 410 Gone."""

from __future__ import annotations

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin


@override_settings(SECURE_SSL_REDIRECT=False)
class SupplierOfferImportF304Tests(CheckoutFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()

    def setUp(self):
        self.api = APIClient()

    def test_import_preview_gone(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.post(
            reverse("api-supplier-offer-import-preview"),
            {"csv": "varyant_id,fiyat_modeli\n1,METAL_BAZLI\n"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="foy-gone-1",
        )
        self.assertEqual(r.status_code, 410)

    def test_import_commit_gone(self):
        self.api.force_authenticate(user=self.ted_user)
        r = self.api.post(
            reverse("api-supplier-offer-import-commit"),
            {"satirlar": []},
            format="json",
            HTTP_IDEMPOTENCY_KEY="foy-gone-2",
        )
        self.assertEqual(r.status_code, 410)
