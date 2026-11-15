"""Ödeme kaydı — HAS/HURDA/TL + bağlantı kuru (ADR-0001)."""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
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
from finans.constants import (
    HAS_KODU,
    KurKaynagi,
    OdemeTipi,
    Q2,
    Q4,
    TRY_KODU,
    USD_KODU,
)
from finans.models import CariHesap, LedgerEntry, OdemeKaydi
from finans.services import cari_servisi
from finans.services.finans_audit import record_finans_audit
from finans.services.ledger_servisi import kaydet_hareket


def _q4(v: Decimal) -> Decimal:
    return Decimal(v).quantize(Q4)


def _q2(v: Decimal) -> Decimal:
    return Decimal(v).quantize(Q2)


def _require_odeme_actor(actor) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor) or not has_perm(actor, P["post_ledger"]):
        raise PermissionDenied("Ödeme kaydı yalnız platform finans.")


def _default_milyem_has() -> Decimal:
    return Decimal(str(getattr(settings, "HAS_ALTIN_MILYEM", "0.995")))


def _sapma_orani() -> Decimal:
    return Decimal(str(getattr(settings, "ODEME_KUR_SAPMA_ORANI", "0.02")))


def _resolve_altin_metal():
    from tanimlar.models import KiymetliMetal

    m = (
        KiymetliMetal.objects.filter(kod__iexact="ALTIN").first()
        or KiymetliMetal.objects.filter(kod__iexact="AU").first()
        or KiymetliMetal.objects.filter(ad__icontains="altın").first()
        or KiymetliMetal.objects.filter(ad__icontains="altin").first()
        or KiymetliMetal.objects.order_by("pk").first()
    )
    if m is None:
        raise ValidationError("Altın metal tanımı yok; kur çözülemez.")
    return m


def _canli_has_satis_kuru(*, now):
    from tanimlar.models import KurTaraf
    from tanimlar.services import kur_servisi
    from tanimlar.services.kur_servisi import KurYokError, gozlem_stale_mi

    metal = _resolve_altin_metal()
    try:
        detay = kur_servisi.resolve_metal_kuru_detay(
            metal, taraf=KurTaraf.ALICI, now=now
        )
    except KurYokError as exc:
        raise ValidationError({"kur": f"Kur yok: {exc}"}) from exc
    gozlem = detay.gozlem
    if gozlem is None or Decimal(gozlem.saf_birim_fiyat) <= 0:
        raise ValidationError({"kur": "Geçerli has satış kuru yok."})
    if gozlem_stale_mi(gozlem, now=now):
        raise ValidationError({"kur": "Kur bayat; ödeme reddedildi."})
    return gozlem, Decimal(gozlem.saf_birim_fiyat)


def _canli_usd_try_kuru(*, now):
    """USD/TRY satış (ask) — bayat ret (B5)."""
    from tanimlar.models import DovizKuru, KurTipi
    from tanimlar.services.kur_servisi import gozlem_stale_mi

    gozlem = (
        DovizKuru.objects.filter(para_birimi="USD", kur_tipi=KurTipi.SATIS)
        .select_related("saglayici")
        .order_by("-zaman", "-pk")
        .first()
    )
    if gozlem is None:
        gozlem = (
            DovizKuru.objects.filter(para_birimi="USD")
            .select_related("saglayici")
            .order_by("-zaman", "-pk")
            .first()
        )
    if gozlem is None:
        raise ValidationError({"kur": "USD kuru yok."})
    fiyat = Decimal(str(gozlem.kur))
    if fiyat <= 0:
        raise ValidationError({"kur": "Geçerli USD kuru yok."})
    if gozlem_stale_mi(gozlem, now=now):
        raise ValidationError({"kur": "USD kuru bayat; ödeme reddedildi."})
    return gozlem, fiyat


