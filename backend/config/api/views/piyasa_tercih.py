"""ADR-0041 — GET/PATCH /api/v1/piyasa/tercihler/ (kuyumcu kendi başlık + ek marj)."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import BuyerRateThrottle
from firmalar.services.audit_servisi import domain_atomic, record_audit
from piyasa.services import firma_pano_tercih_servisi as tercih_srv


def _django_ve_to_drf(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError(list(exc.messages))


class PiyasaTercihView(APIView):
    """Alıcı firmanın pano adı / ek marjı — yalnız kendi tenant."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        firma = getattr(request.user, "firma", None)
        if firma is None:
            raise PermissionDenied(detail="Firma yok.")
        if getattr(firma, "platform_mu", False):
            # Platform ops global başlığı kullanır; bu endpoint alıcıya özel.
            return Response(
                {
                    "firma_id": firma.pk,
                    "firma_ad": firma.ad,
                    "platform": True,
                    "pano_baslik": "",
                    "etkin_baslik": firma.ad,
                    "marj_tipi": "YUZDE",
                    "alis_marj": "0",
                    "satis_marj": "0",
                    "mesaj": "Platform hesabı: başlık Sistem Yönetimi → Canlı Piyasa Ayarları’ndan.",
                }
            )
        return Response(tercih_srv.present_tercih(firma))

    def patch(self, request):
        firma = getattr(request.user, "firma", None)
        if firma is None:
            raise PermissionDenied(detail="Firma yok.")
        if getattr(firma, "platform_mu", False):
            raise PermissionDenied(
                detail="Platform hesabı alıcı pano tercihini burada değiştirmez."
            )
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            with domain_atomic():
                tercih = tercih_srv.upsert_tercih(firma, data=body, actor=request.user)
                record_audit(
                    actor=request.user,
                    action="piyasa.firma_pano_tercih",
                    entity_type="FirmaPanoTercih",
                    entity_id=str(tercih.pk),
                    success=True,
                    detail={
                        "pano_baslik": tercih.pano_baslik,
                        "marj_tipi": tercih.marj_tipi,
                        "alis_marj": str(tercih.alis_marj),
                        "satis_marj": str(tercih.satis_marj),
                    },
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except ValidationError:
            raise
        return Response(tercih_srv.present_tercih(firma))
