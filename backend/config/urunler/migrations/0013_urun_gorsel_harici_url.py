from django.db import migrations, models


class Migration(migrations.Migration):
    """Geriye uyumlu: dosya opsiyonel + harici_url (video bağlantısı)."""

    dependencies = [
        ("urunler", "0012_urun_gorsel_adr0037"),
    ]

    operations = [
        migrations.AlterField(
            model_name="urungorsel",
            name="dosya",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="urunler/gorseller/",
                verbose_name="Dosya",
            ),
        ),
        migrations.AddField(
            model_name="urungorsel",
            name="harici_url",
            field=models.URLField(
                blank=True,
                default="",
                help_text="Video veya harici medya bağlantısı (dosya yoksa).",
                max_length=500,
                verbose_name="Harici URL",
            ),
        ),
    ]
