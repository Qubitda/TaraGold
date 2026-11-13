"""ADR-0036 — Sanal POS kapatıldı (HTTP 410 Gone); tahsilat platform tarafından elle kaydedilir."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsAuthenticatedWithFirma
from api.throttles import BuyerRateThrottle


class PaymentIntentCreateView(APIView):
    """POST /api/v1/payments/intents/ — Sanal POS kapalı (410 Gone)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def post(self, request):
        return Response(
            {
                "detail": "Sanal POS ve online ödeme intenti kapalıdır; tahsilat platform tarafından elle kaydedilir.",
                "code": "virtual_pos_disabled",
            },
            status=status.HTTP_410_GONE,
        )
