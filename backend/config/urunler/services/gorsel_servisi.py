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
    dosya,
    tip: str = "galeri",
    alt_metin: str = "",
    kapak: bool = False,
    varyant_id: int | None = None,
    sira: int | None = None,
) -> UrunGorsel:
    _require_platform_submit(actor, action="urun.gorsel_ekle", urun=urun)
    tip_v = (tip or "galeri").strip()
    if tip_v not in dict(UrunGorsel.TIP):
        raise ValidationError({"tip": "Geçersiz görsel tipi."})
    if not dosya:
        raise ValidationError({"dosya": "Dosya zorunlu."})

    varyant = None
    if varyant_id not in (None, "", 0):
        varyant = Varyant.objects.filter(pk=int(varyant_id), urun=urun).first()
        if varyant is None:
            raise ValidationError({"varyant_id": "Varyant bulunamadı."})

    with transaction.atomic():
        if kapak and varyant is None:
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
            tip=tip_v,
            sira=int(next_sira),
            kapak=bool(kapak) and varyant is None,
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
            detail={"urun_id": urun.pk},
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
    if g.dosya:
        try:
            url = g.dosya.url
        except ValueError:
            url = ""
        if request is not None and url and not url.startswith("http"):
            url = request.build_absolute_uri(url)
    return {
        "id": g.pk,
        "urun_id": g.urun_id,
        "varyant_id": g.varyant_id,
        "url": url,
        "tip": g.tip,
        "sira": g.sira,
        "kapak": bool(g.kapak),
        "alt_metin": g.alt_metin or "",
    }
