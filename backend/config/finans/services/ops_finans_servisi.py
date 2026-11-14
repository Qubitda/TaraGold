"""F5-031 — Platform finans ops okuma (view_all zorunlu)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied, ValidationError
from django.shortcuts import get_object_or_404

from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants
from finans.models import CariHesap, LedgerEntry, PaymentIntent


def require_ops_finance(actor) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Ops finans için kimlik gerekli.")
    if not can_view_all_tenants(actor):
        raise PermissionDenied(
            "Finans ops yalnız view_all platform kullanıcıları içindir."
        )


def present_cari_ops(hesap: CariHesap) -> dict:
    firma = getattr(hesap, "firma", None)
    karsi = getattr(hesap, "karsi_firma", None)
    return {
        "id": hesap.pk,
        "firma_id": hesap.firma_id,
        "firma_ad": getattr(firma, "ad", "") if firma else "",
        "karsi_firma_id": hesap.karsi_firma_id,
        "karsi_firma_ad": getattr(karsi, "ad", "") if karsi else "",
        "para_birimi": hesap.para_birimi,
        "bakiye": str(hesap.bakiye),
        "kredi_limiti": str(hesap.kredi_limiti),
        "guncelleme_tarihi": (
            hesap.guncelleme_tarihi.isoformat() if hesap.guncelleme_tarihi else None
        ),
    }


def present_ledger_ops(entry: LedgerEntry) -> dict:
    firma = getattr(entry, "firma", None)
    karsi = getattr(entry, "karsi_firma", None)
    return {
        "id": entry.pk,
        "firma_id": entry.firma_id,
        "firma_ad": getattr(firma, "ad", "") if firma else "",
        "karsi_firma_id": entry.karsi_firma_id,
        "karsi_firma_ad": getattr(karsi, "ad", "") if karsi else "",
        "yon": entry.yon,
        "tutar": str(entry.tutar),
        "para_birimi": entry.para_birimi,
        "hareket_tipi": entry.hareket_tipi,
        "referans_tip": entry.referans_tip,
        "referans_id": entry.referans_id,
        "olusturma_tarihi": (
            entry.olusturma_tarihi.isoformat() if entry.olusturma_tarihi else None
        ),
    }


def present_payment_ops(pi: PaymentIntent) -> dict:
    alici = getattr(pi, "alici_firma", None)
    return {
        "id": pi.pk,
        "order_id": pi.order_id,
        "alici_firma_id": pi.alici_firma_id,
        "alici_firma_ad": getattr(alici, "ad", "") if alici else "",
        "durum": pi.durum,
        "tutar": str(pi.tutar),
        "para_birimi": pi.para_birimi,
        "olusturma_tarihi": (
            pi.olusturma_tarihi.isoformat() if pi.olusturma_tarihi else None
        ),
    }


def guncelle_kredi_limiti(*, actor, cari_id: int, kredi_limiti) -> CariHesap:
    require_ops_finance(actor)
    if kredi_limiti in (None, ""):
        raise ValidationError({"kredi_limiti": "Kredi limiti zorunludur."})
    try:
        yeni_limit = Decimal(str(kredi_limiti)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError({"kredi_limiti": "Geçerli bir tutar girin."}) from exc
    if yeni_limit < Decimal("0.00"):
        raise ValidationError({"kredi_limiti": "Kredi limiti negatif olamaz."})

    with domain_atomic():
        hesap = get_object_or_404(
            CariHesap.objects.select_for_update().select_related("firma", "karsi_firma"),
            pk=cari_id,
        )
        eski_limit = str(hesap.kredi_limiti)
        hesap.kredi_limiti = yeni_limit
        hesap._allow_cari_update = True
        try:
            hesap.save(update_fields=["kredi_limiti", "guncelleme_tarihi"])
        finally:
            hesap._allow_cari_update = False
        record_audit(
            actor=actor,
            action="finance.cari_limit_update",
            entity_type="CariHesap",
            entity_id=str(hesap.pk),
            success=True,
            detail={
                "firma_id": hesap.firma_id,
                "para_birimi": hesap.para_birimi,
                "eski_kredi_limiti": eski_limit,
                "yeni_kredi_limiti": str(yeni_limit),
            },
        )
    return hesap


def liste_cari(*, actor, limit: int = 100) -> list[dict]:
    require_ops_finance(actor)
    qs = CariHesap.objects.select_related("firma", "karsi_firma").order_by(
        "-guncelleme_tarihi", "-pk"
    )[: max(1, min(limit, 200))]
    return [present_cari_ops(h) for h in qs]


def liste_ledger(*, actor, limit: int = 100) -> list[dict]:
    require_ops_finance(actor)
    qs = LedgerEntry.objects.select_related("firma", "karsi_firma").order_by(
        "-olusturma_tarihi", "-pk"
    )[: max(1, min(limit, 200))]
    return [present_ledger_ops(e) for e in qs]


def liste_payments(*, actor, limit: int = 100) -> list[dict]:
    require_ops_finance(actor)
    qs = PaymentIntent.objects.select_related("alici_firma").order_by(
        "-olusturma_tarihi", "-pk"
    )[: max(1, min(limit, 200))]
    return [present_payment_ops(p) for p in qs]


def ozet(*, actor) -> dict:
    require_ops_finance(actor)
    return {
        "ops": True,
        "cari_count": CariHesap.objects.count(),
        "ledger_count": LedgerEntry.objects.count(),
        "payment_intent_count": PaymentIntent.objects.count(),
        "recent_ledger": liste_ledger(actor=actor, limit=20),
        "recent_payments": liste_payments(actor=actor, limit=20),
    }
