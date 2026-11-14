"""Ops / firma portal DTO — ADR-0034 FAZ 2."""

from __future__ import annotations


def present_firma(f) -> dict:
    return {
        "id": f.pk,
        "ad": f.ad,
        "unvan": f.unvan or "",
        "firma_kodu": f.firma_kodu,
        "vergi_no": f.vergi_no or "",
        "vergi_dairesi": f.vergi_dairesi or "",
        "mersis_no": getattr(f, "mersis_no", "") or "",
        "ticaret_sicil_no": getattr(f, "ticaret_sicil_no", "") or "",
        "oda_adi": getattr(f, "oda_adi", "") or "",
        "oda_kayit_no": getattr(f, "oda_kayit_no", "") or "",
        "web_sitesi": getattr(f, "web_sitesi", "") or "",
        "telefon": f.telefon or "",
        "eposta": f.eposta or "",
        "alici_mi": f.alici_mi,
        "tedarikci_mi": f.tedarikci_mi,
        "platform_mu": f.platform_mu,
        "durum": getattr(f, "durum", "") or "",
        "onay_durumu": f.onay_durumu,
        "aktif": f.aktif,
        "vade_gun": getattr(f, "vade_gun", 0) or 0,
        "tipler": list(f.tip_atamalari.values_list("tip", flat=True))
        if hasattr(f, "tip_atamalari")
        else [],
        "tedarikci_alt_tipler": list(
            f.tedarikci_alt_tipleri.values_list("alt_tip", flat=True)
        )
        if hasattr(f, "tedarikci_alt_tipleri")
        else [],
    }


def present_kontak(k) -> dict:
    return {
        "id": k.pk,
        "ad_soyad": k.ad_soyad,
        "departman": getattr(k, "departman", "") or "",
        "gorev": k.gorev or "",
        "telefon": k.telefon or "",
        "eposta": k.eposta or "",
        "birincil": k.birincil,
        "notlar": k.notlar or "",
    }


def present_adres(a) -> dict:
    return {
        "id": a.pk,
        "tip": a.tip,
        "il": a.il,
        "ilce": a.ilce or "",
        "adres": a.adres,
        "varsayilan": a.varsayilan,
    }


def present_banka(b) -> dict:
    return {
        "id": b.pk,
        "banka_adi": b.banka_adi,
        "iban": b.iban,
        "swift_bic": getattr(b, "swift_bic", "") or "",
        "para_birimi": b.para_birimi,
        "aktif": b.aktif,
    }


def present_belge(d) -> dict:
    return {
        "id": d.pk,
        "tip": d.tip,
        "baslik": d.baslik,
        "storage_key": d.storage_key,
        "content_type": d.content_type or "",
        "byte_size": d.byte_size,
    }


def present_uyelik(u) -> dict:
    kullanici = getattr(u, "kullanici", None)
    full_name = ""
    if kullanici is not None:
        full_name = f"{getattr(kullanici, 'first_name', '') or ''} {getattr(kullanici, 'last_name', '') or ''}".strip()
    return {
        "id": u.pk,
        "kullanici_id": u.kullanici_id,
        "firma_id": u.firma_id,
        "firma_ad": getattr(getattr(u, "firma", None), "ad", ""),
        "firma_kodu": getattr(getattr(u, "firma", None), "firma_kodu", ""),
        "username": getattr(kullanici, "username", "") if kullanici else "",
        "email": getattr(kullanici, "email", "") if kullanici else "",
        "ad_soyad": full_name,
        "rol": u.rol,
        "aktif": u.aktif,
        "birincil": getattr(u, "birincil", False),
    }


def present_kanal_izni(i) -> dict:
    return {
        "id": i.pk,
        "tedarikci_firma_id": i.tedarikci_firma_id,
        "tedarikci_ad": getattr(getattr(i, "tedarikci_firma", None), "ad", ""),
        "satis_kanali_id": i.satis_kanali_id,
        "satis_kanali_kod": getattr(getattr(i, "satis_kanali", None), "kod", ""),
        "satis_kanali_ad": getattr(getattr(i, "satis_kanali", None), "ad", ""),
        "durum": i.durum,
        "talep_tarihi": i.talep_tarihi.isoformat() if i.talep_tarihi else None,
        "karar_tarihi": i.karar_tarihi.isoformat() if i.karar_tarihi else None,
    }


def present_alici_kanal_erisimi(e) -> dict:
    return {
        "id": e.pk,
        "firma_id": e.firma_id,
        "firma_ad": getattr(getattr(e, "firma", None), "ad", ""),
        "satis_kanali_id": e.satis_kanali_id,
        "satis_kanali_kod": getattr(getattr(e, "satis_kanali", None), "kod", ""),
        "satis_kanali_ad": getattr(getattr(e, "satis_kanali", None), "ad", ""),
        "fiyat_grubu_id": e.fiyat_grubu_id,
        "fiyat_grubu_kod": getattr(getattr(e, "fiyat_grubu", None), "kod", ""),
        "fiyat_grubu_ad": getattr(getattr(e, "fiyat_grubu", None), "ad", ""),
        "aktif": e.aktif,
    }


def present_api_anahtar(a, *, plaintext: str | None = None) -> dict:
    d = {
        "id": a.pk,
        "ad": a.ad,
        "key_prefix": a.key_prefix,
        "scopes": a.scopes or [],
        "iptal": a.iptal,
        "satis_kanali_id": a.satis_kanali_id,
        "rate_limit_per_min": a.rate_limit_per_min,
        "olusturma": a.olusturma.isoformat() if a.olusturma else None,
    }
    if plaintext:
        d["api_key"] = plaintext  # yalnız create
    return d
