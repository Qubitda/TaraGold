"""Supplier stok/depo API — teklif uçları kapalı (supplier_offers_gone)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exc import raise_drf
from api.masking import assert_masked
from api.mixins import IdempotencyMixin
from api.pagination import apply_ordering, paginate_queryset
from api.permissions import IsAuthenticatedWithFirma
from api.presenters.supplier import (
    present_balance,
    present_movement,
    present_warehouse,
)
from api.throttles import SupplierRateThrottle
from firmalar.models import Firma
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm
from fiyatlama.selectors.tenant import scope_teklif_varyant_queryset
from stok.models import StockBalance, Warehouse
from stok.services import ledger_servisi, warehouse_servisi
from urunler.models import Varyant


def _require_supplier(user) -> None:
    if can_view_all_tenants(user):
        return
    firma = getattr(user, "firma", None)
    if firma is None or not getattr(firma, "tedarikci_mi", False):
        raise PermissionDenied(detail="Supplier API yalnız tedarikçi firması.")


def _parse_ops_tedarikci_id(request) -> int | None:
    raw = (request.query_params.get("tedarikci_id") or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError(detail={"tedarikci_id": "Geçersiz."}) from None


def _own_stock_qs(user, *, tedarikci_id: int | None = None):
    qs = StockBalance.objects.select_related(
        "warehouse", "warehouse__sahip_firma", "varyant__urun"
    )
    if can_view_all_tenants(user):
        if tedarikci_id is not None:
            return qs.filter(warehouse__sahip_firma_id=tedarikci_id)
        return qs
    return qs.filter(warehouse__sahip_firma_id=user.firma_id)


class SupplierWarehouseListView(APIView):
    """GET/POST /api/v1/supplier/warehouses/ (tedarikçi ve ops depoları)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def get(self, request):
        _require_supplier(request.user)
        request.query_params.get("firma_id")  # ignore
        qs = Warehouse.objects.select_related("sahip_firma").all()
        if can_view_all_tenants(request.user):
            ops_ted = _parse_ops_tedarikci_id(request)
            if ops_ted is not None:
                qs = qs.filter(sahip_firma_id=ops_ted)
        else:
            qs = qs.filter(sahip_firma_id=request.user.firma_id)
        aktif_raw = (request.query_params.get("aktif") or "").strip().lower()
        if aktif_raw in ("1", "true"):
            qs = qs.filter(aktif=True)
        elif aktif_raw in ("0", "false"):
            qs = qs.filter(aktif=False)
        sahip_tipi = (request.query_params.get("sahip_tipi") or "").strip().upper()
        if sahip_tipi in (Warehouse.SahipTipi.PLATFORM, Warehouse.SahipTipi.TEDARIKCI):
            qs = qs.filter(sahip_tipi=sahip_tipi)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(kod__icontains=term)
                | Q(ad__icontains=term)
                | Q(sahip_firma__ad__icontains=term)
            )
        qs = apply_ordering(qs, request, whitelist=("pk", "kod", "ad"), default="kod")
        return paginate_queryset(request, qs, present=present_warehouse)

    def post(self, request):
        _require_supplier(request.user)
        enforce_csrf(request)
        body = request.data if isinstance(request.data, dict) else {}
        sahip_firma = request.user.firma
        if can_view_all_tenants(request.user) and body.get("sahip_firma_id") not in (None, ""):
            try:
                fid = int(body.get("sahip_firma_id"))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"sahip_firma_id": "Geçersiz firma seçimi."}) from exc
            sahip_firma = Firma.objects.filter(pk=fid).first()
            if sahip_firma is None:
                raise ValidationError({"sahip_firma_id": "Firma bulunamadı."})
        try:
            wh = warehouse_servisi.olustur_warehouse(
                actor=request.user,
                sahip_firma=sahip_firma,
                kod=str(body.get("kod") or ""),
                ad=str(body.get("ad") or ""),
                aktif=bool(body.get("aktif", True)),
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_warehouse(wh), status=status.HTTP_201_CREATED)


class SupplierWarehouseDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/supplier/warehouses/<int:pk>/."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def _get_wh(self, user, pk: int) -> Warehouse:
        qs = Warehouse.objects.select_related("sahip_firma")
        if not can_view_all_tenants(user):
            qs = qs.filter(sahip_firma_id=user.firma_id)
        wh = qs.filter(pk=pk).first()
        if wh is None:
            raise NotFound(detail="Depo bulunamadı.")
        return wh

    def get(self, request, pk: int):
        _require_supplier(request.user)
        wh = self._get_wh(request.user, pk)
        return Response(present_warehouse(wh))

    def patch(self, request, pk: int):
        _require_supplier(request.user)
        enforce_csrf(request)
        wh = self._get_wh(request.user, pk)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            wh = warehouse_servisi.guncelle_warehouse(
                actor=request.user,
                warehouse=wh,
                kod=str(body["kod"]) if "kod" in body and body["kod"] is not None else None,
                ad=str(body["ad"]) if "ad" in body and body["ad"] is not None else None,
                aktif=bool(body["aktif"]) if "aktif" in body and body["aktif"] is not None else None,
            )
        except DjangoValidationError as exc:
            raise _django_ve_to_drf(exc) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response(present_warehouse(wh))

    def delete(self, request, pk: int):
        _require_supplier(request.user)
        enforce_csrf(request)
        wh = self._get_wh(request.user, pk)
        try:
            warehouse_servisi.sil_warehouse(actor=request.user, warehouse=wh)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "Bu depoya bağlı stok bakiyesi, hareketi veya rezervasyonu "
                        "bulunduğu için silinemez; pasif hale getirebilirsiniz."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return Response({"deleted": True, "id": pk})


