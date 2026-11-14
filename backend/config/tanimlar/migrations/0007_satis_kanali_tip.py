"""SatisKanali.tip genişletme + backfill migration (veri kaybı yok, geri alınabilir)."""

from django.db import migrations, models


def backfill_tip(apps, schema_editor):
    SatisKanali = apps.get_model("tanimlar", "SatisKanali")
    for ch in SatisKanali.objects.all():
        kod = (ch.kod or "").upper()
        if "B2C" in kod:
            ch.tip = "B2C"
        elif "API" in kod or "B2B" in kod:
            ch.tip = "B2B_API"
        else:
            ch.tip = "KUYUMCU_PORTAL"
        ch.save(update_fields=["tip"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("tanimlar", "0006_normatif_satis_kanallari"),
    ]

    operations = [
        migrations.AddField(
            model_name="satiskanali",
            name="tip",
            field=models.CharField(
                choices=[
                    ("KUYUMCU_PORTAL", "Kuyumcu Portal"),
                    ("B2B_API", "B2B API"),
                    ("B2C", "B2C"),
                ],
                default="KUYUMCU_PORTAL",
                max_length=24,
                verbose_name="Kanal tipi",
            ),
        ),
        migrations.RunPython(backfill_tip, reverse_noop),
    ]
