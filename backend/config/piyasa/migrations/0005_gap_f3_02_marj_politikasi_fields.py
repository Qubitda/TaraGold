from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("piyasa", "0004_adr0025_ons_kg"),
    ]

    operations = [
        migrations.AddField(
            model_name="piyasamarjpolitikasi",
            name="aktif",
            field=models.BooleanField(
                default=True,
                help_text="GAP-F3-02: küresel marj politikası aktif mi.",
                verbose_name="Aktif",
            ),
        ),
        migrations.AddField(
            model_name="piyasamarjpolitikasi",
            name="marj_orani",
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal("0.0000"),
                help_text="GAP-F3-02: küresel marj oranı (ör. 0.0850).",
                max_digits=8,
                verbose_name="Global marj oranı",
            ),
        ),
    ]
