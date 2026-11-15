"""Alıcı/portal piyasa panosu DTO (GAP-F3-01 + ADR-0039).

Marj / maliyet / saf kur gözlemi / detay kırılımı alıcıya sızdırılmaz.
Alıcı: nihai alış/satış (aliciya_alis_goster ile); ops detay ayrı endpoint.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.utils import timezone

from piyasa.models import PiyasaUrun
from piyasa.services import piyasa_fiyat_servisi
from tanimlar.fiyat_kaynagi import FeedHealth

_OLCEK_FILTRE = frozenset(
    {
        PiyasaUrun.Olcek.ONS,
        PiyasaUrun.Olcek.KG,
        PiyasaUrun.Olcek.GRAM,
    }
)

_KAYNAK_MAP = {
    FeedHealth.FEED_OK: "CANLI",
    FeedHealth.FEED_STALE_LKG: "LKG",
    FeedHealth.FEED_LOCKED_MANUEL: "MANUEL",
    FeedHealth.FEED_FAIL: "FAIL",
}

_PREV_KEY = "piyasa:prev_nihai:"


def _dec(value) -> str | None:
    if value is None:
        return None
    return str(Decimal(str(value)))


def _dt(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _kaynak(feed_health: str | None) -> str:
    if not feed_health:
        return "LKG"
    return _KAYNAK_MAP.get(str(feed_health), "LKG")


def _yon(kod: str, taraf: str, nihai) -> str:
    """▲/▼ için önceki nihai ile karşılaştır (cache)."""
    if nihai is None:
        return ""
    key = f"{_PREV_KEY}{kod}:{taraf}"
    cur = Decimal(str(nihai))
    prev_raw = cache.get(key)
    cache.set(key, str(cur), timeout=86400)
    if prev_raw is None:
        return ""
    prev = Decimal(str(prev_raw))
    if cur > prev:
        return "up"
    if cur < prev:
        return "down"
    return "flat"


def present_buyer_pano(
    *,
    olcek: str | None = None,
    now=None,
    ticker_only: bool = False,
) -> dict[str, Any]:
    """
    GET /api/v1/piyasa/pano/ gövdesi.

    Query `olcek`: ONS | KG | GRAM (opsiyonel).
    Ham/marj yok. Alış: aliciya_alis_goster + alis_goster.
    """
    now = now or timezone.now()
    olcek_norm = (olcek or "").strip().upper() or None
    if olcek_norm is not None and olcek_norm not in _OLCEK_FILTRE:
        raise ValidationError(
            {"olcek": f"Geçersiz olcek: {olcek!r} (ONS|KG|GRAM)."}
        )

    rows = piyasa_fiyat_servisi.pano_ozeti(only_aktif=True, now=now)
    satirlar: list[dict[str, Any]] = []
    healths: list[str] = []
    banners: list[str] = []

    for row in rows:
        if olcek_norm is not None and row.get("olcek") != olcek_norm:
            continue
        if not row.get("aliciya_goster", True):
            continue
        if ticker_only and not row.get("ticker_da_goster"):
            continue
        if not row.get("ok"):
            # Çok bayat / hata: satırda fiyat yok ama sağlık bilinsin
            if row.get("hata"):
                healths.append(FeedHealth.FEED_FAIL)
            continue

        fh = row.get("feed_health") or ""
        if fh:
            healths.append(str(fh))
        if row.get("banner"):
            banners.append(str(row["banner"]))

        # Hide eşiği aşımı FEED_FAIL → fiyat —
        hide = str(fh) == FeedHealth.FEED_FAIL
        show_alis = bool(row.get("alis_goster", True)) and bool(
            row.get("aliciya_alis_goster", True)
        )
        show_satis = bool(row.get("satis_goster", True))

        alis = None if hide or not show_alis else row.get("alis")
        satis = None if hide or not show_satis else row.get("satis")
        # Geriye uyum: fiyat = satış (veya alış)
        fiyat = satis if satis is not None else alis
        if fiyat is None and not hide:
            continue

        satirlar.append(
            {
                "kod": row["kod"],
                "ad": row.get("ad") or row["kod"],
                "bolum": row.get("bolum") or "",
                "fiyat": _dec(fiyat),
                "alis": _dec(alis) if show_alis else None,
                "satis": _dec(satis) if show_satis else None,
                "alis_goster": show_alis,
                "satis_goster": show_satis,
                "yon_alis": _yon(row["kod"], "alis", alis) if alis is not None else "",
                "yon_satis": _yon(row["kod"], "satis", satis) if satis is not None else "",
                "para_birimi": row.get("cikti_pb") or "TRY",
                "olcek": row.get("olcek") or PiyasaUrun.Olcek.GRAM,
                "ondalik": int(row.get("ondalik") or 2),
                "ticker_da_goster": bool(row.get("ticker_da_goster")),
                "kaynak": _kaynak(fh),
                "guncelleme": _dt(row.get("guncelleme") or now),
                "banner": (row.get("banner") or None) or None,
            }
        )

    # Sağlık özeti
    if any(h == FeedHealth.FEED_FAIL for h in healths):
        kaynak = "FAIL"
    elif any(h == FeedHealth.FEED_STALE_LKG for h in healths):
        kaynak = "LKG"
    elif healths:
        kaynak = "CANLI"
    else:
        kaynak = "LKG"

    return {
        "server_now": now.isoformat(),
        "olcek": olcek_norm,
        "kaynak": kaynak,
        "gecikmeli": kaynak == "LKG",
        "referans_ibaresi": "Referans fiyat — yatırım tavsiyesi değildir.",
        "banner": " | ".join(dict.fromkeys(banners)) or None,
        "satirlar": satirlar,
    }


def present_ops_pano_detay(*, now=None) -> dict[str, Any]:
    """Ops: ham + marj + nihai (manage_piyasa)."""
    now = now or timezone.now()
    rows = piyasa_fiyat_servisi.pano_ozeti(only_aktif=False, now=now)
    satirlar = []
    for row in rows:
        alis_d = row.get("alis_detay") or {}
        satis_d = row.get("satis_detay") or {}
        satirlar.append(
            {
                "kod": row["kod"],
                "ad": row.get("ad"),
                "bolum": row.get("bolum"),
                "aktif": True,
                "marj_tipi": row.get("marj_tipi") or row.get("marj_modu"),
                "alis_marj": _dec(row.get("alis_marj")),
                "satis_marj": _dec(row.get("satis_marj")),
                "ham_alis": _dec(alis_d.get("ham")),
                "ham_satis": _dec(satis_d.get("ham")),
                "nihai_alis": _dec(row.get("alis")),
                "nihai_satis": _dec(row.get("satis")),
                "alis_goster": row.get("alis_goster", True),
                "satis_goster": row.get("satis_goster", True),
                "aliciya_alis_goster": row.get("aliciya_alis_goster", True),
                "ticker_da_goster": row.get("ticker_da_goster", False),
                "feed_health": row.get("feed_health") or "",
                "banner": row.get("banner") or "",
                "gozlem_id": alis_d.get("gozlem_id") or satis_d.get("gozlem_id"),
                "ok": row.get("ok"),
                "hata": row.get("hata") or "",
                "guncelleme": _dt(row.get("guncelleme") or now),
            }
        )
    return {
        "server_now": now.isoformat(),
        "referans_ibaresi": "Referans fiyat — Binance public market; yerel prim marj ile.",
        "satirlar": satirlar,
    }
