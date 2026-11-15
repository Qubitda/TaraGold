"""Piyasa panosu saf hesap — Django yok.

Katman 1 (pano, ADR-0039):
  ham = ölçek×PB formülü (GRAM/ONS/KG × TRY/USD) veya ayrı bid/ask ham
  nihai_alis  = ham_alis  + marj (TL)  veya  ham_alis  × (1 + marj/100) (%)
  nihai_satis = ham_satis + marj (TL)  veya  ham_satis × (1 + marj/100) (%)
  Marj işaretli (negatif izinli). Doğrulama: nihai_alis > 0 ve nihai_satis ≥ nihai_alis.

Katman 2 (kullanıcı ekleri, isteğe bağlı): baz birimin üstüne ek; bazı değiştirmez.
"""

from __future__ import annotations

from decimal import (
    ROUND_CEILING,
    ROUND_FLOOR,
    ROUND_HALF_UP,
    Decimal,
)
from typing import Any

ALIS = "ALIS"
SATIS = "SATIS"
TL = "TL"
YUZDE = "YUZDE"
YOK = "YOK"
PB_GRAM = "PB_GRAM"
PB_ADET = "PB_ADET"
YAKIN = "YAKIN"
YUKARI = "YUKARI"
ASAGI = "ASAGI"
GRAM = "GRAM"
ONS = "ONS"
KG = "KG"
TRY = "TRY"
USD = "USD"

TARAFLAR = frozenset({ALIS, SATIS})
MARJ_MODLARI = frozenset({TL, YUZDE})
TIPLER = frozenset({YOK, YUZDE, PB_GRAM, PB_ADET})
OLCEKLER = frozenset({GRAM, ONS, KG})
CIKTI_PB = frozenset({TRY, USD})
HASSASIYET = Decimal("0.01")
_SIFIR = Decimal("0")
_YUZ = Decimal("100")
_BIN = Decimal("1000")
# tanimlar.fiyat_kaynagi.TROY_OZ_GRAM ile aynı (Django’suz kopya)
TROY_OZ_GRAM = Decimal("31.1035")
_YUVARLAMA = {YAKIN: ROUND_HALF_UP, YUKARI: ROUND_CEILING, ASAGI: ROUND_FLOOR}


def _d(x) -> Decimal:
    if x is None:
        return _SIFIR
    return x if isinstance(x, Decimal) else Decimal(str(x))


def _q(d: Decimal, hassasiyet: Decimal = HASSASIYET) -> Decimal:
    return d.quantize(hassasiyet, rounding=ROUND_HALF_UP)


def yuvarla(deger, adim, yontem: str = YAKIN) -> Decimal:
    deger, adim = _d(deger), _d(adim)
    if adim <= 0:
        return deger
    if yontem not in _YUVARLAMA:
        raise ValueError(f"Geçersiz yuvarlama yöntemi: {yontem!r}")
    return (deger / adim).quantize(Decimal(1), rounding=_YUVARLAMA[yontem]) * adim


def uygula_pano_marj(
    ham,
    *,
    taraf: str,
    marj_modu: str,
    alis_marj=0,
    satis_marj=0,
) -> Decimal:
    """ADR-0039: marj iki tarafa da eklenir; işaretli (negatif izinli).

    TL:   nihai = ham + marj
    %:    nihai = ham × (1 + marj/100)
    """
    if taraf not in TARAFLAR:
        raise ValueError(f"Geçersiz taraf: {taraf!r}")
    if marj_modu not in MARJ_MODLARI:
        raise ValueError(f"Geçersiz marj modu: {marj_modu!r}")
    ham = _d(ham)
    marj = _d(alis_marj if taraf == ALIS else satis_marj)
    if marj_modu == TL:
        return ham + marj
    # YUZDE — ham × (1 + marj/100); marj ≤ -100 yasak (sıfır/negatif çarpan)
    if marj <= -_YUZ:
        raise ValueError("Yüzde marjı -100'den büyük olmalı.")
    return ham * (_YUZ + marj) / _YUZ


