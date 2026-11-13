"""FirmaUyelik yazma + Kullanici.firma denormalize senkron (ADR-0033)."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction

from firmalar import roles
from firmalar.models import FirmaUyelik


def upsert_uyelik(*, kullanici, firma, rol: str, aktif: bool = True) -> FirmaUyelik:
    """Tek yazma: üyelik + (aktifse) Kullanici.firma/rol denormalize.

    K3: kullanıcı başına tek aktif üyelik — yeni aktif açmadan önce diğerlerini pasife alır.
    """
    if rol not in roles.ALL_ROLES:
        raise ValidationError({"rol": "Geçersiz rol."})
    if firma is None or kullanici is None:
        raise ValidationError("kullanici ve firma zorunlu.")

    with transaction.atomic():
        if aktif:
            FirmaUyelik.objects.filter(kullanici=kullanici, aktif=True).exclude(
                firma=firma
            ).update(aktif=False)

        uyelik, _ = FirmaUyelik.objects.update_or_create(
            kullanici=kullanici,
            firma=firma,
            defaults={"rol": rol, "aktif": aktif},
        )
        if aktif:
            kullanici.firma = firma
            kullanici.rol = rol
            # full_clean firma_admin kuralları için
            kullanici.save()
        return uyelik


def has_firma_admin_uyelik(firma) -> bool:
    """AKTIF kapısı — FIRMA_ADMIN veya legacy yönetici."""
    if getattr(firma, "platform_mu", False):
        return True
    return FirmaUyelik.objects.filter(
        firma=firma,
        aktif=True,
        rol__in=roles.LEGACY_FIRMA_ADMIN_ROLLERI,
    ).exists()
