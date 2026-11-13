"""ADR-0033 data backfill: durum, tip, üyelik, K1/K2, kanal izni soft-launch."""

from __future__ import annotations

from django.db import migrations
from django.utils import timezone

LEGACY_ADMIN = frozenset({"firma_admin", "alici_yonetici", "tedarikci_sahip"})


def forwards(apps, schema_editor):
    Firma = apps.get_model("firmalar", "Firma")
    Kullanici = apps.get_model("firmalar", "Kullanici")
    FirmaUyelik = apps.get_model("firmalar", "FirmaUyelik")
    FirmaTipAtama = apps.get_model("firmalar", "FirmaTipAtama")
    FirmaTedarikciAltTip = apps.get_model("firmalar", "FirmaTedarikciAltTip")
    TedarikciKanalIzni = apps.get_model("firmalar", "TedarikciKanalIzni")
    Group = apps.get_model("auth", "Group")

    # 1) durum ← onay_durumu + aktif
    for f in Firma.objects.all().iterator():
        if f.onay_durumu == "onayli" and f.aktif:
            durum = "AKTIF"
        elif f.onay_durumu == "onayli" and not f.aktif:
            durum = "ASKIDA"
        elif f.onay_durumu == "reddedildi":
            durum = "REDDEDILDI"
        else:
            durum = "ONAY_BEKLIYOR"
        if f.durum != durum:
            Firma.objects.filter(pk=f.pk).update(durum=durum)

    # 2) tip atamaları (boolean → M2M)
    for f in Firma.objects.all().iterator():
        if f.tedarikci_mi:
            FirmaTipAtama.objects.get_or_create(firma_id=f.pk, tip="TEDARIKCI")
            # K2
            FirmaTedarikciAltTip.objects.get_or_create(
                firma_id=f.pk, alt_tip="BELIRSIZ"
            )
        if f.alici_mi:
            FirmaTipAtama.objects.get_or_create(firma_id=f.pk, tip="ALICI_KUYUMCU")

    # 3) FirmaUyelik ← Kullanici.firma/rol (K3: is_active → aktif)
    for u in Kullanici.objects.exclude(firma_id__isnull=True).iterator():
        FirmaUyelik.objects.update_or_create(
            kullanici_id=u.pk,
            firma_id=u.firma_id,
            defaults={
                "rol": u.rol,
                "aktif": bool(u.is_active),
            },
        )

    # 4) K1 — admin’siz onaylı/AKTIF firmalar
    for f in Firma.objects.filter(durum="AKTIF").exclude(platform_mu=True).iterator():
        admin_exists = FirmaUyelik.objects.filter(
            firma_id=f.pk, aktif=True, rol__in=LEGACY_ADMIN
        ).exists()
        if admin_exists:
            continue
        pick = (
            Kullanici.objects.filter(firma_id=f.pk, is_active=True)
            .order_by("date_joined", "pk")
            .first()
        )
        if pick is None:
            Firma.objects.filter(pk=f.pk).update(
                durum="ASKIDA", aktif=False, onay_durumu="onayli"
            )
            continue
        # Promote → firma_admin
        Kullanici.objects.filter(pk=pick.pk).update(rol="firma_admin")
        FirmaUyelik.objects.filter(
            kullanici_id=pick.pk, firma_id=f.pk
        ).update(rol="firma_admin", aktif=True)
        Group.objects.get_or_create(name="rol:firma_admin")

    # 5) Soft-launch: YAYINDA teklif + aktif UrunKanal → ONAYLI izin
    TedarikciTeklif = apps.get_model("fiyatlama", "TedarikciTeklif")
    UrunKanal = apps.get_model("urunler", "UrunKanal")
    now = timezone.now()
    pairs = set()
    for uk in UrunKanal.objects.filter(aktif=True).iterator():
        ted_ids = (
            TedarikciTeklif.objects.filter(
                durum="YAYINDA",
                varyant__urun_id=uk.urun_id,
            )
            .values_list("tedarikci_id", flat=True)
            .distinct()
        )
        for tid in ted_ids:
            pairs.add((tid, uk.kanal_id))
    for tid, kid in pairs:
        TedarikciKanalIzni.objects.get_or_create(
            tedarikci_firma_id=tid,
            satis_kanali_id=kid,
            defaults={"durum": "ONAYLI", "karar_tarihi": now},
        )


def backwards(apps, schema_editor):
    """Geri: yeni satırları sil; durum/legacy bayrakları dokunulmaz (expand güvenli)."""
    FirmaUyelik = apps.get_model("firmalar", "FirmaUyelik")
    FirmaTipAtama = apps.get_model("firmalar", "FirmaTipAtama")
    FirmaTedarikciAltTip = apps.get_model("firmalar", "FirmaTedarikciAltTip")
    TedarikciKanalIzni = apps.get_model("firmalar", "TedarikciKanalIzni")
    AliciKanalErisimi = apps.get_model("firmalar", "AliciKanalErisimi")
    FirmaKontak = apps.get_model("firmalar", "FirmaKontak")

    FirmaUyelik.objects.all().delete()
    FirmaTipAtama.objects.all().delete()
    FirmaTedarikciAltTip.objects.all().delete()
    TedarikciKanalIzni.objects.all().delete()
    AliciKanalErisimi.objects.all().delete()
    FirmaKontak.objects.all().delete()
    # K1 promote (firma_admin) geri alınmaz — güvenli no-op; manuel düzeltme


class Migration(migrations.Migration):
    dependencies = [
        ("firmalar", "0013_adr0033_schema"),
        ("fiyatlama", "0019_cap_piyasa_adr0018"),
        ("urunler", "0011_cap_piyasa_adr0018"),
        ("tanimlar", "0005_cap_alert_kur_alert"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
