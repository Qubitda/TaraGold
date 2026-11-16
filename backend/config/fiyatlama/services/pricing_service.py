"""PricingService.quote / lock_quote — VaryantFiyat + 2 hop (özet normatif).

Hop1: platform satış (metal/işçilik/taş/ek).
Hop2: kanal servis bedeli → alıcı fiyatı.
PriceLock: geçerli quote referansı; yeniden hesap yok.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError
from django.utils import timezone

from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import has_perm, is_platform_firm_user
from fiyatlama.models import (
    FiyatSozlesmesi,
    PriceLock,
    PriceQuote,
    PriceQuoteLine,
    VaryantFiyat,
)
from fiyatlama.models.sozlesme_cozumleme import (
    CokluSozlesmeHatasi,
    SozlesmeYokHatasi,
    cozumle,
)
from fiyatlama.services import fiyat_hesaplama, fiyat_motoru
from fiyatlama.services.servis_bedeli_servisi import coz_servis_bedeli, to_motor_servis
from fiyatlama.services.varyant_fiyat_servisi import require_aktif
from piyasa.services.marj_cozumleme import coz_marj_kurali, to_motor_marj
from tanimlar.models import KurTaraf
from tanimlar.services import currency_conversion, kur_servisi

_ZERO = Decimal("0")


def _d(x) -> Decimal:
    if x is None:
        return _ZERO
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def _assert_yayinli_varyant(varyant) -> None:
    urun = varyant.urun
    if getattr(urun, "yayin_durumu", None) != "aktif":
        raise ValidationError("Ürün yayında değil; quote üretilemez.")
    if getattr(urun, "onay_durumu", None) != "onayli":
        raise ValidationError("Ürün onaylı değil; quote üretilemez.")
    if not getattr(varyant, "aktif", True):
        raise ValidationError("Varyant aktif değil; quote üretilemez.")


def _cevir_try_hedefe(
    tutar_try: Decimal,
    *,
    hedef_pb: str,
    now,
) -> tuple[Decimal, list[int]]:
    if hedef_pb.upper() == "TRY":
        return _d(tutar_try), []
    conv = currency_conversion.convert(
        tutar_try,
        kaynak_pb="TRY",
        hedef_pb=hedef_pb,
        taraf=KurTaraf.ALICI,
        now=now,
    )
    return conv.tutar, list(conv.gozlem_idler)


def _assert_ttl_vs_kur(ttl: int, gozlemler) -> None:
    max_list = []
    for g in gozlemler:
        if g is None:
            continue
        sag = getattr(g, "saglayici", None)
        if sag is not None:
            max_list.append(int(sag.max_gecikme_saniye))
    if not max_list:
        return
    limit = min(max_list)
    if ttl > limit:
        raise ValidationError(
            {
                "quote_ttl_saniye": (
                    f"Kanal TTL ({ttl}s) kur max gecikmesini ({limit}s) aşıyor; "
                    "quote üretilemez (B-03)."
                )
            }
        )


def quote(
    *,
    alici_firma,
    satis_kanali,
    varyant,
    kullanici=None,
    teklif_id: int | None = None,  # deprecated ignored
    para_birimi: str = "TRY",
    hedef_toplam: Decimal | None = None,
    hesap_girdisi_extra: dict[str, Any] | None = None,
    now=None,
) -> PriceQuote:
    del teklif_id  # teklif kaldırıldı
    now = now or timezone.now()
    bugun = timezone.localdate(now) if timezone.is_aware(now) else now.date()
    hedef_pb = (para_birimi or "TRY").upper()

    _assert_yayinli_varyant(varyant)
    ttl = kur_servisi.kanal_quote_ttl_saniye(satis_kanali)

    urun = varyant.urun
    # Metal varyant: doğrudan varyant.ayar (ADR-0044 / FAZ 1). TAS metal yolu yok.
    tip = getattr(varyant, "tip", None) or "HAM_ALTIN"
    if tip == "TAS":
        ayar = None
    else:
        ayar = getattr(varyant, "ayar", None)
        if ayar is None and getattr(varyant, "ayar_id", None):
            from tanimlar.models import AyarMilyem

            ayar = AyarMilyem.objects.filter(pk=varyant.ayar_id).first()
        if ayar is None:
            raise ValidationError(
                "Metal varyantında ayar zorunlu; fiyat hesaplanamaz."
            )
    metal = ayar.metal if ayar is not None else None
    milyem = ayar.milyem if ayar is not None else None

    from tanimlar.services.kaynak_resolve import etkin_kaynak as _etkin_kaynak

    kaynak = _etkin_kaynak(urun=urun)
    metal_alici = None
    metal_tedarikci = None
    feed_meta = None
    if metal is not None and getattr(metal, "gram_bazli", False):
        detay = kur_servisi.resolve_metal_kuru_detay(
            metal, taraf=KurTaraf.ALICI, now=now, etkin_kaynak=kaynak
        )
        metal_alici = detay.gozlem
        feed_meta = detay
        metal_tedarikci = kur_servisi.resolve_metal_kuru(
            metal, taraf=KurTaraf.TEDARIKCI, now=now, etkin_kaynak=kaynak
        )

    vf = require_aktif(varyant)

    try:
        alici_kalem = cozumle(
            firma=alici_firma,
            kontrat_tipi=FiyatSozlesmesi.KontratTipi.ALICI,
            tarih=bugun,
            metal=metal,
            ayar=ayar,
            satis_kanali=satis_kanali,
        )
    except SozlesmeYokHatasi as exc:
        raise ValidationError("Alıcı fiyat sözleşmesi çözülemedi; quote yok.") from exc
    except CokluSozlesmeHatasi as exc:
        raise ValidationError("Alıcı sözleşme belirsiz (eşit skor); quote yok.") from exc

    alici_sozlesme = alici_kalem.sozlesme

    tedarikci_kalem = None
    tedarikci_sozlesme = None
    try:
        tedarikci_kalem = cozumle(
            firma=vf.tedarikci,
            kontrat_tipi=FiyatSozlesmesi.KontratTipi.TEDARIKCI,
            tarih=bugun,
            metal=metal,
            ayar=ayar,
            satis_kanali=satis_kanali,
        )
        tedarikci_sozlesme = tedarikci_kalem.sozlesme
    except SozlesmeYokHatasi:
        tedarikci_kalem = None
        tedarikci_sozlesme = None
    except CokluSozlesmeHatasi as exc:
        raise ValidationError("Tedarikçi sözleşme belirsiz; quote yok.") from exc

    gram = vf.gram if vf.gram is not None else varyant.gram
    if gram is None and vf.fiyat_modeli != VaryantFiyat.FiyatModeli.SABIT_PARCA:
        raise ValidationError("Gram tanımlı değil; quote üretilemez.")

    tas_try = _d(vf.tas_bedeli)
    ek_try = _d(vf.ek_bedel) + _d(getattr(varyant, "ek_bedel", None))
    tas_hedef, tas_ids = _cevir_try_hedefe(tas_try, hedef_pb=hedef_pb, now=now)
    ek_hedef, ek_ids = _cevir_try_hedefe(ek_try, hedef_pb=hedef_pb, now=now)

    saf_birim_hedef = None
    metal_fx_ids: list[int] = []
    if vf.fiyat_modeli == VaryantFiyat.FiyatModeli.METAL_BAZLI:
        if metal_alici is None or milyem is None:
            raise ValidationError("METAL_BAZLI için metal kuru / ayar milyem zorunlu.")
        saf_try = _d(metal_alici.saf_birim_fiyat)
        saf_birim_hedef, metal_fx_ids = _cevir_try_hedefe(
            saf_try, hedef_pb=hedef_pb, now=now
        )

    iscilik = _d(vf.iscilik)
    if iscilik == 0 and tedarikci_kalem is not None:
        iscilik = _d(tedarikci_kalem.iscilik)
    iscilik_hedef, isc_ids = _cevir_try_hedefe(iscilik, hedef_pb=hedef_pb, now=now)

    doviz_ids = list(dict.fromkeys(tas_ids + ek_ids + metal_fx_ids + isc_ids))
    gozlemler = [metal_alici, metal_tedarikci]
    _assert_ttl_vs_kur(ttl, gozlemler)

    try:
        sag = kur_servisi.aktif_saglayici()
        if ttl > sag.max_gecikme_saniye:
            raise ValidationError(
                {
                    "quote_ttl_saniye": (
                        f"Kanal TTL ({ttl}s) aktif sağlayıcı max gecikmesini "
                        f"({sag.max_gecikme_saniye}s) aşıyor; quote yok (B-03)."
                    )
                }
            )
    except kur_servisi.KurYokError:
        raise ValidationError("Aktif kur sağlayıcı yok; quote üretilemez.")

    # Servis bedeli: özet matrisi; yoksa MarjKurali (deger>0) / alıcı kalem fallback
    servis_kural = coz_servis_bedeli(
        satis_kanali=satis_kanali, tedarikci=vf.tedarikci, tarih=bugun
    )
    if servis_kural is not None and _d(servis_kural.deger) > 0:
        servis_birim, servis_deger = to_motor_servis(servis_kural)
    else:
        marj_kurali = coz_marj_kurali(
            satis_kanali=satis_kanali,
            kategori=getattr(urun, "kategori", None),
        )
        if marj_kurali is not None and _d(marj_kurali.deger) > 0:
            tip, deger = to_motor_marj(marj_kurali)
            servis_birim = fiyat_hesaplama.normalize_birim_tipi(tip)
            servis_deger = deger
        else:
            servis_birim = fiyat_hesaplama.normalize_birim_tipi(alici_kalem.marj_tipi)
            servis_deger = _d(alici_kalem.marj_degeri)
            servis_kural = None

    quote_fiyat_modeli = vf.fiyat_modeli
    maliyet_referans = None

    hop1_kwargs: dict[str, Any] = {
        "para_birimi": hedef_pb,
        "tas_bedeli": tas_hedef,
        "ek_bedel": ek_hedef,
    }

    if hedef_toplam is not None:
        pano_bag = bool(
            hesap_girdisi_extra and hesap_girdisi_extra.get("pano_baglama")
        )
        yetkili = (
            kullanici is not None
            and is_platform_firm_user(kullanici)
            and (
                has_perm(kullanici, P["manage_sozlesme"])
                or (pano_bag and has_perm(kullanici, P["manage_piyasa"]))
            )
        )
        if not yetkili:
            raise PermissionDenied(
                "HEDEF_TOPLAM quote için platform manage_sozlesme gerekir."
            )
        hedef_n = _d(hedef_toplam)
        if hedef_n <= 0:
            raise ValidationError({"hedef_toplam": "Pozitif olmalı."})
        if gram is None or _d(gram) <= 0:
            raise ValidationError("HEDEF_TOPLAM için gram zorunlu.")
        sonuc = fiyat_hesaplama.hesapla_hedef_toplam(
            hedef_toplam=hedef_n,
            gram=_d(gram),
            para_birimi=hedef_pb,
        )
        quote_fiyat_modeli = "HEDEF_TOPLAM"
    else:
        if vf.fiyat_modeli == VaryantFiyat.FiyatModeli.METAL_BAZLI:
            hop1_kwargs.update(
                gram=gram,
                milyem=milyem,
                saf_birim_fiyat=saf_birim_hedef,
                iscilik=iscilik_hedef,
                islcilik_dahil_mi=bool(alici_kalem.islcilik_dahil_mi),
            )
        elif vf.fiyat_modeli == VaryantFiyat.FiyatModeli.GRAM_BIRIM:
            hop1_kwargs.update(
                gram=gram,
                birim_fiyat=vf.birim_fiyat,
                birim_fiyat_pb=vf.para_birimi,
            )
            # GRAM_BIRIM uses fiyat_motoru for PB convert then iki_hop
            base = fiyat_motoru.hesapla_teklif_kalemleri(
                fiyat_modeli=vf.fiyat_modeli,
                hedef_para_birimi=hedef_pb,
                gram=gram,
                birim_fiyat=vf.birim_fiyat,
                birim_fiyat_pb=vf.para_birimi,
                marj_tipi="TRL",
                marj_degeri=_ZERO,
                tas_bedeli=tas_hedef,
                ek_bedel=ek_hedef,
                taraf=KurTaraf.ALICI,
                now=now,
            )
            platform_satis = base["toplam"]
            hop2 = fiyat_hesaplama.hesapla_hop(
                ham=platform_satis,
                ekler=[("servis_bedeli", servis_birim, servis_deger)],
                gram=_d(gram or 0),
                para_birimi=hedef_pb,
            )
            kalemler = dict(base["kalemler"])
            kalemler["servis_bedeli"] = hop2["kalemler"]["servis_bedeli"]
            kalemler["kanal_marj"] = hop2["kalemler"]["servis_bedeli"]
            sonuc = fiyat_hesaplama._sonuc_paketle(
                fiyat_modeli=vf.fiyat_modeli,
                para_birimi=hedef_pb,
                kalemler=kalemler,
                taban=platform_satis,
                hassasiyet=fiyat_hesaplama.ISTENED_HASSASIYET,
            )
            sonuc["hop1_platform_satis"] = platform_satis
            sonuc["hop2"] = hop2
        elif vf.fiyat_modeli == VaryantFiyat.FiyatModeli.SABIT_PARCA:
            base = fiyat_motoru.hesapla_teklif_kalemleri(
                fiyat_modeli=vf.fiyat_modeli,
                hedef_para_birimi=hedef_pb,
                gram=gram,
                birim_fiyat=vf.birim_fiyat,
                birim_fiyat_pb=vf.para_birimi,
                marj_tipi="TRL",
                marj_degeri=_ZERO,
                tas_bedeli=tas_hedef,
                ek_bedel=ek_hedef,
                taraf=KurTaraf.ALICI,
                now=now,
            )
            platform_satis = base["toplam"]
            hop2 = fiyat_hesaplama.hesapla_hop(
                ham=platform_satis,
                ekler=[("servis_bedeli", servis_birim, servis_deger)],
                gram=_d(gram or 0),
                para_birimi=hedef_pb,
            )
            kalemler = dict(base["kalemler"])
            kalemler["servis_bedeli"] = hop2["kalemler"]["servis_bedeli"]
            kalemler["kanal_marj"] = hop2["kalemler"]["servis_bedeli"]
            sonuc = fiyat_hesaplama._sonuc_paketle(
                fiyat_modeli=vf.fiyat_modeli,
                para_birimi=hedef_pb,
                kalemler=kalemler,
                taban=platform_satis,
                hassasiyet=fiyat_hesaplama.ISTENED_HASSASIYET,
            )
            sonuc["hop1_platform_satis"] = platform_satis
            sonuc["hop2"] = hop2
        else:
            raise ValidationError(f"Bilinmeyen fiyat_modeli: {vf.fiyat_modeli}")

        if vf.fiyat_modeli == VaryantFiyat.FiyatModeli.METAL_BAZLI:
            sonuc = fiyat_hesaplama.hesapla_iki_hop(
                fiyat_modeli=vf.fiyat_modeli,
                hop1_kwargs=hop1_kwargs,
                servis_birim=servis_birim,
                servis_deger=servis_deger,
                gram=_d(gram or 0),
            )

    gecerlilik_sonu = now + timedelta(seconds=ttl)
    alici_kur_tipi = kur_servisi.tarafa_kur_tipi(KurTaraf.ALICI)
    tedarikci_kur_tipi = kur_servisi.tarafa_kur_tipi(KurTaraf.TEDARIKCI)

    hesap_girdisi: dict[str, Any] = {
        "fiyat_modeli": quote_fiyat_modeli,
        "gram": str(gram) if gram is not None else None,
        "milyem": str(milyem) if milyem is not None else None,
        "servis_birim": servis_birim,
        "servis_deger": str(servis_deger),
        "servis_kural_id": servis_kural.pk if servis_kural else None,
        "varyant_fiyat_id": vf.pk,
        "varyant_fiyat_versiyon": vf.versiyon,
        "alici_kalem_id": alici_kalem.pk,
        "tedarikci_kalem_id": tedarikci_kalem.pk if tedarikci_kalem else None,
        "kalemler_ham": {k: str(v) for k, v in sonuc["kalemler"].items()},
        "toplam_vergisiz": str(sonuc["toplam_vergisiz"]),
        "hop1_platform_satis": str(sonuc.get("hop1_platform_satis", "")),
        "kar": str(sonuc.get("kar", "")),
        "belge_turu": "PROFORMA",
        "vergi": None,
        "etkin_fiyat_kaynagi": kaynak,
    }
    if feed_meta is not None:
        hesap_girdisi["feed_health"] = feed_meta.feed_health
        hesap_girdisi["feed_banner"] = feed_meta.banner
        hesap_girdisi["feed_is_lkg"] = feed_meta.is_lkg
    if hesap_girdisi_extra:
        for k, v in hesap_girdisi_extra.items():
            if k not in hesap_girdisi:
                hesap_girdisi[k] = v

    with domain_atomic():
        pq = PriceQuote(
            alici_firma=alici_firma,
            satis_kanali=satis_kanali,
            varyant=varyant,
            varyant_fiyat=vf,
            fiyat_kaynagi_versiyon=vf.versiyon,
            fiyat_modeli=quote_fiyat_modeli,
            alici_sozlesme=alici_sozlesme,
            alici_sozlesme_versiyon=alici_sozlesme.versiyon,
            alici_kalem=alici_kalem,
            tedarikci_sozlesme=tedarikci_sozlesme,
            tedarikci_sozlesme_versiyon=(
                tedarikci_sozlesme.versiyon if tedarikci_sozlesme else None
            ),
            tedarikci_kalem=tedarikci_kalem,
            para_birimi=hedef_pb,
            toplam_vergisiz=sonuc["toplam_vergisiz"],
            gram=gram,
            gecerlilik_sonu=gecerlilik_sonu,
            hesap_zamani=now,
            quote_ttl_saniye=ttl,
            alici_kur_tipi=alici_kur_tipi,
            tedarikci_kur_tipi=tedarikci_kur_tipi,
            metal_kuru_alici=metal_alici,
            metal_kuru_tedarikci=metal_tedarikci,
            doviz_gozlem_idler=doviz_ids,
            hesap_girdisi=hesap_girdisi,
            belge_turu=PriceQuote.BelgeTuru.PROFORMA,
            olusturan=kullanici,
        )
        pq.save()
        allowed = {c.value for c in PriceQuoteLine.KalemTipi}
        sira = 0
        for tip, tutar in sonuc["kalemler_yuvarlanmis"].items():
            if tip == "kanal_marj" and "servis_bedeli" in sonuc["kalemler_yuvarlanmis"]:
                continue
            if tip == "ham":
                continue
            kalem = "servis_bedeli" if tip == "kanal_marj" else tip
            if kalem not in allowed:
                continue
            PriceQuoteLine.objects.create(
                quote=pq,
                kalem_tipi=kalem,
                tutar=tutar,
                sira=sira,
            )
            sira += 1
        record_audit(
            actor=kullanici,
            action="price_quote.create",
            entity_type="PriceQuote",
            entity_id=str(pq.pk),
            success=True,
            detail={"varyant_fiyat_id": vf.pk, "toplam": str(pq.toplam_vergisiz)},
        )
    return pq


def expire_price_lock(lock: PriceLock, *, now=None, actor=None) -> PriceLock:
    now = now or timezone.now()
    if lock.durum != PriceLock.Durum.AKTIF:
        return lock
    if now < lock.gecerlilik_sonu:
        return lock
    with domain_atomic():
        locked = (
            PriceLock.objects.select_for_update()
            .filter(pk=lock.pk, durum=PriceLock.Durum.AKTIF)
            .first()
        )
        if locked is None:
            lock.refresh_from_db()
            return lock
        if now < locked.gecerlilik_sonu:
            return locked
        locked.durum = PriceLock.Durum.SURESI_DOLDU
        locked.save(update_fields=["durum"])
        record_audit(
            actor=actor,
            action="price_lock.expire",
            entity_type="PriceLock",
            entity_id=str(locked.pk),
            success=True,
            detail={"gecerlilik_sonu": locked.gecerlilik_sonu.isoformat()},
        )
    lock.refresh_from_db()
    return lock


def lock_quote(
    quote: PriceQuote,
    *,
    kullanici=None,
    now=None,
    idempotency_key: str | None = None,
) -> PriceLock:
    del idempotency_key  # quote OneToOne; key checkout audit için taşınır
    now = now or timezone.now()
    if quote.gecerlilik_sonu <= now:
        record_audit_durable(
            actor=kullanici,
            action="price_lock.create",
            entity_type="PriceLock",
            entity_id="",
            success=False,
            reason="Quote süresi dolmuş",
            detail={"quote_id": quote.pk, "gecerlilik_sonu": quote.gecerlilik_sonu.isoformat()},
        )
        raise ValidationError("Quote süresi dolmuş; kilitlenemez.")

    try:
        with domain_atomic():
            pq = (
                PriceQuote.objects.select_for_update()
                .filter(pk=quote.pk)
                .first()
            )
            if pq is None:
                raise ValidationError("Quote bulunamadı.")
            if pq.gecerlilik_sonu <= now:
                raise ValidationError("Quote süresi dolmuş; kilitlenemez.")
            mevcut = getattr(pq, "price_lock", None)
            if mevcut is not None:
                if (
                    mevcut.durum == PriceLock.Durum.AKTIF
                    and now < mevcut.gecerlilik_sonu
                ):
                    return mevcut
            lock = PriceLock(
                quote=pq,
                alici_firma=pq.alici_firma,
                gecerlilik_sonu=pq.gecerlilik_sonu,
                durum=PriceLock.Durum.AKTIF,
                olusturan=kullanici,
            )
            lock.full_clean()
            lock.save()
            record_audit(
                actor=kullanici,
                action="price_lock.create",
                entity_type="PriceLock",
                entity_id=str(lock.pk),
                success=True,
                detail={"quote_id": pq.pk},
            )
            return lock
    except IntegrityError:
        existing = PriceLock.objects.filter(quote_id=quote.pk).first()
        if existing is not None:
            return existing
        raise
    except ValidationError as exc:
        record_audit_durable(
            actor=kullanici,
            action="price_lock.create",
            entity_type="PriceLock",
            entity_id="",
            success=False,
            reason=str(exc),
            detail={"quote_id": quote.pk},
        )
        raise
