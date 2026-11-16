"""HAS dönem özeti — XAU kline % + canlı gram."""

from datetime import date, datetime, timedelta, timezone as dt_tz
from decimal import Decimal
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from piyasa.services.ons_ozet import (
    _rebase_periods_to_has,
    compute_ons_ozet_from_klines,
    get_ons_ozet,
)
from tanimlar.models import KiymetliMetal, KurPolitikasi, KurSaglayici, KurTipi, MetalKuru


def _k(day: date, o, h, l, c):  # noqa: E741
    ts = int(
        datetime(day.year, day.month, day.day, tzinfo=dt_tz.utc).timestamp() * 1000
    )
    return [ts, str(o), str(h), str(l), str(c), "0", 0, "0", 0, "0", "0", "0"]


class OnsOzetComputeTests(SimpleTestCase):
    def test_periods_calendar(self):
        today = date(2026, 11, 16)  # pazartesi
        rows = [
            _k(date(2026, 1, 2), 80, 85, 79, 82),
            _k(date(2026, 11, 1), 95, 96, 94, 95),
            _k(date(2026, 11, 9), 102, 103, 101, 102),  # 7g önce
            _k(date(2026, 11, 13), 100, 101, 99, 100),
            _k(today, 100, 120, 99, 110),
        ]
        now = timezone.make_aware(
            datetime(2026, 11, 16, 12, 0, 0), timezone.get_current_timezone()
        )
        ozet = compute_ons_ozet_from_klines(rows, now=now)
        self.assertTrue(ozet["ok"])
        by = {d["etiket"]: d for d in ozet["donemler"]}
        self.assertEqual(by["Bugün"]["degisim_yuzde"], "10.00")
        # 7g kapanış 102 → (110-102)/102
        self.assertEqual(by["Bu hafta"]["degisim_yuzde"], "7.84")
        self.assertNotEqual(by["Bugün"]["degisim_yuzde"], by["Bu hafta"]["degisim_yuzde"])
        self.assertEqual(by["Bu ay"]["degisim_yuzde"], "15.79")  # Nov1 open 95
        self.assertEqual(by["Bu yıl"]["degisim_yuzde"], "37.50")  # Jan2 open 80

    def test_rebase_to_has(self):
        raw = {
            "ok": True,
            "donemler": [
                {
                    "etiket": "Bugün",
                    "fiyat": "110",
                    "referans": "100",
                    "degisim_yuzde": "10.00",
                    "yon": "up",
                }
            ],
        }
        out = _rebase_periods_to_has(raw, Decimal("5500"))
        self.assertEqual(out["sembol"], "HAS")
        self.assertEqual(out["pb"], "TRY")
        self.assertEqual(out["son"], "5500.00")
        d0 = out["donemler"][0]
        self.assertEqual(d0["fiyat"], "5500.00")
        self.assertEqual(d0["degisim_yuzde"], "10.00")
        # 5500 / 1.10 = 5000
        self.assertEqual(d0["referans"], "5000.00")


@override_settings(PIYASA_ONS_OZET_CACHE_SECONDS=60, PIYASA_METAL_KOD="AU_HAS_OZ")
class HasOzetFetchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        sag = KurSaglayici.objects.create(
            kod="HAS_OZ", ad="Has ozet", aktif=True, max_gecikme_saniye=3600
        )
        KurPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={
                "alici_kur_tipi": KurTipi.SATIS,
                "tedarikci_kur_tipi": KurTipi.ALIS,
            },
        )
        metal = KiymetliMetal.objects.create(
            kod="AU_HAS_OZ", ad="Altın Has Ozet", gram_bazli=True
        )
        now = timezone.now()
        MetalKuru.objects.create(
            metal=metal,
            saglayici=sag,
            kur_tipi=KurTipi.SATIS,
            zaman=now,
            alinma_zamani=now,
            saf_birim_fiyat=Decimal("6000.00"),
            kaynak="api",
        )

    def setUp(self):
        cache.clear()

    def test_fetcher_ok_has(self):
        start = date(2026, 1, 1)
        rows = [_k(start + timedelta(days=i), 100, 101, 99, 100) for i in range(40)]
        rows.append(_k(date(2026, 11, 16), 100, 110, 100, 105))

        def fake(_url: str):
            return rows

        ozet = get_ons_ozet(fetcher=fake, force=True)
        self.assertTrue(ozet["ok"])
        self.assertEqual(ozet["sembol"], "HAS")
        self.assertEqual(ozet["pb"], "TRY")
        self.assertEqual(ozet["son"], "6000.00")
        self.assertEqual(len(ozet["donemler"]), 4)

    def test_fetcher_fail_soft(self):
        def boom(_url: str):
            raise RuntimeError("down")

        ozet = get_ons_ozet(fetcher=boom, force=True)
        self.assertFalse(ozet["ok"])
        self.assertEqual(ozet["donemler"], [])
