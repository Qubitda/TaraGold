"""Alıcı/portal piyasa panosu DTO (GAP-F3-01 + ADR-0039).

Marj / maliyet / saf kur gözlemi / detay kırılımı alıcıya sızdırılmaz.
Alıcı: nihai alış/satış (aliciya_alis_goster ile); ops detay ayrı endpoint.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.utils import timezone

from piyasa.models import PiyasaUrun
from piyasa.services import piyasa_fiyat_servisi
from tanimlar.fiyat_kaynagi import FeedHealth

_OLCEK_FILTRE = frozenset(
    {
        PiyasaUrun.Olcek.ONS,
        PiyasaUrun.Olcek.KG,
        PiyasaUrun.Olcek.GRAM,
    }
)

_KAYNAK_MAP = {
    FeedHealth.FEED_OK: "CANLI",
    FeedHealth.FEED_STALE_LKG: "LKG",
    FeedHealth.FEED_LOCKED_MANUEL: "MANUEL",
    FeedHealth.FEED_FAIL: "FAIL",
}

_PREV_KEY = "piyasa:prev_nihai:"

# Alıcı/pano UI — sağlayıcı adı sızmasın (ADR-0039/0040 operasyon dili).
_BANNER_LEAK = ("binance", "fapi", "bookticker", "ingest", "api.binance")


def _safe_banner(raw: str | None) -> str | None:
    if not raw:
        return None
    low = str(raw).lower()
    if any(t in low for t in _BANNER_LEAK):
        return None
    return str(raw)


def _dec(value) -> str | None:
    if value is None:
        return None
    return str(Decimal(str(value)))


def _dt(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _kaynak(feed_health: str | None) -> str:
    if not feed_health:
        return "LKG"
    return _KAYNAK_MAP.get(str(feed_health), "LKG")


def _yon(kod: str, taraf: str, nihai) -> str:
    """▲/▼ için önceki nihai ile karşılaştır (cache)."""
    if nihai is None:
        return ""
    key = f"{_PREV_KEY}{kod}:{taraf}"
    cur = Decimal(str(nihai))
    prev_raw = cache.get(key)
    cache.set(key, str(cur), timeout=86400)
    if prev_raw is None:
        return ""
    prev = Decimal(str(prev_raw))
    if cur > prev:
        return "up"
    if cur < prev:
        return "down"
    return "flat"


def present_buyer_pano(
    *,
    olcek: str | None = None,
    now=None,
    ticker_only: bool = False,
    firma=None,
) -> dict[str, Any]:
    """
    GET /api/v1/piyasa/pano/ gövdesi.

    Query `olcek`: ONS | KG | GRAM (opsiyonel).
    Ham/marj yok. Alış: aliciya_alis_goster + alis_goster.
    ADR-0041: `firma` alıcıysa başlık + ek marj uygulanır.
    """
    from piyasa.services import firma_pano_tercih_servisi as tercih_srv

    now = now or timezone.now()
    olcek_norm = (olcek or "").strip().upper() or None
    if olcek_norm is not None and olcek_norm not in _OLCEK_FILTRE:
        raise ValidationError(
            {"olcek": f"Geçersiz olcek: {olcek!r} (ONS|KG|GRAM)."}
        )

    tercih = None
    if firma is not None and not getattr(firma, "platform_mu", False):
        tercih = tercih_srv.get_or_default(firma)

    rows = piyasa_fiyat_servisi.pano_ozeti(only_aktif=True, now=now)
    satirlar: list[dict[str, Any]] = []
    healths: list[str] = []
    banners: list[str] = []

    for row in rows:
        if olcek_norm is not None and row.get("olcek") != olcek_norm:
            continue
        if not row.get("aliciya_goster", True):
            continue
        if ticker_only and not row.get("ticker_da_goster"):
            continue
        if not row.get("ok"):
            # Çok bayat / hata: satırda fiyat yok ama sağlık bilinsin
            if row.get("hata"):
                healths.append(FeedHealth.FEED_FAIL)
            continue

        fh = row.get("feed_health") or ""
        if fh:
            healths.append(str(fh))
        if row.get("banner"):
            banners.append(str(row["banner"]))

        # Hide eşiği aşımı FEED_FAIL → fiyat —
        hide = str(fh) == FeedHealth.FEED_FAIL
        show_alis = bool(row.get("alis_goster", True)) and bool(
            row.get("aliciya_alis_goster", True)
        )
        show_satis = bool(row.get("satis_goster", True))

        alis = None if hide or not show_alis else row.get("alis")
        satis = None if hide or not show_satis else row.get("satis")
        if tercih is not None and (alis is not None or satis is not None):
            try:
                alis, satis = tercih_srv.uygula_ek_marj(alis, satis, tercih=tercih)
            except (ValidationError, ValueError):
                # Ek marj geçersizse satırı gizleme; platform nihai kalsın
                pass
        # Geriye uyum: fiyat = satış (veya alış)
        fiyat = satis if satis is not None else alis
        if fiyat is None and not hide:
            continue

        satirlar.append(
            {
                "kod": row["kod"],
                "ad": row.get("ad") or row["kod"],
                "bolum": row.get("bolum") or "",
                "grup": row.get("grup") or "",
                "varyant_etiket": row.get("varyant_etiket") or "",
                "gram": _dec(row.get("gram")) if row.get("gram") is not None else None,
                "fiyat": _dec(fiyat),
                "alis": _dec(alis) if show_alis else None,
                "satis": _dec(satis) if show_satis else None,
                "alis_goster": show_alis,
                "satis_goster": show_satis,
                "yon_alis": _yon(row["kod"], "alis", alis) if alis is not None else "",
                "yon_satis": _yon(row["kod"], "satis", satis) if satis is not None else "",
                "para_birimi": row.get("cikti_pb") or "TRY",
                "olcek": row.get("olcek") or PiyasaUrun.Olcek.GRAM,
                "ondalik": int(row.get("ondalik") or 2),
                "ticker_da_goster": bool(row.get("ticker_da_goster")),
                "kaynak": _kaynak(fh),
                "guncelleme": _dt(row.get("guncelleme") or now),
                "banner": _safe_banner(row.get("banner") or None),
            }
        )

    # Döviz satırları (USD/EUR) — MetalKuru yolu değil; DovizKuru
    for drow in _doviz_satirlari(now=now):
        if tercih is not None:
            a = Decimal(drow["alis"]) if drow.get("alis") else None
            s = Decimal(drow["satis"]) if drow.get("satis") else None
            try:
                a, s = tercih_srv.uygula_ek_marj(a, s, tercih=tercih)
                drow["alis"] = _dec(a)
                drow["satis"] = _dec(s)
                drow["fiyat"] = _dec(s if s is not None else a)
            except (ValidationError, ValueError):
                pass
        satirlar.append(drow)

    # Sağlık özeti — elle FAIL sayılmaz.
    # Tek kalem FAIL tüm panoyu KOPUK yapmasın: en az bir FEED_OK varsa CANLI.
    live_healths = [h for h in healths if h != FeedHealth.FEED_LOCKED_MANUEL]
    has_ok = any(h == FeedHealth.FEED_OK for h in live_healths)
    has_stale = any(h == FeedHealth.FEED_STALE_LKG for h in live_healths)
    has_fail = any(h == FeedHealth.FEED_FAIL for h in live_healths)
    if has_ok:
        kaynak = "LKG" if has_stale else "CANLI"
    elif has_stale:
        kaynak = "LKG"
    elif has_fail and not satirlar:
        kaynak = "FAIL"
    elif has_fail:
        # Bazı satırlar (örn. döviz) hâlâ var — gecikmeli say, panoyu tamamen KOPUK yapma
        kaynak = "LKG"
    elif satirlar:
        kaynak = "CANLI"
    else:
        kaynak = "FAIL"

    platform_baslik = ""
    try:
        from piyasa.models import PiyasaMarjPolitikasi

        pol = PiyasaMarjPolitikasi.objects.filter(anahtar="default").only("pano_baslik").first()
        if pol:
            platform_baslik = (pol.pano_baslik or "").strip()
    except Exception:  # noqa: BLE001 — pano başlığı opsiyonel
        platform_baslik = ""

    baslik = tercih_srv.etkin_baslik(firma=firma, platform_baslik=platform_baslik)

    ons_ozet = None
    try:
        from piyasa.services.ons_ozet import get_ons_ozet

        ons_ozet = get_ons_ozet()
    except Exception:  # noqa: BLE001 — pano kırılmasın
        ons_ozet = None

    return {
        "server_now": now.isoformat(),
        "olcek": olcek_norm,
        "kaynak": kaynak,
        "gecikmeli": kaynak == "LKG",
        "baslik": baslik or None,
        "referans_ibaresi": "Referans fiyat — yatırım tavsiyesi değildir.",
        "banner": _safe_banner(" | ".join(dict.fromkeys(banners)) or None),
        "ons_ozet": ons_ozet,
        "satirlar": satirlar,
    }


def _doviz_satirlari(*, now) -> list[dict[str, Any]]:
    from tanimlar.models import DovizKuru, KurTipi

    out: list[dict[str, Any]] = []
    for pb, ad in (
        ("USD", "USD/TRY"),
        ("EUR", "EUR/TRY"),
        ("GBP", "GBP/TRY"),
        ("CHF", "CHF/TRY"),
    ):
        alis = (
            DovizKuru.objects.filter(para_birimi=pb, kur_tipi=KurTipi.ALIS)
            .order_by("-alinma_zamani")
            .first()
        )
        satis = (
            DovizKuru.objects.filter(para_birimi=pb, kur_tipi=KurTipi.SATIS)
            .order_by("-alinma_zamani")
            .first()
        )
        a = alis.kur if alis else None
        s = satis.kur if satis else a
        gunc = (alis or satis).alinma_zamani if (alis or satis) else None
        ok = a is not None or s is not None
        out.append(
            {
                "kod": pb.lower(),
                "ad": ad,
                "bolum": PiyasaUrun.Bolum.DOVIZ,
                "grup": PiyasaUrun.Grup.DIGER,
                "varyant_etiket": "",
                "gram": None,
                "fiyat": _dec(s) if ok else None,
                "alis": _dec(a) if a is not None else None,
                "satis": _dec(s) if s is not None else None,
                "alis_goster": True,
                "satis_goster": True,
                "yon_alis": _yon(pb.lower(), "alis", a) if a is not None else "",
                "yon_satis": _yon(pb.lower(), "satis", s) if s is not None else "",
                "para_birimi": "TRY",
                "olcek": PiyasaUrun.Olcek.GRAM,
                "ondalik": 4,
                "ticker_da_goster": True,
                "kaynak": "CANLI" if ok else "FAIL",
                "ok": ok,
                "guncelleme": _dt(gunc or now),
                "banner": None if ok else "Kur yok",
            }
        )
    return out


def present_ops_pano_detay(*, now=None) -> dict[str, Any]:
    """Ops: ham + marj + nihai (manage_piyasa)."""
    now = now or timezone.now()
    urun_by_kod = {
        u.kod: u
        for u in PiyasaUrun.objects.filter(aktif=True).only(
            "id",
            "kod",
            "aktif",
            "alis_goster",
            "satis_goster",
            "aliciya_goster",
            "fiyat_modu",
            "sabit_alis",
            "sabit_satis",
            "metal_id",
            "ayar_id",
            "gram",
            "olcek",
        )
    }
    rows = piyasa_fiyat_servisi.pano_ozeti(only_aktif=True, now=now)
    satirlar = []
    for row in rows:
        alis_d = row.get("alis_detay") or {}
        satis_d = row.get("satis_detay") or {}
        urun = urun_by_kod.get(row["kod"])
        satirlar.append(
            {
                "id": urun.pk if urun else None,
                "kod": row["kod"],
                "ad": row.get("ad"),
                "bolum": row.get("bolum"),
                "grup": row.get("grup") or "",
                "varyant_etiket": row.get("varyant_etiket") or "",
                "aktif": bool(urun.aktif) if urun else True,
                "fiyat_modu": row.get("fiyat_modu")
                or (urun.fiyat_modu if urun else "CANLI"),
                "sabit_alis": _dec(row.get("sabit_alis")),
                "sabit_satis": _dec(row.get("sabit_satis")),
                "marj_tipi": row.get("marj_tipi") or row.get("marj_modu"),
                "alis_marj": _dec(row.get("alis_marj")),
                "satis_marj": _dec(row.get("satis_marj")),
                "ham_alis": _dec(alis_d.get("ham")),
                "ham_satis": _dec(satis_d.get("ham")),
                "nihai_alis": _dec(row.get("alis")),
                "nihai_satis": _dec(row.get("satis")),
                "ondalik": int(row.get("ondalik") or 2),
                "para_birimi": row.get("cikti_pb")
                or row.get("para_birimi")
                or "TRY",
                "gram": _dec(row.get("gram")) if row.get("gram") is not None else (
                    _dec(urun.gram) if urun else None
                ),
                "olcek": row.get("olcek")
                or (urun.olcek if urun else "GRAM"),
                "metal_id": urun.metal_id if urun else None,
                "ayar_id": urun.ayar_id if urun else None,
                "alis_goster": row.get("alis_goster", True),
                "satis_goster": row.get("satis_goster", True),
                "aliciya_alis_goster": row.get("aliciya_alis_goster", True),
                "aliciya_goster": row.get("aliciya_goster", True),
                "ticker_da_goster": row.get("ticker_da_goster", False),
                "feed_health": row.get("feed_health") or "",
                "banner": row.get("banner") or "",
                "gozlem_id": alis_d.get("gozlem_id") or satis_d.get("gozlem_id"),
                "ok": row.get("ok"),
                "hata": row.get("hata") or "",
                "guncelleme": _dt(row.get("guncelleme") or now),
            }
        )
    return {
        "server_now": now.isoformat(),
        "referans_ibaresi": "Referans fiyat — yatırım tavsiyesi değildir.",
        "satirlar": satirlar,
    }
