"""ADR-0034 FAZ 2 — `/api/v1/ops/firmalar/` + alt kaynaklar."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.firma_ops import (
    present_adres,
    present_api_anahtar,
    present_banka,
    present_belge,
    present_firma,
    present_kanal_izni,
    present_kontak,
)
from api.throttles import OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from firmalar.models import (
    Firma,
    FirmaAdresi,
    FirmaBankaHesabi,
    FirmaBelge,
    FirmaKontak,
    FirmaTipAtama,
    TedarikciKanalIzni,
)
from firmalar.role_permissions import P
from firmalar.services import invite_servisi
from firmalar.services.api_anahtar_servisi import iptal_et as anahtar_iptal
from firmalar.services.api_anahtar_servisi import olustur as anahtar_olustur
from firmalar.services.firma_belge_servisi import ekle as belge_ekle
from firmalar.services.firma_durum_servisi import gecis
from firmalar.services.firma_onay_servisi import onayla_firma
from firmalar.services.kanal_izin_servisi import onayla as kanal_onayla
from firmalar.services.kanal_izin_servisi import reddet as kanal_reddet
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm


def _require_ops(user) -> None:
    if not can_view_all_tenants(user):
        raise PermissionDenied(detail="Ops firma için view_all_tenants gerekir.")


def _require_approve(user) -> None:
    _require_ops(user)
    if not has_perm(user, P["approve_firma"]):
        raise PermissionDenied(detail="approve_firma gerekir.")


class OpsFirmaListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops(request.user)
        qs = Firma.objects.all()
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(ad__icontains=term)
                | Q(firma_kodu__icontains=term)
                | Q(vergi_no__icontains=term)
            )
        durum = (request.query_params.get("durum") or "").strip()
        if durum:
            qs = qs.filter(durum=durum)
        qs = apply_ordering(
            qs, request, whitelist=("pk", "ad", "firma_kodu", "durum"), default="ad"
        )
        return paginate_queryset(request, qs, present=present_firma)

    def post(self, request):
        _require_approve(request.user)
        enforce_csrf(request)
        data = request.data
        kod = (data.get("firma_kodu") or "").strip().upper()
        ad = (data.get("ad") or "").strip()
        if not kod or not ad:
            raise ValidationError({"detail": "ad ve firma_kodu zorunlu."})
        if Firma.objects.filter(firma_kodu=kod).exists():
            raise ValidationError({"firma_kodu": "Kullanımda."})
        f = Firma(
            ad=ad,
            unvan=(data.get("unvan") or "")[:200],
            firma_kodu=kod,
            vergi_no=data.get("vergi_no") or None,
            vergi_dairesi=(data.get("vergi_dairesi") or "")[:80],
            mersis_no=(data.get("mersis_no") or "")[:32],
            ticaret_sicil_no=(data.get("ticaret_sicil_no") or "")[:64],
            oda_adi=(data.get("oda_adi") or "")[:120],
            oda_kayit_no=(data.get("oda_kayit_no") or "")[:64],
            web_sitesi=(data.get("web_sitesi") or "")[:200],
            telefon=(data.get("telefon") or "")[:20],
            eposta=(data.get("eposta") or "")[:254],
            alici_mi=bool(data.get("alici_mi")),
            tedarikci_mi=bool(data.get("tedarikci_mi")),
            vade_gun=int(data.get("vade_gun") or 0),
            onay_durumu="bekliyor",
            aktif=False,
        )
        f.save()
        for tip in data.get("tipler") or []:
            tip_u = str(tip).upper()
            if tip_u in FirmaTipAtama.Tip.values:
                FirmaTipAtama.objects.get_or_create(firma=f, tip=tip_u)
                if tip_u == FirmaTipAtama.Tip.TEDARIKCI:
                    f.tedarikci_mi = True
                if tip_u in (
                    FirmaTipAtama.Tip.ALICI_KUYUMCU,
                    FirmaTipAtama.Tip.API_MUSTERISI,
                ):
                    f.alici_mi = True
        if f.alici_mi or f.tedarikci_mi:
            f.save(update_fields=["alici_mi", "tedarikci_mi"])
        return Response(present_firma(f), status=status.HTTP_201_CREATED)


class OpsFirmaDetailView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        return Response(present_firma(f))

    def patch(self, request, pk: int):
        _require_approve(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        for field in (
            "ad",
            "unvan",
            "vergi_dairesi",
            "mersis_no",
            "ticaret_sicil_no",
            "oda_adi",
            "oda_kayit_no",
            "web_sitesi",
            "telefon",
            "eposta",
        ):
            if field in request.data:
                setattr(f, field, request.data.get(field) or "")
        if "vade_gun" in request.data:
            f.vade_gun = int(request.data.get("vade_gun") or 0)
        f.save()
        return Response(present_firma(f))


class OpsFirmaOnaylaView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_approve(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        try:
            locked = onayla_firma(actor=request.user, firma=f)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_firma(locked))


class OpsFirmaAskiyaAlView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_approve(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        try:
            locked = gecis(
                actor=request.user, firma=f, yeni_durum=Firma.Durum.ASKIDA
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_firma(locked))


class OpsFirmaDavetView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        try:
            inv = invite_servisi.create_invite(
                actor=request.user,
                email=request.data.get("email") or "",
                rol=request.data.get("rol") or "",
                firma=f,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(
            {
                "id": inv.pk,
                "email": inv.email,
                "rol": inv.rol,
                "firma_id": inv.firma_id,
                "expires_at": inv.expires_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class OpsFirmaKontakListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        rows = FirmaKontak.objects.filter(firma=f)
        return Response([present_kontak(k) for k in rows])

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        k = FirmaKontak.objects.create(
            firma=f,
            ad_soyad=(request.data.get("ad_soyad") or "").strip(),
            departman=(request.data.get("departman") or "").strip().upper(),
            gorev=(request.data.get("gorev") or "")[:80],
            telefon=(request.data.get("telefon") or "")[:32],
            eposta=(request.data.get("eposta") or "")[:254],
            birincil=bool(request.data.get("birincil")),
            notlar=request.data.get("notlar") or "",
        )
        return Response(present_kontak(k), status=status.HTTP_201_CREATED)


class OpsFirmaAdresListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        return Response([present_adres(a) for a in f.adresler.all()])

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        a = FirmaAdresi.objects.create(
            firma=f,
            tip=(request.data.get("tip") or "merkez")[:10],
            il=(request.data.get("il") or "")[:50],
            ilce=(request.data.get("ilce") or "")[:50],
            adres=request.data.get("adres") or "",
            varsayilan=bool(request.data.get("varsayilan")),
        )
        return Response(present_adres(a), status=status.HTTP_201_CREATED)


class OpsFirmaBankaListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        return Response([present_banka(b) for b in f.banka_hesaplari.all()])

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        b = FirmaBankaHesabi.objects.create(
            firma=f,
            banka_adi=(request.data.get("banka_adi") or "")[:80],
            iban=(request.data.get("iban") or "")[:34],
            swift_bic=(request.data.get("swift_bic") or "")[:16],
            para_birimi=(request.data.get("para_birimi") or "TRY")[:3],
            aktif=bool(request.data.get("aktif", True)),
        )
        return Response(present_banka(b), status=status.HTTP_201_CREATED)


class OpsFirmaBelgeListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        return Response(
            [present_belge(d) for d in FirmaBelge.objects.filter(firma=f)]
        )

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        try:
            d = belge_ekle(
                actor=request.user,
                firma=f,
                tip=request.data.get("tip") or "",
                baslik=request.data.get("baslik") or "",
                storage_key=request.data.get("storage_key") or "",
                content_type=request.data.get("content_type") or "",
                byte_size=request.data.get("byte_size"),
                notlar=request.data.get("notlar") or "",
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_belge(d), status=status.HTTP_201_CREATED)


class OpsKanalIzniListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops(request.user)
        qs = TedarikciKanalIzni.objects.select_related(
            "tedarikci_firma", "satis_kanali"
        )
        durum = (request.query_params.get("durum") or "").strip()
        if durum:
            qs = qs.filter(durum=durum)
        return paginate_queryset(request, qs, present=present_kanal_izni)


class OpsKanalIzniOnayView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_approve(request.user)
        enforce_csrf(request)
        izin = get_object_or_404(TedarikciKanalIzni, pk=pk)
        try:
            row = kanal_onayla(actor=request.user, izin=izin)
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_kanal_izni(row))


class OpsKanalIzniRedView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_approve(request.user)
        enforce_csrf(request)
        izin = get_object_or_404(TedarikciKanalIzni, pk=pk)
        try:
            row = kanal_reddet(actor=request.user, izin=izin)
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_kanal_izni(row))


class OpsFirmaApiAnahtarListCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops(request.user)
        f = get_object_or_404(Firma, pk=pk)
        from firmalar.models import ApiAnahtar

        rows = ApiAnahtar.objects.filter(firma=f)
        return Response([present_api_anahtar(a) for a in rows])

    def post(self, request, pk: int):
        _require_ops(request.user)
        enforce_csrf(request)
        f = get_object_or_404(Firma, pk=pk)
        try:
            row, raw = anahtar_olustur(
                actor=request.user,
                firma=f,
                ad=request.data.get("ad") or "default",
                scopes=request.data.get("scopes"),
                rate_limit_per_min=int(
                    request.data.get("rate_limit_per_min") or 60
                ),
            )
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(
            present_api_anahtar(row, plaintext=raw),
            status=status.HTTP_201_CREATED,
        )


class OpsFirmaApiAnahtarIptalView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int, anahtar_id: int):
        _require_ops(request.user)
        enforce_csrf(request)
        from firmalar.models import ApiAnahtar

        f = get_object_or_404(Firma, pk=pk)
        anahtar = get_object_or_404(ApiAnahtar, pk=anahtar_id, firma=f)
        try:
            row = anahtar_iptal(actor=request.user, anahtar=anahtar)
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        return Response(present_api_anahtar(row))
