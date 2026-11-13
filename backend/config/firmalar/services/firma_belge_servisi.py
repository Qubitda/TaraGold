"""FirmaBelge metadata yazma (normatif §3)."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from firmalar.models import FirmaBelge
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm


def _assert_write(actor, firma) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if can_view_all_tenants(actor):
        return
    if getattr(actor, "firma_id", None) != firma.pk:
        raise PermissionDenied("Yalnız kendi firma belgesi.")
    if not has_perm(actor, P["manage_users"]):
        raise PermissionDenied("Belge yazma yetkisi yok.")


def ekle(
    *,
    actor,
    firma,
    tip: str,
    baslik: str,
    storage_key: str,
    content_type: str = "",
    byte_size: int | None = None,
    notlar: str = "",
) -> FirmaBelge:
    _assert_write(actor, firma)
    tip_n = (tip or "").strip().upper()
    if tip_n not in FirmaBelge.Tip.values:
        raise ValidationError({"tip": "Geçersiz belge tipi."})
    key = (storage_key or "").strip()
    if not key:
        raise ValidationError({"storage_key": "Zorunlu."})
    with transaction.atomic():
        return FirmaBelge.objects.create(
            firma=firma,
            tip=tip_n,
            baslik=(baslik or "").strip() or tip_n,
            storage_key=key[:255],
            content_type=(content_type or "")[:64],
            byte_size=byte_size,
            notlar=notlar or "",
            olusturan=actor,
        )
