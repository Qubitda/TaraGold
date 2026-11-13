"""Elle tahsilat kaydı — ADR-0034 (provider zorunlu değil)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from firmalar.models import Firma
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from finans.models import LedgerEntry
from finans.services.ledger_servisi import kaydet_hareket
from siparis.models import Order


def elle_tahsilat(
    *,
    actor,
    order: Order,
    tutar,
    yontem: str,
    aciklama: str = "",
    dekont_ref: str = "",
    tarih=None,
) -> LedgerEntry:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor) or not has_perm(actor, P["post_ledger"]):
        record_audit_durable(
            actor=actor,
            action="finans.manuel_tahsilat_denied",
            entity_type="Order",
            entity_id=str(order.pk or ""),
            success=False,
            reason="yetki_yok",
        )
        raise PermissionDenied("Elle tahsilat yalnız platform finans.")
    amount = Decimal(str(tutar))
    if amount <= 0:
        raise ValidationError({"tutar": "Pozitif olmalı."})
    yontem_n = (yontem or "").strip()
    if not yontem_n:
        raise ValidationError({"yontem": "Zorunlu."})
    tarih = tarih or timezone.now()
    alici = Firma.objects.get(pk=order.alici_firma_id)

    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        entry = kaydet_hareket(
            actor=actor,
            firma=alici,
            yon=LedgerEntry.Yon.ALACAK,
            hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT
            if hasattr(LedgerEntry, "HareketTipi")
            else "TAHSILAT",
            tutar=amount,
            para_birimi="TRY",
            idempotency_key=f"manuel-tahsil-o{locked.pk}-{int(tarih.timestamp())}",
            aciklama=(aciklama or f"Elle tahsilat Order#{locked.pk}")[:255],
            referans_tip="Order",
            referans_id=str(locked.pk),
        )
        record_audit(
            actor=actor,
            action="finans.manuel_tahsilat",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "tutar": str(amount),
                "yontem": yontem_n,
                "dekont_ref": (dekont_ref or "")[:120],
                "tarih": tarih.isoformat(),
                "ledger_entry_id": entry.pk,
            },
        )
        return entry


def elle_tedarikci_odeme(
    *,
    actor,
    tedarikci_firma: Firma,
    tutar,
    yontem: str,
    aciklama: str = "",
    dekont_ref: str = "",
    order: Order | None = None,
) -> LedgerEntry:
    """A2: tetikleme yok — elle ödeme kaydı."""
    if not can_view_all_tenants(actor) or not has_perm(actor, P["post_ledger"]):
        raise PermissionDenied("Elle ödeme yalnız platform finans.")
    amount = Decimal(str(tutar))
    if amount <= 0:
        raise ValidationError({"tutar": "Pozitif olmalı."})
    with domain_atomic():
        entry = kaydet_hareket(
            actor=actor,
            firma=tedarikci_firma,
            yon=LedgerEntry.Yon.BORC,
            hareket_tipi=LedgerEntry.HareketTipi.DUZELTME,
            tutar=amount,
            para_birimi="TRY",
            idempotency_key=(
                f"manuel-odeme-t{tedarikci_firma.pk}-{int(timezone.now().timestamp())}"
            ),
            aciklama=(aciklama or "Elle tedarikci odeme")[:255],
            referans_tip="Order" if order else "Firma",
            referans_id=str(order.pk if order else tedarikci_firma.pk),
        )
        record_audit(
            actor=actor,
            action="finans.manuel_tedarikci_odeme",
            entity_type="Firma",
            entity_id=str(tedarikci_firma.pk),
            success=True,
            detail={
                "tutar": str(amount),
                "yontem": yontem,
                "dekont_ref": dekont_ref,
                "ledger_entry_id": entry.pk,
            },
        )
        return entry
