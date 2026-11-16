from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("piyasa", "0009_grup_iscilik"),
    ]

    operations = [
        migrations.AddField(
            model_name="piyasamarjpolitikasi",
            name="pano_baslik",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Canlı Piyasa / TV ekranında görünen unvan (ör. Aydemir Platform). Boşsa firma adı.",
                max_length=80,
                verbose_name="Pano başlığı",
            ),
        ),
    ]
