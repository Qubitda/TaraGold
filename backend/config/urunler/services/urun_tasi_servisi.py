"""Ops ürün taş satırları — UrunTasi CRUD (katalog vitrin; quote taş = TeklifTasMaliyeti)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import record_audit
from firmalar.services.yetki_servisi import has_perm, is_platform_firm_user
from urunler.models import TasTipi, Urun, UrunTasi


def _require_ops(actor, *, action: str, urun: Urun) -> None:
    if not is_platform_firm_user(actor) or not has_perm(actor, P["submit_urun"]):
        raise PermissionDenied("Ürün taş yönetimi yalnız platform ops.")
    if urun.olusturan_firma_id != actor.firma_id:
        raise PermissionDenied("Başka firmaya ait ürün taşları yönetilemez.")
    del action


def _assert_urun_yazilabilir(urun: Urun) -> None:
    if urun.yayin_durumu == "aktif":
        raise ValidationError(
            {"detail": "Yayında olan ürünün taşları düzenlenemez; önce pasife alın."}
        )
    if urun.onay_durumu == "onayli":
        raise ValidationError(
            {"detail": "Onaylı ürünün taşları düzenlenemez; önce taslağa alın."}
        )


def present_urun_tasi(row: UrunTasi) -> dict:
    return {
        "id": row.pk,
        "urun_id": row.urun_id,
        "tas_tipi_id": row.tas_tipi_id,
        "tas_tipi": getattr(row.tas_tipi, "ad", "") or "",
        "tas_tipi_degerli": bool(getattr(row.tas_tipi, "degerli", False)),
        "adet": row.adet,
        "karat": str(row.karat) if row.karat is not None else None,
        "bedel": str(row.bedel),
        "kesim_id": row.kesim_id,
        "mihlama_tipi_id": row.mihlama_tipi_id,
        "mensei_id": row.mensei_id,
        "berraklik_id": row.berraklik_id,
        "renk_derecesi_id": row.renk_derecesi_id,
        "kesim_kalitesi_id": row.kesim_kalitesi_id,
        "sertifika_kurumu_id": row.sertifika_kurumu_id,
        "sertifika_no": row.sertifika_no or "",
    }


def _d(val, *, field: str, allow_none: bool = False):
    if val in (None, "") and allow_none:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError({field: "Geçersiz sayı."}) from exc


def tas_ekle(*, actor, urun: Urun, body: dict) -> UrunTasi:
    _require_ops(actor, action="urun.tas_ekle", urun=urun)
    _assert_urun_yazilabilir(urun)
    tip_id = body.get("tas_tipi_id")
    try:
        tip_id = int(tip_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"tas_tipi_id": "Zorunlu."}) from exc
    tip = TasTipi.objects.filter(pk=tip_id, aktif=True).first()
    if tip is None:
        raise ValidationError({"tas_tipi_id": "Aktif taş tipi bulunamadı."})
    try:
        adet = int(body.get("adet", 1))
    except (TypeError, ValueError) as exc:
        raise ValidationError({"adet": "Geçersiz adet."}) from exc
    row = UrunTasi(
        urun=urun,
        tas_tipi=tip,
        adet=adet,
        karat=_d(body.get("karat"), field="karat", allow_none=True),
        bedel=_d(body.get("bedel", 0), field="bedel") or Decimal("0"),
        sertifika_no=(body.get("sertifika_no") or "").strip()[:50],
    )
    for fk in (
        "kesim_id",
        "mihlama_tipi_id",
        "mensei_id",
        "berraklik_id",
        "renk_derecesi_id",
        "kesim_kalitesi_id",
        "sertifika_kurumu_id",
    ):
        raw = body.get(fk)
        if raw in (None, "", 0, "0"):
            setattr(row, fk, None)
        else:
            try:
                setattr(row, fk, int(raw))
            except (TypeError, ValueError) as exc:
                raise ValidationError({fk: "Geçersiz id."}) from exc
    with transaction.atomic():
        row.full_clean()
        row.save()
        record_audit(
            actor=actor,
            action="urun.tas_ekle",
            entity_type="UrunTasi",
            entity_id=row.pk,
            success=True,
            detail={"urun_id": urun.pk, "tas_tipi_id": tip.pk},
        )
    return row


def tas_guncelle(*, actor, row: UrunTasi, body: dict) -> UrunTasi:
    _require_ops(actor, action="urun.tas_guncelle", urun=row.urun)
    _assert_urun_yazilabilir(row.urun)
    if "tas_tipi_id" in body and body.get("tas_tipi_id") not in (None, ""):
        try:
            tip_id = int(body["tas_tipi_id"])
        except (TypeError, ValueError) as exc:
            raise ValidationError({"tas_tipi_id": "Geçersiz."}) from exc
        tip = TasTipi.objects.filter(pk=tip_id, aktif=True).first()
        if tip is None:
            raise ValidationError({"tas_tipi_id": "Aktif taş tipi bulunamadı."})
        row.tas_tipi = tip
    if "adet" in body:
        try:
            row.adet = int(body["adet"])
        except (TypeError, ValueError) as exc:
            raise ValidationError({"adet": "Geçersiz adet."}) from exc
    if "karat" in body:
        row.karat = _d(body.get("karat"), field="karat", allow_none=True)
    if "bedel" in body:
        row.bedel = _d(body.get("bedel"), field="bedel") or Decimal("0")
    if "sertifika_no" in body:
        row.sertifika_no = (body.get("sertifika_no") or "").strip()[:50]
    for fk in (
        "kesim_id",
        "mihlama_tipi_id",
        "mensei_id",
        "berraklik_id",
        "renk_derecesi_id",
        "kesim_kalitesi_id",
        "sertifika_kurumu_id",
    ):
        if fk not in body:
            continue
        raw = body.get(fk)
        if raw in (None, "", 0, "0"):
            setattr(row, fk, None)
        else:
            try:
                setattr(row, fk, int(raw))
            except (TypeError, ValueError) as exc:
                raise ValidationError({fk: "Geçersiz id."}) from exc
    with transaction.atomic():
        row.full_clean()
        row.save()
        record_audit(
            actor=actor,
            action="urun.tas_guncelle",
            entity_type="UrunTasi",
            entity_id=row.pk,
            success=True,
            detail={"urun_id": row.urun_id},
        )
    return row


def tas_sil(*, actor, row: UrunTasi) -> None:
    _require_ops(actor, action="urun.tas_sil", urun=row.urun)
    _assert_urun_yazilabilir(row.urun)
    with transaction.atomic():
        pk = row.pk
        urun_id = row.urun_id
        row.delete()
        record_audit(
            actor=actor,
            action="urun.tas_sil",
            entity_type="UrunTasi",
            entity_id=pk,
            success=True,
            detail={"urun_id": urun_id},
        )
