"""Metal/ayar/taş referansları — ürün ops CRUD ve metal-ayar bağını doğrular."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from tanimlar.models import AyarMilyem, KiymetliMetal
from urunler.models import TasTipi, UrunTasi

User = get_user_model()


class OpsProductMetalStoneTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.submitter = User(
            username="ops_metal_submit",
            firma=cls.platform,
            rol=roles.PLATFORM_CATALOG,
            is_staff=True,
        )
        cls.submitter.set_password("x")
        cls.submitter.save()
        sync_user_role_groups(cls.submitter)

        cls.gumus, _ = KiymetliMetal.objects.get_or_create(
            kod="GUMUS_T", defaults={"ad": "GümüşT", "gram_bazli": True}
        )
        cls.gumus_ayar, _ = AyarMilyem.objects.get_or_create(
            metal=cls.gumus,
            ayar_kodu="925T",
            defaults={"ayar_degeri": 925, "milyem": "0.925"},
        )
        cls.tas_tipi, _ = TasTipi.objects.get_or_create(
            kod="ZIRKON_T",
            defaults={"ad": "ZirkonT", "sira": 99, "aktif": True, "degerli": False},
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.submitter)

    def test_definitions_kiymetli_metaller_crud(self):
        create = self.api.post(
            reverse("api-ops-definitions-list", kwargs={"kaynak": "kiymetli-metaller"}),
            {"kod": "TIT_T", "ad": "TitanyumT", "gram_bazli": False},
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        mid = create.json()["id"]
        self.assertEqual(create.json()["kod"], "TIT_T")

        listing = self.api.get(
            reverse("api-ops-definitions-list", kwargs={"kaynak": "kiymetli-metaller"})
        )
        self.assertEqual(listing.status_code, 200, listing.content)
        ids = {r["id"] for r in listing.json()["results"]}
        self.assertIn(mid, ids)

        patch = self.api.patch(
            reverse(
                "api-ops-definitions-detail",
                kwargs={"kaynak": "kiymetli-metaller", "pk": mid},
            ),
            {"ad": "Titanyum Test"},
            format="json",
        )
        self.assertEqual(patch.status_code, 200, patch.content)
        self.assertEqual(patch.json()["ad"], "Titanyum Test")

    def test_product_create_exposes_metal_and_stones(self):
        create = self.api.post(
            reverse("api-ops-products"),
            {
                "ad": "Metal Taş Ürün",
                "kategori_id": self.urun.kategori_id,
                "ayar_id": self.ayar.pk,
                "aciklama": "metal-stone",
                "sahiplik_firma_id": self.ted.pk,
                "varyantlar": [{"gram": "1.500"}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="metal-stone-create-1",
        )
        self.assertEqual(create.status_code, 201, create.content)
        body = create.json()
        self.assertEqual(body["metal_id"], self.metal.pk)
        self.assertEqual(body["metal"], self.metal.ad)
        self.assertEqual(body["ayar_id"], self.ayar.pk)
        pid = body["id"]

        detail = self.api.get(reverse("api-ops-product-detail", kwargs={"pk": pid}))
        self.assertEqual(detail.status_code, 200, detail.content)
        d = detail.json()
        self.assertEqual(d["metal_id"], self.metal.pk)
        self.assertIn("taslar", d)
        self.assertEqual(d["taslar"], [])

        add_stone = self.api.post(
            reverse("api-ops-product-stones", kwargs={"pk": pid}),
            {"tas_tipi_id": self.tas_tipi.pk, "adet": 2, "bedel": "10.00"},
            format="json",
        )
        self.assertEqual(add_stone.status_code, 201, add_stone.content)
        sid = add_stone.json()["id"]
        self.assertEqual(add_stone.json()["tas_tipi_id"], self.tas_tipi.pk)
        self.assertTrue(UrunTasi.objects.filter(pk=sid, urun_id=pid).exists())

        # Altın ayarı gümüş ürüne bağlanmaz: ürün ayarı metal üzerinden gelir.
        # Ayar değişimi yalnız mevcut AyarMilyem kaydı ile yapılır; çapraz metal
        # seçimi FE filtre + ayar.metal ilişkisi ile engellenir.
        patch = self.api.patch(
            reverse("api-ops-product-detail", kwargs={"pk": pid}),
            {"ayar_id": self.gumus_ayar.pk},
            format="json",
        )
        self.assertEqual(patch.status_code, 200, patch.content)
        self.assertEqual(patch.json()["metal_id"], self.gumus.pk)
        self.assertEqual(patch.json()["ayar"], self.gumus_ayar.ayar_kodu)

        delete_stone = self.api.delete(
            reverse(
                "api-ops-product-stone-detail",
                kwargs={"pk": pid, "sid": sid},
            )
        )
        self.assertEqual(delete_stone.status_code, 200, delete_stone.content)
        self.assertFalse(UrunTasi.objects.filter(pk=sid).exists())

    def test_catalog_refs_include_metaller_and_ayar_metal(self):
        res = self.api.get(reverse("api-ops-catalog-refs"))
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertIn("metaller", data)
        self.assertTrue(any(m["id"] == self.metal.pk for m in data["metaller"]))
        self.assertTrue(
            any(
                a["id"] == self.ayar.pk and a["metal_id"] == self.metal.pk
                for a in data["ayarlar"]
            )
        )
        self.assertTrue(any(t["id"] == self.tas_tipi.pk for t in data["tas_tipleri"]))
