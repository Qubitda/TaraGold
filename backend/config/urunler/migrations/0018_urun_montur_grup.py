"""FAZ 2 — Urun.montur_grup_id (HEAD+BAND eşleşme)."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("urunler", "0017_varyant_ayar_metal"),
    ]

    operations = [
        migrations.AddField(
            model_name="urun",
            name="montur_grup_id",
            field=models.UUIDField(
                blank=True,
                db_index=True,
                help_text="HEAD+BAND eşleşmesi; aynı UUID iki ürünü bağlar.",
                null=True,
                verbose_name="Montür grup",
            ),
        ),
    ]
