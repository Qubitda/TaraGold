"""GAP-F5-02 — GET/POST/PATCH/DELETE /api/v1/ops/definitions/{kaynak}/."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from tanimlar.fiyat_kaynagi import FiyatKaynagi
from tanimlar.models import (
    AyarMilyem,
    DovizKuru,
    FiyatGrubu,
    KiymetliMetal,
    KurSaglayici,
    KurTipi,
    MetalKuru,
)


def _require_ops_read(user) -> None:
    if (
        can_view_all_tenants(user)
        or has_perm(user, P["manage_kur"])
        or has_perm(user, P["manage_sozlesme"])
        or has_perm(user, P["manage_piyasa"])
    ):
        return
    raise PermissionDenied(detail="Tanım yönetimi yalnız platform ops/finans içindir.")


def _require_ops_write(user) -> None:
    if (
        has_perm(user, P["manage_kur"])
        or has_perm(user, P["manage_sozlesme"])
        or can_view_all_tenants(user)
    ):
        return
    raise PermissionDenied(detail="Tanım yazma yetkisi yok.")


def _normalize_kaynak(kaynak: str) -> str:
    k = (kaynak or "").strip().lower().replace("_", "-")
    aliases = {
        "fiyat-gruplari": "fiyat-gruplari",
        "fiyatgrubu": "fiyat-gruplari",
        "ayar-milyem": "ayar-milyem",
        "ayarmilyem": "ayar-milyem",
        "metal-kurlari": "metal-kurlari",
        "metalkuru": "metal-kurlari",
        "doviz-kurlari": "doviz-kurlari",
        "dovizkuru": "doviz-kurlari",
    }
    if k not in aliases:
        raise NotFound(detail=f"Tanım kaynağı bulunamadı: {kaynak}")
    return aliases[k]


def _parse_bool(val, default: bool = True) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "evet")
    return bool(val)


def _parse_decimal(val, *, field: str) -> Decimal:
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError({field: "Geçersiz sayısal değer."}) from exc


def _parse_int(val, *, field: str) -> int:
    try:
        return int(val)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "Tam sayı gerekir."}) from exc


def _parse_dt(val, *, field: str):
    if val in (None, ""):
        return timezone.now()
    dt = parse_datetime(str(val))
    if dt is None:
        raise ValidationError({field: "Geçersiz ISO tarih/saat."})
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _default_saglayici() -> KurSaglayici:
    sag = KurSaglayici.objects.filter(aktif=True).first()
    if sag is None:
        sag = KurSaglayici.objects.order_by("pk").first()
    if sag is None:
        raise ValidationError({"saglayici_id": "Sistemde tanımlı KurSaglayici yok."})
    return sag


def _present_fiyat_grubu(obj: FiyatGrubu) -> dict:
    return {
        "id": obj.pk,
        "kod": obj.kod,
        "ad": obj.ad,
        "sira": obj.sira,
        "aktif": bool(obj.aktif),
    }


def _present_ayar_milyem(obj: AyarMilyem) -> dict:
    return {
        "id": obj.pk,
        "metal_id": obj.metal_id,
        "metal_kod": obj.metal.kod if obj.metal_id else "",
        "metal_ad": obj.metal.ad if obj.metal_id else "",
        "fiyat_kaynagi": obj.fiyat_kaynagi,
        "ayar_degeri": obj.ayar_degeri,
        "ayar_kodu": obj.ayar_kodu,
        "milyem": str(obj.milyem),
    }


def _present_metal_kuru(obj: MetalKuru) -> dict:
    return {
        "id": obj.pk,
        "metal_id": obj.metal_id,
        "metal_kod": obj.metal.kod if obj.metal_id else "",
        "metal_ad": obj.metal.ad if obj.metal_id else "",
        "saglayici_id": obj.saglayici_id,
        "saglayici_kod": obj.saglayici.kod if obj.saglayici_id else "",
        "kur_tipi": obj.kur_tipi,
        "zaman": obj.zaman.isoformat() if obj.zaman else None,
        "alinma_zamani": obj.alinma_zamani.isoformat() if obj.alinma_zamani else None,
        "saf_birim_fiyat": str(obj.saf_birim_fiyat),
        "kaynak": obj.kaynak,
        "manuel_neden": obj.manuel_neden,
        "girilme_zamani": obj.girilme_zamani.isoformat() if obj.girilme_zamani else None,
    }


def _present_doviz_kuru(obj: DovizKuru) -> dict:
    return {
        "id": obj.pk,
        "para_birimi": obj.para_birimi,
        "saglayici_id": obj.saglayici_id,
        "saglayici_kod": obj.saglayici.kod if obj.saglayici_id else "",
        "kur_tipi": obj.kur_tipi,
        "zaman": obj.zaman.isoformat() if obj.zaman else None,
        "alinma_zamani": obj.alinma_zamani.isoformat() if obj.alinma_zamani else None,
        "kur": str(obj.kur),
        "kaynak": obj.kaynak,
        "manuel_neden": obj.manuel_neden,
        "girilme_zamani": obj.girilme_zamani.isoformat() if obj.girilme_zamani else None,
    }


def _refs_payload() -> dict:
    return {
        "metaller": list(
            KiymetliMetal.objects.order_by("pk").values("id", "kod", "ad", "gram_bazli")
        ),
        "saglayicilar": list(
            KurSaglayici.objects.order_by("kod").values("id", "kod", "ad", "aktif")
        ),
        "kur_tipleri": [c.value for c in KurTipi],
        "fiyat_kaynaklari": [c[0] for c in FiyatKaynagi.CHOICES_KATMAN],
        "para_birimleri": [c[0] for c in DovizKuru.PARA_BIRIMI],
    }


class OpsDefinitionsListCreateView(APIView):
    """GET/POST /api/v1/ops/definitions/{kaynak}/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request, kaynak: str):
        _require_ops_read(request.user)
        norm = _normalize_kaynak(kaynak)
        if norm == "fiyat-gruplari":
            rows = [_present_fiyat_grubu(o) for o in FiyatGrubu.objects.order_by("sira", "ad")]
        elif norm == "ayar-milyem":
            rows = [
                _present_ayar_milyem(o)
                for o in AyarMilyem.objects.select_related("metal").order_by("metal_id", "milyem")
            ]
        elif norm == "metal-kurlari":
            rows = [
                _present_metal_kuru(o)
                for o in MetalKuru.objects.select_related("metal", "saglayici").order_by("-zaman", "-pk")[:200]
            ]
        else:
            rows = [
                _present_doviz_kuru(o)
                for o in DovizKuru.objects.select_related("saglayici").order_by("-zaman", "-pk")[:200]
            ]
        payload: dict[str, object] = {
            "kaynak": norm,
            "count": len(rows),
            "results": rows,
            "server_now": timezone.now().isoformat(),
        }
        if (request.query_params.get("include_refs") or "").strip() in ("1", "true"):
            payload["refs"] = _refs_payload()
        return Response(payload)

    def post(self, request, kaynak: str):
        _require_ops_write(request.user)
        enforce_csrf(request)
        norm = _normalize_kaynak(kaynak)
        body = request.data if isinstance(request.data, dict) else {}

        try:
            with domain_atomic():
                if norm == "fiyat-gruplari":
                    kod = (body.get("kod") or "").strip()[:20]
                    ad = (body.get("ad") or "").strip()[:80]
                    if not kod or not ad:
                        raise ValidationError({"kod": "kod ve ad zorunludur."})
                    sira = _parse_int(body.get("sira", 0), field="sira")
                    aktif = _parse_bool(body.get("aktif"), default=True)
                    obj = FiyatGrubu(kod=kod, ad=ad, sira=sira, aktif=aktif)
                    obj.full_clean()
                    obj.save()
                    presented = _present_fiyat_grubu(obj)
                elif norm == "ayar-milyem":
                    metal_id = _parse_int(body.get("metal_id"), field="metal_id")
                    metal = KiymetliMetal.objects.filter(pk=metal_id).first()
                    if metal is None:
                        raise ValidationError({"metal_id": "Kıymetli metal bulunamadı."})
                    ayar_degeri = _parse_int(body.get("ayar_degeri"), field="ayar_degeri")
                    ayar_kodu = (body.get("ayar_kodu") or "").strip()[:15]
                    if not ayar_kodu:
                        raise ValidationError({"ayar_kodu": "ayar_kodu zorunludur."})
                    milyem = _parse_decimal(body.get("milyem"), field="milyem")
                    fiyat_kaynagi = (body.get("fiyat_kaynagi") or FiyatKaynagi.MIRAS).strip()
                    obj = AyarMilyem(
                        metal=metal,
                        fiyat_kaynagi=fiyat_kaynagi,
                        ayar_degeri=ayar_degeri,
                        ayar_kodu=ayar_kodu,
                        milyem=milyem,
                    )
                    obj.full_clean()
                    obj.save()
                    presented = _present_ayar_milyem(obj)
                elif norm == "metal-kurlari":
                    metal_id = _parse_int(body.get("metal_id"), field="metal_id")
                    metal = KiymetliMetal.objects.filter(pk=metal_id).first()
                    if metal is None:
                        raise ValidationError({"metal_id": "Kıymetli metal bulunamadı."})
                    if body.get("saglayici_id") not in (None, ""):
                        sag_id = _parse_int(body.get("saglayici_id"), field="saglayici_id")
                        saglayici = KurSaglayici.objects.filter(pk=sag_id).first()
                        if saglayici is None:
                            raise ValidationError({"saglayici_id": "Kur sağlayıcı bulunamadı."})
                    else:
                        saglayici = _default_saglayici()
                    saf_fiyat = _parse_decimal(body.get("saf_birim_fiyat"), field="saf_birim_fiyat")
                    kur_tipi = (body.get("kur_tipi") or KurTipi.SATIS).strip()
                    kaynak_val = (body.get("kaynak") or "manuel").strip()
                    manuel_neden = (body.get("manuel_neden") or "Ops tanım girişi").strip()
                    zaman = _parse_dt(body.get("zaman"), field="zaman")
                    obj = MetalKuru(
                        metal=metal,
                        saglayici=saglayici,
                        kur_tipi=kur_tipi,
                        zaman=zaman,
                        alinma_zamani=zaman,
                        saf_birim_fiyat=saf_fiyat,
                        kaynak=kaynak_val,
                        manuel_neden=manuel_neden,
                        giren_kullanici=request.user,
                    )
                    obj.full_clean()
                    obj.save()
                    presented = _present_metal_kuru(obj)
                else:
                    para_birimi = (body.get("para_birimi") or "").strip().upper()
                    if not para_birimi:
                        raise ValidationError({"para_birimi": "para_birimi zorunludur."})
                    if body.get("saglayici_id") not in (None, ""):
                        sag_id = _parse_int(body.get("saglayici_id"), field="saglayici_id")
                        saglayici = KurSaglayici.objects.filter(pk=sag_id).first()
                        if saglayici is None:
                            raise ValidationError({"saglayici_id": "Kur sağlayıcı bulunamadı."})
                    else:
                        saglayici = _default_saglayici()
                    kur_val = _parse_decimal(body.get("kur"), field="kur")
                    kur_tipi = (body.get("kur_tipi") or KurTipi.SATIS).strip()
                    kaynak_val = (body.get("kaynak") or "manuel").strip()
                    manuel_neden = (body.get("manuel_neden") or "Ops tanım girişi").strip()
                    zaman = _parse_dt(body.get("zaman"), field="zaman")
                    obj = DovizKuru(
                        para_birimi=para_birimi,
                        saglayici=saglayici,
                        kur_tipi=kur_tipi,
                        zaman=zaman,
                        alinma_zamani=zaman,
                        kur=kur_val,
                        kaynak=kaynak_val,
                        manuel_neden=manuel_neden,
                        giren_kullanici=request.user,
                    )
                    obj.full_clean()
                    obj.save()
                    presented = _present_doviz_kuru(obj)

                record_audit(
                    actor=request.user,
                    action=f"tanimlar.{norm}.created",
                    entity_type=norm,
                    entity_id=str(presented["id"]),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            ) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Benzersizlik veya bütünlük hatası: {exc}"}) from exc

        return Response(presented, status=status.HTTP_201_CREATED)


class OpsDefinitionsDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/ops/definitions/{kaynak}/{pk}/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def _get_object(self, kaynak: str, pk: int):
        norm = _normalize_kaynak(kaynak)
        model_map = {
            "fiyat-gruplari": FiyatGrubu,
            "ayar-milyem": AyarMilyem,
            "metal-kurlari": MetalKuru,
            "doviz-kurlari": DovizKuru,
        }
        model = model_map[norm]
        qs = model.objects
        if norm == "ayar-milyem":
            qs = qs.select_related("metal")
        elif norm == "metal-kurlari":
            qs = qs.select_related("metal", "saglayici")
        elif norm == "doviz-kurlari":
            qs = qs.select_related("saglayici")
        obj = qs.filter(pk=pk).first()
        if obj is None:
            raise NotFound(detail="Tanım kaydı bulunamadı.")
        return norm, obj

    def _present(self, norm: str, obj) -> dict:
        if norm == "fiyat-gruplari":
            return _present_fiyat_grubu(obj)
        if norm == "ayar-milyem":
            return _present_ayar_milyem(obj)
        if norm == "metal-kurlari":
            return _present_metal_kuru(obj)
        return _present_doviz_kuru(obj)

    def get(self, request, kaynak: str, pk: int):
        _require_ops_read(request.user)
        norm, obj = self._get_object(kaynak, pk)
        return Response(self._present(norm, obj))

    def patch(self, request, kaynak: str, pk: int):
        _require_ops_write(request.user)
        enforce_csrf(request)
        norm, obj = self._get_object(kaynak, pk)
        body = request.data if isinstance(request.data, dict) else {}

        try:
            with domain_atomic():
                if norm == "fiyat-gruplari":
                    if "kod" in body and body.get("kod") is not None:
                        obj.kod = str(body["kod"]).strip()[:20]
                    if "ad" in body and body.get("ad") is not None:
                        obj.ad = str(body["ad"]).strip()[:80]
                    if "sira" in body and body.get("sira") is not None:
                        obj.sira = _parse_int(body["sira"], field="sira")
                    if "aktif" in body and body.get("aktif") is not None:
                        obj.aktif = _parse_bool(body["aktif"], default=obj.aktif)
                elif norm == "ayar-milyem":
                    if "metal_id" in body and body.get("metal_id") not in (None, ""):
                        mid = _parse_int(body["metal_id"], field="metal_id")
                        metal = KiymetliMetal.objects.filter(pk=mid).first()
                        if metal is None:
                            raise ValidationError({"metal_id": "Kıymetli metal bulunamadı."})
                        obj.metal = metal
                    if "fiyat_kaynagi" in body and body.get("fiyat_kaynagi"):
                        obj.fiyat_kaynagi = str(body["fiyat_kaynagi"]).strip()
                    if "ayar_degeri" in body and body.get("ayar_degeri") is not None:
                        obj.ayar_degeri = _parse_int(body["ayar_degeri"], field="ayar_degeri")
                    if "ayar_kodu" in body and body.get("ayar_kodu") is not None:
                        obj.ayar_kodu = str(body["ayar_kodu"]).strip()[:15]
                    if "milyem" in body and body.get("milyem") is not None:
                        obj.milyem = _parse_decimal(body["milyem"], field="milyem")
                elif norm == "metal-kurlari":
                    if "saf_birim_fiyat" in body and body.get("saf_birim_fiyat") is not None:
                        obj.saf_birim_fiyat = _parse_decimal(
                            body["saf_birim_fiyat"], field="saf_birim_fiyat"
                        )
                    if "kur_tipi" in body and body.get("kur_tipi"):
                        obj.kur_tipi = str(body["kur_tipi"]).strip()
                    if "manuel_neden" in body and body.get("manuel_neden") is not None:
                        obj.manuel_neden = str(body["manuel_neden"]).strip()
                    if "zaman" in body and body.get("zaman"):
                        obj.zaman = _parse_dt(body["zaman"], field="zaman")
                else:
                    if "kur" in body and body.get("kur") is not None:
                        obj.kur = _parse_decimal(body["kur"], field="kur")
                    if "kur_tipi" in body and body.get("kur_tipi"):
                        obj.kur_tipi = str(body["kur_tipi"]).strip()
                    if "manuel_neden" in body and body.get("manuel_neden") is not None:
                        obj.manuel_neden = str(body["manuel_neden"]).strip()
                    if "zaman" in body and body.get("zaman"):
                        obj.zaman = _parse_dt(body["zaman"], field="zaman")

                obj.full_clean()
                obj.save()
                presented = self._present(norm, obj)
                record_audit(
                    actor=request.user,
                    action=f"tanimlar.{norm}.updated",
                    entity_type=norm,
                    entity_id=str(obj.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            ) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Benzersizlik veya bütünlük hatası: {exc}"}) from exc

        return Response(presented)

    def delete(self, request, kaynak: str, pk: int):
        _require_ops_write(request.user)
        enforce_csrf(request)
        norm, obj = self._get_object(kaynak, pk)
        try:
            with domain_atomic():
                obj_id = obj.pk
                obj.delete()
                record_audit(
                    actor=request.user,
                    action=f"tanimlar.{norm}.deleted",
                    entity_type=norm,
                    entity_id=str(obj_id),
                    success=True,
                    detail={"id": obj_id},
                )
        except ProtectedError as exc:
            return Response(
                {
                    "detail": "Bu tanım kaydı aktif kayıtlarda kullanıldığı için silinemez.",
                    "code": "protected_reference",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"deleted": True, "id": pk, "kaynak": norm})
