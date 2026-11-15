"""ADR-0030 — `/api/v1/ops/products/` platform katalog yazma HTTP."""

from __future__ import annotations

import csv
from io import StringIO

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.http import HttpResponse
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
from firmalar.models import AuditOlay
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
from urunler.models import UrunTasi
from urunler.services.katalog_filtre_servisi import apply_katalog_list_filters
from urunler.services.katalog_yazma_servisi import urun_kopyala
from urunler.services.urun_tasi_servisi import (
    present_urun_tasi,
    tas_ekle,
    tas_guncelle,
    tas_sil,
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
            "ayar__metal",
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
            "taslar__tas_tipi",
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
                "ayar__metal",
                "koleksiyon",
                "yas_grubu",
                "zincir_tipi",
                "kopca_tipi",
            )
            .prefetch_related(
                "kanallar__kanal",
                "teknikler",
                "stiller",
                "ozel_gunler",
                "taslar__tas_tipi",
            )
            .annotate(
                varyant_count=Count(
                    "varyantlar", filter=Q(varyantlar__aktif=True)
                )
            )
        )
        qs = apply_katalog_list_filters(qs, request.query_params)
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
            present=lambda u: present_ops_product(u, user=request.user, request=request),
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
                meta_baslik=body.get("meta_baslik") or "",
                meta_aciklama=body.get("meta_aciklama") or "",
                slug=body.get("slug") or "",
                canonical_url=body.get("canonical_url"),
                gorsel_alt_metni=body.get("gorsel_alt_metni") or "",
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(
                _get_urun(urun.pk),
                user=request.user,
                request=request,
                include_variants=True,
                include_media=True,
                include_hazirlik=True,
            ),
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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
            "meta_baslik",
            "meta_aciklama",
            "slug",
            "canonical_url",
            "gorsel_alt_metni",
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
                request=request,
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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
            present_ops_product(urun, user=request.user, request=request, include_variants=True, include_media=True, include_hazirlik=True)
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


class OpsProductStockView(APIView):
    """GET /api/v1/ops/products/<pk>/stock/ — salt okunur StockBalance özeti."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = _get_urun(pk)
        from stok.models import StockBalance

        vids = list(urun.varyantlar.values_list("pk", flat=True))
        qs = (
            StockBalance.objects.filter(varyant_id__in=vids)
            .select_related(
                "warehouse",
                "varyant",
                "varyant__renk",
                "varyant__beden",
            )
            .order_by("varyant_id", "warehouse_id", "birim", "pk")
        )
        rows = []
        for bal in qs:
            v = bal.varyant
            rows.append(
                {
                    "balance_id": bal.pk,
                    "varyant_id": bal.varyant_id,
                    "sku": getattr(v, "sku", "") or "",
                    "renk": getattr(getattr(v, "renk", None), "ad", "") or "",
                    "beden": getattr(getattr(v, "beden", None), "deger", "") or "",
                    "warehouse_id": bal.warehouse_id,
                    "warehouse_kod": getattr(bal.warehouse, "kod", "") or "",
                    "warehouse_ad": getattr(bal.warehouse, "ad", "") or "",
                    "birim": bal.birim,
                    "on_hand": str(bal.on_hand),
                    "reserved": str(bal.reserved),
                    "blocked": str(bal.blocked),
                    "available": str(bal.available),
                }
            )
        return Response({"urun_id": urun.pk, "count": len(rows), "results": rows})


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
        tip = request.data.get("tip") or "galeri"
        harici_url = request.data.get("harici_url") or request.data.get("video_url") or ""
        try:
            g = gorsel_ekle(
                actor=request.user,
                urun=urun,
                dosya=dosya,
                tip=tip,
                alt_metin=request.data.get("alt_metin") or "",
                kapak=kapak,
                varyant_id=int(varyant_id) if varyant_id not in (None, "") else None,
                sira=int(request.data["sira"]) if request.data.get("sira") not in (None, "") else None,
                harici_url=harici_url,
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


class OpsProductCopyView(IdempotencyMixin, APIView):
    """POST /api/v1/ops/products/<pk>/copy/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        src = get_object_or_404(Urun, pk=pk)
        try:
            kopya = urun_kopyala(actor=request.user, urun=src)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        response = Response(
            present_ops_product(
                _get_urun(kopya.pk),
                user=request.user,
                request=request,
                include_variants=True,
                include_media=True,
                include_hazirlik=True,
            ),
            status=status.HTTP_201_CREATED,
        )
        return self.idempotency_commit(request, response)


