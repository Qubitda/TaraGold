"""ADR-0043 — bileşim snapshot / emir anahtarları (saf birim)."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from django.utils import timezone

from siparis.services.bilesim_secim import (
    SCHEMA,
    bilesim_anahtar,
    build_bilesim_from_quotes,
    buyer_bilesim_view,
    composition_emir_specs,
    composition_stock_parts,
)


def _quote(*, tip, vid, ted_id, alici_id=1, sku="X", urun_ad="U"):
    now = timezone.now()
    # ADR-0044 — montür/taş uyumluluk alanları (sıkı imalat)
    extra = {}
    if tip == "MONTUR":
        extra = dict(
            aktif=True,
            parca_rolu="FULL",
            yuva_adedi=2,
            izinli_kesimler=["ROUND"],
            karat_min=Decimal("0.5"),
            karat_max=Decimal("3.0"),
        )
    elif tip == "TAS":
        extra = dict(
            aktif=True,
            karat=Decimal("1.0"),
            kesim_kod="ROUND",
        )
    varyant = SimpleNamespace(
        pk=vid,
        tip=tip,
        sku=sku,
        urun=SimpleNamespace(ad=urun_ad),
        **extra,
    )
    vf = SimpleNamespace(tedarikci_id=ted_id)
    return SimpleNamespace(
        pk=vid * 10,
        varyant=varyant,
        varyant_id=vid,
        varyant_fiyat=vf,
        alici_firma_id=alici_id,
        gecerlilik_sonu=now + timezone.timedelta(hours=1),
    )


class Adr0043BilesimUnitTests(SimpleTestCase):
    def test_build_emir_and_buyer_mask(self):
        mq = _quote(tip="MONTUR", vid=1, ted_id=11, sku="M1", urun_ad="Mont")
        tq = _quote(tip="TAS", vid=2, ted_id=22, sku="T1", urun_ad="Tas")
        bil = build_bilesim_from_quotes(
            montur_quote=mq, tas_quotes_miktar=[(tq, Decimal("2"))]
        )
        self.assertEqual(bil["schema"], SCHEMA)
        self.assertEqual(bil["montur"]["tedarikci_id"], 11)
        self.assertEqual(bil["taslar"][0]["tedarikci_id"], 22)

        specs = composition_emir_specs(bil)
        self.assertEqual(set(specs), {(11, "MONTUR"), (22, "TAS")})

        parts = composition_stock_parts(bil)
        self.assertEqual(len(parts), 2)
        self.assertEqual(parts[1]["miktar"], Decimal("2"))

        view = buyer_bilesim_view(bil)
        self.assertNotIn("tedarikci_id", view["montur"])
        self.assertNotIn("tedarikci_id", view["taslar"][0])
        self.assertEqual(view["montur"]["varyant_sku"], "M1")

        key = bilesim_anahtar(montur_varyant_id=1, taslar=bil["taslar"])
        self.assertEqual(len(key), 32)

    def test_rejects_wrong_tips(self):
        bad_m = _quote(tip="HAM_ALTIN", vid=1, ted_id=11)
        tq = _quote(tip="TAS", vid=2, ted_id=22)
        with self.assertRaises(ValidationError):
            build_bilesim_from_quotes(
                montur_quote=bad_m, tas_quotes_miktar=[(tq, Decimal("1"))]
            )

    def test_rejects_empty_tas(self):
        mq = _quote(tip="MONTUR", vid=1, ted_id=11)
        with self.assertRaises(ValidationError):
            build_bilesim_from_quotes(montur_quote=mq, tas_quotes_miktar=[])

    def test_rejects_montur_without_uyumluluk(self):
        mq = _quote(tip="MONTUR", vid=1, ted_id=11)
        mq.varyant.izinli_kesimler = []
        tq = _quote(tip="TAS", vid=2, ted_id=22)
        with self.assertRaises(ValidationError):
            build_bilesim_from_quotes(
                montur_quote=mq, tas_quotes_miktar=[(tq, Decimal("1"))]
            )

    def test_rejects_toplam_karat_asimi_coklu_tas(self):
        """Her taş tek başına aralıkta olsa da toplam karat aşımı reddedilir."""
        mq = _quote(tip="MONTUR", vid=1, ted_id=11)
        mq.varyant.yuva_adedi = 3
        mq.varyant.karat_min = Decimal("0.5")
        mq.varyant.karat_max = Decimal("2.5")
        t1 = _quote(tip="TAS", vid=2, ted_id=22, sku="T1")
        t1.varyant.karat = Decimal("1.0")
        t2 = _quote(tip="TAS", vid=3, ted_id=23, sku="T2")
        t2.varyant.karat = Decimal("1.0")
        t3 = _quote(tip="TAS", vid=4, ted_id=24, sku="T3")
        t3.varyant.karat = Decimal("1.0")
        # 3×1.0 = 3.0 > 2.5
        with self.assertRaises(ValidationError):
            build_bilesim_from_quotes(
                montur_quote=mq,
                tas_quotes_miktar=[
                    (t1, Decimal("1")),
                    (t2, Decimal("1")),
                    (t3, Decimal("1")),
                ],
            )

    def test_head_plus_band(self):
        hq = _quote(tip="MONTUR", vid=1, ted_id=11, sku="H1", urun_ad="Head")
        hq.varyant.parca_rolu = "HEAD"
        bq = _quote(tip="MONTUR", vid=5, ted_id=15, sku="B1", urun_ad="Band")
        bq.varyant.parca_rolu = "BAND"
        bq.varyant.yuva_adedi = None
        bq.varyant.izinli_kesimler = []
        bq.varyant.karat_min = None
        bq.varyant.karat_max = None
        tq = _quote(tip="TAS", vid=2, ted_id=22, sku="T1")
        bil = build_bilesim_from_quotes(
            montur_quote=hq,
            band_quote=bq,
            tas_quotes_miktar=[(tq, Decimal("1"))],
        )
        self.assertEqual(bil["montur"]["parca_rolu"], "HEAD")
        self.assertEqual(bil["band"]["parca_rolu"], "BAND")
        parts = composition_stock_parts(bil)
        self.assertEqual(len(parts), 3)
        view = buyer_bilesim_view(bil)
        self.assertIn("band", view)
        self.assertNotIn("tedarikci_id", view["band"])

    def test_full_rejects_band(self):
        mq = _quote(tip="MONTUR", vid=1, ted_id=11)
        bq = _quote(tip="MONTUR", vid=5, ted_id=15)
        bq.varyant.parca_rolu = "BAND"
        tq = _quote(tip="TAS", vid=2, ted_id=22)
        with self.assertRaises(ValidationError):
            build_bilesim_from_quotes(
                montur_quote=mq,
                band_quote=bq,
                tas_quotes_miktar=[(tq, Decimal("1"))],
            )
