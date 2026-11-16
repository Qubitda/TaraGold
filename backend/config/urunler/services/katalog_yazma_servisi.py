"""Platform katalog yazma — ADR-0030 (HTTP ince; kurallar burada)."""

from __future__ import annotations

import uuid
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


def _require_katalog_yazma(actor, *, action, urun=None):
    """Platform veya tedarikçi + submit_urun (ADR sahiplik / kör havuz)."""
    try:
        require_perm(actor, P["submit_urun"], message="Ürün yazma yetkiniz yok.")
    except PermissionDenied as exc:
        _deny(actor, action=action, urun=urun, exc=exc, reason="yetki_yok")
    firma = getattr(actor, "firma", None)
    if not getattr(actor, "firma_id", None) or firma is None:
        _deny(
            actor,
            action=action,
            urun=urun,
            exc=PermissionDenied("Firma bağınız yok."),
            reason="firma_yok",
        )
    if getattr(firma, "platform_mu", False):
        return
    if getattr(firma, "tedarikci_mi", False):
        return
    _deny(
        actor,
        action=action,
        urun=urun,
        exc=PermissionDenied(
            "Ürün yazma yalnız platform veya tedarikçi firması kullanıcılarınındır."
        ),
        reason="firma_rol_degil",
    )


def _require_platform_submit(actor, *, action, urun=None):
    """Geriye uyum adı — katalog yazma (platform veya tedarikçi)."""
    _require_katalog_yazma(actor, action=action, urun=urun)


def _assert_urun_sahiplik_yazma(actor, urun, *, action: str) -> None:
    """Platform her sahipli ürüne; tedarikçi yalnız kendi olusturan_firma ürününe."""
    firma = getattr(actor, "firma", None)
    if firma is not None and getattr(firma, "platform_mu", False):
        return
    if urun.olusturan_firma_id != getattr(actor, "firma_id", None):
        _deny(
            actor,
            action=action,
            urun=urun,
            exc=PermissionDenied("Başka firmaya ait ürüne yazılamaz."),
            reason="sahiplik_uyusmazligi",
        )


def _resolve_sahiplik_firma(actor, sahiplik_firma_id):
    """Platform: zorunlu tedarikçi firma. Tedarikçi: actor.firma (client id yok sayılır)."""
    from firmalar.models import Firma

    firma = getattr(actor, "firma", None)
    if firma is not None and getattr(firma, "tedarikci_mi", False) and not getattr(
        firma, "platform_mu", False
    ):
        return firma
    if firma is None or not getattr(firma, "platform_mu", False):
        raise ValidationError(
            {"sahiplik_firma_id": "Sahiplik yalnız platform veya tedarikçi ile atanır."}
        )
    if sahiplik_firma_id in (None, "", 0, "0"):
        raise ValidationError(
            {"sahiplik_firma_id": "Platform kullanıcıları tedarikçi firma seçmelidir."}
        )
    try:
        pk = int(sahiplik_firma_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"sahiplik_firma_id": "Geçersiz firma."}) from exc
    hedef = Firma.objects.filter(pk=pk, aktif=True, tedarikci_mi=True).first()
    if hedef is None:
        raise ValidationError(
            {"sahiplik_firma_id": "Aktif tedarikçi firma bulunamadı."}
        )
    return hedef


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
    meta_baslik: str = "",
    meta_aciklama: str = "",
    slug: str = "",
    canonical_url: str | None = None,
    gorsel_alt_metni: str = "",
    sahiplik_firma_id: int | None = None,
    montur_grup_id=None,
) -> Urun:
    """Taslak ürün — sahiplik: platform seçer / tedarikçi kendi firması."""
    _require_katalog_yazma(actor, action="urun.taslak_olustur")
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

    sahiplik = _resolve_sahiplik_firma(actor, sahiplik_firma_id)

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
                olusturan_firma=sahiplik,
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
                meta_baslik=(meta_baslik or "").strip()[:70],
                meta_aciklama=(meta_aciklama or "").strip()[:160],
                gorsel_alt_metni=(gorsel_alt_metni or "").strip(),
                montur_grup_id=montur_grup_id,
            )
            slug_v = (slug or "").strip()
            if slug_v:
                urun.slug = slug_v[:160]
            if canonical_url:
                urun.canonical_url = str(canonical_url).strip()[:200] or None
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


