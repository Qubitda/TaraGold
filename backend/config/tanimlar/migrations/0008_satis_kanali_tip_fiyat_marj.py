"""SatisKanali.tip (KUYUMCU_PORTAL | B2B_API | B2C_API), fiyat_grubu, varsayilan_marj_kurali."""

import django.db.models.deletion
from django.db import migrations, models


def set_existing_to_kuyumcu_portal(apps, schema_editor):
    SatisKanali = apps.get_model("tanimlar", "SatisKanali")
    SatisKanali.objects.all().update(tip="KUYUMCU_PORTAL")


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("tanimlar", "0007_satis_kanali_tip"),
        ("piyasa", "0006_marj_kurali_ve_backfill"),
    ]

    operations = [
        migrations.AddField(
            model_name="satiskanali",
            name="fiyat_grubu",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="satis_kanallari",
                to="tanimlar.fiyatgrubu",
                verbose_name="Fiyat grubu",
            ),
        ),
        migrations.AddField(
            model_name="satiskanali",
            name="varsayilan_marj_kurali",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="varsayilan_kanallar",
                to="piyasa.marjkurali",
                verbose_name="Varsayılan marj kuralı",
            ),
        ),
        migrations.AlterField(
            model_name="satiskanali",
            name="tip",
            field=models.CharField(
                choices=[
                    ("KUYUMCU_PORTAL", "Kuyumcu Portal"),
                    ("B2B_API", "B2B API"),
                    ("B2C_API", "B2C API"),
                ],
                default="KUYUMCU_PORTAL",
                max_length=24,
                verbose_name="Kanal tipi",
            ),
        ),
        migrations.RunPython(set_existing_to_kuyumcu_portal, reverse_noop),
    ]
