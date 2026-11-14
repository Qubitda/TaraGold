from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("firmalar", "0017_normatif_coklu_rol_uyelik"),
    ]

    operations = [
        migrations.AddField(
            model_name="kullanici",
            name="profil_foto",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Kullanıcı avatarı (data URL veya temiz boş string).",
                verbose_name="Profil fotoğrafı",
            ),
        ),
    ]
