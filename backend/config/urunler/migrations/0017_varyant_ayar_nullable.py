"""FAZ 1a — Varyant.ayar nullable FK ekle (veri/constraint yok)."""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("tanimlar", "0001_initial"),
        ("urunler", "0016_adr0044_parca_rolu"),
    ]

    operations = [
        migrations.AddField(
            model_name="varyant",
            name="ayar",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Metal tiplerde (HAM_ALTIN/MONTUR/TASLI) zorunlu; TAS muaf. "
                    "Ürün varsayılanı Urun.ayar; fiyat motoru metal varyantta bunu okur."
                ),
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="varyantlar",
                to="tanimlar.ayarmilyem",
                verbose_name="Ayar / milyem",
            ),
        ),
    ]