def _varyant_row_kwargs(row: dict) -> dict:
    if not isinstance(row, dict):
        raise ValidationError({"varyantlar": "Her satır nesne olmalı."})
    return {
        "gram": row.get("gram"),
        "renk_id": row.get("renk_id"),
        "beden_id": row.get("beden_id"),
        "ayar_id": row.get("ayar_id"),
        "ek_bedel": row.get("ek_bedel"),
        "sabit_fiyat": row.get("sabit_fiyat"),
        "tedarikci_sku": row.get("tedarikci_sku") or "",
        "benzersiz_parca": bool(row.get("benzersiz_parca") or False),
        "tip": row.get("tip"),
        "parca_rolu": row.get("parca_rolu"),
        "bas_stil": row.get("bas_stil"),
        "govde_stil": row.get("govde_stil"),
        "yuva_adedi": row.get("yuva_adedi"),
        "izinli_kesimler": row.get("izinli_kesimler"),
        "karat_min": row.get("karat_min"),
        "karat_max": row.get("karat_max"),
        "karat": row.get("karat"),
        "kesim_kod": row.get("kesim_kod"),
    }


def ops_urun_olustur_atomic(
    *,
    actor,
    ad: str,
    kategori_id: int,
    ayar_id: int | None = None,
    varyantlar: list | None = None,
    montur_modu: str | None = None,
    parcalar: list | None = None,
    **urun_kwargs,
) -> dict:
    """Tek atomic create: ≥1 varyant; HEAD+BAND → iki Urun + ortak montur_grup_id.

    Dönüş: {urun, peer, montur_grup_id} — peer yalnız HEAD+BAND'de dolu (BAND).
    Ana ürün HEAD (veya tek ürün).
    """
    modu = (montur_modu or "").strip().upper().replace("_", "+")
    if modu in ("HEAD+BAND", "HEADBAND"):
        if not isinstance(parcalar, (list, tuple)) or len(parcalar) != 2:
            raise ValidationError(
                {"parcalar": "HEAD+BAND için tam 2 parça (HEAD ve BAND) gerekli."}
            )
        roles = []
        for p in parcalar:
            if not isinstance(p, dict):
                raise ValidationError({"parcalar": "Her parça nesne olmalı."})
            rol = (p.get("parca_rolu") or "").strip().upper()
            roles.append(rol)
        if sorted(roles) != ["BAND", "HEAD"]:
            raise ValidationError(
                {"parcalar": "Parçalar HEAD ve BAND olmalı (birer tane)."}
            )
        grup = uuid.uuid4()
        with transaction.atomic():
            created = {}
            for p in parcalar:
                rol = (p.get("parca_rolu") or "").strip().upper()
                pad = (p.get("ad") or "").strip() or (
                    f"{ad} — Baş" if rol == "HEAD" else f"{ad} — Gövde"
                )
                paid = p.get("ayar_id") if p.get("ayar_id") not in (None, "") else ayar_id
                if paid in (None, ""):
                    raise ValidationError(
                        {"ayar_id": f"{rol} parçası için ayar_id zorunlu."}
                    )
                vrows = p.get("varyantlar")
                if not isinstance(vrows, (list, tuple)) or not vrows:
                    # Tek satır: parça alanlarından varyant üret
                    vrows = [
                        {
                            "gram": p.get("gram"),
                            "renk_id": p.get("renk_id"),
                            "beden_id": p.get("beden_id"),
                            "ayar_id": paid,
                            "tip": p.get("tip") or Varyant.Tip.MONTUR,
                            "parca_rolu": rol,
                            "bas_stil": p.get("bas_stil"),
                            "govde_stil": p.get("govde_stil"),
                            "yuva_adedi": p.get("yuva_adedi"),
                            "izinli_kesimler": p.get("izinli_kesimler"),
                            "karat_min": p.get("karat_min"),
                            "karat_max": p.get("karat_max"),
                            "sabit_fiyat": p.get("sabit_fiyat"),
                        }
                    ]
                urun = taslak_urun_olustur(
                    actor=actor,
                    ad=pad,
                    kategori_id=kategori_id,
                    ayar_id=int(paid),
                    montur_grup_id=grup,
                    renk_ekseni=bool(
                        urun_kwargs.get("renk_ekseni")
                        or any(r.get("renk_id") for r in vrows if isinstance(r, dict))
                    ),
                    olcu_tipi=urun_kwargs.get("olcu_tipi") or "",
                    fiyat_tipi=urun_kwargs.get("fiyat_tipi") or "gram",
                    temin_tipi=urun_kwargs.get("temin_tipi") or "hazir",
                    termin_gun=urun_kwargs.get("termin_gun"),
                    satis_kanali_id=urun_kwargs.get("satis_kanali_id"),
                    sahiplik_firma_id=urun_kwargs.get("sahiplik_firma_id"),
                    aciklama=urun_kwargs.get("aciklama") or "",
                )
                for row in vrows:
                    kw = _varyant_row_kwargs(row)
                    if not kw.get("tip"):
                        kw["tip"] = Varyant.Tip.MONTUR
                    if not kw.get("parca_rolu"):
                        kw["parca_rolu"] = rol
                    if kw.get("ayar_id") in (None, ""):
                        kw["ayar_id"] = paid
                    varyant_ekle(actor=actor, urun=urun, **kw)
                created[rol] = urun
            return {
                "urun": created["HEAD"],
                "peer": created["BAND"],
                "montur_grup_id": grup,
            }

    # Tek ürün
    if not isinstance(varyantlar, (list, tuple)) or len(varyantlar) < 1:
        raise ValidationError({"varyantlar": "En az bir varyant gerekli."})
    if ayar_id in (None, ""):
        # İlk metal varyanttan veya zorunlu
        first = varyantlar[0] if isinstance(varyantlar[0], dict) else {}
        ayar_id = first.get("ayar_id")
    if ayar_id in (None, ""):
        raise ValidationError({"ayar_id": "Ayar seçimi zorunludur."})

    with transaction.atomic():
        urun = taslak_urun_olustur(
            actor=actor,
            ad=ad,
            kategori_id=kategori_id,
            ayar_id=int(ayar_id),
            **{k: v for k, v in urun_kwargs.items() if k != "montur_grup_id"},
        )
        for row in varyantlar:
            varyant_ekle(actor=actor, urun=urun, **_varyant_row_kwargs(row))
        return {"urun": urun, "peer": None, "montur_grup_id": None}


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
    meta_baslik: object = _UNSET,
    meta_aciklama: object = _UNSET,
    slug: object = _UNSET,
    canonical_url: object = _UNSET,
    gorsel_alt_metni: object = _UNSET,
) -> Urun:
    """Taslak/reddedildi (veya meta açıklamalar için onaylı) ürün güncelleme."""
    _require_platform_submit(actor, action="urun.guncelle", urun=urun)
    urun.refresh_from_db()
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.guncelle")
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

    if meta_baslik is not _UNSET:
        urun.meta_baslik = str(meta_baslik or "").strip()[:70]
    if meta_aciklama is not _UNSET:
        urun.meta_aciklama = str(meta_aciklama or "").strip()[:160]
    if slug is not _UNSET:
        urun.slug = str(slug or "").strip()[:160]
    if canonical_url is not _UNSET:
        cu = str(canonical_url or "").strip()
        urun.canonical_url = cu[:200] if cu else None
    if gorsel_alt_metni is not _UNSET:
        urun.gorsel_alt_metni = str(gorsel_alt_metni or "").strip()

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
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.sil")
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
    ayar_id: int | None = None,
    ek_bedel: Decimal | str | None = None,
    sabit_fiyat: Decimal | str | None = None,
    tedarikci_sku: str = "",
    benzersiz_parca: bool = False,
    tip: str | None = None,
    parca_rolu: str | None = None,
    bas_stil: str | None = None,
    govde_stil: str | None = None,
    yuva_adedi: int | None = None,
    izinli_kesimler: list | None = None,
    karat_min: Decimal | str | None = None,
    karat_max: Decimal | str | None = None,
    karat: Decimal | str | None = None,
    kesim_kod: str | None = None,
) -> Varyant:
    """Taslak/reddedildi ürüne aktif varyant ekle (onaya_gonder önkoşulu)."""
    _require_platform_submit(actor, action="urun.varyant_ekle", urun=urun)
    urun.refresh_from_db()
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.varyant_ekle")
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

    tip_v = (tip or "").strip().upper() or Varyant.Tip.HAM_ALTIN
    allowed_tips = {c.value for c in Varyant.Tip}
    if tip_v not in allowed_tips:
        raise ValidationError(
            {"tip": f"Geçersiz tip. İzin verilen: {', '.join(sorted(allowed_tips))}"}
        )

    ayar = None
    if tip_v == Varyant.Tip.TAS:
        ayar = None
    else:
        aid = ayar_id if ayar_id not in (None, "", 0) else urun.ayar_id
        if aid in (None, "", 0):
            raise ValidationError({"ayar_id": "Metal tipinde ayar zorunludur."})
        ayar = AyarMilyem.objects.filter(pk=int(aid)).first()
        if ayar is None:
            raise ValidationError({"ayar_id": "Ayar bulunamadı."})

    def _dec_opt(raw, field: str):
        if raw in (None, ""):
            return None
        try:
            return Decimal(str(raw))
        except (InvalidOperation, TypeError) as exc:
            raise ValidationError({field: "Geçersiz."}) from exc

    yuva_v = None
    if yuva_adedi not in (None, ""):
        try:
            yuva_v = int(yuva_adedi)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"yuva_adedi": "Geçersiz."}) from exc
    kesimler_v = list(izinli_kesimler) if isinstance(izinli_kesimler, list) else []
    karat_min_v = _dec_opt(karat_min, "karat_min")
    karat_max_v = _dec_opt(karat_max, "karat_max")
    karat_v = _dec_opt(karat, "karat")
    kesim_kod_v = (kesim_kod or "").strip().upper()[:32]
    parca_v = (parca_rolu or "").strip().upper()
    if tip_v == Varyant.Tip.MONTUR:
        if not parca_v:
            parca_v = Varyant.ParcaRolu.FULL
        if parca_v not in {c.value for c in Varyant.ParcaRolu}:
            raise ValidationError({"parca_rolu": "FULL, HEAD veya BAND olmalı."})
    else:
        parca_v = ""
    bas_stil_v = (bas_stil or "").strip().upper()[:48]
    govde_stil_v = (govde_stil or "").strip().upper()[:48]

    try:
        with transaction.atomic():
            v = Varyant(
                urun=urun,
                tip=tip_v,
                gram=gram_v,
                renk=renk,
                beden=beden,
                ayar=ayar,
                sabit_fiyat=sabit_v,
                ek_bedel=ek,
                tedarikci_sku=(tedarikci_sku or "").strip()[:50],
                benzersiz_parca=bool(benzersiz_parca),
                parca_rolu=parca_v,
                bas_stil=bas_stil_v,
                govde_stil=govde_stil_v,
                yuva_adedi=yuva_v,
                izinli_kesimler=kesimler_v,
                karat_min=karat_min_v,
                karat_max=karat_max_v,
                karat=karat_v,
                kesim_kod=kesim_kod_v,
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
                detail={"urun_id": urun.pk, "tip": tip_v},
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
    ayar_id=None,
    ek_bedel: Decimal | str | None = None,
    sabit_fiyat: Decimal | str | None = None,
    tedarikci_sku: str | None = None,
    benzersiz_parca: bool | None = None,
    aktif: bool | None = None,
    tip: str | None = None,
    parca_rolu=None,
    bas_stil=None,
    govde_stil=None,
    yuva_adedi=None,
    izinli_kesimler=None,
    karat_min=None,
    karat_max=None,
    karat=None,
    kesim_kod=None,
) -> Varyant:
    urun = varyant.urun
    _require_platform_submit(actor, action="urun.varyant_guncelle", urun=urun)
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.varyant_guncelle")

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
    if ayar_id is not None:
        if ayar_id in ("", 0, "0"):
            varyant.ayar = None
        else:
            ayar = AyarMilyem.objects.filter(pk=int(ayar_id)).first()
            if ayar is None:
                raise ValidationError({"ayar_id": "Ayar bulunamadı."})
            varyant.ayar = ayar
    if tedarikci_sku is not None:
        varyant.tedarikci_sku = tedarikci_sku.strip()[:50]
    if benzersiz_parca is not None:
        varyant.benzersiz_parca = bool(benzersiz_parca)
    if aktif is not None:
        varyant.aktif = bool(aktif)
    if tip is not None:
        tip_v = str(tip).strip().upper()
        allowed_tips = {c.value for c in Varyant.Tip}
        if tip_v not in allowed_tips:
            raise ValidationError(
                {"tip": f"Geçersiz tip. İzin verilen: {', '.join(sorted(allowed_tips))}"}
            )
        varyant.tip = tip_v
    # Metal tipte ayar yoksa ürün varsayılanına düş
    if varyant.tip != Varyant.Tip.TAS and not varyant.ayar_id:
        if urun.ayar_id:
            varyant.ayar_id = urun.ayar_id
        else:
            raise ValidationError({"ayar_id": "Metal tipinde ayar zorunludur."})
    if varyant.tip == Varyant.Tip.TAS:
        varyant.ayar = None
    if parca_rolu is not None:
        rol = str(parca_rolu or "").strip().upper()
        if rol and rol not in {c.value for c in Varyant.ParcaRolu}:
            raise ValidationError({"parca_rolu": "FULL, HEAD veya BAND olmalı."})
        varyant.parca_rolu = rol
    if bas_stil is not None:
        varyant.bas_stil = str(bas_stil or "").strip().upper()[:48]
    if govde_stil is not None:
        varyant.govde_stil = str(govde_stil or "").strip().upper()[:48]
    if yuva_adedi is not None:
        if yuva_adedi in ("",):
            varyant.yuva_adedi = None
        else:
            varyant.yuva_adedi = int(yuva_adedi)
    if izinli_kesimler is not None:
        varyant.izinli_kesimler = (
            list(izinli_kesimler) if isinstance(izinli_kesimler, list) else []
        )
    if karat_min is not None:
        varyant.karat_min = (
            Decimal(str(karat_min)) if str(karat_min).strip() else None
        )
    if karat_max is not None:
        varyant.karat_max = (
            Decimal(str(karat_max)) if str(karat_max).strip() else None
        )
    if karat is not None:
        varyant.karat = Decimal(str(karat)) if str(karat).strip() else None
    if kesim_kod is not None:
        varyant.kesim_kod = str(kesim_kod or "").strip().upper()[:32]

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


