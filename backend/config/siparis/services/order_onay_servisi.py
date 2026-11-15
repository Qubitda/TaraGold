"""ADR-0034 / ADR-0036 — platform sipariş onay havuzu + tedarikçi bazlı HazirlamaEmri."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models
from django.utils import timezone

from api.masking import assert_masked
from firmalar.role_permissions import P
from firmalar.services.audit_servisi import (
    domain_atomic,
    record_audit,
    record_audit_durable,
)
from firmalar.services.platform_kurulum import ensure_platform_firma
from firmalar.services.yetki_servisi import can_view_all_tenants, require_perm
from siparis.models import HazirlamaEmri, Order


def _require_ops_approve(actor, *, action: str, order_id: str = "") -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if not can_view_all_tenants(actor):
        record_audit_durable(
            actor=actor,
            action=action,
            entity_type="Order",
            entity_id=order_id,
            success=False,
            reason="view_all_yok",
        )
        raise PermissionDenied("Sipariş onayı yalnız platform.")
    require_perm(actor, P["manage_shipment"], message="Ops sipariş yetkisi yok.")


def _set_durum(locked: Order, yeni: str) -> None:
    locked.durum = yeni
    locked._allow_status_transition = True
    try:
        locked.save(update_fields=["durum", "guncelleme_tarihi"])
    finally:
        locked._allow_status_transition = False


def _line_varyant_fiyat(line):
    """Satırdan aktif/bağlı VaryantFiyat (ADR-0001)."""
    from siparis.services.line_kaynak import line_varyant_fiyat

    return line_varyant_fiyat(line)


def _initial_emir_durum(tedarikci_firma) -> str:
    if tedarikci_firma is not None and getattr(
        tedarikci_firma, "otomatik_teyit", False
    ):
        return HazirlamaEmri.Durum.HAZIRLANIYOR
    return HazirlamaEmri.Durum.TEDARIK_BEKLIYOR


def _ensure_hazirlama_emirleri(locked: Order) -> list[HazirlamaEmri]:
    """Bileşen/tedarikçi başına tip'li emir (MONTUR/TAS/HAM); CAKIM ayrı açılır."""
    from firmalar.models import Firma
    from siparis.services.bilesen_servisi import list_bilesenler

    wanted: list[tuple[int, str, int | None, int | None, str]] = []
    # (ted_id, tip, line_id, bilesen_id, teslim)
    for line in locked.lines.select_related(
        "varyant",
        "stock_reservation__warehouse",
        "price_quote__varyant_fiyat",
        "price_lock__quote__varyant_fiyat",
    ):
        tm = getattr(line, "teslim_modeli", HazirlamaEmri.TeslimModeli.PLATFORM_QC)
        bilesenler = list_bilesenler(line.varyant)
        if bilesenler:
            for b in bilesenler:
                tip = (
                    HazirlamaEmri.Tip.MONTUR
                    if b.rol == "MONTUR"
                    else HazirlamaEmri.Tip.TAS
                )
                wanted.append((b.tedarikci_id, tip, line.pk, b.pk, tm))
        else:
            vf = _line_varyant_fiyat(line)
            ted_id = getattr(vf, "tedarikci_id", None) if vf is not None else None
            res = getattr(line, "stock_reservation", None)
            if not ted_id and res is not None:
                ted_id = getattr(res.warehouse, "sahip_firma_id", None)
            if not ted_id:
                continue
            vtip = getattr(line.varyant, "tip", None) or "HAM_ALTIN"
            emir_tip = (
                HazirlamaEmri.Tip.MONTUR
                if vtip == "MONTUR"
                else HazirlamaEmri.Tip.HAM_ALTIN
            )
            wanted.append((ted_id, emir_tip, line.pk, None, tm))

    emirler: list[HazirlamaEmri] = []
    seen: set[tuple[int, str]] = set()
    for ted_id, tip, line_id, bil_id, tm in wanted:
        key = (ted_id, tip)
        if key in seen:
            continue
        seen.add(key)
        ted = Firma.objects.filter(pk=ted_id).first()
        emir, created = HazirlamaEmri.objects.get_or_create(
            order=locked,
            tedarikci_firma_id=ted_id,
            tip=tip,
            defaults={
                "durum": _initial_emir_durum(ted),
                "teslim_modeli": tm,
                "order_line_id": line_id,
                "bilesen_id": bil_id,
            },
        )
        if not created and emir.durum == HazirlamaEmri.Durum.IPTAL:
            continue
        emirler.append(emir)
    return emirler


