"""ADR-0034 — `/api/v1/firma/kullanicilar/` (FIRMA_ADMIN / manage_users)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.firma_ops import present_uyelik
from api.throttles import BuyerRateThrottle
from api.views.auth import _django_ve_to_drf
from firmalar import roles
from firmalar.models import FirmaUyelik
from firmalar.role_permissions import P
from firmalar.services.rol_servisi import assign_user_role
from firmalar.services.uyelik_servisi import upsert_uyelik
from firmalar.services.yetki_servisi import can_manage_all_users, can_view_all_tenants, has_perm

User = get_user_model()


def _require_firma_user_admin(user) -> None:
    if can_manage_all_users(user) or can_view_all_tenants(user):
        return
    if not has_perm(user, P["manage_users"]):
        raise PermissionDenied(detail="Kullanıcı yönetimi yetkisi yok.")
    if user.rol not in (
        roles.FIRMA_ADMIN,
        roles.ALICI_YONETICI,
        roles.TEDARIKCI_SAHIP,
        roles.TEDARIKCI_YONETICI,
    ):
        # manage_users yeterli; ekstra rol filtresi soft
        pass


from django.db.models import Q


class FirmaKullaniciListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        _require_firma_user_admin(request.user)
        is_ops = can_view_all_tenants(request.user)
        firma_id = getattr(request.user, "firma_id", None)
        rows = FirmaUyelik.objects.select_related("kullanici", "firma")
        if is_ops:
            raw = request.query_params.get("firma_id")
            if raw:
                rows = rows.filter(firma_id=int(raw))
        else:
            if not firma_id:
                raise ValidationError({"firma_id": "Zorunlu."})
            rows = rows.filter(firma_id=firma_id)
        term = (request.query_params.get("q") or "").strip()
        if term:
            rows = rows.filter(
                Q(kullanici__username__icontains=term)
                | Q(kullanici__email__icontains=term)
                | Q(kullanici__first_name__icontains=term)
                | Q(kullanici__last_name__icontains=term)
                | Q(firma__ad__icontains=term)
            )
        rows = rows.order_by("kullanici__username", "pk")
        return Response([present_uyelik(u) for u in rows])


class FirmaKullaniciRolView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def patch(self, request, user_id: int):
        _require_firma_user_admin(request.user)
        enforce_csrf(request)
        target = get_object_or_404(User, pk=user_id)
        if not can_view_all_tenants(request.user):
            if target.firma_id != request.user.firma_id:
                raise PermissionDenied(detail="Başka firma kullanıcısı.")
        rol = (request.data.get("rol") or "").strip()
        aktif = request.data.get("aktif", True)
        try:
            if aktif is False or str(aktif).lower() in ("0", "false"):
                upsert_uyelik(
                    kullanici=target,
                    firma=target.firma,
                    rol=target.rol or roles.ALICI_DENETCI,
                    aktif=False,
                )
                target.is_active = False
                target.save(update_fields=["is_active"])
                uye = FirmaUyelik.objects.filter(
                    kullanici=target, firma=target.firma
                ).first()
                return Response(present_uyelik(uye) if uye else {"ok": True})
            assign_user_role(
                actor=request.user,
                user=target,
                firma=target.firma,
                rol=rol or target.rol,
            )
            uye = FirmaUyelik.objects.get(
                kullanici=target, firma_id=target.firma_id, aktif=True
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_uyelik(uye), status=status.HTTP_200_OK)
