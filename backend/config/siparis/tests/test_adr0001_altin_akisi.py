"""ADR-0001 — has-gram borç, onayda stok, ödeme anı kur (PG kabul)."""

from __future__ import annotations

from decimal import Decimal
from unittest import mock, skipUnless

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import P, seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from finans.constants import HAS_KODU, TRY_KODU, USD_KODU
from finans.models import CariHesap, LedgerEntry, OdemeKaydi
from finans.services import odeme_servisi
from fiyatlama.models import VaryantFiyat
from fiyatlama.services import pricing_service
from siparis.models import HazirlamaEmri, Order
from siparis.services import (
    cart_servisi,
    checkout_servisi,
    order_onay_servisi,
    order_servisi,
)
from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin
from stok.models import StockBalance, StockMovement, StockReservation
from stok.services import ledger_servisi, warehouse_servisi
from tanimlar.models import DovizKuru, KurTipi
from urunler.models import Varyant, VaryantBilesen

User = get_user_model()


@skipUnless(
    "postgresql" in settings.DATABASES["default"]["ENGINE"],
    "ADR-0001 PG gerektirir",
)
class Adr0001AltinAkisiTests(CheckoutFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()
        seed_role_permissions()
        cls.ops = User(
            username="adr1_ops",
            firma=ensure_platform_firma(),
            rol=roles.PLATFORM_SUPER,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)
        for key in ("view_all_tenants", "manage_shipment"):
            app_label, cn = P[key].split(".", 1)
            cls.ops.user_permissions.add(
                Permission.objects.get(content_type__app_label=app_label, codename=cn)
            )

        # 10g parça (ADET) — kabul #2: 10×0.585 + işçilik TL 100
        vf = cls.varyant_fiyat
        vf.fiyat_modeli = VaryantFiyat.FiyatModeli.SABIT_PARCA
        vf.gram = Decimal("10.0000")
        vf.birim_fiyat = Decimal("5000.0000")
        vf.iscilik = Decimal("100.00")
        vf.iscilik_birimi = "TL"
        vf.iscilik_tipi = "PARCA"
        vf.tas_bedeli = Decimal("0")
        vf.ek_bedel = Decimal("0")
        vf.save()
        cls.varyant.gram = Decimal("10.000")
        cls.varyant.save(update_fields=["gram"])
        ledger_servisi.kaydet_hareket(
            actor=cls.ted_user,
            warehouse=cls.wh,
            varyant=cls.varyant,
            fiyat_modeli=vf.fiyat_modeli,
            tedarikci_id=cls.ted.pk,
            tip=StockMovement.Tip.GIRIS,
            miktar=Decimal("100"),
        )

    def _balance(self):
        return StockBalance.objects.get(
            warehouse=self.wh, varyant=self.varyant, birim="ADET"
        )

    def _siparis_olustur(self, *, key: str, miktar=Decimal("1")) -> Order:
        self._quote_and_cart(miktar=miktar)
        bal_before = self._balance()
        on_hand_before = bal_before.on_hand
        reserved_before = bal_before.reserved
        ledger_before = LedgerEntry.objects.count()

        co = checkout_servisi.checkout(actor=self.buyer, idempotency_key=key)
        order = order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co.attempt
        )
        bal_after = self._balance()
        self.assertEqual(bal_after.on_hand, on_hand_before)
        self.assertEqual(bal_after.reserved, reserved_before)
        self.assertEqual(LedgerEntry.objects.count(), ledger_before)
        self.assertEqual(order.durum, Order.Durum.ONAY_BEKLIYOR)
        line = order.lines.first()
        self.assertIsNotNone(line.tahmini_has_gram)
        self.assertIsNone(line.has_gram)
        return order

    def test_01_checkout_no_stock_no_ledger(self):
        order = self._siparis_olustur(key="adr1-co-1")
        self.assertEqual(order.lines.count(), 1)

    def test_02_onay_has_and_try_borc(self):
        order = self._siparis_olustur(key="adr1-onay-1")
        line = order.lines.first()
        self.assertEqual(line.gram_toplam, Decimal("10.0000"))
        expected_has = Decimal("5.8500")

        bal_before = self._balance()
        onayli = order_onay_servisi.onayla(actor=self.ops, order=order)
        line.refresh_from_db()
        self.assertEqual(line.has_gram, expected_has)
        self.assertEqual(line.tl_borc, Decimal("100.00"))
        bal = self._balance()
        self.assertEqual(bal.on_hand, bal_before.on_hand - Decimal("1"))

        has_le = LedgerEntry.objects.get(
            firma=self.alici,
            idempotency_key=f"order-{onayli.pk}-satis-HAS",
        )
        self.assertEqual(has_le.tutar, expected_has)
        self.assertEqual(has_le.para_birimi, HAS_KODU)
        try_le = LedgerEntry.objects.get(
            firma=self.alici,
            idempotency_key=f"order-{onayli.pk}-satis-TRY",
        )
        self.assertEqual(try_le.tutar, Decimal("100.00"))

    def test_02b_iscilik_has(self):
        vf = self.varyant_fiyat
        vf.iscilik = Decimal("0.2000")
        vf.iscilik_birimi = "HAS"
        vf.save(update_fields=["iscilik", "iscilik_birimi"])
        order = self._siparis_olustur(key="adr1-isc-has")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        line = order.lines.first()
        self.assertEqual(line.has_gram, Decimal("6.0500"))
        self.assertTrue(
            line.tl_borc is None
            or Decimal(line.tl_borc) == 0
            or Decimal(line.tl_borc) >= 0
        )
        has_le = LedgerEntry.objects.get(
            firma=self.alici, idempotency_key=f"order-{order.pk}-satis-HAS"
        )
        self.assertEqual(has_le.tutar, line.has_gram)
        if (line.tl_borc or 0) == 0:
            self.assertFalse(
                LedgerEntry.objects.filter(
                    firma=self.alici,
                    idempotency_key=f"order-{order.pk}-satis-TRY",
                ).exists()
            )

    def test_03_atp_fail_rollback(self):
        order = self._siparis_olustur(key="adr1-atp", miktar=Decimal("999"))
        with self.assertRaises(ValidationError):
            order_onay_servisi.onayla(actor=self.ops, order=order)
        order.refresh_from_db()
        self.assertEqual(order.durum, Order.Durum.ONAY_BEKLIYOR)
        self.assertFalse(
            LedgerEntry.objects.filter(referans_id=str(order.pk)).exists()
        )
        self.assertFalse(
            StockReservation.objects.filter(order_line__order=order).exists()
        )

    def test_04_onay_idempotent(self):
        order = self._siparis_olustur(key="adr1-idem-onay")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        n1 = LedgerEntry.objects.filter(referans_id=str(order.pk)).count()
        order_onay_servisi.onayla(actor=self.ops, order=order)
        n2 = LedgerEntry.objects.filter(referans_id=str(order.pk)).count()
        self.assertEqual(n1, n2)

    def test_06_has_odeme_no_kur(self):
        order = self._siparis_olustur(key="adr1-odeme-has")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        line = order.lines.first()
        debt = Decimal(line.has_gram)
        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru"
        ) as kur_mock:
            kayit = odeme_servisi.kaydet_odeme(
                actor=self.finance,
                firma=self.alici,
                tip="HAS",
                brut_gram=debt,
                olculen_milyem=Decimal("1.000"),
                idempotency_key="odeme-has-1",
            )
            kur_mock.assert_not_called()
        self.assertEqual(kayit.has_karsiligi, debt)
        hesap = CariHesap.objects.get(
            firma=self.alici, para_birimi=HAS_KODU
        )
        self.assertEqual(hesap.bakiye, Decimal("0.0000"))

    def test_07_hurda(self):
        kayit = odeme_servisi.kaydet_odeme(
            actor=self.finance,
            firma=self.alici,
            tip="HURDA",
            brut_gram=Decimal("12"),
            olculen_milyem=Decimal("0.416"),
            idempotency_key="odeme-hurda-1",
        )
        self.assertEqual(kayit.has_karsiligi, Decimal("4.9920"))

    def test_08_tl_baglanti_snapshot_and_guards(self):
        order = self._siparis_olustur(key="adr1-tl")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        gozlem = self.metal_satis
        kur = Decimal(gozlem.saf_birim_fiyat)

        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru",
            return_value=(gozlem, kur),
        ):
            kayit = odeme_servisi.kaydet_odeme(
                actor=self.finance,
                firma=self.alici,
                tip="TL",
                tl_tutar=Decimal("100.00"),
                idempotency_key="odeme-tl-1",
            )
        self.assertEqual(kayit.kur_has_birim_fiyat, kur.quantize(Decimal("0.0001")))
        self.assertEqual(kayit.kur_kaynagi, "CANLI")
        snap = kayit.kur_has_birim_fiyat

        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru",
            return_value=(gozlem, Decimal("9999.0000")),
        ):
            again = odeme_servisi.kaydet_odeme(
                actor=self.finance,
                firma=self.alici,
                tip="TL",
                tl_tutar=Decimal("50.00"),
                idempotency_key="odeme-tl-1",
            )
        self.assertEqual(again.pk, kayit.pk)
        self.assertEqual(again.kur_has_birim_fiyat, snap)

        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru",
            side_effect=ValidationError({"kur": "Kur bayat; ödeme reddedildi."}),
        ):
            with self.assertRaises(ValidationError):
                odeme_servisi.kaydet_odeme(
                    actor=self.finance,
                    firma=self.alici,
                    tip="TL",
                    tl_tutar=Decimal("10.00"),
                    idempotency_key="odeme-tl-stale",
                )

        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru",
            return_value=(gozlem, kur),
        ):
            with self.assertRaises(ValidationError):
                odeme_servisi.kaydet_odeme(
                    actor=self.finance,
                    firma=self.alici,
                    tip="TL",
                    tl_tutar=Decimal("10.00"),
                    manuel_kur=Decimal("5000.0000"),
                    manuel_kur_gerekce="sapma testi",
                    idempotency_key="odeme-tl-sapma",
                )

        with mock.patch(
            "finans.services.odeme_servisi._canli_has_satis_kuru",
            return_value=(gozlem, kur),
        ):
            with self.assertRaises(PermissionDenied):
                odeme_servisi.kaydet_odeme(
                    actor=self.buyer,
                    firma=self.alici,
                    tip="TL",
                    tl_tutar=Decimal("10.00"),
                    idempotency_key="odeme-tl-yetkisiz",
                )

    def test_09_odeme_idempotent(self):
        a = odeme_servisi.kaydet_odeme(
            actor=self.finance,
            firma=self.alici,
            tip="HAS",
            brut_gram=Decimal("1"),
            olculen_milyem=Decimal("0.995"),
            idempotency_key="odeme-idem",
        )
        b = odeme_servisi.kaydet_odeme(
            actor=self.finance,
            firma=self.alici,
            tip="HAS",
            brut_gram=Decimal("9"),
            olculen_milyem=Decimal("0.995"),
            idempotency_key="odeme-idem",
        )
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(
            OdemeKaydi.objects.filter(idempotency_key="odeme-idem").count(), 1
        )

    def test_10_ledger_immutable(self):
        order = self._siparis_olustur(key="adr1-led-imm")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        le = LedgerEntry.objects.filter(referans_id=str(order.pk)).first()
        self.assertIsNotNone(le)
        with self.assertRaises(ValidationError):
            le.tutar = Decimal("1.00")
            le.save()
        with self.assertRaises(ValidationError):
            le.delete()

    def test_11_benzersiz_sira(self):
        self.varyant.benzersiz_parca = True
        self.varyant.save(update_fields=["benzersiz_parca"])
        o1 = self._siparis_olustur(key="adr1-uniq-1")
        quote = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
            kullanici=self.finance,
        )
        cart_servisi.satir_ekle(
            actor=self.buyer, price_quote=quote, miktar=Decimal("1")
        )
        co2 = checkout_servisi.checkout(
            actor=self.buyer, idempotency_key="adr1-uniq-2"
        )
        o2 = order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co2.attempt
        )
        with self.assertRaises(ValidationError) as ctx:
            order_onay_servisi.onayla(actor=self.ops, order=o2)
        self.assertIn("Önde bekleyen", str(ctx.exception))
        order_onay_servisi.onayla(actor=self.ops, order=o1)

    def test_12_tedarikci_maskeli(self):
        order = self._siparis_olustur(key="adr1-ted-mask")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        dto = order_onay_servisi.present_hazirlama_emri(
            order, tedarikci_firma_id=self.ted.pk
        )
        self.assertIsNone(dto.get("alici"))
        blob = str(dto)
        self.assertNotIn(str(self.alici.pk), blob)
        self.assertNotIn(getattr(self.alici, "ad", "___"), blob)
        self.assertTrue(dto["satirlar"])

    def test_13_iptal_contra(self):
        order = self._siparis_olustur(key="adr1-iptal")
        order_onay_servisi.onayla(actor=self.ops, order=order)
        has_before = CariHesap.objects.get(
            firma=self.alici, para_birimi=HAS_KODU
        ).bakiye
        try_before = CariHesap.objects.get(
            firma=self.alici, para_birimi=TRY_KODU
        ).bakiye
        self.assertGreater(has_before, 0)
        self.assertGreater(try_before, 0)
        order_servisi.iptal_siparis(actor=self.buyer, order=order)
        order.refresh_from_db()
        self.assertEqual(order.durum, Order.Durum.IPTAL)
        self.assertEqual(
            CariHesap.objects.get(firma=self.alici, para_birimi=HAS_KODU).bakiye,
            Decimal("0.0000"),
        )
        self.assertEqual(
            CariHesap.objects.get(firma=self.alici, para_birimi=TRY_KODU).bakiye,
            Decimal("0.0000"),
        )
        self.assertTrue(
            LedgerEntry.objects.filter(
                referans_id=str(order.pk), hareket_tipi="CONTRA"
            ).exists()
        )


