"""F7-010 + API-B2 — Buyer katalog liste/detay (maskeli; yayınlı).

Liste/detay alanları `urunler.services.buyer_katalog_servisi` ile hizalı
(`q` arama HTML F9-011 ile aynı).
"""

from django.db.models import Count, Q
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.masking import assert_masked
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.buyer import (
    BuyerCatalogDetailPresenter,
    BuyerCatalogItemPresenter,
)
from api.throttles import BuyerRateThrottle
from firmalar.services.kanal_gorunurluk_servisi import filter_buyer_catalog_queryset
from firmalar.services.yetki_servisi import can_view_all_tenants
from urunler.models import (
    Berraklik,
    KesimKalitesi,
    RenkDerecesi,
    SertifikaKurumu,
    TasKesimi,
    TasMensei,
    TasTipi,
    Urun,
)
from urunler.services.katalog_filtre_servisi import apply_katalog_list_filters


def _assert_buyer_or_ops(user) -> None:
    if can_view_all_tenants(user):
        return
    firma = getattr(user, "firma", None)
    if firma is None or not getattr(firma, "alici_mi", False):
        raise PermissionDenied(detail="Katalog yalnız alıcı veya ops.")


class BuyerCatalogListView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        _assert_buyer_or_ops(request.user)
        qs = (
            Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
            .select_related("kategori", "ayar", "ayar__metal")
            .prefetch_related("varyantlar", "gorseller")
            .annotate(
                varyant_count=Count(
                    "varyantlar", filter=Q(varyantlar__aktif=True)
                )
            )
            # Satın alınabilir vitrin: aktif varyantsız ürün listelenmez
            .filter(varyant_count__gte=1)
        )
        # ADR-0033: AliciKanalErisimi varsa kanal görünürlük; yoksa legacy
        if not can_view_all_tenants(request.user):
            qs = filter_buyer_catalog_queryset(qs, actor=request.user)
        # Onay/yayın zaten qs'te; filtre servisi ek alanlar + SKU araması
        qs = apply_katalog_list_filters(qs, request.query_params)

        raw_ord = (request.query_params.get("ordering") or "").strip()
        if not raw_ord or raw_ord == "vitrin":
            qs = qs.order_by("-kategori__one_cikan", "kategori__sira", "pk")
        else:
            qs = apply_ordering(
                qs,
                request,
                whitelist=("pk", "ad", "platform_kodu", "kategori__sira", "kategori__one_cikan"),
                default="pk",
            )
        return paginate_queryset(
            request, qs, present=BuyerCatalogItemPresenter
        )


class BuyerCatalogDetailView(APIView):
    """GET /api/v1/catalog/<pk>/ — yalnız yayınlı+onaylı; varyant listesi."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        _assert_buyer_or_ops(request.user)
        try:
            data = BuyerCatalogDetailPresenter(pk)
        except LookupError as exc:
            raise NotFound(detail="Ürün bulunamadı.") from exc
        return Response(data)


class BuyerCatalogMonturListView(APIView):
    """ADR-0043 — GET /api/v1/catalog/monturler/ (Varyant.tip=MONTUR)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        _assert_buyer_or_ops(request.user)
        from urunler.models import Varyant

        qs = (
            Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
            .filter(
                varyantlar__aktif=True,
                varyantlar__tip=Varyant.Tip.MONTUR,
            )
            .distinct()
            .select_related("kategori", "ayar")
            .prefetch_related("varyantlar__renk", "varyantlar__beden")
            .annotate(
                varyant_count=Count(
                    "varyantlar",
                    filter=Q(varyantlar__aktif=True, varyantlar__tip=Varyant.Tip.MONTUR),
                )
            )
        )
        if not can_view_all_tenants(request.user):
            qs = filter_buyer_catalog_queryset(qs, actor=request.user)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(ad__icontains=term) | Q(platform_kodu__icontains=term))
        qs = apply_ordering(
            qs, request, whitelist=("pk", "ad", "platform_kodu"), default="pk"
        )

        def _present_montur(u: Urun) -> dict:
            from urunler.models import Varyant as V
            from urunler.services.uyumluluk_servisi import present_uyumluluk

            item = BuyerCatalogItemPresenter(u)
            # Tüm MONTUR parçaları (FULL/HEAD/BAND); imalata_acik bayrağı FE filtreler
            item["varyantlar"] = [
                {
                    "id": v.pk,
                    "sku": v.sku,
                    "tip": v.tip,
                    "gram": str(v.gram) if v.gram is not None else None,
                    "renk": getattr(getattr(v, "renk", None), "ad", "") or "",
                    "beden": getattr(getattr(v, "beden", None), "deger", "") or "",
                    **present_uyumluluk(v),
                }
                for v in u.varyantlar.all()
                if v.aktif and v.tip == V.Tip.MONTUR
            ]
            assert_masked(item, context="buyer")
            return item

        return paginate_queryset(request, qs, present=_present_montur)


