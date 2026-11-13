"""Elle tahsilat + elle tedarikçi ödeme kaydı — ADR-0034 / ADR-0036 (sanal POS yok)."""

from __future__ import annotations

import uuid
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
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from finans.models import LedgerEntry, TedarikciHakEdis
from finans.services import hak_edis_servisi
from finans.services.ledger_servisi import kaydet_hareket
from siparis.models import Order


def _order_currency(order: Order) -> str:
    pb = order.lines.values_list("para_birimi", flat=True).first()
    return (pb or "TRY").strip().upper() or "TRY"


def elle_tahsilat(
    *,
    actor,
    order: Order,
    tutar,
    yontem: str,
    aciklama: str = "",
    dekont_ref: str = "",
    tarih=None,
    para_birimi: str | None = None,
    idempotency_key: str | None = None,
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
    platform = ensure_platform_firma()

    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        pb = (para_birimi or _order_currency(locked)).strip().upper() or "TRY"
        idem_key = (idempotency_key or "").strip() or (
            f"manuel-tahsil-o{locked.pk}-{uuid.uuid4().hex[:12]}"
        )
        entry = kaydet_hareket(
            actor=actor,
            firma=alici,
            karsi_firma=platform,
            yon=LedgerEntry.Yon.ALACAK,
            hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT,
            tutar=amount,
            para_birimi=pb,
            idempotency_key=idem_key[:64],
            aciklama=(aciklama or f"Elle tahsilat Order#{locked.pk} ({yontem_n})")[:255],
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
                "para_birimi": pb,
                "yontem": yontem_n,
                "dekont_ref": (dekont_ref or "")[:120],
                "tarih": tarih.isoformat(),
                "ledger_entry_id": entry.pk,
                "giren_kullanici_id": getattr(actor, "pk", None),
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
    hak_edis: TedarikciHakEdis | None = None,
    para_birimi: str | None = None,
    idempotency_key: str | None = None,
) -> LedgerEntry:
    """Platform finans tedarikçiye elle ödeme kaydeder; hak_edis bağlıysa ODENDI yapar."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor) or not has_perm(actor, P["post_ledger"]):
        record_audit_durable(
            actor=actor,
            action="finans.manuel_tedarikci_odeme_denied",
            entity_type="Firma",
            entity_id=str(getattr(tedarikci_firma, "pk", "")),
            success=False,
            reason="yetki_yok",
        )
        raise PermissionDenied("Elle ödeme yalnız platform finans.")
    if not getattr(tedarikci_firma, "tedarikci_mi", False):
        raise ValidationError({"tedarikci_firma": "Yalnız tedarikçi firmaya ödeme yapılır."})
    amount = Decimal(str(tutar))
    if amount <= 0:
        raise ValidationError({"tutar": "Pozitif olmalı."})
    yontem_n = (yontem or "").strip()
    if not yontem_n:
        raise ValidationError({"yontem": "Zorunlu."})
    if hak_edis is not None and hak_edis.tedarikci_firma_id != tedarikci_firma.pk:
        raise ValidationError({"hak_edis_id": "Hak ediş seçilen tedarikçiye ait değil."})

    platform = ensure_platform_firma()
    pb = (
        (para_birimi or (getattr(hak_edis, "para_birimi", "") if hak_edis else "") or "TRY")
        .strip()
        .upper()
        or "TRY"
    )
    idem_key = (idempotency_key or "").strip() or (
        f"manuel-odeme-t{tedarikci_firma.pk}-{uuid.uuid4().hex[:12]}"
    )

    with domain_atomic():
        target_order = order or (hak_edis.order if hak_edis is not None else None)
        entry = kaydet_hareket(
            actor=actor,
            firma=tedarikci_firma,
            karsi_firma=platform,
            yon=LedgerEntry.Yon.BORC,
            hareket_tipi=LedgerEntry.HareketTipi.DUZELTME,
            tutar=amount,
            para_birimi=pb,
            idempotency_key=idem_key[:64],
            aciklama=(aciklama or f"Elle tedarikçi ödeme ({yontem_n})")[:255],
            referans_tip="Order" if target_order else "Firma",
            referans_id=str(target_order.pk if target_order else tedarikci_firma.pk),
        )
        if hak_edis is not None:
            hak_edis_servisi.odeme_yap(
                actor=actor,
                hak_edis=hak_edis,
                odeme_ledger_entry_id=entry.pk,
            )
        record_audit(
            actor=actor,
            action="finans.manuel_tedarikci_odeme",
            entity_type="Firma",
            entity_id=str(tedarikci_firma.pk),
            success=True,
            detail={
                "tutar": str(amount),
                "para_birimi": pb,
                "yontem": yontem_n,
                "dekont_ref": (dekont_ref or "")[:120],
                "hak_edis_id": getattr(hak_edis, "pk", None),
                "order_id": getattr(target_order, "pk", None),
                "ledger_entry_id": entry.pk,
                "giren_kullanici_id": getattr(actor, "pk", None),
            },
        )
        return entry
