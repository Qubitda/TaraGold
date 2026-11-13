"""F5-022 / ADR-0036 — Tedarikçi hak ediş + maliyet hesabı + manuel ödeme."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Sum
from django.utils import timezone

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import has_perm, require_perm
from finans.models import TedarikciHakEdis
from kalite.models import QualityInspection
from siparis.models import Order

Q4 = Decimal("0.0001")
Q2 = Decimal("0.01")


def _q4(value: Decimal) -> Decimal:
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Q4, rounding=ROUND_HALF_UP)


def _vade_gun() -> int:
    raw = getattr(settings, "SUPPLIER_ACCRUAL_VADE_GUN", 0)
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


def unpaid_supplier_has_total() -> Decimal:
    """HAKEDILDI + BEKLEMEDE gram toplamı (ODENDI hariç)."""
    total = (
        TedarikciHakEdis.objects.filter(
            durum__in=[
                TedarikciHakEdis.Durum.HAKEDILDI,
                TedarikciHakEdis.Durum.BEKLEMEDE,
            ]
        )
        .aggregate(s=Sum("gram"))
        .get("s")
    )
    return _q4(total if total is not None else Decimal("0"))


def _compute_line_supplier_cost(line, *, now) -> tuple[Decimal | None, str]:
    """TedarikciTeklif üzerinden satır tedarikçi maliyetini hesaplar (mümkün değilse None)."""
    res = getattr(line, "stock_reservation", None)
    teklif = getattr(res, "teklif", None) if res is not None else None
    if teklif is None:
        return None, (line.para_birimi or "TRY").upper()

    pb = (getattr(teklif, "para_birimi", "") or line.para_birimi or "TRY").strip().upper()
    model = getattr(teklif, "fiyat_modeli", "")
    miktar = Decimal(str(line.miktar or "0"))

    try:
        from fiyatlama.models import TedarikciTeklif
        from tanimlar.models import KurTaraf
        from tanimlar.services import currency_conversion, kur_servisi

        tas_try = Decimal("0")
        for tas in teklif.taslar.all():
            tpb = (tas.para_birimi or "TRY").upper()
            if tpb == "TRY":
                tas_try += Decimal(str(tas.bedel or "0"))
            else:
                tas_try += currency_conversion.to_try(
                    tas.bedel, kaynak_pb=tpb, taraf=KurTaraf.TEDARIKCI, now=now
                ).tutar

        if model == TedarikciTeklif.FiyatModeli.SABIT_PARCA:
            bf = Decimal(str(teklif.birim_fiyat or "0"))
            birim_cost = bf + tas_try
            if pb != "TRY" and tas_try > 0:
                tas_pb = currency_conversion.convert(
                    tas_try, kaynak_pb="TRY", hedef_pb=pb, taraf=KurTaraf.TEDARIKCI, now=now
                ).tutar
                birim_cost = bf + tas_pb
            return (birim_cost * miktar).quantize(Q2, rounding=ROUND_HALF_UP), pb

        if model == TedarikciTeklif.FiyatModeli.GRAM_BIRIM:
            bf = Decimal(str(teklif.birim_fiyat or "0"))
            if line.birim == "GRAM":
                base = miktar * bf
            else:
                gram = Decimal(str(teklif.gram or "0"))
                base = gram * bf * miktar
            if pb == "TRY":
                return (base + tas_try).quantize(Q2, rounding=ROUND_HALF_UP), "TRY"
            tas_pb = (
                currency_conversion.convert(
                    tas_try, kaynak_pb="TRY", hedef_pb=pb, taraf=KurTaraf.TEDARIKCI, now=now
                ).tutar
                if tas_try > 0
                else Decimal("0")
            )
            return (base + tas_pb).quantize(Q2, rounding=ROUND_HALF_UP), pb

        if model == TedarikciTeklif.FiyatModeli.METAL_BAZLI:
            varyant = line.varyant
            metal = getattr(varyant, "urun", None)
            ayar = getattr(metal, "ayar", None)
            milyem = getattr(ayar, "milyem", None)
            metal_cins = getattr(metal, "metal_cins", None)
            if not milyem or not metal_cins:
                return None, "TRY"
            try:
                ms = kur_servisi.guncel_metal_kuru(
                    metal_cins=metal_cins, taraf=KurTaraf.TEDARIKCI, now=now
                )
            except Exception:  # noqa: BLE001
                return None, "TRY"
            gram = (
                miktar
                if line.birim == "GRAM"
                else Decimal(str(teklif.gram or "0")) * miktar
            )
            iscilik = Decimal(str(teklif.iscilik_override or "0"))
            birim_try = (
                gram * Decimal(str(milyem)) * Decimal(str(ms.fiyat))
                + (iscilik * (Decimal("1") if line.birim == "GRAM" else miktar))
                + tas_try
            )
            return birim_try.quantize(Q2, rounding=ROUND_HALF_UP), "TRY"
    except Exception:  # noqa: BLE001
        return None, pb
    return None, pb


def _line_groups(order: Order, *, now) -> dict[int, dict]:
    """tedarikci_id → {gram, para_birimi, tutar}."""
    groups: dict[int, dict] = {}
    lines = list(
        order.lines.select_related(
            "varyant__urun__ayar",
            "varyant__urun__metal_cins",
            "stock_reservation__teklif",
            "price_lock__quote",
        ).prefetch_related("stock_reservation__teklif__taslar")
    )
    single = len(lines) == 1
    for line in lines:
        tedarikci_id = line.stock_reservation.teklif.tedarikci_id
        bucket = groups.setdefault(
            tedarikci_id,
            {
                "gram": Decimal("0"),
                "para_birimi": line.para_birimi or "",
                "tutar": Decimal("0.00"),
                "tutar_missing": False,
            },
        )
        if line.birim == "GRAM":
            bucket["gram"] += line.miktar
        elif single:
            quote = getattr(line.price_lock, "quote", None)
            if quote is not None and getattr(quote, "gram", None):
                bucket["gram"] += Decimal(str(quote.gram))
        cost, cost_pb = _compute_line_supplier_cost(line, now=now)
        if cost is None:
            bucket["tutar_missing"] = True
        else:
            bucket["tutar"] += cost
            if not bucket["para_birimi"] or cost_pb:
                bucket["para_birimi"] = cost_pb
        if not bucket["para_birimi"]:
            bucket["para_birimi"] = line.para_birimi or ""
    return groups


def kaydet_qc_pass(
    *,
    actor,
    inspection: QualityInspection,
    now=None,
) -> list[TedarikciHakEdis]:
    """QC PASS sonrası tedarikçi maliyet hak ediş kaydı (idempotent per inspection+tedarikçi)."""
    now = now or timezone.now()
    if inspection.durum != QualityInspection.Durum.PASS:
        raise ValidationError("Hak ediş yalnız PASS inspection için.")

    order = inspection.order
    groups = _line_groups(order, now=now)
    if not groups:
        raise ValidationError("Siparişte tedarikçi satırı yok.")

    vade_gun = _vade_gun()
    vade_tarihi = now + timedelta(days=vade_gun)
    hedef_durum = (
        TedarikciHakEdis.Durum.HAKEDILDI
        if vade_gun == 0
        else TedarikciHakEdis.Durum.BEKLEMEDE
    )

    created: list[TedarikciHakEdis] = []
    with domain_atomic():
        for tedarikci_id, meta in groups.items():
            key = f"he:insp:{inspection.pk}:ted:{tedarikci_id}"
            existing = TedarikciHakEdis.objects.filter(idempotency_key=key).first()
            if existing is not None:
                created.append(existing)
                continue
            tutar_val = (
                None
                if meta["tutar_missing"]
                else Decimal(meta["tutar"]).quantize(Q2, rounding=ROUND_HALF_UP)
            )
            row = TedarikciHakEdis(
                order=order,
                quality_inspection=inspection,
                tedarikci_firma_id=tedarikci_id,
                durum=hedef_durum,
                gram=_q4(meta["gram"]),
                tutar=tutar_val,
                para_birimi=(meta["para_birimi"] or "").strip().upper(),
                vade_tarihi=vade_tarihi,
                hak_edis_tarihi=now if hedef_durum == TedarikciHakEdis.Durum.HAKEDILDI else None,
                idempotency_key=key,
                aciklama=f"QC PASS inspection={inspection.pk}",
                olusturan=actor if getattr(actor, "pk", None) else None,
            )
            row.save()
            created.append(row)
            record_audit(
                actor=actor,
                action="finans.hak_edis.created",
                entity_type="TedarikciHakEdis",
                entity_id=str(row.pk),
                success=True,
                detail={
                    "order_id": order.pk,
                    "inspection_id": inspection.pk,
                    "tedarikci_id": tedarikci_id,
                    "durum": row.durum,
                    "gram": str(row.gram),
                    "tutar": str(row.tutar) if row.tutar is not None else None,
                    "para_birimi": row.para_birimi,
                    "vade_gun": vade_gun,
                },
            )
    return created


def hakedise_cevir(*, actor, hak_edis: TedarikciHakEdis, now=None) -> TedarikciHakEdis:
    """BEKLEMEDE → HAKEDILDI (vade sonrası veya manuel)."""
    now = now or timezone.now()
    try:
        require_perm(
            actor,
            P["manage_hak_edis"],
            message="Hak ediş için manage_hak_edis gerekir.",
        )
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="finans.hak_edis.transition_denied",
            entity_type="TedarikciHakEdis",
            entity_id=str(hak_edis.pk),
            success=False,
            reason=str(exc),
        )
        raise

    with domain_atomic():
        locked = TedarikciHakEdis.objects.select_for_update().get(pk=hak_edis.pk)
        if locked.durum == TedarikciHakEdis.Durum.HAKEDILDI:
            return locked
        if locked.durum != TedarikciHakEdis.Durum.BEKLEMEDE:
            raise ValidationError(f"Hak ediş geçilemez; durum={locked.durum}")
        locked.durum = TedarikciHakEdis.Durum.HAKEDILDI
        locked.hak_edis_tarihi = now
        locked._allow_status_transition = True
        try:
            locked.save(update_fields=["durum", "hak_edis_tarihi"])
        finally:
            locked._allow_status_transition = False
        record_audit(
            actor=actor,
            action="finans.hak_edis.hakedildi",
            entity_type="TedarikciHakEdis",
            entity_id=str(locked.pk),
            success=True,
            detail={"durum": locked.durum},
        )
        return locked


def odeme_yap(
    *,
    actor,
    hak_edis: TedarikciHakEdis,
    odeme_ledger_entry_id: int | None = None,
    now=None,
) -> TedarikciHakEdis:
    """HAKEDILDI|BEKLEMEDE → ODENDI (manuel tedarikçi ödemesi sonrası)."""
    now = now or timezone.now()
    if not (has_perm(actor, P["manage_hak_edis"]) or has_perm(actor, P["post_ledger"])):
        raise PermissionDenied("Hak ediş ödeme için finans/hak ediş yetkisi gerekir.")

    with domain_atomic():
        locked = TedarikciHakEdis.objects.select_for_update().get(pk=hak_edis.pk)
        if locked.durum == TedarikciHakEdis.Durum.ODENDI:
            return locked
        if locked.durum not in (
            TedarikciHakEdis.Durum.HAKEDILDI,
            TedarikciHakEdis.Durum.BEKLEMEDE,
        ):
            raise ValidationError(f"Ödenemez; durum={locked.durum}")
        locked.durum = TedarikciHakEdis.Durum.ODENDI
        if not locked.hak_edis_tarihi:
            locked.hak_edis_tarihi = now
        locked.odeme_tarihi = now
        if odeme_ledger_entry_id is not None:
            locked.odeme_ledger_entry_id = odeme_ledger_entry_id
        locked._allow_status_transition = True
        try:
            locked.save(
                update_fields=[
                    "durum",
                    "hak_edis_tarihi",
                    "odeme_tarihi",
                    "odeme_ledger_entry_id",
                ]
            )
        finally:
            locked._allow_status_transition = False
        record_audit(
            actor=actor,
            action="finans.hak_edis.odendi",
            entity_type="TedarikciHakEdis",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "durum": locked.durum,
                "odeme_ledger_entry_id": locked.odeme_ledger_entry_id,
            },
        )
        return locked


def actor_can_manage(actor) -> bool:
    return bool(actor and has_perm(actor, P["manage_hak_edis"]))