class BuyerCatalogTasListView(APIView):
    """ADR-0043 — GET /api/v1/catalog/taslar/

    Varsayılan: satınalınabilir TAS varyantlı ürünler.
    `?mode=referans` → eski TasTipi + 4C sözlükleri.
    """

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        _assert_buyer_or_ops(request.user)
        mode = (request.query_params.get("mode") or "").strip().lower()
        if mode == "referans":
            qs = TasTipi.objects.filter(aktif=True).order_by("sira", "ad")
            term = (request.query_params.get("q") or "").strip()
            if term:
                qs = qs.filter(Q(ad__icontains=term) | Q(kod__icontains=term))

            def _present_ref(t: TasTipi) -> dict:
                item = {
                    "id": t.pk,
                    "kod": t.kod,
                    "ad": t.ad,
                    "degerli": bool(t.degerli),
                    "sira": t.sira,
                }
                assert_masked(item, context="buyer")
                return item

            referanslar = {
                "kesimler": list(
                    TasKesimi.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
                "berrakliklar": list(
                    Berraklik.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
                "renk_dereceleri": list(
                    RenkDerecesi.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
                "kesim_kaliteleri": list(
                    KesimKalitesi.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
                "sertifika_kurumlari": list(
                    SertifikaKurumu.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
                "menseiler": list(
                    TasMensei.objects.filter(aktif=True)
                    .order_by("sira", "ad")
                    .values("id", "kod", "ad")
                ),
            }
            return paginate_queryset(
                request,
                qs,
                present=_present_ref,
                extra={"referanslar": referanslar, "mode": "referans"},
            )

        from urunler.models import Varyant

        qs = (
            Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
            .filter(varyantlar__aktif=True, varyantlar__tip=Varyant.Tip.TAS)
            .distinct()
            .select_related("kategori", "ayar")
            .prefetch_related("varyantlar__renk", "varyantlar__beden")
            .annotate(
                varyant_count=Count(
                    "varyantlar",
                    filter=Q(varyantlar__aktif=True, varyantlar__tip=Varyant.Tip.TAS),
                )
            )
        )
        if not can_view_all_tenants(request.user):
            qs = filter_buyer_catalog_queryset(qs, actor=request.user)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(ad__icontains=term) | Q(platform_kodu__icontains=term))
        qs = apply_ordering(
            qs, request, whitelist=("pk", "ad", "platform_kodu"), default="pk"
        )

        def _present_tas_urun(u: Urun) -> dict:
            item = BuyerCatalogItemPresenter(u)
            item["varyantlar"] = [
                {
                    "id": v.pk,
                    "sku": v.sku,
                    "tip": v.tip,
                    "gram": str(v.gram) if v.gram is not None else None,
                    "renk": getattr(getattr(v, "renk", None), "ad", "") or "",
                    "beden": getattr(getattr(v, "beden", None), "deger", "") or "",
                    "karat": str(v.karat) if v.karat is not None else None,
                    "kesim_kod": (v.kesim_kod or "").strip().upper(),
                }
                for v in u.varyantlar.all()
                if v.aktif and v.tip == Varyant.Tip.TAS
            ]
            assert_masked(item, context="buyer")
            return item

        return paginate_queryset(
            request, qs, present=_present_tas_urun, extra={"mode": "varyant"}
        )
