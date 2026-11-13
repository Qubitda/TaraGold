"""ADR-0034 FAZ 4 — feed stok-fiyat ATP (kör, birim bazlı)."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.api_anahtar_servisi import olustur as anahtar_olustur
from firmalar.services.rol_servisi import sync_user_role_groups
from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin
from stok.models import StockBalance

User = get_user_model()


class FeedStokFiyatAtpTests(CheckoutFixtureMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_checkout_world()
        seed_role_permissions()
        cls.ops = User(
            username="feed_ops",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.ops.set_password("x")
        cls.ops.save()
        sync_user_role_groups(cls.ops)
        cls.anahtar, cls.raw = anahtar_olustur(
            actor=cls.ops,
            firma=cls.alici,
            ad="feed-test",
            scopes=["feed:read"],
        )

    def setUp(self):
        self.client = APIClient()

    def test_stok_ozet_atp_not_placeholder(self):
        bal = StockBalance.objects.get(warehouse=self.wh, teklif=self.teklif)
        self.assertGreater(bal.available, 0)
        r = self.client.get(
            "/api/v1/feed/stok-fiyat/",
            HTTP_X_API_KEY=self.raw,
        )
        self.assertEqual(r.status_code, 200)
        rows = r.data["results"]
        hit = next((x for x in rows if x["urun_id"] == self.urun.pk), None)
        self.assertIsNotNone(hit)
        self.assertNotEqual(hit["stok_ozet"], "ATP_API_SONRA")
        self.assertTrue(hit["stok_ozet"].startswith(f"{bal.birim}:"))
        blob = str(hit).lower()
        self.assertNotIn("tedarikci", blob)
        self.assertNotIn("warehouse", blob)
