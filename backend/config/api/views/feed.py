"""ADR-0034 FAZ 4 — API müşterisi feed (salt okuma)."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import timedelta
from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.pagination import apply_ordering, paginate_queryset
from firmalar.services.api_anahtar_servisi import dogrula_raw
from firmalar.services.kanal_gorunurluk_servisi import filter_buyer_catalog_queryset
from stok.models import StockBalance
from urunler.models import Urun


class ApiKeyAuthentication:
    """Basit X-Api-Key / Authorization: Api-Key header."""

    header = "HTTP_X_API_KEY"

    def authenticate(self, request):
        raw = request.META.get(self.header) or ""
        if not raw:
            auth = request.META.get("HTTP_AUTHORIZATION") or ""
            if auth.lower().startswith("api-key "):
                raw = auth[8:].strip()
        if not raw:
            return None
        row = dogrula_raw(raw)
        if row is None:
            raise AuthenticationFailed("Geçersiz API anahtarı.")

        class _FeedActor:
            is_authenticated = True
            is_active = True
            firma = row.firma
            firma_id = row.firma_id
            pk = None
            rol = "api_feed"

        return (_FeedActor(), row)


def _want_xml(request) -> bool:
    fmt = (request.query_params.get("format") or "").lower()
    accept = (request.META.get("HTTP_ACCEPT") or "").lower()
    return fmt == "xml" or "application/xml" in accept


def _present_urun(u: Urun) -> dict:
    return {
        "id": u.pk,
        "platform_kodu": u.platform_kodu,
        "ad": u.ad,
        "yayin_durumu": u.yayin_durumu,
        "onay_durumu": u.onay_durumu,
        "server_now": timezone.now().isoformat(),
        "gecerlilik_bitis": (timezone.now() + timedelta(minutes=15)).isoformat(),
    }


def _to_xml(root_name: str, items: list[dict]) -> bytes:
    root = ET.Element(root_name)
    for it in items:
        el = ET.SubElement(root, "urun")
        for k, v in it.items():
            child = ET.SubElement(el, k)
            child.text = "" if v is None else str(v)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


class FeedAuthMixin:
    def _actor(self, request):
        pair = ApiKeyAuthentication().authenticate(request)
        if pair is None:
            raise AuthenticationFailed("API anahtarı gerekli.")
        return pair[0], pair[1]


class FeedUrunListView(FeedAuthMixin, APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        actor, key = self._actor(request)
        if "feed:read" not in (key.scopes or ["feed:read"]):
            raise PermissionDenied("Scope yok.")
        qs = Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
        since = request.query_params.get("updated_since")
        if since:
            qs = qs.filter(guncelleme_zamani__gte=since)

        class _A:
            firma = actor.firma
            firma_id = actor.firma_id

        qs = filter_buyer_catalog_queryset(qs, actor=_A())
        qs = apply_ordering(
            qs, request, whitelist=("pk", "ad", "platform_kodu"), default="pk"
        )
        if _want_xml(request):
            page = list(qs[:100])
            payload = [_present_urun(u) for u in page]
            return HttpResponse(
                _to_xml("urunler", payload), content_type="application/xml"
            )
        return paginate_queryset(request, qs, present=_present_urun)


class FeedUrunDetailView(FeedAuthMixin, APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk: int):
        actor, key = self._actor(request)
        u = Urun.objects.filter(
            pk=pk, yayin_durumu="aktif", onay_durumu="onayli"
        ).first()
        if u is None:
            raise NotFound("Ürün bulunamadı.")
        data = _present_urun(u)
        if _want_xml(request):
            return HttpResponse(
                _to_xml("urunler", [data]), content_type="application/xml"
            )
        return Response(data)


def _atp_for_urun(urun_id: int) -> str:
    """Birim bazlı ATP toplamı; tedarikçi/depo kimliği yok (kör havuz).

    Formül: available = on_hand − reserved − blocked (F11-012).
    Çıktı örn. ``ADET:12;GRAM:3.5`` veya stok yoksa ``0``.
    """
    by_birim: dict[str, Decimal] = {}
    for bal in StockBalance.objects.filter(varyant__urun_id=urun_id).only(
        "birim", "on_hand", "reserved", "blocked"
    ):
        avail = bal.available
        if avail <= 0:
            continue
        by_birim[bal.birim] = by_birim.get(bal.birim, Decimal("0")) + avail
    if not by_birim:
        return "0"

    def _fmt(qty: Decimal) -> str:
        s = format(qty, "f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s or "0"

    return ";".join(
        f"{birim}:{_fmt(qty)}" for birim, qty in sorted(by_birim.items())
    )


class FeedStokFiyatView(FeedAuthMixin, APIView):
    """Hafif stok-fiyat özeti — maliyet/marj/tedarikçi yok."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        actor, key = self._actor(request)
        if "feed:read" not in (key.scopes or ["feed:read"]):
            raise PermissionDenied("Scope yok.")
        qs = list(
            Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")[:100]
        )
        now = timezone.now()
        gecerlilik = (now + timedelta(minutes=15)).isoformat()
        rows = []
        for u in qs:
            rows.append(
                {
                    "urun_id": u.pk,
                    "platform_kodu": u.platform_kodu,
                    "stok_ozet": _atp_for_urun(u.pk),
                    "fiyat": None,  # kanal fiyatı quote yolu; feed v1 stok odaklı
                    "server_now": now.isoformat(),
                    "gecerlilik_bitis": gecerlilik,
                }
            )
        if _want_xml(request):
            return HttpResponse(
                _to_xml("stok_fiyat", rows), content_type="application/xml"
            )
        return Response({"results": rows})
