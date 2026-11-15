"""
Saf Python fiyat hesaplama — fiyatlandırma özeti (normatif).

Formül:
- Has gram = Gram × Milyem
- Ham = Has × saf_birim_fiyat
- Satış = Ham + İşçilik + Servis bedeli + Taş + Ek
- Kâr kırılımı = İşçilik + Servis

Kademeli hop: her aşama çıktısı sonraki ham; `hesapla_hop` tekrarlanır.
Birim tipleri: TRL | GRAM | YUZDE | CURRENCY (CURRENCY tutarı çağıran TRY'ye çevirir).
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

ISTENED_HASSASIYET = Decimal("0.01")
ROUNDING = ROUND_HALF_UP

FIYAT_MODELLERI = frozenset({"METAL_BAZLI", "GRAM_BIRIM", "SABIT_PARCA", "HEDEF_TOPLAM"})
BIRIM_TIPLERI = frozenset({"TRL", "GRAM", "YUZDE", "CURRENCY"})
# Geriye dönük alias → özet birim
_MARJ_TO_BIRIM = {
    "YUZDE": "YUZDE",
    "TL_GR": "GRAM",
    "TL_PARCA": "TRL",
}
MARJ_TIPLERI = frozenset({"YUZDE", "TL_GR", "TL_PARCA"}) | BIRIM_TIPLERI


def _d(x) -> Decimal:
    if x is None:
        return Decimal("0")
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def _q(d: Decimal, *, hassasiyet: Decimal = ISTENED_HASSASIYET) -> Decimal:
    return d.quantize(hassasiyet, rounding=ROUNDING)


def _assert_pozitif(ad: str, deger: Decimal, *, sifir_ok: bool = False) -> None:
    if sifir_ok:
        if deger < 0:
            raise ValueError(f"{ad} negatif olamaz.")
    elif deger <= 0:
        raise ValueError(f"{ad} sıfırdan büyük olmalıdır.")


def normalize_birim_tipi(birim_veya_marj: str) -> str:
    b = (birim_veya_marj or "").strip().upper()
    if b in _MARJ_TO_BIRIM:
        return _MARJ_TO_BIRIM[b]
    if b not in BIRIM_TIPLERI:
        raise ValueError(f"Geçersiz birim_tipi: {birim_veya_marj!r}")
    return b


def hesapla_ek_bedel(
    *,
    birim_tipi: str,
    deger: Decimal,
    ham: Decimal,
    gram: Decimal,
) -> Decimal:
    """TRL/GRAM/YUZDE/CURRENCY — CURRENCY degeri zaten hedef PB'de olmalı."""
    tip = normalize_birim_tipi(birim_tipi)
    deger = _d(deger)
    if deger < 0:
        raise ValueError("deger negatif olamaz.")
    ham = _d(ham)
    gram = _d(gram)
    if tip == "YUZDE":
        return ham * (deger / Decimal("100"))
    if tip == "GRAM":
        _assert_pozitif("gram (GRAM birim)", gram)
        return gram * deger
    # TRL | CURRENCY — sabit tutar
    return deger


def hesapla_hop(
    *,
    ham: Decimal,
    ekler: list[tuple[str, str, Decimal]],
    gram: Decimal = Decimal("0"),
    para_birimi: str = "TRY",
    hassasiyet: Decimal | None = None,
) -> dict[str, Any]:
    """
    Tek hop: ham + adlandırılmış ekler → yeni_ham.

    ekler: [(kalem_adi, birim_tipi, deger), ...]
    örn. [("iscilik", "TRL", 100), ("servis_bedeli", "YUZDE", 5)]
    """
    hassasiyet = hassasiyet or ISTENED_HASSASIYET
    ham0 = _d(ham)
    if ham0 < 0:
        raise ValueError("ham negatif olamaz.")
    kalemler: dict[str, Decimal] = {"ham": ham0}
    toplam = ham0
    for ad, birim, deger in ekler:
        tutar = hesapla_ek_bedel(birim_tipi=birim, deger=deger, ham=ham0, gram=gram)
        kalemler[ad] = tutar
        toplam += tutar
    return {
        "para_birimi": para_birimi,
        "kalemler": kalemler,
        "kalemler_yuvarlanmis": {k: _q(v, hassasiyet=hassasiyet) for k, v in kalemler.items()},
        "ham": ham0,
        "yeni_ham": toplam,
        "toplam": toplam,
        "toplam_vergisiz": _q(toplam, hassasiyet=hassasiyet),
        "toplam_yuvarlanmis": _q(toplam, hassasiyet=hassasiyet),
    }