def _post_order_satis_cari(*, actor, locked: Order) -> list[int]:
    """Onay: HAS + TRY + USD BORÇ. Legacy: snapshot TL."""
    from finans.constants import HAS_KODU, Q2, Q4, TRY_KODU, USD_KODU
    from finans.models import LedgerEntry
    from finans.services import cari_servisi
    from finans.services.finans_audit import record_finans_audit
    from siparis.models import OrderLine

    has_total = Decimal("0")
    try_total = Decimal("0")
    usd_total = Decimal("0")
    legacy_by_pb: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    any_has = False
    # Prefetch cache write_kesin sonrası stale kalır — taze queryset zorunlu.
    for line in OrderLine.objects.filter(order_id=locked.pk):
        if line.has_gram is not None:
            any_has = True
            has_total += Decimal(line.has_gram)
            if line.tl_borc is not None:
                try_total += Decimal(line.tl_borc)
            if getattr(line, "usd_borc", None) is not None:
                usd_total += Decimal(line.usd_borc)
        else:
            pb = (getattr(line, "para_birimi", "") or TRY_KODU).strip().upper()
            tutar = Decimal(line.snapshot_satir_tutari_vergisiz or "0.00")
            if tutar > 0:
                legacy_by_pb[pb] += tutar

    buckets: list[tuple[str, Decimal]] = []
    if any_has:
        if has_total > 0:
            buckets.append((HAS_KODU, has_total.quantize(Q4)))
        if try_total > 0:
            buckets.append((TRY_KODU, try_total.quantize(Q2)))
        if usd_total > 0:
            buckets.append((USD_KODU, usd_total.quantize(Q2)))
    else:
        for pb, total in legacy_by_pb.items():
            buckets.append((pb, total.quantize(Q2)))

    if not buckets:
        return []

    platform = ensure_platform_firma()
    created_ids: list[int] = []
    for pb, total_q in buckets:
        if total_q <= 0:
            continue
        idem_key = f"order-{locked.pk}-satis-{pb}"
        existing = LedgerEntry.objects.filter(
            firma_id=locked.alici_firma_id,
            idempotency_key=idem_key,
        ).first()
        if existing is not None:
            created_ids.append(existing.pk)
            continue
        if LedgerEntry.objects.filter(
            firma_id=locked.alici_firma_id,
            referans_tip="Order",
            referans_id=str(locked.pk),
            hareket_tipi=LedgerEntry.HareketTipi.SATIS,
            para_birimi=pb,
        ).exists():
            continue
        entry = LedgerEntry(
            firma_id=locked.alici_firma_id,
            karsi_firma=platform,
            tutar=total_q,
            para_birimi=pb,
            yon=LedgerEntry.Yon.BORC,
            hareket_tipi=LedgerEntry.HareketTipi.SATIS,
            referans_tip="Order",
            referans_id=str(locked.pk),
            idempotency_key=idem_key,
            aciklama=f"Sipariş #{locked.pk} onay satış borcu ({pb})",
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
        entry.save()
        cari_servisi.uygula_ledger_entry(entry)
        record_finans_audit(
            actor=actor,
            action="finans.ledger.order_satis",
            amount=total_q,
            currency=pb,
            order_ref=str(locked.pk),
            entity_type="LedgerEntry",
            entity_id=str(entry.pk),
            success=True,
            extra={"firma_id": locked.alici_firma_id, "order_id": locked.pk, "adr": "0001"},
        )
        created_ids.append(entry.pk)
    return created_ids


def _assert_benzersiz_sira(locked: Order) -> None:
    """Tek-parça: aynı varyantta daha eski ONAY_BEKLIYOR varsa onay engellenir."""
    for line in locked.lines.select_related("varyant"):
        v = line.varyant
        if v is None or not getattr(v, "benzersiz_parca", False):
            continue
        older = (
            Order.objects.filter(
                durum=Order.Durum.ONAY_BEKLIYOR,
                lines__varyant_id=v.pk,
            )
            .exclude(pk=locked.pk)
            .filter(
                models.Q(olusturma_tarihi__lt=locked.olusturma_tarihi)
                | models.Q(
                    olusturma_tarihi=locked.olusturma_tarihi,
                    pk__lt=locked.pk,
                )
            )
            .order_by("olusturma_tarihi", "pk")
            .first()
        )
        if older is not None:
            raise ValidationError(
                {
                    "benzersiz_parca": (
                        f"Önde bekleyen sipariş #{older.pk} var "
                        f"(SKU {getattr(v, 'sku', '')})."
                    )
                }
            )


def _finalize_line_price_and_stock(*, actor, locked: Order, line, now) -> None:
    """Stok + has_gram/tl_borc kesin; quote yalnız bilgi TL için (ADR-0001)."""
    from fiyatlama.services.pricing_service import quote as create_quote
    from siparis.birim_constants import SepetBirimi
    from siparis.services.checkout_servisi import _resolve_warehouse_for_fiyat
    from siparis.services.has_hesap import compute_line_has_tl, q2
    from stok.services.reservation_servisi import (
        olustur_rezervasyon,
        tuket_rezervasyon,
    )

    vf = _line_varyant_fiyat(line)
    if vf is None:
        raise ValidationError(
            {
                "varyant_fiyat": (
                    f"Satır #{line.pk}: aktif VaryantFiyat yok; onaylanamaz."
                )
            }
        )

    kanal = None
    pq = getattr(line, "price_quote", None)
    if pq is not None:
        kanal = getattr(pq, "satis_kanali", None)
    if kanal is None:
        from tanimlar.models import SatisKanali

        kanal = SatisKanali.objects.filter(aktif=True).order_by("sira", "pk").first()
    if kanal is None:
        raise ValidationError("Satış kanalı yok; onay bilgisi hesaplanamaz.")

    try:
        fresh = create_quote(
            alici_firma=locked.alici_firma,
            satis_kanali=kanal,
            varyant=line.varyant,
            kullanici=actor,
            para_birimi=(line.para_birimi or "TRY").upper(),
            now=now,
        )
    except ValidationError as exc:
        raise ValidationError(
            {"fiyat": f"Satır #{line.pk}: {exc}"}
        ) from exc

    miktar = Decimal(line.miktar)
    birim = line.birim
    calc = compute_line_has_tl(
        miktar=miktar,
        birim=birim,
        quote=fresh,
        vf=vf,
        varyant=line.varyant,
        line=line,
    )
    yaklasik = calc["yaklasik_tl"] or Decimal("0.00")
    if birim == SepetBirimi.ADET:
        birim_fiyat, satir = yaklasik / miktar if miktar else yaklasik, yaklasik
        birim_fiyat = q2(birim_fiyat)
    else:
        birim_fiyat = q2(yaklasik / calc["gram_toplam"]) if calc["gram_toplam"] else yaklasik
        satir = yaklasik

    from siparis.services.bilesen_servisi import list_bilesenler, reserve_bilesen_stocks

    bilesenler = list_bilesenler(line.varyant)
    res = None
    if bilesenler:
        reserve_bilesen_stocks(
            actor=actor, locked=locked, line=line, now=now
        )
    else:
        warehouse = _resolve_warehouse_for_fiyat(vf)
        try:
            res = olustur_rezervasyon(
                actor=actor,
                warehouse=warehouse,
                varyant=line.varyant,
                fiyat_modeli=vf.fiyat_modeli,
                tedarikci_id=vf.tedarikci_id,
                miktar=miktar,
                alici_firma=locked.alici_firma,
                now=now,
                idempotency_key=f"order-onay:{locked.pk}:line:{line.pk}",
            )
            tuket_rezervasyon(res, actor=actor, now=now)
        except ValidationError as exc:
            msg = "; ".join(getattr(exc, "messages", None) or [str(exc)])
            raise ValidationError(
                {
                    "stok": (
                        f"Satır #{line.pk} (SKU {getattr(line.varyant, 'sku', '')}): "
                        f"stok yetersiz veya rezervasyon başarısız — {msg}"
                    )
                }
            ) from exc

    line._allow_kesin_write = True
    try:
        line.tas_agirligi = calc.get("tas_agirligi")
        line.net_altin_gram = calc.get("net_altin_gram")
        if calc.get("gram_toplam") is not None:
            line.gram_toplam = calc["gram_toplam"]
        line.save(
            update_fields=["tas_agirligi", "net_altin_gram", "gram_toplam"]
        )
    finally:
        line._allow_kesin_write = False

    line.write_kesin(
        has_gram=calc["has_gram"],
        tl_borc=calc["tl_borc"],
        usd_borc=calc.get("usd_borc") or Decimal("0.00"),
        birim_fiyat=birim_fiyat,
        satir_tutar=satir,
        stock_reservation=res,
    )


def onayla(*, actor, order: Order) -> Order:
    """Onay: kesin fiyat + stok + HazirlamaEmri + cari (ADR-0038)."""
    _require_ops_approve(
        actor, action="order.onay_denied", order_id=str(order.pk or "")
    )
    now = timezone.now()
    with domain_atomic():
        locked = (
            Order.objects.select_for_update()
            .prefetch_related(
                "lines__varyant",
                "lines__price_quote__varyant_fiyat",
                "lines__price_quote__satis_kanali",
                "lines__stock_reservation__varyant",
            )
            .get(pk=order.pk)
        )
        if locked.durum in (
            Order.Durum.ONAYLANDI,
            Order.Durum.HAZIRLANIYOR,
            Order.Durum.HAZIR,
        ):
            _ensure_hazirlama_emirleri(locked)
            _post_order_satis_cari(actor=actor, locked=locked)
            return locked
        if locked.durum not in (
            Order.Durum.ONAY_BEKLIYOR,
            Order.Durum.OLUSTURULDU,
        ):
            raise ValidationError(f"Onaylanamaz; durum={locked.durum}")

        _assert_benzersiz_sira(locked)

        for line in locked.lines.select_related(
            "varyant",
            "price_quote__varyant_fiyat",
            "price_quote__satis_kanali",
        ):
            # Zaten kesin (has_gram veya legacy snapshot + rezervasyon)
            if line.stock_reservation_id and (
                line.has_gram is not None
                or line.snapshot_satir_tutari_vergisiz is not None
            ):
                continue
            _finalize_line_price_and_stock(
                actor=actor, locked=locked, line=line, now=now
            )

        _set_durum(locked, Order.Durum.ONAYLANDI)
        _set_durum(locked, Order.Durum.HAZIRLANIYOR)
        emirler = _ensure_hazirlama_emirleri(locked)
        satis_ids = _post_order_satis_cari(actor=actor, locked=locked)
        record_audit(
            actor=actor,
            action="order.onaylandi",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "durum": locked.durum,
                "hazirlama_emri_ids": [e.pk for e in emirler],
                "satis_ledger_ids": satis_ids,
                "adr": "0001",
            },
        )
        from firmalar.services import outbox_servisi

        if emirler:
            for emir in emirler:
                outbox_servisi.enqueue(
                    event_type="order.hazirlama_emri",
                    payload={
                        "order_id": locked.pk,
                        "hazirlama_emri_id": emir.pk,
                        "tedarikci_firma_id": emir.tedarikci_firma_id,
                        "maskeli": True,
                    },
                )
        else:
            outbox_servisi.enqueue(
                event_type="order.hazirlama_emri",
                payload={
                    "order_id": locked.pk,
                    "maskeli": True,
                },
            )
        return locked


