"""ADR-0044 — montür uyumluluk + taş karat/kesim alanları."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("urunler", "0014_adr0001_v2_bilesen_usd"),
    ]

    operations = [
        migrations.AddField(
            model_name="varyant",
            name="yuva_adedi",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="MONTUR: kaç taş yuvası.",
                null=True,
                verbose_name="Yuva adedi",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="izinli_kesimler",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="MONTUR: TasKesimi.kod listesi; boşsa imalata kapalı.",
                verbose_name="İzinli taş kesimleri",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="karat_min",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                max_digits=7,
                null=True,
                verbose_name="Min karat (toplam)",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="karat_max",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                max_digits=7,
                null=True,
                verbose_name="Max karat (toplam)",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="karat",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                help_text="TAS: taş karat.",
                max_digits=7,
                null=True,
                verbose_name="Karat",
            ),
        ),
        migrations.AddField(
            model_name="varyant",
            name="kesim_kod",
            field=models.CharField(
                blank=True,
                default="",
                help_text="TAS: TasKesimi.kod ile eşleşir.",
                max_length=32,
                verbose_name="Kesim kodu",
            ),
        ),
    ]
