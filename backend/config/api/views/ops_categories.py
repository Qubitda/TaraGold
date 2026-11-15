"""Kategori CRUD ve Katalog Referans (Renk/Ölçü/Birim) API uçları."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import BuyerRateThrottle, OpsRateThrottle
from api.views.auth import _django_ve_to_drf
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import domain_atomic, record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from stok.birim_constants import StokBirimi
from tanimlar.models import AyarMilyem, FiyatGrubu
from urunler.models import (
    Berraklik,
    Kategori,
    KesimKalitesi,
    Koleksiyon,
    KopcaTipi,
    MihlamaTipi,
    OlcuDegeri,
    OzelGun,
    Renk,
    RenkDerecesi,
    SertifikaKurumu,
    Stil,
    TasKesimi,
    TasMensei,
    TasTipi,
    Teknik,
    Urun,
    YasGrubu,
    ZincirTipi,
)


def _present_category(cat: Kategori) -> dict:
    etkin_fg = cat.etkin_fiyat_grubu()
    return {
        "id": cat.pk,
        "kod": cat.kod,
        "ad": cat.ad,
        "slug": cat.slug or "",
        "tam_ad": str(cat),
        "ust_id": cat.ust_id,
        "ust_ad": getattr(getattr(cat, "ust", None), "ad", "") or "",
        "fiyat_grubu_id": cat.fiyat_grubu_id,
        "fiyat_grubu_ad": getattr(getattr(cat, "fiyat_grubu", None), "ad", "") or "",
        "etkin_fiyat_grubu_id": etkin_fg.pk if etkin_fg else None,
        "etkin_fiyat_grubu_ad": etkin_fg.ad if etkin_fg else "",
        "sira": cat.sira,
        "aktif": bool(cat.aktif),
        "dahili": bool(cat.dahili),
        "one_cikan": bool(cat.one_cikan),
        "ikon": cat.ikon or "",
        "seo_baslik": cat.seo_baslik or "",
        "seo_aciklama": cat.seo_aciklama or "",
        "urun_sayisi": getattr(cat, "urun_sayisi", None),
    }


def _require_ops_category_access(user) -> None:
    firma = getattr(user, "firma", None)
    if can_view_all_tenants(user):
        return
    if not (firma and getattr(firma, "platform_mu", False)):
        raise PermissionDenied(detail="Kategori yönetimi yalnız platform ekibi içindir.")
    if not (
        has_perm(user, P["submit_urun"])
        or has_perm(user, P["approve_urun"])
        or has_perm(user, P["publish_urun"])
    ):
        raise PermissionDenied(detail="Kategori yönetim yetkisi yok.")


def _parse_bool(val, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "evet")
    return bool(val)


class CategoryListView(APIView):
    """GET /api/v1/categories/ — Alıcı/portal için aktif, harici kategoriler."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        qs = (
            Kategori.objects.filter(aktif=True, dahili=False)
            .select_related("ust", "fiyat_grubu")
            .annotate(
                urun_sayisi=Count(
                    "urunler",
                    filter=Q(urunler__yayin_durumu="aktif", urunler__onay_durumu="onayli"),
                )
            )
        )
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(ad__icontains=term) | Q(kod__icontains=term))
        one_cikan = (request.query_params.get("one_cikan") or "").strip().lower()
        if one_cikan in ("true", "1"):
            qs = qs.filter(one_cikan=True)
        elif one_cikan in ("false", "0"):
            qs = qs.filter(one_cikan=False)
        ust_id = request.query_params.get("ust_id")
        if ust_id == "null":
            qs = qs.filter(ust__isnull=True)
        elif ust_id and ust_id.isdigit():
            qs = qs.filter(ust_id=int(ust_id))

        qs = qs.order_by("-one_cikan", "sira", "ad")
        return paginate_queryset(request, qs, present=_present_category)