def reddet(*, actor, order: Order, neden: str = "") -> Order:
    _require_ops_approve(
        actor, action="order.red_denied", order_id=str(order.pk or "")
    )
    neden = (neden or "").strip()
    if not neden:
        raise ValidationError({"neden": "Red nedeni zorunlu."})
    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.durum not in (
            Order.Durum.ONAY_BEKLIYOR,
            Order.Durum.OLUSTURULDU,
        ):
            raise ValidationError(f"Reddedilemez; durum={locked.durum}")
        _set_durum(locked, Order.Durum.REDDEDILDI)
        for emir in HazirlamaEmri.objects.select_for_update().filter(order=locked):
            if emir.durum != HazirlamaEmri.Durum.IPTAL:
                emir.durum = HazirlamaEmri.Durum.IPTAL
                emir._allow_status_transition = True
                try:
                    emir.save(update_fields=["durum", "guncelleme_tarihi"])
                finally:
                    emir._allow_status_transition = False
        record_audit(
            actor=actor,
            action="order.reddedildi",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={"neden": (neden or "")[:200]},
        )
        return locked


def _maybe_open_cakim_and_finish(*, actor, locked: Order) -> None:
    """MONTUR+TAS HAZIR → CAKIM aç (yoksa); tüm emirler HAZIR → sipariş HAZIR."""
    aktif = HazirlamaEmri.objects.filter(order=locked).exclude(
        durum__in=[HazirlamaEmri.Durum.IPTAL, HazirlamaEmri.Durum.REDDEDILDI]
    )
    tips = {e.tip: e for e in aktif}
    has_montur = any(e.tip == HazirlamaEmri.Tip.MONTUR for e in aktif)
    has_tas = any(e.tip == HazirlamaEmri.Tip.TAS for e in aktif)
    montur_ok = (
        not has_montur
        or all(
            e.durum == HazirlamaEmri.Durum.HAZIR
            for e in aktif
            if e.tip == HazirlamaEmri.Tip.MONTUR
        )
    )
    tas_ok = (
        not has_tas
        or all(
            e.durum == HazirlamaEmri.Durum.HAZIR
            for e in aktif
            if e.tip == HazirlamaEmri.Tip.TAS
        )
    )
    if has_montur and has_tas and montur_ok and tas_ok:
        if not any(e.tip == HazirlamaEmri.Tip.CAKIM for e in aktif):
            # CAKIM ops usta seçene kadar bekler; otomatik açılmaz — bayrak audit
            record_audit(
                actor=actor,
                action="order.cakim_hazir",
                entity_type="Order",
                entity_id=str(locked.pk),
                success=True,
                detail={"msg": "MONTUR+TAS HAZIR; CAKIM ops açabilir"},
            )
        elif tips.get(HazirlamaEmri.Tip.CAKIM) and tips[
            HazirlamaEmri.Tip.CAKIM
        ].durum == HazirlamaEmri.Durum.HAZIR:
            if locked.durum == Order.Durum.HAZIRLANIYOR:
                _set_durum(locked, Order.Durum.HAZIR)
            return

    # Taşsız: ham/montür tek başına HAZIR yeterli
    if not has_tas:
        remaining = aktif.exclude(durum=HazirlamaEmri.Durum.HAZIR).exists()
        if not remaining and locked.durum == Order.Durum.HAZIRLANIYOR:
            _set_durum(locked, Order.Durum.HAZIR)


