"""ADR-0034 + ADR-0036 — API müşterisi feed (JSON, XML, XSD; net kanal fiyatı + ATP; kör havuz)."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.masking import assert_masked
from api.pagination import apply_ordering, paginate_queryset
from firmalar.models import AliciKanalErisimi
from firmalar.services.api_anahtar_servisi import dogrula_raw
from firmalar.services.kanal_gorunurluk_servisi import filter_buyer_catalog_queryset
from fiyatlama.models import FiyatSozlesmesi, TedarikciTeklif
from fiyatlama.models.sozlesme_cozumleme import CokluSozlesmeHatasi, SozlesmeYokHatasi, cozumle
from fiyatlama.services import fiyat_motoru
from fiyatlama.services.pricing_service import (
    _cevir_try_hedefe,
    _d,
    _tas_toplami_try,
    sec_teklif,
)
from stok.models import StockBalance
from tanimlar.models import KurTaraf, SatisKanali
from tanimlar.services import kur_servisi
from tanimlar.services.kaynak_resolve import etkin_kaynak
from urunler.models import Urun


class ApiKeyAuthentication:
    """Basit X-Api-Key / Authorization: Api-Key header."""

    header = "HTTP_X_API_KEY"

    def authenticate(self, request):
        raw = request.META.get(self.header) or ""
        if not raw:
            auth = request.META.get("HTTP_AUTHORIZATION") or ""
            if auth.lower().startswith("api-key "):
                raw = auth[8:].strip()
        if not raw:
            return None
        row = dogrula_raw(raw)
        if row is None:
            raise AuthenticationFailed("Geçersiz API anahtarı.")

        class _FeedActor:
            is_authenticated = True
            is_active = True
            firma = row.firma
            firma_id = row.firma_id
            pk = None
            rol = "api_feed"

        return (_FeedActor(), row)


def _want_xml(request) -> bool:
    fmt = (request.query_params.get("format") or "").lower()
    accept = (request.META.get("HTTP_ACCEPT") or "").lower()
    return fmt == "xml" or "application/xml" in accept


def _present_urun(u: Urun) -> dict:
    data = {
        "id": u.pk,
        "platform_kodu": u.platform_kodu,
        "ad": u.ad,
        "yayin_durumu": u.yayin_durumu,
        "onay_durumu": u.onay_durumu,
        "server_now": timezone.now().isoformat(),
        "gecerlilik_bitis": (timezone.now() + timedelta(minutes=15)).isoformat(),
    }
    assert_masked(data, context="buyer")
    return data


def _to_xml(root_name: str, items: list[dict], item_tag: str = "urun") -> bytes:
    root = ET.Element(root_name)
    for it in items:
        el = ET.SubElement(root, item_tag)
        for k, v in it.items():
            child = ET.SubElement(el, k)
            child.text = "" if v is None else str(v)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


class FeedAuthMixin:
    def _actor(self, request):
        pair = ApiKeyAuthentication().authenticate(request)
        if pair is None:
            raise AuthenticationFailed("API anahtarı gerekli.")
        return pair[0], pair[1]


def _resolve_feed_channel(request, actor, key) -> SatisKanali | None:
    if getattr(key, "satis_kanali_id", None):
        return key.satis_kanali
    req_kod = (request.query_params.get("kanal") or "").strip().upper()
    if req_kod:
        return SatisKanali.objects.filter(kod=req_kod, aktif=True).first()
    erisim = (
        AliciKanalErisimi.objects.filter(firma=actor.firma, aktif=True)
        .select_related("satis_kanali")
        .order_by("pk")
        .first()
    )
    if erisim is not None:
        return erisim.satis_kanali
    return (
        SatisKanali.objects.filter(kod__in=["B2B_API", "B2C"], aktif=True)
        .order_by("sira", "pk")
        .first()
    )


def _compute_net_feed_price(
    *, alici_firma, kanal: SatisKanali | None, urun: Urun, para_birimi: str = "TRY"
) -> str | None:
    """Salt-okunur net satış fiyatı (Decimal string). Tedarikçi/marj/maliyet asla dönmez."""
    if kanal is None:
        return None
    varyant = urun.varyantlar.filter(aktif=True).order_by("pk").first()
    if varyant is None:
        return None
    now = timezone.now()
    bugun = timezone.localdate(now) if timezone.is_aware(now) else now.date()
    ayar = getattr(urun, "ayar", None)
    metal = getattr(ayar, "metal", None) if ayar else None
    milyem = getattr(ayar, "milyem", None) if ayar else None

    try:
        kaynak = etkin_kaynak(urun=urun)
        metal_alici = None
        metal_tedarikci = None
        if metal is not None and getattr(metal, "gram_bazli", False):
            metal_alici = kur_servisi.resolve_metal_kuru(
                metal, taraf=KurTaraf.ALICI, now=now, etkin_kaynak=kaynak
            )
            metal_tedarikci = kur_servisi.resolve_metal_kuru(
                metal, taraf=KurTaraf.TEDARIKCI, now=now, etkin_kaynak=kaynak
            )
        teklif = sec_teklif(
            varyant,
            bugun=bugun,
            now=now,
            metal_saf_try=(
                _d(metal_tedarikci.saf_birim_fiyat) if metal_tedarikci else None
            ),
        )
        alici_kalem = cozumle(
            firma=alici_firma,
            kontrat_tipi=FiyatSozlesmesi.KontratTipi.ALICI,
            tarih=bugun,
            metal=metal,
            ayar=ayar,
            satis_kanali=kanal,
        )
        gram = teklif.gram if teklif.gram is not None else varyant.gram
        if gram is None and teklif.fiyat_modeli != TedarikciTeklif.FiyatModeli.SABIT_PARCA:
            return None
        tas_try, _ = _tas_toplami_try(teklif, now=now)
        ek_try = _d(varyant.ek_bedel)
        tas_hedef, _ = _cevir_try_hedefe(tas_try, hedef_pb=para_birimi, now=now)
        ek_hedef, _ = _cevir_try_hedefe(ek_try, hedef_pb=para_birimi, now=now)
        saf_birim_hedef = None
        if teklif.fiyat_modeli == TedarikciTeklif.FiyatModeli.METAL_BAZLI:
            if metal_alici is None or milyem is None:
                return None
            saf_birim_hedef, _ = _cevir_try_hedefe(
                _d(metal_alici.saf_birim_fiyat), hedef_pb=para_birimi, now=now
            )
        iscilik = (
            _d(teklif.iscilik_override)
            if teklif.iscilik_override is not None
            else _d(alici_kalem.iscilik)
        )
        iscilik_hedef, _ = _cevir_try_hedefe(iscilik, hedef_pb=para_birimi, now=now)
        sonuc = fiyat_motoru.hesapla_teklif_kalemleri(
            fiyat_modeli=teklif.fiyat_modeli,
            hedef_para_birimi=para_birimi,
            gram=gram,
            milyem=milyem,
            saf_birim_fiyat=saf_birim_hedef,
            iscilik=iscilik_hedef,
            islcilik_dahil_mi=bool(alici_kalem.islcilik_dahil_mi),
            birim_fiyat=teklif.birim_fiyat,
            birim_fiyat_pb=teklif.para_birimi,
            marj_tipi=alici_kalem.marj_tipi,
            marj_degeri=alici_kalem.marj_degeri,
            tas_bedeli=tas_hedef,
            ek_bedel=ek_hedef,
            taraf=KurTaraf.ALICI,
            now=now,
        )
        return str(sonuc["toplam_vergisiz"])
    except (
        DjangoValidationError,
        SozlesmeYokHatasi,
        CokluSozlesmeHatasi,
        ValueError,
        LookupError,
    ):
        return None


class FeedUrunListView(FeedAuthMixin, APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        actor, key = self._actor(request)
        if "feed:read" not in (key.scopes or ["feed:read"]):
            raise PermissionDenied("Scope yok.")
        qs = Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
        since = request.query_params.get("updated_since")
        if since:
            qs = qs.filter(guncelleme_zamani__gte=since)

        class _A:
            firma = actor.firma
            firma_id = actor.firma_id

        qs = filter_buyer_catalog_queryset(qs, actor=_A())
        qs = apply_ordering(
            qs, request, whitelist=("pk", "ad", "platform_kodu"), default="pk"
        )
        if _want_xml(request):
            page = list(qs[:100])
            payload = [_present_urun(u) for u in page]
            return HttpResponse(
                _to_xml("urunler", payload, item_tag="urun"),
                content_type="application/xml",
            )
        return paginate_queryset(request, qs, present=_present_urun)


class FeedUrunDetailView(FeedAuthMixin, APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk: int):
        actor, key = self._actor(request)
        u = Urun.objects.filter(
            pk=pk, yayin_durumu="aktif", onay_durumu="onayli"
        ).first()
        if u is None:
            raise NotFound("Ürün bulunamadı.")
        data = _present_urun(u)
        if _want_xml(request):
            return HttpResponse(
                _to_xml("urunler", [data], item_tag="urun"),
                content_type="application/xml",
            )
        return Response(data)


def _atp_for_urun(urun_id: int) -> str:
    """Birim bazlı ATP toplamı; tedarikçi/depo kimliği yok (kör havuz).

    Formül: available = on_hand − reserved − blocked (F11-012).
    Çıktı örn. ``ADET:12;GRAM:3.5`` veya stok yoksa ``0``.
    """
    by_birim: dict[str, Decimal] = {}
    for bal in StockBalance.objects.filter(varyant__urun_id=urun_id).only(
        "birim", "on_hand", "reserved", "blocked"
    ):
        avail = bal.available
        if avail <= 0:
            continue
        by_birim[bal.birim] = by_birim.get(bal.birim, Decimal("0")) + avail
    if not by_birim:
        return "0"

    def _fmt(qty: Decimal) -> str:
        s = format(qty, "f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s or "0"

    return ";".join(
        f"{birim}:{_fmt(qty)}" for birim, qty in sorted(by_birim.items())
    )


class FeedStokFiyatView(FeedAuthMixin, APIView):
    """Kanal net fiyatı + ATP stok özeti — maliyet/marj/tedarikçi yok."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        actor, key = self._actor(request)
        if "feed:read" not in (key.scopes or ["feed:read"]):
            raise PermissionDenied("Scope yok.")
        kanal = _resolve_feed_channel(request, actor, key)
        para_birimi = (request.query_params.get("para_birimi") or "TRY").upper()[:3]

        class _A:
            firma = actor.firma
            firma_id = actor.firma_id

        qs = filter_buyer_catalog_queryset(
            Urun.objects.filter(yayin_durumu="aktif", onay_durumu="onayli")
            .select_related("ayar", "ayar__metal")
            .prefetch_related("varyantlar"),
            actor=_A(),
        )[:100]
        now = timezone.now()
        gecerlilik = (now + timedelta(minutes=15)).isoformat()
        rows = []
        for u in qs:
            fiyat = _compute_net_feed_price(
                alici_firma=actor.firma,
                kanal=kanal,
                urun=u,
                para_birimi=para_birimi,
            )
            row = {
                "urun_id": u.pk,
                "platform_kodu": u.platform_kodu,
                "kanal_kod": getattr(kanal, "kod", "") if kanal else "",
                "stok_ozet": _atp_for_urun(u.pk),
                "fiyat": fiyat,
                "para_birimi": para_birimi if fiyat is not None else "",
                "server_now": now.isoformat(),
                "gecerlilik_bitis": gecerlilik,
            }
            assert_masked(row, context="buyer")
            rows.append(row)
        if _want_xml(request):
            return HttpResponse(
                _to_xml("stok_fiyat", rows, item_tag="kalem"),
                content_type="application/xml",
            )
        return Response({"results": rows})


