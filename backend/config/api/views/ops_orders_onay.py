"""ADR-0034 — ops sipariş onay havuzu + belge + tahsilat."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from belgeler.services.siparis_belge_servisi import uret_irsaliye, uret_proforma
from finans.services.manuel_tahsilat_servisi import elle_tahsilat
from firmalar.services.yetki_servisi import can_view_all_tenants
from siparis.models import Order
from siparis.services import order_onay_servisi


def _require_ops(user):
    if not can_view_all_tenants(user):
        raise PermissionDenied(detail="Ops sipariş için view_all gerekir.")


def _present_order_ops(o: Order) -> dict:
    return {
        "id": o.pk,
        "durum": o.durum,
        "alici_firma_id": o.alici_firma_id,
        "olusturma_tarihi": o.olusturma_tarihi.isoformat()
        if o.olusturma_tarihi
        else None,
    }


class OpsOrderOnayHavuzuView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops(request.user)
        qs = Order.objects.filter(
            durum__in=[Order.Durum.ONAY_BEKLIYOR, Order.Durum.OLUSTURULDU]
        )
        qs = apply_ordering(qs, request, whitelist=("pk", "olusturma_tarihi"), default="-pk")
        return paginate_queryset(request, qs, present=_present_order_ops)


class OpsOrderOnaylaView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        order = get_object_or_404(Order, pk=pk)
        try:
            locked = order_onay_servisi.onayla(actor=request.user, order=order)
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        return Response(_present_order_ops(locked))


class OpsOrderReddetView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        order = get_object_or_404(Order, pk=pk)
        try:
            locked = order_onay_servisi.reddet(
                actor=request.user,
                order=order,
                neden=request.data.get("neden") or "",
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        return Response(_present_order_ops(locked))


class OpsOrderProformaView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        order = get_object_or_404(Order.objects.prefetch_related("lines"), pk=pk)
        try:
            sonuc = uret_proforma(actor=request.user, order=order)
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        resp = HttpResponse(sonuc.pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = (
            f'attachment; filename="proforma-{order.pk}-r{sonuc.revizyon}.pdf"'
        )
        resp["X-Document-Id"] = str(sonuc.document.pk)
        return resp


class OpsOrderIrsaliyeView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        order = get_object_or_404(Order.objects.prefetch_related("lines"), pk=pk)
        ship = order.shipments.order_by("-pk").first()
        try:
            sonuc = uret_irsaliye(
                actor=request.user, order=order, shipment=ship
            )
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        resp = HttpResponse(sonuc.pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = (
            f'attachment; filename="irsaliye-{order.pk}.pdf"'
        )
        return resp


class OpsOrderTahsilatView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        order = get_object_or_404(Order, pk=pk)
        try:
            entry = elle_tahsilat(
                actor=request.user,
                order=order,
                tutar=request.data.get("tutar"),
                yontem=request.data.get("yontem") or "",
                aciklama=request.data.get("aciklama") or "",
                dekont_ref=request.data.get("dekont_ref") or "",
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        return Response({"ledger_entry_id": entry.pk, "tutar": str(entry.tutar)})


class SupplierHazirlamaListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        from siparis.selectors.tenant import scope_order_queryset

        qs = scope_order_queryset(Order.objects.all(), request.user)
        qs = qs.filter(durum__in=[Order.Durum.HAZIRLANIYOR, Order.Durum.HAZIR])
        return Response(
            [order_onay_servisi.present_hazirlama_emri(o) for o in qs[:50]]
        )


class SupplierHazirIsaretleView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        enforce_csrf(request)
        order = get_object_or_404(Order, pk=pk)
        try:
            locked = order_onay_servisi.tedarikci_hazir_isaretle(
                actor=request.user, order=order
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        return Response(order_onay_servisi.present_hazirlama_emri(locked))
