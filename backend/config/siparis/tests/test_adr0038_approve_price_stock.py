"""ADR-0038 — checkout stoksuz; order tahmini; onayda kesin+stok (smoke)."""

from __future__ import annotations

from decimal import Decimal
from unittest import skipUnless

from django.conf import settings
from django.test import SimpleTestCase, TestCase

from siparis.models import OrderLine


@skipUnless(
    "postgresql" in settings.DATABASES["default"]["ENGINE"],
    "ADR-0038 alanları PG constraint ile doğrulanır",
)
class OrderLineAdr0038ModelTests(TestCase):
    def test_model_fields_exist(self):
        names = {f.name for f in OrderLine._meta.get_fields()}
        self.assertIn("tahmini_birim_fiyat_vergisiz", names)
        self.assertIn("tahmini_satir_tutari_vergisiz", names)
        self.assertIn("price_quote", names)
        pl = OrderLine._meta.get_field("price_lock")
        self.assertTrue(pl.null)
        sr = OrderLine._meta.get_field("stock_reservation")
        self.assertTrue(sr.null)
        snap = OrderLine._meta.get_field("snapshot_birim_fiyat_vergisiz")
        self.assertTrue(snap.null)


class OrderLineAdr0038ImportTests(TestCase):
    def test_services_import(self):
        from siparis.services.checkout_servisi import checkout
        from siparis.services.order_onay_servisi import onayla, reddet
        from siparis.services.order_servisi import olustur_from_checkout
        from siparis.services.presenters import present_order_line

        self.assertTrue(callable(checkout))
        self.assertTrue(callable(olustur_from_checkout))
        self.assertTrue(callable(onayla))
        self.assertTrue(callable(reddet))
        self.assertTrue(callable(present_order_line))
        self.assertEqual(Decimal("1.00") + Decimal("2.00"), Decimal("3.00"))


class CheckoutAdr0038ContractTests(SimpleTestCase):
    def test_checkout_line_result_defaults_no_stock(self):
        from siparis.services.checkout_servisi import CheckoutLineResult

        r = CheckoutLineResult(
            cart_line_id=1,
            quote_id=2,
            miktar=Decimal("1"),
            birim="ADET",
        )
        self.assertEqual(r.lock_id, 0)
        self.assertEqual(r.reservation_id, 0)
        self.assertEqual(r.warehouse_id, 0)

    def test_onay_exports_benzersiz_guard(self):
        from siparis.services import order_onay_servisi as m

        self.assertTrue(callable(m._assert_benzersiz_sira))
        self.assertTrue(callable(m._finalize_line_price_and_stock))
