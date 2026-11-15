"""POST /api/v1/ops/varyant-fiyat/ — Stok & Fiyat upsert (teklif yok)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exc import raise_drf
from api.permissions import IsAuthenticatedWithFirma
from firmalar.services.yetki_servisi import is_platform_firm_user, require_perm
from fiyatlama.models import VaryantFiyat
from fiyatlama.services.varyant_fiyat_servisi import upsert_aktif
from urunler.models import Varyant


class OpsVaryantFiyatUpsertView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]

    def post(self, request):
        if not is_platform_firm_user(request.user):
            # Tedarikçi kendi satırını yazabilir
            pass
        body = request.data if isinstance(request.data, dict) else {}
        try:
            varyant_id = int(body.get("varyant_id"))
        except (TypeError, ValueError) as exc:
            raise_drf(DjangoValidationError({"varyant_id": "Zorunlu."}))
            return  # pragma: no cover
        varyant = Varyant.objects.select_related("urun").filter(pk=varyant_id).first()
        if varyant is None:
            return Response({"detail": "Varyant yok."}, status=status.HTTP_404_NOT_FOUND)

        tedarikci = getattr(request.user, "firma", None)
        if is_platform_firm_user(request.user) and body.get("tedarikci_id"):
            from firmalar.models import Firma

            tedarikci = Firma.objects.filter(pk=int(body["tedarikci_id"])).first()
        if tedarikci is None:
            return Response(
                {"detail": "Tedarikçi bağlamı yok."}, status=status.HTTP_400_BAD_REQUEST
            )

        fiyat_modeli = (body.get("fiyat_modeli") or "SABIT_PARCA").strip().upper()
        try:
            birim_fiyat = (
                Decimal(str(body["birim_fiyat"]))
                if body.get("birim_fiyat") is not None
                else None
            )
            gram = Decimal(str(body["gram"])) if body.get("gram") is not None else None
            iscilik = (
                Decimal(str(body["iscilik"])) if body.get("iscilik") is not None else None
            )
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise_drf(DjangoValidationError({"birim_fiyat": "Geçersiz sayı."}))
            return  # pragma: no cover

        try:
            require_perm(request.user, "fiyatlama.manage_varyant_fiyat")
        except DjangoPermissionDenied:
            # fallback: manage_own_warehouse / manage_warehouse
            try:
                require_perm(request.user, "stok.manage_own_warehouse")
            except DjangoPermissionDenied as exc:
                raise_drf(exc)

        try:
            vf = upsert_aktif(
                kullanici=request.user,
                varyant=varyant,
                tedarikci=tedarikci,
                fiyat_modeli=fiyat_modeli,
                gram=gram,
                birim_fiyat=birim_fiyat,
                para_birimi=(body.get("para_birimi") or "TRY"),
                iscilik=iscilik,
                tas_bedeli=body.get("tas_bedeli"),
                ek_bedel=body.get("ek_bedel"),
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            raise_drf(exc)

        return Response(
            {
                "id": vf.pk,
                "varyant_id": vf.varyant_id,
                "tedarikci_id": vf.tedarikci_id,
                "versiyon": vf.versiyon,
                "durum": vf.durum,
                "fiyat_modeli": vf.fiyat_modeli,
                "birim_fiyat": str(vf.birim_fiyat) if vf.birim_fiyat is not None else None,
                "gram": str(vf.gram) if vf.gram is not None else None,
                "para_birimi": vf.para_birimi,
                "iscilik": str(vf.iscilik),
            },
            status=status.HTTP_201_CREATED,
        )


class OpsVaryantFiyatListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]

    def get(self, request):
        qs = VaryantFiyat.objects.filter(durum=VaryantFiyat.Durum.AKTIF)
        vid = request.query_params.get("varyant_id")
        if vid:
            qs = qs.filter(varyant_id=int(vid))
        rows = [
            {
                "id": vf.pk,
                "varyant_id": vf.varyant_id,
                "tedarikci_id": vf.tedarikci_id,
                "versiyon": vf.versiyon,
                "fiyat_modeli": vf.fiyat_modeli,
                "birim_fiyat": str(vf.birim_fiyat) if vf.birim_fiyat is not None else None,
                "para_birimi": vf.para_birimi,
            }
            for vf in qs.order_by("-id")[:200]
        ]
        return Response({"results": rows})
