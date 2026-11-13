"""Firma hesap onayı — ADR-0033 durum makinesine delege + outbox."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.models import Firma
from firmalar.services.audit_servisi import domain_atomic, record_audit_durable
from firmalar.services.firma_durum_servisi import (
    gecis,
    onayla_firma as _onayla_durum,
)
from firmalar.services.yetki_servisi import has_perm

APPROVE_FIRMA = "firmalar.approve_firma"

__all__ = ["onayla_firma", "enqueue_user_welcome", "gecis", "APPROVE_FIRMA"]


def onayla_firma(*, actor, firma: Firma) -> Firma:
    """Platform onay — → AKTIF; outbox `firma.approved`."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not has_perm(actor, APPROVE_FIRMA):
        record_audit_durable(
            actor=actor,
            action="firmalar.firma.approve_denied",
            entity_type="Firma",
            entity_id=str(firma.pk or ""),
            success=False,
            reason="approve_firma yok",
        )
        raise PermissionDenied("Firma onay yetkisi yok.")

    if firma.durum == Firma.Durum.AKTIF and firma.aktif:
        return firma

    try:
        with domain_atomic():
            locked = _onayla_durum(actor=actor, firma=firma)
            from firmalar.services import outbox_servisi

            outbox_servisi.enqueue(
                event_type="firma.approved",
                payload={
                    "firma_id": locked.pk,
                    "alici_firma_id": locked.pk,
                    "firma_adi": locked.ad,
                    "firma_kodu": locked.firma_kodu or "",
                },
            )
            return locked
    except (ValidationError, PermissionDenied) as exc:
        record_audit_durable(
            actor=actor,
            action="firmalar.firma.approve_failed",
            entity_type="Firma",
            entity_id=str(firma.pk or ""),
            success=False,
            reason=str(exc)[:255],
        )
        raise


def enqueue_user_welcome(*, actor, user) -> None:
    """Yeni kullanıcı (platform bootstrap dışı) — domain_atomic içinde çağrılmalı."""
    from firmalar.services import outbox_servisi

    outbox_servisi.enqueue(
        event_type="user.welcome",
        payload={
            "user_id": user.pk,
            "user_email": getattr(user, "email", "") or "",
            "user_name": user.get_username(),
            "firma_id": getattr(user, "firma_id", None),
            "alici_firma_id": getattr(user, "firma_id", None),
            "customer_emails": [getattr(user, "email", "")]
            if getattr(user, "email", None)
            else [],
        },
    )
