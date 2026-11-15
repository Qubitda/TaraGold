"""Finans sabitleri — ADR-0001."""

from __future__ import annotations

from decimal import Decimal

# Cari / ledger birimi (ISO-3 harf regex'ine uyar; döviz çevrim listesine girmez)
HAS_KODU = "HAS"
TRY_KODU = "TRY"
USD_KODU = "USD"

Q2 = Decimal("0.01")
Q4 = Decimal("0.0001")


class OdemeTipi:
    HAS = "HAS"
    HURDA = "HURDA"
    TL = "TL"
    USD = "USD"
    CHOICES = (
        (HAS, "Has altın"),
        (HURDA, "Hurda altın"),
        (TL, "TL"),
        (USD, "USD"),
    )


class KurKaynagi:
    CANLI = "CANLI"
    MANUEL = "MANUEL"
    CHOICES = (
        (CANLI, "Canlı piyasa"),
        (MANUEL, "Manuel bağlantı"),
    )


class IscilikBirimi:
    TL = "TL"
    HAS = "HAS"
    CHOICES = (
        (TL, "TL"),
        (HAS, "Has gram"),
    )


class IscilikTipi:
    PARCA = "PARCA"
    GRAM = "GRAM"
    CHOICES = (
        (PARCA, "Parça başı"),
        (GRAM, "Gram başı"),
    )
