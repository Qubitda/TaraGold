"""Normatif kanonik satış kanalları (ADR-0035): KUYUMCU_PORTAL, B2B_API, B2C."""

from django.db import migrations


CANONICAL_CHANNELS = [
    ("KUYUMCU_PORTAL", "Kuyumcu Portalı", 1),
    ("B2B_API", "B2B API", 2),
    ("B2C", "B2C Kanalı", 3),
]


def forwards(apps, schema_editor):
    SatisKanali = apps.get_model("tanimlar", "SatisKanali")
    for kod, ad, sira in CANONICAL_CHANNELS:
        obj, created = SatisKanali.objects.get_or_create(
            kod=kod,
            defaults={"ad": ad, "aktif": True, "sira": sira},
        )
        if not created and not obj.aktif:
            obj.aktif = True
            obj.save(update_fields=["aktif"])


def backwards(apps, schema_editor):
    # Veri kaybı yok: kanonik kanalları silmeyiz (mevcut sözleşme/quote FK korunur).
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("tanimlar", "0005_cap_alert_kur_alert"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