class OpsCategoryListCreateView(APIView):
    """GET/POST /api/v1/ops/categories/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        _require_ops_category_access(request.user)
        qs = (
            Kategori.objects.select_related("ust", "fiyat_grubu")
            .annotate(urun_sayisi=Count("urunler"))
        )
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(ad__icontains=term) | Q(kod__icontains=term))
        aktif_p = (request.query_params.get("aktif") or "").strip().lower()
        if aktif_p in ("true", "1", "false", "0"):
            qs = qs.filter(aktif=aktif_p in ("true", "1"))
        dahili_p = (request.query_params.get("dahili") or "").strip().lower()
        if dahili_p in ("true", "1", "false", "0"):
            qs = qs.filter(dahili=dahili_p in ("true", "1"))
        one_cikan_p = (request.query_params.get("one_cikan") or "").strip().lower()
        if one_cikan_p in ("true", "1", "false", "0"):
            qs = qs.filter(one_cikan=one_cikan_p in ("true", "1"))

        ordering = (request.query_params.get("ordering") or "").strip()
        allowed = {"sira", "-sira", "ad", "-ad", "one_cikan", "-one_cikan", "pk", "-pk"}
        if ordering in allowed:
            qs = qs.order_by(ordering, "ad")
        else:
            qs = qs.order_by("-one_cikan", "sira", "ad")

        return paginate_queryset(request, qs, present=_present_category)

    def post(self, request):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}

        kod = (body.get("kod") or "").strip().upper()[:30]
        ad = (body.get("ad") or "").strip()[:80]
        if not kod or not ad:
            raise ValidationError({"ad": "Kategori kodu ve adı zorunludur."})

        ust_id = body.get("ust_id")
        ust = None
        if ust_id not in (None, "", 0):
            ust = Kategori.objects.filter(pk=int(ust_id)).first()
            if ust is None:
                raise ValidationError({"ust_id": "Seçilen üst kategori bulunamadı."})

        fg_id = body.get("fiyat_grubu_id")
        fiyat_grubu = None
        if fg_id not in (None, "", 0):
            fiyat_grubu = FiyatGrubu.objects.filter(pk=int(fg_id)).first()
            if fiyat_grubu is None:
                raise ValidationError({"fiyat_grubu_id": "Seçilen fiyat grubu bulunamadı."})

        try:
            with domain_atomic():
                cat = Kategori(
                    kod=kod,
                    ad=ad,
                    ust=ust,
                    fiyat_grubu=fiyat_grubu,
                    sira=int(body.get("sira", 0) or 0),
                    aktif=_parse_bool(body.get("aktif"), default=True),
                    dahili=_parse_bool(body.get("dahili"), default=False),
                    one_cikan=_parse_bool(body.get("one_cikan"), default=False),
                    ikon=(body.get("ikon") or "").strip()[:50] or None,
                    seo_baslik=(body.get("seo_baslik") or "").strip()[:150] or None,
                    seo_aciklama=(body.get("seo_aciklama") or "").strip() or None,
                )
                cat.full_clean()
                cat.save()
                presented = _present_category(cat)
                record_audit(
                    actor=request.user,
                    action="urunler.kategori.created",
                    entity_type="Kategori",
                    entity_id=str(cat.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"kod": f"Bu kategori kodu veya adres zaten kullanımda: {exc}"}) from exc

        return Response(presented, status=status.HTTP_201_CREATED)


class OpsCategoryDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/ops/categories/<int:pk>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def _get_cat(self, pk: int) -> Kategori:
        cat = Kategori.objects.select_related("ust", "fiyat_grubu").filter(pk=pk).first()
        if cat is None:
            raise NotFound(detail="Kategori bulunamadı.")
        return cat

    def get(self, request, pk: int):
        _require_ops_category_access(request.user)
        return Response(_present_category(self._get_cat(pk)))

    def patch(self, request, pk: int):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        cat = self._get_cat(pk)
        body = request.data if isinstance(request.data, dict) else {}

        try:
            with domain_atomic():
                if "kod" in body and body.get("kod") is not None:
                    cat.kod = str(body["kod"]).strip().upper()[:30]
                if "ad" in body and body.get("ad") is not None:
                    cat.ad = str(body["ad"]).strip()[:80]
                if "ust_id" in body:
                    raw_ust = body.get("ust_id")
                    if raw_ust in (None, "", 0):
                        cat.ust = None
                    else:
                        ust = Kategori.objects.filter(pk=int(raw_ust)).first()
                        if ust is None:
                            raise ValidationError({"ust_id": "Üst kategori bulunamadı."})
                        cat.ust = ust
                if "fiyat_grubu_id" in body:
                    raw_fg = body.get("fiyat_grubu_id")
                    if raw_fg in (None, "", 0):
                        cat.fiyat_grubu = None
                    else:
                        fg = FiyatGrubu.objects.filter(pk=int(raw_fg)).first()
                        if fg is None:
                            raise ValidationError({"fiyat_grubu_id": "Fiyat grubu bulunamadı."})
                        cat.fiyat_grubu = fg
                if "sira" in body and body.get("sira") is not None:
                    cat.sira = int(body["sira"])
                if "aktif" in body and body.get("aktif") is not None:
                    cat.aktif = _parse_bool(body["aktif"], default=cat.aktif)
                if "dahili" in body and body.get("dahili") is not None:
                    cat.dahili = _parse_bool(body["dahili"], default=cat.dahili)
                if "one_cikan" in body and body.get("one_cikan") is not None:
                    cat.one_cikan = _parse_bool(body["one_cikan"], default=cat.one_cikan)
                if "ikon" in body:
                    cat.ikon = (body.get("ikon") or "").strip()[:50] or None
                if "seo_baslik" in body:
                    cat.seo_baslik = (body.get("seo_baslik") or "").strip()[:150] or None
                if "seo_aciklama" in body:
                    cat.seo_aciklama = (body.get("seo_aciklama") or "").strip() or None

                cat.full_clean()
                cat.save()
                presented = _present_category(cat)
                record_audit(
                    actor=request.user,
                    action="urunler.kategori.updated",
                    entity_type="Kategori",
                    entity_id=str(cat.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"kod": f"Benzersizlik hatası: {exc}"}) from exc

        return Response(presented)

    def delete(self, request, pk: int):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        cat = self._get_cat(pk)
        try:
            with domain_atomic():
                cat_id = cat.pk
                cat.delete()
                record_audit(
                    actor=request.user,
                    action="urunler.kategori.deleted",
                    entity_type="Kategori",
                    entity_id=str(cat_id),
                    success=True,
                    detail={"id": cat_id},
                )
        except ProtectedError:
            return Response(
                {
                    "detail": "Bu kategoriye bağlı ürünler veya alt kategoriler olduğu için silinemez. Önce pasifleştirebilirsiniz.",
                    "code": "protected_reference",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"deleted": True, "id": pk})


_REF_MODEL_MAP = {
    "koleksiyon": (Koleksiyon, "Koleksiyon"),
    "renk": (Renk, "Renk"),
    "yas-grubu": (YasGrubu, "Yaş Grubu"),
    "teknik": (Teknik, "Teknik"),
    "stil": (Stil, "Stil"),
    "ozel-gun": (OzelGun, "Özel Gün"),
    "zincir-tipi": (ZincirTipi, "Zincir Tipi"),
    "kopca-tipi": (KopcaTipi, "Kopça Tipi"),
    "tas-tipi": (TasTipi, "Taş Tipi"),
    "tas-kesimi": (TasKesimi, "Taş Kesimi"),
    "mihlama-tipi": (MihlamaTipi, "Mıhlama Tipi"),
    "tas-mensei": (TasMensei, "Taş Menşei"),
    "sertifika-kurumu": (SertifikaKurumu, "Sertifika Kurumu"),
    "berraklik": (Berraklik, "Berraklık"),
    "renk-derecesi": (RenkDerecesi, "Renk Derecesi"),
    "kesim-kalitesi": (KesimKalitesi, "Kesim Kalitesi"),
}

_REF_META = [
    {"kaynak": "koleksiyon", "ad": "Koleksiyonlar"},
    {"kaynak": "renk", "ad": "Renkler"},
    {"kaynak": "olcu", "ad": "Ölçü / Beden Değerleri"},
    {"kaynak": "yas-grubu", "ad": "Yaş Grupları"},
    {"kaynak": "teknik", "ad": "Teknikler"},
    {"kaynak": "stil", "ad": "Stiller"},
    {"kaynak": "ozel-gun", "ad": "Özel Günler"},
    {"kaynak": "zincir-tipi", "ad": "Zincir Tipleri"},
    {"kaynak": "kopca-tipi", "ad": "Kopça Tipleri"},
    {"kaynak": "tas-tipi", "ad": "Taş Tipleri"},
    {"kaynak": "tas-kesimi", "ad": "Taş Kesimleri"},
    {"kaynak": "mihlama-tipi", "ad": "Mıhlama Tipleri"},
    {"kaynak": "tas-mensei", "ad": "Taş Menşeleri"},
    {"kaynak": "sertifika-kurumu", "ad": "Sertifika Kurumları"},
    {"kaynak": "berraklik", "ad": "Berraklık"},
    {"kaynak": "renk-derecesi", "ad": "Renk Dereceleri"},
    {"kaynak": "kesim-kalitesi", "ad": "Kesim Kaliteleri"},
]


def _present_ref_row(obj, *, is_tas_tipi: bool = False) -> dict:
    row = {
        "id": obj.pk,
        "kod": obj.kod,
        "ad": obj.ad,
        "sira": int(obj.sira),
        "aktif": bool(obj.aktif),
    }
    if is_tas_tipi:
        row["degerli"] = bool(getattr(obj, "degerli", False))
    return row


def _present_olcu_row(o: OlcuDegeri) -> dict:
    return {
        "id": o.pk,
        "tip": o.tip,
        "tip_ad": o.get_tip_display(),
        "sayisal_deger": str(o.sayisal_deger),
        "deger": o.deger,
        "sira": int(o.sira),
        "aktif": bool(o.aktif),
    }


def _normalize_ref_kaynak(raw: str) -> str:
    k = (raw or "").strip().lower().replace("_", "-")
    aliases = {
        "koleksiyonlar": "koleksiyon",
        "renkler": "renk",
        "olculer": "olcu",
        "olcu-degeri": "olcu",
        "yas-gruplari": "yas-grubu",
        "teknikler": "teknik",
        "stiller": "stil",
        "ozel-gunler": "ozel-gun",
        "zincir-tipleri": "zincir-tipi",
        "kopca-tipleri": "kopca-tipi",
        "tas-tipleri": "tas-tipi",
        "tas-kesimleri": "tas-kesimi",
        "mihlama-tipleri": "mihlama-tipi",
        "tas-menseileri": "tas-mensei",
        "sertifika-kurumlari": "sertifika-kurumu",
        "berrakliklar": "berraklik",
        "renk-dereceleri": "renk-derecesi",
        "kesim-kaliteleri": "kesim-kalitesi",
    }
    return aliases.get(k, k)


class OpsCatalogRefsView(APIView):
    """GET/POST /api/v1/ops/catalog-refs/ — Tüm katalog referans listeleri ve yönetimi."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        include_inactive = _parse_bool(
            request.query_params.get("include_inactive"), default=False
        )
        kaynak_param = _normalize_ref_kaynak(request.query_params.get("kaynak") or "")

        def _list_for(key: str):
            model_cls, _ = _REF_MODEL_MAP[key]
            qs = model_cls.objects.order_by("sira", "ad")
            if not include_inactive and not kaynak_param:
                qs = qs.filter(aktif=True)
            if term:
                qs = qs.filter(Q(ad__icontains=term) | Q(kod__icontains=term))
            is_tt = key == "tas-tipi"
            return [_present_ref_row(o, is_tas_tipi=is_tt) for o in qs]

        olcu_qs = OlcuDegeri.objects.order_by("tip", "sayisal_deger", "sira")
        if not include_inactive and not kaynak_param:
            olcu_qs = olcu_qs.filter(aktif=True)
        if term:
            olcu_qs = olcu_qs.filter(Q(deger__icontains=term) | Q(tip__icontains=term))

        if kaynak_param:
            if kaynak_param == "olcu":
                items = [_present_olcu_row(o) for o in olcu_qs]
            elif kaynak_param in _REF_MODEL_MAP:
                items = _list_for(kaynak_param)
            else:
                raise NotFound(detail=f"Bilinmeyen referans kaynağı: {kaynak_param}")
            return Response(
                {
                    "kaynak": kaynak_param,
                    "count": len(items),
                    "items": items,
                    "kaynaklar": _REF_META,
                    "olcu_tipleri": [
                        {"kod": c[0], "ad": str(c[1])}
                        for c in Urun._meta.get_field("olcu_tipi").choices
                    ],
                    "server_now": timezone.now().isoformat(),
                }
            )

        ayar_qs = AyarMilyem.objects.select_related("metal").order_by("metal_id", "milyem")
        if term:
            ayar_qs = ayar_qs.filter(Q(ayar_kodu__icontains=term) | Q(metal__ad__icontains=term))
        from tanimlar.models import KiymetliMetal

        metal_qs = KiymetliMetal.objects.order_by("ad", "pk")
        if term:
            metal_qs = metal_qs.filter(
                Q(ad__icontains=term) | Q(kod__icontains=term)
            )

        return Response(
            {
                "renkler": _list_for("renk"),
                "olculer": [_present_olcu_row(o) for o in olcu_qs],
                "koleksiyonlar": _list_for("koleksiyon"),
                "yas_gruplari": _list_for("yas-grubu"),
                "teknikler": _list_for("teknik"),
                "stiller": _list_for("stil"),
                "ozel_gunler": _list_for("ozel-gun"),
                "zincir_tipleri": _list_for("zincir-tipi"),
                "kopca_tipleri": _list_for("kopca-tipi"),
                "tas_tipleri": _list_for("tas-tipi"),
                "tas_kesimleri": _list_for("tas-kesimi"),
                "mihlama_tipleri": _list_for("mihlama-tipi"),
                "tas_menseileri": _list_for("tas-mensei"),
                "sertifika_kurumlari": _list_for("sertifika-kurumu"),
                "berrakliklar": _list_for("berraklik"),
                "renk_dereceleri": _list_for("renk-derecesi"),
                "kesim_kaliteleri": _list_for("kesim-kalitesi"),
                "metaller": [
                    {
                        "id": m.pk,
                        "kod": m.kod,
                        "ad": m.ad,
                        "gram_bazli": bool(m.gram_bazli),
                    }
                    for m in metal_qs
                ],
                "ayarlar": [
                    {
                        "id": a.pk,
                        "ayar_kodu": a.ayar_kodu,
                        "ayar_degeri": a.ayar_degeri,
                        "milyem": str(a.milyem),
                        "metal_id": a.metal_id,
                        "metal_ad": a.metal.ad if a.metal_id else "",
                        "metal_kod": a.metal.kod if a.metal_id else "",
                        "gram_bazli": bool(a.metal.gram_bazli) if a.metal_id else True,
                    }
                    for a in ayar_qs
                ],
                "birimler": [
                    {"kod": c[0], "ad": str(c[1])} for c in StokBirimi.CHOICES
                ],
                "olcu_tipleri": [
                    {"kod": c[0], "ad": str(c[1])} for c in Urun._meta.get_field("olcu_tipi").choices
                ],
                "fiyat_tipleri": [
                    {"kod": c[0], "ad": str(c[1])} for c in Urun.FIYAT_TIPI
                ],
                "temin_tipleri": [
                    {"kod": c[0], "ad": str(c[1])} for c in Urun.TEMIN_TIPI
                ],
                "hedef_kitleler": [
                    {"kod": c[0], "ad": str(c[1])} for c in Urun.HEDEF_KITLE
                ],
                "yuzeyler": [
                    {"kod": c[0], "ad": str(c[1])} for c in Urun.YUZEY
                ],
                "kaynaklar": _REF_META,
                "server_now": timezone.now().isoformat(),
            }
        )

    def post(self, request):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        tip = _normalize_ref_kaynak(body.get("kaynak") or "")

        try:
            with domain_atomic():
                if tip == "olcu":
                    olcu_tip = (body.get("tip") or "yuzuk_no").strip()
                    deger = (body.get("deger") or "").strip()[:20]
                    try:
                        sayisal = Decimal(str(body.get("sayisal_deger")))
                    except (InvalidOperation, TypeError) as exc:
                        raise ValidationError({"sayisal_deger": "Geçerli sayısal değer girin."}) from exc
                    sira = int(body.get("sira", 0) or 0)
                    aktif = _parse_bool(body.get("aktif"), default=True)
                    obj = OlcuDegeri(
                        tip=olcu_tip,
                        sayisal_deger=sayisal,
                        deger=deger,
                        sira=sira,
                        aktif=aktif,
                    )
                    obj.full_clean()
                    obj.save()
                    presented = _present_olcu_row(obj)
                    record_audit(
                        actor=request.user,
                        action="urunler.ref.olcu.created",
                        entity_type="OlcuDegeri",
                        entity_id=str(obj.pk),
                        success=True,
                        detail=presented,
                    )
                    return Response(presented, status=status.HTTP_201_CREATED)

                if tip in _REF_MODEL_MAP:
                    model_cls, label = _REF_MODEL_MAP[tip]
                    kod = (body.get("kod") or "").strip().upper()[:30]
                    ad = (body.get("ad") or "").strip()[:80]
                    if not kod or not ad:
                        raise ValidationError({"ad": f"{label} kodu ve adı zorunludur."})
                    sira = int(body.get("sira", 0) or 0)
                    aktif = _parse_bool(body.get("aktif"), default=True)
                    kwargs = {"kod": kod, "ad": ad, "sira": sira, "aktif": aktif}
                    if tip == "tas-tipi":
                        kwargs["degerli"] = _parse_bool(body.get("degerli"), default=False)
                    obj = model_cls(**kwargs)
                    obj.full_clean()
                    obj.save()
                    presented = _present_ref_row(obj, is_tas_tipi=(tip == "tas-tipi"))
                    record_audit(
                        actor=request.user,
                        action=f"urunler.ref.{tip}.created",
                        entity_type=model_cls.__name__,
                        entity_id=str(obj.pk),
                        success=True,
                        detail=presented,
                    )
                    return Response(presented, status=status.HTTP_201_CREATED)

                raise ValidationError({"kaynak": f"Geçersiz referans tipi: {tip}"})
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Bu kodla kayıt zaten mevcut: {exc}"}) from exc