def ac_cakim_emri(
    *, actor, order: Order, usta_firma_id: int, varsayilan_ok: bool = False
) -> HazirlamaEmri:
    """Ops: MONTUR+TAS HAZIR iken CAKIM emri açar (B1 usta seçimi)."""
    _require_ops_approve(
        actor, action="order.cakim_denied", order_id=str(order.pk or "")
    )
    from firmalar.models import Firma

    usta = Firma.objects.filter(pk=usta_firma_id, tedarikci_mi=True).first()
    if usta is None:
        raise ValidationError({"usta_firma_id": "Geçerli tedarikçi usta gerekli."})
    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        aktif = list(
            HazirlamaEmri.objects.select_for_update().filter(order=locked).exclude(
                durum__in=[HazirlamaEmri.Durum.IPTAL, HazirlamaEmri.Durum.REDDEDILDI]
            )
        )
        existing = next(
            (e for e in aktif if e.tip == HazirlamaEmri.Tip.CAKIM), None
        )
        if existing is not None:
            return existing
        montur = [e for e in aktif if e.tip == HazirlamaEmri.Tip.MONTUR]
        tas = [e for e in aktif if e.tip == HazirlamaEmri.Tip.TAS]
        if not montur or not tas:
            raise ValidationError("CAKIM için MONTUR ve TAS emirleri gerekli.")
        if any(e.durum != HazirlamaEmri.Durum.HAZIR for e in montur + tas):
            raise ValidationError(
                "CAKIM yalnız MONTUR ve TAS emirleri HAZIR iken açılır."
            )
        emir = HazirlamaEmri(
            order=locked,
            tedarikci_firma=usta,
            tip=HazirlamaEmri.Tip.CAKIM,
            durum=_initial_emir_durum(usta),
        )
        emir.save()
        record_audit(
            actor=actor,
            action="order.cakim_acildi",
            entity_type="HazirlamaEmri",
            entity_id=str(emir.pk),
            success=True,
            detail={
                "order_id": locked.pk,
                "usta_firma_id": usta.pk,
                "varsayilan_ok": varsayilan_ok,
            },
        )
        return emir


