"""Altın HAS (gram TRY) dönem özeti — XAU kline % + canlı MetalKuru.

Pano kutuları: Bugün / Bu hafta / Bu ay / Bu yıl — HAS gram.
Yön/% Binance XAUUSDT 1d kline (bugün=gün açılışı, hafta=7g kapanış,
ay/yıl=takvim); fiyat canlı HAS saf gram TRY.
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
from django.utils import timezone

logger = logging.getLogger(__name__)

Fetcher = Callable[[str], Any]
_Q = Decimal("0.01")
_CACHE_KEY = "piyasa:has_ozet:v2"


def _http_json_any(url: str) -> Any:
    req = Request(url, headers={"Accept": "application/json"}, method="GET")
    with urlopen(req, timeout=12) as resp:  # noqa: S310 — ayardan host
        return json.loads(resp.read().decode("utf-8"))


def _klines_url(*, symbol: str = "XAUUSDT", interval: str = "1d", limit: int = 400) -> str:
    cfg = getattr(settings, "PIYASA_BINANCE", {}) or {}
    book = str(cfg.get("futures_rest_book") or "https://fapi.binance.com/fapi/v1/ticker/bookTicker")
    # .../ticker/bookTicker → .../klines
    if "/ticker/bookTicker" in book:
        base = book.split("/ticker/bookTicker")[0]
    else:
        base = "https://fapi.binance.com/fapi/v1"
    q = urlencode({"symbol": symbol.upper(), "interval": interval, "limit": int(limit)})
    return f"{base}/klines?{q}"


def _pct(now: Decimal, then: Decimal) -> Decimal | None:
    if then <= 0:
        return None
    return ((now - then) / then * Decimal("100")).quantize(_Q, rounding=ROUND_HALF_UP)


def _yon(pct: Decimal | None) -> str:
    if pct is None:
        return ""
    if pct > 0:
        return "up"
    if pct < 0:
        return "down"
    return "flat"


def _period(
    *,
    etiket: str,
    fiyat: Decimal,
    referans: Decimal | None,
    pct: Decimal | None,
) -> dict[str, Any]:
    return {
        "etiket": etiket,
        "fiyat": str(fiyat.quantize(_Q, rounding=ROUND_HALF_UP)),
        "referans": str(referans.quantize(_Q, rounding=ROUND_HALF_UP)) if referans else None,
        "degisim_yuzde": str(pct) if pct is not None else None,
        "yon": _yon(pct),
    }


def _close_at_or_before(
    points: list[tuple[Any, Decimal]], *, target_date
) -> Decimal | None:
    """target_date günü veya öncesi son kapanış."""
    from datetime import date as date_cls

    if not isinstance(target_date, date_cls):
        return None
    chosen: Decimal | None = None
    for d, close in points:
        if d <= target_date:
            chosen = close
        else:
            break
    return chosen


def compute_ons_ozet_from_klines(rows: list, *, now=None) -> dict[str, Any] | None:
    """Binance kline satırlarından bugün / bu hafta / bu ay / bu yıl (takvim)."""
    from datetime import date, datetime, timedelta, timezone as dt_tz

    if not rows or not isinstance(rows, list):
        return None
    now = now or timezone.now()
    if timezone.is_naive(now):
        now = timezone.make_aware(now, timezone.get_current_timezone())
    today = now.date()

    points: list[tuple[date, Decimal, Decimal]] = []  # date, open, close
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 5:
            continue
        try:
            ts_ms = int(row[0])
            d = datetime.fromtimestamp(ts_ms / 1000, tz=dt_tz.utc).date()
            o = Decimal(str(row[1]))
            c = Decimal(str(row[4]))
            points.append((d, o, c))
        except Exception:  # noqa: BLE001
            continue
    if len(points) < 2:
        return None

    last_d, day_open, last = points[-1]
    bugun = _pct(last, day_open)

    # Bu hafta: yuvarlak 7g kapanış (pazartesi takvim açılışı = bugün açılışı olurdu)
    hafta_ref = _close_at_or_before(
        [(d, c) for d, _o, c in points],
        target_date=today - timedelta(days=7),
    )

    month_start = today.replace(day=1)
    ay_ref = None
    for d, o, _c in points:
        if d >= month_start:
            ay_ref = o
            break
    if ay_ref is None:
        ay_ref = _close_at_or_before(
            [(d, c) for d, _o, c in points], target_date=month_start
        )

    year_start = today.replace(month=1, day=1)
    yil_ref = None
    for d, o, _c in points:
        if d >= year_start:
            yil_ref = o
            break
    if yil_ref is None:
        yil_ref = _close_at_or_before(
            [(d, c) for d, _o, c in points], target_date=year_start
        )

    return {
        "sembol": "XAUUSDT",
        "pb": "USD",
        "birim": "OZ",
        "son": str(last.quantize(_Q, rounding=ROUND_HALF_UP)),
        "ok": True,
        "kaynak": "binance_futures_klines",
        "donemler": [
            _period(etiket="Bugün", fiyat=last, referans=day_open, pct=bugun),
            _period(
                etiket="Bu hafta",
                fiyat=last,
                referans=hafta_ref,
                pct=_pct(last, hafta_ref) if hafta_ref else None,
            ),
            _period(
                etiket="Bu ay",
                fiyat=last,
                referans=ay_ref,
                pct=_pct(last, ay_ref) if ay_ref else None,
            ),
            _period(
                etiket="Bu yıl",
                fiyat=last,
                referans=yil_ref,
                pct=_pct(last, yil_ref) if yil_ref else None,
            ),
        ],
    }


def _live_has_gram() -> Decimal | None:
    """Canlı HAS saf gram TRY (MetalKuru SATIS tercih)."""
    from tanimlar.models import KiymetliMetal, KurTipi, MetalKuru

    kod = getattr(settings, "PIYASA_METAL_KOD", "ALTIN")
    metal = KiymetliMetal.objects.filter(kod=kod).first()
    if metal is None:
        return None
    row = (
        MetalKuru.objects.filter(metal=metal, kur_tipi=KurTipi.SATIS)
        .order_by("-alinma_zamani", "-pk")
        .first()
    )
    if row is None:
        row = (
            MetalKuru.objects.filter(metal=metal)
            .order_by("-alinma_zamani", "-pk")
            .first()
        )
    if row is None or row.saf_birim_fiyat is None or row.saf_birim_fiyat <= 0:
        return None
    return Decimal(str(row.saf_birim_fiyat))


def _rebase_periods_to_has(ozet: dict[str, Any], has_gram: Decimal) -> dict[str, Any]:
    """XAU % aynı kalır; fiyat/referans HAS gram TRY olur."""
    has_gram = Decimal(str(has_gram))
    donemler = []
    for d in ozet.get("donemler") or []:
        pct_raw = d.get("degisim_yuzde")
        try:
            pct = Decimal(str(pct_raw)) if pct_raw not in (None, "") else None
        except Exception:  # noqa: BLE001
            pct = None
        ref = None
        if pct is not None:
            denom = Decimal("1") + (pct / Decimal("100"))
            if denom > 0:
                ref = (has_gram / denom).quantize(_Q, rounding=ROUND_HALF_UP)
        donemler.append(
            _period(
                etiket=str(d.get("etiket") or ""),
                fiyat=has_gram,
                referans=ref,
                pct=pct,
            )
        )
    return {
        **ozet,
        "sembol": "HAS",
        "pb": "TRY",
        "birim": "GR",
        "son": str(has_gram.quantize(_Q, rounding=ROUND_HALF_UP)),
        "kaynak": "binance_xau_pct+metal_kuru",
        "donemler": donemler,
    }


def get_ons_ozet(*, fetcher: Fetcher | None = None, force: bool = False) -> dict[str, Any]:
    """Cache'li HAS dönem özeti; hata → ok=false (pano kırılmaz)."""
    ttl = int(getattr(settings, "PIYASA_ONS_OZET_CACHE_SECONDS", 300))
    if not force:
        hit = cache.get(_CACHE_KEY)
        if isinstance(hit, dict):
            return hit
    empty = {
        "sembol": "HAS",
        "pb": "TRY",
        "birim": "GR",
        "son": None,
        "ok": False,
        "kaynak": "",
        "donemler": [],
        "hata": "",
        "guncelleme": timezone.now().isoformat(),
    }
    try:
        fetch = fetcher or _http_json_any
        url = _klines_url(limit=400)
        payload = fetch(url)
        ozet = compute_ons_ozet_from_klines(payload if isinstance(payload, list) else [])
        if not ozet:
            empty["hata"] = "Kline yetersiz"
            cache.set(_CACHE_KEY, empty, min(ttl, 60))
            return empty
        has = _live_has_gram()
        if has is None:
            empty["hata"] = "HAS kuru yok"
            cache.set(_CACHE_KEY, empty, min(ttl, 60))
            return empty
        ozet = _rebase_periods_to_has(ozet, has)
        ozet["guncelleme"] = timezone.now().isoformat()
        ozet["hata"] = ""
        cache.set(_CACHE_KEY, ozet, ttl)
        return ozet
    except Exception as exc:  # noqa: BLE001
        logger.warning("HAS özet alınamadı: %s", exc)
        empty["hata"] = "HAS özet alınamadı"
        cache.set(_CACHE_KEY, empty, min(ttl, 60))
        return empty