def urun_kopyala(*, actor, urun: Urun) -> Urun:
    """Taslak kopya: alanlar + M2M + varyantlar + taşlar + görseller (SKU yenilenir)."""
    from django.core.files.base import ContentFile

    from urunler.models import UrunGorsel, UrunTasi

    _require_platform_submit(actor, action="urun.kopyala", urun=urun)
    urun.refresh_from_db()
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.kopyala")

    with transaction.atomic():
        kopya = Urun(
            olusturan_firma=urun.olusturan_firma,
            olusturan_kullanici=actor,
            ad=f"{urun.ad} (Kopya)"[:150],
            aciklama=urun.aciklama,
            kategori_id=urun.kategori_id,
            ayar_id=urun.ayar_id,
            fiyat_tipi=urun.fiyat_tipi,
            fiyat_kaynagi=urun.fiyat_kaynagi,
            temin_tipi=urun.temin_tipi,
            termin_gun=urun.termin_gun,
            renk_ekseni=urun.renk_ekseni,
            olcu_tipi=urun.olcu_tipi,
            koleksiyon_id=urun.koleksiyon_id,
            hedef_kitle=urun.hedef_kitle,
            yas_grubu_id=urun.yas_grubu_id,
            yuzey=urun.yuzey,
            zincir_tipi_id=urun.zincir_tipi_id,
            kopca_tipi_id=urun.kopca_tipi_id,
            meta_baslik=urun.meta_baslik,
            meta_aciklama=urun.meta_aciklama,
            gorsel_alt_metni=urun.gorsel_alt_metni,
            onay_durumu="taslak",
            yayin_durumu="pasif",
            red_nedeni="",
            kimlik_sinifi=urun.kimlik_sinifi,
            # slug/platform_kodu save() ile yenilenir
        )
        kopya.full_clean()
        kopya.save()
        kopya.teknikler.set(urun.teknikler.all())
        kopya.stiller.set(urun.stiller.all())
        kopya.ozel_gunler.set(urun.ozel_gunler.all())
        for uk in urun.kanallar.all():
            UrunKanal.objects.create(urun=kopya, kanal_id=uk.kanal_id, aktif=uk.aktif)
        for v in urun.varyantlar.filter(aktif=True):
            nv = Varyant(
                urun=kopya,
                tip=v.tip,
                renk_id=v.renk_id,
                beden_id=v.beden_id,
                ayar_id=None if v.tip == Varyant.Tip.TAS else (v.ayar_id or urun.ayar_id),
                gram=v.gram,
                gram_bandi_min=v.gram_bandi_min,
                gram_bandi_max=v.gram_bandi_max,
                sabit_fiyat=v.sabit_fiyat,
                ek_bedel=v.ek_bedel,
                tedarikci_sku=v.tedarikci_sku,
                benzersiz_parca=v.benzersiz_parca,
                parca_rolu=v.parca_rolu,
                bas_stil=v.bas_stil,
                govde_stil=v.govde_stil,
                yuva_adedi=v.yuva_adedi,
                izinli_kesimler=list(v.izinli_kesimler or []),
                karat_min=v.karat_min,
                karat_max=v.karat_max,
                karat=v.karat,
                kesim_kod=v.kesim_kod,
                aktif=True,
            )
            nv.full_clean()
            nv.save()
        for t in urun.taslar.select_related("tas_tipi").all():
            UrunTasi.objects.create(
                urun=kopya,
                tas_tipi_id=t.tas_tipi_id,
                adet=t.adet,
                karat=t.karat,
                bedel=t.bedel,
                kesim_id=t.kesim_id,
                mihlama_tipi_id=t.mihlama_tipi_id,
                mensei_id=t.mensei_id,
                berraklik_id=t.berraklik_id,
                renk_derecesi_id=t.renk_derecesi_id,
                kesim_kalitesi_id=t.kesim_kalitesi_id,
                sertifika_kurumu_id=t.sertifika_kurumu_id,
                sertifika_no=t.sertifika_no or "",
            )
        for g in urun.gorseller.filter(varyant__isnull=True).order_by("sira", "pk"):
            ng = UrunGorsel(
                urun=kopya,
                tip=g.tip,
                sira=g.sira,
                kapak=g.kapak,
                alt_metin=g.alt_metin or "",
                harici_url=getattr(g, "harici_url", "") or "",
            )
            if g.dosya:
                try:
                    g.dosya.open("rb")
                    content = g.dosya.read()
                    name = g.dosya.name.rsplit("/", 1)[-1]
                    ng.dosya.save(name, ContentFile(content), save=False)
                finally:
                    try:
                        g.dosya.close()
                    except Exception:
                        pass
            ng.save()
        record_audit(
            actor=actor,
            action="urun.kopyala",
            entity_type="Urun",
            entity_id=kopya.pk,
            success=True,
            detail={"kaynak_id": urun.pk},
        )
        return kopya