def dogrula_nihai_cift(nihai_alis, nihai_satis) -> None:
    """Kayıt/önizleme kapısı: alış > 0 ve satış ≥ alış."""
    alis = _d(nihai_alis)
    satis = _d(nihai_satis)
    if alis <= 0:
        raise ValueError("Nihai alış sıfırdan büyük olmalı.")
    if satis < alis:
        raise ValueError("Nihai satış, nihai alıştan küçük olamaz.")


def gram_try_from_ons(
    *,
    ons_bid,
    ons_ask,
    usdtry_bid,
    usdtry_ask,
    troy_oz_gram=TROY_OZ_GRAM,
) -> dict[str, Decimal]:
    """En kötü makas: gram_alis = ons_bid/oz × usdtry_bid; gram_satis = ons_ask/oz × usdtry_ask."""
    oz = _d(troy_oz_gram)
    if oz <= 0:
        raise ValueError("troy_oz_gram pozitif olmalı.")
    bid_ons, ask_ons = _d(ons_bid), _d(ons_ask)
    bid_fx, ask_fx = _d(usdtry_bid), _d(usdtry_ask)
    if bid_ons <= 0 or ask_ons <= 0 or bid_fx <= 0 or ask_fx <= 0:
        raise ValueError("Ons ve USDTRY bid/ask pozitif olmalı.")
    if bid_ons > ask_ons or bid_fx > ask_fx:
        raise ValueError("Ters makas (bid > ask) reddedildi.")
    return {
        "gram_alis": bid_ons / oz * bid_fx,
        "gram_satis": ask_ons / oz * ask_fx,
    }


def hesapla_ham(
    *,
    saf_birim_fiyat,
    milyem,
    miktar,
    olcek: str = GRAM,
    cikti_pb: str = TRY,
    usd_try=None,
) -> Decimal:
    """Ölçek + çıktı PB → ham (marj öncesi). saf = TRY/gram metal kuru."""
    olcek = (olcek or GRAM).upper()
    cikti_pb = (cikti_pb or TRY).upper()
    if olcek not in OLCEKLER:
        raise ValueError(f"Geçersiz olcek: {olcek!r}")
    if cikti_pb not in CIKTI_PB:
        raise ValueError(f"Geçersiz cikti_pb: {cikti_pb!r}")
    saf = _d(saf_birim_fiyat)
    milyem = _d(milyem)
    miktar = _d(miktar)
    if saf <= 0:
        raise ValueError("saf_birim_fiyat sıfırdan büyük olmalı.")
    if not (_SIFIR < milyem <= 1):
        raise ValueError("milyem (0, 1] aralığında olmalı.")
    if miktar <= 0:
        raise ValueError("miktar sıfırdan büyük olmalı.")

    if olcek == GRAM:
        ham_try = saf * milyem * miktar
    elif olcek == KG:
        ham_try = saf * milyem * _BIN * miktar
    else:  # ONS
        ham_try = saf * TROY_OZ_GRAM * milyem * miktar

    if cikti_pb == TRY:
        return ham_try
    usd = _d(usd_try)
    if usd <= 0:
        raise ValueError("USD çıktı için usd_try (TRY/USD) zorunlu ve pozitif.")
    return ham_try / usd


def hesapla_taraf(
    *,
    taraf: str,
    saf_birim_fiyat,
    milyem,
    gram,
    marj_modu: str = YUZDE,
    alis_marj=0,
    satis_marj=0,
    yuvarlama_adimi=0,
    yuvarlama_yontemi: str = YAKIN,
    olcek: str = GRAM,
    cikti_pb: str = TRY,
    usd_try=None,
    hassasiyet: Decimal = HASSASIYET,
) -> dict[str, Any]:
    """Ham → pano marjı → yuvarlama → nihai (tek taraf)."""
    if taraf not in TARAFLAR:
        raise ValueError(f"Geçersiz taraf: {taraf!r}")

    ham = hesapla_ham(
        saf_birim_fiyat=saf_birim_fiyat,
        milyem=milyem,
        miktar=gram,
        olcek=olcek,
        cikti_pb=cikti_pb,
        usd_try=usd_try,
    )
    marjli = uygula_pano_marj(
        ham,
        taraf=taraf,
        marj_modu=marj_modu,
        alis_marj=alis_marj,
        satis_marj=satis_marj,
    )
    nihai = yuvarla(marjli, yuvarlama_adimi, yuvarlama_yontemi)
    if taraf == ALIS and nihai <= 0:
        raise ValueError("Nihai alış ≤ 0; marj/yuvarlama kontrol edin.")
    if taraf == SATIS and nihai <= 0:
        raise ValueError("Nihai satış ≤ 0; marj/yuvarlama kontrol edin.")

    return {
        "taraf": taraf,
        "olcek": (olcek or GRAM).upper(),
        "cikti_pb": (cikti_pb or TRY).upper(),
        "ham": _q(ham, hassasiyet),
        "marjli": _q(marjli, hassasiyet),
        "nihai": _q(nihai, hassasiyet),
    }


