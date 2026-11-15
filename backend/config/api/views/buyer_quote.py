"""API-B2 — buyer quote oluştur / oku (pricing_service + buyer_quote selector)."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exc import raise_drf
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import HasQuoteObjectAccess, IsBuyerCommerceWrite
from api.presenters.buyer import BuyerQuotePresenter
from api.throttles import BuyerRateThrottle
from firmalar.services.yetki_servisi import can_view_all_tenants
from fiyatlama.models import PriceQuote
from fiyatlama.selectors.buyer_quote import BuyerQuoteNotFound, get_quote_for_actor
from fiyatlama.selectors.tenant import scope_price_quote_queryset
from fiyatlama.services import pricing_service
from tanimlar.models import SatisKanali
from urunler.models import Varyant


class QuoteCreateView(IdempotencyMixin, APIView):
    """GET liste / POST /api/v1/quotes/ — {varyant_id, satis_kanali_id, para_birimi?}."""

    permission_classes = [IsBuyerCommerceWrite]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        qs = scope_price_quote_queryset(
            PriceQuote.objects.select_related(
                "varyant",
                "varyant__urun",
                "varyant__urun__ayar",
                "satis_kanali",
                "alici_firma",
            ),
            request.user,
        )
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(varyant__sku__icontains=term)
                | Q(varyant__urun__ad__icontains=term)
                | Q(varyant__urun__platform_kodu__icontains=term)
                | Q(satis_kanali__kod__icontains=term)
            )
        qs = apply_ordering(qs, request, whitelist=("pk", "hesap_zamani"), default="-pk")
        return paginate_queryset(request, qs, present=BuyerQuotePresenter)

    def post(self, request):
        if can_view_all_tenants(request.user):
            raise PermissionDenied(detail="Ops quote üretemez; alıcı oturumu kullanın.")
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        try:
            varyant_id = int(request.data.get("varyant_id"))
            kanal_id = int(request.data.get("satis_kanali_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                detail={"varyant_id": "Zorunlu.", "satis_kanali_id": "Zorunlu."}
            ) from exc
        pb = (request.data.get("para_birimi") or "TRY").upper()
        varyant = (
            Varyant.objects.select_related("urun")
            .filter(pk=varyant_id)
            .first()
        )
        kanal = SatisKanali.objects.filter(pk=kanal_id).first()
        if varyant is None:
            raise NotFound(detail="Varyant bulunamadı.")
        if kanal is None:
            raise ValidationError(detail={"satis_kanali_id": "Kanal bulunamadı."})
        try:
            quote = pricing_service.quote(
                alici_firma=request.user.firma,
                satis_kanali=kanal,
                varyant=varyant,
                kullanici=request.user,
                para_birimi=pb,
            )
        except DjangoValidationError as exc:
            raise_drf(exc)
        body = BuyerQuotePresenter(quote)
        return self.idempotency_commit(
            request, Response(body, status=status.HTTP_201_CREATED)
        )


class QuoteDetailView(APIView):
    """GET /api/v1/quotes/<pk>/."""

    permission_classes = [HasQuoteObjectAccess]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        try:
            quote = get_quote_for_actor(request.user, pk)
        except BuyerQuoteNotFound as exc:
            raise NotFound(detail="Quote bulunamadı.") from exc
        self.check_object_permissions(request, quote)
        return Response(BuyerQuotePresenter(quote))


class QuoteBatchPreviewView(APIView):
    """POST /api/v1/quotes/batch/ — katalog kart/detay otomatik fiyat (motor = quote)."""

    permission_classes = [IsBuyerCommerceWrite]
    throttle_classes = [BuyerRateThrottle]

    def post(self, request):
        from fiyatlama.services.buyer_katalog_fiyat_servisi import (
            alici_varyant_fiyatlari_toplu,
        )

        body = request.data if isinstance(request.data, dict) else {}
        try:
            kanal_id = int(body.get("satis_kanali_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(detail={"satis_kanali_id": "Zorunlu."}) from exc
        raw_ids = body.get("varyant_ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            raise ValidationError(detail={"varyant_ids": "En az bir varyant id."})
        pb = (body.get("para_birimi") or "TRY").upper()
        results = alici_varyant_fiyatlari_toplu(
            actor=request.user,
            satis_kanali_id=kanal_id,
            varyant_ids=raw_ids,
            para_birimi=pb,
        )
        return Response({"count": len(results), "results": results})
