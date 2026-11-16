"""İmalat/işçilik grubu — sektör panosu kalemleri."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("piyasa", "0008_alter_grup_help"),
    ]

    operations = [
        migrations.AlterField(
            model_name="piyasaurun",
            name="grup",
            field=models.CharField(
                choices=[
                    ("HAS", "Has / referans"),
                    ("AYAR_GRAM", "Ayar / gram"),
                    ("ISCILIK", "İmalat / işçilik"),
                    ("GUMUS", "Gümüş"),
                    ("SARRAFIYE", "Sarrafiye"),
                    ("DIGER", "Diğer"),
                ],
                db_index=True,
                default="AYAR_GRAM",
                help_text="Pano kategori: HAS | AYAR_GRAM | ISCILIK | GUMUS | SARRAFIYE.",
                max_length=16,
                verbose_name="Grup",
            ),
        ),
    ]
