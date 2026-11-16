"""ADR-0039 — GET /api/v1/piyasa/pano/stream/ (SSE)."""

from __future__ import annotations

import json
import time

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import StreamingHttpResponse
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from api.masking import assert_masked
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import BuyerRateThrottle
from piyasa.selectors.pano import present_buyer_pano


def _sse_pack(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class PiyasaPanoStreamView(APIView):
    """SSE: ilk snapshot + değişimde event + 15s heartbeat. Auth zorunlu."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        olcek = request.query_params.get("olcek")
        ticker_only = str(request.query_params.get("ticker") or "").lower() in {
            "1",
            "true",
            "yes",
        }

        firma = getattr(request.user, "firma", None)

        def event_stream():
            last_payload = None
            last_beat = time.monotonic()
            # İlk snapshot
            try:
                body = present_buyer_pano(
                    olcek=olcek, ticker_only=ticker_only, firma=firma
                )
                assert_masked(body, context="buyer")
            except DjangoValidationError as exc:
                yield _sse_pack(
                    "error",
                    {"detail": str(exc)},
                )
                return
            last_payload = json.dumps(body, sort_keys=True)
            yield _sse_pack("snapshot", body)

            # Polling yedek döngü (WS yok; 2s kontrol, 15s heartbeat)
            while True:
                time.sleep(2)
                try:
                    body = present_buyer_pano(
                        olcek=olcek, ticker_only=ticker_only, firma=firma
                    )
                    assert_masked(body, context="buyer")
                except DjangoValidationError as exc:
                    yield _sse_pack("error", {"detail": str(exc)})
                    break
                packed = json.dumps(body, sort_keys=True)
                if packed != last_payload:
                    last_payload = packed
                    yield _sse_pack("update", body)
                now = time.monotonic()
                if now - last_beat >= 15:
                    last_beat = now
                    yield _sse_pack(
                        "heartbeat",
                        {"server_now": body.get("server_now")},
                    )

        resp = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        resp["Cache-Control"] = "no-cache"
        resp["X-Accel-Buffering"] = "no"
        return resp
