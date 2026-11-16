"""ADR-0043 — alıcı montür+taş seçim snapshot (kör havuz: tedarikçi alıcıya sızmaz)."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.utils import timezone

SCHEMA = "adr0043.v1"


def bilesim_anahtar(*, montur_varyant_id: int, taslar: list[dict]) -> str:
    payload = {
        "m": int(montur_varyant_id),
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
    return {
        "schema": SCHEMA,
        "montur": {
            "quote_id": montur.get("quote_id"),
            "varyant_id": montur.get("varyant_id"),
            "varyant_sku": montur.get("varyant_sku") or "",
            "urun_ad": montur.get("urun_ad") or "",
        },
        "taslar": taslar,
    }


def build_bilesim_from_quotes(*, montur_quote, tas_quotes_miktar: list[tuple]) -> dict:
    """montur_quote + [(tas_quote, miktar), ...] → dahili snapshot."""
    from urunler.models import Varyant

    now = timezone.now()
    from urunler.services.uyumluluk_servisi import (
        montur_imalata_acik,
        tas_monture_uygun,
    )

    mv = montur_quote.varyant
    if getattr(mv, "tip", None) != Varyant.Tip.MONTUR:
        raise ValidationError("montur_quote MONTUR tipinde olmalı.")
    # ADR-0044 sıkı: uyumluluk alanları boşsa imalata alınmaz
    if not montur_imalata_acik(mv):
        raise ValidationError(
            "Montür uyumluluk alanları eksik; imalata alınamaz "
            "(yuva, izinli kesimler, karat min/max)."
        )
    vf_m = montur_quote.varyant_fiyat
    if vf_m is None:
        raise ValidationError("Montür quote fiyat kaynağı yok.")
    if now >= montur_quote.gecerlilik_sonu:
        raise ValidationError("Montür quote süresi dolmuş.")

    taslar: list[dict[str, Any]] = []
    if not tas_quotes_miktar:
        raise ValidationError("En az bir taş seçilmeli.")
    toplam_adet = 0
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
        if not tas_monture_uygun(montur=mv, tas=tv, adet=adet):
            raise ValidationError(
                "Seçilen taş bu montüre uyumlu değil (kesim/karat/yuva)."
            )
        vf_t = tq.varyant_fiyat
        if vf_t is None:
            raise ValidationError("Taş quote fiyat kaynağı yok.")
        if now >= tq.gecerlilik_sonu:
            raise ValidationError("Taş quote süresi dolmuş.")
        if tq.alici_firma_id != montur_quote.alici_firma_id:
            raise ValidationError("Montür ve taş quote aynı alıcıya ait olmalı.")
        urun = getattr(tv, "urun", None)
        toplam_adet += adet
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

    murun = getattr(mv, "urun", None)
    return {
        "schema": SCHEMA,
        "montur": {
            "quote_id": montur_quote.pk,
            "varyant_id": mv.pk,
            "varyant_sku": getattr(mv, "sku", "") or "",
            "urun_ad": getattr(murun, "ad", "") or "",
            "tedarikci_id": vf_m.tedarikci_id,
        },
        "taslar": taslar,
    }


def composition_emir_specs(bilesim: dict | None) -> list[tuple[int, str]]:
    """[(tedarikci_id, tip), ...] — uniq emir anahtarları."""
    if not bilesim or bilesim.get("schema") != SCHEMA:
        return []
    out: list[tuple[int, str]] = []
    montur = bilesim.get("montur") or {}
    mid = montur.get("tedarikci_id")
    if mid:
        out.append((int(mid), "MONTUR"))
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
                "varyant_id": int(montur["varyant_id"]),
                "tedarikci_id": int(montur["tedarikci_id"]),
                "quote_id": montur.get("quote_id"),
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
