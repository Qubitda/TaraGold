from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kalite", "0002_f6_011_quality_measurement"),
    ]

    operations = [
        migrations.AddField(
            model_name="qualitymeasurement",
            name="olculen_ayar",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                help_text="GAP-F4-02: ölçülen ayar / milyem.",
                max_digits=8,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="qualitymeasurement",
            name="olculen_gram",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text="GAP-F4-02: ölçülen gram.",
                max_digits=12,
                null=True,
            ),
        ),
    ]
