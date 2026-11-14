"""GAP-F3-02 + Karar 1 — Ops Canlı Piyasa (salt okunur) + Marj Kuralları CRUD + Global Politika."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from piyasa.models import MarjKurali, PiyasaMarjPolitikasi
from piyasa.services import piyasa_fiyat_servisi
from piyasa.services.marj_cozumleme import (
    sync_global_politika_from_rule,
    sync_rule_from_global_politika,
)
from tanimlar.models import DovizKuru, FiyatGrubu, MetalKuru, SatisKanali
from urunler.models import Kategori


def _require_piyasa_read(user) -> None:
    if can_view_all_tenants(user) or has_perm(user, P["manage_piyasa"]):
        return
    raise PermissionDenied(detail="Piyasa marj politikası yalnız platform ops/finans içindir.")


def _require_piyasa_write(user) -> None:
    if has_perm(user, P["manage_piyasa"]) or can_view_all_tenants(user):
        return
    raise PermissionDenied(detail="Piyasa marj politikası güncelleme için piyasa.manage_piyasa gerekir.")


def _parse_bool(val, default: bool = True) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "evet")
    return bool(val)


def _parse_int_or_none(val, *, field: str) -> int | None:
    if val in (None, "", 0, "0"):
        return None
    try:
        return int(val)
    except (TypeError, ValueError) as exc:
        raise ValidationError({field: "Geçersiz seçim."}) from exc


def _present_politika(pol: PiyasaMarjPolitikasi) -> dict:
    return {
        "id": pol.pk,
        "anahtar": pol.anahtar,
        "marj_modu": pol.marj_modu,
        "marj_orani": str(pol.marj_orani),
        "aktif": bool(pol.aktif),
        "guncelleme": pol.guncelleme.isoformat() if pol.guncelleme else None,
        "server_now": timezone.now().isoformat(),
    }


def _present_marj_kurali(rule: MarjKurali) -> dict:
    hedef_ad = "Tüm Sistem (Global Varsayılan)"
    if rule.kapsam == MarjKurali.Kapsam.SATIS_KANALI and rule.satis_kanali_id:
        hedef_ad = rule.satis_kanali.ad
    elif rule.kapsam == MarjKurali.Kapsam.KATEGORI and rule.kategori_id:
        hedef_ad = str(rule.kategori)
    elif rule.kapsam == MarjKurali.Kapsam.FIYAT_GRUBU and rule.fiyat_grubu_id:
        hedef_ad = rule.fiyat_grubu.ad

    return {
        "id": rule.pk,
        "ad": rule.ad or hedef_ad,
        "kapsam": rule.kapsam,
        "kapsam_etiket": rule.get_kapsam_display(),
        "satis_kanali_id": rule.satis_kanali_id,
        "satis_kanali_ad": rule.satis_kanali.ad if rule.satis_kanali_id else "",
        "kategori_id": rule.kategori_id,
        "kategori_ad": str(rule.kategori) if rule.kategori_id else "",
        "fiyat_grubu_id": rule.fiyat_grubu_id,
        "fiyat_grubu_ad": rule.fiyat_grubu.ad if rule.fiyat_grubu_id else "",
        "hedef_ad": hedef_ad,
        "marj_turu": rule.marj_turu,
        "marj_turu_etiket": rule.get_marj_turu_display(),
        "deger": str(rule.deger),
        "aktif": bool(rule.aktif),
        "guncelleme": rule.guncelleme.isoformat() if rule.guncelleme else None,
    }


def _marj_refs() -> dict:
    return {
        "kapsam_secenekleri": [
            {"kod": c.value, "ad": str(c.label)} for c in MarjKurali.Kapsam
        ],
        "marj_turleri": [
            {"kod": c.value, "ad": str(c.label)} for c in MarjKurali.MarjTuru
        ],
        "satis_kanallari": list(
            SatisKanali.objects.order_by("sira", "ad").values("id", "kod", "ad", "tip", "aktif")
        ),
        "kategoriler": [
            {"id": k.pk, "kod": k.kod, "ad": str(k), "aktif": bool(k.aktif)}
            for k in Kategori.objects.select_related("ust").order_by("sira", "ad")
        ],
        "fiyat_gruplari": list(
            FiyatGrubu.objects.order_by("sira", "ad").values("id", "kod", "ad", "aktif")
        ),
    }


class OpsPiyasaMarjPolitikasiView(APIView):
    """GET/PATCH /api/v1/ops/piyasa/marj-politikasi/ — Global kâr marjı politikası."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_piyasa_read(request.user)
        pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
        return Response(_present_politika(pol))

    def patch(self, request):
        _require_piyasa_write(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
        changed: dict[str, object] = {}

        if "marj_modu" in body and body.get("marj_modu") not in (None, ""):
            mod = str(body.get("marj_modu")).strip().upper()
            if mod not in {c.value for c in PiyasaMarjPolitikasi.MarjModu}:
                raise ValidationError(
                    {"marj_modu": "Geçersiz marj_modu (TL | YUZDE)."}
                )
            pol.marj_modu = mod
            changed["marj_modu"] = mod

        if "marj_orani" in body and body.get("marj_orani") not in (None, ""):
            try:
                oran = Decimal(str(body.get("marj_orani")))
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise ValidationError({"marj_orani": "Geçersiz decimal."}) from exc
            if oran < Decimal("0"):
                raise ValidationError({"marj_orani": "Marj oranı negatif olamaz."})
            pol.marj_orani = oran.quantize(Decimal("0.0001"))
            changed["marj_orani"] = str(pol.marj_orani)

        if "aktif" in body and body.get("aktif") is not None:
            pol.aktif = _parse_bool(body.get("aktif"), default=pol.aktif)
            changed["aktif"] = pol.aktif

        with domain_atomic():
            pol.save()
            sync_rule_from_global_politika(pol)
            record_audit(
                actor=request.user,
                action="piyasa.marj_politikasi_guncellendi",
                entity_type="PiyasaMarjPolitikasi",
                entity_id=str(pol.pk),
                success=True,
                detail=changed,
            )

        return Response(_present_politika(pol))


class OpsCanliPiyasaView(APIView):
    """GET /api/v1/ops/piyasa/canli/ — Salt okunur canlı has/gram + döviz kurları."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_piyasa_read(request.user)
        now = timezone.now()

        # 1) Has / Gram metal kurları (en güncel MetalKuru gözlemleri + pano özeti)
        latest_metals: dict[tuple[int, str], MetalKuru] = {}
        for mk in (
            MetalKuru.objects.select_related("metal", "saglayici")
            .order_by("metal_id", "kur_tipi", "-zaman", "-pk")
        ):
            key = (mk.metal_id, mk.kur_tipi)
            if key not in latest_metals:
                latest_metals[key] = mk

        has_gram_rows = []
        by_metal: dict[int, dict] = {}
        for (_, _), mk in latest_metals.items():
            entry = by_metal.setdefault(
                mk.metal_id,
                {
                    "metal_id": mk.metal_id,
                    "kod": mk.metal.kod if mk.metal_id else "",
                    "ad": mk.metal.ad if mk.metal_id else "",
                    "olcek": "GRAM" if getattr(mk.metal, "gram_bazli", True) else "ADET",
                    "alis": None,
                    "satis": None,
                    "kaynak": mk.kaynak,
                    "saglayici": mk.saglayici.kod if mk.saglayici_id else "",
                    "guncelleme": mk.zaman.isoformat() if mk.zaman else None,
                },
            )
            val_str = str(mk.saf_birim_fiyat)
            if mk.kur_tipi == "ALIS":
                entry["alis"] = val_str
            else:
                entry["satis"] = val_str
            if mk.zaman and (
                entry["guncelleme"] is None or mk.zaman.isoformat() > entry["guncelleme"]
            ):
                entry["guncelleme"] = mk.zaman.isoformat()
                entry["kaynak"] = mk.kaynak
        has_gram_rows = list(by_metal.values())

        # Ek olarak tanımlı PiyasaUrun panosu varsa özet satırları
        pano_rows = []
        for r in piyasa_fiyat_servisi.pano_ozeti(only_aktif=True, now=now):
            pano_rows.append(
                {
                    "kod": r["kod"],
                    "ad": r["ad"],
                    "olcek": r["olcek"],
                    "para_birimi": r["cikti_pb"],
                    "alis": str(r["alis"]) if r["alis"] is not None else None,
                    "satis": str(r["satis"]) if r["satis"] is not None else None,
                    "banner": r.get("banner") or "",
                    "guncelleme": r["guncelleme"].isoformat() if r.get("guncelleme") else None,
                }
            )

        # 2) Döviz kurları (en güncel DovizKuru gözlemleri)
        latest_fx: dict[tuple[str, str], DovizKuru] = {}
        for dk in (
            DovizKuru.objects.select_related("saglayici")
            .order_by("para_birimi", "kur_tipi", "-zaman", "-pk")
        ):
            key = (dk.para_birimi, dk.kur_tipi)
            if key not in latest_fx:
                latest_fx[key] = dk

        by_pb: dict[str, dict] = {}
        for (_, _), dk in latest_fx.items():
            entry = by_pb.setdefault(
                dk.para_birimi,
                {
                    "para_birimi": dk.para_birimi,
                    "alis": None,
                    "satis": None,
                    "kaynak": dk.kaynak,
                    "saglayici": dk.saglayici.kod if dk.saglayici_id else "",
                    "guncelleme": dk.zaman.isoformat() if dk.zaman else None,
                },
            )
            val_str = str(dk.kur)
            if dk.kur_tipi == "ALIS":
                entry["alis"] = val_str
            else:
                entry["satis"] = val_str
            if dk.zaman and (
                entry["guncelleme"] is None or dk.zaman.isoformat() > entry["guncelleme"]
            ):
                entry["guncelleme"] = dk.zaman.isoformat()
                entry["kaynak"] = dk.kaynak

        return Response(
            {
                "salt_okunur": True,
                "server_now": now.isoformat(),
                "has_gram": has_gram_rows,
                "pano_satirlari": pano_rows,
                "doviz": list(by_pb.values()),
            }
        )


class OpsMarjKuraliListCreateView(APIView):
    """GET/POST /api/v1/ops/piyasa/marj-kurallari/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_piyasa_read(request.user)
        # En az bir global varsayılan kural olsun (ilk kurulum / eksik seed durumunda)
        if not MarjKurali.objects.filter(kapsam=MarjKurali.Kapsam.TUMU).exists():
            pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
            sync_rule_from_global_politika(pol)

        qs = MarjKurali.objects.select_related(
            "satis_kanali", "kategori", "kategori__ust", "fiyat_grubu"
        ).order_by("kapsam", "id")

        kapsam = (request.query_params.get("kapsam") or "").strip().upper()
        if kapsam:
            qs = qs.filter(kapsam=kapsam)
        aktif_p = (request.query_params.get("aktif") or "").strip().lower()
        if aktif_p in ("true", "1", "false", "0"):
            qs = qs.filter(aktif=aktif_p in ("true", "1"))
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(ad__icontains=term)
                | Q(satis_kanali__ad__icontains=term)
                | Q(kategori__ad__icontains=term)
                | Q(fiyat_grubu__ad__icontains=term)
            )

        rows = [_present_marj_kurali(r) for r in qs]
        payload: dict[str, object] = {
            "count": len(rows),
            "results": rows,
            "cozumleme_sirasi": ["KATEGORI", "FIYAT_GRUBU", "SATIS_KANALI", "TUMU"],
            "server_now": timezone.now().isoformat(),
        }
        if (request.query_params.get("include_refs") or "").strip() in ("1", "true", ""):
            payload["refs"] = _marj_refs()
        return Response(payload)

    def post(self, request):
        _require_piyasa_write(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}

        kapsam = str(body.get("kapsam") or MarjKurali.Kapsam.TUMU).strip().upper()
        if kapsam not in MarjKurali.Kapsam.values:
            raise ValidationError({"kapsam": "Geçersiz kapsam (TUMU | SATIS_KANALI | KATEGORI | FIYAT_GRUBU)."})

        marj_turu = str(body.get("marj_turu") or MarjKurali.MarjTuru.YUZDE).strip().upper()
        if marj_turu not in MarjKurali.MarjTuru.values:
            raise ValidationError({"marj_turu": "Geçersiz marj türü (YUZDE | GRAM_BASI_SABIT)."})

        try:
            deger = Decimal(str(body.get("deger", "0")))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError({"deger": "Geçerli sayısal değer girin."}) from exc
        if deger < Decimal("0"):
            raise ValidationError({"deger": "Marj değeri negatif olamaz."})

        sk_id = _parse_int_or_none(body.get("satis_kanali_id"), field="satis_kanali_id")
        kat_id = _parse_int_or_none(body.get("kategori_id"), field="kategori_id")
        fg_id = _parse_int_or_none(body.get("fiyat_grubu_id"), field="fiyat_grubu_id")

        satis_kanali = SatisKanali.objects.filter(pk=sk_id).first() if sk_id else None
        kategori = Kategori.objects.filter(pk=kat_id).first() if kat_id else None
        fiyat_grubu = FiyatGrubu.objects.filter(pk=fg_id).first() if fg_id else None

        if kapsam == MarjKurali.Kapsam.SATIS_KANALI and satis_kanali is None:
            raise ValidationError({"satis_kanali_id": "Satış kanalı seçilmelidir."})
        if kapsam == MarjKurali.Kapsam.KATEGORI and kategori is None:
            raise ValidationError({"kategori_id": "Kategori seçilmelidir."})
        if kapsam == MarjKurali.Kapsam.FIYAT_GRUBU and fiyat_grubu is None:
            raise ValidationError({"fiyat_grubu_id": "Fiyat grubu seçilmelidir."})

        if kapsam == MarjKurali.Kapsam.TUMU and MarjKurali.objects.filter(kapsam=MarjKurali.Kapsam.TUMU).exists():
            raise ValidationError(
                {"kapsam": "Global varsayılan (Tümü) kuralı zaten mevcut; mevcut kuralı düzenleyebilirsiniz."}
            )

        try:
            with domain_atomic():
                rule = MarjKurali(
                    ad=str(body.get("ad") or "").strip()[:120],
                    kapsam=kapsam,
                    satis_kanali=satis_kanali if kapsam == MarjKurali.Kapsam.SATIS_KANALI else None,
                    kategori=kategori if kapsam == MarjKurali.Kapsam.KATEGORI else None,
                    fiyat_grubu=fiyat_grubu if kapsam == MarjKurali.Kapsam.FIYAT_GRUBU else None,
                    marj_turu=marj_turu,
                    deger=deger.quantize(Decimal("0.0001")),
                    aktif=_parse_bool(body.get("aktif"), default=True),
                )
                rule.full_clean()
                rule.save()
                if rule.kapsam == MarjKurali.Kapsam.TUMU:
                    sync_global_politika_from_rule(rule)
                presented = _present_marj_kurali(rule)
                record_audit(
                    actor=request.user,
                    action="piyasa.marj_kurali_olusturuldu",
                    entity_type="MarjKurali",
                    entity_id=str(rule.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Bu kapsam için kural zaten mevcut: {exc}"}) from exc

        return Response(presented, status=status.HTTP_201_CREATED)


class OpsMarjKuraliDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/ops/piyasa/marj-kurallari/<int:pk>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def _get(self, pk: int) -> MarjKurali:
        obj = (
            MarjKurali.objects.select_related(
                "satis_kanali", "kategori", "kategori__ust", "fiyat_grubu"
            )
            .filter(pk=pk)
            .first()
        )
        if obj is None:
            raise NotFound(detail="Marj kuralı bulunamadı.")
        return obj

    def get(self, request, pk: int):
        _require_piyasa_read(request.user)
        return Response(_present_marj_kurali(self._get(pk)))

    def patch(self, request, pk: int):
        _require_piyasa_write(request.user)
        enforce_csrf(request)
        rule = self._get(pk)
        body = request.data if isinstance(request.data, dict) else {}

        try:
            with domain_atomic():
                if "ad" in body and body.get("ad") is not None:
                    rule.ad = str(body["ad"]).strip()[:120]
                if "kapsam" in body and body.get("kapsam"):
                    kapsam = str(body["kapsam"]).strip().upper()
                    if kapsam not in MarjKurali.Kapsam.values:
                        raise ValidationError({"kapsam": "Geçersiz kapsam."})
                    if (
                        rule.kapsam == MarjKurali.Kapsam.TUMU
                        and kapsam != MarjKurali.Kapsam.TUMU
                    ):
                        raise ValidationError({"kapsam": "Global varsayılan kuralın kapsamı değiştirilemez."})
                    rule.kapsam = kapsam

                if "satis_kanali_id" in body:
                    sk_id = _parse_int_or_none(body.get("satis_kanali_id"), field="satis_kanali_id")
                    rule.satis_kanali = SatisKanali.objects.filter(pk=sk_id).first() if sk_id else None
                if "kategori_id" in body:
                    kat_id = _parse_int_or_none(body.get("kategori_id"), field="kategori_id")
                    rule.kategori = Kategori.objects.filter(pk=kat_id).first() if kat_id else None
                if "fiyat_grubu_id" in body:
                    fg_id = _parse_int_or_none(body.get("fiyat_grubu_id"), field="fiyat_grubu_id")
                    rule.fiyat_grubu = FiyatGrubu.objects.filter(pk=fg_id).first() if fg_id else None

                if "marj_turu" in body and body.get("marj_turu"):
                    mt = str(body["marj_turu"]).strip().upper()
                    if mt not in MarjKurali.MarjTuru.values:
                        raise ValidationError({"marj_turu": "Geçersiz marj türü."})
                    rule.marj_turu = mt
                if "deger" in body and body.get("deger") not in (None, ""):
                    try:
                        deger = Decimal(str(body["deger"]))
                    except (InvalidOperation, TypeError, ValueError) as exc:
                        raise ValidationError({"deger": "Geçerli sayısal değer girin."}) from exc
                    if deger < Decimal("0"):
                        raise ValidationError({"deger": "Marj değeri negatif olamaz."})
                    rule.deger = deger.quantize(Decimal("0.0001"))
                if "aktif" in body and body.get("aktif") is not None:
                    rule.aktif = _parse_bool(body["aktif"], default=rule.aktif)

                rule.full_clean()
                rule.save()
                if rule.kapsam == MarjKurali.Kapsam.TUMU:
                    sync_global_politika_from_rule(rule)
                presented = _present_marj_kurali(rule)
                record_audit(
                    actor=request.user,
                    action="piyasa.marj_kurali_guncellendi",
                    entity_type="MarjKurali",
                    entity_id=str(rule.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Kural çakışması: {exc}"}) from exc

        return Response(presented)

    def delete(self, request, pk: int):
        _require_piyasa_write(request.user)
        enforce_csrf(request)
        rule = self._get(pk)
        if rule.kapsam == MarjKurali.Kapsam.TUMU:
            raise ValidationError({"detail": "Global varsayılan marj kuralı silinemez; pasifleştirebilir veya değerini düzenleyebilirsiniz."})
        with domain_atomic():
            rid = rule.pk
            rule.delete()
            record_audit(
                actor=request.user,
                action="piyasa.marj_kurali_silindi",
                entity_type="MarjKurali",
                entity_id=str(rid),
                success=True,
                detail={"id": rid},
            )
        return Response({"deleted": True, "id": pk})