def _kaydet_odeme_usd(
    *,
    actor,
    firma,
    platform,
    order,
    key,
    ledger_key_base,
    usd_tutar,
    tl_tutar,
    manuel_kur,
    manuel_kur_gerekce,
    dekont_ref,
    now,
) -> OdemeKaydi:
    canli_gozlem, canli_fiyat = _canli_usd_try_kuru(now=now)
    if manuel_kur is not None:
        if not has_perm(actor, P["manage_kur"]):
            raise PermissionDenied("Manuel USD kuru için manage_kur gerekir.")
        gerekce = (manuel_kur_gerekce or "").strip()
        if not gerekce:
            raise ValidationError({"manuel_kur_gerekce": "Manuel kurda gerekçe zorunlu."})
        manuel_f = Decimal(str(manuel_kur))
        if manuel_f <= 0:
            raise ValidationError({"manuel_kur": "Pozitif olmalı."})
        sapma = abs(manuel_f - canli_fiyat) / canli_fiyat
        if sapma > _sapma_orani():
            raise ValidationError(
                {"manuel_kur": f"Canlı kurdan sapma limiti aşıldı (max %{_sapma_orani() * 100})."}
            )
        kur_fiyat = _q4(manuel_f)
        kur_kaynagi = KurKaynagi.MANUEL
        kur_zamani = now
    else:
        kur_fiyat = _q4(canli_fiyat)
        kur_kaynagi = KurKaynagi.CANLI
        kur_zamani = getattr(canli_gozlem, "zaman", None) or now

    if tl_tutar is not None:
        tl_amount = _q2(Decimal(str(tl_tutar)))
        if tl_amount <= 0:
            raise ValidationError({"tl_tutar": "Pozitif olmalı."})
        usd_alacak = _q2(tl_amount / kur_fiyat)
        usd_amount = usd_alacak
        tl_snap = tl_amount
    else:
        if usd_tutar is None:
            raise ValidationError({"usd_tutar": "USD veya tl_tutar zorunlu."})
        usd_amount = _q2(Decimal(str(usd_tutar)))
        if usd_amount <= 0:
            raise ValidationError({"usd_tutar": "Pozitif olmalı."})
        usd_alacak = usd_amount
        tl_snap = None

    e_usd = kaydet_hareket(
        actor=actor,
        firma=firma,
        karsi_firma=platform,
        yon=LedgerEntry.Yon.ALACAK,
        hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT,
        tutar=usd_alacak,
        para_birimi=USD_KODU,
        idempotency_key=f"{ledger_key_base}-USD"[:64],
        aciklama=f"Ödeme USD {usd_alacak}",
        referans_tip="OdemeKaydi",
        referans_id=key[:64],
    )
    kayit = OdemeKaydi(
        firma=firma,
        order=order,
        tip=OdemeTipi.USD,
        has_karsiligi=Decimal("0.0000"),
        usd_tutar=usd_amount,
        tl_tutar=tl_snap,
        kur_has_birim_fiyat=kur_fiyat,
        kur_kaynagi=kur_kaynagi,
        kur_zamani=kur_zamani,
        doviz_kuru_gozlem=canli_gozlem,
        manuel_kur_gerekce=(manuel_kur_gerekce or "")[:255],
        dekont_ref=(dekont_ref or "")[:120],
        idempotency_key=key[:64],
        ledger_entry_idler=[e_usd.pk],
        olusturan=actor if getattr(actor, "pk", None) else None,
    )
    kayit.save()
    record_audit(
        actor=actor,
        action="finans.odeme",
        entity_type="OdemeKaydi",
        entity_id=str(kayit.pk),
        success=True,
        detail={"tip": OdemeTipi.USD, "usd": str(usd_alacak), "kur": str(kur_fiyat)},
    )
    return kayit


