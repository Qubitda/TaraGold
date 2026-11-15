"""Fiyatlandırma özeti — formül + 2 hop (Django’suz)."""

from decimal import Decimal

from django.test import SimpleTestCase

from fiyatlama.services import fiyat_hesaplama


class FiyatOzetiHopTests(SimpleTestCase):
    def test_has_gram_and_metal(self):
        r = fiyat_hesaplama.hesapla(
            gram=Decimal("10"),
            milyem=Decimal("0.750"),
            saf_birim_fiyat=Decimal("6250"),
            marj_tipi="TRL",
            marj_degeri=Decimal("0"),
            iscilik=Decimal("100"),
        )
        self.assertEqual(r["has_gram"], Decimal("7.500"))
        self.assertEqual(r["metal_bedeli"], Decimal("46875.000"))
        self.assertEqual(r["iscilik"], Decimal("100"))

    def test_servis_yuzde_hop(self):
        hop = fiyat_hesaplama.hesapla_hop(
            ham=Decimal("1000"),
            ekler=[("servis_bedeli", "YUZDE", Decimal("5"))],
            gram=Decimal("1"),
        )
        self.assertEqual(hop["kalemler"]["servis_bedeli"], Decimal("50"))
        self.assertEqual(hop["yeni_ham"], Decimal("1050"))

    def test_iki_hop_metal(self):
        sonuc = fiyat_hesaplama.hesapla_iki_hop(
            fiyat_modeli="METAL_BAZLI",
            hop1_kwargs={
                "gram": Decimal("10"),
                "milyem": Decimal("0.750"),
                "saf_birim_fiyat": Decimal("6250"),
                "iscilik": Decimal("200"),
                "tas_bedeli": Decimal("0"),
                "ek_bedel": Decimal("0"),
                "para_birimi": "TRY",
            },
            servis_birim="YUZDE",
            servis_deger=Decimal("10"),
            gram=Decimal("10"),
        )
        # metal 46875 + iscilik 200 = 47075 platform
        self.assertEqual(sonuc["hop1_platform_satis"], Decimal("47075.000"))
        self.assertIn("servis_bedeli", sonuc["kalemler"])
        self.assertEqual(
            sonuc["kalemler"]["servis_bedeli"],
            Decimal("4707.500"),
        )
        self.assertEqual(sonuc["kar"], Decimal("200") + Decimal("4707.500"))

    def test_birim_normalize(self):
        self.assertEqual(fiyat_hesaplama.normalize_birim_tipi("TL_GR"), "GRAM")
        self.assertEqual(fiyat_hesaplama.normalize_birim_tipi("TL_PARCA"), "TRL")
        self.assertEqual(fiyat_hesaplama.normalize_birim_tipi("YUZDE"), "YUZDE")