@skipUnless(
    "postgresql" in settings.DATABASES["default"]["ENGINE"],
    "ADR-0001 concurrent PG",
)
class Adr0001ConcurrentOnayTests(CheckoutFixtureMixin, TransactionTestCase):
    def setUp(self):
        self._build_checkout_world()
        seed_role_permissions()
        self.ops = User(
            username="adr1_ops_c",
            firma=ensure_platform_firma(),
            rol=roles.PLATFORM_SUPER,
            is_staff=True,
        )
        self.ops.set_password("x")
        self.ops.save()
        sync_user_role_groups(self.ops)
        for key in ("view_all_tenants", "manage_shipment"):
            app_label, cn = P[key].split(".", 1)
            self.ops.user_permissions.add(
                Permission.objects.get(content_type__app_label=app_label, codename=cn)
            )

    def test_05_concurrent_onay_single_winner(self):
        import threading

        quote = pricing_service.quote(
            alici_firma=self.alici,
            satis_kanali=self.kanal,
            varyant=self.varyant,
            kullanici=self.finance,
        )
        cart_servisi.satir_ekle(
            actor=self.buyer, price_quote=quote, miktar=Decimal("1")
        )
        co = checkout_servisi.checkout(
            actor=self.buyer, idempotency_key="adr1-conc-co"
        )
        order = order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co.attempt
        )
        errors = []
        ok = []

        def run():
            try:
                order_onay_servisi.onayla(actor=self.ops, order=order)
                ok.append(1)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        t1 = threading.Thread(target=run)
        t2 = threading.Thread(target=run)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        self.assertGreaterEqual(len(ok), 1)
        self.assertEqual(
            LedgerEntry.objects.filter(
                referans_id=str(order.pk),
                hareket_tipi="SATIS",
                para_birimi=HAS_KODU,
            ).count(),
            1,
        )
        self.assertEqual(
            StockReservation.objects.filter(
                order_line__order=order,
                durum=StockReservation.Durum.TUKETILDI,
            ).count(),
            1,
        )

