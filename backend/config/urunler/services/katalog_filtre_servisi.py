"""Ops/buyer katalog liste filtreleri — ortak Q üretimi."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Exists, OuterRef, Q, QuerySet

from urunler.models import UrunGorsel, Varyant


def apply_katalog_list_filters(qs: QuerySet, params) -> QuerySet:
    """QueryDict / mapping üzerinden filtre uygular (N+1 yok; annotate gerektiğinde ekler)."""
    get = params.get if hasattr(params, "get") else lambda k, d=None: params.get(k, d)

    onay = (get("onay_durumu") or "").strip()
    if onay:
        qs = qs.filter(onay_durumu=onay)
    yayin = (get("yayin_durumu") or "").strip()
    if yayin:
        qs = qs.filter(yayin_durumu=yayin)

    kat_id = (get("kategori_id") or "").strip()
    if kat_id.isdigit():
        # Alt kategoriler dahil
        from urunler.models import Kategori

        root = Kategori.objects.filter(pk=int(kat_id)).first()
        if root is not None:
            ids = [root.pk]
            frontier = [root.pk]
            while frontier:
                kids = list(
                    Kategori.objects.filter(ust_id__in=frontier).values_list("pk", flat=True)
                )
                frontier = [k for k in kids if k not in ids]
                ids.extend(frontier)
            qs = qs.filter(kategori_id__in=ids)

    for key, field in (
        ("ayar_id", "ayar_id"),
        ("koleksiyon_id", "koleksiyon_id"),
    ):
        raw = (get(key) or "").strip()
        if raw.isdigit():
            qs = qs.filter(**{field: int(raw)})

    stil_id = (get("stil_id") or "").strip()
    if stil_id.isdigit():
        qs = qs.filter(stiller__id=int(stil_id))

    teknik_id = (get("teknik_id") or "").strip()
    if teknik_id.isdigit():
        qs = qs.filter(teknikler__id=int(teknik_id))

    renk_id = (get("renk_id") or "").strip()
    beden_id = (get("beden_id") or "").strip()
    if renk_id.isdigit() or beden_id.isdigit():
        vq = Q()
        if renk_id.isdigit():
            vq &= Q(varyantlar__renk_id=int(renk_id), varyantlar__aktif=True)
        if beden_id.isdigit():
            vq &= Q(varyantlar__beden_id=int(beden_id), varyantlar__aktif=True)
        qs = qs.filter(vq)

    gram_min = (get("gram_min") or "").strip()
    gram_max = (get("gram_max") or "").strip()
    if gram_min or gram_max:
        try:
            gq = Q(varyantlar__aktif=True)
            if gram_min:
                gq &= Q(varyantlar__gram__gte=Decimal(gram_min))
            if gram_max:
                gq &= Q(varyantlar__gram__lte=Decimal(gram_max))
            qs = qs.filter(gq)
        except (InvalidOperation, ValueError):
            pass

    term = (get("q") or "").strip()
    if term:
        qs = qs.filter(
            Q(ad__icontains=term)
            | Q(platform_kodu__icontains=term)
            | Q(varyantlar__sku__icontains=term)
            | Q(varyantlar__tedarikci_sku__icontains=term)
            | Q(slug__icontains=term)
        )

    eksik_gorsel = (get("eksik_gorsel") or "").strip().lower()
    if eksik_gorsel in ("1", "true", "yes"):
        kapak_exists = UrunGorsel.objects.filter(
            urun_id=OuterRef("pk"), kapak=True, varyant__isnull=True
        )
        qs = qs.annotate(_has_kapak=Exists(kapak_exists)).filter(_has_kapak=False)
    elif eksik_gorsel in ("0", "false", "no"):
        kapak_exists = UrunGorsel.objects.filter(
            urun_id=OuterRef("pk"), kapak=True, varyant__isnull=True
        )
        qs = qs.annotate(_has_kapak=Exists(kapak_exists)).filter(_has_kapak=True)

    eksik_varyant = (get("eksik_varyant") or "").strip().lower()
    if eksik_varyant in ("1", "true", "yes"):
        qs = qs.annotate(
            _aktif_v=Count("varyantlar", filter=Q(varyantlar__aktif=True))
        ).filter(_aktif_v=0)

    one_cikan = (get("one_cikan") or "").strip().lower()
    if one_cikan in ("true", "1"):
        qs = qs.filter(kategori__one_cikan=True)
    elif one_cikan in ("false", "0"):
        qs = qs.filter(kategori__one_cikan=False)

    return qs.distinct()
