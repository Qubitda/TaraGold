"""Ops ödeme API — ADR-0001."""

from __future__ import annotations

from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from firmalar.models import Firma
from firmalar.services.yetki_servisi import can_view_all_tenants
from finans.services import odeme_servisi
from finans.services.fx_servisi import open_has_position


def _django_ve_to_drf(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError(list(getattr(exc, "messages", [str(exc)])))


class OpsOdemeCreateView(IdempotencyMixin, APIView):
    """POST /api/v1/ops/odemeler/ — Idempotency-Key zorunlu."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request):
        if not can_view_all_tenants(request.user):
            raise PermissionDenied("Yalnız platform.")
        enforce_csrf(request)
        idem = (request.headers.get("Idempotency-Key") or "").strip()
        if not idem:
            raise ValidationError({"Idempotency-Key": "Zorunlu."})
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached

        firma_id = request.data.get("firma_id")
        if not firma_id:
            raise ValidationError({"firma_id": "Zorunlu."})
        firma = get_object_or_404(Firma, pk=firma_id)
        order = None
        order_id = request.data.get("order_id")
        if order_id:
            from siparis.models import Order

            order = get_object_or_404(Order, pk=order_id)

        try:
            kayit = odeme_servisi.kaydet_odeme(
                actor=request.user,
                firma=firma,
                tip=request.data.get("tip") or "",
                idempotency_key=idem,
                brut_gram=request.data.get("brut_gram"),
                olculen_milyem=request.data.get("olculen_milyem"),
                tl_tutar=request.data.get("tl_tutar"),
                usd_tutar=request.data.get("usd_tutar"),
                manuel_kur=request.data.get("manuel_kur"),
                manuel_kur_gerekce=request.data.get("manuel_kur_gerekce") or "",
                dekont_ref=request.data.get("dekont_ref") or "",
                order=order,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        body = odeme_servisi.present_odeme(kayit)
        resp = Response(body, status=201)
        return self.idempotency_commit(request, resp)


class OpsCariFirmaView(APIView):
    """GET /api/v1/ops/cari/{firma_id}/ — HAS + TRY bakiyeleri."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, firma_id: int):
        if not can_view_all_tenants(request.user):
            raise PermissionDenied("Yalnız platform.")
        firma = get_object_or_404(Firma, pk=firma_id)
        return Response(odeme_servisi.cari_ozet(firma=firma))


class OpsHasPozisyonView(APIView):
    """GET /api/v1/ops/pozisyon/has/"""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        if not can_view_all_tenants(request.user):
            raise PermissionDenied("Yalnız platform.")
        pos = open_has_position()
        return Response(
            {
                "locked_customer": str(pos.locked_customer),
                "unpaid_supplier": str(pos.unpaid_supplier),
                "hedge": str(pos.hedge),
                "open_has": str(pos.open_has),
                "limit": str(pos.limit),
                "over_limit": pos.over_limit,
                "approval_required": pos.approval_required,
            }
        )


class BuyerCariOzetView(APIView):
    """GET /api/v1/cari/ — alıcı HAS+TRY özet (ADR-0001)."""

    permission_classes = [IsAuthenticatedWithFirma]

    def get(self, request):
        firma = getattr(request.user, "firma", None)
        if firma is None:
            raise PermissionDenied("Firma yok.")
        return Response(odeme_servisi.cari_ozet(firma=firma))
