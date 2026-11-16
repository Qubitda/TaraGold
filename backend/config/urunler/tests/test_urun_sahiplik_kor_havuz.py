"""Ürün sahiplik (olusturan_firma) + kör havuz — platform seçer / tedarikçi kilitli / alıcı maske."""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from tanimlar.models import AyarMilyem, FiyatGrubu, KiymetliMetal
from urunler.models import Kategori
from urunler.services.katalog_yazma_servisi import (
    taslak_urun_olustur,
    varyant_ekle,
)

User = get_user_model()


class SahiplikServisTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_platform_firma()
        seed_role_permissions()
        cls.platform = Firma.objects.get(platform_mu=True)
        cls.ted_a = Firma.objects.create(
            ad="Sahip Ted A", firma_kodu="SAHTA", tedarikci_mi=True, aktif=True
        )
        cls.ted_b = Firma.objects.create(
            ad="Sahip Ted B", firma_kodu="SAHTB", tedarikci_mi=True, aktif=True
        )
        cls.ops = User.objects.create_user(
            username="sahip_ops",
            password="x",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        sync_user_role_groups(cls.ops)
        cls.ted_u = User.objects.create_user(
            username="sahip_ted",
            password="x",
            firma=cls.ted_a,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        sync_user_role_groups(cls.ted_u)
        cls.ted_b_u = User.objects.create_user(
            username="sahip_ted_b",
            password="x",
            firma=cls.ted_b,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        sync_user_role_groups(cls.ted_b_u)
        metal = KiymetliMetal.objects.create(kod="AU_SH", ad="Altın SH", gram_bazli=True)
        cls.ayar = AyarMilyem.objects.create(
            metal=metal, ayar_kodu="14SH", ayar_degeri="14", milyem=Decimal("0.585")
        )
        fg = FiyatGrubu.objects.create(kod="GENEL_SH", ad="Genel SH")
        cls.kat = Kategori.objects.create(kod="YUZUK_SH", ad="Yüzük SH", fiyat_grubu=fg)

    def test_platform_requires_sahiplik_firma(self):
        with self.assertRaises(ValidationError) as ctx:
            taslak_urun_olustur(
                actor=self.ops,
                ad="No firm",
                kategori_id=self.kat.pk,
                ayar_id=self.ayar.pk,
            )
        self.assertIn("sahiplik_firma_id", ctx.exception.message_dict)

    def test_platform_selects_tedarikci(self):
        urun = taslak_urun_olustur(
            actor=self.ops,
            ad="Platform atadı",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted_a.pk,
        )
        self.assertEqual(urun.olusturan_firma_id, self.ted_a.pk)

    def test_tedarikci_locked_to_own_firma(self):
        urun = taslak_urun_olustur(
            actor=self.ted_u,
            ad="Kendi ürünüm",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted_b.pk,  # yok sayılır
        )
        self.assertEqual(urun.olusturan_firma_id, self.ted_a.pk)

    def test_tedarikci_cannot_write_other_firm_product(self):
        urun = taslak_urun_olustur(
            actor=self.ops,
            ad="Başka ted ürünü",
            kategori_id=self.kat.pk,
            ayar_id=self.ayar.pk,
            sahiplik_firma_id=self.ted_a.pk,
        )
        with self.assertRaises(PermissionDenied):
            varyant_ekle(actor=self.ted_b_u, urun=urun, gram="1.000")


class SahiplikOpsHttpTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.ops = User(
            username="sahip_http_ops",
            firma=cls.platform,
            rol=roles.PLATFORM_CATALOG,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

        cls.ted_u = User(
            username="sahip_http_ted",
            firma=cls.ted,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        cls.ted_u.set_password("x")
        cls.ted_u.save()
        sync_user_role_groups(cls.ted_u)

        cls.buyer_u = User(
            username="sahip_http_buyer",
            firma=cls.alici,
            rol=roles.ALICI_SATINALMACI,
            is_staff=True,
        )
        cls.buyer_u.set_password("x")
        cls.buyer_u.save()
        sync_user_role_groups(cls.buyer_u)

    def setUp(self):
        self.api = APIClient()

    def test_ops_create_and_list_exposes_firma(self):
        self.api.force_authenticate(user=self.ops)
        create = self.api.post(
            reverse("api-ops-products"),
            {
                "ad": "Sahiplik HTTP",
                "kategori_id": self.urun.kategori_id,
                "ayar_id": self.ayar.pk,
                "sahiplik_firma_id": self.ted.pk,
                "varyantlar": [{"gram": "1.000"}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="sahip-create-1",
        )
        self.assertEqual(create.status_code, 201, create.content)
        body = create.json()
        self.assertEqual(body["sahiplik_firma_id"], self.ted.pk)
        self.assertTrue(body["sahiplik_firma_ad"])

        refs = self.api.get(reverse("api-ops-catalog-refs"))
        self.assertEqual(refs.status_code, 200, refs.content)
        firms = refs.json().get("tedarikci_firmalar") or []
        self.assertTrue(any(f["id"] == self.ted.pk for f in firms))

    def test_tedarikci_create_locked(self):
        self.api.force_authenticate(user=self.ted_u)
        create = self.api.post(
            reverse("api-ops-products"),
            {
                "ad": "Ted ürün",
                "kategori_id": self.urun.kategori_id,
                "ayar_id": self.ayar.pk,
                "sahiplik_firma_id": 999999,
                "varyantlar": [{"gram": "1.000"}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="sahip-ted-create-1",
        )
        self.assertEqual(create.status_code, 201, create.content)
        self.assertEqual(create.json()["sahiplik_firma_id"], self.ted.pk)

    def test_buyer_catalog_hides_firma(self):
        from api.presenters.buyer import BuyerCatalogItemPresenter

        item = BuyerCatalogItemPresenter(self.urun)
        blob = str(item).lower()
        self.assertNotIn("sahiplik", blob)
        self.assertNotIn("olusturan_firma", blob)
        self.assertNotIn("tedarikci", blob)
        self.assertNotIn(self.ted.ad.lower(), blob)

        self.api.force_authenticate(user=self.buyer_u)
        res = self.api.get(reverse("api-buyer-catalog"))
        self.assertEqual(res.status_code, 200, res.content)
        raw = res.content.decode("utf-8", errors="ignore").lower()
        self.assertNotIn("sahiplik_firma", raw)
        self.assertNotIn("olusturan_firma", raw)


class OpsProductOwnership404MatrixTests(PriceQuoteFixtureMixin, APITestCase):
    """FAZ 0 — tedarikçi A ürününe tedarikçi B tüm pk uçlarında 404; platform OK."""

    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.ted_b = Firma.objects.create(
            ad="PQTED_B",
            firma_kodu="PQTEDB",
            tedarikci_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.ops = User(
            username="own404_ops",
            firma=cls.platform,
            rol=roles.PLATFORM_CATALOG,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)

        cls.ted_a_u = User(
            username="own404_ted_a",
            firma=cls.ted,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        cls.ted_a_u.set_password("x")
        cls.ted_a_u.save()
        sync_user_role_groups(cls.ted_a_u)

        cls.ted_b_u = User(
            username="own404_ted_b",
            firma=cls.ted_b,
            rol=roles.TEDARIKCI_SAHIP,
            is_staff=True,
        )
        cls.ted_b_u.set_password("x")
        cls.ted_b_u.save()
        sync_user_role_groups(cls.ted_b_u)

        cls.owned = taslak_urun_olustur(
            actor=cls.ops,
            ad="Owner A ürün",
            kategori_id=cls.urun.kategori_id,
            ayar_id=cls.ayar.pk,
            sahiplik_firma_id=cls.ted.pk,
        )
        cls.owned_var = varyant_ekle(
            actor=cls.ops, urun=cls.owned, gram=Decimal("1.000")
        )

    def setUp(self):
        self.api = APIClient()

    def _pk_get_paths(self):
        pk = self.owned.pk
        vid = self.owned_var.pk
        return [
            reverse("api-ops-product-detail", kwargs={"pk": pk}),
            reverse("api-ops-product-readiness", kwargs={"pk": pk}),
            reverse("api-ops-product-stock", kwargs={"pk": pk}),
            reverse("api-ops-product-channels", kwargs={"pk": pk}),
            reverse("api-ops-product-media", kwargs={"pk": pk}),
            reverse("api-ops-product-stones", kwargs={"pk": pk}),
            reverse("api-ops-product-audit", kwargs={"pk": pk}),
            reverse(
                "api-ops-product-price-preview",
                kwargs={"pk": pk, "vid": vid},
            ),
        ]

    def test_ted_b_gets_404_on_all_pk_gets(self):
        self.api.force_authenticate(user=self.ted_b_u)
        for path in self._pk_get_paths():
            with self.subTest(path=path):
                res = self.api.get(path)
                self.assertEqual(res.status_code, 404, f"{path}: {res.content}")

    def test_platform_ok_on_pk_gets(self):
        self.api.force_authenticate(user=self.ops)
        for path in self._pk_get_paths():
            with self.subTest(path=path):
                res = self.api.get(path)
                self.assertIn(
                    res.status_code,
                    (200,),
                    f"{path}: {res.status_code} {res.content}",
                )

    def test_ted_b_write_paths_404(self):
        self.api.force_authenticate(user=self.ted_b_u)
        pk = self.owned.pk
        cases = [
            ("patch", reverse("api-ops-product-detail", kwargs={"pk": pk}), {"ad": "x"}),
            (
                "post",
                reverse("api-ops-product-variants", kwargs={"pk": pk}),
                {"gram": "1.0"},
            ),
            (
                "post",
                reverse("api-ops-product-submit", kwargs={"pk": pk}),
                {},
            ),
            (
                "post",
                reverse("api-ops-product-copy", kwargs={"pk": pk}),
                {},
            ),
            (
                "post",
                reverse("api-ops-product-channels", kwargs={"pk": pk}),
                {"kanal_id": 1},
            ),
            (
                "post",
                reverse("api-ops-product-media", kwargs={"pk": pk}),
                {},
            ),
            (
                "post",
                reverse("api-ops-product-stones", kwargs={"pk": pk}),
                {},
            ),
        ]
        for method, path, body in cases:
            with self.subTest(method=method, path=path):
                fn = getattr(self.api, method)
                kwargs = {"format": "json"}
                if method == "post":
                    kwargs["HTTP_IDEMPOTENCY_KEY"] = f"own404-{path}-{method}"
                res = fn(path, body, **kwargs)
                self.assertEqual(res.status_code, 404, f"{path}: {res.content}")

    def test_export_scoped_to_own_firma(self):
        self.api.force_authenticate(user=self.ted_b_u)
        res = self.api.get(reverse("api-ops-products-export"))
        self.assertEqual(res.status_code, 200, res.content)
        text = res.content.decode("utf-8", errors="ignore")
        for line in text.splitlines()[1:]:
            if not line.strip():
                continue
            self.assertFalse(
                line.startswith(f"{self.owned.pk},"),
                f"export leaked owned pk: {line}",
            )

    def test_bulk_foreign_id_reported_bulunamadi(self):
        self.api.force_authenticate(user=self.ted_b_u)
        res = self.api.post(
            reverse("api-ops-products-bulk"),
            {"action": "submit", "ids": [self.owned.pk]},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["ok"], [])
        self.assertEqual(len(body["errors"]), 1)
        self.assertEqual(body["errors"][0]["id"], self.owned.pk)
        self.assertEqual(body["errors"][0]["detail"], "Bulunamadı")
