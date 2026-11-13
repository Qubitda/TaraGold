"""F5-031 + API-B1 — Platform finans ops API (view_all)."""

from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from finans.models import CariHesap, LedgerEntry, PaymentIntent, TedarikciHakEdis
from finans.services import ops_finans_servisi
from finans.services.manuel_tahsilat_servisi import elle_tedarikci_odeme
from firmalar.models import Firma
from siparis.models import Order


def _map_perm(exc):
    raise PermissionDenied(detail=str(exc)) from exc


class OpsFinanceSummaryView(APIView):
    """GET /api/v1/ops/finance/ — özet + son hareketler. Client firma_id yok sayılır."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        request.query_params.get("firma_id")  # ignore
        try:
            data = ops_finans_servisi.ozet(actor=request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        return Response(data)


class OpsFinanceCariListView(APIView):
    """GET /api/v1/ops/finance/cari/"""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        request.query_params.get("firma_id")  # ignore
        try:
            ops_finans_servisi.require_ops_finance(request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        qs = apply_ordering(
            CariHesap.objects.all(),
            request,
            whitelist=("guncelleme_tarihi", "pk"),
            default="-guncelleme_tarihi",
        )
        return paginate_queryset(
            request,
            qs,
            present=ops_finans_servisi.present_cari_ops,
            extra={"ops": True},
        )


class OpsFinanceLedgerListView(APIView):
    """GET /api/v1/ops/finance/ledger/"""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        request.query_params.get("firma_id")  # ignore
        try:
            ops_finans_servisi.require_ops_finance(request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        qs = apply_ordering(
            LedgerEntry.objects.all(),
            request,
            whitelist=("olusturma_tarihi", "pk"),
            default="-olusturma_tarihi",
        )
        return paginate_queryset(
            request,
            qs,
            present=ops_finans_servisi.present_ledger_ops,
            extra={"ops": True},
        )


class OpsFinancePaymentListView(APIView):
    """GET /api/v1/ops/finance/payments/"""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        request.query_params.get("firma_id")  # ignore
        try:
            ops_finans_servisi.require_ops_finance(request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        qs = apply_ordering(
            PaymentIntent.objects.all(),
            request,
            whitelist=("olusturma_tarihi", "pk"),
            default="-olusturma_tarihi",
        )
        return paginate_queryset(
            request,
            qs,
            present=ops_finans_servisi.present_payment_ops,
            extra={"ops": True},
        )


def _present_hak_edis_ops(he: TedarikciHakEdis) -> dict:
    return {
        "id": he.pk,
        "order_id": he.order_id,
        "quality_inspection_id": he.quality_inspection_id,
        "tedarikci_firma_id": he.tedarikci_firma_id,
        "tedarikci_firma_ad": getattr(he.tedarikci_firma, "ad", ""),
        "durum": he.durum,
        "gram": str(he.gram),
        "tutar": str(he.tutar) if he.tutar is not None else None,
        "para_birimi": he.para_birimi,
        "vade_tarihi": he.vade_tarihi.isoformat() if he.vade_tarihi else None,
        "hak_edis_tarihi": he.hak_edis_tarihi.isoformat()
        if he.hak_edis_tarihi
        else None,
        "odeme_tarihi": he.odeme_tarihi.isoformat() if he.odeme_tarihi else None,
        "odeme_ledger_entry_id": he.odeme_ledger_entry_id,
        "aciklama": he.aciklama,
        "olusturma_tarihi": he.olusturma_tarihi.isoformat()
        if he.olusturma_tarihi
        else None,
    }


class OpsFinanceHakEdisListView(APIView):
    """GET /api/v1/ops/finance/hak-edis/ — tedarikçi hak ediş listesi (ops finans)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        try:
            ops_finans_servisi.require_ops_finance(request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        qs = TedarikciHakEdis.objects.select_related("tedarikci_firma").all()
        durum = (request.query_params.get("durum") or "").strip().upper()
        if durum and durum in TedarikciHakEdis.Durum.values:
            qs = qs.filter(durum=durum)
        ted_id = request.query_params.get("tedarikci_firma_id")
        if ted_id:
            try:
                qs = qs.filter(tedarikci_firma_id=int(ted_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"tedarikci_firma_id": "Geçersiz."}) from exc
        order_id = request.query_params.get("order_id")
        if order_id:
            try:
                qs = qs.filter(order_id=int(order_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"order_id": "Geçersiz."}) from exc
        qs = apply_ordering(
            qs,
            request,
            whitelist=("olusturma_tarihi", "vade_tarihi", "pk"),
            default="-pk",
        )
        return paginate_queryset(
            request,
            qs,
            present=_present_hak_edis_ops,
            extra={"ops": True},
        )


class OpsFinanceTedarikciOdemeView(IdempotencyMixin, APIView):
    """POST /api/v1/ops/finance/tedarikci-odeme/ — manuel tedarikçi ödemesi + hak ediş ODENDI."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request):
        try:
            ops_finans_servisi.require_ops_finance(request.user)
        except DjangoPermissionDenied as exc:
            _map_perm(exc)
        enforce_csrf(request)
        has_idem = bool((request.headers.get("Idempotency-Key") or "").strip())
        if has_idem:
            cached = self.idempotency_begin(request)
            if cached is not None:
                return cached
        data = request.data if isinstance(request.data, dict) else {}
        try:
            ted_id = int(data.get("tedarikci_firma_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"tedarikci_firma_id": "Zorunlu ve tam sayı olmalı."}) from exc
        tedarikci = get_object_or_404(Firma, pk=ted_id)
        hak_edis = None
        if data.get("hak_edis_id"):
            try:
                he_id = int(data.get("hak_edis_id"))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"hak_edis_id": "Geçersiz."}) from exc
            hak_edis = get_object_or_404(TedarikciHakEdis, pk=he_id)
        order = None
        if data.get("order_id"):
            try:
                oid = int(data.get("order_id"))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"order_id": "Geçersiz."}) from exc
            order = get_object_or_404(Order, pk=oid)

        idem_key = (request.headers.get("Idempotency-Key") or "").strip() or None
        try:
            entry = elle_tedarikci_odeme(
                actor=request.user,
                tedarikci_firma=tedarikci,
                tutar=data.get("tutar"),
                yontem=data.get("yontem") or "",
                aciklama=data.get("aciklama") or "",
                dekont_ref=data.get("dekont_ref") or "",
                order=order,
                hak_edis=hak_edis,
                para_birimi=data.get("para_birimi") or None,
                idempotency_key=idem_key,
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            if isinstance(exc, DjangoValidationError):
                raise _django_ve_to_drf(exc) from exc
            _map_perm(exc)

        if hak_edis is not None:
            hak_edis.refresh_from_db()
        resp = Response(
            {
                "ledger_entry_id": entry.pk,
                "tutar": str(entry.tutar),
                "para_birimi": entry.para_birimi,
                "tedarikci_firma_id": tedarikci.pk,
                "hak_edis": _present_hak_edis_ops(hak_edis) if hak_edis else None,
            },
            status=status.HTTP_201_CREATED,
        )
        return self.idempotency_commit(request, resp) if has_idem else resp
