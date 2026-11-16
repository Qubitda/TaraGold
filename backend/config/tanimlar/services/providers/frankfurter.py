"""Frankfurter referans kur API (ADR-0042 yedek) — FX + XAU/XAG.

Binance book yok/0 iken veya metal poll kesikken kullanılır.
Mid-market; makas settings `spread_bps` ile türetilir. Anahtar gerekmez.
"""

from __future__ import annotations

import json
import logging
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

Fetcher = Callable[[str], Any]

_Q4 = Decimal("0.0001")
_CACHE_KEY = "piyasa:frankfurter:bundle:v1"


def _cfg() -> dict:
    return getattr(settings, "PIYASA_FRANKFURTER", None) or {}


def enabled() -> bool:
    return bool(_cfg().get("enabled", True))


def _http_json(url: str) -> Any:
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "TaraGold/1.0"})
    with urlopen(req, timeout=15) as resp:  # noqa: S310 — settings tabanlı URL
        return json.loads(resp.read().decode("utf-8"))


def _base_url() -> str:
    return str(_cfg().get("base_url") or "https://api.frankfurter.dev").rstrip("/")


def fetch_rates(
    *,
    bases: list[str],
    quote: str = "TRY",
    fetcher: Fetcher | None = None,
) -> dict[str, Decimal]:
    """Her base için 1 base → quote TRY (veya verilen quote) mid rate.

    Frankfurter v2: GET /v2/rates?base=GBP&quotes=TRY → [{rate: …}]
    """
    fetch = fetcher or _http_json
    out: dict[str, Decimal] = {}
    q = (quote or "TRY").upper()
    for base in bases:
        b = (base or "").upper()
        if not b or b == q:
            continue
        url = f"{_base_url()}/v2/rates?{urlencode({'base': b, 'quotes': q})}"
        payload = fetch(url)
        rate = _parse_rate(payload, base=b, quote=q)
        if rate is not None and rate > 0:
            out[b] = rate
    return out


def _parse_rate(payload: Any, *, base: str, quote: str) -> Decimal | None:
    rows = payload if isinstance(payload, list) else [payload] if isinstance(payload, dict) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        rb = str(row.get("base") or "").upper()
        rq = str(row.get("quote") or "").upper()
        if rb and rb != base.upper():
            continue
        if rq and rq != quote.upper():
            continue
        raw = row.get("rate")
        if raw is None and isinstance(row.get("rates"), dict):
            raw = row["rates"].get(quote) or row["rates"].get(quote.upper())
        if raw is None:
            continue
        try:
            return Decimal(str(raw))
        except Exception:  # noqa: BLE001
            continue
    return None


def mid_to_bid_ask(mid: Decimal, *, spread_bps: Decimal | None = None) -> tuple[Decimal, Decimal]:
    """Mid → (alis/bid, satis/ask). spread_bps=10 → ±0.05% (toplam 0.1%)."""
    mid = Decimal(str(mid))
    if mid <= 0:
        raise ValueError("mid pozitif olmalı")
    bps = spread_bps
    if bps is None:
        bps = Decimal(str(_cfg().get("spread_bps") or "10"))
    half = (bps / Decimal("10000")) / Decimal("2")
    alis = (mid * (Decimal("1") - half)).quantize(_Q4, rounding=ROUND_HALF_UP)
    satis = (mid * (Decimal("1") + half)).quantize(_Q4, rounding=ROUND_HALF_UP)
    if alis <= 0 or satis < alis:
        raise ValueError("geçersiz makas")
    return alis, satis


def cached_bundle(
    *,
    fetcher: Fetcher | None = None,
    force: bool = False,
) -> dict[str, Decimal]:
    """GBP/CHF/EUR/USD + XAU/XAG → TRY mid; cache TTL settings."""
    if not enabled() and not force:
        return {}
    ttl = int(_cfg().get("cache_seconds") or 900)
    if not force:
        hit = cache.get(_CACHE_KEY)
        if isinstance(hit, dict) and hit:
            return {k: Decimal(str(v)) for k, v in hit.items()}
    bases = list(
        _cfg().get("bases")
        or ["USD", "EUR", "GBP", "CHF", "XAU", "XAG"]
    )
    rates = fetch_rates(bases=bases, quote="TRY", fetcher=fetcher)
    if rates:
        cache.set(_CACHE_KEY, {k: str(v) for k, v in rates.items()}, ttl)
    return rates
