"""ADR-0044 — sıkı uyumluluk: boş kısıt → imalata kapalı."""

from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from urunler.services.uyumluluk_servisi import (
    montur_imalata_acik,
    present_uyumluluk,
    tas_monture_uygun,
)


def _montur(**kwargs):
    base = dict(
        tip="MONTUR",
        aktif=True,
        parca_rolu="FULL",
        yuva_adedi=1,
        izinli_kesimler=["ROUND"],
        karat_min=Decimal("0.5"),
        karat_max=Decimal("1.5"),
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def _tas(**kwargs):
    base = dict(tip="TAS", aktif=True, karat=Decimal("1.0"), kesim_kod="ROUND")
    base.update(kwargs)
    return SimpleNamespace(**base)


class UyumlulukSikiTests(SimpleTestCase):
    def test_bos_kesimler_imalata_kapali(self):
        self.assertFalse(montur_imalata_acik(_montur(izinli_kesimler=[])))

    def test_yuva_yok_imalata_kapali(self):
        self.assertFalse(montur_imalata_acik(_montur(yuva_adedi=None)))
        self.assertFalse(montur_imalata_acik(_montur(yuva_adedi=0)))

    def test_karat_aralik_yok_kapali(self):
        self.assertFalse(montur_imalata_acik(_montur(karat_min=None)))
        self.assertFalse(montur_imalata_acik(_montur(karat_max=None)))

    def test_dolu_montur_acik(self):
        m = _montur()
        self.assertTrue(montur_imalata_acik(m))
        self.assertTrue(present_uyumluluk(m)["imalata_acik"])

    def test_tas_uygun(self):
        self.assertTrue(tas_monture_uygun(montur=_montur(), tas=_tas(), adet=1))

    def test_tas_yanlis_kesim(self):
        self.assertFalse(
            tas_monture_uygun(
                montur=_montur(), tas=_tas(kesim_kod="PRINCESS"), adet=1
            )
        )

    def test_tas_karat_disinda(self):
        self.assertFalse(
            tas_monture_uygun(montur=_montur(), tas=_tas(karat=Decimal("2.0")), adet=1)
        )

    def test_tas_yuva_asimi(self):
        self.assertFalse(
            tas_monture_uygun(montur=_montur(yuva_adedi=1), tas=_tas(), adet=2)
        )

    def test_check_karat_range_atlanabilir(self):
        # Tek başına 2.0 ct max 1.5 dışında; check_karat_range=False ile kesim geçer
        self.assertFalse(
            tas_monture_uygun(montur=_montur(), tas=_tas(karat=Decimal("2.0")), adet=1)
        )
        self.assertTrue(
            tas_monture_uygun(
                montur=_montur(yuva_adedi=2),
                tas=_tas(karat=Decimal("2.0")),
                adet=1,
                check_karat_range=False,
            )
        )

    def test_band_imalata_kapali(self):
        self.assertFalse(montur_imalata_acik(_montur(parca_rolu="BAND")))

    def test_head_dolu_imalata_acik(self):
        self.assertTrue(montur_imalata_acik(_montur(parca_rolu="HEAD")))
        self.assertEqual(present_uyumluluk(_montur(parca_rolu="HEAD"))["parca_rolu"], "HEAD")

    def test_bos_parca_rolu_full_sayilir(self):
        self.assertTrue(montur_imalata_acik(_montur(parca_rolu="")))
        self.assertEqual(present_uyumluluk(_montur(parca_rolu=""))["parca_rolu"], "FULL")
