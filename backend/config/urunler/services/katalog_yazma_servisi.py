"""Platform katalog yazma — ADR-0030 (HTTP ince; kurallar burada)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models.deletion import ProtectedError

from firmalar.role_permissions import P
from firmalar.services.audit_servisi import record_audit, record_audit_durable
from firmalar.services.yetki_servisi import require_perm
from tanimlar.models import AyarMilyem, SatisKanali
from urunler.models import (
    Kategori,
    Koleksiyon,
    KopcaTipi,
    OlcuDegeri,
    OzelGun,
    Renk,
    Stil,
    Teknik,
    Urun,
    UrunKanal,
    Varyant,
    YasGrubu,
    ZincirTipi,
)


def _deny(actor, *, action, urun, exc, reason, detail=None):
    record_audit_durable(
        actor=actor,
        action=action,
        entity_type="Urun",
        entity_id=getattr(urun, "pk", "") or "",
        success=False,
        reason=reason,
        detail=detail or {},
    )
    raise exc


def _require_platform_submit(actor, *, action, urun=None):
    try:
        require_perm(actor, P["submit_urun"], message="Ürün yazma yetkiniz yok.")
    except PermissionDenied as exc:
        _deny(actor, action=action, urun=urun, exc=exc, reason="yetki_yok")
    firma = getattr(actor, "firma", None)
    if not (getattr(actor, "firma_id", None) and firma and firma.platform_mu):
        _deny(
            actor,
            action=action,
            urun=urun,
            exc=PermissionDenied("Bu işlem yalnızca platform firması kullanıcılarınındır."),
            reason="platform_firma_degil",
        )


def _resolve_fk(model_cls, raw_id, *, field_name: str, label: str):
    if raw_id in (None, "", 0, "0"):
        return None
    try:
        pk = int(raw_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field_name: f"Geçersiz {label} seçimi."}) from exc
    obj = model_cls.objects.filter(pk=pk).first()
    if obj is None:
        raise ValidationError({field_name: f"{label} bulunamadı."})
    return obj


def _resolve_m2m(model_cls, raw_ids, *, field_name: str, label: str):
    if raw_ids is None:
        return None
    if not isinstance(raw_ids, (list, tuple, set)):
        raise ValidationError({field_name: f"{label} listesi beklenir."})
    clean_ids: list[int] = []
    for r in raw_ids:
        if r in (None, "", 0):
            continue
        try:
            clean_ids.append(int(r))
        except (TypeError, ValueError) as exc:
            raise ValidationError({field_name: f"Geçersiz {label} kimliği."}) from exc
    if not clean_ids:
        return []
    objs = list(model_cls.objects.filter(pk__in=clean_ids))
    if len(objs) != len(set(clean_ids)):
        raise ValidationError({field_name: f"Seçilen {label} kayıtlarından biri bulunamadı."})
    return objs


def taslak_urun_olustur(
    *,
    actor,
    ad: str,
    kategori_id: int,
    ayar_id: int,
    aciklama: str = "",
    fiyat_tipi: str = "gram",
    temin_tipi: str = "hazir",
    termin_gun: int | None = None,
    renk_ekseni: bool = False,
    olcu_tipi: str = "",
    satis_kanali_id: int | None = None,
    koleksiyon_id: int | None = None,
    hedef_kitle: str = "",
    yas_grubu_id: int | None = None,
    yuzey: str = "",
    zincir_tipi_id: int | None = None,
    kopca_tipi_id: int | None = None,
    teknik_ids: list[int] | None = None,
    stil_ids: list[int] | None = None,
    ozel_gun_ids: list[int] | None = None,
) -> Urun:
    """Platform taslak ürün — onay/yayın yalnız onay_servisi."""
    _require_platform_submit(actor, action="urun.taslak_olustur")
    ad = (ad or "").strip()
    if not ad:
        raise ValidationError({"ad": "Ürün adı zorunludur."})
    if fiyat_tipi not in dict(Urun.FIYAT_TIPI):
        raise ValidationError({"fiyat_tipi": "Geçersiz fiyat tipi."})
    if temin_tipi not in dict(Urun.TEMIN_TIPI):
        raise ValidationError({"temin_tipi": "Geçersiz temin tipi."})
    hk_val = (hedef_kitle or "").strip()
    if hk_val and hk_val not in dict(Urun.HEDEF_KITLE):
        raise ValidationError({"hedef_kitle": "Geçersiz hedef kitle."})
    yz_val = (yuzey or "").strip()
    if yz_val and yz_val not in dict(Urun.YUZEY):
        raise ValidationError({"yuzey": "Geçersiz yüzey değeri."})

    kategori = Kategori.objects.filter(pk=kategori_id, aktif=True).first()
    if kategori is None:
        raise ValidationError({"kategori_id": "Aktif kategori bulunamadı."})
    ayar = AyarMilyem.objects.filter(pk=ayar_id).first()
    if ayar is None:
        raise ValidationError({"ayar_id": "Ayar bulunamadı."})
    kanal = None
    if satis_kanali_id not in (None, ""):
        kanal = SatisKanali.objects.filter(pk=int(satis_kanali_id), aktif=True).first()
        if kanal is None:
            raise ValidationError({"satis_kanali_id": "Aktif satış kanalı bulunamadı."})

    koleksiyon = _resolve_fk(Koleksiyon, koleksiyon_id, field_name="koleksiyon_id", label="Koleksiyon")
    yas_grubu = _resolve_fk(YasGrubu, yas_grubu_id, field_name="yas_grubu_id", label="Yaş grubu")
    zincir_tipi = _resolve_fk(ZincirTipi, zincir_tipi_id, field_name="zincir_tipi_id", label="Zincir tipi")
    kopca_tipi = _resolve_fk(KopcaTipi, kopca_tipi_id, field_name="kopca_tipi_id", label="Kopça tipi")
    teknikler = _resolve_m2m(Teknik, teknik_ids, field_name="teknik_ids", label="Teknik")
    stiller = _resolve_m2m(Stil, stil_ids, field_name="stil_ids", label="Stil")
    ozel_gunler = _resolve_m2m(OzelGun, ozel_gun_ids, field_name="ozel_gun_ids", label="Özel gün")

    try:
        with transaction.atomic():
            urun = Urun(
                olusturan_firma=actor.firma,
                olusturan_kullanici=actor,
                ad=ad,
                aciklama=(aciklama or "").strip(),
                kategori=kategori,
                ayar=ayar,
                fiyat_tipi=fiyat_tipi,
                temin_tipi=temin_tipi,
                termin_gun=int(termin_gun) if termin_gun not in (None, "") else None,
                renk_ekseni=bool(renk_ekseni),
                olcu_tipi=(olcu_tipi or "").strip(),
                koleksiyon=koleksiyon,
                hedef_kitle=hk_val,
                yas_grubu=yas_grubu,
                yuzey=yz_val,
                zincir_tipi=zincir_tipi,
                kopca_tipi=kopca_tipi,
            )
            urun.full_clean()
            urun.save()
            if teknikler is not None:
                urun.teknikler.set(teknikler)
            if stiller is not None:
                urun.stiller.set(stiller)
            if ozel_gunler is not None:
                urun.ozel_gunler.set(ozel_gunler)
            if kanal is not None:
                UrunKanal.objects.create(urun=urun, kanal=kanal, aktif=True)
            record_audit(
                actor=actor,
                action="urun.taslak_olustur",
                entity_type="Urun",
                entity_id=urun.pk,
                success=True,
            )
            return urun
    except ValidationError as exc:
        record_audit_durable(
            actor=actor,
            action="urun.taslak_olustur",
            entity_type="Urun",
            entity_id="",
            success=False,
            reason="validation",
            detail={"messages": getattr(exc, "messages", [str(exc)])},
        )
        raise


_UNSET = object()


def taslak_urun_guncelle(
    *,
    actor,
    urun: Urun,
    ad: str | None = None,
    kategori_id: int | None = None,
    ayar_id: int | None = None,
    aciklama: str | None = None,
    fiyat_tipi: str | None = None,
    temin_tipi: str | None = None,
    termin_gun: int | None = None,
    renk_ekseni: bool | None = None,
    olcu_tipi: str | None = None,
    koleksiyon_id: object = _UNSET,
    hedef_kitle: object = _UNSET,
    yas_grubu_id: object = _UNSET,
    yuzey: object = _UNSET,
    zincir_tipi_id: object = _UNSET,
    kopca_tipi_id: object = _UNSET,
    teknik_ids: object = _UNSET,
    stil_ids: object = _UNSET,
    ozel_gun_ids: object = _UNSET,
) -> Urun:
    """Taslak/reddedildi (veya meta açıklamalar için onaylı) ürün güncelleme."""
    _require_platform_submit(actor, action="urun.guncelle", urun=urun)
    urun.refresh_from_db()
    if urun.olusturan_firma_id != actor.firma_id:
        _deny(
            actor,
            action="urun.guncelle",
            urun=urun,
            exc=PermissionDenied("Başka firmaya ait ürün güncellenemez."),
            reason="sahiplik_uyusmazligi",
        )
    if urun.yayin_durumu == "aktif":
        raise ValidationError({"detail": "Yayında olan ürün düzenlenmeden önce pasife alınmalıdır."})

    if ad is not None:
        cleaned_ad = ad.strip()
        if not cleaned_ad:
            raise ValidationError({"ad": "Ürün adı boş olamaz."})
        urun.ad = cleaned_ad
    if aciklama is not None:
        urun.aciklama = aciklama.strip()
    if kategori_id not in (None, ""):
        kategori = Kategori.objects.filter(pk=int(kategori_id), aktif=True).first()
        if kategori is None:
            raise ValidationError({"kategori_id": "Aktif kategori bulunamadı."})
        urun.kategori = kategori
    if ayar_id not in (None, ""):
        ayar = AyarMilyem.objects.filter(pk=int(ayar_id)).first()
        if ayar is None:
            raise ValidationError({"ayar_id": "Ayar bulunamadı."})
        urun.ayar = ayar
    if fiyat_tipi is not None:
        if fiyat_tipi not in dict(Urun.FIYAT_TIPI):
            raise ValidationError({"fiyat_tipi": "Geçersiz fiyat tipi."})
        urun.fiyat_tipi = fiyat_tipi
    if temin_tipi is not None:
        if temin_tipi not in dict(Urun.TEMIN_TIPI):
            raise ValidationError({"temin_tipi": "Geçersiz temin tipi."})
        urun.temin_tipi = temin_tipi
    if termin_gun is not None:
        urun.termin_gun = int(termin_gun) if str(termin_gun).strip() else None
    if renk_ekseni is not None:
        urun.renk_ekseni = bool(renk_ekseni)
    if olcu_tipi is not None:
        urun.olcu_tipi = olcu_tipi.strip()
    if koleksiyon_id is not _UNSET:
        urun.koleksiyon = _resolve_fk(Koleksiyon, koleksiyon_id, field_name="koleksiyon_id", label="Koleksiyon")
    if yas_grubu_id is not _UNSET:
        urun.yas_grubu = _resolve_fk(YasGrubu, yas_grubu_id, field_name="yas_grubu_id", label="Yaş grubu")
    if zincir_tipi_id is not _UNSET:
        urun.zincir_tipi = _resolve_fk(ZincirTipi, zincir_tipi_id, field_name="zincir_tipi_id", label="Zincir tipi")
    if kopca_tipi_id is not _UNSET:
        urun.kopca_tipi = _resolve_fk(KopcaTipi, kopca_tipi_id, field_name="kopca_tipi_id", label="Kopça tipi")
    if hedef_kitle is not _UNSET:
        hk_val = str(hedef_kitle or "").strip()
        if hk_val and hk_val not in dict(Urun.HEDEF_KITLE):
            raise ValidationError({"hedef_kitle": "Geçersiz hedef kitle."})
        urun.hedef_kitle = hk_val
    if yuzey is not _UNSET:
        yz_val = str(yuzey or "").strip()
        if yz_val and yz_val not in dict(Urun.YUZEY):
            raise ValidationError({"yuzey": "Geçersiz yüzey."})
        urun.yuzey = yz_val

    teknikler = _resolve_m2m(Teknik, None if teknik_ids is _UNSET else teknik_ids, field_name="teknik_ids", label="Teknik")
    stiller = _resolve_m2m(Stil, None if stil_ids is _UNSET else stil_ids, field_name="stil_ids", label="Stil")
    ozel_gunler = _resolve_m2m(OzelGun, None if ozel_gun_ids is _UNSET else ozel_gun_ids, field_name="ozel_gun_ids", label="Özel gün")

    with transaction.atomic():
        urun.full_clean()
        urun.save()
        if teknikler is not None:
            urun.teknikler.set(teknikler)
        if stiller is not None:
            urun.stiller.set(stiller)
        if ozel_gunler is not None:
            urun.ozel_gunler.set(ozel_gunler)
        record_audit(
            actor=actor,
            action="urun.guncelle",
            entity_type="Urun",
            entity_id=urun.pk,
            success=True,
        )
        return urun


def taslak_urun_sil(*, actor, urun: Urun) -> None:
    _require_platform_submit(actor, action="urun.sil", urun=urun)
    urun.refresh_from_db()
    if urun.olusturan_firma_id != actor.firma_id:
        _deny(
            actor,
            action="urun.sil",
            urun=urun,
            exc=PermissionDenied("Başka firmaya ait ürün silinemez."),
            reason="sahiplik_uyusmazligi",
        )
    if urun.yayin_durumu == "aktif" or urun.onay_durumu == "onayli":
        raise ValidationError({"detail": "Onaylı veya yayında olan ürün silinemez; pasife alabilirsiniz."})
    try:
        with transaction.atomic():
            uid = urun.pk
            urun.delete()
            record_audit(
                actor=actor,
                action="urun.sil",
                entity_type="Urun",
                entity_id=uid,
                success=True,
            )
    except ProtectedError as exc:
        raise ValidationError(
            {"detail": "Bu ürün teklif veya siparişlerde kullanıldığı için silinemez."}
        ) from exc


def varyant_ekle(
    *,
    actor,
    urun: Urun,
    gram: Decimal | str | None = None,
    renk_id: int | None = None,
    beden_id: int | None = None,
    ek_bedel: Decimal | str | None = None,
    sabit_fiyat: Decimal | str | None = None,
    tedarikci_sku: str = "",
    benzersiz_parca: bool = False,
) -> Varyant:
    """Taslak/reddedildi ürüne aktif varyant ekle (onaya_gonder önkoşulu)."""
    _require_platform_submit(actor, action="urun.varyant_ekle", urun=urun)
    urun.refresh_from_db()
    if urun.olusturan_firma_id != actor.firma_id:
        _deny(
            actor,
            action="urun.varyant_ekle",
            urun=urun,
            exc=PermissionDenied("Başka firmaya ait ürüne varyant eklenemez."),
            reason="sahiplik_uyusmazligi",
        )
    if urun.onay_durumu not in ("taslak", "reddedildi"):
        _deny(
            actor,
            action="urun.varyant_ekle",
            urun=urun,
            exc=ValidationError("Yalnızca taslak/reddedildi ürüne varyant eklenir."),
            reason="gecersiz_durum",
        )

    gram_v = None
    if gram not in (None, ""):
        try:
            gram_v = Decimal(str(gram))
        except (InvalidOperation, TypeError) as exc:
            raise ValidationError({"gram": "Geçersiz."}) from exc
        if gram_v <= 0:
            raise ValidationError({"gram": "Pozitif olmalı."})

    sabit_v = None
    if sabit_fiyat not in (None, ""):
        try:
            sabit_v = Decimal(str(sabit_fiyat))
        except (InvalidOperation, TypeError) as exc:
            raise ValidationError({"sabit_fiyat": "Geçersiz."}) from exc
        if sabit_v <= 0:
            raise ValidationError({"sabit_fiyat": "Pozitif olmalı."})

    ek = Decimal("0")
    if ek_bedel not in (None, ""):
        try:
            ek = Decimal(str(ek_bedel))
        except (InvalidOperation, TypeError) as exc:
            raise ValidationError({"ek_bedel": "Geçersiz."}) from exc

    renk = None
    if renk_id not in (None, "", 0):
        renk = Renk.objects.filter(pk=int(renk_id)).first()
        if renk is None:
            raise ValidationError({"renk_id": "Renk bulunamadı."})

    beden = None
    if beden_id not in (None, "", 0):
        beden = OlcuDegeri.objects.filter(pk=int(beden_id)).first()
        if beden is None:
            raise ValidationError({"beden_id": "Ölçü/beden değeri bulunamadı."})

    try:
        with transaction.atomic():
            v = Varyant(
                urun=urun,
                gram=gram_v,
                renk=renk,
                beden=beden,
                sabit_fiyat=sabit_v,
                ek_bedel=ek,
                tedarikci_sku=(tedarikci_sku or "").strip()[:50],
                benzersiz_parca=bool(benzersiz_parca),
                aktif=True,
            )
            v.full_clean()
            v.save()
            record_audit(
                actor=actor,
                action="urun.varyant_ekle",
                entity_type="Varyant",
                entity_id=v.pk,
                success=True,
                detail={"urun_id": urun.pk},
            )
            return v
    except ValidationError as exc:
        record_audit_durable(
            actor=actor,
            action="urun.varyant_ekle",
            entity_type="Urun",
            entity_id=str(urun.pk),
            success=False,
            reason="validation",
            detail={"messages": getattr(exc, "messages", [str(exc)])},
        )
        raise


def varyant_guncelle(
    *,
    actor,
    varyant: Varyant,
    gram: Decimal | str | None = None,
    renk_id: int | None = None,
    beden_id: int | None = None,
    ek_bedel: Decimal | str | None = None,
    sabit_fiyat: Decimal | str | None = None,
    tedarikci_sku: str | None = None,
    benzersiz_parca: bool | None = None,
    aktif: bool | None = None,
) -> Varyant:
    urun = varyant.urun
    _require_platform_submit(actor, action="urun.varyant_guncelle", urun=urun)
    if urun.olusturan_firma_id != actor.firma_id:
        raise PermissionDenied("Başka firmaya ait varyant güncellenemez.")

    if gram is not None:
        varyant.gram = Decimal(str(gram)) if str(gram).strip() else None
    if sabit_fiyat is not None:
        varyant.sabit_fiyat = Decimal(str(sabit_fiyat)) if str(sabit_fiyat).strip() else None
    if ek_bedel is not None:
        varyant.ek_bedel = Decimal(str(ek_bedel)) if str(ek_bedel).strip() else Decimal("0")
    if renk_id is not None:
        varyant.renk = Renk.objects.filter(pk=int(renk_id)).first() if renk_id else None
    if beden_id is not None:
        varyant.beden = OlcuDegeri.objects.filter(pk=int(beden_id)).first() if beden_id else None
    if tedarikci_sku is not None:
        varyant.tedarikci_sku = tedarikci_sku.strip()[:50]
    if benzersiz_parca is not None:
        varyant.benzersiz_parca = bool(benzersiz_parca)
    if aktif is not None:
        varyant.aktif = bool(aktif)

    with transaction.atomic():
        varyant.full_clean()
        varyant.save()
        record_audit(
            actor=actor,
            action="urun.varyant_guncelle",
            entity_type="Varyant",
            entity_id=varyant.pk,
            success=True,
            detail={"urun_id": urun.pk},
        )
        return varyant


def varyant_sil(*, actor, varyant: Varyant) -> None:
    urun = varyant.urun
    _require_platform_submit(actor, action="urun.varyant_sil", urun=urun)
    if urun.olusturan_firma_id != actor.firma_id:
        raise PermissionDenied("Başka firmaya ait varyant silinemez.")
    try:
        with transaction.atomic():
            vid = varyant.pk
            varyant.delete()
            record_audit(
                actor=actor,
                action="urun.varyant_sil",
                entity_type="Varyant",
                entity_id=vid,
                success=True,
                detail={"urun_id": urun.pk},
            )
    except ProtectedError as exc:
        raise ValidationError(
            {"detail": "Bu varyant stok, teklif veya siparişte kullanıldığı için silinemez. Pasifleştirebilirsiniz."}
        ) from exc


def urun_kanal_ekle_guncelle(
    *,
    actor,
    urun: Urun,
    kanal_id: int,
    aktif: bool = True,
) -> UrunKanal:
    _require_platform_submit(actor, action="urun.kanal_guncelle", urun=urun)
    kanal = SatisKanali.objects.filter(pk=kanal_id).first()
    if kanal is None:
        raise ValidationError({"kanal_id": "Satış kanalı bulunamadı."})
    with transaction.atomic():
        uk, _ = UrunKanal.objects.get_or_create(urun=urun, kanal=kanal, defaults={"aktif": bool(aktif)})
        uk.aktif = bool(aktif)
        uk.full_clean()
        uk.save()
        record_audit(
            actor=actor,
            action="urun.kanal_guncelle",
            entity_type="UrunKanal",
            entity_id=uk.pk,
            success=True,
            detail={"urun_id": urun.pk, "kanal_id": kanal.pk, "aktif": uk.aktif},
        )
        return uk
