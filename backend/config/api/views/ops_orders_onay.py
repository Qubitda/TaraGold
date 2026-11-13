"""ADR-0034 / ADR-0036 — ops sipariş onay havuzu + liste + belge + tahsilat + tedarikçi hazırlama."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

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
from belgeler.services.siparis_belge_servisi import (
    uret_irsaliye,
    uret_proforma,
    uret_tedarikci_irsaliye,
)
from finans.services.manuel_tahsilat_servisi import elle_tahsilat
from firmalar.services.yetki_servisi import can_view_all_tenants
from siparis.models import Order
from siparis.services import order_onay_servisi


def _require_ops(user):
    if not can_view_all_tenants(user):
        raise PermissionDenied(detail="Ops sipariş için view_all gerekir.")


def _present_order_ops(o: Order) -> dict:
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    lines = []
    for ln in o.lines.select_related("varyant", "varyant__urun").all():
        pb = (ln.para_birimi or "TRY").upper()
        tutar = Decimal(ln.snapshot_satir_tutari_vergisiz or "0.00")
        totals[pb] += tutar
        lines.append(
            {
                "id": ln.pk,
                "varyant_id": ln.varyant_id,
                "platform_kodu": getattr(ln.varyant, "sku", "")
                or getattr(getattr(ln.varyant, "urun", None), "platform_kodu", ""),
                "miktar": str(ln.miktar),
                "birim": ln.birim,
                "para_birimi": pb,
                "satir_tutari": str(ln.snapshot_satir_tutari_vergisiz),
                "teslim_modeli": getattr(ln, "teslim_modeli", "PLATFORM_QC"),
            }
        )
    emirler = [
        {
            "id": e.pk,
            "tedarikci_firma_id": e.tedarikci_firma_id,
            "tedarikci_ad": getattr(e.tedarikci_firma, "ad", ""),
            "durum": e.durum,
            "teslim_modeli": e.teslim_modeli,
            "hazir_zamani": e.hazir_zamani.isoformat() if e.hazir_zamani else None,
        }
        for e in o.hazirlama_emirleri.select_related("tedarikci_firma").all()
    ]
    alici = getattr(o, "alici_firma", None)
    return {
        "id": o.pk,
        "durum": o.durum,
        "alici_firma_id": o.alici_firma_id,
        "alici_firma_ad": getattr(alici, "ad", "") if alici else "",
        "olusturma_tarihi": o.olusturma_tarihi.isoformat()
        if o.olusturma_tarihi
        else None,
        "toplamlar": {k: str(v.quantize(Decimal("0.01"))) for k, v in totals.items()},
        "satir_sayisi": len(lines),
        "satirlar": lines,
        "hazirlama_emirleri": emirler,
    }


class OpsOrderListView(APIView):
    """GET /api/v1/ops/orders/ — tüm ops siparişleri (filtre: durum, alici_firma_id)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops(request.user)
        qs = Order.objects.select_related("alici_firma").prefetch_related(
            "lines__varyant__urun",
            "hazirlama_emirleri__tedarikci_firma",
        )
        durum = (request.query_params.get("durum") or "").strip().upper()
        if durum and durum in Order.Durum.values:
            qs = qs.filter(durum=durum)
        alici_id = request.query_params.get("alici_firma_id")
        if alici_id:
            try:
                qs = qs.filter(alici_firma_id=int(alici_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"alici_firma_id": "Geçersiz."}) from exc
        qs = apply_ordering(qs, request, whitelist=("pk", "olusturma_tarihi"), default="-pk")
        return paginate_queryset(request, qs, present=_present_order_ops)


class OpsOrderOnayHavuzuView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops(request.user)
        qs = (
            Order.objects.select_related("alici_firma")
            .prefetch_related(
                "lines__varyant__urun",
                "hazirlama_emirleri__tedarikci_firma",
            )
            .filter(durum__in=[Order.Durum.ONAY_BEKLIYOR, Order.Durum.OLUSTURULDU])
        )
        qs = apply_ordering(qs, request, whitelist=("pk", "olusturma_tarihi"), default="-pk")
        return paginate_queryset(request, qs, present=_present_order_ops)


