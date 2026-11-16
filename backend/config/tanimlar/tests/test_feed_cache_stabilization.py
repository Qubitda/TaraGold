"""ADIM 1 — paylaşımlı cache + DB feed yaşı + ingest close_old_connections."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.core.checks import Error, Warning
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from config.checks import check_shared_cache_for_throttle
from tanimlar.models import (
    DovizKuru,
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTipi,
    MetalKuru,
)
from tanimlar.services.ingest import tick_store
from tanimlar.services.ingest.pipeline import feed_age_banner


class SharedCacheCheckTests(SimpleTestCase):
    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": "x",
            }
        },
        ALLOW_LOCMEM_CACHE=False,
        DEBUG=True,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_locmem_error_even_when_debug(self, _mock):
        errs = check_shared_cache_for_throttle(None)
        self.assertEqual(len(errs), 1)
        self.assertIsInstance(errs[0], Error)
        self.assertEqual(errs[0].id, "taragold.E001")

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.db.DatabaseCache",
                "LOCATION": "taragold_cache",
            }
        },
        ALLOW_LOCMEM_CACHE=False,
        DEBUG=True,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_database_cache_ok(self, _mock):
        self.assertEqual(check_shared_cache_for_throttle(None), [])

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": "x",
            }
        },
        ALLOW_LOCMEM_CACHE=True,
        DEBUG=False,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_allow_locmem_warning(self, _mock):
        msgs = check_shared_cache_for_throttle(None)
        self.assertEqual(len(msgs), 1)
        self.assertIsInstance(msgs[0], Warning)
        self.assertEqual(msgs[0].id, "taragold.W001")


@override_settings(
    PIYASA_METAL_KOD="AU_FEED",
    PIYASA_FEED_STALE_SECONDS=30,
    PIYASA_FEED_HIDE_SECONDS=300,
    PIYASA_BINANCE={
        "symbols": {
            "XAUUSDT": {"market": "futures", "role": "ons_au"},
            "USDTTRY": {"market": "spot", "role": "usdtry"},
        }
    },
)
class DbFeedAgeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        cls.sag = KurSaglayici.objects.create(
            kod="FEED_STAB",
            ad="Feed stab",
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
            kod="AU_FEED", ad="Altın Feed", gram_bazli=True
        )

    def setUp(self):
        cache.clear()

    def test_feed_ok_from_db_when_cache_empty(self):
        now = timezone.now()
        MetalKuru.objects.create(
            metal=self.metal,
            saglayici=self.sag,
            kur_tipi=KurTipi.SATIS,
            zaman=now,
            alinma_zamani=now,
            saf_birim_fiyat=Decimal("6000"),
            kaynak="api",
        )
        DovizKuru.objects.create(
            para_birimi="USD",
            kur_tipi=KurTipi.SATIS,
            zaman=now,
            alinma_zamani=now,
            kur=Decimal("40"),
            kaynak="api",
            saglayici=self.sag,
        )
        self.assertIsNone(tick_store.get_tick("XAUUSDT"))
        banner = feed_age_banner(now=now)
        self.assertEqual(banner["health"], "FEED_OK")
        self.assertEqual(banner["banner"], "")
        self.assertFalse(banner["hide"])

    def test_cache_tick_visible_via_set_get(self):
        """Aynı backend üzerinde set→get (DatabaseCache runtime; LocMem test)."""
        tick_store.set_tick(
            "XAUUSDT", bid=Decimal("100"), ask=Decimal("101"), source="test"
        )
        got = tick_store.get_tick("XAUUSDT")
        self.assertIsNotNone(got)
        self.assertEqual(got["bid"], Decimal("100"))
        age = tick_store.tick_age_seconds("XAUUSDT")
        self.assertIsNotNone(age)
        self.assertLess(age, 5)


class IngestLoopConnectionTests(SimpleTestCase):
    def test_rest_loop_closes_old_connections_each_iter(self):
        from tanimlar.management.commands.ingest_binance_piyasa import Command

        cmd = Command()
        poll = MagicMock(
            ok=True, ticks={}, persisted=[], rejected=[], errors=[]
        )
        with (
            patch(
                "tanimlar.management.commands.ingest_binance_piyasa.run_rest_poll_once",
                return_value=poll,
            ),
            patch(
                "tanimlar.management.commands.ingest_binance_piyasa.time.sleep",
                side_effect=KeyboardInterrupt,
            ),
            patch("django.db.close_old_connections") as close,
        ):
            try:
                cmd._rest_loop(interval=0.5)
            except KeyboardInterrupt:
                pass
        close.assert_called()


class PanoNoSyncBinanceTests(SimpleTestCase):
    def test_present_buyer_pano_has_no_sync_binance_poll(self):
        import inspect

        from piyasa.selectors import pano

        src = inspect.getsource(pano.present_buyer_pano)
        self.assertNotIn("ensure_fresh_feed_for_read", src)
        self.assertNotIn("run_rest_poll_once", src)
