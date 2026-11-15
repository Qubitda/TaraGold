"""ADR-0039 dilim 3 — Binance provider, anomali, throttle, bayat/hide."""

from decimal import Decimal
from datetime import timedelta

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from tanimlar.models import (
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTaraf,
    KurTipi,
    MetalKuru,
)
from tanimlar.services import kur_servisi
from tanimlar.services.ingest import anomaly, tick_store
from tanimlar.services.ingest.pipeline import apply_tick, persist_derived, run_rest_poll_once
from tanimlar.services.providers.base import BookTicker
from tanimlar.services.providers.binance import BinanceBookTickerProvider, parse_book_ticker


class AnomaliTests(SimpleTestCase):
    def test_ters_makas_red(self):
        t = BookTicker(symbol="XAUUSDT", bid=Decimal("2"), ask=Decimal("1"))
        with self.assertRaises(ValueError):
            t.validate()

    def test_sicrama_red(self):
        t = BookTicker(symbol="XAUUSDT", bid=Decimal("110"), ask=Decimal("111"))
        red = anomaly.anomali_reddi(
            t, onceki_bid=Decimal("100"), onceki_ask=Decimal("101"), max_pct=Decimal("2")
        )
        self.assertIsNotNone(red)

    def test_normal_tick_ok(self):
        t = BookTicker(symbol="XAUUSDT", bid=Decimal("100.5"), ask=Decimal("100.6"))
        red = anomaly.anomali_reddi(
            t, onceki_bid=Decimal("100"), onceki_ask=Decimal("100.1"), max_pct=Decimal("2")
        )
        self.assertIsNone(red)


class ParseBookTickerTests(SimpleTestCase):
    def test_parse(self):
        t = parse_book_ticker(
            {"bidPrice": "10.5", "askPrice": "10.6", "time": 1},
            symbol="USDTTRY",
        )
        self.assertEqual(t.bid, Decimal("10.5"))
        self.assertEqual(t.ask, Decimal("10.6"))


@override_settings(
    PIYASA_FEED_STALE_SECONDS=30,
    PIYASA_FEED_HIDE_SECONDS=300,
    PIYASA_FEED_THROTTLE_SECONDS=0,
    PIYASA_FEED_THROTTLE_PCT=Decimal("0"),
    PIYASA_METAL_KOD="AU_ING",
)
class IngestPipelineTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        cls.sag = KurSaglayici.objects.create(
            kod="BIN_ING",
            ad="Binance ingest",
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
            kod="AU_ING", ad="Altın Ingest", gram_bazli=True
        )

    def setUp(self):
        cache.clear()

    def test_apply_tick_and_fake_provider_persist(self):
        payload = {
            "XAUUSDT": {"bidPrice": "3110.35", "askPrice": "3110.35", "time": 1},
            "XAGUSDT": {"bidPrice": "30", "askPrice": "30.1", "time": 1},
            "USDTTRY": {"bidPrice": "40", "askPrice": "40", "time": 1},
            "EURUSDT": {"bidPrice": "1.1", "askPrice": "1.1", "time": 1},
        }

        def fake_fetch(url: str):
            for sym, body in payload.items():
                if f"symbol={sym}" in url:
                    return body
            raise ValueError(url)

        provider = BinanceBookTickerProvider(fetcher=fake_fetch)
        # 3110.35 / 31.1035 * 40 = 100 * 40 = 4000
        result = run_rest_poll_once(provider=provider, kaynak="api")
        self.assertTrue(result.ok, msg=result.errors + result.rejected)
        self.assertEqual(result.gram_alis.quantize(Decimal("0.01")), Decimal("4000.00"))
        self.assertTrue(
            MetalKuru.objects.filter(metal=self.metal, kur_tipi=KurTipi.SATIS).exists()
        )

    def test_anomaly_keeps_lkg_tick(self):
        ok, _ = apply_tick(
            BookTicker(symbol="XAUUSDT", bid=Decimal("100"), ask=Decimal("101"))
        )
        self.assertTrue(ok)
        ok2, reason = apply_tick(
            BookTicker(symbol="XAUUSDT", bid=Decimal("200"), ask=Decimal("201"))
        )
        self.assertFalse(ok2)
        self.assertIn("anomali", reason.lower())
        tick = tick_store.get_tick("XAUUSDT")
        self.assertEqual(tick["bid"], Decimal("100"))

    def test_hide_rejects_resolve(self):
        now = timezone.now()
        old = now - timedelta(seconds=400)
        MetalKuru.objects.create(
            metal=self.metal,
            saglayici=self.sag,
            kur_tipi=KurTipi.SATIS,
            zaman=old,
            alinma_zamani=old,
            saf_birim_fiyat=Decimal("6000"),
            kaynak="api",
        )
        with self.assertRaises(kur_servisi.KurYokError):
            kur_servisi.resolve_metal_kuru_detay(
                self.metal, taraf=KurTaraf.ALICI, now=now
            )

    def test_stale_lkg_banner(self):
        now = timezone.now()
        mid = now - timedelta(seconds=45)
        MetalKuru.objects.create(
            metal=self.metal,
            saglayici=self.sag,
            kur_tipi=KurTipi.SATIS,
            zaman=mid,
            alinma_zamani=mid,
            saf_birim_fiyat=Decimal("6000"),
            kaynak="api",
        )
        detay = kur_servisi.resolve_metal_kuru_detay(
            self.metal, taraf=KurTaraf.ALICI, now=now
        )
        self.assertEqual(detay.feed_health, "FEED_STALE_LKG")
        self.assertTrue(detay.is_lkg)