class SupplierVariantListView(APIView):
    """GET /api/v1/supplier/variants/?q=... — teklif/stok/eşleştirme için varyant arama."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def get(self, request):
        if not (can_view_all_tenants(request.user) or getattr(request.user.firma, "tedarikci_mi", False)):
            raise PermissionDenied(detail="Yalnız tedarikçi veya platform yetkisi.")
        qs = scope_teklif_varyant_queryset(
            Varyant.objects.select_related("urun", "renk", "beden").filter(aktif=True),
            request.user,
        )
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(sku__icontains=term)
                | Q(tedarikci_sku__icontains=term)
                | Q(urun__ad__icontains=term)
                | Q(urun__platform_kodu__icontains=term)
            )
        qs = apply_ordering(qs, request, whitelist=("pk", "sku"), default="urun__ad")

        def _present_variant_ref(v: Varyant) -> dict:
            urun = getattr(v, "urun", None)
            renk = getattr(getattr(v, "renk", None), "ad", "") or ""
            beden = getattr(getattr(v, "beden", None), "deger", "") or ""
            parts = [getattr(urun, "ad", "") or "", v.sku or ""]
            if v.gram is not None:
                parts.append(f"{v.gram}g")
            if renk:
                parts.append(renk)
            if beden:
                parts.append(beden)
            item = {
                "id": v.pk,
                "sku": v.sku or "",
                "urun_id": v.urun_id,
                "urun_ad": getattr(urun, "ad", "") or "",
                "platform_kodu": getattr(urun, "platform_kodu", "") or "",
                "gram": str(v.gram) if v.gram is not None else None,
                "renk": renk,
                "beden": beden,
                "etiket": " · ".join(p for p in parts if p),
            }
            assert_masked(item)
            return item

        return paginate_queryset(request, qs, present=_present_variant_ref)


class SupplierStockSummaryView(APIView):
    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def get(self, request):
        _require_supplier(request.user)
        request.query_params.get("firma_id")  # ignore
        ops_ted = (
            _parse_ops_tedarikci_id(request)
            if can_view_all_tenants(request.user)
            else None
        )
        qs = _own_stock_qs(request.user, tedarikci_id=ops_ted)
        wh_id = (request.query_params.get("warehouse_id") or "").strip()
        if wh_id.isdigit():
            qs = qs.filter(warehouse_id=int(wh_id))
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(warehouse__kod__icontains=term)
                | Q(warehouse__ad__icontains=term)
                | Q(varyant__sku__icontains=term)
                | Q(varyant__urun__ad__icontains=term)
                | Q(varyant__urun__platform_kodu__icontains=term)
            )
        qs = apply_ordering(qs, request, whitelist=("pk",), default="pk")
        return paginate_queryset(request, qs, present=present_balance)


class SupplierStockAdjustView(IdempotencyMixin, APIView):
    """POST — ledger_servisi.duzeltme (varyant anahtarı; teklif yok)."""

    permission_classes = [IsAuthenticatedWithFirma]
    throttle_classes = [SupplierRateThrottle]

    def post(self, request):
        _require_supplier(request.user)
        cached = self.idempotency_begin(request)
        if cached is not None:
            return cached
        body = request.data if isinstance(request.data, dict) else {}
        try:
            wh_id = int(body.get("warehouse_id"))
            varyant_id = int(body.get("varyant_id"))
            miktar = Decimal(str(body.get("miktar")))
        except (TypeError, ValueError, InvalidOperation) as exc:
            raise ValidationError(
                detail="warehouse_id, varyant_id ve miktar zorunlu."
            ) from exc
        neden = body.get("neden") or ""

        from fiyatlama.models import VaryantFiyat
        from urunler.models import Varyant

        wh = Warehouse.objects.filter(pk=wh_id).first()
        if wh is None:
            raise NotFound(detail="Depo bulunamadı.")
        if not can_view_all_tenants(request.user):
            if wh.sahip_firma_id != request.user.firma_id:
                raise NotFound(detail="Depo bulunamadı.")
        varyant = Varyant.objects.filter(pk=varyant_id).first()
        if varyant is None:
            raise NotFound(detail="Varyant bulunamadı.")
        vf = VaryantFiyat.objects.filter(
            varyant=varyant, durum=VaryantFiyat.Durum.AKTIF
        ).first()
        if vf is None:
            raise ValidationError(detail="Aktif varyant fiyatı yok; önce fiyat girin.")
        if not can_view_all_tenants(request.user):
            if vf.tedarikci_id != request.user.firma_id:
                raise NotFound(detail="Varyant bulunamadı.")

        try:
            mv = ledger_servisi.duzeltme(
                actor=request.user,
                warehouse=wh,
                varyant=varyant,
                fiyat_modeli=vf.fiyat_modeli,
                tedarikci_id=vf.tedarikci_id,
                miktar=miktar,
                neden=neden,
            )
        except (DjangoValidationError, DjangoPermissionDenied) as exc:
            raise_drf(exc)
        return self.idempotency_commit(
            request,
            Response(present_movement(mv), status=status.HTTP_201_CREATED),
        )
