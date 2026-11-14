"""ADR-0036 — Belge listesi, PDF indirme ve BelgeAyarlari yönetimi (tenant + kör havuz)."""

from __future__ import annotations

from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.authentication import enforce_csrf
from api.masking import assert_masked
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.throttles import BuyerRateThrottle, OpsRateThrottle
from belgeler.models import BelgeAyarlari, Document
from belgeler.services.siparis_belge_servisi import render_document_pdf
from firmalar.services.audit_servisi import record_audit
from firmalar.services.yetki_servisi import can_view_all_tenants


def _present_document(
    doc: Document, *, include_meta: bool = False, include_firma_ad: bool = False
) -> dict:
    meta = dict(doc.metadata or {})
    meta.pop("pdf_lines", None)
    row = {
        "id": doc.pk,
        "firma_id": doc.firma_id,
        "tip": doc.tip,
        "baslik": doc.baslik,
        "content_type": doc.content_type or "application/pdf",
        "byte_size": doc.byte_size,
        "order_id": meta.get("order_id"),
        "revizyon": meta.get("revizyon"),
        "belge_turu": meta.get("belge_turu") or doc.tip,
        "download_url": f"/api/v1/documents/{doc.pk}/download/",
        "olusturma_tarihi": doc.olusturma_tarihi.isoformat()
        if doc.olusturma_tarihi
        else None,
    }
    if include_firma_ad:
        row["firma_ad"] = getattr(getattr(doc, "firma", None), "ad", "") or ""
    if include_meta:
        row["metadata"] = meta
    return row


class BelgeListView(APIView):
    """GET /api/v1/belgeler/ — Ops tümü; Alıcı/Tedarikçi yalnız kendi firmasının belgeleri."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request):
        user = request.user
        is_ops = can_view_all_tenants(user)
        if is_ops:
            qs = Document.objects.select_related("firma").all()
            firma_id = request.query_params.get("firma_id")
            if firma_id:
                try:
                    qs = qs.filter(firma_id=int(firma_id))
                except (TypeError, ValueError) as exc:
                    raise ValidationError({"firma_id": "Geçersiz."}) from exc
        else:
            firma = getattr(user, "firma", None)
            if firma is None:
                return Response({"count": 0, "results": []})
            qs = Document.objects.filter(firma_id=firma.pk)
            # Kör havuz: alıcı tedarikçi irsaliyesi göremez, tedarikçi alıcı proforma/irsaliye göremez
            if getattr(firma, "alici_mi", False) and not getattr(firma, "tedarikci_mi", False):
                qs = qs.exclude(tip=Document.Tip.TEDARIKCI_IRSALIYE)
            elif getattr(firma, "tedarikci_mi", False) and not getattr(firma, "alici_mi", False):
                qs = qs.filter(
                    tip__in=[Document.Tip.TEDARIKCI_IRSALIYE, Document.Tip.TAS_SERTIFIKA, Document.Tip.DIGER]
                )

        tip = (request.query_params.get("tip") or "").strip().upper()
        if tip:
            qs = qs.filter(tip=tip)

        order_id = request.query_params.get("order_id")
        if order_id:
            try:
                oid = int(order_id)
            except (TypeError, ValueError) as exc:
                raise ValidationError({"order_id": "Geçersiz."}) from exc
            qs = qs.filter(metadata__order_id=oid)

        q = (request.query_params.get("q") or "").strip()
        if q:
            cond = Q(baslik__icontains=q)
            if is_ops:
                cond |= Q(firma__ad__icontains=q)
            if q.isdigit():
                cond |= Q(pk=int(q)) | Q(metadata__order_id=int(q))
            qs = qs.filter(cond)

        qs = apply_ordering(qs, request, whitelist=("pk", "olusturma_tarihi"), default="-pk")
        context = "auto"
        if not is_ops:
            firma = getattr(user, "firma", None)
            if firma and getattr(firma, "tedarikci_mi", False) and not getattr(firma, "alici_mi", False):
                context = "supplier"
            elif firma and getattr(firma, "alici_mi", False):
                context = "buyer"

        def _present(doc: Document) -> dict:
            data = _present_document(doc, include_meta=is_ops, include_firma_ad=is_ops)
            if context != "auto":
                assert_masked(data, context=context)
            return data

        return paginate_queryset(request, qs, present=_present)


class BelgeDownloadView(APIView):
    """GET /api/v1/belgeler/<pk>/download/ — tenant/kör havuz kontrolü ile PDF indir."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [BuyerRateThrottle]

    def get(self, request, pk: int):
        doc = get_object_or_404(Document, pk=pk)
        user = request.user
        is_ops = can_view_all_tenants(user)
        if not is_ops:
            if getattr(user, "firma_id", None) != doc.firma_id:
                raise PermissionDenied("Bu belgeye erişiminiz yok.")
            firma = getattr(user, "firma", None)
            if (
                firma
                and getattr(firma, "alici_mi", False)
                and not getattr(firma, "tedarikci_mi", False)
                and doc.tip == Document.Tip.TEDARIKCI_IRSALIYE
            ):
                raise PermissionDenied("Bu belgeye erişiminiz yok.")
            if (
                firma
                and getattr(firma, "tedarikci_mi", False)
                and not getattr(firma, "alici_mi", False)
                and doc.tip in (Document.Tip.PROFORMA, Document.Tip.IRSALIYE)
            ):
                raise PermissionDenied("Bu belgeye erişiminiz yok.")

        pdf = render_document_pdf(doc)
        resp = HttpResponse(pdf, content_type="application/pdf")
        fname = (doc.storage_key or f"belge-{doc.pk}.pdf").rsplit("/", 1)[-1]
        if not fname.endswith(".pdf"):
            fname += ".pdf"
        resp["Content-Disposition"] = f'attachment; filename="{fname}"'
        resp["X-Document-Id"] = str(doc.pk)
        return resp


