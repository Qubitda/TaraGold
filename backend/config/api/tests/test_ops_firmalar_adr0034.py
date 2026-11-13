"""ADR-0034 FAZ 2 — ops firmalar HTTP."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from firmalar import roles
from firmalar.models import Firma
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.rol_servisi import sync_user_role_groups
from firmalar.services.uyelik_servisi import upsert_uyelik

User = get_user_model()


class OpsFirmalarApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_role_permissions()
        cls.platform = ensure_platform_firma()
        cls.padmin = User(
            username="opf_p",
            firma=cls.platform,
            rol=roles.PLATFORM_ADMIN,
            is_staff=True,
        )
        cls.padmin.set_password("x")
        cls.padmin.save()
        sync_user_role_groups(cls.padmin)

        cls.alici = Firma.objects.create(
            ad="OPFA",
            firma_kodu="OPFA",
            alici_mi=True,
            onay_durumu="onayli",
            aktif=True,
        )
        cls.admin_user = User(
            username="opf_a",
            firma=cls.alici,
            rol=roles.FIRMA_ADMIN,
        )
        cls.admin_user.set_password("x")
        cls.admin_user.save()
        upsert_uyelik(
            kullanici=cls.admin_user,
            firma=cls.alici,
            rol=roles.FIRMA_ADMIN,
            aktif=True,
        )
        sync_user_role_groups(cls.admin_user)

        cls.buyer = User(
            username="opf_b",
            firma=cls.alici,
            rol=roles.ALICI_SATINALMACI,
        )
        cls.buyer.set_password("x")
        cls.buyer.save()

    def setUp(self):
        self.client = APIClient()

    def test_buyer_denied_ops_list(self):
        self.client.force_authenticate(self.buyer)
        r = self.client.get("/api/v1/ops/firmalar/")
        self.assertEqual(r.status_code, 403)

    def test_ops_list_and_onayla(self):
        self.client.force_authenticate(self.padmin)
        r = self.client.get("/api/v1/ops/firmalar/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("results", r.data)
        r2 = self.client.post(f"/api/v1/ops/firmalar/{self.alici.pk}/onayla/")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data["durum"], Firma.Durum.AKTIF)

    def test_api_anahtar_create_and_iptal(self):
        self.client.force_authenticate(self.padmin)
        r = self.client.post(
            f"/api/v1/ops/firmalar/{self.alici.pk}/api-anahtarlar/",
            {"ad": "feed-ui", "scopes": ["feed:read"]},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertIn("api_key", r.data)
        anahtar_id = r.data["id"]
        r2 = self.client.post(
            f"/api/v1/ops/firmalar/{self.alici.pk}/api-anahtarlar/{anahtar_id}/iptal/",
            {},
            format="json",
        )
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.data["iptal"])

    def test_firma_kullanicilar_own(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.get("/api/v1/firma/kullanicilar/")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.data), 1)
