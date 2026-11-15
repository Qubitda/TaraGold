"""OrderLine → quote / VaryantFiyat çözümleyici (ADR-0001; PriceLock fallback)."""

from __future__ import annotations

from django.core.exceptions import ValidationError


def line_quote(line):
    """price_quote öncelikli; yoksa legacy price_lock.quote."""
    q = getattr(line, "price_quote", None)
    if q is not None:
        return q
    lock = getattr(line, "price_lock", None)
    if lock is not None:
        return getattr(lock, "quote", None)
    return None


def line_varyant_fiyat(line):
    """Aktif/bağlı VaryantFiyat — price_quote → lock.quote → get_aktif."""
    from fiyatlama.services.varyant_fiyat_servisi import get_aktif

    q = line_quote(line)
    if q is not None and getattr(q, "varyant_fiyat", None) is not None:
        return q.varyant_fiyat
    return get_aktif(line.varyant)


def line_tedarikci_id(line) -> int | None:
    vf = line_varyant_fiyat(line)
    if vf is not None and getattr(vf, "tedarikci_id", None):
        return int(vf.tedarikci_id)
    res = getattr(line, "stock_reservation", None)
    wh = getattr(res, "warehouse", None) if res is not None else None
    if wh is not None and getattr(wh, "sahip_firma_id", None):
        return int(wh.sahip_firma_id)
    return None


def require_line_quote(line):
    q = line_quote(line)
    if q is None:
        raise ValidationError(
            f"Satır #{getattr(line, 'pk', '?')}: price_quote yok; işlem yapılamaz."
        )
    return q