def kaydet_odeme(
    *,
    actor,
    firma: Firma,
    tip: str,
    idempotency_key: str,
    brut_gram=None,
    olculen_milyem=None,
    tl_tutar=None,
    usd_tutar=None,
    manuel_kur=None,
    manuel_kur_gerekce: str = "",
    dekont_ref: str = "",
    order=None,
    now=None,
) -> OdemeKaydi:
    """HAS/HURDA/TL ödeme → OdemeKaydi + ledger ALACAK (idempotent)."""
    now = now or timezone.now()
    try:
        _require_odeme_actor(actor)
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="finans.odeme_denied",
            entity_type="Firma",
            entity_id=str(firma.pk),
            success=False,
            reason=str(exc),
        )
        raise

    tip_n = (tip or "").strip().upper()
    if tip_n not in (OdemeTipi.HAS, OdemeTipi.HURDA, OdemeTipi.TL, OdemeTipi.USD):
        raise ValidationError({"tip": "HAS, HURDA, TL veya USD olmalı."})
    key = (idempotency_key or "").strip()
    if not key:
        raise ValidationError({"idempotency_key": "Zorunlu."})

    existing = OdemeKaydi.objects.filter(firma=firma, idempotency_key=key).first()
    if existing is not None:
        return existing

    platform = ensure_platform_firma()
    ledger_key_base = f"odeme-f{firma.pk}-{key}"[:48]

    with domain_atomic():
        # Çift kontrol (race)
        existing = (
            OdemeKaydi.objects.select_for_update()
            .filter(firma=firma, idempotency_key=key)
            .first()
        )
        if existing is not None:
            return existing

        if tip_n in (OdemeTipi.HAS, OdemeTipi.HURDA):
            if brut_gram is None:
                raise ValidationError({"brut_gram": "Zorunlu."})
            brut = _q4(Decimal(str(brut_gram)))
            if brut <= 0:
                raise ValidationError({"brut_gram": "Pozitif olmalı."})
            if tip_n == OdemeTipi.HURDA:
                if olculen_milyem is None:
                    raise ValidationError({"olculen_milyem": "Hurdada zorunlu."})
                milyem = Decimal(str(olculen_milyem))
            else:
                milyem = (
                    Decimal(str(olculen_milyem))
                    if olculen_milyem is not None
                    else _default_milyem_has()
                )
            if milyem <= 0 or milyem > 1:
                raise ValidationError({"olculen_milyem": "0–1 arası oran."})
            has_karsiligi = _q4(brut * milyem)

            e_has = kaydet_hareket(
                actor=actor,
                firma=firma,
                karsi_firma=platform,
                yon=LedgerEntry.Yon.ALACAK,
                hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT,
                tutar=has_karsiligi,
                para_birimi=HAS_KODU,
                idempotency_key=f"{ledger_key_base}-HAS"[:64],
                aciklama=f"Ödeme {tip_n} {has_karsiligi} HAS",
                referans_tip="OdemeKaydi",
                referans_id=key[:64],
            )
            kayit = OdemeKaydi(
                firma=firma,
                order=order,
                tip=tip_n,
                brut_gram=brut,
                olculen_milyem=milyem,
                has_karsiligi=has_karsiligi,
                dekont_ref=(dekont_ref or "")[:120],
                idempotency_key=key[:64],
                ledger_entry_idler=[e_has.pk],
                olusturan=actor if getattr(actor, "pk", None) else None,
            )
            kayit.save()
            record_audit(
                actor=actor,
                action="finans.odeme",
                entity_type="OdemeKaydi",
                entity_id=str(kayit.pk),
                success=True,
                detail={
                    "tip": tip_n,
                    "has_karsiligi": str(has_karsiligi),
                    "ledger_ids": [e_has.pk],
                },
            )
            return kayit

        if tip_n == OdemeTipi.USD:
            return _kaydet_odeme_usd(
                actor=actor,
                firma=firma,
                platform=platform,
                order=order,
                key=key,
                ledger_key_base=ledger_key_base,
                usd_tutar=usd_tutar,
                tl_tutar=tl_tutar,
                manuel_kur=manuel_kur,
                manuel_kur_gerekce=manuel_kur_gerekce,
                dekont_ref=dekont_ref,
                now=now,
            )

        # TL
        if tl_tutar is None:
            raise ValidationError({"tl_tutar": "Zorunlu."})
        tl_amount = _q2(Decimal(str(tl_tutar)))
        if tl_amount <= 0:
            raise ValidationError({"tl_tutar": "Pozitif olmalı."})

        canli_gozlem, canli_fiyat = _canli_has_satis_kuru(now=now)
        if manuel_kur is not None:
            if not has_perm(actor, P["manage_kur"]):
                raise PermissionDenied(
                    "Manuel bağlantı kuru için manage_kur gerekir."
                )
            gerekce = (manuel_kur_gerekce or "").strip()
            if not gerekce:
                raise ValidationError(
                    {"manuel_kur_gerekce": "Manuel kurda gerekçe zorunlu."}
                )
            manuel_f = Decimal(str(manuel_kur))
            if manuel_f <= 0:
                raise ValidationError({"manuel_kur": "Pozitif olmalı."})
            sapma = abs(manuel_f - canli_fiyat) / canli_fiyat
            if sapma > _sapma_orani():
                raise ValidationError(
                    {
                        "manuel_kur": (
                            f"Canlı kurdan sapma limiti aşıldı "
                            f"(max %{_sapma_orani() * 100})."
                        )
                    }
                )
            kur_fiyat = _q4(manuel_f)
            kur_kaynagi = KurKaynagi.MANUEL
            kur_zamani = now
        else:
            kur_fiyat = _q4(canli_fiyat)
            kur_kaynagi = KurKaynagi.CANLI
            kur_zamani = getattr(canli_gozlem, "zaman", None) or now

        hesap_try = cari_servisi.get_or_create_locked(
            firma=firma, para_birimi=TRY_KODU, karsi_firma=platform
        )
        try_borc = max(hesap_try.bakiye, Decimal("0"))
        try_kapat = min(tl_amount, try_borc)
        kalan_tl = tl_amount - try_kapat
        has_from_tl = (
            _q4(kalan_tl / kur_fiyat) if kalan_tl > 0 and kur_fiyat > 0 else Decimal("0")
        )
        has_karsiligi = _q4(tl_amount / kur_fiyat)

        ledger_ids: list[int] = []
        if try_kapat > 0:
            e_try = kaydet_hareket(
                actor=actor,
                firma=firma,
                karsi_firma=platform,
                yon=LedgerEntry.Yon.ALACAK,
                hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT,
                tutar=try_kapat,
                para_birimi=TRY_KODU,
                idempotency_key=f"{ledger_key_base}-TRY"[:64],
                aciklama=f"Ödeme TL→TRY kapanış {try_kapat}",
                referans_tip="OdemeKaydi",
                referans_id=key[:64],
            )
            ledger_ids.append(e_try.pk)

        has_alacak = has_from_tl if has_from_tl > 0 else (
            has_karsiligi if try_kapat <= 0 else Decimal("0")
        )
        if has_alacak > 0:
            e_has = kaydet_hareket(
                actor=actor,
                firma=firma,
                karsi_firma=platform,
                yon=LedgerEntry.Yon.ALACAK,
                hareket_tipi=LedgerEntry.HareketTipi.TAHSILAT,
                tutar=has_alacak,
                para_birimi=HAS_KODU,
                idempotency_key=f"{ledger_key_base}-HAS"[:64],
                aciklama=f"Ödeme TL→HAS bağlantı {has_alacak}",
                referans_tip="OdemeKaydi",
                referans_id=key[:64],
            )
            ledger_ids.append(e_has.pk)

        kayit = OdemeKaydi(
            firma=firma,
            order=order,
            tip=OdemeTipi.TL,
            has_karsiligi=has_karsiligi,
            tl_tutar=tl_amount,
            kur_has_birim_fiyat=kur_fiyat,
            kur_kaynagi=kur_kaynagi,
            kur_zamani=kur_zamani,
            metal_kuru_gozlem=canli_gozlem,
            manuel_kur_gerekce=(manuel_kur_gerekce or "")[:255],
            dekont_ref=(dekont_ref or "")[:120],
            idempotency_key=key[:64],
            ledger_entry_idler=ledger_ids,
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
        kayit.save()
        record_audit(
            actor=actor,
            action="finans.odeme",
            entity_type="OdemeKaydi",
            entity_id=str(kayit.pk),
            success=True,
            detail={
                "tip": OdemeTipi.TL,
                "tl_tutar": str(tl_amount),
                "kur": str(kur_fiyat),
                "kur_kaynagi": kur_kaynagi,
                "ledger_ids": ledger_ids,
            },
        )
        record_finans_audit(
            actor=actor,
            action="finans.odeme.tl",
            amount=tl_amount,
            currency=TRY_KODU,
            order_ref=str(getattr(order, "pk", "") or ""),
            entity_type="OdemeKaydi",
            entity_id=str(kayit.pk),
            success=True,
        )
        return kayit


def elle_tahsilat_tl_bridge(
    *,
    actor,
    order,
    tutar,
    yontem: str,
    aciklama: str = "",
    dekont_ref: str = "",
    idempotency_key: str | None = None,
) -> OdemeKaydi:
    key = (idempotency_key or "").strip() or (
        f"legacy-tahsil-o{order.pk}-{int(timezone.now().timestamp())}"
    )
    return kaydet_odeme(
        actor=actor,
        firma=order.alici_firma,
        tip=OdemeTipi.TL,
        tl_tutar=tutar,
        dekont_ref=dekont_ref or yontem,
        order=order,
        idempotency_key=key[:64],
        manuel_kur_gerekce=aciklama,
    )


def present_odeme(kayit: OdemeKaydi) -> dict:
    return {
        "id": kayit.pk,
        "firma_id": kayit.firma_id,
        "order_id": kayit.order_id,
        "tip": kayit.tip,
        "brut_gram": str(kayit.brut_gram) if kayit.brut_gram is not None else None,
        "olculen_milyem": (
            str(kayit.olculen_milyem) if kayit.olculen_milyem is not None else None
        ),
        "has_karsiligi": str(kayit.has_karsiligi),
        "tl_tutar": str(kayit.tl_tutar) if kayit.tl_tutar is not None else None,
        "kur_has_birim_fiyat": (
            str(kayit.kur_has_birim_fiyat)
            if kayit.kur_has_birim_fiyat is not None
            else None
        ),
        "kur_kaynagi": kayit.kur_kaynagi or None,
        "kur_zamani": kayit.kur_zamani.isoformat() if kayit.kur_zamani else None,
        "dekont_ref": kayit.dekont_ref,
        "ledger_entry_idler": kayit.ledger_entry_idler,
        "olusturma_tarihi": kayit.olusturma_tarihi.isoformat()
        if kayit.olusturma_tarihi
        else None,
    }


def cari_ozet(*, firma: Firma) -> dict:
    platform = ensure_platform_firma()
    rows = {
        r.para_birimi: r
        for r in CariHesap.objects.filter(firma=firma, karsi_firma=platform)
    }
    has = rows.get(HAS_KODU)
    try_ = rows.get(TRY_KODU)
    usd = rows.get(USD_KODU)
    return {
        "firma_id": firma.pk,
        "HAS": {
            "bakiye": str(has.bakiye) if has else "0.0000",
            "anlam": "pozitif = alıcı platforma has borçlu",
        },
        "TRY": {
            "bakiye": str(try_.bakiye) if try_ else "0.00",
            "anlam": "pozitif = alıcı platforma TL borçlu",
        },
        "USD": {
            "bakiye": str(usd.bakiye) if usd else "0.00",
            "anlam": "pozitif = alıcı platforma USD borçlu",
        },
    }
