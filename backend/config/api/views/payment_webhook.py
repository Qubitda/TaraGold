"""ADR-0036 — Sanal POS webhook kapatıldı (HTTP 410 Gone)."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView


class WebhookAnonThrottle(AnonRateThrottle):
    scope = "webhook"


class PaymentWebhookView(APIView):
    """POST /api/v1/payments/webhook/ — Sanal POS webhook kapalı (410 Gone)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [WebhookAnonThrottle]

    def post(self, request):
        return Response(
            {
                "detail": "Sanal POS ödeme webhook'u kapalıdır (ADR-0036).",
                "code": "virtual_pos_disabled",
            },
            status=status.HTTP_410_GONE,
        )
