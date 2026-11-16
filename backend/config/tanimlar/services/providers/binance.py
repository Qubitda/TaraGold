"""Binance.TR / Binance bookTicker (REST) — ADR-0039.

Market data public; isteğe bağlı ``X-MBX-APIKEY`` yalnız ayardan (.env).
Anahtar asla URL'ye, log'a veya ValidationError metnine yazılmaz.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ValidationError

from tanimlar.services.providers.base import BookTicker

Fetcher = Callable[[str, dict[str, str] | None], dict]

logger = logging.getLogger(__name__)


def _redact(text: str, secrets: list[str]) -> str:
    out = text or ""
    for s in secrets:
        if s and len(s) >= 8 and s in out:
            out = out.replace(s, "***")
    return out


def _http_json(url: str, headers: dict[str, str] | None = None) -> dict:
    req = Request(url, headers=headers or {}, method="GET")
    with urlopen(req, timeout=15) as resp:  # noqa: S310 — ayardan URL
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
            "https://api.binance.me/api/v3/ticker/bookTicker",
        )
        self._api_key = (cfg.get("api_key") or "").strip()
        self._api_secret = (cfg.get("api_secret") or "").strip()

    def _auth_headers(self) -> dict[str, str] | None:
        if not self._api_key:
            return None
        # Public bookTicker; key rate-limit / hesap kimliği. Secret SIGNED için saklanır.
        return {"X-MBX-APIKEY": self._api_key}

    def _secrets(self) -> list[str]:
        return [s for s in (self._api_key, self._api_secret) if s]

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
        headers = self._auth_headers() if market.lower() == "spot" else None
        try:
            try:
                payload = self._fetch(url, headers)
            except TypeError:
                # Test/fake fetcher tek argümanlı olabilir.
                payload = self._fetch(url)  # type: ignore[call-arg]
        except HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")[:200]
            except Exception:  # noqa: BLE001
                body = ""
            msg = _redact(f"HTTP {exc.code} {body}", self._secrets())
            logger.warning("Binance bookTicker HTTP hata (%s)", sym)
            raise ValidationError(f"Binance bookTicker alınamadı ({sym}): {msg}") from exc
        except (URLError, TimeoutError, OSError, json.JSONDecodeError, TypeError) as exc:
            msg = _redact(str(exc), self._secrets())
            logger.warning("Binance bookTicker ağ/parse hata (%s)", sym)
            raise ValidationError(f"Binance bookTicker alınamadı ({sym}): {msg}") from exc
        if payload.get("code") is not None and payload.get("msg"):
            raise ValidationError(
                f"Binance {sym}: {_redact(str(payload.get('msg')), self._secrets())}"
            )
        return parse_book_ticker(payload, symbol=sym)

    def fetch_book_tickers(
        self, items: list[tuple[str, str]]
    ) -> dict[str, BookTicker]:
        """Sembol bazında yumuşak hata: GBP 0 book tüm poll'u düşürmesin."""
        out: dict[str, BookTicker] = {}
        for symbol, market in items:
            sym = symbol.upper()
            try:
                out[sym] = self.fetch_book_ticker(symbol, market=market)
            except (ValidationError, ValueError) as exc:
                logger.warning("Binance bookTicker atlandı (%s): %s", sym, exc)
                continue
        return out
