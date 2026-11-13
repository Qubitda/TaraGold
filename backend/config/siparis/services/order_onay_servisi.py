"""ADR-0034 / ADR-0036 — platform sipariş onay havuzu + tedarikçi bazlı HazirlamaEmri."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from api.masking import assert_masked
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.yetki_servisi import can_view_all_tenants, require_perm
from siparis.models import HazirlamaEmri, Order


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


def _ensure_hazirlama_emirleri(locked: Order) -> list[HazirlamaEmri]:
    """Sipariş satırlarındaki tedarikçiler başına HazirlamaEmri açar/döndürür."""
    by_supplier: dict[int, str] = {}
    for line in locked.lines.select_related("stock_reservation__teklif"):
        res = getattr(line, "stock_reservation", None)
        teklif = getattr(res, "teklif", None) if res is not None else None
        ted_id = getattr(teklif, "tedarikci_id", None) if teklif is not None else None
        if not ted_id:
            continue
        tm = getattr(line, "teslim_modeli", HazirlamaEmri.TeslimModeli.PLATFORM_QC)
        if ted_id not in by_supplier:
            by_supplier[ted_id] = tm
        elif tm == HazirlamaEmri.TeslimModeli.PLATFORM_QC:
            by_supplier[ted_id] = HazirlamaEmri.TeslimModeli.PLATFORM_QC

    emirler: list[HazirlamaEmri] = []
    for ted_id, tm in sorted(by_supplier.items()):
        emir, _ = HazirlamaEmri.objects.get_or_create(
            order=locked,
            tedarikci_firma_id=ted_id,
            defaults={
                "durum": HazirlamaEmri.Durum.HAZIRLANIYOR,
                "teslim_modeli": tm,
            },
        )
        emirler.append(emir)
    return emirler


def _post_order_satis_cari(*, actor, locked: Order) -> list[int]:
    """Onaylanan sipariş tutarını alıcının platform carisine SATIS (BORC) yazar (idempotent)."""
    from finans.models import LedgerEntry
    from finans.services import cari_servisi
    from finans.services.finans_audit import record_finans_audit

    by_currency: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for line in locked.lines.all():
        pb = (getattr(line, "para_birimi", "") or "TRY").strip().upper()
        tutar = Decimal(line.snapshot_satir_tutari_vergisiz or "0.00")
        if tutar > 0:
            by_currency[pb] += tutar

    if not by_currency:
        return []

    platform = ensure_platform_firma()
    created_ids: list[int] = []
    for pb, total in by_currency.items():
        total_q = total.quantize(Decimal("0.01"))
        if total_q <= 0:
            continue
        idem_key = f"order-{locked.pk}-satis-{pb}"
        existing = LedgerEntry.objects.filter(
            firma_id=locked.alici_firma_id,
            idempotency_key=idem_key,
        ).first()
        if existing is not None:
            created_ids.append(existing.pk)
            continue
        # Zaten manuel/farklı key ile SATIS yazılmışsa çift borçlandırma yapma
        if LedgerEntry.objects.filter(
            firma_id=locked.alici_firma_id,
            referans_tip="Order",
            referans_id=str(locked.pk),
            hareket_tipi=LedgerEntry.HareketTipi.SATIS,
            para_birimi=pb,
        ).exists():
            continue
        entry = LedgerEntry(
            firma_id=locked.alici_firma_id,
            karsi_firma=platform,
            tutar=total_q,
            para_birimi=pb,
            yon=LedgerEntry.Yon.BORC,
            hareket_tipi=LedgerEntry.HareketTipi.SATIS,
            referans_tip="Order",
            referans_id=str(locked.pk),
            idempotency_key=idem_key,
            aciklama=f"Sipariş #{locked.pk} onay satış borcu",
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
        entry.save()
        cari_servisi.uygula_ledger_entry(entry)
        record_finans_audit(
            actor=actor,
            action="finans.ledger.order_satis",
            amount=total_q,
            currency=pb,
            order_ref=str(locked.pk),
            entity_type="LedgerEntry",
            entity_id=str(entry.pk),
            success=True,
            extra={"firma_id": locked.alici_firma_id, "order_id": locked.pk},
        )
        created_ids.append(entry.pk)
    return created_ids


def onayla(*, actor, order: Order) -> Order:
    """ONAY_BEKLIYOR|OLUSTURULDU → ONAYLANDI → HAZIRLANIYOR + HazirlamaEmri + SATIS cari."""
    _require_ops_approve(
        actor, action="order.onay_denied", order_id=str(order.pk or "")
    )
    with domain_atomic():
        locked = (
            Order.objects.select_for_update()
            .prefetch_related("lines__stock_reservation__teklif")
            .get(pk=order.pk)
        )
        if locked.durum in (
            Order.Durum.ONAYLANDI,
            Order.Durum.HAZIRLANIYOR,
            Order.Durum.HAZIR,
        ):
            _ensure_hazirlama_emirleri(locked)
            _post_order_satis_cari(actor=actor, locked=locked)
            return locked
        if locked.durum not in (
            Order.Durum.ONAY_BEKLIYOR,
            Order.Durum.OLUSTURULDU,
        ):
            raise ValidationError(f"Onaylanamaz; durum={locked.durum}")
        _set_durum(locked, Order.Durum.ONAYLANDI)
        _set_durum(locked, Order.Durum.HAZIRLANIYOR)
        emirler = _ensure_hazirlama_emirleri(locked)
        satis_ids = _post_order_satis_cari(actor=actor, locked=locked)
        record_audit(
            actor=actor,
            action="order.onaylandi",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "durum": locked.durum,
                "hazirlama_emri_ids": [e.pk for e in emirler],
                "satis_ledger_ids": satis_ids,
            },
        )
        from firmalar.services import outbox_servisi

        if emirler:
            for emir in emirler:
                outbox_servisi.enqueue(
                    event_type="order.hazirlama_emri",
                    payload={
                        "order_id": locked.pk,
                        "hazirlama_emri_id": emir.pk,
                        "tedarikci_firma_id": emir.tedarikci_firma_id,
                        # Kör: alıcı kimliği yok
                        "maskeli": True,
                    },
                )
        else:
            outbox_servisi.enqueue(
                event_type="order.hazirlama_emri",
                payload={
                    "order_id": locked.pk,
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
        for emir in HazirlamaEmri.objects.select_for_update().filter(order=locked):
            if emir.durum != HazirlamaEmri.Durum.IPTAL:
                emir.durum = HazirlamaEmri.Durum.IPTAL
                emir._allow_status_transition = True
                try:
                    emir.save(update_fields=["durum", "guncelleme_tarihi"])
                finally:
                    emir._allow_status_transition = False
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
    """Tedarikçi kendi HazirlamaEmri'ni HAZIR yapar; tüm tedarikçiler HAZIR olunca Order → HAZIR."""
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
        if locked.durum not in (Order.Durum.HAZIRLANIYOR, Order.Durum.HAZIR):
            raise ValidationError(f"Hazır işaretlenemez; durum={locked.durum}")
        matching_lines = [
            line
            for line in locked.lines.all()
            if getattr(
                getattr(line.stock_reservation, "teklif", None),
                "tedarikci_id",
                None,
            )
            == firma.pk
        ]
        if not matching_lines:
            raise PermissionDenied("Bu siparişte satırınız yok.")

        # Ensure HazirlamaEmri exists for all suppliers on this order (safe for legacy rows)
        _ensure_hazirlama_emirleri(locked)
        emir = HazirlamaEmri.objects.select_for_update().get(
            order=locked, tedarikci_firma_id=firma.pk
        )
        if emir.durum == HazirlamaEmri.Durum.IPTAL:
            raise ValidationError("İptal edilmiş hazırlama emri hazır işaretlenemez.")

        if emir.durum != HazirlamaEmri.Durum.HAZIR:
            emir.durum = HazirlamaEmri.Durum.HAZIR
            emir.hazir_zamani = timezone.now()
            emir.hazir_isaretleyen = actor
            emir._allow_status_transition = True
            try:
                emir.save(
                    update_fields=[
                        "durum",
                        "hazir_zamani",
                        "hazir_isaretleyen",
                        "guncelleme_tarihi",
                    ]
                )
            finally:
                emir._allow_status_transition = False

        # Tüm aktif hazırlama emirleri HAZIR ise siparişi HAZIR yap
        remaining = (
            HazirlamaEmri.objects.filter(order=locked)
            .exclude(durum=HazirlamaEmri.Durum.IPTAL)
            .exclude(durum=HazirlamaEmri.Durum.HAZIR)
            .exists()
        )
        if not remaining and locked.durum == Order.Durum.HAZIRLANIYOR:
            _set_durum(locked, Order.Durum.HAZIR)

        record_audit(
            actor=actor,
            action="order.tedarikci_hazir",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "hazirlama_emri_id": emir.pk,
                "order_durum": locked.durum,
                "emir_durum": emir.durum,
            },
        )
        return locked


