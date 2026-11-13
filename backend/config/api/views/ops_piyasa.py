"""GAP-F3-02 — GET/PATCH /api/v1/ops/piyasa/marj-politikasi/."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from piyasa.models import PiyasaMarjPolitikasi


def _require_piyasa_read(user) -> None:
    if can_view_all_tenants(user) or has_perm(user, P["manage_piyasa"]):
        return
    raise PermissionDenied(detail="Piyasa marj politikası yalnız platform ops/finans içindir.")


def _require_piyasa_write(user) -> None:
    if has_perm(user, P["manage_piyasa"]) or can_view_all_tenants(user):
        return
    raise PermissionDenied(detail="Piyasa marj politikası güncelleme için piyasa.manage_piyasa gerekir.")


def _present_politika(pol: PiyasaMarjPolitikasi) -> dict:
    return {
        "id": pol.pk,
        "anahtar": pol.anahtar,
        "marj_modu": pol.marj_modu,
        "marj_orani": str(pol.marj_orani),
        "aktif": bool(pol.aktif),
        "guncelleme": pol.guncelleme.isoformat() if pol.guncelleme else None,
        "server_now": timezone.now().isoformat(),
    }


class OpsPiyasaMarjPolitikasiView(APIView):
    """GET/PATCH /api/v1/ops/piyasa/marj-politikasi/ — Global kâr marjı politikası."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_piyasa_read(request.user)
        pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
        return Response(_present_politika(pol))

    def patch(self, request):
        _require_piyasa_write(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
        changed: dict[str, object] = {}

        if "marj_modu" in body and body.get("marj_modu") not in (None, ""):
            mod = str(body.get("marj_modu")).strip().upper()
            if mod not in {c.value for c in PiyasaMarjPolitikasi.MarjModu}:
                raise ValidationError(
                    {"marj_modu": "Geçersiz marj_modu (TL | YUZDE)."}
                )
            pol.marj_modu = mod
            changed["marj_modu"] = mod

        if "marj_orani" in body and body.get("marj_orani") not in (None, ""):
            try:
                oran = Decimal(str(body.get("marj_orani")))
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise ValidationError({"marj_orani": "Geçersiz decimal."}) from exc
            if oran < Decimal("0"):
                raise ValidationError({"marj_orani": "Marj oranı negatif olamaz."})
            pol.marj_orani = oran.quantize(Decimal("0.0001"))
            changed["marj_orani"] = str(pol.marj_orani)

        if "aktif" in body and body.get("aktif") is not None:
            raw_aktif = body.get("aktif")
            if isinstance(raw_aktif, str):
                aktif_val = raw_aktif.strip().lower() in ("1", "true", "yes", "evet")
            else:
                aktif_val = bool(raw_aktif)
            pol.aktif = aktif_val
            changed["aktif"] = aktif_val

        with domain_atomic():
            pol.save()
            record_audit(
                actor=request.user,
                action="piyasa.marj_politikasi_guncellendi",
                entity_type="PiyasaMarjPolitikasi",
                entity_id=str(pol.pk),
                success=True,
                detail=changed,
            )

        return Response(_present_politika(pol))
