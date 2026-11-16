"""Dilim 3.5 — PricingService.quote + PriceQuote immutability (ADR-0008 §2.4)."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.models import (
    FiyatSozlesmesi,
    FiyatSozlesmesiKalemi,
    PriceQuote,
    PriceQuoteLine,
    TedarikciTeklif,
    VaryantFiyat,
)
from fiyatlama.services import pricing_service, sozlesme_servisi
from tanimlar.models import (
    AyarMilyem,
    FiyatGrubu,
    KiymetliMetal,
    KurPolitikasi,
    KurSaglayici,
    KurTipi,
    MetalKuru,
    SatisKanali,
)
from urunler.models import Kategori, Urun, Varyant

User = get_user_model()


class PriceQuoteFixtureMixin:
    @classmethod
    def _build_quote_world(cls):
        seed_role_permissions()
        cls.platform = ensure_platform_firma()
        cls.alici = Firma.objects.create(
            ad="PQAL",
            firma_kodu="PQAL",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.ted = Firma.objects.create(
            ad="PQTED",
            firma_kodu="PQTED",
            tedarikci_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )

        cls.finance = User(
            username="pq_fin",
            firma=cls.platform,
            rol=roles.PLATFORM_FINANCE,
            is_staff=True,
        )
        cls.finance.set_password("x")
        cls.finance.save()
        sync_user_role_groups(cls.finance)

        cls.metal = KiymetliMetal.objects.create(
            kod="AUPQ", ad="AltınPQ", gram_bazli=True
        )
        cls.ayar = AyarMilyem.objects.create(
            metal=cls.metal,
            ayar_kodu="14KPQ",
            ayar_degeri=14,
            milyem=Decimal("0.585"),
        )
        grup = FiyatGrubu.objects.create(kod="PQG", ad="PQG")
        kat = Kategori.objects.create(kod="PQK", ad="PQ Yüzük", fiyat_grubu=grup)

        cls.kanal = SatisKanali.objects.create(
            kod="PQCH", ad="PQ Kanal", quote_ttl_saniye=30
        )

        KurSaglayici.objects.filter(aktif=True).update(aktif=False)
        cls.saglayici = KurSaglayici.objects.create(
            kod="PQP",
            ad="PQ Provider",
            aktif=True,
            max_gecikme_saniye=60,
        )
        KurPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={
                "alici_kur_tipi": KurTipi.SATIS,
                "tedarikci_kur_tipi": KurTipi.ALIS,
            },
        )

        now = timezone.now()
        cls.metal_satis = MetalKuru.objects.create(
            metal=cls.metal,
            saglayici=cls.saglayici,
            kur_tipi=KurTipi.SATIS,
            zaman=now,
            alinma_zamani=now,
            saf_birim_fiyat=Decimal("4000.0000"),
            kaynak="api",
        )
        cls.metal_alis = MetalKuru.objects.create(
            metal=cls.metal,
            saglayici=cls.saglayici,
            kur_tipi=KurTipi.ALIS,
            zaman=now,
            alinma_zamani=now,
            saf_birim_fiyat=Decimal("3900.0000"),
            kaynak="api",
        )

        urun = Urun.objects.create(
            olusturan_firma=cls.platform,
            ad="PQ Ürün",
            kategori=kat,
            ayar=cls.ayar,
        )
        Urun.objects.filter(pk=urun.pk).update(
            onay_durumu="onayli",
            yayin_durumu="aktif",
            onaylayan_kullanici=cls.finance,
            onay_zamani=now,
        )
        urun.refresh_from_db()
        cls.urun = urun
        cls.varyant = Varyant.objects.create(
            urun=urun,
            gram=Decimal("2.500"),
            ek_bedel=Decimal("10.00"),
            ayar=cls.ayar,
        )

        bas, bit = date.today(), date.today() + timedelta(days=60)
        cls.soz = FiyatSozlesmesi.objects.create(
            firma=cls.alici,
            kontrat_tipi=FiyatSozlesmesi.KontratTipi.ALICI,
            satis_kanali=cls.kanal,
            gecerlilik_baslangic=bas,
            gecerlilik_bitis=bit,
            durum=FiyatSozlesmesi.Durum.TASLAK,
            olusturan_kullanici=cls.finance,
            versiyon=1,
        )
        cls.kalem = FiyatSozlesmesiKalemi.objects.create(
            sozlesme=cls.soz,
            metal=cls.metal,
            ayar=cls.ayar,
            marj_tipi=FiyatSozlesmesiKalemi.MarjTipi.TL_PARCA,
            marj_degeri=Decimal("50.00"),
            iscilik=Decimal("100.00"),
        )
        sozlesme_servisi.aktif_yap(cls.soz, cls.finance)

        # Legacy teklif satırı (belgeler FK); üretim yolu VaryantFiyat
        cls.teklif = TedarikciTeklif.objects.create(
            varyant=cls.varyant,
            tedarikci=cls.ted,
            tedarikci_kodu="PQ1",
            fiyat_modeli=TedarikciTeklif.FiyatModeli.METAL_BAZLI,
            gram=Decimal("2.500"),
            durum=TedarikciTeklif.Durum.YAYINDA,
            gecerlilik_baslangic=bas,
            gecerlilik_bitis=bit,
            eslestirme_durumu="onaylandi",
            hedef_urun=cls.urun,
            oncelik=10,
            iscilik_override=Decimal("80.00"),
        )
        cls.varyant_fiyat = VaryantFiyat.objects.create(
            varyant=cls.varyant,
            tedarikci=cls.ted,
            fiyat_modeli=VaryantFiyat.FiyatModeli.METAL_BAZLI,
            gram=Decimal("2.500"),
            durum=VaryantFiyat.Durum.AKTIF,
            iscilik=Decimal("80.00"),
            para_birimi="TRY",
            olusturan=cls.finance,
        )


class PriceQuoteServiceTests(PriceQuoteFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()

    def test_quote_metal_bazli_happy(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
            kullanici=self.finance,
        )
        # metal = 2.5 * 0.585 * 4000 = 5850; iscilik=80; marj=50; ek=10 → 5990
        self.assertEqual(pq.toplam_vergisiz, Decimal("5990.00"))
        self.assertEqual(pq.para_birimi, "TRY")
        self.assertEqual(pq.belge_turu, PriceQuote.BelgeTuru.PROFORMA)
        self.assertEqual(pq.varyant_fiyat_id, self.varyant_fiyat.pk)
        self.assertEqual(pq.alici_sozlesme_id, self.soz.pk)
        self.assertEqual(pq.metal_kuru_alici_id, self.metal_satis.pk)
        self.assertEqual(pq.metal_kuru_tedarikci_id, self.metal_alis.pk)
        self.assertEqual(pq.alici_kur_tipi, KurTipi.SATIS)
        self.assertEqual(pq.tedarikci_kur_tipi, KurTipi.ALIS)
        tipler = set(pq.satirlar.values_list("kalem_tipi", flat=True))
        self.assertIn("metal", tipler)
        self.assertIn("servis_bedeli", tipler)
        self.assertNotIn("platform_servis", tipler)
        self.assertNotIn("vergi", tipler)
        self.assertIsNone(pq.hesap_girdisi.get("platform_servis") or None)
        # None stored explicitly
        self.assertIsNone(pq.hesap_girdisi["vergi"])

    def test_ttl_yoksa_quote_yok(self):
        self.kanal.quote_ttl_saniye = None
        self.kanal.save(update_fields=["quote_ttl_saniye"])
        with self.assertRaises(ValidationError):
            pricing_service.quote(
                alici_firma=self.alici,
                satis_kanali=self.kanal,
                varyant=self.varyant,
            )

    def test_ttl_kur_max_asimi(self):
        self.kanal.quote_ttl_saniye = 120  # > saglayici 60
        self.kanal.save(update_fields=["quote_ttl_saniye"])
        with self.assertRaises(ValidationError) as ctx:
            pricing_service.quote(
                alici_firma=self.alici,
                satis_kanali=self.kanal,
                varyant=self.varyant,
            )
        self.assertIn("quote_ttl_saniye", ctx.exception.message_dict)

    def test_stale_metal_quote_lkg_banner(self):
        """ADR-0018: stale kurda quote LKG + feed_banner ile üretilir (sessiz yok)."""
        eski = timezone.now() - timedelta(seconds=120)
        MetalKuru.objects.filter(pk=self.metal_satis.pk).update(
            zaman=eski, alinma_zamani=eski
        )
        MetalKuru.objects.filter(pk=self.metal_alis.pk).update(
            zaman=eski, alinma_zamani=eski
        )
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        self.assertEqual(pq.hesap_girdisi.get("feed_health"), "FEED_STALE_LKG")
        self.assertTrue(pq.hesap_girdisi.get("feed_banner"))
        self.assertTrue(pq.hesap_girdisi.get("feed_is_lkg"))

    def test_aktif_fiyat_yok(self):
        VaryantFiyat.objects.filter(pk=self.varyant_fiyat.pk).update(
            durum=VaryantFiyat.Durum.PASIF
        )
        with self.assertRaises(ValidationError):
            pricing_service.quote(
                alici_firma=self.alici,
                satis_kanali=self.kanal,
                varyant=self.varyant,
            )

    def test_alici_sozlesme_yok(self):
        diger = Firma.objects.create(
            ad="PQAL2", firma_kodu="PQAL2", alici_mi=True
        )
        with self.assertRaises(ValidationError):
            pricing_service.quote(
                alici_firma=diger,
                satis_kanali=self.kanal,
                varyant=self.varyant,
            )

    def test_tek_aktif_varyant_fiyat(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        self.assertEqual(pq.varyant_fiyat_id, self.varyant_fiyat.pk)

    def test_gram_birim_model(self):
        VaryantFiyat.objects.filter(pk=self.varyant_fiyat.pk).update(
            durum=VaryantFiyat.Durum.PASIF
        )
        vf = VaryantFiyat.objects.create(
            varyant=self.varyant,
            tedarikci=self.ted,
            fiyat_modeli=VaryantFiyat.FiyatModeli.GRAM_BIRIM,
            gram=Decimal("2.000"),
            birim_fiyat=Decimal("100.0000"),
            para_birimi="TRY",
            durum=VaryantFiyat.Durum.AKTIF,
            olusturan=self.finance,
        )
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        self.assertEqual(pq.varyant_fiyat_id, vf.pk)
        self.assertEqual(pq.toplam_vergisiz, Decimal("260.00"))
        self.assertIn("gram_birim", pq.satirlar.values_list("kalem_tipi", flat=True))

    def test_sabit_parca_model(self):
        VaryantFiyat.objects.filter(pk=self.varyant_fiyat.pk).update(
            durum=VaryantFiyat.Durum.PASIF
        )
        vf = VaryantFiyat.objects.create(
            varyant=self.varyant,
            tedarikci=self.ted,
            fiyat_modeli=VaryantFiyat.FiyatModeli.SABIT_PARCA,
            birim_fiyat=Decimal("1500.0000"),
            para_birimi="TRY",
            durum=VaryantFiyat.Durum.AKTIF,
            olusturan=self.finance,
        )
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        self.assertEqual(pq.varyant_fiyat_id, vf.pk)
        self.assertEqual(pq.toplam_vergisiz, Decimal("1560.00"))

    def test_app_level_update_blocked(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        pq.toplam_vergisiz = Decimal("1.00")
        with self.assertRaises(ValidationError):
            pq.save()

    def test_app_level_delete_blocked(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        with self.assertRaises(ValidationError):
            pq.delete()


class PriceQuoteTriggerTests(PriceQuoteFixtureMixin, TransactionTestCase):
    """DB trigger — TestCase savepoint içinde UPDATE yakalanmayabilir; TransactionTestCase."""

    def setUp(self):
        self._build_quote_world()

    def test_db_update_trigger_rejects(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        with self.assertRaises(Exception):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute(
                        "UPDATE fiyatlama_pricequote SET toplam_vergisiz = %s WHERE id = %s",
                        [Decimal("1.00"), pq.pk],
                    )

    def test_db_delete_trigger_rejects(self):
        pq = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
        )
        with self.assertRaises(Exception):
            with transaction.atomic():
                with connection.cursor() as c:
                    c.execute(
                        "DELETE FROM fiyatlama_pricequote WHERE id = %s",
                        [pq.pk],
                    )
        self.assertTrue(PriceQuote.objects.filter(pk=pq.pk).exists())
        self.assertTrue(PriceQuoteLine.objects.filter(quote_id=pq.pk).exists())
