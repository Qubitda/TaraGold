"""ADR-0037 — ürün görsel yükleme / kapak / sıralama."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import record_audit
from firmalar.services.yetki_servisi import require_perm
from urunler.models import Urun, UrunGorsel, Varyant


def _require_platform_submit(actor, *, action, urun=None):
    require_perm(actor, P["submit_urun"], message="Ürün görsel yetkiniz yok.")
    firma = getattr(actor, "firma", None)
    if not (getattr(actor, "firma_id", None) and firma and firma.platform_mu):
        raise PermissionDenied("Bu işlem yalnızca platform firması kullanıcılarınındır.")
    if urun is not None and urun.olusturan_firma_id != actor.firma_id:
        raise PermissionDenied("Başka firmaya ait ürün görseli düzenlenemez.")


def gorsel_ekle(
    *,
    actor,
    urun: Urun,
    dosya=None,
    tip: str = "galeri",
    alt_metin: str = "",
    kapak: bool = False,
    varyant_id: int | None = None,
    sira: int | None = None,
    harici_url: str = "",
) -> UrunGorsel:
    _require_platform_submit(actor, action="urun.gorsel_ekle", urun=urun)
    tip_v = (tip or "galeri").strip()
    if tip_v not in dict(UrunGorsel.TIP):
        raise ValidationError({"tip": "Geçersiz görsel tipi."})
    harici = (harici_url or "").strip()
    if tip_v == "video":
        if not harici:
            raise ValidationError(
                {"harici_url": "Video için harici URL zorunludur (dosya yükleme yok)."}
            )
        if not (harici.startswith("http://") or harici.startswith("https://")):
            raise ValidationError({"harici_url": "Geçerli http(s) URL girin."})
        dosya = None
        kapak = False
    elif not dosya:
        raise ValidationError({"dosya": "Dosya zorunlu."})
    else:
        # Güvenlik: tip + boyut
        name = (getattr(dosya, "name", "") or "").lower()
        content_type = (getattr(dosya, "content_type", "") or "").lower()
        allowed_ext = (".jpg", ".jpeg", ".png", ".webp", ".gif")
        allowed_ct = {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/jpg",
        }
        if not any(name.endswith(ext) for ext in allowed_ext) and content_type not in allowed_ct:
            raise ValidationError(
                {"dosya": "Yalnızca JPEG, PNG, WebP veya GIF yüklenebilir."}
            )
        size = getattr(dosya, "size", None)
        if size is not None and size > 8 * 1024 * 1024:
            raise ValidationError({"dosya": "Görsel en fazla 8 MB olabilir."})

    varyant = None
    if varyant_id not in (None, "", 0):
        varyant = Varyant.objects.filter(pk=int(varyant_id), urun=urun).first()
        if varyant is None:
            raise ValidationError({"varyant_id": "Varyant bulunamadı."})

    with transaction.atomic():
        if kapak and varyant is None and tip_v != "video":
            UrunGorsel.objects.filter(urun=urun, varyant__isnull=True, kapak=True).update(
                kapak=False
            )
            tip_v = "kapak"
        next_sira = (
            sira
            if sira is not None
            else (
                UrunGorsel.objects.filter(urun=urun).order_by("-sira").values_list("sira", flat=True).first()
                or 0
            )
            + 1
        )
        g = UrunGorsel(
            urun=urun,
            varyant=varyant,
            dosya=dosya,
            harici_url=harici[:500] if tip_v == "video" else "",
            tip=tip_v,
            sira=int(next_sira),
            kapak=bool(kapak) and varyant is None and tip_v != "video",
            alt_metin=(alt_metin or "").strip()[:255],
        )
        g.full_clean()
        g.save()
        record_audit(
            actor=actor,
            action="urun.gorsel_ekle",
            entity_type="UrunGorsel",
            entity_id=g.pk,
            success=True,
            detail={"urun_id": urun.pk, "tip": tip_v},
        )
        return g


def gorsel_kapak_yap(*, actor, gorsel: UrunGorsel) -> UrunGorsel:
    urun = gorsel.urun
    _require_platform_submit(actor, action="urun.gorsel_kapak", urun=urun)
    if gorsel.varyant_id:
        raise ValidationError({"detail": "Kapak yalnızca ürün düzeyinde görsel olabilir."})
    with transaction.atomic():
        UrunGorsel.objects.filter(urun=urun, varyant__isnull=True, kapak=True).exclude(
            pk=gorsel.pk
        ).update(kapak=False)
        gorsel.kapak = True
        gorsel.tip = "kapak"
        gorsel.save(update_fields=["kapak", "tip"])
        record_audit(
            actor=actor,
            action="urun.gorsel_kapak",
            entity_type="UrunGorsel",
            entity_id=gorsel.pk,
            success=True,
            detail={"urun_id": urun.pk},
        )
        return gorsel


def gorsel_sirala(*, actor, urun: Urun, siralar: list[dict]) -> list[UrunGorsel]:
    """siralar: [{id, sira}, ...]"""
    _require_platform_submit(actor, action="urun.gorsel_sirala", urun=urun)
    with transaction.atomic():
        out = []
        for row in siralar or []:
            gid = int(row["id"])
            sira = int(row["sira"])
            g = UrunGorsel.objects.filter(pk=gid, urun=urun).first()
            if g is None:
                raise ValidationError({"siralar": f"Görsel bulunamadı: {gid}"})
            g.sira = sira
            g.save(update_fields=["sira"])
            out.append(g)
        return out


def gorsel_sil(*, actor, gorsel: UrunGorsel) -> None:
    urun = gorsel.urun
    _require_platform_submit(actor, action="urun.gorsel_sil", urun=urun)
    with transaction.atomic():
        gid = gorsel.pk
        if gorsel.dosya:
            gorsel.dosya.delete(save=False)
        gorsel.delete()
        record_audit(
            actor=actor,
            action="urun.gorsel_sil",
            entity_type="UrunGorsel",
            entity_id=gid,
            success=True,
            detail={"urun_id": urun.pk},
        )


def present_gorsel(g: UrunGorsel, *, request=None) -> dict:
    url = ""
    harici = (getattr(g, "harici_url", None) or "").strip()
    if g.dosya:
        try:
            url = g.dosya.url
        except ValueError:
            url = ""
        if request is not None and url and not url.startswith("http"):
            url = request.build_absolute_uri(url)
    elif harici:
        url = harici
    return {
        "id": g.pk,
        "urun_id": g.urun_id,
        "varyant_id": g.varyant_id,
        "url": url,
        "harici_url": harici,
        "tip": g.tip,
        "sira": g.sira,
        "kapak": bool(g.kapak),
        "alt_metin": g.alt_metin or "",
    }
