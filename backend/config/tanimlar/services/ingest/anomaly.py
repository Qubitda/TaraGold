"""Tek tick anomali / makas koruması (ADR-0039)."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings

from tanimlar.services.providers.base import BookTicker

logger = logging.getLogger(__name__)


def anomali_reddi(
    tick: BookTicker,
    *,
    onceki_bid: Decimal | None,
    onceki_ask: Decimal | None,
    max_pct: Decimal | None = None,
) -> str | None:
    """Red nedeni veya None. Bid>ask / ≤0 BookTicker.validate'da."""
    try:
        tick.validate()
    except ValueError as exc:
        return str(exc)

    pct = max_pct if max_pct is not None else Decimal(
        str(getattr(settings, "PIYASA_ANOMALY_PCT", Decimal("2")))
    )
    if pct <= 0:
        return None

    for label, yeni, eski in (
        ("bid", tick.bid, onceki_bid),
        ("ask", tick.ask, onceki_ask),
    ):
        if eski is None or eski <= 0:
            continue
        degisim = abs(yeni - eski) / eski * Decimal("100")
        if degisim > pct:
            msg = (
                f"{tick.symbol} {label} anomali: %{degisim:.4f} > %{pct} "
                f"(eski={eski}, yeni={yeni})"
            )
            logger.warning(msg)
            return msg
    return None