def _marj_hesapla(
    *,
    marj_tipi: str,
    marj_degeri: Decimal,
    taban: Decimal,
    gram: Decimal,
    iscilik: Decimal,
    islcilik_dahil_mi: bool,
) -> tuple[Decimal, Decimal]:
    """Geriye dönük; servis = marj. Döner: (servis, yuzde_taban)."""
    tip = normalize_birim_tipi(marj_tipi)
    marj_degeri = _d(marj_degeri)
    if marj_degeri < 0:
        raise ValueError("marj_degeri negatif olamaz.")
    yuzde_taban = Decimal("0")
    if tip == "YUZDE":
        yuzde_taban = taban + (iscilik if islcilik_dahil_mi else Decimal("0"))
        marj = yuzde_taban * (marj_degeri / Decimal("100"))
    elif tip == "GRAM":
        _assert_pozitif("gram (GRAM marj)", gram)
        marj = gram * marj_degeri
    else:  # TRL | CURRENCY
        marj = marj_degeri
    return marj, yuzde_taban


def hesapla(
    *,
    gram: Decimal,
    milyem: Decimal,
    saf_birim_fiyat: Decimal,
    marj_tipi: str,
    marj_degeri: Decimal,
    iscilik: Decimal = Decimal("0"),
    islcilik_dahil_mi: bool = False,
    tas_bedeli: Decimal = Decimal("0"),
) -> dict:
    gram = _d(gram)
    milyem = _d(milyem)
    saf_birim_fiyat = _d(saf_birim_fiyat)
    iscilik = _d(iscilik)
    tas_bedeli = _d(tas_bedeli)

    _assert_pozitif("gram", gram)
    if milyem <= 0 or milyem > 1:
        raise ValueError("milyem 0 ile 1 arasında (0 hariç, 1 dahil) oran olmalıdır.")
    _assert_pozitif("saf_birim_fiyat", saf_birim_fiyat)
    if iscilik < 0:
        raise ValueError("iscilik negatif olamaz.")
    if tas_bedeli < 0:
        raise ValueError("tas_bedeli negatif olamaz.")

    has_gram = gram * milyem
    metal_bedeli = has_gram * saf_birim_fiyat
    marj, taban = _marj_hesapla(
        marj_tipi=marj_tipi,
        marj_degeri=marj_degeri,
        taban=metal_bedeli,
        gram=gram,
        iscilik=iscilik,
        islcilik_dahil_mi=islcilik_dahil_mi,
    )
    toplam = metal_bedeli + iscilik + marj + tas_bedeli

    return {
        "has_gram": has_gram,
        "metal_bedeli": metal_bedeli,
        "iscilik": iscilik,
        "marj": marj,
        "servis_bedeli": marj,
        "tas_bedeli": tas_bedeli,
        "taban": taban,
        "toplam": toplam,
        "metal_bedeli_yuvarlanmis": _q(metal_bedeli),
        "marj_yuvarlanmis": _q(marj),
        "toplam_yuvarlanmis": _q(toplam),
    }


def _sonuc_paketle(
    *,
    fiyat_modeli: str,
    para_birimi: str,
    kalemler: dict[str, Decimal],
    taban: Decimal,
    hassasiyet: Decimal,
) -> dict[str, Any]:
    # kanal_marj = servis_bedeli alias; toplama iki kez girmez
    toplam_ham = sum(
        (v for k, v in kalemler.items() if k != "kanal_marj"),
        Decimal("0"),
    )
    kalemler_yuvarlanmis = {k: _q(v, hassasiyet=hassasiyet) for k, v in kalemler.items()}
    servis = kalemler.get("servis_bedeli", kalemler.get("kanal_marj", Decimal("0")))
    return {
        "fiyat_modeli": fiyat_modeli,
        "para_birimi": para_birimi,
        "kalemler": kalemler,
        "kalemler_yuvarlanmis": kalemler_yuvarlanmis,
        "taban": taban,
        "toplam": toplam_ham,
        "toplam_vergisiz": _q(toplam_ham, hassasiyet=hassasiyet),
        "toplam_yuvarlanmis": _q(toplam_ham, hassasiyet=hassasiyet),
        "metal_bedeli": kalemler.get("metal", Decimal("0")),
        "iscilik": kalemler.get("iscilik", Decimal("0")),
        "marj": servis,
        "servis_bedeli": servis,
        "tas_bedeli": kalemler.get("tas", Decimal("0")),
        "ek_bedel": kalemler.get("ek_bedel", Decimal("0")),
        "kar": kalemler.get("iscilik", Decimal("0")) + servis,
        "metal_bedeli_yuvarlanmis": kalemler_yuvarlanmis.get("metal", _q(Decimal("0"))),
        "marj_yuvarlanmis": _q(servis),
    }


