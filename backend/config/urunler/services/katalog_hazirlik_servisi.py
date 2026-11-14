"""ADR-0037 — ürün tamamlanma / onaya gönderme checklist."""

from __future__ import annotations

from django.core.exceptions import ValidationError

from urunler.models import Urun


def urun_hazirlik_durumu(urun: Urun) -> dict:
    """FE göstergesi + onaya_gonder öncesi paylaşılan kontrol listesi."""
    checks: list[dict] = []

    def _add(kod: str, etiket: str, ok: bool, zorunlu: bool = True):
        checks.append({"kod": kod, "etiket": etiket, "ok": ok, "zorunlu": zorunlu})

    _add("temel", "Ad / kategori / ayar", bool(urun.ad and urun.kategori_id and urun.ayar_id))
    _add("fiyat_tipi", "Fiyat tipi", urun.fiyat_tipi in dict(Urun.FIYAT_TIPI))
    aktif_varyant = urun.varyantlar.filter(aktif=True).count()
    _add("varyantlar", "En az bir aktif varyant", aktif_varyant >= 1)
    kapak = urun.gorseller.filter(kapak=True, varyant__isnull=True).exists()
    _add("kapak_gorsel", "Kapak görseli", kapak)
    _add(
        "koleksiyon",
        "Koleksiyon (önerilir)",
        bool(urun.koleksiyon_id),
        zorunlu=False,
    )

    zorunlu = [c for c in checks if c["zorunlu"]]
    tamam = sum(1 for c in zorunlu if c["ok"])
    toplam = len(zorunlu)
    eksikler = [c["etiket"] for c in zorunlu if not c["ok"]]
    return {
        "tamamlanan": tamam,
        "toplam": toplam,
        "yuzde": int(round(100 * tamam / toplam)) if toplam else 0,
        "hazir": len(eksikler) == 0,
        "eksikler": eksikler,
        "kontroller": checks,
        "aktif_varyant_sayisi": aktif_varyant,
    }


def assert_gonderime_hazir(urun: Urun) -> None:
    """Varyant full_clean + P0 kapak zorunluluğu."""
    durum = urun_hazirlik_durumu(urun)
    if not durum["hazir"]:
        raise ValidationError(
            "Onaya göndermeden önce eksikler: " + "; ".join(durum["eksikler"])
        )
    for v in urun.varyantlar.filter(aktif=True):
        try:
            v.full_clean()
        except ValidationError as e:
            raise ValidationError(
                f"Varyant {v.sku or v.pk}: " + "; ".join(e.messages)
            ) from e