def hesapla_cift(
    *,
    ham_alis,
    ham_satis,
    marj_modu: str = YUZDE,
    alis_marj=0,
    satis_marj=0,
    yuvarlama_adimi=0,
    yuvarlama_yontemi: str = YAKIN,
    hassasiyet: Decimal = HASSASIYET,
) -> dict[str, Any]:
    """Ham bid/ask → işaretli marj → yuvarlama → nihai çift + doğrulama."""
    alis_m = uygula_pano_marj(
        ham_alis, taraf=ALIS, marj_modu=marj_modu, alis_marj=alis_marj
    )
    satis_m = uygula_pano_marj(
        ham_satis, taraf=SATIS, marj_modu=marj_modu, satis_marj=satis_marj
    )
    nihai_alis = yuvarla(alis_m, yuvarlama_adimi, yuvarlama_yontemi)
    nihai_satis = yuvarla(satis_m, yuvarlama_adimi, yuvarlama_yontemi)
    dogrula_nihai_cift(nihai_alis, nihai_satis)
    return {
        "ham_alis": _q(_d(ham_alis), hassasiyet),
        "ham_satis": _q(_d(ham_satis), hassasiyet),
        "nihai_alis": _q(nihai_alis, hassasiyet),
        "nihai_satis": _q(nihai_satis, hassasiyet),
    }


def _bilesen(*, ad: str, tip: str, deger, kur, taban: Decimal, gram: Decimal) -> Decimal:
    if tip not in TIPLER:
        raise ValueError(f"Geçersiz {ad} tipi: {tip!r}")
    if tip == YOK:
        return _SIFIR
    deger = _d(deger)
    if tip == YUZDE:
        if deger <= -_YUZ:
            raise ValueError(f"{ad} yüzdesi -100'den büyük olmalı.")
        return taban * deger / _YUZ
    kur = _d(kur)
    if kur <= 0:
        raise ValueError(f"{ad} için kur sıfırdan büyük olmalı.")
    if tip == PB_GRAM:
        return deger * kur * gram
    return deger * kur


def kullanici_fiyati(
    *,
    baz_birim_fiyat,
    agirlik_gr,
    iscilik: dict | None = None,
    servis_bedeli: dict | None = None,
    marj: dict | None = None,
    hassasiyet: Decimal = HASSASIYET,
) -> dict[str, Any]:
    """Katman 2 — kullanıcının kendi ekleri (pano bazını ezmez)."""
    baz = _d(baz_birim_fiyat)
    agirlik = _d(agirlik_gr)
    if baz <= 0:
        raise ValueError("baz_birim_fiyat sıfırdan büyük olmalı.")
    if agirlik <= 0:
        raise ValueError("agirlik_gr sıfırdan büyük olmalı.")

    metal = baz * agirlik
    sonuc = {"metal_bedeli": metal}
    for ad, ek in (
        ("iscilik", iscilik),
        ("servis_bedeli", servis_bedeli),
        ("marj", marj),
    ):
        ek = ek or {}
        sonuc[ad] = _bilesen(
            ad=ad,
            tip=ek.get("tip", YOK),
            deger=ek.get("deger", 0),
            kur=ek.get("kur", 1),
            taban=metal,
            gram=agirlik,
        )
    toplam = sum(sonuc.values(), _SIFIR)
    if toplam <= 0:
        raise ValueError("Toplam sıfır veya negatif; ekleri kontrol edin.")
    sonuc["toplam"] = toplam
    sonuc["birim_toplam"] = toplam / agirlik
    return {k: _q(v, hassasiyet) for k, v in sonuc.items()}
