"""Soyut market-data arayüzü — Binance'e sert kilit yok (ADR-0039)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True, slots=True)
class BookTicker:
    symbol: str
    bid: Decimal
    ask: Decimal
    event_time_ms: int | None = None

    def validate(self) -> None:
        if self.bid <= 0 or self.ask <= 0:
            raise ValueError(f"{self.symbol}: bid/ask ≤ 0")
        if self.bid > self.ask:
            raise ValueError(f"{self.symbol}: bid > ask (ters makas)")


class MarketDataProvider(Protocol):
    """REST bookTicker; WS ayrı worker döngüsünde."""

    name: str

    def fetch_book_ticker(self, symbol: str, *, market: str) -> BookTicker: ...

    def fetch_book_tickers(
        self, items: list[tuple[str, str]]
    ) -> dict[str, BookTicker]: ...