def tedarikci_teyit(
    *, actor, emir: HazirlamaEmri, kabul: bool, not_: str = "", fiyat_degisti: bool = False
) -> HazirlamaEmri:
    """TEDARIK_BEKLIYOR → HAZIRLANIYOR | REDDEDILDI."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    firma = getattr(actor, "firma", None)
    if firma is None or firma.pk != emir.tedarikci_firma_id:
        if not can_view_all_tenants(actor):
            raise PermissionDenied("Yalnız emir tedarikçisi.")
    with domain_atomic():
        locked = HazirlamaEmri.objects.select_for_update().get(pk=emir.pk)
        if locked.durum != HazirlamaEmri.Durum.TEDARIK_BEKLIYOR:
            raise ValidationError(f"Teyit edilemez; durum={locked.durum}")
        locked._allow_status_transition = True
        try:
            if not kabul:
                locked.durum = HazirlamaEmri.Durum.REDDEDILDI
                locked.teyit_notu = (not_ or "")[:255]
                locked.save(
                    update_fields=["durum", "teyit_notu", "guncelleme_tarihi"]
                )
            else:
                if fiyat_degisti and not can_view_all_tenants(actor):
                    locked.fiyat_degisti = True
                    locked.teyit_notu = (not_ or "fiyat değişti")[:255]
                    locked.save(
                        update_fields=[
                            "fiyat_degisti",
                            "teyit_notu",
                            "guncelleme_tarihi",
                        ]
                    )
                    # Ops onayı bekler — HAZIRLANIYOR'a geçmez
                else:
                    locked.durum = HazirlamaEmri.Durum.HAZIRLANIYOR
                    locked.fiyat_degisti = False
                    locked.teyit_notu = (not_ or "")[:255]
                    locked.save(
                        update_fields=[
                            "durum",
                            "fiyat_degisti",
                            "teyit_notu",
                            "guncelleme_tarihi",
                        ]
                    )
        finally:
            locked._allow_status_transition = False
        record_audit(
            actor=actor,
            action="order.tedarikci_teyit",
            entity_type="HazirlamaEmri",
            entity_id=str(locked.pk),
            success=True,
            detail={"kabul": kabul, "fiyat_degisti": fiyat_degisti},
        )
        return locked


def ops_teyit_fiyat_onay(*, actor, emir: HazirlamaEmri) -> HazirlamaEmri:
    """Fiyat değişimli teyidi ops onaylayıp HAZIRLANIYOR yapar."""
    _require_ops_approve(
        actor, action="order.teyit_fiyat_denied", order_id=str(emir.order_id)
    )
    with domain_atomic():
        locked = HazirlamaEmri.objects.select_for_update().get(pk=emir.pk)
        if locked.durum != HazirlamaEmri.Durum.TEDARIK_BEKLIYOR or not locked.fiyat_degisti:
            raise ValidationError("Ops fiyat onayı bu emir için geçerli değil.")
        locked.durum = HazirlamaEmri.Durum.HAZIRLANIYOR
        locked.fiyat_degisti = False
        locked._allow_status_transition = True
        try:
            locked.save(
                update_fields=["durum", "fiyat_degisti", "guncelleme_tarihi"]
            )
        finally:
            locked._allow_status_transition = False
        return locked


def tedarikci_hazir_isaretle(
    *, actor, order: Order, tip: str | None = None, emir_id: int | None = None
) -> Order:
    """Tedarikçi emrini HAZIR yapar; zincir tamamsa sipariş HAZIR."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    firma = getattr(actor, "firma", None)
    if firma is None or not getattr(firma, "tedarikci_mi", False):
        raise PermissionDenied("Yalnız tedarikçi.")
    with domain_atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.durum not in (Order.Durum.HAZIRLANIYOR, Order.Durum.HAZIR):
            raise ValidationError(f"Hazır işaretlenemez; durum={locked.durum}")

        qs = HazirlamaEmri.objects.select_for_update().filter(
            order=locked, tedarikci_firma_id=firma.pk
        )
        if emir_id:
            emir = qs.filter(pk=emir_id).first()
        elif tip:
            emir = qs.filter(tip=tip).first()
        else:
            emir = qs.exclude(tip=HazirlamaEmri.Tip.CAKIM).first() or qs.first()
        if emir is None:
            raise PermissionDenied("Bu siparişte emriniz yok.")
        if emir.durum in (
            HazirlamaEmri.Durum.IPTAL,
            HazirlamaEmri.Durum.REDDEDILDI,
            HazirlamaEmri.Durum.TEDARIK_BEKLIYOR,
        ):
            raise ValidationError(
                f"Hazır işaretlenemez; durum={emir.durum}"
            )
        if emir.fiyat_degisti:
            raise ValidationError("Fiyat değişimi ops onayı bekliyor.")

        if emir.durum != HazirlamaEmri.Durum.HAZIR:
            emir.durum = HazirlamaEmri.Durum.HAZIR
            emir.hazir_zamani = timezone.now()
            emir.hazir_isaretleyen = actor
            emir._allow_status_transition = True
            try:
                emir.save(
                    update_fields=[
                        "durum",
                        "hazir_zamani",
                        "hazir_isaretleyen",
                        "guncelleme_tarihi",
                    ]
                )
            finally:
                emir._allow_status_transition = False

        _maybe_open_cakim_and_finish(actor=actor, locked=locked)
        record_audit(
            actor=actor,
            action="order.tedarikci_hazir",
            entity_type="Order",
            entity_id=str(locked.pk),
            success=True,
            detail={
                "hazirlama_emri_id": emir.pk,
                "tip": emir.tip,
                "order_durum": locked.durum,
            },
        )
        return locked


