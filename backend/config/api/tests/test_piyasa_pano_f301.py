"""GAP-F3-01 — GET /api/v1/piyasa/pano/."""

from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from piyasa.models import PiyasaMarjPolitikasi, PiyasaUrun
from tanimlar.models import (
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTipi,
    MetalKuru,
)

from django.contrib.auth import get_user_model

User = get_user_model()


class PiyasaPanoApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        platform = ensure_platform_firma()
        cls.alici = Firma.objects.create(
            ad="Pano Alıcı",
            firma_kodu="PANOA1",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.buyer = User(
            username="pano_buyer",
            email="pano_buyer@example.com",
            firma=cls.alici,
            rol=roles.ALICI_SATINALMACI,
        )
        cls.buyer.set_password("SecurePass12!")
        cls.buyer.save()
        sync_user_role_groups(cls.buyer)

        cls.ops = User(
            username="pano_ops_api",
            firma=platform,
            rol=roles.PLATFORM_FINANCE,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

        cls.metal = KiymetliMetal.objects.create(
            kod="AU_F301", ad="Altın F301", gram_bazli=True
        )
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        sag = KurSaglayici.objects.create(
            kod="F301_FEED",
            ad="F301 feed",
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
        now = timezone.now()
        for tip, fiyat in (
            (KurTipi.SATIS, Decimal("6000.0000")),
            (KurTipi.ALIS, Decimal("5990.0000")),
        ):
            MetalKuru.objects.create(
                metal=cls.metal,
                saglayici=sag,
                kur_tipi=tip,
                zaman=now,
                alinma_zamani=now,
                saf_birim_fiyat=fiyat,
                kaynak="api",
            )
        PiyasaMarjPolitikasi.objects.update_or_create(
            anahtar="default",
            defaults={"marj_modu": PiyasaMarjPolitikasi.MarjModu.YUZDE},
        )
        cls.urun = PiyasaUrun.objects.create(
            kod="has_f301",
            ad="Has F301",
            bolum=PiyasaUrun.Bolum.ALTIN,
            grup=PiyasaUrun.Grup.HAS,
            metal=cls.metal,
            gram=Decimal("1"),
            marj_tipi=PiyasaUrun.MarjTipi.YUZDE,
            # ADR-0039: eski %5 alış düşürme ≡ alis_marj=-5
            alis_marj=Decimal("-5"),
            satis_marj=Decimal("2"),
            yuvarlama_adimi=Decimal("10"),
            ticker_da_goster=True,
            olcek=PiyasaUrun.Olcek.GRAM,
        )
        PiyasaUrun.objects.create(
            kod="has_f301_kg",
            ad="Has F301 KG",
            grup=PiyasaUrun.Grup.HAS,
            metal=cls.metal,
            gram=Decimal("1"),
            alis_marj=Decimal("0"),
            satis_marj=Decimal("0"),
            yuvarlama_adimi=Decimal("0"),
            olcek=PiyasaUrun.Olcek.KG,
        )

    def setUp(self):
        self.api = APIClient(enforce_csrf_checks=False)

    def test_unauthenticated_401(self):
        res = self.api.get(reverse("api-piyasa-pano"))
        self.assertEqual(res.status_code, 401)

    def test_buyer_pano_ok_masked(self):
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(reverse("api-piyasa-pano"))
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn("server_now", res.data)
        self.assertIn("satirlar", res.data)
        codes = {s["kod"] for s in res.data["satirlar"]}
        self.assertIn("has_f301", codes)
        row = next(s for s in res.data["satirlar"] if s["kod"] == "has_f301")
        # ADR-0039 buyer alanları (marj/ham yok)
        self.assertTrue(
            {
                "kod",
                "ad",
                "fiyat",
                "alis",
                "satis",
                "bolum",
                "para_birimi",
                "olcek",
                "kaynak",
                "guncelleme",
                "banner",
            }.issubset(set(row.keys()))
        )
        self.assertIn("fiyat", row)
        self.assertEqual(row["para_birimi"], "TRY")
        self.assertIn(row["kaynak"], {"CANLI", "LKG", "MANUEL", "FAIL"})
        blob = str(res.data).lower()
        for yasak in (
            "alis_marj",
            "satis_marj",
            "marj_modu",
            "alis_detay",
            "satis_detay",
            "saf_birim",
            "gozlem",
            "maliyet",
        ):
            self.assertNotIn(yasak, blob)

    def test_olcek_filter_kg(self):
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(reverse("api-piyasa-pano"), {"olcek": "KG"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["olcek"], "KG")
        self.assertTrue(res.data["satirlar"])
        self.assertTrue(all(s["olcek"] == "KG" for s in res.data["satirlar"]))

    def test_olcek_invalid_400(self):
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(reverse("api-piyasa-pano"), {"olcek": "TON"})
        self.assertEqual(res.status_code, 400)

    def test_stale_feed_returns_lkg_and_banner_still_masked(self):
        from datetime import timedelta

        # 45s → gecikmeli LKG (30s eşiği); 300s+ hide
        eski = timezone.now() - timedelta(seconds=45)
        MetalKuru.objects.filter(metal=self.metal).update(
            zaman=eski,
            alinma_zamani=eski,
        )
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(reverse("api-piyasa-pano"))
        self.assertEqual(res.status_code, 200, res.data)
        row = next(s for s in res.data["satirlar"] if s["kod"] == "has_f301")
        self.assertEqual(row["kaynak"], "LKG")
        self.assertTrue(row["banner"] or res.data.get("gecikmeli"))
        blob = str(res.data).lower()
        for yasak in ("alis_marj", "satis_marj", "marj_modu", "saf_birim", "maliyet"):
            self.assertNotIn(yasak, blob)

    def test_cok_bayat_fiyat_gizlenir(self):
        from datetime import timedelta

        eski = timezone.now() - timedelta(seconds=400)
        MetalKuru.objects.filter(metal=self.metal).update(
            zaman=eski,
            alinma_zamani=eski,
        )
        self.api.force_authenticate(user=self.buyer)
        res = self.api.get(reverse("api-piyasa-pano"))
        self.assertEqual(res.status_code, 200, res.data)
        codes = {s["kod"] for s in res.data["satirlar"]}
        self.assertNotIn("has_f301", codes)
        self.assertIn(res.data.get("kaynak"), {"FAIL", "LKG"})
