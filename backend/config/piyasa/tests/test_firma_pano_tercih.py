"""ADR-0041 — kuyumcu başlık + ek marj."""

from decimal import Decimal

from django.test import TestCase

from firmalar.models import Firma
from firmalar.services.platform_kurulum import ensure_platform_firma
from piyasa.models import FirmaPanoTercih, PiyasaMarjPolitikasi
from piyasa.selectors.pano import present_buyer_pano
from piyasa.services import firma_pano_tercih_servisi as tercih_srv


class FirmaPanoTercihTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        PiyasaMarjPolitikasi.objects.update_or_create(
            anahtar="default",
            defaults={"pano_baslik": "Aydemir Platform"},
        )
        cls.kuyumcu = Firma.objects.create(
            firma_kodu="KYM_TEST",
            ad="Altıncı Mehmet",
            alici_mi=True,
            platform_mu=False,
            durum=Firma.Durum.AKTIF,
            aktif=True,
            onay_durumu="onayli",
        )

    def test_baslik_kuyumcu_firma_adi(self):
        body = present_buyer_pano(firma=self.kuyumcu)
        self.assertEqual(body["baslik"], "Altıncı Mehmet")

    def test_baslik_ozel(self):
        tercih_srv.upsert_tercih(
            self.kuyumcu, data={"pano_baslik": "Mehmet Kuyumculuk"}
        )
        body = present_buyer_pano(firma=self.kuyumcu)
        self.assertEqual(body["baslik"], "Mehmet Kuyumculuk")

    def test_platform_global_baslik(self):
        platform = Firma.objects.get(platform_mu=True)
        body = present_buyer_pano(firma=platform)
        self.assertEqual(body["baslik"], "Aydemir Platform")

    def test_ek_marj_yuzde(self):
        a, s = tercih_srv.uygula_ek_marj(
            Decimal("1000"),
            Decimal("1000"),
            tercih=FirmaPanoTercih(
                marj_tipi="YUZDE",
                alis_marj=Decimal("1"),
                satis_marj=Decimal("2"),
            ),
        )
        self.assertEqual(a, Decimal("1010.00"))
        self.assertEqual(s, Decimal("1020.00"))
