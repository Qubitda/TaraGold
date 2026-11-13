"""PRE-002/003 + API-B1 — /me yetenek keşfi + çoklu üyelik geçişi (ADR-0035)."""

from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma, can_buyer_commerce_read
from api.presenters.firma_ops import present_uyelik
from api.services.capabilities_servisi import present_me
from api.views.auth import _django_ve_to_drf
from firmalar.models import FirmaUyelik
from firmalar.services.uyelik_servisi import switch_active_uyelik
from firmalar.services.yetki_servisi import can_view_all_tenants
from siparis.services import buyer_dashboard_servisi


class MeView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]

    def get(self, request):
        # Client ?firma_id= asla kullanılmaz
        return Response(present_me(request.user, request=request))


class MeDashboardView(APIView):
    """GET /me/dashboard/ — alıcı özet sayaçlar (ADR-0029 AO-5)."""

    permission_classes = [IsAuthenticatedWithFirma]

    def get(self, request):
        user = request.user
        if can_view_all_tenants(user):
            raise PermissionDenied(
                "Ops kullanıcıları dashboard yerine ilgili API uçlarını kullanır."
            )
        if not can_buyer_commerce_read(user):
            raise PermissionDenied("Yalnız alıcı firma kullanıcıları.")
        try:
            return Response(buyer_dashboard_servisi.ozet_for_actor(actor=user))
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc


class MeUyelikListView(APIView):
    """GET /api/v1/me/uyelikler/ — kullanıcının aktif firma/rol üyelikleri (ADR-0035)."""

    permission_classes = [IsAuthenticatedWithFirma]

    def get(self, request):
        rows = (
            FirmaUyelik.objects.filter(kullanici=request.user, aktif=True)
            .select_related("firma", "kullanici")
            .order_by("-birincil", "firma__ad", "pk")
        )
        return Response({"results": [present_uyelik(u) for u in rows]})


class MeSwitchFirmaView(APIView):
    """POST /api/v1/me/switch-firma/ — aktif firma/rol oturum bağlamını değiştirir."""

    permission_classes = [IsAuthenticatedWithFirma]

    def post(self, request):
        enforce_csrf(request)
        try:
            firma_id = int(request.data.get("firma_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"firma_id": "Zorunlu tam sayı."}) from exc
        try:
            target = switch_active_uyelik(kullanici=request.user, firma_id=firma_id)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        request.user.refresh_from_db()
        return Response(
            {
                "uyelik": present_uyelik(target),
                "me": present_me(request.user, request=request),
            }
        )
