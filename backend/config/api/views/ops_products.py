"""ADR-0030 — `/api/v1/ops/products/` platform katalog yazma HTTP."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.ops_products import present_ops_product, present_ops_variant
from api.throttles import OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import has_perm
from tanimlar.models import SatisKanali
from urunler.models import Urun, UrunGorsel, UrunKanal, Varyant
from urunler.services import (
    gorsel_ekle,
    gorsel_kapak_yap,
    gorsel_sil,
    gorsel_sirala,
    onaya_gonder,
    onayla,
    ops_fiyat_onizleme,
    pasife_al,
    present_gorsel,
    reddet,
    taslak_urun_guncelle,
    taslak_urun_olustur,
    taslak_urun_sil,
    urun_hazirlik_durumu,
    urun_kanal_ekle_guncelle,
    varyant_ekle,
    varyant_guncelle,
    varyant_sil,
    varyant_toplu_ekle,
    yayina_al,
)


def _can_ops_products(user) -> bool:
    return (
        has_perm(user, P["submit_urun"])
        or has_perm(user, P["approve_urun"])
        or has_perm(user, P["publish_urun"])
    )


def _require_ops_products(user) -> None:
    firma = getattr(user, "firma", None)
    if not (firma and getattr(firma, "platform_mu", False)):
        raise PermissionDenied(detail="Ops ürün yalnız platform.")
    if not _can_ops_products(user):
        raise PermissionDenied(detail="Ürün ops yetkisi yok.")


def _get_urun(pk: int) -> Urun:
    urun = (
        Urun.objects.select_related(
            "kategori",
            "ayar",
            "olusturan_firma",
            "koleksiyon",
            "yas_grubu",
            "zincir_tipi",
            "kopca_tipi",
        )
        .prefetch_related(
            "varyantlar__renk",
            "varyantlar__beden",
            "kanallar__kanal",
            "teknikler",
            "stiller",
            "ozel_gunler",
            "gorseller",
        )
        .filter(pk=pk)
        .first()
    )
    if urun is None:
        raise NotFound(detail="Ürün bulunamadı.")
    return urun


class OpsProductListCreateView(IdempotencyMixin, APIView):
    """GET liste; POST taslak create."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops_products(request.user)
        qs = (
            Urun.objects.select_related(
                "kategori",
                "ayar",
                "koleksiyon",
                "yas_grubu",
                "zincir_tipi",
                "kopca_tipi",
            )
            .prefetch_related("kanallar__kanal", "teknikler", "stiller", "ozel_gunler")
            .annotate(
                varyant_count=Count(
                    "varyantlar", filter=Q(varyantlar__aktif=True)
                )
            )
        )
        onay = (request.query_params.get("onay_durumu") or "").strip()
        if onay:
            qs = qs.filter(onay_durumu=onay)
        yayin = (request.query_params.get("yayin_durumu") or "").strip()
        if yayin:
            qs = qs.filter(yayin_durumu=yayin)
        kat_id = (request.query_params.get("kategori_id") or "").strip()
        if kat_id.isdigit():
            qs = qs.filter(kategori_id=int(kat_id))
        one_cikan = (request.query_params.get("one_cikan") or "").strip().lower()
        if one_cikan in ("true", "1"):
            qs = qs.filter(kategori__one_cikan=True)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(ad__icontains=term) | Q(platform_kodu__icontains=term)
            )
        raw_ord = (request.query_params.get("ordering") or "").strip()
        if raw_ord == "vitrin":
            qs = qs.order_by("-kategori__one_cikan", "kategori__sira", "-pk")
        else:
            qs = apply_ordering(
                qs,
                request,
                whitelist=("pk", "ad", "platform_kodu", "kategori__sira", "kategori__one_cikan"),
                default="-pk",
            )
        return paginate_queryset(
            request,
            qs,
            present=lambda u: present_ops_product(u, user=request.user),
        )

    def post(self, request):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        body = request.data if isinstance(request.data, dict) else {}
        try:
            kid = int(body.get("kategori_id"))
            aid = int(body.get("ayar_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                detail={"kategori_id": "Kategori ve ayar seçimi zorunludur."}
            ) from exc
        try:
            sk = body.get("satis_kanali_id")
            tg = body.get("termin_gun")
            urun = taslak_urun_olustur(
                actor=request.user,
                ad=body.get("ad") or "",
                kategori_id=kid,
                ayar_id=aid,
                aciklama=body.get("aciklama") or "",
                fiyat_tipi=(body.get("fiyat_tipi") or "gram").strip() or "gram",
                temin_tipi=(body.get("temin_tipi") or "hazir").strip() or "hazir",
                termin_gun=int(tg) if tg not in (None, "") else None,
                renk_ekseni=bool(body.get("renk_ekseni", False)),
                olcu_tipi=(body.get("olcu_tipi") or "").strip(),
                satis_kanali_id=int(sk) if sk not in (None, "") else None,
                koleksiyon_id=body.get("koleksiyon_id"),
                hedef_kitle=body.get("hedef_kitle") or "",
                yas_grubu_id=body.get("yas_grubu_id"),
                yuzey=body.get("yuzey") or "",
                zincir_tipi_id=body.get("zincir_tipi_id"),
                kopca_tipi_id=body.get("kopca_tipi_id"),
                teknik_ids=body.get("teknik_ids"),
                stil_ids=body.get("stil_ids"),
                ozel_gun_ids=body.get("ozel_gun_ids"),
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(_get_urun(urun.pk), user=request.user, include_variants=True, include_media=True),
            status=status.HTTP_201_CREATED,
        )
        return self.idempotency_commit(request, response)


class OpsProductDetailView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = _get_urun(pk)
        return Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )

    def patch(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = _get_urun(pk)
        body = request.data if isinstance(request.data, dict) else {}
        kwargs: dict[str, object] = {}
        for key in (
            "ad",
            "kategori_id",
            "ayar_id",
            "aciklama",
            "fiyat_tipi",
            "temin_tipi",
            "termin_gun",
            "renk_ekseni",
            "olcu_tipi",
            "koleksiyon_id",
            "hedef_kitle",
            "yas_grubu_id",
            "yuzey",
            "zincir_tipi_id",
            "kopca_tipi_id",
            "teknik_ids",
            "stil_ids",
            "ozel_gun_ids",
        ):
            if key in body:
                kwargs[key] = body.get(key)
        try:
            urun = taslak_urun_guncelle(
                actor=request.user,
                urun=urun,
                **kwargs,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(
            present_ops_product(
                _get_urun(urun.pk),
                user=request.user,
                include_variants=True,
                include_media=True,
            )
        )

    def delete(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = _get_urun(pk)
        try:
            taslak_urun_sil(actor=request.user, urun=urun)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response({"deleted": True, "id": pk})


class OpsProductVariantCreateView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        renk_id = body.get("renk_id")
        beden_id = body.get("beden_id")
        try:
            v = varyant_ekle(
                actor=request.user,
                urun=urun,
                gram=body.get("gram"),
                renk_id=int(renk_id) if renk_id not in (None, "") else None,
                beden_id=int(beden_id) if beden_id not in (None, "") else None,
                ek_bedel=body.get("ek_bedel"),
                sabit_fiyat=body.get("sabit_fiyat"),
                tedarikci_sku=str(body.get("tedarikci_sku") or ""),
                benzersiz_parca=bool(body.get("benzersiz_parca", False)),
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_variant(v), status=status.HTTP_201_CREATED
        )
        return self.idempotency_commit(request, response)


class OpsProductVariantDetailView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def patch(self, request, pk: int, vid: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        v = get_object_or_404(Varyant.objects.select_related("urun"), pk=vid, urun_id=pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            v = varyant_guncelle(
                actor=request.user,
                varyant=v,
                gram=body.get("gram") if "gram" in body else None,
                renk_id=body.get("renk_id") if "renk_id" in body else None,
                beden_id=body.get("beden_id") if "beden_id" in body else None,
                ek_bedel=body.get("ek_bedel") if "ek_bedel" in body else None,
                sabit_fiyat=body.get("sabit_fiyat") if "sabit_fiyat" in body else None,
                tedarikci_sku=body.get("tedarikci_sku") if "tedarikci_sku" in body else None,
                benzersiz_parca=body.get("benzersiz_parca") if "benzersiz_parca" in body else None,
                aktif=body.get("aktif") if "aktif" in body else None,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_ops_variant(v))

    def delete(self, request, pk: int, vid: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        v = get_object_or_404(Varyant.objects.select_related("urun"), pk=vid, urun_id=pk)
        try:
            varyant_sil(actor=request.user, varyant=v)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response({"deleted": True, "id": vid})


class OpsProductChannelsView(APIView):
    """GET/POST /api/v1/ops/products/<pk>/channels/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = get_object_or_404(Urun, pk=pk)
        existing = {uk.kanal_id: uk for uk in UrunKanal.objects.filter(urun=urun)}
        kanallar = SatisKanali.objects.order_by("sira", "ad")
        return Response(
            {
                "urun_id": urun.pk,
                "results": [
                    {
                        "kanal_id": k.pk,
                        "kod": k.kod,
                        "ad": k.ad,
                        "tip": k.tip,
                        "atanmis": k.pk in existing,
                        "aktif": existing[k.pk].aktif if k.pk in existing else False,
                    }
                    for k in kanallar
                ],
            }
        )

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            kanal_id = int(body.get("kanal_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"kanal_id": "Satış kanalı seçimi zorunludur."}) from exc
        try:
            uk = urun_kanal_ekle_guncelle(
                actor=request.user,
                urun=urun,
                kanal_id=kanal_id,
                aktif=bool(body.get("aktif", True)),
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(
            {
                "id": uk.pk,
                "urun_id": uk.urun_id,
                "kanal_id": uk.kanal_id,
                "aktif": uk.aktif,
            }
        )


class OpsProductSubmitView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        try:
            urun = onaya_gonder(urun, request.user)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )
        return self.idempotency_commit(request, response)


class OpsProductApproveView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        try:
            urun = onayla(urun, request.user)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )
        return self.idempotency_commit(request, response)


class OpsProductRejectView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        neden = body.get("neden") or body.get("reason") or ""
        try:
            urun = reddet(urun, request.user, neden)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )
        return self.idempotency_commit(request, response)


class OpsProductPublishView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        durum = (body.get("durum") or "aktif").strip() or "aktif"
        try:
            urun = yayina_al(urun, request.user, durum=durum)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )
        return self.idempotency_commit(request, response)


class OpsProductUnpublishView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        try:
            urun = pasife_al(urun, request.user)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(urun, user=request.user, include_variants=True, include_media=True)
        )
        return self.idempotency_commit(request, response)


class OpsProductVariantBulkCreateView(IdempotencyMixin, APIView):
    """POST /api/v1/ops/products/<pk>/variants/bulk/ — {satirlar: [...]}."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            created = varyant_toplu_ekle(
                actor=request.user,
                urun=urun,
                satirlar=body.get("satirlar") or [],
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            {
                "count": len(created),
                "results": [present_ops_variant(v) for v in created],
                "hazirlik": urun_hazirlik_durumu(_get_urun(urun.pk)),
            },
            status=status.HTTP_201_CREATED,
        )
        return self.idempotency_commit(request, response)


class OpsProductReadinessView(APIView):
    """GET /api/v1/ops/products/<pk>/readiness/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = _get_urun(pk)
        return Response(urun_hazirlik_durumu(urun))


class OpsProductMediaListCreateView(APIView):
    """GET/POST /api/v1/ops/products/<pk>/media/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = get_object_or_404(Urun, pk=pk)
        rows = [
            present_gorsel(g, request=request)
            for g in urun.gorseller.order_by("sira", "pk")
        ]
        return Response({"count": len(rows), "results": rows})

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = get_object_or_404(Urun, pk=pk)
        dosya = request.FILES.get("dosya") or request.FILES.get("file")
        kapak_raw = request.data.get("kapak")
        kapak = str(kapak_raw).lower() in ("1", "true", "yes", "on")
        varyant_id = request.data.get("varyant_id")
        try:
            g = gorsel_ekle(
                actor=request.user,
                urun=urun,
                dosya=dosya,
                tip=request.data.get("tip") or "galeri",
                alt_metin=request.data.get("alt_metin") or "",
                kapak=kapak,
                varyant_id=int(varyant_id) if varyant_id not in (None, "") else None,
                sira=int(request.data["sira"]) if request.data.get("sira") not in (None, "") else None,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(
            present_gorsel(g, request=request), status=status.HTTP_201_CREATED
        )


class OpsProductMediaDetailView(APIView):
    """POST cover / DELETE /api/v1/ops/products/<pk>/media/<gid>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int, gid: int):
        """Kapak yap: {\"action\": \"set_cover\"} veya sıralama body ile list view kullan."""
        _require_ops_products(request.user)
        enforce_csrf(request)
        g = get_object_or_404(UrunGorsel, pk=gid, urun_id=pk)
        action = (request.data.get("action") or "set_cover").strip()
        try:
            if action == "set_cover":
                g = gorsel_kapak_yap(actor=request.user, gorsel=g)
            else:
                raise ValidationError({"action": "Desteklenen: set_cover"})
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_gorsel(g, request=request))

    def delete(self, request, pk: int, gid: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        g = get_object_or_404(UrunGorsel, pk=gid, urun_id=pk)
        try:
            gorsel_sil(actor=request.user, gorsel=g)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response({"deleted": True, "id": gid})


class OpsProductMediaReorderView(APIView):
    """POST /api/v1/ops/products/<pk>/media/reorder/ — {siralar:[{id,sira}]}."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            rows = gorsel_sirala(
                actor=request.user,
                urun=urun,
                siralar=body.get("siralar") or [],
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(
            {
                "results": [present_gorsel(g, request=request) for g in rows],
            }
        )


class OpsProductPricePreviewView(APIView):
    """GET /api/v1/ops/products/<pk>/variants/<vid>/price-preview/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int, vid: int):
        _require_ops_products(request.user)
        v = get_object_or_404(
            Varyant.objects.select_related("urun", "urun__ayar"),
            pk=vid,
            urun_id=pk,
        )
        try:
            data = ops_fiyat_onizleme(actor=request.user, varyant=v)
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(data)
