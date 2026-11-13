"""Kanal görünürlük — tek nokta (ADR-0033).

Ürün kanalda görünür ↔
  UrunKanal.aktif + ürün onaylı/yayın + TedarikciKanalIzni.ONAYLI (ilgili tedarikçi)
  + kanal için fiyat tanımı (aktif ALICI FiyatSozlesmesi veya AliciKanalErisimi).

Katalog listesine bağlarken: alıcının erişim kanalları üzerinden filtrele;
erişim kaydı yoksa legacy (tüm yayınlı) korunur — soft-launch.
"""

from __future__ import annotations

from django.db.models import Exists, OuterRef, Q, QuerySet

from firmalar.models import AliciKanalErisimi, TedarikciKanalIzni
from fiyatlama.models import FiyatSozlesmesi, TedarikciTeklif
from urunler.models import UrunKanal


def urun_kanalda_gorunur(*, urun, kanal, tedarikci_firma=None) -> bool:
    if urun is None or kanal is None:
        return False
    if getattr(urun, "onay_durumu", None) != "onayli":
        return False
    if getattr(urun, "yayin_durumu", None) != "aktif":
        return False
    if not UrunKanal.objects.filter(urun=urun, kanal=kanal, aktif=True).exists():
        return False

    izin_qs = TedarikciKanalIzni.objects.filter(
        satis_kanali=kanal, durum=TedarikciKanalIzni.Durum.ONAYLI
    )
    if tedarikci_firma is not None:
        izin_qs = izin_qs.filter(tedarikci_firma=tedarikci_firma)
    else:
        # Üründe YAYINDA teklifi olan tedarikçilerden biri ONAYLI olmalı
        ted_ids = TedarikciTeklif.objects.filter(
            varyant__urun=urun,
            durum=TedarikciTeklif.Durum.YAYINDA,
        ).values_list("tedarikci_id", flat=True)
        izin_qs = izin_qs.filter(tedarikci_firma_id__in=ted_ids)
        # Teklif yoksa: kanal izni herhangi bir ONAYLI + UrunKanal yeterli sayılmaz;
        # backfill teklifsiz platform ürünleri için ONAYLI yoksa görünmez.
        # Soft: teklif yoksa yalnız UrunKanal yeterli (katalog vitrin).
        if not ted_ids:
            return True
    if not izin_qs.exists():
        return False

    # Fiyat/marj: aktif alıcı sözleşmesi (kanal veya genel) VEYA herhangi AliciKanalErisimi
    soz = FiyatSozlesmesi.objects.filter(
        durum=FiyatSozlesmesi.Durum.AKTIF,
        kontrat_tipi=FiyatSozlesmesi.KontratTipi.ALICI,
    ).filter(Q(satis_kanali=kanal) | Q(satis_kanali__isnull=True))
    if soz.exists():
        return True
    if AliciKanalErisimi.objects.filter(
        satis_kanali=kanal, aktif=True
    ).exists():
        return True
    # Soft-launch: fiyat kaydı yoksa yine de UrunKanal+izin varsa göster (mevcut seed)
    return True


def filter_buyer_catalog_queryset(qs: QuerySet, *, actor) -> QuerySet:
    """Alıcı katalog — AliciKanalErisimi varsa kanal+görünürlük uygula; yoksa dokunma."""
    firma = getattr(actor, "firma", None)
    if firma is None or not getattr(firma, "alici_mi", False):
        return qs
    erisim = list(
        AliciKanalErisimi.objects.filter(firma=firma, aktif=True).values_list(
            "satis_kanali_id", flat=True
        )
    )
    if not erisim:
        return qs  # legacy: tüm yayınlı

    onayli_izin = TedarikciKanalIzni.objects.filter(
        durum=TedarikciKanalIzni.Durum.ONAYLI,
        satis_kanali_id__in=erisim,
    )
    yayinda_teklif = TedarikciTeklif.objects.filter(
        durum=TedarikciTeklif.Durum.YAYINDA,
        varyant__urun_id=OuterRef("pk"),
        tedarikci_id__in=onayli_izin.values("tedarikci_firma_id"),
    )
    kanal_ok = UrunKanal.objects.filter(
        urun_id=OuterRef("pk"),
        kanal_id__in=erisim,
        aktif=True,
    )
    # Teklifi olmayan ürünler: yalnız UrunKanal yeterli (vitrin)
    no_teklif = ~Exists(
        TedarikciTeklif.objects.filter(
            durum=TedarikciTeklif.Durum.YAYINDA,
            varyant__urun_id=OuterRef("pk"),
        )
    )
    return qs.filter(Exists(kanal_ok)).filter(
        Q(Exists(yayinda_teklif)) | no_teklif
    )
