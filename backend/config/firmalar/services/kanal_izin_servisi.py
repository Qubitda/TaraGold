"""TedarikciKanalIzni talep/onay (ADR-0033)."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from firmalar.models import TedarikciKanalIzni
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from firmalar.role_permissions import P


def talep_et(*, actor, tedarikci_firma, satis_kanali) -> TedarikciKanalIzni:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not getattr(tedarikci_firma, "tedarikci_mi", False):
        raise ValidationError({"tedarikci_firma": "Yalnız tedarikçi firma."})
    if getattr(actor, "firma_id", None) != tedarikci_firma.pk and not can_view_all_tenants(
        actor
    ):
        raise PermissionDenied("Yalnız kendi firmanız için kanal izni talep edilebilir.")

    with domain_atomic():
        row, created = TedarikciKanalIzni.objects.get_or_create(
            tedarikci_firma=tedarikci_firma,
            satis_kanali=satis_kanali,
            defaults={
                "durum": TedarikciKanalIzni.Durum.ISTENDI,
                "talep_eden": actor,
            },
        )
        if not created:
            if row.durum == TedarikciKanalIzni.Durum.ONAYLI:
                return row
            row.durum = TedarikciKanalIzni.Durum.ISTENDI
            row.talep_eden = actor
            row.onaylayan = None
            row.karar_tarihi = None
            row.save(
                update_fields=[
                    "durum",
                    "talep_eden",
                    "onaylayan",
                    "karar_tarihi",
                ]
            )
        record_audit(
            actor=actor,
            action="firmalar.kanal_izni.talep",
            entity_type="TedarikciKanalIzni",
            entity_id=str(row.pk),
            success=True,
            detail={"kanal_id": satis_kanali.pk},
        )
        return row


def onayla(*, actor, izin: TedarikciKanalIzni) -> TedarikciKanalIzni:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor) or not has_perm(actor, P["approve_firma"]):
        # Platform onayı: view_all + approve_firma (self-approve yasak)
        record_audit_durable(
            actor=actor,
            action="firmalar.kanal_izni.onay_denied",
            entity_type="TedarikciKanalIzni",
            entity_id=str(izin.pk or ""),
            success=False,
            reason="platform_approve_yok",
        )
        raise PermissionDenied("Kanal izni onayı yalnız platform.")
    if getattr(actor, "firma_id", None) == izin.tedarikci_firma_id:
        raise PermissionDenied("Tedarikçi kendi kanal iznini onaylayamaz.")

    with domain_atomic():
        locked = TedarikciKanalIzni.objects.select_for_update().get(pk=izin.pk)
        locked.durum = TedarikciKanalIzni.Durum.ONAYLI
        locked.onaylayan = actor
        locked.karar_tarihi = timezone.now()
        locked.save(update_fields=["durum", "onaylayan", "karar_tarihi"])
        record_audit(
            actor=actor,
            action="firmalar.kanal_izni.onay",
            entity_type="TedarikciKanalIzni",
            entity_id=str(locked.pk),
            success=True,
        )
        return locked


def reddet(*, actor, izin: TedarikciKanalIzni) -> TedarikciKanalIzni:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor) or not has_perm(actor, P["approve_firma"]):
        raise PermissionDenied("Kanal izni reddi yalnız platform.")
    with domain_atomic():
        locked = TedarikciKanalIzni.objects.select_for_update().get(pk=izin.pk)
        locked.durum = TedarikciKanalIzni.Durum.REDDEDILDI
        locked.onaylayan = actor
        locked.karar_tarihi = timezone.now()
        locked.save(update_fields=["durum", "onaylayan", "karar_tarihi"])
        return locked
