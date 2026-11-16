"""ADR-0043 — alıcı montür+taş seçim snapshot (kör havuz: tedarikçi alıcıya sızmaz).

ADR-0044 A: montür ayağı = FULL veya HEAD[+BAND]; BAND tek başına yuva taşımaz.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.utils import timezone

SCHEMA = "adr0043.v1"


def _parca_rolu(varyant) -> str:
    rol = (getattr(varyant, "parca_rolu", None) or "").strip().upper()
    if rol in ("FULL", "HEAD", "BAND"):
        return rol
    return "FULL"


def bilesim_anahtar(
    *,
    montur_varyant_id: int,
    taslar: list[dict],
    band_varyant_id: int | None = None,
) -> str:
    payload = {
        "m": int(montur_varyant_id),
        "b": int(band_varyant_id) if band_varyant_id else None,
        "t": sorted(
            (int(t["varyant_id"]), str(t.get("miktar", "1"))) for t in taslar
        ),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def buyer_bilesim_view(bilesim: dict | None) -> dict | None:
    """Alıcı API — tedarikçi yok."""
    if not bilesim or bilesim.get("schema") != SCHEMA:
        return None
    montur = bilesim.get("montur") or {}
    band = bilesim.get("band")
    taslar = []
    for t in bilesim.get("taslar") or []:
        taslar.append(
            {
                "quote_id": t.get("quote_id"),
                "varyant_id": t.get("varyant_id"),
                "varyant_sku": t.get("varyant_sku") or "",
                "urun_ad": t.get("urun_ad") or "",
                "miktar": str(t.get("miktar") or "1"),
                "birim": t.get("birim") or "ADET",
            }
        )
    out: dict[str, Any] = {
        "schema": SCHEMA,
        "montur": {
            "quote_id": montur.get("quote_id"),
            "varyant_id": montur.get("varyant_id"),
            "varyant_sku": montur.get("varyant_sku") or "",
            "urun_ad": montur.get("urun_ad") or "",
            "parca_rolu": montur.get("parca_rolu") or "FULL",
        },
        "taslar": taslar,
    }
    if band:
        out["band"] = {
            "quote_id": band.get("quote_id"),
            "varyant_id": band.get("varyant_id"),
            "varyant_sku": band.get("varyant_sku") or "",
            "urun_ad": band.get("urun_ad") or "",
            "parca_rolu": "BAND",
        }
    return out


def _assert_quote_fresh(quote, *, peer_alici_id: int | None = None) -> None:
    now = timezone.now()
    if quote.varyant_fiyat is None:
        raise ValidationError("Quote fiyat kaynağı yok.")
    if now >= quote.gecerlilik_sonu:
        raise ValidationError("Quote süresi dolmuş.")
    if peer_alici_id is not None and quote.alici_firma_id != peer_alici_id:
        raise ValidationError("Quote’lar aynı alıcıya ait olmalı.")


def build_bilesim_from_quotes(
    *,
    montur_quote,
    tas_quotes_miktar: list[tuple],
    band_quote=None,
) -> dict:
    """montur_quote (+ opsiyonel band_quote) + [(tas_quote, miktar), ...] → snapshot.

    montur = FULL veya HEAD (imalata açık). band = yalnız BAND; HEAD ile birlikte.
    """
    from urunler.models import Varyant
    from urunler.services.uyumluluk_servisi import (
        montur_imalata_acik,
        tas_monture_uygun,
    )

    mv = montur_quote.varyant
    if getattr(mv, "tip", None) != Varyant.Tip.MONTUR:
        raise ValidationError("montur_quote MONTUR tipinde olmalı.")
    if not montur_imalata_acik(mv):
        raise ValidationError(
            "Montür uyumluluk alanları eksik veya BAND; imalata alınamaz "
            "(FULL/HEAD + yuva, izinli kesimler, karat min/max)."
        )
    rol_m = _parca_rolu(mv)
    _assert_quote_fresh(montur_quote)
    vf_m = montur_quote.varyant_fiyat

    band_snap: dict[str, Any] | None = None
    if band_quote is not None:
        if rol_m == "FULL":
            raise ValidationError(
                "Tam montür (FULL) ile ayrı gövde (BAND) birlikte seçilemez."
            )
        if rol_m != "HEAD":
            raise ValidationError("BAND yalnızca HEAD montür ile eşleştirilir.")
        bv = band_quote.varyant
        if getattr(bv, "tip", None) != Varyant.Tip.MONTUR:
            raise ValidationError("band_quote MONTUR tipinde olmalı.")
        if _parca_rolu(bv) != "BAND":
            raise ValidationError("band_quote parça rolü BAND olmalı.")
        _assert_quote_fresh(
            band_quote, peer_alici_id=montur_quote.alici_firma_id
        )
        vf_b = band_quote.varyant_fiyat
        burun = getattr(bv, "urun", None)
        band_snap = {
            "quote_id": band_quote.pk,
            "varyant_id": bv.pk,
            "varyant_sku": getattr(bv, "sku", "") or "",
            "urun_ad": getattr(burun, "ad", "") or "",
            "tedarikci_id": vf_b.tedarikci_id,
            "parca_rolu": "BAND",
        }

    taslar: list[dict[str, Any]] = []
    if not tas_quotes_miktar:
        raise ValidationError("En az bir taş seçilmeli.")
    toplam_adet = 0
    toplam_karat = Decimal("0")
    for tq, miktar in tas_quotes_miktar:
        miktar = Decimal(miktar)
        if miktar <= 0:
            raise ValidationError("Taş miktarı pozitif olmalı.")
        if miktar != miktar.to_integral_value():
            raise ValidationError("Taş miktarı tam sayı olmalı.")
        adet = int(miktar)
        tv = tq.varyant
        if getattr(tv, "tip", None) != Varyant.Tip.TAS:
            raise ValidationError("Taş quote TAS tipinde olmalı.")
        if not tas_monture_uygun(
            montur=mv, tas=tv, adet=adet, check_karat_range=False
        ):
            raise ValidationError(
                "Seçilen taş bu montüre uyumlu değil (kesim/karat/yuva)."
            )
        _assert_quote_fresh(tq, peer_alici_id=montur_quote.alici_firma_id)
        vf_t = tq.varyant_fiyat
        urun = getattr(tv, "urun", None)
        toplam_adet += adet
        try:
            toplam_karat += Decimal(str(tv.karat)) * Decimal(adet)
        except Exception as exc:  # noqa: BLE001
            raise ValidationError("Taş karat değeri geçersiz.") from exc
        taslar.append(
            {
                "quote_id": tq.pk,
                "varyant_id": tv.pk,
                "varyant_sku": getattr(tv, "sku", "") or "",
                "urun_ad": getattr(urun, "ad", "") or "",
                "tedarikci_id": vf_t.tedarikci_id,
                "miktar": str(miktar),
                "birim": "ADET",
            }
        )
    yuva = int(getattr(mv, "yuva_adedi", 0) or 0)
    if toplam_adet > yuva:
        raise ValidationError(
            f"Toplam taş adedi ({toplam_adet}) yuva adedini ({yuva}) aşamaz."
        )
    try:
        kmin = Decimal(str(mv.karat_min))
        kmax = Decimal(str(mv.karat_max))
    except Exception as exc:  # noqa: BLE001
        raise ValidationError("Montür karat aralığı geçersiz.") from exc
    if toplam_karat < kmin or toplam_karat > kmax:
        raise ValidationError(
            f"Toplam karat ({toplam_karat}) montür aralığı dışında "
            f"({kmin}–{kmax})."
        )

    murun = getattr(mv, "urun", None)
    out: dict[str, Any] = {
        "schema": SCHEMA,
        "montur": {
            "quote_id": montur_quote.pk,
            "varyant_id": mv.pk,
            "varyant_sku": getattr(mv, "sku", "") or "",
            "urun_ad": getattr(murun, "ad", "") or "",
            "tedarikci_id": vf_m.tedarikci_id,
            "parca_rolu": rol_m,
        },
        "taslar": taslar,
    }
    if band_snap is not None:
        out["band"] = band_snap
    return out


def composition_emir_specs(bilesim: dict | None) -> list[tuple[int, str]]:
    """[(tedarikci_id, tip), ...] — uniq emir anahtarları."""
    if not bilesim or bilesim.get("schema") != SCHEMA:
        return []
    out: list[tuple[int, str]] = []
    montur = bilesim.get("montur") or {}
    mid = montur.get("tedarikci_id")
    if mid:
        out.append((int(mid), "MONTUR"))
    band = bilesim.get("band") or {}
    bid = band.get("tedarikci_id")
    if bid and (int(bid), "MONTUR") not in out:
        # Aynı tedarikçiye tek MONTUR emri; farklıysa ikinci MONTUR ayağı
        out.append((int(bid), "MONTUR"))
    seen_tas: set[int] = set()
    for t in bilesim.get("taslar") or []:
        tid = t.get("tedarikci_id")
        if not tid or int(tid) in seen_tas:
            continue
        seen_tas.add(int(tid))
        out.append((int(tid), "TAS"))
    return out


def composition_stock_parts(bilesim: dict | None) -> list[dict]:
    """Rezervasyon parçaları: varyant_id, tedarikci_id, miktar, rol, quote_id."""
    if not bilesim or bilesim.get("schema") != SCHEMA:
        return []
    parts = []
    montur = bilesim.get("montur") or {}
    if montur.get("varyant_id") and montur.get("tedarikci_id"):
        parts.append(
            {
                "rol": "MONTUR",
                "parca_rolu": montur.get("parca_rolu") or "FULL",
                "varyant_id": int(montur["varyant_id"]),
                "tedarikci_id": int(montur["tedarikci_id"]),
                "quote_id": montur.get("quote_id"),
                "miktar": Decimal("1"),
            }
        )
    band = bilesim.get("band") or {}
    if band.get("varyant_id") and band.get("tedarikci_id"):
        parts.append(
            {
                "rol": "MONTUR",
                "parca_rolu": "BAND",
                "varyant_id": int(band["varyant_id"]),
                "tedarikci_id": int(band["tedarikci_id"]),
                "quote_id": band.get("quote_id"),
                "miktar": Decimal("1"),
            }
        )
    for t in bilesim.get("taslar") or []:
        parts.append(
            {
                "rol": "TAS",
                "varyant_id": int(t["varyant_id"]),
                "tedarikci_id": int(t["tedarikci_id"]),
                "quote_id": t.get("quote_id"),
                "miktar": Decimal(str(t.get("miktar") or "1")),
            }
        )
    return parts
