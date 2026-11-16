"""Katalog P1 — filtre, kopya, SEO alanları."""

from decimal import Decimal

from django.test import TestCase

from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from firmalar import roles
from tanimlar.models import AyarMilyem, FiyatGrubu, KiymetliMetal
from urunler.models import Kategori, Renk, OlcuDegeri, Urun
from urunler.services import (
    gorsel_ekle,
    taslak_urun_olustur,
    urun_kopyala,
    varyant_ekle,
)
from urunler.services.katalog_filtre_servisi import apply_katalog_list_filters
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
from PIL import Image

User = get_user_model()


def _png():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color=(200, 160, 40)).save(buf, format="PNG")
    return SimpleUploadedFile("t.png", buf.getvalue(), content_type="image/png")


class KatalogP1FiltreKopyaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        platform = Firma.objects.get(platform_mu=True)
        cls.ted = Firma.objects.create(
            ad="P1F Ted",
            firma_kodu="P1FTED",
            tedarikci_mi=True,
            aktif=True,
        )
        cls.ops = User.objects.create_user(
            username="ops_p1f",
            password="DemoPortal1!",
            firma=platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)
        metal = KiymetliMetal.objects.create(kod="AU_P1F", ad="Altın P1F", gram_bazli=True)
        cls.ayar = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="14P1F", ayar_degeri="14", milyem=Decimal("0.585")
        )
        fg = FiyatGrubu.objects.create(kod="GENEL_P1F", ad="Genel P1F")
        cls.kat = Kategori.objects.create(kod="YUZUK_P1F", ad="Yüzük P1F", fiyat_grubu=fg)
        cls.renk = Renk.objects.create(kod="SARI_P1F", ad="Sarı", sira=1)
        cls.beden = OlcuDegeri.objects.create(
            tip="yuzuk_no", deger="15", sayisal_deger=Decimal("15"), sira=15
        )

    def test_urun_kopyala_taslak_and_variants(self):
        src = taslak_urun_olustur(
            actor=self.ops,
            ad="Kaynak Alyans",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
            fiyat_tipi="gram",
            renk_ekseni=True,
            olcu_tipi="yuzuk_no",
            meta_baslik="SEO Kaynak",
            meta_aciklama="Açıklama SEO",
        )
        varyant_ekle(
            actor=self.ops,
            urun=src,
            gram="4.100",
            renk_id=self.renk.pk,
            beden_id=self.beden.pk,
        )
        kopya = urun_kopyala(actor=self.ops, urun=src)
        self.assertNotEqual(kopya.pk, src.pk)
        self.assertEqual(kopya.onay_durumu, "taslak")
        self.assertIn("Kopya", kopya.ad)
        self.assertEqual(kopya.meta_baslik, "SEO Kaynak")
        self.assertEqual(kopya.varyantlar.filter(aktif=True).count(), 1)
        self.assertNotEqual(
            kopya.varyantlar.first().sku, src.varyantlar.first().sku
        )

    def test_ayni_ad_iki_taslak_slug_benzersiz(self):
        """Yeni Ürün butonu her seferinde 'Yeni ürün' gönderir; slug çakışmamalı."""
        a = taslak_urun_olustur(
            actor=self.ops,
            ad="Yeni ürün",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
        )
        b = taslak_urun_olustur(
            actor=self.ops,
            ad="Yeni ürün",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
        )
        self.assertEqual(a.slug, "yeni-urun")
        self.assertEqual(b.slug, "yeni-urun-2")
        self.assertNotEqual(a.slug, b.slug)

    def test_filtre_eksik_gorsel_and_q_sku(self):
        a = taslak_urun_olustur(
            actor=self.ops,
            ad="Filtre A",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
            renk_ekseni=True,
            olcu_tipi="yuzuk_no",
        )
        b = taslak_urun_olustur(
            actor=self.ops,
            ad="Filtre B",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted.pk,
            renk_ekseni=True,
            olcu_tipi="yuzuk_no",
        )
        v = varyant_ekle(
            actor=self.ops,
            urun=b,
            gram="2.000",
            renk_id=self.renk.pk,
            beden_id=self.beden.pk,
        )
        gorsel_ekle(actor=self.ops, urun=b, dosya=_png(), kapak=True)

        qs = apply_katalog_list_filters(Urun.objects.all(), {"eksik_gorsel": "1"})
        ids = set(qs.values_list("pk", flat=True))
        self.assertIn(a.pk, ids)
        self.assertNotIn(b.pk, ids)

        qs2 = apply_katalog_list_filters(Urun.objects.all(), {"q": v.sku})
        self.assertIn(b.pk, set(qs2.values_list("pk", flat=True)))
        self.assertNotIn(a.pk, set(qs2.values_list("pk", flat=True)))

        qs3 = apply_katalog_list_filters(Urun.objects.all(), {"eksik_varyant": "1"})
        self.assertIn(a.pk, set(qs3.values_list("pk", flat=True)))
        self.assertNotIn(b.pk, set(qs3.values_list("pk", flat=True)))
