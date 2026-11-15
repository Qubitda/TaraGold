"""VaryantFiyat yazma — ops Stok & Fiyat (tek aktif / varyant)."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Max

from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import require_perm
from fiyatlama.models import VaryantFiyat


def _d(x) -> Decimal:
    if x is None:
        return Decimal("0")
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def get_aktif(varyant) -> VaryantFiyat | None:
    return (
        VaryantFiyat.objects.filter(varyant=varyant, durum=VaryantFiyat.Durum.AKTIF)
        .select_related("tedarikci", "varyant")
        .first()
    )


def require_aktif(varyant) -> VaryantFiyat:
    vf = get_aktif(varyant)
    if vf is None:
        raise ValidationError("Varyant için aktif fiyat yok; Stok & Fiyat girin.")
    return vf


def upsert_aktif(
    *,
    kullanici,
    varyant,
    tedarikci,
    fiyat_modeli: str,
    gram=None,
    birim_fiyat=None,
    para_birimi: str = "TRY",
    iscilik=None,
    tas_bedeli=None,
    ek_bedel=None,
) -> VaryantFiyat:
    """Aktif satırı pasife alıp yeni versiyon AKTIF açar (immutable versiyon)."""
    from django.core.exceptions import PermissionDenied
    from firmalar.services.yetki_servisi import has_perm

    if not (
        has_perm(kullanici, "fiyatlama.manage_varyant_fiyat")
        or has_perm(kullanici, "fiyatlama.manage_sozlesme")
        or has_perm(kullanici, "stok.manage_warehouse")
        or has_perm(kullanici, "stok.manage_own_warehouse")
    ):
        raise PermissionDenied("Varyant fiyat yazma yetkisi yok.")
    with domain_atomic():
        eski = (
            VaryantFiyat.objects.select_for_update()
            .filter(varyant=varyant, durum=VaryantFiyat.Durum.AKTIF)
            .first()
        )
        max_v = (
            VaryantFiyat.objects.filter(varyant=varyant).aggregate(m=Max("versiyon"))["m"]
            or 0
        )
        if eski is not None:
            eski.durum = VaryantFiyat.Durum.PASIF
            eski.save(update_fields=["durum", "guncelleme_tarihi"])
        yeni = VaryantFiyat(
            varyant=varyant,
            tedarikci=tedarikci,
            versiyon=max_v + 1,
            onceki=eski,
            durum=VaryantFiyat.Durum.AKTIF,
            fiyat_modeli=fiyat_modeli,
            gram=_d(gram) if gram is not None else None,
            birim_fiyat=_d(birim_fiyat) if birim_fiyat is not None else None,
            para_birimi=(para_birimi or "TRY").upper(),
            iscilik=_d(iscilik),
            tas_bedeli=_d(tas_bedeli),
            ek_bedel=_d(ek_bedel),
            olusturan=kullanici,
        )
        if fiyat_modeli == VaryantFiyat.FiyatModeli.SABIT_PARCA and yeni.birim_fiyat is None:
            raise ValidationError({"birim_fiyat": "Zorunlu."})
        yeni.full_clean()
        yeni.save()
        record_audit(
            actor=kullanici,
            action="varyant_fiyat.upsert",
            entity_type="VaryantFiyat",
            entity_id=str(yeni.pk),
            success=True,
            detail={"varyant_id": varyant.pk, "versiyon": yeni.versiyon},
        )
    return yeni
