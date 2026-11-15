"""Son tick — Django cache (Redis yoksa LocMem/DB cache; ADR-0039)."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

_PREFIX = "piyasa:tick:"


def _key(symbol: str) -> str:
    return f"{_PREFIX}{symbol.upper()}"


def set_tick(
    symbol: str,
    *,
    bid: Decimal,
    ask: Decimal,
    source: str = "binance",
    event_time_ms: int | None = None,
) -> dict[str, Any]:
    now = timezone.now()
    payload = {
        "symbol": symbol.upper(),
        "bid": str(bid),
        "ask": str(ask),
        "source": source,
        "event_time_ms": event_time_ms,
        "received_at": now.isoformat(),
    }
    cache.set(_key(symbol), json.dumps(payload), timeout=None)
    return payload


def get_tick(symbol: str) -> dict[str, Any] | None:
    raw = cache.get(_key(symbol))
    if not raw:
        return None
    if isinstance(raw, dict):
        data = raw
    else:
        data = json.loads(raw)
    data["bid"] = Decimal(str(data["bid"]))
    data["ask"] = Decimal(str(data["ask"]))
    if data.get("received_at"):
        data["received_at_dt"] = parse_datetime(data["received_at"])
    return data


def tick_age_seconds(symbol: str, *, now=None) -> float | None:
    tick = get_tick(symbol)
    if not tick or not tick.get("received_at_dt"):
        return None
    now = now or timezone.now()
    return (now - tick["received_at_dt"]).total_seconds()
