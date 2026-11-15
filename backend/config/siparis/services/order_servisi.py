"""Order oluşturma / iptal — ADR-0038 (tahmini fiyat; stok onayda)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services import outbox_servisi
from fiyatlama.models import PriceQuote
from siparis.birim_constants import SepetBirimi
from siparis.models import CartLine, CheckoutAttempt, Order, OrderLine
from siparis.services.cart_servisi import _assert_buyer_actor
from stok.models import StockMovement, StockReservation
from stok.services.ledger_servisi import (
    get_or_create_balance_locked,
    save_balance_fields,
)

_CENT = Decimal("0.01")


def _q2(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def _tahmini_from_quote(
    *, quote, miktar: Decimal, birim: str
) -> tuple[Decimal, Decimal]:
    """Quote toplamı → tahmini birim/satır (ADR-0038)."""
    toplam = Decimal(quote.toplam_vergisiz)
    if birim == SepetBirimi.ADET:
        return toplam, _q2(toplam * miktar)

    quote_gram = getattr(quote, "gram", None)
    if quote_gram is None or Decimal(quote_gram) <= 0:
        raise ValidationError(
            "GRAM sipariş için PriceQuote.gram zorunlu; satır tutarı hesaplanamaz."
        )
    qg = Decimal(quote_gram)
    birim_fiyat = _q2(toplam / qg)
    return birim_fiyat, _q2(birim_fiyat * miktar)


# Geriye dönük alias (eski testler)
def _snapshot_from_lock(*, lock, miktar: Decimal, birim: str) -> tuple[Decimal, Decimal]:
    return _tahmini_from_quote(quote=lock.quote, miktar=miktar, birim=birim)


def olustur_from_checkout(
    *,
    actor,
    checkout_attempt: CheckoutAttempt,
    now=None,
) -> Order:
    """Başarılı checkout → ONAY_BEKLIYOR; tahmini fiyat; stok tutulmaz (ADR-0038)."""
    now = now or timezone.now()
    del now
    alici_firma = getattr(actor, "firma", None)

    try:
        _assert_buyer_actor(actor, alici_firma)
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="order.create",
            entity_type="Order",
            entity_id="",
            success=False,
            reason=str(exc),
            detail={"checkout_attempt_id": checkout_attempt.pk},
        )
        raise

    if checkout_attempt.alici_firma_id != alici_firma.pk:
        record_audit_durable(
            actor=actor,
            action="order.create",
            entity_type="Order",
            entity_id="",
            success=False,
            reason="Checkout firması aktör ile uyumsuz.",
            detail={"checkout_attempt_id": checkout_attempt.pk},
        )
        raise PermissionDenied("Checkout firması aktör ile uyumsuz.")

    if checkout_attempt.durum != CheckoutAttempt.Durum.BASARILI:
        raise ValidationError("Yalnız başarılı checkout siparişe dönüşür.")

    existing = Order.objects.filter(checkout_attempt=checkout_attempt).first()
    if existing is not None:
        return existing

    rows = checkout_attempt.sonuc.get("lines") or []
    if not rows:
        raise ValidationError("Checkout sonucunda satır yok.")

    try:
        with domain_atomic():
            locked_attempt = (
                CheckoutAttempt.objects.select_for_update()
                .filter(pk=checkout_attempt.pk)
                .first()
            )
            existing = Order.objects.filter(
                checkout_attempt_id=locked_attempt.pk
            ).first()
            if existing is not None:
                return existing

            cart_sube = None
            cart = getattr(alici_firma, "cart", None)
            if cart is not None:
                cart_sube = cart.sube
            if cart_sube is not None and cart_sube.firma_id != alici_firma.pk:
                raise ValidationError("Sepet org birimi firma ile uyumsuz.")

            order = Order(
                alici_firma=alici_firma,
                sube=cart_sube,
                checkout_attempt=locked_attempt,
                durum=Order.Durum.ONAY_BEKLIYOR,
                idempotency_key=locked_attempt.idempotency_key,
                olusturan=actor,
            )
            order.save()

            for row in rows:
                quote = (
                    PriceQuote.objects.select_related("varyant")
                    .filter(pk=int(row["quote_id"]))
                    .first()
                )
                if quote is None:
                    raise ValidationError("Checkout quote bulunamadı.")
                if quote.alici_firma_id != alici_firma.pk:
                    raise ValidationError("Quote tenant uyumsuz.")

                miktar = Decimal(row["miktar"])
                birim = row["birim"]
                birim_fiyat, satir_tutar = _tahmini_from_quote(
                    quote=quote, miktar=miktar, birim=birim
                )
                from siparis.services.has_hesap import compute_line_has_tl
                from siparis.services.line_kaynak import line_varyant_fiyat

                vf = getattr(quote, "varyant_fiyat", None)
                if vf is None:
                    # Fake line shim for resolver
                    class _Tmp:
                        price_quote = quote
                        price_lock = None
                        varyant = quote.varyant

                    vf = line_varyant_fiyat(_Tmp())
                calc = compute_line_has_tl(
                    miktar=miktar,
                    birim=birim,
                    quote=quote,
                    vf=vf,
                    varyant=quote.varyant,
                )

                line = OrderLine(
                    order=order,
                    varyant_id=quote.varyant_id,
                    price_quote=quote,
                    price_lock=None,
                    stock_reservation=None,
                    miktar=miktar,
                    birim=birim,
                    gram_toplam=calc["gram_toplam"],
                    tas_agirligi=calc.get("tas_agirligi"),
                    net_altin_gram=calc.get("net_altin_gram"),
                    milyem=calc["milyem"],
                    iscilik_birimi=calc["iscilik_birimi"],
                    tahmini_has_gram=calc["tahmini_has_gram"],
                    has_gram=None,
                    tl_borc=None,
                    usd_borc=None,
                    tahmini_birim_fiyat_vergisiz=birim_fiyat,
                    tahmini_satir_tutari_vergisiz=satir_tutar,
                    snapshot_birim_fiyat_vergisiz=None,
                    snapshot_satir_tutari_vergisiz=None,
                    para_birimi=quote.para_birimi,
                )
                line.save()

            from firmalar.services.limiti_servisi import assert_order_limit

            assert_order_limit(order)

            if locked_attempt.cart_id:
                CartLine.objects.filter(cart_id=locked_attempt.cart_id).delete()

            record_audit(
                actor=actor,
                action="order.create",
                entity_type="Order",
                entity_id=str(order.pk),
                success=True,
                detail={
                    "checkout_attempt_id": locked_attempt.pk,
                    "line_count": len(rows),
                    "idempotency_key": order.idempotency_key,
                    "adr": "0001",
                },
            )
            outbox_servisi.enqueue(
                event_type="order.created",
                payload={
                    "order_id": order.pk,
                    "alici_firma_id": alici_firma.pk,
                    "idempotency_key": order.idempotency_key,
                    "line_count": len(rows),
                },
            )
            return order
    except (ValidationError, PermissionDenied) as exc:
        reason = str(exc)
        if isinstance(exc, ValidationError) and hasattr(exc, "messages"):
            reason = "; ".join(str(m) for m in exc.messages)
        record_audit_durable(
            actor=actor,
            action="order.create",
            entity_type="Order",
            entity_id="",
            success=False,
            reason=reason[:255],
            detail={"checkout_attempt_id": checkout_attempt.pk},
        )
        raise


def iptal_siparis(*, actor, order: Order, now=None) -> Order:
    """OLUSTURULDU → IPTAL; satır başına IADE movement (F4-053). Ödeme iadesi yok."""
    now = now or timezone.now()
    alici_firma = getattr(actor, "firma", None)

    try:
        _assert_buyer_actor(actor, alici_firma)
    except PermissionDenied as exc:
        record_audit_durable(
            actor=actor,
            action="order.cancel",
            entity_type="Order",
            entity_id=str(order.pk or ""),
            success=False,
            reason=str(exc),
            detail={"order_id": order.pk},
        )
        raise

    if order.alici_firma_id != alici_firma.pk:
        record_audit_durable(
            actor=actor,
            action="order.cancel",
            entity_type="Order",
            entity_id=str(order.pk or ""),
            success=False,
            reason="Sipariş firması aktör ile uyumsuz.",
            detail={"order_id": order.pk},
        )
        raise PermissionDenied("Sipariş firması aktör ile uyumsuz.")

    if order.durum == Order.Durum.IPTAL:
        return order

    # ADR-0001: onay sonrası HAZIRLANIYOR da iptal edilebilir (aktif sevkiyat yoksa).
    _iptal_izinli = {
        Order.Durum.OLUSTURULDU,
        Order.Durum.ONAY_BEKLIYOR,
        Order.Durum.ONAYLANDI,
        Order.Durum.HAZIRLANIYOR,
        Order.Durum.REDDEDILDI,
    }
    if order.durum not in _iptal_izinli:
        raise ValidationError(f"İptal edilemez; durum={order.durum}")

    try:
        with domain_atomic():
            locked = (
                Order.objects.select_for_update()
                .prefetch_related(
                    "lines__stock_reservation__warehouse",
                    "lines__stock_reservation__varyant",
                )
                .filter(pk=order.pk)
                .first()
            )
            if locked is None:
                raise ValidationError("Sipariş bulunamadı.")
            if locked.durum == Order.Durum.IPTAL:
                return locked
            if locked.durum not in _iptal_izinli:
                raise ValidationError(
                    f"İptal edilemez; durum={locked.durum}"
                )

            # K1: aktif sevkiyat veya stok iadesi yapılmış iade → çift IADE engeli
            from lojistik.models import ReturnRequest, Shipment

            if (
                Shipment.objects.filter(order_id=locked.pk)
                .exclude(durum=Shipment.Durum.IPTAL)
                .exists()
            ):
                raise ValidationError(
                    "İptal edilemez: aktif sevkiyat var (IADE çakışması)."
                )
            if ReturnRequest.objects.filter(
                order_id=locked.pk, stok_iade_yapildi=True
            ).exists():
                raise ValidationError(
                    "İptal edilemez: stok iadesi yapılmış iade kaydı var."
                )

            iade_ids: list[int] = []
            # ADR-0038: ONAY_BEKLIYOR ve stoksuz satırda IADE yok
            for line in locked.lines.all():
                res = line.stock_reservation
                if res is None:
                    continue
                if res.durum != StockReservation.Durum.TUKETILDI:
                    # Onay öncesi / tüketilmemiş hold — stok bırakılacak bir şey yok
                    if locked.durum in (
                        Order.Durum.ONAY_BEKLIYOR,
                        Order.Durum.REDDEDILDI,
                    ):
                        continue
                    raise ValidationError(
                        "İptal için satır rezervasyonu tüketilmiş olmalı."
                    )
                miktar = line.miktar
                if miktar <= 0:
                    raise ValidationError("İade miktarı pozitif olmalı.")

                bal = get_or_create_balance_locked(
                    warehouse=res.warehouse,
                    varyant=res.varyant,
                    birim=res.birim,
                )
                bal.on_hand = bal.on_hand + miktar
                save_balance_fields(bal, update_fields=["on_hand"])

                mv = StockMovement(
                    warehouse=res.warehouse,
                    varyant=res.varyant,
                    birim=line.birim,
                    miktar=miktar,
                    tip=StockMovement.Tip.IADE,
                    neden=f"order_cancel:{locked.pk}:line:{line.pk}",
                    olusturan=actor,
                )
                mv.save()
                iade_ids.append(mv.pk)

                # F5-041b: release tüketimini geri al
                from fiyatlama.services.release_servisi import iade_order_line

                iade_order_line(actor=actor, order_line=line)

            from siparis.models import HazirlamaEmri

            prior_durum = locked.durum
            for emir in HazirlamaEmri.objects.select_for_update().filter(order=locked):
                if emir.durum != HazirlamaEmri.Durum.IPTAL:
                    emir.durum = HazirlamaEmri.Durum.IPTAL
                    emir._allow_status_transition = True
                    try:
                        emir.save(update_fields=["durum", "guncelleme_tarihi"])
                    finally:
                        emir._allow_status_transition = False

            # K-normatif: onaylanmış siparişte yazılmış SATIS cari borcunu CONTRA ile tersle
            from finans.models import LedgerEntry
            from finans.services import cari_servisi
            from finans.services.finans_audit import record_finans_audit

            satis_entries = list(
                LedgerEntry.objects.filter(
                    firma_id=locked.alici_firma_id,
                    referans_tip="Order",
                    referans_id=str(locked.pk),
                    hareket_tipi=LedgerEntry.HareketTipi.SATIS,
                )
            )
            contra_ids: list[int] = []
            for le in satis_entries:
                if LedgerEntry.objects.filter(contra_of=le).exists():
                    continue
                contra_key = f"order-{locked.pk}-cancel-contra-{le.pk}"
                existing_c = LedgerEntry.objects.filter(
                    firma_id=le.firma_id, idempotency_key=contra_key
                ).first()
                if existing_c is not None:
                    contra_ids.append(existing_c.pk)
                    continue
                opposite = (
                    LedgerEntry.Yon.ALACAK
                    if le.yon == LedgerEntry.Yon.BORC
                    else LedgerEntry.Yon.BORC
                )
                contra = LedgerEntry(
                    firma_id=le.firma_id,
                    karsi_firma=le.karsi_firma,
                    tutar=le.tutar,
                    para_birimi=le.para_birimi,
                    yon=opposite,
                    hareket_tipi=LedgerEntry.HareketTipi.CONTRA,
                    referans_tip="Order",
                    referans_id=str(locked.pk),
                    contra_of=le,
                    idempotency_key=contra_key,
                    aciklama=f"Sipariş #{locked.pk} iptal ters kayıt",
                    olusturan=actor if getattr(actor, "pk", None) else None,
                )
                contra.save()
                if contra.karsi_firma_id is not None:
                    cari_servisi.uygula_ledger_entry(contra)
                record_finans_audit(
                    actor=actor,
                    action="finans.ledger.order_cancel_contra",
                    amount=contra.tutar,
                    currency=contra.para_birimi,
                    order_ref=str(locked.pk),
                    entity_type="LedgerEntry",
                    entity_id=str(contra.pk),
                    success=True,
                    extra={"contra_of_id": le.pk, "order_id": locked.pk},
                )
                contra_ids.append(contra.pk)

            locked.durum = Order.Durum.IPTAL
            locked._allow_status_transition = True
            try:
                locked.save(update_fields=["durum", "guncelleme_tarihi"])
            finally:
                locked._allow_status_transition = False

            record_audit(
                actor=actor,
                action="order.cancel",
                entity_type="Order",
                entity_id=str(locked.pk),
                success=True,
                detail={
                    "from": prior_durum,
                    "to": Order.Durum.IPTAL,
                    "iade_movement_ids": iade_ids,
                    "contra_ledger_ids": contra_ids,
                    "now": now.isoformat(),
                },
            )
            from firmalar.services import outbox_servisi

            outbox_servisi.enqueue(
                event_type="order.cancelled",
                payload={
                    "order_id": locked.pk,
                    "alici_firma_id": locked.alici_firma_id,
                },
            )
            return locked
    except (ValidationError, PermissionDenied) as exc:
        reason = str(exc)
        if isinstance(exc, ValidationError) and hasattr(exc, "messages"):
            reason = "; ".join(str(m) for m in exc.messages)
        record_audit_durable(
            actor=actor,
            action="order.cancel",
            entity_type="Order",
            entity_id=str(order.pk or ""),
            success=False,
            reason=reason[:255],
            detail={"order_id": order.pk},
        )
        raise
