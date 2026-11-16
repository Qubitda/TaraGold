"""ADR-0042 — Frankfurter FX/metal yedek (Binance book yokken)."""

from decimal import Decimal

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from tanimlar.models import (
    DovizKuru,
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTipi,
    MetalKuru,
)
from tanimlar.services.ingest.pipeline import persist_frankfurter_fallback
from tanimlar.services.providers import frankfurter as ff


class FrankfurterParseTests(SimpleTestCase):
    def test_mid_to_bid_ask(self):
        alis, satis = ff.mid_to_bid_ask(Decimal("100"), spread_bps=Decimal("10"))
        # ±5 bps → 99.95 / 100.05
        self.assertEqual(alis, Decimal("99.9500"))
        self.assertEqual(satis, Decimal("100.0500"))

    def test_parse_v2_list(self):
        rate = ff._parse_rate(
            [{"base": "GBP", "quote": "TRY", "rate": "66.695"}],
            base="GBP",
            quote="TRY",
        )
        self.assertEqual(rate, Decimal("66.695"))


@override_settings(
    PIYASA_FRANKFURTER={
        "enabled": True,
        "base_url": "https://api.frankfurter.dev",
        "cache_seconds": 60,
        "throttle_seconds": 0,
        "spread_bps": Decimal("10"),
        "bases": ["GBP", "CHF", "XAU"],
        "fx_fallback": ["GBP", "CHF"],
        "metal_fallback": True,
    },
    PIYASA_METAL_KOD="AU_FF",
    PIYASA_FEED_THROTTLE_SECONDS=0,
)
class FrankfurterPersistTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        cls.sag = KurSaglayici.objects.create(
            kod="FF_ING",
            ad="Frankfurter ingest",
            aktif=True,
            max_gecikme_saniye=3600,
        )
        KurPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={
                "alici_kur_tipi": KurTipi.SATIS,
                "tedarikci_kur_tipi": KurTipi.ALIS,
            },
        )
        cls.metal = KiymetliMetal.objects.create(
            kod="AU_FF", ad="Altın FF", gram_bazli=True
        )

    def setUp(self):
        cache.clear()

    def test_fills_gbp_chf_and_metal_when_binance_empty(self):
        def fake_fetch(url: str):
            if "base=GBP" in url:
                return [{"base": "GBP", "quote": "TRY", "rate": "66.695"}]
            if "base=CHF" in url:
                return [{"base": "CHF", "quote": "TRY", "rate": "60.234"}]
            if "base=XAU" in url:
                return [{"base": "XAU", "quote": "TRY", "rate": "197379"}]
            raise ValueError(url)

        written = persist_frankfurter_fallback(
            already=set(),
            now=timezone.now(),
            fetcher=fake_fetch,
        )
        self.assertIn("doviz:GBP", written)
        self.assertIn("doviz:CHF", written)
        self.assertIn("metal:AU_FF", written)
        self.assertTrue(DovizKuru.objects.filter(para_birimi="GBP").exists())
        self.assertTrue(DovizKuru.objects.filter(para_birimi="CHF").exists())
        self.assertTrue(MetalKuru.objects.filter(metal=self.metal).exists())

    def test_skips_fx_already_from_binance(self):
        def fake_fetch(url: str):
            return [{"base": "GBP", "quote": "TRY", "rate": "66"}]

        written = persist_frankfurter_fallback(
            already={"doviz:GBP", "doviz:CHF", "metal:AU_FF"},
            fetcher=fake_fetch,
        )
        self.assertEqual(written, [])
