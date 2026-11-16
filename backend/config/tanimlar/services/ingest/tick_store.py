"""Son tick — Django cache (paylaşımlı DatabaseCache) + DB yaş yedeği.

Ingest süreci tick'i cache'e yazar; web süreci aynı DatabaseCache'i okur.
Cache miss / süreç kopukluğu için feed yaşı MetalKuru/DovizKuru gözleminden
hesaplanır (kalıcı kaynak). LocMem yalnız testlerde (settings).
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from django.conf import settings
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


def db_feed_age_seconds(role: str, *, now=None) -> float | None:
    """Role → son kalıcı gözlem yaşı (ons_au: MetalKuru, usdtry: DovizKuru USD)."""
    now = now or timezone.now()
    role = (role or "").strip().lower()
    try:
        if role == "ons_au":
            from tanimlar.models import KiymetliMetal, MetalKuru

            kod = (getattr(settings, "PIYASA_METAL_KOD", None) or "ALTIN").strip()
            metal = KiymetliMetal.objects.filter(kod=kod).only("id").first()
            if metal is None:
                return None
            latest = (
                MetalKuru.objects.filter(metal_id=metal.pk)
                .order_by("-alinma_zamani")
                .only("alinma_zamani")
                .first()
            )
            if latest is None or latest.alinma_zamani is None:
                return None
            return (now - latest.alinma_zamani).total_seconds()
        if role == "usdtry":
            from tanimlar.models import DovizKuru

            latest = (
                DovizKuru.objects.filter(para_birimi="USD")
                .order_by("-alinma_zamani")
                .only("alinma_zamani")
                .first()
            )
            if latest is None or latest.alinma_zamani is None:
                return None
            return (now - latest.alinma_zamani).total_seconds()
    except Exception:  # noqa: BLE001 — yaş yedeği; feed banner yine de dönsün
        return None
    return None


def effective_feed_age_seconds(
    role: str,
    *,
    symbol: str | None = None,
    now=None,
) -> float | None:
    """Cache yaşı + DB yaşı; ikisi de varsa daha taze (küçük) olan."""
    now = now or timezone.now()
    ages: list[float] = []
    if symbol:
        cache_age = tick_age_seconds(symbol, now=now)
        if cache_age is not None:
            ages.append(cache_age)
    db_age = db_feed_age_seconds(role, now=now)
    if db_age is not None:
        ages.append(db_age)
    if not ages:
        return None
    return min(ages)
