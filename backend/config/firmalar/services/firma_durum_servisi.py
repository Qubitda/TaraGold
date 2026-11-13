"""Firma durum makinesi (ADR-0033) — onay_durumu/aktif senkron."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.models import Firma
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.uyelik_servisi import has_firma_admin_uyelik
from firmalar.services.yetki_servisi import has_perm

APPROVE_FIRMA = "firmalar.approve_firma"

# (from, to) izinli geçişler
_GECISLER = {
    Firma.Durum.TASLAK: {Firma.Durum.ONAY_BEKLIYOR, Firma.Durum.REDDEDILDI},
    Firma.Durum.ONAY_BEKLIYOR: {
        Firma.Durum.AKTIF,
        Firma.Durum.REDDEDILDI,
        Firma.Durum.TASLAK,
    },
    Firma.Durum.AKTIF: {Firma.Durum.ASKIDA},
    Firma.Durum.ASKIDA: {Firma.Durum.AKTIF, Firma.Durum.REDDEDILDI},
    Firma.Durum.REDDEDILDI: {Firma.Durum.ONAY_BEKLIYOR, Firma.Durum.TASLAK},
}


def _require_approve(actor, *, firma, action: str) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not has_perm(actor, APPROVE_FIRMA):
        record_audit_durable(
            actor=actor,
            action=f"{action}_denied",
            entity_type="Firma",
            entity_id=str(firma.pk or ""),
            success=False,
            reason="approve_firma yok",
        )
        raise PermissionDenied("Firma onay yetkisi yok.")


def gecis(*, actor, firma: Firma, yeni_durum: str) -> Firma:
    """Tek giriş — geçersiz geçiş ValidationError."""
    action = "firmalar.firma.durum_gecis"
    _require_approve(actor, firma=firma, action=action)
    yeni = (yeni_durum or "").strip().upper()
    if yeni not in Firma.Durum.values:
        raise ValidationError({"durum": f"Geçersiz durum: {yeni_durum!r}."})

    with domain_atomic():
        locked = Firma.objects.select_for_update().get(pk=firma.pk)
        eski = locked.durum
        if yeni == eski:
            return locked
        izinli = _GECISLER.get(eski, frozenset())
        if yeni not in izinli:
            raise ValidationError(
                {"durum": f"Geçiş yasak: {eski} → {yeni}."}
            )
        if yeni == Firma.Durum.AKTIF and not has_firma_admin_uyelik(locked):
            raise ValidationError(
                {
                    "durum": (
                        "AKTIF için FIRMA_ADMIN (veya legacy alici_yonetici/"
                        "tedarikci_sahip) aktif üyesi zorunlu."
                    )
                }
            )
        locked.durum = yeni
        locked._sync_from_durum = True
        locked.save()
        record_audit(
            actor=actor,
            action=action,
            entity_type="Firma",
            entity_id=str(locked.pk),
            success=True,
            detail={"eski": eski, "yeni": yeni},
        )
        return locked


def onayla_firma(*, actor, firma: Firma) -> Firma:
    """Eski API — ONAY_BEKLIYOR/TASLAK → AKTIF (veya zaten AKTIF)."""
    if firma.durum == Firma.Durum.AKTIF and firma.aktif:
        return firma
    # Legacy: onayli bekliyorsa önce ONAY_BEKLIYOR kabul
    if firma.durum == Firma.Durum.TASLAK:
        firma = gecis(actor=actor, firma=firma, yeni_durum=Firma.Durum.ONAY_BEKLIYOR)
    if firma.durum == Firma.Durum.AKTIF:
        return firma
    return gecis(actor=actor, firma=firma, yeni_durum=Firma.Durum.AKTIF)
