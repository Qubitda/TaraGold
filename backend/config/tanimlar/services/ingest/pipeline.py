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
    q = Decimal("0.0001")
    kur_servisi.feed_doviz_kuru_kaydet(
        saglayici=kur_servisi.aktif_saglayici(),
        para_birimi=para_birimi,
        kur_alis=Decimal(str(alis)).quantize(q),
        kur_satis=Decimal(str(satis)).quantize(q),
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
    gbpusdt = tick_store.get_tick(roles.get("gbpusdt", "GBPUSDT"))
    chfusdt = tick_store.get_tick(roles.get("chfusdt", "CHFUSDT"))
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

    if gbpusdt and usdtry:
        gbp_alis = gbpusdt["bid"] * usdtry["bid"]
        gbp_satis = gbpusdt["ask"] * usdtry["ask"]
        if _should_persist("GBPTRY_DERIVED", gbp_alis, gbp_satis):
            _persist_doviz(
                para_birimi="GBP",
                alis=gbp_alis.quantize(Decimal("0.0001")),
                satis=gbp_satis.quantize(Decimal("0.0001")),
                zaman=now,
                kaynak=kaynak,
            )
            _mark_persisted("GBPTRY_DERIVED", gbp_alis, gbp_satis)
            written.append("doviz:GBP")

    if chfusdt and usdtry:
        chf_alis = chfusdt["bid"] * usdtry["bid"]
        chf_satis = chfusdt["ask"] * usdtry["ask"]
        if _should_persist("CHFTRY_DERIVED", chf_alis, chf_satis):
            _persist_doviz(
                para_birimi="CHF",
                alis=chf_alis.quantize(Decimal("0.0001")),
                satis=chf_satis.quantize(Decimal("0.0001")),
                zaman=now,
                kaynak=kaynak,
            )
            _mark_persisted("CHFTRY_DERIVED", chf_alis, chf_satis)
            written.append("doviz:CHF")

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

    # Frankfurter yedek: Binance book 0/yok (GBP/CHF) veya metal kesik
    written.extend(
        persist_frankfurter_fallback(
            already=set(written),
            now=now,
            kaynak="api",
        )
    )

    if written:
        kur_servisi.set_feed_health(health="FEED_OK", banner="")
    return written


def persist_frankfurter_fallback(
    *,
    already: set[str] | None = None,
    now=None,
    kaynak: str = "api",
    fetcher=None,
) -> list[str]:
    """Frankfurter mid → DovizKuru / MetalKuru (yalnız eksik kalemler)."""
    from tanimlar.fiyat_kaynagi import TROY_OZ_GRAM
    from tanimlar.services.providers import frankfurter as ff

    if not ff.enabled():
        return []
    already = already or set()
    now = now or timezone.now()
    cfg = getattr(settings, "PIYASA_FRANKFURTER", {}) or {}
    throttle_s = int(cfg.get("throttle_seconds") or 60)
    written: list[str] = []

    need_fx = [
        pb
        for pb in (cfg.get("fx_fallback") or ["GBP", "CHF"])
        if f"doviz:{pb}" not in already
    ]
    metal_on = bool(cfg.get("metal_fallback", True))
    if not need_fx and not metal_on:
        return []

    try:
        rates = ff.cached_bundle(fetcher=fetcher)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Frankfurter bundle alınamadı: %s", exc)
        return []
    if not rates:
        return []

    spread = Decimal(str(cfg.get("spread_bps") or "10"))
    for pb in need_fx:
        mid = rates.get(pb)
        if mid is None:
            continue
        try:
            alis, satis = ff.mid_to_bid_ask(mid, spread_bps=spread)
        except ValueError:
            continue
        sym = f"FRANKFURTER_{pb}TRY"
        if not _should_persist_seconds(sym, alis, satis, throttle_s=throttle_s):
            continue
        try:
            _persist_doviz(
                para_birimi=pb,
                alis=alis,
                satis=satis,
                zaman=now,
                kaynak=kaynak,
            )
            _mark_persisted(sym, alis, satis)
            written.append(f"doviz:{pb}")
            logger.info("Frankfurter yedek döviz yazıldı: %s mid=%s", pb, mid)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Frankfurter döviz %s yazılamadı: %s", pb, exc)

    if metal_on:
        oz = Decimal(TROY_OZ_GRAM)
        for asset, metal_setting, default_kod in (
            ("XAU", "PIYASA_METAL_KOD", "ALTIN"),
            ("XAG", "PIYASA_GUMUS_KOD", "GUMUS"),
        ):
            metal_kod = getattr(settings, metal_setting, default_kod)
            tag = f"metal:{metal_kod}"
            if tag in already or tag in written:
                continue
            mid_oz = rates.get(asset)
            if mid_oz is None or mid_oz <= 0:
                continue
            metal = KiymetliMetal.objects.filter(kod=metal_kod).first()
            if metal is None:
                continue
            try:
                alis_oz, satis_oz = ff.mid_to_bid_ask(mid_oz, spread_bps=spread)
                gram_alis = (alis_oz / oz).quantize(Decimal("0.0001"))
                gram_satis = (satis_oz / oz).quantize(Decimal("0.0001"))
            except (ValueError, ArithmeticError):
                continue
            sym = f"FRANKFURTER_{asset}TRY"
            if not _should_persist_seconds(
                sym, gram_alis, gram_satis, throttle_s=throttle_s
            ):
                continue
            try:
                _persist_metal_grams(
                    metal=metal,
                    gram_alis=gram_alis,
                    gram_satis=gram_satis,
                    zaman=now,
                    kaynak=kaynak,
                )
                _mark_persisted(sym, gram_alis, gram_satis)
                written.append(tag)
                logger.info(
                    "Frankfurter yedek metal yazıldı: %s gram≈%s", metal_kod, gram_alis
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Frankfurter metal %s yazılamadı: %s", metal_kod, exc)

    return written


def _should_persist_seconds(
    symbol: str, bid: Decimal, ask: Decimal, *, throttle_s: int
) -> bool:
    """Frankfurter için ayrı throttle (Binance 5s’ten uzun)."""
    import json

    from django.core.cache import cache
    from django.utils.dateparse import parse_datetime

    key = f"{_LAST_PERSIST_KEY}{symbol.upper()}"
    raw = cache.get(key)
    if raw and throttle_s > 0:
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            dt = parse_datetime(data.get("at") or "")
            if dt and (timezone.now() - dt).total_seconds() < throttle_s:
                return False
        except Exception:  # noqa: BLE001
            return True
    return True


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
        try:
            kur_servisi.set_feed_health(
                health="FEED_FAIL",
                banner="Canlı veri kopuk; fiyat kullanmayın.",
            )
        except Exception:  # noqa: BLE001
            logger.exception("FEED_FAIL yazılamadı")
        return result

    wanted = {sym for sym, _m in _symbol_items()}
    for sym in sorted(wanted - set(ticks)):
        result.rejected.append(f"{sym}: bookTicker yok/atlandı")

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
    if not result.ok and not result.ticks:
        try:
            kur_servisi.set_feed_health(
                health="FEED_FAIL",
                banner="Canlı veri yok; fiyat kullanmayın.",
            )
        except Exception:  # noqa: BLE001
            logger.exception("FEED_FAIL yazılamadı")
    return result


def feed_age_banner(*, now=None) -> dict[str, Any]:
    """Pano/API için bayatlık özeti.

    Yaş: paylaşımlı cache tick + DB MetalKuru/DovizKuru (effective min).
    LocMem süreçler arası görünmez; DB yedek + DatabaseCache zorunlu.
    """
    now = now or timezone.now()
    stale_s = int(getattr(settings, "PIYASA_FEED_STALE_SECONDS", 30))
    hide_s = int(getattr(settings, "PIYASA_FEED_HIDE_SECONDS", 300))
    roles = _role_map()
    ages = {}
    for role in ("ons_au", "usdtry"):
        sym = roles.get(role)
        age = tick_store.effective_feed_age_seconds(
            role, symbol=sym, now=now
        )
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


_LAZY_POLL_THROTTLE_KEY = "piyasa:lazy_rest_poll:throttle"
_LAZY_POLL_LOCK_KEY = "piyasa:lazy_rest_poll:lock"


def ensure_fresh_feed_for_read(*, force: bool = False) -> dict[str, Any]:
    """Pano okumasında bayat/kopuk feed → throttled REST poll.

    Ingest süreci düşse bile müşteri panosunda boş HAS/ONS (—) kalmasın.
    En fazla ~12 sn'de bir poll; kilit ile çakışmayı önler.
    """
    from django.core.cache import cache

    age = feed_age_banner()
    stale_s = int(getattr(settings, "PIYASA_FEED_STALE_SECONDS", 30))
    # Hide/fail veya stale eşiğinin %70'i → proaktif yenile
    age_s = age.get("age")
    needs = bool(
        force
        or age.get("hide")
        or age.get("health") in ("FEED_FAIL", "FEED_STALE_LKG")
        or age_s is None
        or (isinstance(age_s, (int, float)) and age_s >= max(8.0, stale_s * 0.7))
    )
    if not needs:
        return {"skipped": True, "reason": "fresh", **age}

    if not force and cache.get(_LAZY_POLL_THROTTLE_KEY):
        return {"skipped": True, "reason": "throttled", **age}

    if not cache.add(_LAZY_POLL_LOCK_KEY, "1", timeout=45):
        return {"skipped": True, "reason": "busy", **age}

    try:
        result = run_rest_poll_once(kaynak="api")
        cache.set(_LAZY_POLL_THROTTLE_KEY, "1", timeout=12)
        out: dict[str, Any] = {
            "skipped": False,
            "ok": result.ok,
            "ticks": len(result.ticks),
            "persisted": list(result.persisted or []),
            "rejected": len(result.rejected),
            "errors": list(result.errors[:3]),
        }
        out.update(feed_age_banner())
        if not result.ok and not result.persisted:
            logger.warning(
                "lazy_feed_poll zayıf: errors=%s rejected=%s",
                result.errors[:2],
                result.rejected[:2],
            )
        return out
    except Exception as exc:  # noqa: BLE001 — pano kırılmasın
        logger.exception("lazy_feed_poll hata")
        return {"skipped": False, "ok": False, "errors": [str(exc)], **age}
    finally:
        cache.delete(_LAZY_POLL_LOCK_KEY)
