"""ADR-0042 — ops kalem CRUD + hurda formülü + döviz GBP/CHF satırları."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from piyasa.models import PiyasaMarjPolitikasi, PiyasaUrun
from piyasa.selectors.pano import _doviz_satirlari, present_ops_pano_detay
from piyasa.services import hesap, piyasa_fiyat_servisi
from tanimlar.models import (
    AyarMilyem,
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTipi,
    MetalKuru,
)

User = get_user_model()


class Adr0042KalemCrudTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        platform = ensure_platform_firma()
        cls.ops = User(
            username="adr42_ops",
            firma=platform,
            rol=roles.PLATFORM_FINANCE,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

        cls.metal = KiymetliMetal.objects.create(
            kod="AU_ADR42", ad="Altın ADR42", gram_bazli=True
        )
        cls.ayar22 = AyarMilyem.objects.create(
            metal=cls.metal,
            ayar_degeri=22,
            ayar_kodu="22K",
            milyem=Decimal("0.916"),
        )
        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        sag = KurSaglayici.objects.create(
            kod="ADR42_FEED",
            ad="ADR42 feed",
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
        PiyasaMarjPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={"marj_modu": PiyasaMarjPolitikasi.MarjModu.YUZDE},
        )
        cls.hurda = PiyasaUrun.objects.create(
            kod="hurda_22",
            ad="22 Ayar Hurda",
            bolum=PiyasaUrun.Bolum.ESKI_ALTIN,
            grup=PiyasaUrun.Grup.AYAR_GRAM,
            metal=cls.metal,
            ayar=cls.ayar22,
            gram=Decimal("1"),
            marj_tipi=PiyasaUrun.MarjTipi.TL,
            alis_marj=Decimal("0"),
            satis_marj=Decimal("0"),
            sira=630,
        )

    def setUp(self):
        self.api = APIClient(enforce_csrf_checks=False)
        self.api.force_authenticate(user=self.ops)

    def test_hurda_22_formulu(self):
        out = hesap.hesapla_taraf(
            taraf=hesap.SATIS,
            saf_birim_fiyat=Decimal("6000"),
            milyem=Decimal("0.916"),
            gram=Decimal("1"),
            marj_modu=hesap.TL,
            satis_marj=Decimal("10"),
        )
        self.assertEqual(out["ham"], Decimal("5496.00"))
        self.assertEqual(out["nihai"], Decimal("5506.00"))

        baz = piyasa_fiyat_servisi.baz_fiyat("hurda_22")
        self.assertTrue(baz.get("ok") or baz.get("satis") is not None)
        # saf_alis≈5990 → ham ≈ 5990×0.916
        ham = Decimal("5990") * Decimal("0.916")
        self.assertAlmostEqual(float(baz["alis"]), float(ham), places=1)

    def test_create_visible_on_ops_detay(self):
        url = reverse("api-ops-piyasa-urun-create")
        res = self.api.post(
            url,
            {
                "ad": "Test Hurda 18",
                "grup": "AYAR_GRAM",
                "bolum": "ESKI_ALTIN",
                "metal_id": self.metal.pk,
                "ayar_id": self.ayar22.pk,
                "gram": "1",
                "marj_tipi": "TL",
                "alis_marj": "0",
                "satis_marj": "5",
                "aliciya_goster": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        kod = res.data["kod"]
        self.assertTrue(kod)
        detay = present_ops_pano_detay()
        codes = {s["kod"] for s in detay["satirlar"]}
        self.assertIn(kod, codes)
        row = next(s for s in detay["satirlar"] if s["kod"] == kod)
        self.assertEqual(Decimal(row["gram"]), Decimal("1"))
        self.assertEqual(row["metal_id"], self.metal.pk)

    def test_delete_soft_hides_from_ops(self):
        urun = PiyasaUrun.objects.create(
            kod="sil_test_42",
            ad="Silinecek",
            bolum=PiyasaUrun.Bolum.ALTIN,
            grup=PiyasaUrun.Grup.DIGER,
            metal=self.metal,
            gram=Decimal("1"),
            alis_marj=Decimal("0"),
            satis_marj=Decimal("0"),
            sira=900,
        )
        url = reverse("api-ops-piyasa-urun-patch", kwargs={"pk": urun.pk})
        res = self.api.delete(url)
        self.assertEqual(res.status_code, 204)
        urun.refresh_from_db()
        self.assertFalse(urun.aktif)
        self.assertFalse(urun.aliciya_goster)
        detay = present_ops_pano_detay()
        codes = {s["kod"] for s in detay["satirlar"]}
        self.assertNotIn("sil_test_42", codes)

    def test_patch_gram_ayar(self):
        url = reverse("api-ops-piyasa-urun-patch", kwargs={"pk": self.hurda.pk})
        res = self.api.patch(
            url,
            {"gram": "2", "ayar_id": self.ayar22.pk, "marj_tipi": "TL"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.hurda.refresh_from_db()
        self.assertEqual(self.hurda.gram, Decimal("2.0000"))

    def test_doviz_gbp_chf_rows_without_kur(self):
        rows = _doviz_satirlari(now=timezone.now())
        by_kod = {r["kod"]: r for r in rows}
        self.assertIn("gbp", by_kod)
        self.assertIn("chf", by_kod)
        self.assertIn("usd", by_kod)
        self.assertIn("eur", by_kod)
        self.assertFalse(by_kod["gbp"]["ok"])
        self.assertIsNone(by_kod["gbp"]["alis"])