def present_hazirlama_emri(
    order: Order, *, tedarikci_firma_id: int | None = None
) -> dict:
    """Tedarikçiye maskeli DTO — yalnız ilgili tedarikçinin satırları, alıcı kimliği yok."""
    from siparis.services.line_kaynak import line_tedarikci_id

    lines = []
    qs = order.lines.select_related(
        "varyant",
        "varyant__urun",
        "stock_reservation__warehouse",
        "price_quote__varyant_fiyat",
        "price_lock__quote__varyant_fiyat",
    )
    for line in qs:
        if tedarikci_firma_id is not None:
            ted = line_tedarikci_id(line)
            if ted != tedarikci_firma_id:
                continue
        lines.append(
            {
                "order_line_id": line.pk,
                "varyant_id": line.varyant_id,
                "platform_kodu": getattr(line.varyant, "sku", None)
                or getattr(getattr(line.varyant, "urun", None), "platform_kodu", ""),
                "urun_ad": getattr(getattr(line.varyant, "urun", None), "ad", ""),
                "miktar": str(line.miktar),
                "birim": line.birim,
                "gram_toplam": str(line.gram_toplam) if line.gram_toplam is not None else None,
                "milyem": str(line.milyem) if line.milyem is not None else None,
                "has_gram": str(line.has_gram) if line.has_gram is not None else None,
                "teslim_modeli": getattr(line, "teslim_modeli", "PLATFORM_QC"),
            }
        )

    emir = None
    if tedarikci_firma_id is not None:
        emir = HazirlamaEmri.objects.filter(
            order_id=order.pk, tedarikci_firma_id=tedarikci_firma_id
        ).first()

    data = {
        "order_id": order.pk,
        "hazirlama_emri_id": emir.pk if emir else None,
        "durum": emir.durum if emir else order.durum,
        "order_durum": order.durum,
        "teslim_modeli": emir.teslim_modeli if emir else "PLATFORM_QC",
        "hazir_zamani": emir.hazir_zamani.isoformat()
        if (emir and emir.hazir_zamani)
        else None,
        "satirlar": lines,
        # Kör havuz
        "alici": None,
    }
    assert_masked(data, context="supplier")
    return data
