"""Acik OLUSTURULDU -> ONAYLANDI (mevcut QC/sevkiyat yolu kirilmasin)."""

from django.db import migrations


def forwards(apps, schema_editor):
    Order = apps.get_model("siparis", "Order")
    n = Order.objects.filter(durum="OLUSTURULDU").update(durum="ONAYLANDI")
    print(f"ADR-0034 backfill OLUSTURULDI->ONAYLANDI: {n}")


def backwards(apps, schema_editor):
    Order = apps.get_model("siparis", "Order")
    Order.objects.filter(durum="ONAYLANDI").update(durum="OLUSTURULDU")


class Migration(migrations.Migration):
    dependencies = [
        ("siparis", "0007_adr0034_ops_akis"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
