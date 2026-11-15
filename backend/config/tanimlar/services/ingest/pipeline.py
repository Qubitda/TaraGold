"""Binance tick → cache → throttle'lı MetalKuru/DovizKuru (ADR-0039 dilim 3)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone

from tanimlar.fiyat_kaynagi import TROY_OZ_GRAM
from tanimlar.models import KiymetliMetal, KurTipi
from tanimlar.services import kur_servisi
from tanimlar.services.ingest import anomaly, tick_store
from tanimlar.services.providers.base import BookTicker, MarketDataProvider
from tanimlar.services.providers.binance import BinanceBookTickerProvider

logger = logging.getLogger(__name__)
_OZ = Decimal(TROY_OZ_GRAM)


def _gram_try_from_ons(*, ons_bid, ons_ask, usdtry_bid, usdtry_ask) -> dict[str, Decimal]:
    bid_ons, ask_ons = Decimal(str(ons_bid)), Decimal(str(ons_ask))
    bid_fx, ask_fx = Decimal(str(usdtry_bid)), Decimal(str(usdtry_ask))
    if bid_ons <= 0 or ask_ons <= 0 or bid_fx <= 0 or ask_fx <= 0:
        raise ValueError("Ons ve USDTRY bid/ask pozitif olmalı.")
    if bid_ons > ask_ons or bid_fx > ask_fx:
        raise ValueError("Ters makas (bid > ask) reddedildi.")
    return {
        "gram_alis": bid_ons / _OZ * bid_fx,
        "gram_satis": ask_ons / _OZ * ask_fx,
    }

_LAST_PERSIST_KEY = "piyasa:last_persist:"


@dataclass
class IngestResult:
    ok: bool
    ticks: dict[str, BookTicker] = field(default_factory=dict)
    persisted: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    gram_alis: Decimal | None = None
    gram_satis: Decimal | None = None


def _symbol_items() -> list[tuple[str, str]]:
    cfg = getattr(settings, "PIYASA_BINANCE", {}) or {}
    symbols = cfg.get("symbols") or {}
    items = []
    for sym, meta in symbols.items():
        role = (meta or {}).get("role") or ""
        # Yedek ons sembolleri poll'da atlanır (asıl XAUUSDT)
        if str(role).startswith("ons_au_backup"):
            continue
        items.append((sym.upper(), (meta or {}).get("market") or "spot"))
    return items


def _role_map() -> dict[str, str]:
    cfg = getattr(settings, "PIYASA_BINANCE", {}) or {}
    out = {}
    for sym, meta in (cfg.get("symbols") or {}).items():
        out[(meta or {}).get("role") or ""] = sym.upper()
    return out


def apply_tick(
    tick: BookTicker,
    *,
    source: str = "binance",
) -> tuple[bool, str]:
    """Anomali kontrolü + cache yaz. True = kabul."""
    onceki = tick_store.get_tick(tick.symbol)
    red = anomaly.anomali_reddi(
        tick,
        onceki_bid=onceki["bid"] if onceki else None,
        onceki_ask=onceki["ask"] if onceki else None,
    )
    if red:
        return False, red
    tick_store.set_tick(
        tick.symbol,
        bid=tick.bid,
        ask=tick.ask,
        source=source,
        event_time_ms=tick.event_time_ms,
    )
    return True, ""


def _should_persist(symbol: str, bid: Decimal, ask: Decimal) -> bool:
    from django.core.cache import cache

    throttle_s = int(getattr(settings, "PIYASA_FEED_THROTTLE_SECONDS", 5))
    throttle_pct = Decimal(str(getattr(settings, "PIYASA_FEED_THROTTLE_PCT", "0.05")))
    key = f"{_LAST_PERSIST_KEY}{symbol.upper()}"
    raw = cache.get(key)
    now = timezone.now()
    if not raw:
        return True
    try:
        import json

        data = json.loads(raw) if isinstance(raw, str) else raw
        last_at = data.get("at")
        last_mid = Decimal(str(data.get("mid", "0")))
        from django.utils.dateparse import parse_datetime

        dt = parse_datetime(last_at) if last_at else None
        if dt and (now - dt).total_seconds() < throttle_s:
            mid = (bid + ask) / Decimal("2")
            if last_mid > 0:
                deg = abs(mid - last_mid) / last_mid * Decimal("100")
                if deg < throttle_pct:
                    return False
            else:
                return False
    except Exception:  # noqa: BLE001
        return True
    return True


def _mark_persisted(symbol: str, bid: Decimal, ask: Decimal) -> None:
    import json

    from django.core.cache import cache

    mid = (bid + ask) / Decimal("2")
    cache.set(
        f"{_LAST_PERSIST_KEY}{symbol.upper()}",
        json.dumps({"at": timezone.now().isoformat(), "mid": str(mid)}),
        timeout=None,
    )


def _persist_metal_grams(
    *,
    metal: KiymetliMetal,
    gram_alis: Decimal,
    gram_satis: Decimal,
    zaman,
    kaynak: str = "websocket",
) -> None:
    saglayici = kur_servisi.aktif_saglayici()
    # Ingest anında taze; max_gecikme_saniye aşımı _assert_ingest_fresh'te
    for tip, fiyat in (
        (KurTipi.ALIS, gram_alis),
        (KurTipi.SATIS, gram_satis),
    ):
        kur_servisi.feed_metal_kuru_kaydet(
            saglayici=saglayici,
            metal=metal,
            saf_birim_fiyat=fiyat,
            kur_tipi=tip,
            zaman=zaman,
            alinma_zamani=zaman,
            kaynak=kaynak,
        )


def _persist_doviz(
    *,
    para_birimi: str,
    alis: Decimal,
    satis: Decimal,
    zaman,
    kaynak: str = "api",
) -> None:
    kur_servisi.feed_doviz_kuru_kaydet(
        saglayici=kur_servisi.aktif_saglayici(),
        para_birimi=para_birimi,
        kur_alis=alis,
        kur_satis=satis,
        zaman=zaman,
        alinma_zamani=zaman,
        kaynak="api",
    )


def persist_derived(*, kaynak: str = "api") -> list[str]:
    """Cache'teki tick'lerden gram TRY + döviz yaz (throttle'lı)."""
    roles = _role_map()
    au = tick_store.get_tick(roles.get("ons_au", "XAUUSDT"))
    usdtry = tick_store.get_tick(roles.get("usdtry", "USDTTRY"))
    eurusdt = tick_store.get_tick(roles.get("eurusdt", "EURUSDT"))
    ag = tick_store.get_tick(roles.get("ons_ag", "XAGUSDT"))
    written: list[str] = []
    now = timezone.now()

    if au and usdtry:
        sym = au["symbol"]
        if _should_persist(sym, au["bid"], au["ask"]):
            grams = _gram_try_from_ons(
                ons_bid=au["bid"],
                ons_ask=au["ask"],
                usdtry_bid=usdtry["bid"],
                usdtry_ask=usdtry["ask"],
            )
            metal_kod = getattr(settings, "PIYASA_METAL_KOD", "ALTIN")
            metal = KiymetliMetal.objects.filter(kod=metal_kod).first()
            if metal is None:
                logger.error("PIYASA_METAL_KOD=%s bulunamadı", metal_kod)
            else:
                _persist_metal_grams(
                    metal=metal,
                    gram_alis=grams["gram_alis"].quantize(Decimal("0.0001")),
                    gram_satis=grams["gram_satis"].quantize(Decimal("0.0001")),
                    zaman=now,
                    kaynak=kaynak,
                )
                _mark_persisted(sym, au["bid"], au["ask"])
                written.append(f"metal:{metal_kod}")

    if usdtry and _should_persist(usdtry["symbol"], usdtry["bid"], usdtry["ask"]):
        _persist_doviz(
            para_birimi="USD",
            alis=usdtry["bid"],
            satis=usdtry["ask"],
            zaman=now,
            kaynak=kaynak,
        )
        _mark_persisted(usdtry["symbol"], usdtry["bid"], usdtry["ask"])
        written.append("doviz:USD")

    if eurusdt and usdtry:
        eur_alis = eurusdt["bid"] * usdtry["bid"]
        eur_satis = eurusdt["ask"] * usdtry["ask"]
        if _should_persist("EURTRY_DERIVED", eur_alis, eur_satis):
            _persist_doviz(
                para_birimi="EUR",
                alis=eur_alis.quantize(Decimal("0.0001")),
                satis=eur_satis.quantize(Decimal("0.0001")),
                zaman=now,
                kaynak=kaynak,
            )
            _mark_persisted("EURTRY_DERIVED", eur_alis, eur_satis)
            written.append("doviz:EUR")

    if ag and usdtry:
        gumus_kod = getattr(settings, "PIYASA_GUMUS_KOD", "GUMUS")
        metal_ag = KiymetliMetal.objects.filter(kod=gumus_kod).first()
        if metal_ag and _should_persist(ag["symbol"], ag["bid"], ag["ask"]):
            grams = _gram_try_from_ons(
                ons_bid=ag["bid"],
                ons_ask=ag["ask"],
                usdtry_bid=usdtry["bid"],
                usdtry_ask=usdtry["ask"],
            )
            _persist_metal_grams(
                metal=metal_ag,
                gram_alis=grams["gram_alis"].quantize(Decimal("0.0001")),
                gram_satis=grams["gram_satis"].quantize(Decimal("0.0001")),
                zaman=now,
                kaynak=kaynak,
            )
            _mark_persisted(ag["symbol"], ag["bid"], ag["ask"])
            written.append(f"metal:{gumus_kod}")

    if written:
        kur_servisi.set_feed_health(health="FEED_OK", banner="")
    return written


def run_rest_poll_once(
    *,
    provider: MarketDataProvider | None = None,
    kaynak: str = "api",
) -> IngestResult:
    provider = provider or BinanceBookTickerProvider()
    result = IngestResult(ok=True)
    try:
        ticks = provider.fetch_book_tickers(_symbol_items())
    except Exception as exc:  # noqa: BLE001
        result.ok = False
        result.errors.append(str(exc))
        return result

    for sym, tick in ticks.items():
        ok, reason = apply_tick(tick, source=provider.name)
        if ok:
            result.ticks[sym] = tick
        else:
            result.rejected.append(f"{sym}: {reason}")

    # Ons yedek: XAU yok/red ise PAXG
    roles = _role_map()
    if roles.get("ons_au") not in result.ticks:
        for backup_role in ("ons_au_backup", "ons_au_backup2"):
            bsym = roles.get(backup_role)
            if not bsym:
                continue
            cfg = (getattr(settings, "PIYASA_BINANCE", {}) or {}).get("symbols") or {}
            market = (cfg.get(bsym) or {}).get("market") or "spot"
            try:
                bt = provider.fetch_book_ticker(bsym, market=market)
                ok, reason = apply_tick(bt, source=provider.name)
                if ok:
                    # XAU rolü gibi kullan
                    tick_store.set_tick(
                        roles.get("ons_au", "XAUUSDT"),
                        bid=bt.bid,
                        ask=bt.ask,
                        source=f"{provider.name}:{bsym}",
                        event_time_ms=bt.event_time_ms,
                    )
                    result.ticks[bsym] = bt
                    break
                result.rejected.append(f"{bsym}: {reason}")
            except Exception as exc:  # noqa: BLE001
                result.errors.append(str(exc))

    try:
        result.persisted = persist_derived(kaynak=kaynak)
        au = tick_store.get_tick(roles.get("ons_au", "XAUUSDT"))
        fx = tick_store.get_tick(roles.get("usdtry", "USDTTRY"))
        if au and fx:
            g = _gram_try_from_ons(
                ons_bid=au["bid"],
                ons_ask=au["ask"],
                usdtry_bid=fx["bid"],
                usdtry_ask=fx["ask"],
            )
            result.gram_alis = g["gram_alis"]
            result.gram_satis = g["gram_satis"]
    except Exception as exc:  # noqa: BLE001
        result.ok = False
        result.errors.append(str(exc))
    if result.rejected and not result.ticks:
        result.ok = False
    return result


def feed_age_banner(*, now=None) -> dict[str, Any]:
    """Pano/API için bayatlık özeti."""
    now = now or timezone.now()
    stale_s = int(getattr(settings, "PIYASA_FEED_STALE_SECONDS", 30))
    hide_s = int(getattr(settings, "PIYASA_FEED_HIDE_SECONDS", 300))
    roles = _role_map()
    ages = {}
    for role in ("ons_au", "usdtry"):
        sym = roles.get(role)
        if not sym:
            continue
        age = tick_store.tick_age_seconds(sym, now=now)
        ages[role] = age
    max_age = max((a for a in ages.values() if a is not None), default=None)
    if max_age is None:
        return {"health": "FEED_FAIL", "banner": "Tick yok.", "age": None, "hide": True}
    if max_age > hide_s:
        return {
            "health": "FEED_FAIL",
            "banner": f"Kur çok bayat ({int(max_age)}s); fiyat gizlendi.",
            "age": max_age,
            "hide": True,
        }
    if max_age > stale_s:
        return {
            "health": "FEED_STALE_LKG",
            "banner": f"Kur gecikmeli ({int(max_age)}s).",
            "age": max_age,
            "hide": False,
        }
    return {"health": "FEED_OK", "banner": "", "age": max_age, "hide": False}
