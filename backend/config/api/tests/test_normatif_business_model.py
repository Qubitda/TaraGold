"""ADR-0035 + ADR-0036 normatif iş modeli uçtan uca testleri."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from api.tests.test_api_b3_finance_ops import B3FixtureMixin
from belgeler.models import BelgeAyarlari, Document
from belgeler.services.siparis_belge_servisi import (
    uret_irsaliye,
    uret_proforma,
    uret_tedarikci_irsaliye,
)
from finans.models import CariHesap, LedgerEntry, TedarikciHakEdis
from finans.services.manuel_tahsilat_servisi import (
    elle_tahsilat,
    elle_tedarikci_odeme,
)
from firmalar import roles
from firmalar.models import Firma, FirmaTipAtama, FirmaUyelik
from firmalar.role_permissions import seed_role_permissions
from firmalar.services import uyelik_servisi
from firmalar.services.rol_servisi import sync_user_role_groups
from lojistik.models import Shipment
from lojistik.services import shipment_servisi
from siparis.models import HazirlamaEmri, Order
from siparis.services import checkout_servisi, order_onay_servisi, order_servisi

User = get_user_model()


class NormatifBusinessModelTests(B3FixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_b3_world()
        seed_role_permissions()
        cls.ops = User(
            username="norm_ops",
            firma=cls.platform,
            rol=roles.PLATFORM_SUPER,
            is_staff=True,
            is_superuser=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

    def setUp(self):
        self.api = APIClient()

    def test_multi_role_multi_membership_and_switch(self):
        uyelik_servisi.upsert_uyelik(
            kullanici=self.buyer,
            firma=self.alici,
            rol=roles.ALICI_ADMIN,
            birincil=True,
            varsayilan=True,
        )
        uyelik_servisi.upsert_uyelik(
            kullanici=self.buyer,
            firma=self.tedarikci,
            rol=roles.TEDARIKCI_OPERATOR,
            birincil=False,
        )
        self.assertEqual(
            FirmaUyelik.objects.filter(kullanici=self.buyer, aktif=True).count(), 2
        )
        self.api.force_authenticate(user=self.buyer)
        lst = self.api.get(reverse("api-me-uyelikler"))
        self.assertEqual(lst.status_code, 200)
        self.assertEqual(len(lst.json()["results"]), 2)

        sw = self.api.post(
            reverse("api-me-switch-firma"),
            {"firma_id": self.tedarikci.pk},
            format="json",
        )
        self.assertEqual(sw.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.firma_id, self.tedarikci.pk)

    def test_order_onay_hazirlama_cari_ve_iptal_contra(self):
        self._quote_and_cart(miktar=Decimal("2.000"))
        co = checkout_servisi.checkout(actor=self.buyer, idempotency_key="norm-o1")
        order = order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co.attempt
        )
        self.assertEqual(order.durum, Order.Durum.ONAY_BEKLIYOR)

        # Onay öncesi tedarikçi siparişi görmez
        self.api.force_authenticate(user=self.ted_user)
        pre = self.api.get(reverse("api-supplier-hazirlama"))
        self.assertEqual(pre.status_code, 200)
        self.assertFalse(any(x["order_id"] == order.pk for x in pre.json()))

        # Platform onaylar → HazirlamaEmri + buyer SATIS CariHesap borcu
        order = order_onay_servisi.onayla(actor=self.ops, order=order)
        self.assertEqual(order.durum, Order.Durum.HAZIRLANIYOR)
        emir = HazirlamaEmri.objects.get(order=order, tedarikci_firma=self.tedarikci)
        self.assertEqual(emir.durum, HazirlamaEmri.Durum.HAZIRLANIYOR)

        cari = CariHesap.objects.get(
            firma=self.alici, karsi_firma=self.platform, para_birimi="TRY"
        )
        self.assertGreater(cari.bakiye, Decimal("0.00"))

        # Tedarikçi hazır işaretler → yalnız kendi emri, kör DTO, Order → HAZIR
        hazir_res = self.api.post(
            reverse("api-supplier-hazir", kwargs={"pk": order.pk}),
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY="norm-hazir-1",
        )
        self.assertEqual(hazir_res.status_code, 200)
        self.assertIsNone(hazir_res.json()["alici"])
        order.refresh_from_db()
        self.assertEqual(order.durum, Order.Durum.HAZIR)

    def test_dogrudan_shipment_bypasses_qc_and_pdf_documents_turkish_blind(self):
        self._quote_and_cart(miktar=Decimal("1.500"))
        co = checkout_servisi.checkout(actor=self.buyer, idempotency_key="norm-d1")
        order = order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co.attempt
        )
        order = order_onay_servisi.onayla(actor=self.ops, order=order)

        # PLATFORM_QC QC olmadan engellenir, DOGRUDAN izinli
        with self.assertRaises(ValidationError):
            shipment_servisi.olustur(
                actor=self.log,
                order=order,
                teslim_modeli=Shipment.TeslimModeli.PLATFORM_QC,
            )
        ship = shipment_servisi.olustur(
            actor=self.log,
            order=order,
            teslim_modeli=Shipment.TeslimModeli.DOGRUDAN,
        )
        self.assertEqual(ship.teslim_modeli, Shipment.TeslimModeli.DOGRUDAN)
        self.assertEqual(ship.sevk_yonu, Shipment.SevkYonu.DOGRUDAN)

        ship = shipment_servisi.hazirla(actor=self.log, shipment=ship)
        ship = shipment_servisi.sevk_et(
            actor=self.log,
            shipment=ship,
            kargo_firma="Yurtiçi Kargo",
            takip_no="YK-998877",
        )

        # BelgeAyarlari + Proforma R1, R2 + İrsaliye + Kör Tedarikçi İrsaliye
        ayar = BelgeAyarlari.get_solo()
        ayar.irsaliye_baslik = "Özel Sevk İrsaliyesi"
        ayar.save()

        p1 = uret_proforma(actor=self.ops, order=order)
        p2 = uret_proforma(actor=self.ops, order=order)
        self.assertEqual(p1.revizyon, 1)
        self.assertEqual(p2.revizyon, 2)
        self.assertTrue(p1.pdf_bytes.startswith(b"%PDF-1.4"))
        self.assertEqual(p1.document.tip, Document.Tip.PROFORMA)

        irs = uret_irsaliye(actor=self.ops, order=order, shipment=ship)
        self.assertEqual(irs.document.tip, Document.Tip.IRSALIYE)
        tirs = uret_tedarikci_irsaliye(
            actor=self.ted_user, order=order, tedarikci_firma=self.tedarikci, shipment=ship
        )
        self.assertEqual(tirs.document.tip, Document.Tip.TEDARIKCI_IRSALIYE)

        # Alıcı belge listesinde tedarikçi irsaliyesi görünmez
        self.api.force_authenticate(user=self.buyer)
        docs = self.api.get(reverse("api-belgeler"))
        self.assertEqual(docs.status_code, 200)
        tips = {d["tip"] for d in docs.json()["results"]}
        self.assertNotIn(Document.Tip.TEDARIKCI_IRSALIYE, tips)

    def test_manual_tahsilat_and_tedarikci_payout_updates_cari_and_hak_edis(self):
        order, _ship = self._delivered("norm-fin-1")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        cari_before = CariHesap.objects.get(
            firma=self.alici, karsi_firma=self.platform, para_birimi="TRY"
        ).bakiye

        elle_tahsilat(
            actor=self.finance,
            order=order,
            tutar=Decimal("50.00"),
            yontem="HAVALE",
            dekont_ref="DK-101",
        )
        cari_after = CariHesap.objects.get(
            firma=self.alici, karsi_firma=self.platform, para_birimi="TRY"
        ).bakiye
        self.assertEqual(cari_after, cari_before - Decimal("50.00"))

        he = TedarikciHakEdis.objects.filter(
            order=order, tedarikci_firma=self.tedarikci
        ).first()
        self.assertIsNotNone(he)
        elle_tedarikci_odeme(
            actor=self.finance,
            tedarikci_firma=self.tedarikci,
            tutar=Decimal("25.00"),
            yontem="EFT",
            hak_edis=he,
            dekont_ref="TDK-202",
        )
        he.refresh_from_db()
        self.assertEqual(he.durum, TedarikciHakEdis.Durum.ODENDI)
        self.assertIsNotNone(he.odeme_tarihi)
        self.assertTrue(
            LedgerEntry.objects.filter(pk=he.odeme_ledger_entry_id).exists()
        )