class OpsProductBulkActionView(APIView):
    """POST /api/v1/ops/products/bulk/ — {action, ids}."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def post(self, request):
        _require_ops_products(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        action = (body.get("action") or "").strip()
        raw_ids = body.get("ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            raise ValidationError({"ids": "En az bir ürün id gerekli."})
        if len(raw_ids) > 100:
            raise ValidationError({"ids": "En fazla 100 ürün."})
        ids = []
        for r in raw_ids:
            try:
                ids.append(int(r))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"ids": "Geçersiz id."}) from exc

        ok, errors = [], []
        for pk in ids:
            urun = Urun.objects.filter(pk=pk).first()
            if urun is None:
                errors.append({"id": pk, "detail": "Bulunamadı"})
                continue
            try:
                if action == "submit":
                    onaya_gonder(urun, request.user)
                elif action == "delete":
                    taslak_urun_sil(actor=request.user, urun=urun)
                elif action == "unpublish":
                    pasife_al(urun, request.user)
                else:
                    raise ValidationError(
                        {"action": "Desteklenen: submit, delete, unpublish"}
                    )
                ok.append(pk)
            except (DjangoValidationError, DjangoPermissionDenied) as exc:
                errors.append({"id": pk, "detail": str(exc)})
        return Response({"ok": ok, "errors": errors, "action": action})


class OpsProductExportView(APIView):
    """GET /api/v1/ops/products/export/ — CSV (aynı filtreler)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops_products(request.user)
        qs = (
            Urun.objects.select_related("kategori", "ayar", "koleksiyon")
            .annotate(
                varyant_count=Count("varyantlar", filter=Q(varyantlar__aktif=True))
            )
            .order_by("-pk")
        )
        qs = apply_katalog_list_filters(qs, request.query_params)[:5000]
        buf = StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "id",
                "platform_kodu",
                "ad",
                "kategori",
                "ayar",
                "fiyat_tipi",
                "onay_durumu",
                "yayin_durumu",
                "varyant_count",
                "koleksiyon",
                "slug",
            ]
        )
        for u in qs:
            w.writerow(
                [
                    u.pk,
                    u.platform_kodu or "",
                    u.ad,
                    getattr(u.kategori, "ad", "") or "",
                    getattr(getattr(u, "ayar", None), "ayar_kodu", "") or "",
                    u.fiyat_tipi,
                    u.onay_durumu,
                    u.yayin_durumu,
                    u.varyant_count,
                    getattr(getattr(u, "koleksiyon", None), "ad", "") or "",
                    u.slug or "",
                ]
            )
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="urunler.csv"'
        return resp


class OpsProductAuditView(APIView):
    """GET /api/v1/ops/products/<pk>/audit/ — AuditOlay özeti."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        get_object_or_404(Urun, pk=pk)
        rows = (
            AuditOlay.objects.filter(entity_type="Urun", entity_id=str(pk))
            .select_related("actor")
            .order_by("-created_at")[:100]
        )
        return Response(
            {
                "urun_id": pk,
                "results": [
                    {
                        "id": r.pk,
                        "action": r.action,
                        "success": r.success,
                        "reason": r.reason or "",
                        "actor": getattr(r.actor, "username", "") or "",
                        "created_at": r.created_at.isoformat()
                        if r.created_at
                        else None,
                    }
                    for r in rows
                ],
            }
        )


class OpsProductStoneListCreateView(APIView):
    """GET/POST /api/v1/ops/products/<pk>/stones/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, pk: int):
        _require_ops_products(request.user)
        urun = get_object_or_404(Urun, pk=pk)
        rows = [
            present_urun_tasi(t)
            for t in urun.taslar.select_related("tas_tipi").order_by("pk")
        ]
        return Response({"count": len(rows), "results": rows})

    def post(self, request, pk: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        urun = get_object_or_404(Urun, pk=pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            row = tas_ekle(actor=request.user, urun=urun, body=body)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_urun_tasi(row), status=status.HTTP_201_CREATED)


class OpsProductStoneDetailView(APIView):
    """PATCH/DELETE /api/v1/ops/products/<pk>/stones/<sid>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def patch(self, request, pk: int, sid: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        row = get_object_or_404(
            UrunTasi.objects.select_related("urun", "tas_tipi"), pk=sid, urun_id=pk
        )
        body = request.data if isinstance(request.data, dict) else {}
        try:
            row = tas_guncelle(actor=request.user, row=row, body=body)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_urun_tasi(row))

    def delete(self, request, pk: int, sid: int):
        _require_ops_products(request.user)
        enforce_csrf(request)
        row = get_object_or_404(UrunTasi, pk=sid, urun_id=pk)
        try:
            tas_sil(actor=request.user, row=row)
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response({"deleted": True, "id": sid})
