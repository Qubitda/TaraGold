"""Marj kuralı çözümleme servisi — en dar kapsam kazanır (Kategori → Fiyat Grubu → Satış Kanalı → Tümü)."""

from __future__ import annotations

from decimal import Decimal

from piyasa.models import MarjKurali, PiyasaMarjPolitikasi


def coz_marj_kurali(
    *,
    satis_kanali=None,
    kategori=None,
    fiyat_grubu=None,
) -> MarjKurali | None:
    """En dar kapsamdan globale doğru ilk aktif MarjKurali kaydını döner."""
    # 1. Kategori kapsamı (kendisi -> üst kategorileri)
    if kategori is not None:
        cur = kategori
        seen: set[int] = set()
        for _ in range(12):
            if cur is None or cur.pk in seen:
                break
            seen.add(cur.pk)
            rule = (
                MarjKurali.objects.filter(
                    kapsam=MarjKurali.Kapsam.KATEGORI,
                    kategori_id=cur.pk,
                    aktif=True,
                )
                .order_by("-id")
                .first()
            )
            if rule is not None:
                return rule
            cur = getattr(cur, "ust", None)

    # 2. Fiyat Grubu kapsamı
    eff_fg = fiyat_grubu
    if eff_fg is None and kategori is not None and hasattr(kategori, "etkin_fiyat_grubu"):
        eff_fg = kategori.etkin_fiyat_grubu()
    if eff_fg is None and satis_kanali is not None:
        eff_fg = getattr(satis_kanali, "fiyat_grubu", None)
    if eff_fg is not None:
        rule = (
            MarjKurali.objects.filter(
                kapsam=MarjKurali.Kapsam.FIYAT_GRUBU,
                fiyat_grubu_id=eff_fg.pk,
                aktif=True,
            )
            .order_by("-id")
            .first()
        )
        if rule is not None:
            return rule

    # 3. Satış Kanalı kapsamı
    if satis_kanali is not None:
        rule = (
            MarjKurali.objects.filter(
                kapsam=MarjKurali.Kapsam.SATIS_KANALI,
                satis_kanali_id=satis_kanali.pk,
                aktif=True,
            )
            .order_by("-id")
            .first()
        )
        if rule is not None:
            return rule
        kanal_default = getattr(satis_kanali, "varsayilan_marj_kurali", None)
        if kanal_default is not None and bool(getattr(kanal_default, "aktif", False)):
            return kanal_default

    # 4. Global varsayılan (TUMU)
    global_rule = (
        MarjKurali.objects.filter(
            kapsam=MarjKurali.Kapsam.TUMU,
            aktif=True,
        )
        .order_by("id")
        .first()
    )
    if global_rule is not None:
        return global_rule
    return None


def to_motor_marj(rule: MarjKurali) -> tuple[str, Decimal]:
    """MarjKurali -> fiyat_motoru (marj_tipi, marj_degeri)."""
    if rule.marj_turu == MarjKurali.MarjTuru.GRAM_BASI_SABIT:
        return "TL_GR", Decimal(rule.deger)
    return "YUZDE", Decimal(rule.deger)


def sync_global_politika_from_rule(rule: MarjKurali) -> None:
    if rule.kapsam != MarjKurali.Kapsam.TUMU:
        return
    pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
    pol.marj_modu = (
        PiyasaMarjPolitikasi.MarjModu.TL
        if rule.marj_turu == MarjKurali.MarjTuru.GRAM_BASI_SABIT
        else PiyasaMarjPolitikasi.MarjModu.YUZDE
    )
    pol.marj_orani = rule.deger
    pol.aktif = bool(rule.aktif)
    pol.save(update_fields=["marj_modu", "marj_orani", "aktif", "guncelleme"])


def sync_rule_from_global_politika(pol: PiyasaMarjPolitikasi) -> MarjKurali:
    rule = MarjKurali.objects.filter(kapsam=MarjKurali.Kapsam.TUMU).first()
    marj_turu = (
        MarjKurali.MarjTuru.GRAM_BASI_SABIT
        if pol.marj_modu == PiyasaMarjPolitikasi.MarjModu.TL
        else MarjKurali.MarjTuru.YUZDE
    )
    if rule is None:
        rule = MarjKurali.objects.create(
            ad="Global Varsayılan Marj Kuralı",
            kapsam=MarjKurali.Kapsam.TUMU,
            marj_turu=marj_turu,
            deger=pol.marj_orani,
            aktif=bool(pol.aktif),
        )
    else:
        rule.marj_turu = marj_turu
        rule.deger = pol.marj_orani
        rule.aktif = bool(pol.aktif)
        rule.save(update_fields=["marj_turu", "deger", "aktif", "guncelleme"])
    return rule