class OpsOrderOnaylaView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        has_idem = bool((request.headers.get("Idempotency-Key") or "").strip())
        if has_idem:
            cached = self.idempotency_begin(request)
            if cached is not None:
                return cached
        order = get_object_or_404(Order, pk=pk)
        try:
            locked = order_onay_servisi.onayla(actor=request.user, order=order)
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        resp = Response(_present_order_ops(locked))
        return self.idempotency_commit(request, resp) if has_idem else resp


class OpsOrderReddetView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        has_idem = bool((request.headers.get("Idempotency-Key") or "").strip())
        if has_idem:
            cached = self.idempotency_begin(request)
            if cached is not None:
                return cached
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
        resp = Response(_present_order_ops(locked))
        return self.idempotency_commit(request, resp) if has_idem else resp


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
            f'attachment; filename="irsaliye-{order.pk}-r{sonuc.revizyon}.pdf"'
        )
        resp["X-Document-Id"] = str(sonuc.document.pk)
        return resp


class OpsOrderTahsilatView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        has_idem = bool((request.headers.get("Idempotency-Key") or "").strip())
        if has_idem:
            cached = self.idempotency_begin(request)
            if cached is not None:
                return cached
        order = get_object_or_404(Order, pk=pk)
        idem_key = (request.headers.get("Idempotency-Key") or "").strip() or None
        try:
            entry = elle_tahsilat(
                actor=request.user,
                order=order,
                tutar=request.data.get("tutar"),
                yontem=request.data.get("yontem") or "",
                aciklama=request.data.get("aciklama") or "",
                dekont_ref=request.data.get("dekont_ref") or "",
                para_birimi=request.data.get("para_birimi") or None,
                idempotency_key=idem_key,
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        resp = Response(
            {
                "ledger_entry_id": entry.pk,
                "tutar": str(entry.tutar),
                "para_birimi": entry.para_birimi,
            }
        )
        return self.idempotency_commit(request, resp) if has_idem else resp


class SupplierHazirlamaListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        from siparis.selectors.tenant import scope_order_queryset

        qs = scope_order_queryset(Order.objects.all(), request.user)
        qs = qs.filter(durum__in=[Order.Durum.HAZIRLANIYOR, Order.Durum.HAZIR])
        ted_id = getattr(request.user, "firma_id", None)
        if can_view_all_tenants(request.user):
            ted_id = None
        return Response(
            [
                order_onay_servisi.present_hazirlama_emri(
                    o, tedarikci_firma_id=ted_id
                )
                for o in qs[:50]
            ]
        )


class SupplierHazirIsaretleView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        enforce_csrf(request)
        has_idem = bool((request.headers.get("Idempotency-Key") or "").strip())
        if has_idem:
            cached = self.idempotency_begin(request)
            if cached is not None:
                return cached
        order = get_object_or_404(Order, pk=pk)
        try:
            locked = order_onay_servisi.tedarikci_hazir_isaretle(
                actor=request.user, order=order
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            raise PermissionDenied(str(exc)) from exc
        ted_id = getattr(request.user, "firma_id", None)
        resp = Response(
            order_onay_servisi.present_hazirlama_emri(
                locked, tedarikci_firma_id=ted_id
            )
        )
        return self.idempotency_commit(request, resp) if has_idem else resp


class SupplierHazirlamaIrsaliyeView(APIView):
    """POST /api/v1/supplier/hazirlama/<pk>/irsaliye/ — kör tedarikçi sevk irsaliyesi PDF."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        enforce_csrf(request)
        order = get_object_or_404(Order.objects.prefetch_related("lines"), pk=pk)
        firma = getattr(request.user, "firma", None)
        if firma is None or not getattr(firma, "tedarikci_mi", False):
            raise PermissionDenied(detail="Yalnız tedarikçi.")
        ship = order.shipments.order_by("-pk").first()
        try:
            sonuc = uret_tedarikci_irsaliye(
                actor=request.user,
                order=order,
                tedarikci_firma=firma,
                shipment=ship,
            )
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        resp = HttpResponse(sonuc.pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = (
            f'attachment; filename="tedarikci-irsaliye-{order.pk}-r{sonuc.revizyon}.pdf"'
        )
        resp["X-Document-Id"] = str(sonuc.document.pk)
        return resp
