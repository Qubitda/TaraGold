"""FAZ 5 — etkin_fiyat_modeli VF öncelikli."""

from decimal import Decimal

from django.test import TestCase

from fiyatlama.models import VaryantFiyat
from fiyatlama.services.etkin_fiyat import etkin_fiyat_modeli
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin


class EtkinFiyatFaz5Tests(PriceQuoteFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()

    def test_urun_fallback(self):
        eff = etkin_fiyat_modeli(self.urun, vf=None)
        self.assertEqual(eff["kaynak"], "urun")
        self.assertEqual(eff["model"], "GRAM_BIRIM")
        self.assertFalse(eff["conflict"])

    def test_vf_wins_and_conflict(self):
        vf = VaryantFiyat(
            varyant=self.varyant,
            tedarikci=self.ted,
            durum=VaryantFiyat.Durum.AKTIF,
            fiyat_modeli=VaryantFiyat.FiyatModeli.SABIT_PARCA,
            birim_fiyat=Decimal("100.00"),
        )
        # full_clean may need more fields — set attrs only for helper
        eff = etkin_fiyat_modeli(self.urun, vf=vf)
        self.assertEqual(eff["kaynak"], "varyant_fiyat")
        self.assertEqual(eff["model"], "SABIT_PARCA")
        self.assertTrue(eff["conflict"])  # urun gram vs VF sabit
