"""API-B4 — org / onay HTTP + concurrency (PostgreSQL)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from api.masking import assert_masked
from firmalar import roles
from firmalar.models import OnayTalebi, OrgBirimi, OrgUyeligi
from firmalar.role_permissions import seed_role_permissions
from firmalar.services import onay_servisi, org_servisi
from firmalar.services.rol_servisi import sync_user_role_groups
from siparis.tests.test_checkout_f4_040 import CheckoutFixtureMixin

User = get_user_model()


class B4FixtureMixin(CheckoutFixtureMixin):
    @classmethod
    def _build_b4_world(cls):
        cls._build_checkout_world()
        seed_role_permissions()
        sync_user_role_groups(cls.buyer)
        cls.mgr = User(
            username="b4_mgr",
            firma=cls.alici,
            rol=roles.ALICI_YONETICI,
            is_staff=True,
        )
        cls.mgr.set_password("x")
        cls.mgr.save()
        sync_user_role_groups(cls.mgr)
        cls.approver = User(
            username="b4_appr",
            firma=cls.alici,
            rol=roles.ALICI_ONAYLAYICI,
            is_staff=True,
        )
        cls.approver.set_password("x")
        cls.approver.save()
        sync_user_role_groups(cls.approver)
        # Yayınlı katalog varyantı (B2 catalog kuralı)
        urun = cls.varyant.urun
        urun.yayin_durumu = "aktif"
        urun.onay_durumu = "onayli"
        urun.save(update_fields=["yayin_durumu", "onay_durumu"])
        cls.varyant.aktif = True
        cls.varyant.save(update_fields=["aktif"])


class ApiB4EnterpriseTests(B4FixtureMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls._build_b4_world()

    def setUp(self):
        self.api = APIClient()

    def _idem(self, key):
        return {"HTTP_IDEMPOTENCY_KEY": key}

    def test_org_create_member_tenant_rbac(self):
        self.api.force_authenticate(user=self.mgr)
        res = self.api.post(
            reverse("api-org-list"),
            {"kod": "B4HQ", "ad": "Merkez"},
            format="json",
            **self._idem("b4-org-1"),
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["kod"], "B4HQ")
        self.assertIn("add_member", body["allowed_actions"])
        assert_masked(body)
        oid = body["id"]

        mem = self.api.post(
            reverse("api-org-members", kwargs={"pk": oid}),
            {"kullanici_id": self.buyer.pk},
            format="json",
            **self._idem("b4-org-m1"),
        )
        self.assertEqual(mem.status_code, 201, mem.content)
        self.assertEqual(
            OrgUyeligi.objects.filter(
                org_birimi_id=oid, kullanici=self.buyer
            ).count(),
            1,
        )

        # Aynı key + aynı body → tek kayıt
        again = self.api.post(
            reverse("api-org-list"),
            {"kod": "B4HQ", "ad": "Merkez"},
            format="json",
            **self._idem("b4-org-1"),
        )
        self.assertEqual(again.status_code, 201)
        self.assertEqual(again.json()["id"], oid)
        self.assertEqual(
            OrgBirimi.objects.filter(firma=self.alici, kod="B4HQ").count(), 1
        )

        # Aynı key + farklı body → 409
        conflict = self.api.post(
            reverse("api-org-list"),
            {"kod": "OTHER", "ad": "X"},
            format="json",
            **self._idem("b4-org-1"),
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json().get("code"), "idempotency_conflict")

        # Satınalmacı manage_org yok → 403
        self.api.force_authenticate(user=self.buyer)
        deny = self.api.post(
            reverse("api-org-list"),
            {"kod": "X", "ad": "X"},
            format="json",
            **self._idem("b4-org-deny"),
        )
        self.assertEqual(deny.status_code, 403)

        # Tedarikçi çapraz org → 404 (scope dışı)
        self.api.force_authenticate(user=self.ted_user)
        cross = self.api.get(reverse("api-org-detail", kwargs={"pk": oid}))
        self.assertEqual(cross.status_code, 404)

        # Çapraz firma kullanıcı ekleme → 404
        self.api.force_authenticate(user=self.mgr)
        cross_mem = self.api.post(
            reverse("api-org-members", kwargs={"pk": oid}),
            {"kullanici_id": self.ted_user.pk},
            format="json",
            **self._idem("b4-org-cross-m"),
        )
        self.assertEqual(cross_mem.status_code, 404)

    def test_org_list_pagination_nx2(self):
        self.api.force_authenticate(user=self.mgr)
        for i in range(3):
            self.api.post(
                reverse("api-org-list"),
                {"kod": f"P{i}", "ad": f"P{i}"},
                format="json",
                **self._idem(f"b4-org-p{i}"),
            )
        page = self.api.get(
            reverse("api-org-list"), {"page": 1, "page_size": 2}
        )
        self.assertEqual(page.status_code, 200)
        body = page.json()
        self.assertEqual(body["page_size"], 2)
        self.assertLessEqual(len(body["results"]), 2)
        self.assertIn("count", body)
        huge = self.api.get(
            reverse("api-org-list"), {"page_size": 500}
        )
        self.assertEqual(huge.status_code, 200)
        self.assertLessEqual(huge.json()["page_size"], 100)

    def test_approval_flow_masked_idempotency(self):
        self.api.force_authenticate(user=self.approver)
        create = self.api.post(
            reverse("api-approval-list"),
            {"tutar": "150.00", "para_birimi": "TRY", "gerekce": "limit asi"},
            format="json",
            **self._idem("b4-ot-1"),
        )
        self.assertEqual(create.status_code, 201, create.content)
        body = create.json()
        self.assertEqual(body["tutar"], "150.00")
        self.assertIn("submit", body["allowed_actions"])
        self.assertNotIn("karar_veren", body)
        assert_masked(body)
        oid = body["id"]

        sub = self.api.post(
            reverse("api-approval-submit", kwargs={"pk": oid}),
            {},
            format="json",
            **self._idem("b4-ot-s"),
        )
        self.assertEqual(sub.status_code, 200)
        self.assertEqual(sub.json()["durum"], OnayTalebi.Durum.BEKLEMEDE)

        ap = self.api.post(
            reverse("api-approval-approve", kwargs={"pk": oid}),
            {},
            format="json",
            **self._idem("b4-ot-a"),
        )
        self.assertEqual(ap.status_code, 200)
        self.assertEqual(ap.json()["durum"], OnayTalebi.Durum.ONAYLANDI)

        # Reject idempotency conflict path (yeni talep)
        create2 = self.api.post(
            reverse("api-approval-list"),
            {"tutar": "20.00", "para_birimi": "TRY"},
            format="json",
            **self._idem("b4-ot-2"),
        )
        oid2 = create2.json()["id"]
        self.api.post(
            reverse("api-approval-submit", kwargs={"pk": oid2}),
            {},
            format="json",
            **self._idem("b4-ot-2s"),
        )
        rej = self.api.post(
            reverse("api-approval-reject", kwargs={"pk": oid2}),
            {"reason": "yetersiz"},
            format="json",
            **self._idem("b4-ot-2r"),
        )
        self.assertEqual(rej.status_code, 200)
        self.assertEqual(rej.json()["durum"], OnayTalebi.Durum.REDDEDILDI)
        again = self.api.post(
            reverse("api-approval-reject", kwargs={"pk": oid2}),
            {"reason": "yetersiz"},
            format="json",
            **self._idem("b4-ot-2r"),
        )
        self.assertEqual(again.status_code, 200)
        conflict = self.api.post(
            reverse("api-approval-reject", kwargs={"pk": oid2}),
            {"reason": "farkli"},
            format="json",
            **self._idem("b4-ot-2r"),
        )
        self.assertEqual(conflict.status_code, 409)

        # Tedarikçi rol kapısı → 403 (B2 Order/Catalog deseni)
        self.api.force_authenticate(user=self.ted_user)
        deny = self.api.get(reverse("api-approval-list"))
        self.assertEqual(deny.status_code, 403)


class ApiB4ConcurrencyTests(B4FixtureMixin, TransactionTestCase):
    def setUp(self):
        self._build_b4_world()

    def _parallel_post(self, user_pk, url, data, key, n=4):
        def worker(payload):
            connection.close()
            user = User.objects.get(pk=user_pk)
            api = APIClient()
            api.force_authenticate(user=user)
            return api.post(
                url, payload, format="json", HTTP_IDEMPOTENCY_KEY=key
            )

        results = []
        with ThreadPoolExecutor(max_workers=n) as pool:
            futs = [pool.submit(worker, data) for _ in range(n)]
            for f in as_completed(futs):
                results.append(f.result())
        return results

    def test_concurrent_org_create_one(self):
        url = reverse("api-org-list")
        results = self._parallel_post(
            self.mgr.pk,
            url,
            {"kod": "CONC", "ad": "Conc"},
            "b4c-org-1",
            n=4,
        )
        self.assertTrue(
            all(r.status_code == 201 for r in results),
            [r.status_code for r in results],
        )
        ids = {r.json()["id"] for r in results}
        self.assertEqual(len(ids), 1)
        self.assertEqual(
            OrgBirimi.objects.filter(firma=self.alici, kod="CONC").count(), 1
        )

    def test_concurrent_org_members_one(self):
        ob = org_servisi.olustur_birim(
            actor=self.mgr, firma=self.alici, kod="MEM", ad="Mem"
        )
        url = reverse("api-org-members", kwargs={"pk": ob.pk})
        results = self._parallel_post(
            self.mgr.pk,
            url,
            {"kullanici_id": self.buyer.pk},
            "b4c-org-m",
            n=4,
        )
        self.assertTrue(all(r.status_code == 201 for r in results))
        self.assertEqual(
            OrgUyeligi.objects.filter(
                org_birimi=ob, kullanici=self.buyer
            ).count(),
            1,
        )

    def test_concurrent_approval_approve_once(self):
        ot = onay_servisi.olustur(
            actor=self.approver,
            firma=self.alici,
            tutar=Decimal("50.00"),
        )
        ot = onay_servisi.beklemede_al(actor=self.approver, onay=ot)
        url = reverse("api-approval-approve", kwargs={"pk": ot.pk})
        results = self._parallel_post(
            self.approver.pk, url, {}, "b4c-ot-a", n=4
        )
        self.assertTrue(all(r.status_code == 200 for r in results))
        ot.refresh_from_db()
        self.assertEqual(ot.durum, OnayTalebi.Durum.ONAYLANDI)

    def test_concurrent_approval_reject_once(self):
        ot = onay_servisi.olustur(
            actor=self.approver,
            firma=self.alici,
            tutar=Decimal("30.00"),
        )
        ot = onay_servisi.beklemede_al(actor=self.approver, onay=ot)
        url = reverse("api-approval-reject", kwargs={"pk": ot.pk})
        results = self._parallel_post(
            self.approver.pk,
            url,
            {"reason": "no"},
            "b4c-ot-r",
            n=4,
        )
        self.assertTrue(all(r.status_code == 200 for r in results))
        ot.refresh_from_db()
        self.assertEqual(ot.durum, OnayTalebi.Durum.REDDEDILDI)
