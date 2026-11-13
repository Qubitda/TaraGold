"""ADR-0034 — platform sipariş onay havuzu + hazırlama emri."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm, require_perm
from siparis.models import Order


def _require_ops_approve(actor, *, action: str, order_id: str = "") -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor):
        record_audit_durable(
            actor=actor,
            action=action,
            entity_type="Order",
            entity_id=order_id,
            success=False,
            reason="view_all_yok",
        )
        raise PermissionDenied("Sipariş onayı yalnız platform.")
    require_perm(actor, P["manage_shipment"], message="Ops sipariş yetkisi yok.")


def _set_durum(locked: Order, yeni: str) -> None:
    locked.durum = yeni
    locked._allow_status_transition = True
    try:
        locked.save(update_fields=["durum", "guncelleme_tarihi"])
    finally:
        locked._allow_status_transition = False


def onayla(*, actor, order: Order) -> Order:
    """ONAY_BEKLIYOR|OLUSTURULDU → ONAYLANDI → HAZIRLANIYOR (hazırlama emri)."""
    _require_ops_approve(
        actor, action="order.onay_denied", order_id=str(order.pk or "")
    )
    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.durum in (
            Order.Durum.ONAYLANDI,
            Order.Durum.HAZIRLANIYOR,
            Order.Durum.HAZIR,
        ):
            return locked
        if locked.durum not in (
            Order.Durum.ONAY_BEKLIYOR,
            Order.Durum.OLUSTURULDU,
        ):
            raise ValidationError(f"Onaylanamaz; durum={locked.durum}")
        _set_durum(locked, Order.Durum.ONAYLANDI)
        _set_durum(locked, Order.Durum.HAZIRLANIYOR)
        record_audit(
            actor=actor,
            action="order.onaylandi",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum},
        )
        from firmalar.services import outbox_servisi

        outbox_servisi.enqueue(
            event_type="order.hazirlama_emri",
            payload={
                "order_id": locked.pk,
                # Kör: alıcı kimliği yok
                "maskeli": True,
            },
        )
        return locked


def reddet(*, actor, order: Order, neden: str = "") -> Order:
    _require_ops_approve(
        actor, action="order.red_denied", order_id=str(order.pk or "")
    )
    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.durum not in (
            Order.Durum.ONAY_BEKLIYOR,
            Order.Durum.OLUSTURULDU,
        ):
            raise ValidationError(f"Reddedilemez; durum={locked.durum}")
        _set_durum(locked, Order.Durum.REDDEDILDI)
        record_audit(
            actor=actor,
            action="order.reddedildi",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={"neden": (neden or "")[:200]},
        )
        return locked


def tedarikci_hazir_isaretle(*, actor, order: Order) -> Order:
    """Tedarikçi: HAZIRLANIYOR → HAZIR (kendi satır teklifi)."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    firma = getattr(actor, "firma", None)
    if firma is None or not getattr(firma, "tedarikci_mi", False):
        raise PermissionDenied("Yalnız tedarikçi.")
    with domain_atomic():
        locked = (
            Order.objects.select_for_update()
            .prefetch_related("lines__stock_reservation__teklif")
            .get(pk=order.pk)
        )
        if locked.durum != Order.Durum.HAZIRLANIYOR:
            raise ValidationError(f"Hazır işaretlenemez; durum={locked.durum}")
        owns = False
        for line in locked.lines.all():
            ted_id = getattr(
                getattr(line.stock_reservation, "teklif", None),
                "tedarikci_id",
                None,
            )
            if ted_id == firma.pk:
                owns = True
                break
        if not owns:
            raise PermissionDenied("Bu siparişte satırınız yok.")
        _set_durum(locked, Order.Durum.HAZIR)
        record_audit(
            actor=actor,
            action="order.tedarikci_hazir",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
        )
        return locked


def present_hazirlama_emri(order: Order) -> dict:
    """Tedarikçiye maskeli DTO — alıcı kimliği yok."""
    lines = []
    for line in order.lines.select_related(
        "varyant", "stock_reservation__teklif"
    ):
        lines.append(
            {
                "order_line_id": line.pk,
                "varyant_id": line.varyant_id,
                "platform_kodu": getattr(line.varyant, "sku", None)
                or getattr(getattr(line.varyant, "urun", None), "platform_kodu", ""),
                "miktar": str(line.miktar),
                "birim": line.birim,
                "teslim_modeli": getattr(line, "teslim_modeli", "PLATFORM_QC"),
            }
        )
    return {
        "order_id": order.pk,
        "durum": order.durum,
        "satirlar": lines,
        # Kör havuz
        "alici": None,
    }
