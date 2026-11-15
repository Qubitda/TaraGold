"""Stok ledger yazımı — Movement + Balance (varyant anahtarı; teklif yok)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.yetki_servisi import has_perm, is_platform_firm_user
from stok.models import StockBalance, StockMovement, Warehouse
from stok.services.birim import assert_ayni_birim, birim_from_fiyat_modeli


def assert_tedarikci_warehouse(warehouse: Warehouse, tedarikci_id: int) -> None:
    if warehouse.sahip_tipi == Warehouse.SahipTipi.TEDARIKCI:
        if tedarikci_id != warehouse.sahip_firma_id:
            raise ValidationError(
                "Tedarikçi deposuna yalnız kendi stoğu yazılır (konsinye yok)."
            )


def _assert_can_adjust(actor, warehouse: Warehouse) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Stok düzeltme için kimlik gerekli.")
    if is_platform_firm_user(actor) and has_perm(actor, P["manage_warehouse"]):
        return
    if (
        has_perm(actor, P["manage_own_warehouse"])
        and warehouse.sahip_tipi == Warehouse.SahipTipi.TEDARIKCI
        and getattr(actor, "firma_id", None) == warehouse.sahip_firma_id
    ):
        return
    raise PermissionDenied("Stok düzeltme yetkisi yok.")


def _apply_on_hand_delta(balance: StockBalance, delta: Decimal) -> None:
    yeni = balance.on_hand + delta
    if yeni < 0:
        raise ValidationError(
            f"Yetersiz stok: on_hand={balance.on_hand}, delta={delta}."
        )
    if balance.available + delta < 0:
        raise ValidationError(
            f"Yetersiz available: available={balance.available}, delta={delta}."
        )
    balance.on_hand = yeni


def get_or_create_balance_locked(
    *,
    warehouse: Warehouse,
    varyant,
    birim: str,
) -> StockBalance:
    from django.db import IntegrityError

    bal = (
        StockBalance.objects.select_for_update()
        .filter(warehouse=warehouse, varyant=varyant, birim=birim)
        .first()
    )
    if bal is not None:
        return bal
    bal = StockBalance(
        warehouse=warehouse,
        varyant=varyant,
        birim=birim,
        on_hand=Decimal("0"),
        reserved=Decimal("0"),
        blocked=Decimal("0"),
    )
    try:
        bal.save()
    except IntegrityError:
        bal = (
            StockBalance.objects.select_for_update()
            .filter(warehouse=warehouse, varyant=varyant, birim=birim)
            .get()
        )
        return bal
    return StockBalance.objects.select_for_update().get(pk=bal.pk)


def save_balance_fields(balance: StockBalance, *, update_fields: list[str]) -> None:
    fields = list(update_fields)
    if "guncelleme_tarihi" not in fields:
        fields.append("guncelleme_tarihi")
    balance._allow_ledger_update = True
    try:
        balance.save(update_fields=fields)
    finally:
        balance._allow_ledger_update = False


def kaydet_hareket(
    *,
    actor,
    warehouse: Warehouse,
    varyant,
    fiyat_modeli: str,
    tedarikci_id: int | None = None,
    tip: str,
    miktar: Decimal,
    neden: str = "",
) -> StockMovement:
    if tip not in {
        StockMovement.Tip.GIRIS,
        StockMovement.Tip.CIKIS,
        StockMovement.Tip.DUZELTME,
    }:
        raise ValidationError(f"Bu dilimde desteklenmeyen hareket tipi: {tip}")

    miktar = Decimal(miktar)
    if miktar == 0:
        raise ValidationError("Miktar sıfır olamaz.")

    if tip == StockMovement.Tip.GIRIS and miktar < 0:
        raise ValidationError("GIRIS miktarı pozitif olmalı.")
    if tip == StockMovement.Tip.CIKIS and miktar > 0:
        miktar = -abs(miktar)
    if tip == StockMovement.Tip.CIKIS and miktar >= 0:
        raise ValidationError("CIKIS miktarı negatif olmalı.")

    birim = birim_from_fiyat_modeli(fiyat_modeli)
    if tedarikci_id is not None:
        assert_tedarikci_warehouse(warehouse, tedarikci_id)

    with domain_atomic():
        bal = get_or_create_balance_locked(
            warehouse=warehouse, varyant=varyant, birim=birim
        )
        assert_ayni_birim(bal.birim, birim, context="balance")
        _apply_on_hand_delta(bal, miktar)
        save_balance_fields(bal, update_fields=["on_hand"])

        mv = StockMovement(
            warehouse=warehouse,
            varyant=varyant,
            birim=birim,
            miktar=miktar,
            tip=tip,
            neden=(neden or "").strip(),
            olusturan=actor,
        )
        mv.save()
        record_audit(
            actor=actor,
            action="stock_movement.create",
            entity_type="StockMovement",
            entity_id=str(mv.pk),
            success=True,
            detail={
                "tip": tip,
                "miktar": str(miktar),
                "birim": birim,
                "warehouse_id": warehouse.pk,
                "varyant_id": varyant.pk,
                "on_hand": str(bal.on_hand),
            },
        )
        return mv


def duzeltme(
    *,
    actor,
    warehouse: Warehouse,
    varyant,
    fiyat_modeli: str,
    tedarikci_id: int | None = None,
    miktar: Decimal,
    neden: str,
) -> StockMovement:
    neden_n = (neden or "").strip()
    if len(neden_n) < 5:
        raise ValidationError("Düzeltme nedeni en az 5 karakter olmalı.")

    try:
        _assert_can_adjust(actor, warehouse)
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="stock_movement.create",
            entity_type="StockMovement",
            entity_id="",
            success=False,
            reason=str(exc),
            detail={"warehouse_id": warehouse.pk, "varyant_id": getattr(varyant, "pk", None)},
        )
        raise

    return kaydet_hareket(
        actor=actor,
        warehouse=warehouse,
        varyant=varyant,
        fiyat_modeli=fiyat_modeli,
        tedarikci_id=tedarikci_id,
        tip=StockMovement.Tip.DUZELTME,
        miktar=Decimal(miktar),
        neden=neden_n,
    )
