"""FirmaUyelik yazma + Kullanici.firma denormalize senkron (ADR-0033 / ADR-0035)."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction

from firmalar import roles
from firmalar.models import FirmaUyelik


def upsert_uyelik(
    *,
    kullanici,
    firma,
    rol: str,
    aktif: bool = True,
    birincil: bool | None = None,
    exclusive: bool = False,
) -> FirmaUyelik:
    """Üyelik yazma + (aktif & birincil ise) Kullanici.firma/rol senkronu.

    ADR-0035: Çoklu aktif üyelik desteklenir (exclusive=False varsayılan).
    """
    if rol not in roles.ALL_ROLES:
        raise ValidationError({"rol": "Geçersiz rol."})
    if firma is None or kullanici is None:
        raise ValidationError("kullanici ve firma zorunlu.")

    set_birincil = bool(aktif) if birincil is None else bool(birincil and aktif)

    with transaction.atomic():
        if exclusive and aktif:
            FirmaUyelik.objects.filter(kullanici=kullanici, aktif=True).exclude(
                firma=firma
            ).update(aktif=False, birincil=False)
        elif set_birincil:
            FirmaUyelik.objects.filter(kullanici=kullanici, birincil=True).exclude(
                firma=firma
            ).update(birincil=False)

        uyelik, _ = FirmaUyelik.objects.update_or_create(
            kullanici=kullanici,
            firma=firma,
            defaults={"rol": rol, "aktif": aktif, "birincil": set_birincil},
        )
        if set_birincil:
            kullanici.firma = firma
            kullanici.rol = rol
            kullanici.save()
        return uyelik


def switch_active_uyelik(*, kullanici, firma_id: int) -> FirmaUyelik:
    """Kullanıcının mevcut aktif firma üyelikleri arasında oturum bağlamını değiştirir."""
    with transaction.atomic():
        target = (
            FirmaUyelik.objects.select_related("firma")
            .filter(kullanici=kullanici, firma_id=firma_id, aktif=True)
            .first()
        )
        if target is None:
            raise ValidationError({"firma_id": "Bu firma için aktif üyelik yok."})
        FirmaUyelik.objects.filter(kullanici=kullanici, birincil=True).exclude(
            pk=target.pk
        ).update(birincil=False)
        if not target.birincil:
            target.birincil = True
            target.save(update_fields=["birincil"])
        kullanici.firma = target.firma
        kullanici.rol = target.rol
        kullanici.save()
        from firmalar.services.rol_servisi import sync_user_role_groups

        sync_user_role_groups(kullanici)
        return target


def has_firma_admin_uyelik(firma) -> bool:
    """AKTIF kapısı — FIRMA_ADMIN veya legacy yönetici."""
    if getattr(firma, "platform_mu", False):
        return True
    return FirmaUyelik.objects.filter(
        firma=firma,
        aktif=True,
        rol__in=roles.LEGACY_FIRMA_ADMIN_ROLLERI,
    ).exists()