class OpsCatalogRefDetailView(APIView):
    """PATCH/DELETE /api/v1/ops/catalog-refs/<str:kaynak>/<int:pk>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def _get(self, kaynak: str, pk: int):
        norm = _normalize_ref_kaynak(kaynak)
        if norm == "olcu":
            obj = OlcuDegeri.objects.filter(pk=pk).first()
            if obj is None:
                raise NotFound(detail="Ölçü kaydı bulunamadı.")
            return norm, obj
        if norm in _REF_MODEL_MAP:
            model_cls, label = _REF_MODEL_MAP[norm]
            obj = model_cls.objects.filter(pk=pk).first()
            if obj is None:
                raise NotFound(detail=f"{label} kaydı bulunamadı.")
            return norm, obj
        raise NotFound(detail=f"Bilinmeyen referans kaynağı: {kaynak}")

    def patch(self, request, kaynak: str, pk: int):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        norm, obj = self._get(kaynak, pk)
        body = request.data if isinstance(request.data, dict) else {}

        try:
            with domain_atomic():
                if norm == "olcu":
                    if "tip" in body and body.get("tip"):
                        obj.tip = str(body["tip"]).strip()
                    if "deger" in body and body.get("deger") is not None:
                        obj.deger = str(body["deger"]).strip()[:20]
                    if "sayisal_deger" in body and body.get("sayisal_deger") not in (None, ""):
                        try:
                            obj.sayisal_deger = Decimal(str(body["sayisal_deger"]))
                        except (InvalidOperation, TypeError) as exc:
                            raise ValidationError({"sayisal_deger": "Geçerli sayısal değer girin."}) from exc
                    if "sira" in body and body.get("sira") is not None:
                        obj.sira = int(body["sira"])
                    if "aktif" in body and body.get("aktif") is not None:
                        obj.aktif = _parse_bool(body["aktif"], default=obj.aktif)
                    obj.full_clean()
                    obj.save()
                    presented = _present_olcu_row(obj)
                else:
                    if "kod" in body and body.get("kod") is not None:
                        obj.kod = str(body["kod"]).strip().upper()[:30]
                    if "ad" in body and body.get("ad") is not None:
                        obj.ad = str(body["ad"]).strip()[:80]
                    if "sira" in body and body.get("sira") is not None:
                        obj.sira = int(body["sira"])
                    if "aktif" in body and body.get("aktif") is not None:
                        obj.aktif = _parse_bool(body["aktif"], default=obj.aktif)
                    if norm == "tas-tipi" and "degerli" in body and body.get("degerli") is not None:
                        obj.degerli = _parse_bool(body["degerli"], default=obj.degerli)
                    obj.full_clean()
                    obj.save()
                    presented = _present_ref_row(obj, is_tas_tipi=(norm == "tas-tipi"))

                record_audit(
                    actor=request.user,
                    action=f"urunler.ref.{norm}.updated",
                    entity_type=type(obj).__name__,
                    entity_id=str(obj.pk),
                    success=True,
                    detail=presented,
                )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": f"Benzersizlik hatası: {exc}"}) from exc

        return Response(presented)

    def delete(self, request, kaynak: str, pk: int):
        _require_ops_category_access(request.user)
        enforce_csrf(request)
        norm, obj = self._get(kaynak, pk)
        try:
            with domain_atomic():
                oid = obj.pk
                obj.delete()
                record_audit(
                    actor=request.user,
                    action=f"urunler.ref.{norm}.deleted",
                    entity_type=type(obj).__name__,
                    entity_id=str(oid),
                    success=True,
                    detail={"id": oid},
                )
        except ProtectedError:
            return Response(
                {
                    "detail": "Bu referans kaydı ürün veya taş kayıtlarında kullanıldığı için silinemez. Pasifleştirebilirsiniz.",
                    "code": "protected_reference",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"deleted": True, "id": pk, "kaynak": norm})
