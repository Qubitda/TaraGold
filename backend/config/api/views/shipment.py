"""F6-023 + B3 — Buyer sevkiyat takip API (maskeli + allowed_actions)."""

from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exc import raise_drf
from api.masking import assert_masked
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.finance_ops import BuyerShipmentPresenter
from api.throttles import BuyerRateThrottle
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from lojistik.models import ProofOfDelivery, Shipment
from lojistik.services import buyer_shipment_servisi, pod_servisi
from lojistik.services.buyer_shipment_servisi import ShipmentNotFound
from siparis.selectors.tenant import OrderNotFound, get_order_for_actor


def _assert_buyer_or_ops(user) -> None:
    if can_view_all_tenants(user):
        return
    firma = getattr(user, "firma", None)
    if firma is not None and getattr(firma, "alici_mi", False):
        return
    raise PermissionDenied(detail="Sevkiyat yalnız alıcı veya platform ops içindir.")


class ShipmentListView(APIView):
    """GET /api/v1/shipments/?order_id= — alıcı kendi; ops view_all."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        _assert_buyer_or_ops(request.user)
        qs = Shipment.objects.select_related("order")
        qs = buyer_shipment_servisi.scope_shipment_queryset(qs, request.user)
        order_id = request.query_params.get("order_id")
        if order_id:
            try:
                oid = int(order_id)
            except (TypeError, ValueError):
                raise NotFound(detail="Sipariş bulunamadı.") from None
            try:
                get_order_for_actor(request.user, order_id=oid)
            except OrderNotFound as exc:
                raise NotFound(detail="Sipariş bulunamadı.") from exc
            qs = qs.filter(order_id=oid)
        qs = apply_ordering(
            qs,
            request,
            whitelist=("olusturma_tarihi", "pk"),
            default="-olusturma_tarihi",
        )
        return paginate_queryset(request, qs, present=BuyerShipmentPresenter)


class ShipmentDetailView(APIView):
    """GET /api/v1/shipments/<pk>/ — tenant 404; tedarikçi 403."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        _assert_buyer_or_ops(request.user)
        try:
            ship = buyer_shipment_servisi.get_shipment_for_actor(
                request.user, shipment_id=pk
            )
        except ShipmentNotFound as exc:
            raise NotFound(detail="Sevkiyat bulunamadı.") from exc
        return Response(BuyerShipmentPresenter(ship))


class ShipmentPodView(IdempotencyMixin, APIView):
    """GAP-F4-05 — GET/POST /api/v1/shipments/<pk>/pod/ (alıcı self-service POD görüntüleme/onay)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        _assert_buyer_or_ops(request.user)
        try:
            ship = buyer_shipment_servisi.get_shipment_for_actor(
                request.user, shipment_id=pk
            )
        except ShipmentNotFound as exc:
            raise NotFound(detail="Sevkiyat bulunamadı.") from exc

        pod = ProofOfDelivery.objects.filter(shipment_id=ship.pk).first()
        if (request.query_params.get("download") or "").strip() in ("1", "true"):
            if pod is None:
                raise NotFound(detail="Bu sevkiyat için henüz teslimat kanıtı (POD) yok.")
            lines = [
                f"TESLIMAT KANITI (POD) - SEVKIYAT #{ship.pk}",
                f"Siparis No: #{ship.order_id}",
                f"Durum: {ship.durum}",
                f"Tasiyici: {ship.tasiyici or ship.kargo_firma or '-'}",
                f"Takip No: {ship.takip_no or '-'}",
                f"Teslim Alan: {pod.teslim_alan}",
                f"Notlar: {pod.notlar or '-'}",
                f"Belge Ref: {pod.belgeler_ref or '-'}",
                f"Tarih: {pod.olusturma_tarihi.isoformat() if pod.olusturma_tarihi else '-'}",
            ]
            resp = HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="pod-shipment-{ship.pk}.txt"'
            return resp

        payload = {
            "shipment_id": ship.pk,
            "order_id": ship.order_id,
            "durum": ship.durum,
            "tasiyici": ship.tasiyici if ship.tasiyici is not None else (ship.kargo_firma or None),
            "takip_no": ship.takip_no or "",
            "has_pod": pod is not None,
            "pod": (
                {
                    "id": pod.pk,
                    "teslim_alan": pod.teslim_alan,
                    "notlar": pod.notlar or "",
                    "belgeler_ref": pod.belgeler_ref or "",
                    "olusturma_tarihi": pod.olusturma_tarihi.isoformat()
                    if pod.olusturma_tarihi
                    else None,
                }
                if pod is not None
                else None
            ),
            "server_now": timezone.now().isoformat(),
        }
        assert_masked(payload, context="buyer")
        return Response(payload)

    def post(self, request, pk: int):
        _assert_buyer_or_ops(request.user)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        try:
            ship = buyer_shipment_servisi.get_shipment_for_actor(
                request.user, shipment_id=pk
            )
        except ShipmentNotFound as exc:
            raise NotFound(detail="Sevkiyat bulunamadı.") from exc

        body = request.data if isinstance(request.data, dict) else {}
        try:
            if can_view_all_tenants(request.user) and has_perm(
                request.user, P["manage_shipment"]
            ):
                pod_servisi.kaydet_pod(
                    actor=request.user,
                    shipment=ship,
                    teslim_alan=body.get("teslim_alan") or "",
                    notlar=body.get("notlar") or "",
                    belgeler_ref=body.get("belgeler_ref") or "",
                )
            else:
                pod_servisi.kaydet_pod_alici(
                    actor=request.user,
                    shipment=ship,
                    teslim_alan=body.get("teslim_alan") or "",
                    notlar=body.get("notlar") or "",
                    belgeler_ref=body.get("belgeler_ref") or "",
                )
        except (DjangoPermissionDenied, DjangoValidationError) as exc:
            raise_drf(exc)

        ship = buyer_shipment_servisi.get_shipment_for_actor(
            request.user, shipment_id=pk
        )
        return self.idempotency_commit(
            request,
            Response(BuyerShipmentPresenter(ship), status=status.HTTP_201_CREATED),
        )