_FEED_XSD = """<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">
  <xs:element name="urunler">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="urun" minOccurs="0" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="id" type="xs:integer"/>
              <xs:element name="platform_kodu" type="xs:string"/>
              <xs:element name="ad" type="xs:string"/>
              <xs:element name="yayin_durumu" type="xs:string"/>
              <xs:element name="onay_durumu" type="xs:string"/>
              <xs:element name="server_now" type="xs:dateTime"/>
              <xs:element name="gecerlilik_bitis" type="xs:dateTime"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:element name="stok_fiyat">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="kalem" minOccurs="0" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="urun_id" type="xs:integer"/>
              <xs:element name="platform_kodu" type="xs:string"/>
              <xs:element name="kanal_kod" type="xs:string"/>
              <xs:element name="stok_ozet" type="xs:string"/>
              <xs:element name="fiyat" type="xs:string" nillable="true"/>
              <xs:element name="para_birimi" type="xs:string"/>
              <xs:element name="server_now" type="xs:dateTime"/>
              <xs:element name="gecerlilik_bitis" type="xs:dateTime"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
"""


class FeedXsdSchemaView(APIView):
    """GET /api/v1/feed/schema.xsd — B2B XML feed şeması (public metadata)."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return HttpResponse(_FEED_XSD, content_type="application/xml; charset=utf-8")
