"""P0 — supplier teklif create HTTP."""

from __future__ import annotations

from datetime import date, timedelta

from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from firmalar.role_permissions import seed_role_permissions
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.models import TedarikciTeklif
from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin


class OfferCreateApiTests(CheckoutFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()
        seed_role_permissions()
        sync_user_role_groups(cls.ted_user)
        sync_user_role_groups(cls.buyer)

    def setUp(self):
        self.api = APIClient()

    def _idem(self, key):
        return {"HTTP_IDEMPOTENCY_KEY": key}

    def test_supplier_offer_create_json(self):
        self.api.force_authenticate(user=self.ted_user)
        bas = date.today()
        res = self.api.post(
            reverse("api-supplier-offers"),
            {
                "varyant_id": self.varyant.pk,
                "fiyat_modeli": TedarikciTeklif.FiyatModeli.METAL_BAZLI,
                "gram": "1.500",
                "tedarikci_kodu": "CREATE1",
                "gecerlilik_baslangic": bas.isoformat(),
                "gecerlilik_bitis": (bas + timedelta(days=30)).isoformat(),
                "tedarikci_id": 999999,  # ignored
            },
            format="json",
            **self._idem("offer-c1"),
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res["Content-Type"].split(";")[0], "application/json")
        body = res.json()
        self.assertEqual(body["durum"], TedarikciTeklif.Durum.TASLAK)
        self.assertEqual(body["varyant_id"], self.varyant.pk)
        t = TedarikciTeklif.objects.get(pk=body["id"])
        self.assertEqual(t.tedarikci_id, self.ted.pk)

        self.api.force_authenticate(user=self.buyer)
        buyer = self.api.post(
            reverse("api-supplier-offers"),
            {
                "varyant_id": self.varyant.pk,
                "fiyat_modeli": TedarikciTeklif.FiyatModeli.METAL_BAZLI,
                "gram": "1",
            },
            format="json",
            **self._idem("offer-buyer2"),
        )
        self.assertIn(buyer.status_code, (403, 401), buyer.content)

        bad = self.api
        self.api.force_authenticate(user=self.ted_user)
        bad = self.api.post(
            reverse("api-supplier-offers"),
            {"varyant_id": "x", "fiyat_modeli": "METAL_BAZLI"},
            format="json",
            **self._idem("offer-bad"),
        )
        self.assertEqual(bad.status_code, 400, bad.content)

    def test_offer_invalid_transition_409(self):
        """TASLAK üzerinde deactivate → 409 (state machine)."""
        self.api.force_authenticate(user=self.ted_user)
        bas = date.today()
        created = self.api.post(
            reverse("api-supplier-offers"),
            {
                "varyant_id": self.varyant.pk,
                "fiyat_modeli": TedarikciTeklif.FiyatModeli.METAL_BAZLI,
                "gram": "1.000",
                "tedarikci_kodu": "T409",
                "gecerlilik_baslangic": bas.isoformat(),
                "gecerlilik_bitis": (bas + timedelta(days=10)).isoformat(),
            },
            format="json",
            **self._idem("offer-409-c"),
        )
        self.assertEqual(created.status_code, 201, created.content)
        pk = created.json()["id"]
        bad = self.api.post(
            reverse("api-supplier-offer-deactivate", kwargs={"pk": pk}),
            {},
            format="json",
            **self._idem("offer-409-d"),
        )
        self.assertEqual(bad.status_code, 409, bad.content)
        ct = bad["Content-Type"].split(";")[0]
        self.assertIn(ct, ("application/json", "application/problem+json"), ct)