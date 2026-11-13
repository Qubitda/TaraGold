"""ADR-0033 — üyelik, durum SM, kanal izni (şema+servis dilimi)."""

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase, TransactionTestCase

from firmalar import roles
from firmalar.models import (
    Firma,
    FirmaTedarikciAltTip,
    FirmaTipAtama,
    FirmaUyelik,
    TedarikciKanalIzni,
)
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.firma_durum_servisi import gecis, onayla_firma
from firmalar.services.kanal_izin_servisi import onayla as kanal_onayla
from firmalar.services.kanal_izin_servisi import talep_et
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import assign_user_role, sync_user_role_groups
from firmalar.services.uyelik_servisi import has_firma_admin_uyelik, upsert_uyelik
from tanimlar.models import SatisKanali

User = get_user_model()


class Adr0033UyelikTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        cls.platform = ensure_platform_firma()
        cls.firma = Firma.objects.create(
            ad="U1",
            firma_kodu="U1",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.padmin = User(
            username="u1p",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.padmin.set_password("x")
        cls.padmin.save()
        sync_user_role_groups(cls.padmin)

        cls.user = User(
            username="u1a",
            firma=cls.firma,
            rol=roles.ALICI_DENETCI,
        )
        cls.user.set_password("x")
        cls.user.save()

    def test_upsert_uyelik_denormalize_and_birincil(self):
        """Gerekçe (ADR-0035): Kullanıcı birden fazla aktif üyeliğe sahip olabilir; birincil tekil."""
        other = Firma.objects.create(
            ad="U2",
            firma_kodu="U2",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        u1 = upsert_uyelik(
            kullanici=self.user,
            firma=self.firma,
            rol=roles.FIRMA_ADMIN,
            aktif=True,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.rol, roles.FIRMA_ADMIN)
        self.assertEqual(self.user.firma_id, self.firma.pk)
        self.assertTrue(u1.aktif)
        self.assertTrue(u1.birincil)

        u2 = upsert_uyelik(
            kullanici=self.user,
            firma=other,
            rol=roles.ALICI_SATINALMACI,
            aktif=True,
        )
        self.user.refresh_from_db()
        u1.refresh_from_db()
        self.assertEqual(self.user.firma_id, other.pk)
        self.assertTrue(u2.aktif)
        self.assertTrue(u2.birincil)
        self.assertTrue(u1.aktif)
        self.assertFalse(u1.birincil)
        self.assertEqual(
            FirmaUyelik.objects.filter(kullanici=self.user, birincil=True).count(), 1
        )
        self.assertEqual(
            FirmaUyelik.objects.filter(kullanici=self.user, aktif=True).count(), 2
        )

    def test_assign_user_role_writes_uyelik(self):
        assign_user_role(
            actor=self.padmin,
            user=self.user,
            firma=self.firma,
            rol=roles.ALICI_YONETICI,
        )
        self.assertTrue(
            FirmaUyelik.objects.filter(
                kullanici=self.user,
                firma=self.firma,
                rol=roles.ALICI_YONETICI,
                aktif=True,
            ).exists()
        )


class Adr0033DurumTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        cls.platform = ensure_platform_firma()
        cls.padmin = User(
            username="d1p",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.padmin.set_password("x")
        cls.padmin.save()
        sync_user_role_groups(cls.padmin)

    def test_aktif_requires_firma_admin(self):
        firma = Firma.objects.create(
            ad="D1",
            firma_kodu="D1",
            alici_mi=True,
            onay_durumu="bekliyor",
            aktif=False,
        )
        with self.assertRaises(ValidationError):
            onayla_firma(actor=self.padmin, firma=firma)

        user = User(
            username="d1a",
            firma=firma,
            rol=roles.FIRMA_ADMIN,
        )
        user.set_password("x")
        user.save()
        upsert_uyelik(
            kullanici=user, firma=firma, rol=roles.FIRMA_ADMIN, aktif=True
        )
        self.assertTrue(has_firma_admin_uyelik(firma))
        locked = onayla_firma(actor=self.padmin, firma=firma)
        self.assertEqual(locked.durum, Firma.Durum.AKTIF)
        self.assertTrue(locked.aktif)
        self.assertEqual(locked.onay_durumu, "onayli")

    def test_gecis_askida_and_back(self):
        firma = Firma.objects.create(
            ad="D2",
            firma_kodu="D2",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        user = User(username="d2a", firma=firma, rol=roles.ALICI_YONETICI)
        user.set_password("x")
        user.save()
        upsert_uyelik(
            kullanici=user, firma=firma, rol=roles.ALICI_YONETICI, aktif=True
        )
        firma.refresh_from_db()
        askida = gecis(actor=self.padmin, firma=firma, yeni_durum=Firma.Durum.ASKIDA)
        self.assertEqual(askida.durum, Firma.Durum.ASKIDA)
        self.assertFalse(askida.aktif)
        again = gecis(actor=self.padmin, firma=askida, yeni_durum=Firma.Durum.AKTIF)
        self.assertEqual(again.durum, Firma.Durum.AKTIF)


class Adr0033KanalIzinTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        cls.platform = ensure_platform_firma()
        cls.ted = Firma.objects.create(
            ad="T1",
            firma_kodu="T1",
            tedarikci_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.kanal = SatisKanali.objects.create(ad="K1", kod="K1", aktif=True)
        cls.padmin = User(
            username="k1p",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.padmin.set_password("x")
        cls.padmin.save()
        sync_user_role_groups(cls.padmin)

        cls.tsahip = User(
            username="k1t",
            firma=cls.ted,
            rol=roles.TEDARIKCI_SAHIP,
        )
        cls.tsahip.set_password("x")
        cls.tsahip.save()
        sync_user_role_groups(cls.tsahip)

    def test_self_approve_denied(self):
        izin = talep_et(
            actor=self.tsahip,
            tedarikci_firma=self.ted,
            satis_kanali=self.kanal,
        )
        self.assertEqual(izin.durum, TedarikciKanalIzni.Durum.ISTENDI)
        with self.assertRaises(PermissionDenied):
            kanal_onayla(actor=self.tsahip, izin=izin)
        ok = kanal_onayla(actor=self.padmin, izin=izin)
        self.assertEqual(ok.durum, TedarikciKanalIzni.Durum.ONAYLI)


class Adr0035CokluUyelikConstraintTests(TransactionTestCase):
    """Gerekçe (ADR-0035): Çoklu aktif FirmaUyelik serbest; yalnız tek birincil oturum zorunlu."""

    def test_partial_unique_tek_birincil_coklu_aktif(self):
        seed_role_permissions()
        ensure_platform_firma()
        a = Firma.objects.create(
            ad="C1", firma_kodu="C1", alici_mi=True, onay_durumu="onayli", aktif=True
        )
        b = Firma.objects.create(
            ad="C2", firma_kodu="C2", alici_mi=True, onay_durumu="onayli", aktif=True
        )
        user = User(username="c1u", firma=a, rol=roles.ALICI_DENETCI)
        user.set_password("x")
        user.save()
        FirmaUyelik.objects.create(
            kullanici=user, firma=a, rol=roles.ALICI_DENETCI, aktif=True, birincil=True
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FirmaUyelik.objects.create(
                    kullanici=user,
                    firma=b,
                    rol=roles.ALICI_DENETCI,
                    aktif=True,
                    birincil=True,
                )
        # ikinci aktif (birincil=False) OK
        FirmaUyelik.objects.create(
            kullanici=user, firma=b, rol=roles.ALICI_DENETCI, aktif=True, birincil=False
        )
        self.assertEqual(FirmaUyelik.objects.filter(kullanici=user, aktif=True).count(), 2)


class Adr0033TipBackfillShapeTests(TestCase):
    """Model defaults — tip/alt tip oluşturma (migration ayrı koşulur)."""

    def test_tip_models_exist(self):
        f = Firma.objects.create(
            ad="TIP1",
            firma_kodu="TIP1",
            tedarikci_mi=True,
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        FirmaTipAtama.objects.create(firma=f, tip=FirmaTipAtama.Tip.TEDARIKCI)
        FirmaTipAtama.objects.create(firma=f, tip=FirmaTipAtama.Tip.ALICI_KUYUMCU)
        FirmaTedarikciAltTip.objects.create(
            firma=f, alt_tip=FirmaTedarikciAltTip.AltTip.BELIRSIZ
        )
        self.assertEqual(f.tip_atamalari.count(), 2)
        self.assertEqual(f.tedarikci_alt_tipleri.count(), 1)