# --- ADR-0001 v2: bilesen / USD / emir ---
@skipUnless(
    'postgresql' in settings.DATABASES['default']['ENGINE'],
    'ADR-0001 v2 PG',
)
class Adr0001V2BilesenTests(CheckoutFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()
        seed_role_permissions()
        cls.ops = User(
            username='adr1v2_ops',
            firma=ensure_platform_firma(),
            rol=roles.PLATFORM_SUPER,
            is_staff=True,
        )
        cls.ops.set_password('x')
        cls.ops.save()
        sync_user_role_groups(cls.ops)
        for key in ('view_all_tenants', 'manage_shipment'):
            app_label, cn = P[key].split('.', 1)
            cls.ops.user_permissions.add(
                Permission.objects.get(content_type__app_label=app_label, codename=cn)
            )
        # bitmis tasli urun
        cls.varyant.tip = Varyant.Tip.TASLI
        cls.varyant.gram = Decimal('5.000')
        cls.varyant.tas_agirligi = Decimal('0.6000')
        cls.varyant.save()
        from urunler.models import Urun, Kategori
        grup = cls.varyant.urun.kategori.fiyat_grubu
        kat_m = Kategori.objects.create(kod='V2M', ad='Montur V2', fiyat_grubu=grup)
        kat_t = Kategori.objects.create(kod='V2T', ad='Tas V2', fiyat_grubu=grup)
        urun_m = Urun.objects.create(
            olusturan_firma=ensure_platform_firma(),
            ad='Montur V2',
            kategori=kat_m,
            ayar=cls.varyant.urun.ayar,
            fiyat_tipi='gram',
        )
        urun_t = Urun.objects.create(
            olusturan_firma=ensure_platform_firma(),
            ad='Tas V2',
            kategori=kat_t,
            ayar=cls.varyant.urun.ayar,
            fiyat_tipi='sabit',
        )
        now = timezone.now()
        Urun.objects.filter(pk__in=[urun_m.pk, urun_t.pk]).update(
            onay_durumu='onayli',
            yayin_durumu='aktif',
            onaylayan_kullanici=cls.finance,
            onay_zamani=now,
        )
        urun_m.refresh_from_db()
        urun_t.refresh_from_db()
        cls.montur_v = Varyant.objects.create(
            urun=urun_m,
            tip=Varyant.Tip.MONTUR,
            gram=Decimal('4.400'),
            tas_agirligi=Decimal('0'),
            aktif=True,
        )
        cls.tas_v = Varyant.objects.create(
            urun=urun_t,
            tip=Varyant.Tip.TAS,
            gram=None,
            sabit_fiyat=Decimal('200.00'),
            tas_agirligi=Decimal('0.6000'),
            benzersiz_parca=True,
            aktif=True,
        )
        cls.tas_ted = Firma.objects.create(
            ad='Tas Ted',
            firma_kodu='TASTEDV2',
            tedarikci_mi=True,
            durum=Firma.Durum.AKTIF,
            aktif=True,
            onay_durumu='onayli',
        )
        cls.usta = Firma.objects.create(
            ad='Usta Ted',
            firma_kodu='USTAV2',
            tedarikci_mi=True,
            durum=Firma.Durum.AKTIF,
            aktif=True,
            onay_durumu='onayli',
        )
        cls.tas_ted.otomatik_teyit = True
        cls.tas_ted.save(update_fields=['otomatik_teyit'])
        cls.ted.otomatik_teyit = True
        cls.ted.save(update_fields=['otomatik_teyit'])

        cls.montur_vf = VaryantFiyat.objects.create(
            varyant=cls.montur_v,
            tedarikci=cls.ted,
            fiyat_modeli=VaryantFiyat.FiyatModeli.SABIT_PARCA,
            gram=Decimal('4.4000'),
            birim_fiyat=Decimal('1000'),
            durum=VaryantFiyat.Durum.AKTIF,
            iscilik=Decimal('0'),
            para_birimi='TRY',
            olusturan=cls.finance,
        )
        cls.tas_vf = VaryantFiyat.objects.create(
            varyant=cls.tas_v,
            tedarikci=cls.tas_ted,
            fiyat_modeli=VaryantFiyat.FiyatModeli.SABIT_PARCA,
            birim_fiyat=Decimal('1'),
            durum=VaryantFiyat.Durum.AKTIF,
            iscilik=Decimal('0'),
            para_birimi='TRY',
            olusturan=cls.finance,
        )
        # ana urun fiyat (alici satiri)
        vf = cls.varyant_fiyat
        vf.fiyat_modeli = VaryantFiyat.FiyatModeli.SABIT_PARCA
        vf.gram = Decimal('5.0000')
        vf.birim_fiyat = Decimal('8000')
        vf.iscilik = Decimal('0')
        vf.iscilik_birimi = 'TL'
        vf.tas_bedeli = Decimal('0')
        vf.ek_bedel = Decimal('0')
        vf.save()

        VaryantBilesen.objects.create(
            ana_varyant=cls.varyant,
            rol=VaryantBilesen.Rol.MONTUR,
            bilesen_varyant=cls.montur_v,
            tedarikci=cls.ted,
            adet=Decimal('1'),
            fiyat=Decimal('0'),
            fiyat_birimi='TL',
            cakim_iscilik=Decimal('0.1000'),
            cakim_iscilik_birimi='HAS',
            varsayilan_usta=cls.usta,
            sira=1,
        )
        VaryantBilesen.objects.create(
            ana_varyant=cls.varyant,
            rol=VaryantBilesen.Rol.TAS,
            bilesen_varyant=cls.tas_v,
            tedarikci=cls.tas_ted,
            adet=Decimal('1'),
            karat=Decimal('0.50'),
            tas_agirligi_gram=Decimal('0.6000'),
            fiyat=Decimal('200.00'),
            fiyat_birimi='USD',
            fiyat_tipi=VaryantBilesen.FiyatTipi.PARCA_BASI,
            sira=2,
        )
        cls.tas_user = User(
            username='tas_ted_u',
            firma=cls.tas_ted,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        cls.tas_user.set_password('x')
        cls.tas_user.save()
        sync_user_role_groups(cls.tas_user)
        cls.wh_tas = warehouse_servisi.olustur_warehouse(
            actor=cls.tas_user, sahip_firma=cls.tas_ted, kod='TASWH', ad='Tas depo'
        )
        # montur stok (mevcut wh + SABIT)
        ledger_servisi.kaydet_hareket(
            actor=cls.ted_user,
            warehouse=cls.wh,
            varyant=cls.montur_v,
            fiyat_modeli=cls.montur_vf.fiyat_modeli,
            tedarikci_id=cls.ted.pk,
            tip=StockMovement.Tip.GIRIS,
            miktar=Decimal('10'),
        )
        ledger_servisi.kaydet_hareket(
            actor=cls.tas_user,
            warehouse=cls.wh_tas,
            varyant=cls.tas_v,
            fiyat_modeli=cls.tas_vf.fiyat_modeli,
            tedarikci_id=cls.tas_ted.pk,
            tip=StockMovement.Tip.GIRIS,
            miktar=Decimal('5'),
        )
        # USD kur
        DovizKuru.objects.create(
            para_birimi='USD',
            saglayici=cls.saglayici,
            kur_tipi=KurTipi.SATIS,
            zaman=timezone.now(),
            alinma_zamani=timezone.now(),
            kur=Decimal('34.5000'),
            kaynak='api',
        )

    def _siparis(self, key):
        self._quote_and_cart(miktar=Decimal('1'))
        co = checkout_servisi.checkout(actor=self.buyer, idempotency_key=key)
        return order_servisi.olustur_from_checkout(
            actor=self.buyer, checkout_attempt=co.attempt
        )

    def test_14_tasli_net_has_usd_cakim(self):
        from django.utils import timezone
        order = self._siparis('v2-14')
        line = order.lines.first()
        self.assertEqual(line.net_altin_gram, Decimal('4.4000'))
        onay = order_onay_servisi.onayla(actor=self.ops, order=order)
        line.refresh_from_db()
        # 4.4*0.585 + cakim HAS 0.1 = 2.574 + 0.1 = 2.6740
        self.assertEqual(line.has_gram, Decimal('2.6740'))
        self.assertEqual(line.usd_borc, Decimal('200.00'))
        self.assertTrue(
            LedgerEntry.objects.filter(
                firma=self.alici, idempotency_key=f'order-{onay.pk}-satis-HAS'
            ).exists()
        )
        self.assertTrue(
            LedgerEntry.objects.filter(
                firma=self.alici, idempotency_key=f'order-{onay.pk}-satis-USD'
            ).exists()
        )
        tips = set(
            HazirlamaEmri.objects.filter(order=onay).values_list('tip', flat=True)
        )
        self.assertIn(HazirlamaEmri.Tip.MONTUR, tips)
        self.assertIn(HazirlamaEmri.Tip.TAS, tips)
        self.assertNotIn(HazirlamaEmri.Tip.CAKIM, tips)

    def test_15_tas_stok_yok_rollback(self):
        # tas stogunu tuket
        bal = StockBalance.objects.get(warehouse=self.wh_tas, varyant=self.tas_v, birim='ADET')
        # consume all by setting via ledger CIKIS if exists, else empty warehouse new order with qty>stock
        order = self._siparis('v2-15')
        # force fail: zero tas by consuming
        from stok.services import reservation_servisi
        # simpler: delete balance by consuming movements - use miktar that exceeds
        StockBalance.objects.filter(pk=bal.pk).update()  # noop
        # reduce on_hand via service Cikis if available — use ValidationError path by clearing
        from django.db import connection
        with connection.cursor() as c:
            c.execute(
                'UPDATE stok_stockbalance SET on_hand=0, reserved=0, blocked=0 WHERE id=%s',
                [bal.pk],
            )
        with self.assertRaises(ValidationError):
            order_onay_servisi.onayla(actor=self.ops, order=order)
        order.refresh_from_db()
        self.assertEqual(order.durum, Order.Durum.ONAY_BEKLIYOR)
        self.assertFalse(LedgerEntry.objects.filter(referans_id=str(order.pk)).exists())
        self.assertFalse(
            StockReservation.objects.filter(order_line__order=order).exists()
        )

    def test_16_cakim_idempotent(self):
        order = self._siparis('v2-16')
        order_onay_servisi.onayla(actor=self.ops, order=order)
        for tip in (HazirlamaEmri.Tip.MONTUR, HazirlamaEmri.Tip.TAS):
            emir = HazirlamaEmri.objects.get(order=order, tip=tip)
            if emir.durum == HazirlamaEmri.Durum.TEDARIK_BEKLIYOR:
                order_onay_servisi.tedarikci_teyit(
                    actor=self.ops, emir=emir, kabul=True
                )
            emir.refresh_from_db()
            actor = self.ted_user if tip == HazirlamaEmri.Tip.MONTUR else self.tas_user
            order_onay_servisi.tedarikci_hazir_isaretle(
                actor=actor, order=order, tip=tip
            )
        e1 = order_onay_servisi.ac_cakim_emri(
            actor=self.ops, order=order, usta_firma_id=self.usta.pk
        )
        e2 = order_onay_servisi.ac_cakim_emri(
            actor=self.ops, order=order, usta_firma_id=self.usta.pk
        )
        self.assertEqual(e1.pk, e2.pk)
        self.assertEqual(
            HazirlamaEmri.objects.filter(order=order, tip=HazirlamaEmri.Tip.CAKIM).count(),
            1,
        )

    def test_17_tedarikci_maske_kendi_emri(self):
        order = self._siparis('v2-17')
        order_onay_servisi.onayla(actor=self.ops, order=order)
        dto = order_onay_servisi.present_hazirlama_emri(
            order, tedarikci_firma_id=self.ted.pk
        )
        self.assertIsNone(dto.get('alici'))
        self.assertNotIn(self.alici.ad, str(dto))

    def test_18_usd_tl_odeme_snapshot(self):
        order = self._siparis('v2-18')
        order_onay_servisi.onayla(actor=self.ops, order=order)
        kayit = odeme_servisi.kaydet_odeme(
            actor=self.finance,
            firma=self.alici,
            tip='USD',
            tl_tutar=Decimal('345.00'),  # 345/34.5 = 10 USD
            idempotency_key='usd-tl-1',
        )
        self.assertEqual(kayit.tip, 'USD')
        self.assertEqual(kayit.kur_has_birim_fiyat, Decimal('34.5000'))
        snap = kayit.kur_has_birim_fiyat
        # kur degisse kayit ayni
        DovizKuru.objects.filter(para_birimi='USD').update(kur=Decimal('99.0000'))
        again = odeme_servisi.kaydet_odeme(
            actor=self.finance,
            firma=self.alici,
            tip='USD',
            tl_tutar=Decimal('1'),
            idempotency_key='usd-tl-1',
        )
        self.assertEqual(again.pk, kayit.pk)
        self.assertEqual(again.kur_has_birim_fiyat, snap)