def hesapla_metal_bazli(
    *,
    gram: Decimal,
    milyem: Decimal,
    saf_birim_fiyat: Decimal,
    marj_tipi: str,
    marj_degeri: Decimal,
    iscilik: Decimal = Decimal("0"),
    islcilik_dahil_mi: bool = False,
    tas_bedeli: Decimal = Decimal("0"),
    ek_bedel: Decimal = Decimal("0"),
    para_birimi: str = "TRY",
    hassasiyet: Decimal | None = None,
) -> dict[str, Any]:
    """METAL_BAZLI — servis_bedeli kalemi üretilir (özet normatif)."""
    hassasiyet = hassasiyet or ISTENED_HASSASIYET
    ek_bedel = _d(ek_bedel)
    if ek_bedel < 0:
        raise ValueError("ek_bedel negatif olamaz.")

    base = hesapla(
        gram=gram,
        milyem=milyem,
        saf_birim_fiyat=saf_birim_fiyat,
        marj_tipi=marj_tipi,
        marj_degeri=marj_degeri,
        iscilik=iscilik,
        islcilik_dahil_mi=islcilik_dahil_mi,
        tas_bedeli=tas_bedeli,
    )
    kalemler = {
        "metal": base["metal_bedeli"],
        "iscilik": base["iscilik"],
        "servis_bedeli": base["servis_bedeli"],
        "kanal_marj": base["servis_bedeli"],  # alias
        "tas": base["tas_bedeli"],
        "ek_bedel": ek_bedel,
    }
    return _sonuc_paketle(
        fiyat_modeli="METAL_BAZLI",
        para_birimi=para_birimi,
        kalemler=kalemler,
        taban=base["taban"],
        hassasiyet=hassasiyet,
    )


def hesapla_gram_birim(
    *,
    gram: Decimal,
    birim_fiyat: Decimal,
    marj_tipi: str,
    marj_degeri: Decimal,
    tas_bedeli: Decimal = Decimal("0"),
    ek_bedel: Decimal = Decimal("0"),
    islcilik_dahil_mi: bool = False,
    para_birimi: str = "TRY",
    hassasiyet: Decimal | None = None,
) -> dict[str, Any]:
    hassasiyet = hassasiyet or ISTENED_HASSASIYET
    gram = _d(gram)
    birim_fiyat = _d(birim_fiyat)
    tas_bedeli = _d(tas_bedeli)
    ek_bedel = _d(ek_bedel)

    _assert_pozitif("gram", gram)
    _assert_pozitif("birim_fiyat", birim_fiyat)
    if tas_bedeli < 0 or ek_bedel < 0:
        raise ValueError("tas_bedeli/ek_bedel negatif olamaz.")

    gram_birim = gram * birim_fiyat
    marj, taban = _marj_hesapla(
        marj_tipi=marj_tipi,
        marj_degeri=marj_degeri,
        taban=gram_birim,
        gram=gram,
        iscilik=Decimal("0"),
        islcilik_dahil_mi=False,
    )
    del islcilik_dahil_mi
    kalemler = {
        "gram_birim": gram_birim,
        "servis_bedeli": marj,
        "kanal_marj": marj,
        "tas": tas_bedeli,
        "ek_bedel": ek_bedel,
    }
    return _sonuc_paketle(
        fiyat_modeli="GRAM_BIRIM",
        para_birimi=para_birimi,
        kalemler=kalemler,
        taban=taban,
        hassasiyet=hassasiyet,
    )


