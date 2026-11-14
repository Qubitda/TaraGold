"""F4-060/061 + API-B1 — buyer order detay/liste + platform ops liste."""

from django.db.models import Q
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from api.pagination import apply_ordering, paginate_queryset
from api.permissions import HasOrderObjectAccess, IsBuyerCommerceRead
from api.presenters.buyer import BuyerOrderPresenter
from api.throttles import BuyerRateThrottle
from siparis.models import Order
from siparis.selectors.tenant import (
    OrderNotFound,
    can_ops_read_orders,
    get_order_for_actor,
    scope_order_queryset,
)


class OrderDetailView(APIView):
    permission_classes = [HasOrderObjectAccess]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        try:
            order = get_order_for_actor(request.user, order_id=pk)
        except OrderNotFound as exc:
            raise NotFound(detail="Sipariş bulunamadı.") from exc
        self.check_object_permissions(request, order)
        return Response(BuyerOrderPresenter(order))


class OrderListView(APIView):
    """GET /api/v1/orders/ — alıcı kendi; view_all / QC / lojistik tümü. Client firma_id yok."""

    permission_classes = [IsBuyerCommerceRead]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        request.query_params.get("firma_id")  # ignore
        qs = scope_order_queryset(
            Order.objects.select_related("alici_firma"),
            request.user,
        )
        durum = (request.query_params.get("durum") or "").strip().upper()
        if durum and durum in Order.Durum.values:
            qs = qs.filter(durum=durum)
        q = (request.query_params.get("q") or "").strip()
        if q:
            cond = (
                Q(lines__varyant__sku__icontains=q)
                | Q(lines__varyant__urun__ad__icontains=q)
            )
            if can_ops_read_orders(request.user):
                cond |= Q(alici_firma__ad__icontains=q)
            if q.isdigit():
                cond |= Q(pk=int(q))
            qs = qs.filter(cond).distinct()
        qs = apply_ordering(
            qs,
            request,
            whitelist=("olusturma_tarihi", "pk", "durum"),
            default="-olusturma_tarihi",
        )
        return paginate_queryset(
            request,
            qs,
            present=lambda o: BuyerOrderPresenter(o, include_lines=False),
            extra={"ops": can_ops_read_orders(request.user)},
        )
