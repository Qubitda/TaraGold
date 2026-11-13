"""F6-020 — Shipment SM + QC gate (ADR-0013 F6-K6 / F6-K8)."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import require_perm
from kalite.services.inspection_servisi import order_shipment_blocked
from lojistik.models import Shipment
from siparis.models import Order

_TRANSITIONS = {
    Shipment.Durum.TASLAK: {
        Shipment.Durum.HAZIR,
        Shipment.Durum.IPTAL,
    },
    Shipment.Durum.HAZIR: {
        Shipment.Durum.YOLDA,
        Shipment.Durum.IPTAL,
    },
    Shipment.Durum.YOLDA: {
        Shipment.Durum.TESLIM,
        Shipment.Durum.IPTAL,
    },
    Shipment.Durum.TESLIM: set(),
    Shipment.Durum.IPTAL: set(),
}


def _require_manage(actor, *, action: str, entity_id: str = ""):
    try:
        require_perm(
            actor,
            P["manage_shipment"],
            message="Sevkiyat için manage_shipment gerekir.",
        )
    except PermissionDenied:
        record_audit_durable(
            actor=actor,
            action=action,
            entity_type="Shipment",
            entity_id=entity_id,
            success=False,
            reason="yetki_yok",
        )
        raise


def _set_durum(ship: Shipment, yeni: str) -> Shipment:
    allowed = _TRANSITIONS.get(ship.durum, set())
    if yeni not in allowed:
        raise ValidationError(
            f"Geçersiz sevkiyat geçişi: {ship.durum} → {yeni}."
        )
    ship.durum = yeni
    ship._allow_status_transition = True
    try:
        ship.save(update_fields=["durum", "guncelleme_tarihi"])
    finally:
        ship._allow_status_transition = False
    return ship


def olustur(
    *,
    actor,
    order: Order,
    notlar: str = "",
    takip_no: str = "",
    teslim_modeli: str = Shipment.TeslimModeli.PLATFORM_QC,
    sevk_yonu: str | None = None,
) -> Shipment:
    """F6-K6: PLATFORM_QC → ALICI için QC PASS zorunlu; DOGRUDAN / TEDARIKCI_TO_PLATFORM QC gate atlanır."""
    _require_manage(actor, action="lojistik.shipment.create_denied")
    if order.durum not in (
        Order.Durum.OLUSTURULDU,
        Order.Durum.ONAYLANDI,
        Order.Durum.HAZIRLANIYOR,
        Order.Durum.HAZIR,
    ):
        raise ValidationError(
            f"Sevkiyat bu durumda açılamaz: {order.durum} (ADR-0034)."
        )
    tm = (teslim_modeli or Shipment.TeslimModeli.PLATFORM_QC).strip()
    if tm not in Shipment.TeslimModeli.values:
        raise ValidationError({"teslim_modeli": f"Geçersiz teslim modeli: {tm}"})
    if sevk_yonu is None:
        sy = (
            Shipment.SevkYonu.DOGRUDAN
            if tm == Shipment.TeslimModeli.DOGRUDAN
            else Shipment.SevkYonu.PLATFORM_TO_ALICI
        )
    else:
        sy = sevk_yonu.strip()
    if sy not in Shipment.SevkYonu.values:
        raise ValidationError({"sevk_yonu": f"Geçersiz sevk yönü: {sy}"})

    qc_required = (
        tm == Shipment.TeslimModeli.PLATFORM_QC
        and sy == Shipment.SevkYonu.PLATFORM_TO_ALICI
    )
    if qc_required and order_shipment_blocked(order):
        record_audit_durable(
            actor=actor,
            action="lojistik.shipment.create_denied",
            entity_type="Shipment",
            entity_id="",
            success=False,
            reason="qc_gate",
            detail={"order_id": order.pk, "teslim_modeli": tm, "sevk_yonu": sy},
        )
        raise ValidationError(
            "Sevkiyat açılamaz: siparişte QC PASS yok veya shipment_blok "
            "(F6-K6)."
        )

    with domain_atomic():
        if qc_required and order_shipment_blocked(order):
            raise ValidationError(
                "Sevkiyat açılamaz: QC gate (eşzamanlı kontrol)."
            )
        ship = Shipment(
            order=order,
            durum=Shipment.Durum.TASLAK,
            teslim_modeli=tm,
            sevk_yonu=sy,
            notlar=notlar or "",
            takip_no=takip_no or "",
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
        ship.save()
        record_audit(
            actor=actor,
            action="lojistik.shipment.created",
            entity_type="Shipment",
            entity_id=str(ship.pk),
            success=True,
            detail={
                "order_id": order.pk,
                "durum": ship.durum,
                "teslim_modeli": ship.teslim_modeli,
                "sevk_yonu": ship.sevk_yonu,
            },
        )
        return ship


def hazirla(*, actor, shipment: Shipment) -> Shipment:
    _require_manage(
        actor,
        action="lojistik.shipment.transition_denied",
        entity_id=str(shipment.pk),
    )
    with domain_atomic():
        locked = Shipment.objects.select_for_update().get(pk=shipment.pk)
        _set_durum(locked, Shipment.Durum.HAZIR)
        record_audit(
            actor=actor,
            action="lojistik.shipment.hazir",
            entity_type="Shipment",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum},
        )
        return locked


def sevk_et(
    *,
    actor,
    shipment: Shipment,
    takip_no: str = "",
    kargo_firma: str = "",
) -> Shipment:
    """HAZIR → YOLDA. ADR-0034: taşıyıcı adı + takip no elle zorunlu; entegrasyon yok."""
    _require_manage(
        actor,
        action="lojistik.shipment.transition_denied",
        entity_id=str(shipment.pk),
    )
    resolved = (takip_no or shipment.takip_no or "").strip()
    carrier = (kargo_firma or shipment.kargo_firma or "").strip()
    if not resolved or not carrier:
        raise ValidationError(
            {
                "takip_no": "Elle takip no zorunlu.",
                "kargo_firma": "Elle taşıyıcı adı zorunlu.",
            }
            if not resolved or not carrier
            else "Sevk için kargo_firma ve takip_no zorunlu."
        )

    with domain_atomic():
        locked = Shipment.objects.select_for_update().get(pk=shipment.pk)
        if locked.durum != Shipment.Durum.HAZIR:
            raise ValidationError(
                f"Sevk yalnız HAZIR iken; şu an {locked.durum}."
            )
        locked.takip_no = resolved[:64]
        locked.kargo_firma = carrier[:80]
        locked._allow_status_transition = True
        try:
            locked.save(
                update_fields=["takip_no", "kargo_firma", "guncelleme_tarihi"]
            )
        finally:
            locked._allow_status_transition = False
        _set_durum(locked, Shipment.Durum.YOLDA)
        record_audit(
            actor=actor,
            action="lojistik.shipment.yolda",
            entity_type="Shipment",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum, "takip_no": locked.takip_no},
        )
        return locked


def teslim_et(*, actor, shipment: Shipment) -> Shipment:
    """YOLDA → TESLIM. SHIPMENT_POD_REQUIRED=True ise POD zorunlu (F6-022)."""
    _require_manage(
        actor,
        action="lojistik.shipment.transition_denied",
        entity_id=str(shipment.pk),
    )
    from lojistik.models import ProofOfDelivery
    from lojistik.services.pod_servisi import pod_required

    with domain_atomic():
        locked = Shipment.objects.select_for_update().get(pk=shipment.pk)
        if pod_required() and not ProofOfDelivery.objects.filter(
            shipment=locked
        ).exists():
            raise ValidationError(
                "POD zorunlu (SHIPMENT_POD_REQUIRED); teslimat kanıtı yok (F6-022)."
            )
        _set_durum(locked, Shipment.Durum.TESLIM)
        from firmalar.services import outbox_servisi
        from siparis.models import Order

        alici_id = (
            Order.objects.filter(pk=locked.order_id)
            .values_list("alici_firma_id", flat=True)
            .first()
        )
        outbox_servisi.enqueue(
            event_type="shipment.delivered",
            payload={
                "shipment_id": locked.pk,
                "order_id": locked.order_id,
                "takip_no": locked.takip_no or "",
                "alici_firma_id": alici_id,
            },
        )
        record_audit(
            actor=actor,
            action="lojistik.shipment.teslim",
            entity_type="Shipment",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum},
        )
        return locked


def iptal_et(*, actor, shipment: Shipment) -> Shipment:
    _require_manage(
        actor,
        action="lojistik.shipment.transition_denied",
        entity_id=str(shipment.pk),
    )
    with domain_atomic():
        locked = Shipment.objects.select_for_update().get(pk=shipment.pk)
        _set_durum(locked, Shipment.Durum.IPTAL)
        record_audit(
            actor=actor,
            action="lojistik.shipment.iptal",
            entity_type="Shipment",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum},
        )
        return locked
