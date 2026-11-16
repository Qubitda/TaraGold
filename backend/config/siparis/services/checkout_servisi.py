"""Checkout — quote doğrulama → sipariş adayı (ADR-0038; kilit/stok yok)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from siparis.models import Cart, CartLine, CheckoutAttempt
from siparis.services.cart_servisi import _assert_buyer_actor
from stok.models import Warehouse


@dataclass(frozen=True)
class CheckoutLineResult:
    cart_line_id: int
    quote_id: int
    miktar: Decimal
    birim: str
    # Geriye dönük alanlar (FE/eski istemci) — ADR-0038 sonrası 0/None
    lock_id: int = 0
    reservation_id: int = 0
    warehouse_id: int = 0


@dataclass(frozen=True)
class CheckoutResult:
    attempt: CheckoutAttempt
    lines: tuple[CheckoutLineResult, ...]


def _resolve_warehouse_for_fiyat(varyant_fiyat) -> Warehouse:
    if varyant_fiyat is None:
        raise ValidationError("Quote fiyat kaynağı yok; checkout yapılamaz.")
    wh = (
        Warehouse.objects.filter(
            sahip_firma_id=varyant_fiyat.tedarikci_id,
            sahip_tipi=Warehouse.SahipTipi.TEDARIKCI,
            aktif=True,
        )
        .order_by("pk")
        .first()
    )
    if wh is None:
        raise ValidationError(
            "Tedarikçinin aktif deposu yok; checkout yapılamaz."
        )
    return wh


# Geriye dönük alias
_resolve_warehouse_for_teklif = _resolve_warehouse_for_fiyat


def _record_failed_attempt(
    *,
    actor,
    alici_firma,
    cart,
    key: str,
    reason: str,
    detail: dict | None = None,
) -> None:
    record_audit_durable(
        actor=actor,
        action="checkout.fail",
        entity_type="CheckoutAttempt",
        entity_id="",
        success=False,
        reason=reason[:255],
        detail={
            "alici_firma_id": alici_firma.pk,
            "cart_id": getattr(cart, "pk", None),
            "idempotency_key": key,
            **(detail or {}),
        },
    )
    prior = CheckoutAttempt.objects.filter(
        alici_firma=alici_firma, idempotency_key=key
    ).first()
    if prior is not None and prior.durum == CheckoutAttempt.Durum.BASARILI:
        return
    CheckoutAttempt.objects.update_or_create(
        alici_firma=alici_firma,
        idempotency_key=key,
        defaults={
            "cart": cart,
            "durum": CheckoutAttempt.Durum.BASARISIZ,
            "sonuc": {},
            "hata_mesaji": reason[:255],
            "olusturan": actor,
        },
    )


def _adres_snapshot(*, alici_firma, adres_id, alan: str) -> dict | None:
    """FirmaAdresi → kör snapshot (başka tenant id sızdırılmaz)."""
    if adres_id in (None, ""):
        return None
    try:
        aid = int(adres_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({alan: "Geçersiz adres id."}) from exc
    from firmalar.models import FirmaAdresi

    adr = FirmaAdresi.objects.filter(pk=aid, firma_id=alici_firma.pk).first()
    if adr is None:
        raise ValidationError({alan: "Adres bulunamadı veya firmaya ait değil."})
    return {
        "id": adr.pk,
        "tip": adr.tip,
        "il": adr.il,
        "ilce": adr.ilce or "",
        "adres": adr.adres,
    }


def checkout(
    *,
    actor,
    cart: Cart | None = None,
    idempotency_key: str,
    now=None,
    teslimat_adresi_id=None,
    fatura_adresi_id=None,
    siparis_notu: str = "",
) -> CheckoutResult:
    """Sepet satırlarını doğrular; CheckoutAttempt üretir (kilit/stok yok — ADR-0038)."""
    now = now or timezone.now()
    del now  # TTL zorunlu değil; quote varlık kontrolü yeterli
    key = (idempotency_key or "").strip()
    if not key:
        raise ValidationError("idempotency_key zorunlu.")

    alici_firma = getattr(actor, "firma", None)
    try:
        _assert_buyer_actor(actor, alici_firma)
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="checkout.fail",
            entity_type="CheckoutAttempt",
            entity_id="",
            success=False,
            reason=str(exc),
            detail={"idempotency_key": key},
        )
        raise

    if cart is None:
        cart = Cart.objects.filter(alici_firma=alici_firma).first()
    if cart is None or cart.alici_firma_id != alici_firma.pk:
        record_audit_durable(
            actor=actor,
            action="checkout.fail",
            entity_type="CheckoutAttempt",
            entity_id="",
            success=False,
            reason="Sepet bulunamadı.",
            detail={"idempotency_key": key},
        )
        raise ValidationError("Sepet bulunamadı.")

    existing = CheckoutAttempt.objects.filter(
        alici_firma=alici_firma, idempotency_key=key
    ).first()
    if existing is not None and existing.durum == CheckoutAttempt.Durum.BASARILI:
        lines = tuple(
            CheckoutLineResult(
                cart_line_id=int(row["cart_line_id"]),
                quote_id=int(row["quote_id"]),
                miktar=Decimal(row["miktar"]),
                birim=row["birim"],
                lock_id=int(row.get("lock_id") or 0),
                reservation_id=int(row.get("reservation_id") or 0),
                warehouse_id=int(row.get("warehouse_id") or 0),
            )
            for row in (existing.sonuc.get("lines") or [])
        )
        return CheckoutResult(attempt=existing, lines=lines)

    lines_qs = list(
        CartLine.objects.select_related(
            "price_quote",
            "price_quote__varyant_fiyat",
            "price_quote__varyant",
            "price_quote__varyant__urun",
        ).filter(cart=cart)
    )
    if not lines_qs:
        _record_failed_attempt(
            actor=actor,
            alici_firma=alici_firma,
            cart=cart,
            key=key,
            reason="Sepet boş; checkout yapılamaz.",
        )
        raise ValidationError("Sepet boş; checkout yapılamaz.")

    try:
        with domain_atomic():
            line_results: list[CheckoutLineResult] = []
            for cl in lines_qs:
                quote = cl.price_quote
                if quote is None:
                    raise ValidationError("Sepet satırında quote yok.")
                if quote.alici_firma_id != alici_firma.pk:
                    raise ValidationError("Sepet satırı quote firması uyumsuz.")
                if not quote.varyant.aktif:
                    raise ValidationError("Varyant pasif; checkout fail.")
                urun = quote.varyant.urun
                if urun.onay_durumu != "onayli" or urun.yayin_durumu != "aktif":
                    raise ValidationError("Ürün yayınlı değil; checkout fail.")
                vf = quote.varyant_fiyat
                if vf is None:
                    raise ValidationError("Quote varyant fiyatı yok; checkout fail.")
                # Depo var mı kontrolü (onayda kullanılacak); stok tutulmaz
                _resolve_warehouse_for_fiyat(vf)
                # ADR-0043: taş quote'ları için depo doğrula
                bilesim = getattr(cl, "bilesim", None) or {}
                if bilesim.get("schema") == "adr0043.v1":
                    from fiyatlama.models import PriceQuote

                    for t in bilesim.get("taslar") or []:
                        tq = (
                            PriceQuote.objects.select_related("varyant_fiyat")
                            .filter(pk=int(t["quote_id"]))
                            .first()
                        )
                        if tq is None:
                            raise ValidationError("Bileşim taş quote bulunamadı.")
                        if tq.alici_firma_id != alici_firma.pk:
                            raise ValidationError("Taş quote tenant uyumsuz.")
                        _resolve_warehouse_for_fiyat(tq.varyant_fiyat)

                line_results.append(
                    CheckoutLineResult(
                        cart_line_id=cl.pk,
                        quote_id=quote.pk,
                        miktar=cl.miktar,
                        birim=cl.birim,
                    )
                )

            teslimat = _adres_snapshot(
                alici_firma=alici_firma,
                adres_id=teslimat_adresi_id,
                alan="teslimat_adresi_id",
            )
            fatura = _adres_snapshot(
                alici_firma=alici_firma,
                adres_id=fatura_adresi_id,
                alan="fatura_adresi_id",
            )
            notu = (siparis_notu or "").strip()[:1000]
            cl_by_id = {cl.pk: cl for cl in lines_qs}
            sonuc = {
                "lines": [
                    {
                        "cart_line_id": r.cart_line_id,
                        "quote_id": r.quote_id,
                        "miktar": str(r.miktar),
                        "birim": r.birim,
                        "bilesim": getattr(cl_by_id.get(r.cart_line_id), "bilesim", None),
                    }
                    for r in line_results
                ],
                "teslimat_adresi": teslimat,
                "fatura_adresi": fatura,
                "siparis_notu": notu,
            }
            attempt, _ = CheckoutAttempt.objects.update_or_create(
                alici_firma=alici_firma,
                idempotency_key=key,
                defaults={
                    "cart": cart,
                    "durum": CheckoutAttempt.Durum.BASARILI,
                    "sonuc": sonuc,
                    "hata_mesaji": "",
                    "olusturan": actor,
                },
            )
            record_audit(
                actor=actor,
                action="checkout.success",
                entity_type="CheckoutAttempt",
                entity_id=str(attempt.pk),
                success=True,
                detail={
                    "idempotency_key": key,
                    "line_count": len(line_results),
                    "adr": "0038",
                },
            )
            return CheckoutResult(
                attempt=attempt, lines=tuple(line_results)
            )
    except (ValidationError, PermissionDenied) as exc:
        reason = str(exc)
        if isinstance(exc, ValidationError) and hasattr(exc, "messages"):
            reason = "; ".join(str(m) for m in exc.messages)
        record_audit_durable(
            actor=actor,
            action="checkout.fail",
            entity_type="CheckoutAttempt",
            entity_id="",
            success=False,
            reason=reason[:255],
            detail={
                "alici_firma_id": alici_firma.pk,
                "cart_id": cart.pk,
                "idempotency_key": key,
            },
        )
        prior = CheckoutAttempt.objects.filter(
            alici_firma=alici_firma, idempotency_key=key
        ).first()
        if prior is None or prior.durum != CheckoutAttempt.Durum.BASARILI:
            CheckoutAttempt.objects.update_or_create(
                alici_firma=alici_firma,
                idempotency_key=key,
                defaults={
                    "cart": cart,
                    "durum": CheckoutAttempt.Durum.BASARISIZ,
                    "sonuc": {},
                    "hata_mesaji": reason[:255],
                    "olusturan": actor,
                },
            )
        raise
