"""Saf hesap — ADR-0039 işaretli marj."""

from decimal import Decimal

from django.test import SimpleTestCase

from piyasa.services import hesap


class HesapTests(SimpleTestCase):
    def test_yuvarla_onluk(self):
        self.assertEqual(
            hesap.yuvarla(Decimal("6665"), 10, hesap.YAKIN), Decimal("6670")
        )

    def test_isaretli_tl_iki_taraf_arti_50(self):
        # Dünya 6000/6100, marj +50 TL → 6050/6150
        out = hesap.hesapla_cift(
            ham_alis=6000,
            ham_satis=6100,
            marj_modu=hesap.TL,
            alis_marj=50,
            satis_marj=50,
        )
        self.assertEqual(out["nihai_alis"], Decimal("6050.00"))
        self.assertEqual(out["nihai_satis"], Decimal("6150.00"))

    def test_isaretli_yuzde_1(self):
        # %1 → 6060 / 6161
        out = hesap.hesapla_cift(
            ham_alis=6000,
            ham_satis=6100,
            marj_modu=hesap.YUZDE,
            alis_marj=1,
            satis_marj=1,
        )
        self.assertEqual(out["nihai_alis"], Decimal("6060.00"))
        self.assertEqual(out["nihai_satis"], Decimal("6161.00"))

    def test_negatif_marj(self):
        out = hesap.hesapla_cift(
            ham_alis=6000,
            ham_satis=6100,
            marj_modu=hesap.TL,
            alis_marj=-50,
            satis_marj=-20,
        )
        self.assertEqual(out["nihai_alis"], Decimal("5950.00"))
        self.assertEqual(out["nihai_satis"], Decimal("6080.00"))

    def test_satis_alis_altinda_red(self):
        with self.assertRaises(ValueError):
            hesap.hesapla_cift(
                ham_alis=6000,
                ham_satis=6100,
                marj_modu=hesap.TL,
                alis_marj=200,
                satis_marj=-200,
            )

    def test_migration_esdeger_eski_alis_dusurme(self):
        # Eski: alis_marj=+25 TL düşürür → yeni kayıt alis_marj=-25
        eski = hesap.uygula_pano_marj(
            1000, taraf=hesap.ALIS, marj_modu=hesap.TL, alis_marj=-25
        )
        self.assertEqual(eski, Decimal("975"))
        satis = hesap.uygula_pano_marj(
            1000, taraf=hesap.SATIS, marj_modu=hesap.TL, satis_marj=25
        )
        self.assertEqual(satis, Decimal("1025"))

    def test_gram_try_from_ons(self):
        oz = hesap.TROY_OZ_GRAM
        out = hesap.gram_try_from_ons(
            ons_bid=oz * Decimal("100"),
            ons_ask=oz * Decimal("101"),
            usdtry_bid=Decimal("40"),
            usdtry_ask=Decimal("40.1"),
        )
        self.assertEqual(out["gram_alis"], Decimal("4000"))
        self.assertEqual(out["gram_satis"], Decimal("101") * Decimal("40.1"))

    def test_satis_yuzde_marj_hesapla_taraf(self):
        out = hesap.hesapla_taraf(
            taraf=hesap.SATIS,
            saf_birim_fiyat=6000,
            milyem=1,
            gram=1,
            marj_modu=hesap.YUZDE,
            satis_marj=2,
        )
        self.assertEqual(out["ham"], Decimal("6000.00"))
        self.assertEqual(out["nihai"], Decimal("6120.00"))

    def test_alis_yuzde_negatif_esdeger(self):
        # Migration sonrası eski %5 düşürme = alis_marj=-5
        out = hesap.hesapla_taraf(
            taraf=hesap.ALIS,
            saf_birim_fiyat=6000,
            milyem=1,
            gram=1,
            marj_modu=hesap.YUZDE,
            alis_marj=-5,
        )
        self.assertEqual(out["nihai"], Decimal("5700.00"))

    def test_kullanici_fiyati_katman2(self):
        out = hesap.kullanici_fiyati(
            baz_birim_fiyat=6540,
            agirlik_gr=10,
            marj={"tip": hesap.YUZDE, "deger": 1},
        )
        self.assertEqual(out["metal_bedeli"], Decimal("65400.00"))
        self.assertEqual(out["birim_toplam"], Decimal("6605.40"))

    def test_ham_kg_try(self):
        ham = hesap.hesapla_ham(
            saf_birim_fiyat=6000, milyem=1, miktar=1, olcek=hesap.KG, cikti_pb=hesap.TRY
        )
        self.assertEqual(ham, Decimal("6000000"))

    def test_ham_ons_usd(self):
        ham = hesap.hesapla_ham(
            saf_birim_fiyat=100,
            milyem=1,
            miktar=1,
            olcek=hesap.ONS,
            cikti_pb=hesap.USD,
            usd_try=Decimal("34"),
        )
        self.assertEqual(ham.quantize(Decimal("0.01")), Decimal("91.48"))
