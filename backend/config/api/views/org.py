"""B4 — OrgBirimi / OrgUyeligi HTTP (org_servisi)."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exc import raise_drf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.enterprise import present_org, present_org_member
from api.throttles import BuyerRateThrottle
from firmalar.models import OrgBirimi, OrgUyeligi
from firmalar.role_permissions import P
from firmalar.selectors.org import get_org_for_actor, scope_org_queryset
from firmalar.services import org_servisi
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm

User = get_user_model()


def _can_manage_org(user) -> bool:
    return has_perm(user, P["manage_org"])


def _actor_firma(user):
    firma = getattr(user, "firma", None)
    if firma is None:
        raise PermissionDenied(detail="Firma yok.")
    return firma


from django.db.models import ProtectedError, Q
from api.authentication import enforce_csrf


class OrgUnitListCreateView(IdempotencyMixin, APIView):
    """GET liste; POST oluştur — {kod, ad, parent_id?}."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        # Client firma_id yok sayılır — selector tenant scope.
        request.query_params.get("firma_id")
        qs = scope_org_queryset(
            OrgBirimi.objects.select_related("parent", "firma"), request.user
        )
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(kod__icontains=term)
                | Q(ad__icontains=term)
                | Q(firma__ad__icontains=term)
            )
        aktif_p = (request.query_params.get("aktif") or "").strip().lower()
        if aktif_p in ("true", "1"):
            qs = qs.filter(aktif=True)
        elif aktif_p in ("false", "0"):
            qs = qs.filter(aktif=False)
        qs = apply_ordering(
            qs, request, whitelist=("kod", "ad", "pk"), default="kod"
        )
        can_m = _can_manage_org(request.user)
        return paginate_queryset(
            request, qs, present=lambda o: present_org(o, can_manage=can_m)
        )

    def post(self, request):
        if not _can_manage_org(request.user) and not can_view_all_tenants(
            request.user
        ):
            raise PermissionDenied(detail="Org yönetimi için manage_org gerekir.")
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        firma = _actor_firma(request.user)
        kod = request.data.get("kod")
        ad = request.data.get("ad") or ""
        parent = None
        raw_parent = request.data.get("parent_id")
        if raw_parent is not None and raw_parent != "":
            try:
                parent = get_org_for_actor(request.user, int(raw_parent))
            except (ObjectDoesNotExist, TypeError, ValueError) as exc:
                raise NotFound(detail="Parent org bulunamadı.") from exc
        try:
            ob = org_servisi.olustur_birim(
                actor=request.user,
                firma=firma,
                kod=kod,
                ad=ad,
                parent=parent,
            )
        except (DjangoPermissionDenied, DjangoValidationError) as exc:
            raise_drf(exc)
        return self.idempotency_commit(
            request,
            Response(
                present_org(ob, can_manage=True),
                status=status.HTTP_201_CREATED,
            ),
        )