def present_hazirlama_emri(
    order: Order, *, tedarikci_firma_id: int | None = None
) -> dict:
    """Tedarikçiye maskeli DTO — yalnız ilgili tedarikçinin satırları, alıcı kimliği yok."""
    lines = []
    qs = order.lines.select_related(
        "varyant", "varyant__urun", "stock_reservation__teklif"
    )
    if tedarikci_firma_id is not None:
        qs = qs.filter(
            stock_reservation__teklif__tedarikci_id=tedarikci_firma_id
        )
    for line in qs:
        lines.append(
            {
                "order_line_id": line.pk,
                "varyant_id": line.varyant_id,
                "platform_kodu": getattr(line.varyant, "sku", None)
                or getattr(getattr(line.varyant, "urun", None), "platform_kodu", ""),
                "urun_ad": getattr(getattr(line.varyant, "urun", None), "ad", ""),
                "miktar": str(line.miktar),
                "birim": line.birim,
                "teslim_modeli": getattr(line, "teslim_modeli", "PLATFORM_QC"),
            }
        )

    emir = None
    if tedarikci_firma_id is not None:
        emir = HazirlamaEmri.objects.filter(
            order_id=order.pk, tedarikci_firma_id=tedarikci_firma_id
        ).first()

    data = {
        "order_id": order.pk,
        "hazirlama_emri_id": emir.pk if emir else None,
        "durum": emir.durum if emir else order.durum,
        "order_durum": order.durum,
        "teslim_modeli": emir.teslim_modeli if emir else "PLATFORM_QC",
        "hazir_zamani": emir.hazir_zamani.isoformat()
        if (emir and emir.hazir_zamani)
        else None,
        "satirlar": lines,
        # Kör havuz
        "alici": None,
    }
    assert_masked(data, context="supplier")
    return data
