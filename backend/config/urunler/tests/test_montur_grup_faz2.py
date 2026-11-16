"""FAZ 2 — atomic create + montur_grup_id HEAD+BAND + peer annotate."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from tanimlar.models import AyarMilyem, FiyatGrubu, KiymetliMetal
from urunler.models import Kategori, Urun
from urunler.services.katalog_yazma_servisi import ops_urun_olustur_atomic

User = get_user_model()


class MonturGrupServisTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        cls.platform = Firma.objects.get(platform_mu=True)
        cls.ted = Firma.objects.create(
            ad="MontTed", firma_kodu="MNTTD", tedarikci_mi=True, aktif=True
        )
        cls.ops = User.objects.create_user(
            username="mont_ops",
            password="x",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)
        metal = KiymetliMetal.objects.create(kod="AU_MN", ad="Altın MN", gram_bazli=True)
        cls.ayar = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="14MN", ayar_degeri="14", milyem=Decimal("0.585")
        )
        fg = FiyatGrubu.objects.create(kod="GENEL_MN", ad="Genel MN")
        cls.kat = Kategori.objects.create(kod="YUZUK_MN", ad="Yüzük MN", fiyat_grubu=fg)

    def test_single_requires_varyant(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            ops_urun_olustur_atomic(
                actor=self.ops,
                ad="No var",
                kategori_id=self.kat.pk,
                ayar_id=self.ayar.pk,
                sahiplik_firma_id=self.ted.pk,
                varyantlar=[],
            )

    def test_head_band_shares_grup(self):
        result = ops_urun_olustur_atomic(
            actor=self.ops,
            ad="Solitaire Set",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
            montur_modu="HEAD+BAND",
            parcalar=[
                {
                    "parca_rolu": "HEAD",
                    "gram": "1.200",
                    "bas_stil": "CLASSIC_HALO",
                    "yuva_adedi": 1,
                    "izinli_kesimler": ["ROUND"],
                },
                {
                    "parca_rolu": "BAND",
                    "gram": "2.000",
                    "govde_stil": "KNIFE_EDGE",
                },
            ],
        )
        head, band = result["urun"], result["peer"]
        self.assertIsNotNone(result["montur_grup_id"])
        self.assertEqual(head.montur_grup_id, band.montur_grup_id)
        self.assertEqual(head.montur_grup_id, result["montur_grup_id"])
        self.assertEqual(head.varyantlar.count(), 1)
        self.assertEqual(band.varyantlar.count(), 1)
        self.assertEqual(head.varyantlar.first().parca_rolu, "HEAD")
        self.assertEqual(band.varyantlar.first().parca_rolu, "BAND")


class MonturGrupHttpTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.ops = User(
            username="mont_http_ops",
            firma=cls.platform,
            rol=roles.PLATFORM_CATALOG,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.ops)

    def test_create_head_band_response(self):
        res = self.api.post(
            reverse("api-ops-products"),
            {
                "ad": "HTTP HB",
                "kategori_id": self.urun.kategori_id,
                "ayar_id": self.ayar.pk,
                "sahiplik_firma_id": self.ted.pk,
                "montur_modu": "HEAD+BAND",
                "parcalar": [
                    {"parca_rolu": "HEAD", "gram": "1.0", "bas_stil": "TULIP"},
                    {"parca_rolu": "BAND", "gram": "2.0", "govde_stil": "PLAIN"},
                ],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="mont-hb-1",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertTrue(body.get("montur_grup_id"))
        self.assertTrue(body.get("peer_id"))
        self.assertNotEqual(body["id"], body["peer_id"])
        peer = Urun.objects.get(pk=body["peer_id"])
        self.assertEqual(str(peer.montur_grup_id), body["montur_grup_id"])

        lst = self.api.get(reverse("api-ops-products"))
        self.assertEqual(lst.status_code, 200, lst.content)
        rows = {r["id"]: r for r in lst.json().get("results") or []}
        self.assertIn(body["id"], rows)
        self.assertEqual(rows[body["id"]].get("peer_id"), body["peer_id"])
