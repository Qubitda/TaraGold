"""Servis bedeli kural çözümleme + kampanya maker-checker."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import require_perm
from fiyatlama.models import ServisBedeliKurali
from fiyatlama.services.fiyat_hesaplama import normalize_birim_tipi


def _kapsam_skor(kapsam: str) -> int:
    return {
        ServisBedeliKurali.Kapsam.TEDARIKCI_KANAL: 40,
        ServisBedeliKurali.Kapsam.TEDARIKCI: 30,
        ServisBedeliKurali.Kapsam.KANAL: 20,
        ServisBedeliKurali.Kapsam.PLATFORM: 10,
    }.get(kapsam, 0)


def coz_servis_bedeli(
    *,
    satis_kanali=None,
    tedarikci=None,
    tarih: date | None = None,
) -> ServisBedeliKurali | None:
    """En spesifik AKTIF kural; kampanya (tarih içi) sürekli kuraldan üstün."""
    tarih = tarih or timezone.localdate()
    qs = ServisBedeliKurali.objects.filter(durum=ServisBedeliKurali.Durum.AKTIF)

    adaylar: list[ServisBedeliKurali] = []
    for k in qs:
        if k.kapsam == ServisBedeliKurali.Kapsam.PLATFORM:
            adaylar.append(k)
        elif k.kapsam == ServisBedeliKurali.Kapsam.KANAL:
            if satis_kanali and k.satis_kanali_id == getattr(satis_kanali, "pk", None):
                adaylar.append(k)
        elif k.kapsam == ServisBedeliKurali.Kapsam.TEDARIKCI:
            if tedarikci and k.tedarikci_id == getattr(tedarikci, "pk", None):
                adaylar.append(k)
        elif k.kapsam == ServisBedeliKurali.Kapsam.TEDARIKCI_KANAL:
            if (
                satis_kanali
                and tedarikci
                and k.satis_kanali_id == getattr(satis_kanali, "pk", None)
                and k.tedarikci_id == getattr(tedarikci, "pk", None)
            ):
                adaylar.append(k)

    def _gecerli(k: ServisBedeliKurali) -> bool:
        if not k.kampanya_mi:
            return True
        if not k.gecerlilik_baslangic or not k.gecerlilik_bitis:
            return False
        return k.gecerlilik_baslangic <= tarih <= k.gecerlilik_bitis

    adaylar = [k for k in adaylar if _gecerli(k)]
    if not adaylar:
        return None

    adaylar.sort(
        key=lambda k: (
            1 if k.kampanya_mi else 0,
            _kapsam_skor(k.kapsam),
            k.id,
        ),
        reverse=True,
    )
    return adaylar[0]


def to_motor_servis(kural: ServisBedeliKurali) -> tuple[str, Decimal]:
    return normalize_birim_tipi(kural.birim_tipi), Decimal(kural.deger)


def kampanya_olustur(kullanici, **fields) -> ServisBedeliKurali:
    require_perm(kullanici, "fiyatlama.manage_sozlesme")
    fields = dict(fields)
    fields["kampanya_mi"] = True
    fields["durum"] = ServisBedeliKurali.Durum.TASLAK
    fields["olusturan"] = kullanici
    k = ServisBedeliKurali(**fields)
    k.full_clean()
    with domain_atomic():
        k.save()
        record_audit(
            actor=kullanici,
            action="servis_bedeli.kampanya_olustur",
            entity="ServisBedeliKurali",
            entity_id=str(k.pk),
            success=True,
        )
    return k


def kampanya_onayla(kural: ServisBedeliKurali, kullanici) -> ServisBedeliKurali:
    require_perm(kullanici, "fiyatlama.approve_servis_bedeli_kampanya")
    if not kural.kampanya_mi:
        raise ValidationError("Yalnız kampanya onaylanır.")
    if kural.durum != ServisBedeliKurali.Durum.TASLAK:
        raise ValidationError("Yalnız taslak kampanya onaylanır.")
    if kural.olusturan_id == getattr(kullanici, "pk", None):
        raise PermissionDenied("Maker-checker: oluşturan onaylayamaz.")
    with domain_atomic():
        kural.durum = ServisBedeliKurali.Durum.AKTIF
        kural.onaylayan = kullanici
        kural.onay_zamani = timezone.now()
        kural.save(update_fields=["durum", "onaylayan", "onay_zamani", "guncelleme_tarihi"])
        record_audit(
            actor=kullanici,
            action="servis_bedeli.kampanya_onay",
            entity="ServisBedeliKurali",
            entity_id=str(kural.pk),
            success=True,
        )
    return kural