def _present_ayarlar(ayar: BelgeAyarlari) -> dict:
    return {
        "proforma_disclaimer": ayar.proforma_disclaimer,
        "irsaliye_baslik": ayar.irsaliye_baslik,
        "irsaliye_alt_metin": ayar.irsaliye_alt_metin,
        "guncelleme_tarihi": ayar.guncelleme_tarihi.isoformat()
        if ayar.guncelleme_tarihi
        else None,
    }


class OpsBelgeAyarlariView(APIView):
    """GET / PATCH /api/v1/ops/belge-ayarlari/ — Proforma/İrsaliye configurable metinler."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [OpsRateThrottle]

    def get(self, request):
        if not can_view_all_tenants(request.user):
            raise PermissionDenied(detail="Belge ayarları yalnız platform ops.")
        return Response(_present_ayarlar(BelgeAyarlari.get_solo()))

    def patch(self, request):
        if not can_view_all_tenants(request.user):
            raise PermissionDenied(detail="Belge ayarları yalnız platform ops.")
        enforce_csrf(request)
        ayar = BelgeAyarlari.get_solo()
        data = request.data if isinstance(request.data, dict) else {}
        changed: dict[str, str] = {}
        if "proforma_disclaimer" in data:
            val = str(data.get("proforma_disclaimer") or "").strip()
            if not val:
                raise ValidationError({"proforma_disclaimer": "Boş bırakılamaz."})
            ayar.proforma_disclaimer = val[:255]
            changed["proforma_disclaimer"] = ayar.proforma_disclaimer
        if "irsaliye_baslik" in data:
            val = str(data.get("irsaliye_baslik") or "").strip()
            if not val:
                raise ValidationError({"irsaliye_baslik": "Boş bırakılamaz."})
            ayar.irsaliye_baslik = val[:120]
            changed["irsaliye_baslik"] = ayar.irsaliye_baslik
        if "irsaliye_alt_metin" in data:
            val = str(data.get("irsaliye_alt_metin") or "").strip()
            if not val:
                raise ValidationError({"irsaliye_alt_metin": "Boş bırakılamaz."})
            ayar.irsaliye_alt_metin = val[:255]
            changed["irsaliye_alt_metin"] = ayar.irsaliye_alt_metin
        ayar.guncelleyen = request.user
        ayar.save()
        record_audit(
            actor=request.user,
            action="belgeler.ayar_guncellendi",
            entity_type="BelgeAyarlari",
            entity_id=str(ayar.pk),
            success=True,
            detail=changed,
        )
        return Response(_present_ayarlar(ayar))