def hesapla_sabit_parca(
    *,
    birim_fiyat: Decimal,
    marj_tipi: str,
    marj_degeri: Decimal,
    gram: Decimal | None = None,
    tas_bedeli: Decimal = Decimal("0"),
    ek_bedel: Decimal = Decimal("0"),
    para_birimi: str = "TRY",
    hassasiyet: Decimal | None = None,
) -> dict[str, Any]:
    hassasiyet = hassasiyet or ISTENED_HASSASIYET
    birim_fiyat = _d(birim_fiyat)
    tas_bedeli = _d(tas_bedeli)
    ek_bedel = _d(ek_bedel)
    gram_d = _d(gram) if gram is not None else Decimal("0")

    _assert_pozitif("birim_fiyat", birim_fiyat)
    if tas_bedeli < 0 or ek_bedel < 0:
        raise ValueError("tas_bedeli/ek_bedel negatif olamaz.")

    sabit_parca = birim_fiyat
    marj, taban = _marj_hesapla(
        marj_tipi=marj_tipi,
        marj_degeri=marj_degeri,
        taban=sabit_parca,
        gram=gram_d,
        iscilik=Decimal("0"),
        islcilik_dahil_mi=False,
    )
    kalemler = {
        "sabit_parca": sabit_parca,
        "servis_bedeli": marj,
        "kanal_marj": marj,
        "tas": tas_bedeli,
        "ek_bedel": ek_bedel,
    }
    return _sonuc_paketle(
        fiyat_modeli="SABIT_PARCA",
        para_birimi=para_birimi,
        kalemler=kalemler,
        taban=taban,
        hassasiyet=hassasiyet,
    )


def hesapla_hedef_toplam(
    *,
    hedef_toplam: Decimal,
    gram: Decimal,
    para_birimi: str = "TRY",
    hassasiyet: Decimal | None = None,
) -> dict[str, Any]:
    hassasiyet = hassasiyet or ISTENED_HASSASIYET
    hedef = _d(hedef_toplam)
    gram = _d(gram)
    _assert_pozitif("hedef_toplam", hedef)
    _assert_pozitif("gram", gram)
    kalemler = {"hedef_toplam": hedef}
    return _sonuc_paketle(
        fiyat_modeli="HEDEF_TOPLAM",
        para_birimi=para_birimi,
        kalemler=kalemler,
        taban=hedef,
        hassasiyet=hassasiyet,
    )


def hesapla_iki_hop(
    *,
    fiyat_modeli: str,
    hop1_kwargs: dict[str, Any],
    servis_birim: str,
    servis_deger: Decimal,
    gram: Decimal,
) -> dict[str, Any]:
    """
    Hop1: platform satış (metal/işçilik/taş/ek; servis=0).
    Hop2: kanal servis bedeli → alıcı fiyatı.
    """
    # Hop1: marj/servis sıfır — yalnız maliyet + işçilik katmanı
    k1 = dict(hop1_kwargs)
    k1["marj_tipi"] = "TRL"
    k1["marj_degeri"] = Decimal("0")
    platform = hesapla_modele_gore(fiyat_modeli, **k1)
    platform_satis = platform["toplam"]
    hop2 = hesapla_hop(
        ham=platform_satis,
        ekler=[("servis_bedeli", servis_birim, servis_deger)],
        gram=_d(gram),
        para_birimi=platform.get("para_birimi", "TRY"),
    )
    # Birleşik kalemler (alıcı görünümü)
    kalemler = dict(platform["kalemler"])
    kalemler["servis_bedeli"] = hop2["kalemler"]["servis_bedeli"]
    kalemler["kanal_marj"] = hop2["kalemler"]["servis_bedeli"]
    hassasiyet = ISTENED_HASSASIYET
    return {
        **_sonuc_paketle(
            fiyat_modeli=fiyat_modeli,
            para_birimi=platform.get("para_birimi", "TRY"),
            kalemler=kalemler,
            taban=platform_satis,
            hassasiyet=hassasiyet,
        ),
        "hop1_platform_satis": platform_satis,
        "hop2": hop2,
        "kar": _d(kalemler.get("iscilik", 0)) + hop2["kalemler"]["servis_bedeli"],
    }


def hesapla_modele_gore(fiyat_modeli: str, **kwargs) -> dict[str, Any]:
    if fiyat_modeli not in FIYAT_MODELLERI:
        raise ValueError(f"Geçersiz fiyat_modeli: {fiyat_modeli!r}")
    if fiyat_modeli == "METAL_BAZLI":
        return hesapla_metal_bazli(**kwargs)
    if fiyat_modeli == "GRAM_BIRIM":
        return hesapla_gram_birim(**kwargs)
    if fiyat_modeli == "HEDEF_TOPLAM":
        return hesapla_hedef_toplam(**kwargs)
    return hesapla_sabit_parca(**kwargs)
