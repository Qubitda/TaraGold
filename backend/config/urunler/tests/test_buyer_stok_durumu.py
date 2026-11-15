"""Alıcı detay stok_durumu maskesi (depo/tedarikçi yok)."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.models import TedarikciTeklif
from stok.models import StockBalance, Warehouse
from tanimlar.models import AyarMilyem, FiyatGrubu, KiymetliMetal
from urunler.models import Kategori, Urun, Varyant
from urunler.services.buyer_katalog_servisi import detay

User = get_user_model()


class BuyerStokDurumuTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        platform = ensure_platform_firma()
        ops = User(
            username="bsd_ops",
            firma=platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        ops.set_password("x")
        ops.save()
        sync_user_role_groups(ops)
        metal = KiymetliMetal.objects.create(
            kod="AU_BSD", ad="Altın BSD", gram_bazli=True
        )
        ayar = AyarMilyem.objects.create(
            metal=metal,
            ayar_kodu="14BSD",
            ayar_degeri="14",
            milyem=Decimal("0.585"),
        )
        fg = FiyatGrubu.objects.create(kod="BSD", ad="BSD")
        kat = Kategori.objects.create(kod="BSD_K", ad="BSD Kat", fiyat_grubu=fg)
        cls.urun = Urun.objects.create(
            olusturan_firma=platform,
            ad="BSD Ürün",
            kategori=kat,
            ayar=ayar,
            temin_tipi="hazir",
        )
        now = timezone.now()
        Urun.objects.filter(pk=cls.urun.pk).update(
            onay_durumu="onayli",
            yayin_durumu="aktif",
            onaylayan_kullanici=ops,
            onay_zamani=now,
        )
        cls.urun.refresh_from_db()
        cls.v = Varyant.objects.create(urun=cls.urun, gram=Decimal("3.0"))
        ted = Firma.objects.create(
            ad="BSD Ted",
            firma_kodu="BSD_TED",
            tedarikci_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        bas, bit = date.today(), date.today() + timedelta(days=30)
        cls.teklif = TedarikciTeklif.objects.create(
            varyant=cls.v,
            tedarikci=ted,
            tedarikci_kodu="BSD1",
            fiyat_modeli=TedarikciTeklif.FiyatModeli.METAL_BAZLI,
            gram=Decimal("3.0"),
            durum=TedarikciTeklif.Durum.YAYINDA,
            gecerlilik_baslangic=bas,
            gecerlilik_bitis=bit,
            hedef_urun=cls.urun,
        )
        cls.wh = Warehouse.objects.create(
            kod="BSD_WH",
            ad="BSD WH",
            sahip_firma=ted,
            sahip_tipi=Warehouse.SahipTipi.TEDARIKCI,
        )

    def test_siparise_ozel(self):
        self.urun.temin_tipi = "siparis_ozel"
        self.urun.save(update_fields=["temin_tipi"])
        data = detay(urun_id=self.urun.pk)
        self.assertEqual(data["stok_durumu"], "siparise_ozel")

    def test_var_when_available(self):
        self.urun.temin_tipi = "hazir"
        self.urun.save(update_fields=["temin_tipi"])
        StockBalance.objects.create(
            warehouse=self.wh,
            varyant=self.v,
            teklif=self.teklif,
            birim="ADET",
            on_hand=Decimal("5"),
            reserved=Decimal("0"),
            blocked=Decimal("0"),
        )
        data = detay(urun_id=self.urun.pk)
        self.assertEqual(data["stok_durumu"], "var")
        blob = str(data).lower()
        self.assertNotIn("warehouse_kod", blob)
        self.assertNotIn("tedarikci", blob)

    def test_yok_when_empty(self):
        self.urun.temin_tipi = "hazir"
        self.urun.save(update_fields=["temin_tipi"])
        data = detay(urun_id=self.urun.pk)
        self.assertEqual(data["stok_durumu"], "yok")
