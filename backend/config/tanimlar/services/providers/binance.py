"""Binance public bookTicker (REST) — anahtarsız (ADR-0039)."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Callable
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.conf import settings
from django.core.exceptions import ValidationError

from tanimlar.services.providers.base import BookTicker

Fetcher = Callable[[str], dict]


def _http_json(url: str) -> dict:
    with urlopen(url, timeout=15) as resp:  # noqa: S310 — ayardan URL
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValidationError("Binance bookTicker JSON nesne değil.")
    return data


def parse_book_ticker(payload: dict, *, symbol: str) -> BookTicker:
    bid = payload.get("bidPrice")
    ask = payload.get("askPrice")
    if bid is None or ask is None:
        raise ValidationError(f"{symbol}: bidPrice/askPrice yok.")
    t = BookTicker(
        symbol=symbol,
        bid=Decimal(str(bid)),
        ask=Decimal(str(ask)),
        event_time_ms=int(payload["time"]) if payload.get("time") else None,
    )
    t.validate()
    return t


class BinanceBookTickerProvider:
    name = "binance"

    def __init__(self, *, fetcher: Fetcher | None = None):
        self._fetch = fetcher or _http_json
        cfg = getattr(settings, "PIYASA_BINANCE", {}) or {}
        self._futures_url = cfg.get(
            "futures_rest_book",
            "https://fapi.binance.com/fapi/v1/ticker/bookTicker",
        )
        self._spot_url = cfg.get(
            "spot_rest_book",
            "https://api.binance.com/api/v3/ticker/bookTicker",
        )

    def _base(self, market: str) -> str:
        m = (market or "spot").lower()
        if m == "futures":
            return self._futures_url
        if m == "spot":
            return self._spot_url
        raise ValidationError(f"Geçersiz market: {market!r}")

    def fetch_book_ticker(self, symbol: str, *, market: str) -> BookTicker:
        sym = (symbol or "").upper()
        url = f"{self._base(market)}?{urlencode({'symbol': sym})}"
        try:
            payload = self._fetch(url)
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise ValidationError(f"Binance bookTicker alınamadı ({sym}): {exc}") from exc
        if payload.get("code") is not None and payload.get("msg"):
            raise ValidationError(f"Binance {sym}: {payload.get('msg')}")
        return parse_book_ticker(payload, symbol=sym)

    def fetch_book_tickers(
        self, items: list[tuple[str, str]]
    ) -> dict[str, BookTicker]:
        out: dict[str, BookTicker] = {}
        for symbol, market in items:
            out[symbol.upper()] = self.fetch_book_ticker(symbol, market=market)
        return out
