"""Teklif API kapalı — VaryantFiyat / ops/varyant-fiyat kullanın (ADR-0039)."""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsAuthenticatedWithFirma
from api.throttles import SupplierRateThrottle

_GONE = {
    "detail": (
        "Tedarikçi teklif API kaldırıldı. "
        "Fiyat için POST /api/v1/ops/varyant-fiyat/upsert/ kullanın."
    ),
    "code": "teklif_api_kaldirildi",
}


class _OfferGoneView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def get(self, request, *args, **kwargs):
        return Response(_GONE, status=status.HTTP_410_GONE)

    def post(self, request, *args, **kwargs):
        return Response(_GONE, status=status.HTTP_410_GONE)

    def put(self, request, *args, **kwargs):
        return Response(_GONE, status=status.HTTP_410_GONE)

    def patch(self, request, *args, **kwargs):
        return Response(_GONE, status=status.HTTP_410_GONE)

    def delete(self, request, *args, **kwargs):
        return Response(_GONE, status=status.HTTP_410_GONE)


class SupplierOfferListView(_OfferGoneView):
    pass


class SupplierOfferDetailView(_OfferGoneView):
    pass


class SupplierOfferSubmitView(_OfferGoneView):
    pass


class SupplierOfferDeactivateView(_OfferGoneView):
    pass


class SupplierOfferVersionView(_OfferGoneView):
    pass


class SupplierOfferImportPreviewView(_OfferGoneView):
    pass


class SupplierOfferImportCommitView(_OfferGoneView):
    pass
