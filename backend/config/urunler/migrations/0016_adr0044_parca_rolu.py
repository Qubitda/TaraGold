# ADR-0044 — montür parça rolü + head/band stil alanları

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("urunler", "0015_adr0044_uyumluluk"),
    ]

    operations = [
        migrations.AddField(
            model_name="varyant",
            name="parca_rolu",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text="MONTUR: FULL|HEAD|BAND. Boşsa FULL sayılır (geriye uyum).",
                max_length=8,
                verbose_name="Parça rolü",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="bas_stil",
            field=models.CharField(
                blank=True,
                default="",
                help_text="MONTUR FULL/HEAD: örn. DIAMOND_TULIP, CLASSIC_HALO.",
                max_length=48,
                verbose_name="Baş stili",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="govde_stil",
            field=models.CharField(
                blank=True,
                default="",
                help_text="MONTUR FULL/BAND: örn. KNIFE_EDGE_SOLITAIRE.",
                max_length=48,
                verbose_name="Gövde stili",
            ),
        ),
    ]
