"""Bileşen çözümü / stok / borç (ADR-0001 v2)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError

from finans.constants import HAS_KODU, Q2, Q4, TRY_KODU, USD_KODU
from siparis.services.has_hesap import q2, q4


def list_bilesenler(varyant):
    if varyant is None:
        return []
    from urunler.models import VaryantBilesen

    return list(
        VaryantBilesen.objects.filter(ana_varyant_id=varyant.pk).select_related(
            "bilesen_varyant", "tedarikci", "varsayilan_usta"
        )
    )


def resolve_tas_agirligi(*, varyant, miktar: Decimal, birim: str) -> Decimal:
    raw = Decimal(getattr(varyant, "tas_agirligi", None) or 0)
    if birim == "ADET":
        return q4(raw * miktar)
    return q4(raw)


def bilesen_borclar(*, varyant, miktar: Decimal) -> dict:
    """Bileşenlerden tl/usd/has (çakım) ek borç."""
    tl = Decimal("0.00")
    usd = Decimal("0.00")
    has_extra = Decimal("0.0000")
    for b in list_bilesenler(varyant):
        tutar = b.satir_tutari() * miktar
        if b.fiyat_birimi == "USD":
            usd += tutar
        else:
            tl += tutar
        cak = Decimal(b.cakim_iscilik or 0)
        if cak > 0:
            if b.cakim_iscilik_birimi == HAS_KODU:
                has_extra += q4(cak * miktar)
            else:
                tl += q2(cak * miktar)
    return {
        "tl": q2(tl),
        "usd": q2(usd),
        "has_extra": q4(has_extra),
        "para_birimleri": (TRY_KODU, USD_KODU, HAS_KODU),
    }


def reserve_bilesen_stocks(*, actor, locked, line, now) -> list:
    """Her bileşeni kendi tedarikçi deposundan rezerve+tüket. Boşsa []."""
    from siparis.services.checkout_servisi import _resolve_warehouse_for_fiyat
    from stok.services.reservation_servisi import (
        olustur_rezervasyon,
        tuket_rezervasyon,
    )
    from fiyatlama.models import VaryantFiyat

    bilesenler = list_bilesenler(line.varyant)
    if not bilesenler:
        return []

    miktar_line = Decimal(line.miktar)
    created = []
    for b in bilesenler:
        vf = (
            VaryantFiyat.objects.filter(
                varyant_id=b.bilesen_varyant_id,
                tedarikci_id=b.tedarikci_id,
                durum=VaryantFiyat.Durum.AKTIF,
            )
            .order_by("-versiyon", "-pk")
            .first()
        )
        if vf is None:
            raise ValidationError(
                {
                    "stok": (
                        f"Satır #{line.pk} bileşen {b.rol}: "
                        f"aktif VaryantFiyat yok (varyant={b.bilesen_varyant_id})."
                    )
                }
            )
        warehouse = _resolve_warehouse_for_fiyat(vf)
        adet = q4(Decimal(b.adet) * miktar_line)
        try:
            res = olustur_rezervasyon(
                actor=actor,
                warehouse=warehouse,
                varyant=b.bilesen_varyant,
                fiyat_modeli=vf.fiyat_modeli,
                tedarikci_id=b.tedarikci_id,
                miktar=adet,
                alici_firma=locked.alici_firma,
                now=now,
                idempotency_key=(
                    f"order-onay:{locked.pk}:line:{line.pk}:bilesen:{b.pk}"
                ),
            )
            tuket_rezervasyon(res, actor=actor, now=now)
            created.append(res)
        except ValidationError as exc:
            msg = "; ".join(getattr(exc, "messages", None) or [str(exc)])
            raise ValidationError(
                {
                    "stok": (
                        f"Satır #{line.pk} bileşen {b.rol} "
                        f"(SKU {getattr(b.bilesen_varyant, 'sku', '')}): "
                        f"stok yetersiz — {msg}"
                    )
                }
            ) from exc
    return created