def _validation_error_flat(exc: ValidationError) -> str:
    """Nested ValidationError → tek satır mesaj (DRF/Django nesting 500 önler)."""
    if hasattr(exc, "message_dict") and exc.message_dict:
        parts: list[str] = []
        for field, msgs in exc.message_dict.items():
            for m in msgs:
                parts.append(f"{field}: {m}" if field != "__all__" else str(m))
        return "; ".join(parts)
    if hasattr(exc, "messages"):
        return "; ".join(str(m) for m in exc.messages)
    return str(exc)


def varyant_toplu_ekle(
    *,
    actor,
    urun: Urun,
    satirlar: list[dict],
) -> list[Varyant]:
    """Renk×ölçü matrisi — atomic; stok otomatik açılmaz (ADR-0037)."""
    _require_platform_submit(actor, action="urun.varyant_toplu_ekle", urun=urun)
    urun.refresh_from_db()
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.varyant_toplu_ekle")
    if urun.onay_durumu not in ("taslak", "reddedildi"):
        raise ValidationError("Yalnızca taslak/reddedildi ürüne varyant eklenir.")
    if not isinstance(satirlar, (list, tuple)) or not satirlar:
        raise ValidationError({"satirlar": "En az bir satır gerekli."})
    if len(satirlar) > 200:
        raise ValidationError({"satirlar": "En fazla 200 satır."})

    created: list[Varyant] = []
    with transaction.atomic():
        # Matris satırında renk/ölçü varsa ürün eksenlerini aç (FE kaydetmeden
        # renk seçince «renk girilmez» 400/500 döngüsünü keser).
        needs_renk = any(
            isinstance(row, dict) and row.get("renk_id") not in (None, "", 0)
            for row in satirlar
        )
        needs_beden = any(
            isinstance(row, dict) and row.get("beden_id") not in (None, "", 0)
            for row in satirlar
        )
        axis_updates: list[str] = []
        if needs_renk and not urun.renk_ekseni:
            urun.renk_ekseni = True
            axis_updates.append("renk_ekseni")
        if needs_beden and not urun.olcu_tipi:
            # beden_id var ama olcu_tipi yok → beden tipini ilk satırdan çöz
            first_beden = next(
                (
                    row.get("beden_id")
                    for row in satirlar
                    if isinstance(row, dict) and row.get("beden_id") not in (None, "", 0)
                ),
                None,
            )
            if first_beden:
                tip = (
                    OlcuDegeri.objects.filter(pk=first_beden)
                    .values_list("tip", flat=True)
                    .first()
                )
                if tip:
                    urun.olcu_tipi = tip
                    axis_updates.append("olcu_tipi")
        if axis_updates:
            urun.save(update_fields=[*axis_updates, "guncelleme_zamani"])

        for i, row in enumerate(satirlar):
            if not isinstance(row, dict):
                raise ValidationError({"satirlar": f"Satır {i}: nesne beklenir."})
            try:
                v = varyant_ekle(
                    actor=actor,
                    urun=urun,
                    gram=row.get("gram"),
                    renk_id=row.get("renk_id"),
                    beden_id=row.get("beden_id"),
                    ayar_id=row.get("ayar_id"),
                    ek_bedel=row.get("ek_bedel"),
                    sabit_fiyat=row.get("sabit_fiyat"),
                    tedarikci_sku=row.get("tedarikci_sku") or "",
                    benzersiz_parca=bool(row.get("benzersiz_parca") or False),
                    tip=row.get("tip"),
                )
            except ValidationError as exc:
                alan = "satir"
                detail = _validation_error_flat(exc)
                if hasattr(exc, "message_dict") and isinstance(exc.message_dict, dict):
                    first_key = next(iter(exc.message_dict.keys()), None)
                    if first_key:
                        alan = str(first_key)
                        msgs = exc.message_dict[first_key]
                        if isinstance(msgs, (list, tuple)) and msgs:
                            detail = str(msgs[0])
                        elif msgs:
                            detail = str(msgs)
                raise ValidationError(
                    {
                        "satirlar": f"Satır {i + 1}: {detail}",
                        "satir_hatalari": [
                            {
                                "satir_index": i,
                                "alan": alan,
                                "detail": detail,
                            }
                        ],
                    }
                ) from None
            created.append(v)
        record_audit(
            actor=actor,
            action="urun.varyant_toplu_ekle",
            entity_type="Urun",
            entity_id=urun.pk,
            success=True,
            detail={"adet": len(created)},
        )
    return created


def varyant_sil(*, actor, varyant: Varyant) -> None:
    urun = varyant.urun
    _require_platform_submit(actor, action="urun.varyant_sil", urun=urun)
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.varyant_sil")
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
    _assert_urun_sahiplik_yazma(actor, urun, action="urun.kanal_guncelle")
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