class OrgUnitDetailView(IdempotencyMixin, APIView):
    """GET/PATCH/DELETE /api/v1/org-units/<pk>/ — scope dışı → 404."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        try:
            ob = get_org_for_actor(request.user, pk)
        except ObjectDoesNotExist as exc:
            raise NotFound(detail="Org birimi bulunamadı.") from exc
        return Response(
            present_org(ob, can_manage=_can_manage_org(request.user))
        )

    def patch(self, request, pk: int):
        if not _can_manage_org(request.user) and not can_view_all_tenants(
            request.user
        ):
            raise PermissionDenied(detail="Org yönetimi için manage_org gerekir.")
        enforce_csrf(request)
        try:
            ob = get_org_for_actor(request.user, pk)
        except ObjectDoesNotExist as exc:
            raise NotFound(detail="Org birimi bulunamadı.") from exc
        if "kod" in request.data:
            kod = (request.data.get("kod") or "").strip().upper()
            if not kod:
                raise ValidationError({"kod": "Birim kodu boş olamaz."})
            if OrgBirimi.objects.filter(firma=ob.firma, kod=kod).exclude(pk=ob.pk).exists():
                raise ValidationError({"kod": "Bu kod firmada zaten kullanılıyor."})
            ob.kod = kod
        if "ad" in request.data:
            ad = (request.data.get("ad") or "").strip()
            if not ad:
                raise ValidationError({"ad": "Birim adı boş olamaz."})
            ob.ad = ad
        if "aktif" in request.data:
            raw_a = request.data.get("aktif")
            ob.aktif = raw_a if isinstance(raw_a, bool) else str(raw_a).lower() in ("true", "1")
        if "parent_id" in request.data:
            raw_parent = request.data.get("parent_id")
            if raw_parent in (None, ""):
                ob.parent = None
            else:
                try:
                    parent = get_org_for_actor(request.user, int(raw_parent))
                except (ObjectDoesNotExist, TypeError, ValueError) as exc:
                    raise NotFound(detail="Üst birim bulunamadı.") from exc
                if parent.pk == ob.pk:
                    raise ValidationError({"parent_id": "Birim kendisinin üst birimi olamaz."})
                if parent.firma_id != ob.firma_id:
                    raise ValidationError({"parent_id": "Üst birim aynı firmada olmalıdır."})
                ob.parent = parent
        ob.save()
        return Response(present_org(ob, can_manage=True))

    def delete(self, request, pk: int):
        if not _can_manage_org(request.user) and not can_view_all_tenants(
            request.user
        ):
            raise PermissionDenied(detail="Org yönetimi için manage_org gerekir.")
        enforce_csrf(request)
        try:
            ob = get_org_for_actor(request.user, pk)
        except ObjectDoesNotExist as exc:
            raise NotFound(detail="Org birimi bulunamadı.") from exc
        try:
            ob.delete()
        except ProtectedError as exc:
            raise ValidationError(
                {"detail": "Bu birime bağlı alt kayıtlar olduğu için silinemiyor. Pasife alabilirsiniz."}
            ) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrgMemberListCreateView(IdempotencyMixin, APIView):
    """GET üyeler; POST üye ekle — {kullanici_id}."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def _org(self, request, pk: int) -> OrgBirimi:
        try:
            return get_org_for_actor(request.user, pk)
        except ObjectDoesNotExist as exc:
            raise NotFound(detail="Org birimi bulunamadı.") from exc

    def get(self, request, pk: int):
        ob = self._org(request, pk)
        qs = (
            OrgUyeligi.objects.filter(org_birimi=ob)
            .select_related("kullanici")
            .order_by("pk")
        )
        return paginate_queryset(request, qs, present=present_org_member)

    def post(self, request, pk: int):
        if not _can_manage_org(request.user) and not can_view_all_tenants(
            request.user
        ):
            raise PermissionDenied(detail="Org yönetimi için manage_org gerekir.")
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        ob = self._org(request, pk)
        try:
            uid = int(request.data.get("kullanici_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(detail={"kullanici_id": "Geçersiz."}) from exc
        # Çapraz firma kullanıcı → varlık sızdırma yok (404).
        user = User.objects.filter(pk=uid, firma_id=ob.firma_id).first()
        if user is None:
            raise NotFound(detail="Kullanıcı bulunamadı.")
        try:
            uy = org_servisi.uye_ekle(
                actor=request.user, org_birimi=ob, kullanici=user
            )
        except (DjangoPermissionDenied, DjangoValidationError) as exc:
            raise_drf(exc)
        return self.idempotency_commit(
            request,
            Response(present_org_member(uy), status=status.HTTP_201_CREATED),
        )


class OrgMemberDetailView(APIView):
    """DELETE /api/v1/org-units/<pk>/members/<member_id>/"""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def delete(self, request, pk: int, member_id: int):
        if not _can_manage_org(request.user) and not can_view_all_tenants(
            request.user
        ):
            raise PermissionDenied(detail="Org yönetimi için manage_org gerekir.")
        enforce_csrf(request)
        try:
            ob = get_org_for_actor(request.user, pk)
        except ObjectDoesNotExist as exc:
            raise NotFound(detail="Org birimi bulunamadı.") from exc
        uy = OrgUyeligi.objects.filter(pk=member_id, org_birimi=ob).first()
        if uy is None:
            raise NotFound(detail="Üyelik bulunamadı.")
        uy.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
