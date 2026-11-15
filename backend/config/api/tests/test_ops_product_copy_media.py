"""Ürün kopyala: varyant + medya + video URL taşınır."""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from firmalar import roles
from firmalar.role_permissions import seed_role_permissions
from firmalar.services.rol_servisi import sync_user_role_groups
from fiyatlama.tests.test_price_quote import PriceQuoteFixtureMixin
from urunler.models import UrunGorsel
from urunler.services import gorsel_ekle

User = get_user_model()


def _png():
    buf = BytesIO()
    Image.new("RGB", (8, 8), color=(180, 140, 40)).save(buf, format="PNG")
    return SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")


class OpsProductCopyMediaTests(PriceQuoteFixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_quote_world()
        seed_role_permissions()
        cls.submitter = User(
            username="ops_copy_media",
            firma=cls.platform,
            rol=roles.PLATFORM_CATALOG,
            is_staff=True,
        )
        cls.submitter.set_password("x")
        cls.submitter.save()
        sync_user_role_groups(cls.submitter)

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.submitter)

    def test_copy_includes_cover_and_video_url(self):
        gorsel_ekle(
            actor=self.submitter,
            urun=self.urun,
            dosya=_png(),
            kapak=True,
        )
        gorsel_ekle(
            actor=self.submitter,
            urun=self.urun,
            tip="video",
            harici_url="https://example.com/video.mp4",
            alt_metin="Demo video",
        )
        self.assertEqual(self.urun.varyantlar.filter(aktif=True).count(), 1)

        res = self.api.post(
            reverse("api-ops-product-copy", kwargs={"pk": self.urun.pk}),
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY="copy-media-1",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertTrue(body["ad"].endswith("(Kopya)"))
        self.assertEqual(body["onay_durumu"], "taslak")
        self.assertGreaterEqual(len(body.get("varyantlar") or []), 1)
        self.assertGreaterEqual(len(body.get("gorseller") or []), 2)
        tips = {g["tip"] for g in body["gorseller"]}
        self.assertIn("kapak", tips)
        self.assertIn("video", tips)
        video = next(g for g in body["gorseller"] if g["tip"] == "video")
        self.assertEqual(video.get("harici_url"), "https://example.com/video.mp4")
        self.assertTrue(
            UrunGorsel.objects.filter(urun_id=body["id"], tip="video").exists()
        )
        # Kaynak gramlı varyant kopyalandı → hazırlıkta varyant var
        grams = [
            Decimal(v["gram"])
            for v in body["varyantlar"]
            if v.get("gram") not in (None, "")
        ]
        self.assertTrue(grams)
