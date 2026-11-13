from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lojistik", "0006_normatif_teslim_modeli"),
    ]

    operations = [
        migrations.AddField(
            model_name="shipment",
            name="tasiyici",
            field=models.CharField(
                blank=True,
                default=None,
                help_text="GAP-F4-01: taşıyıcı firma adı (nullable).",
                max_length=80,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="returnrequest",
            name="mahsup_tutari",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="GAP-F4-04: mahsup edilen veya hesaplanan iade tutarı.",
                max_digits=14,
                null=True,
            ),
        ),
    ]
