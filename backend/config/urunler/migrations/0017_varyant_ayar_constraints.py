"""FAZ 1c — unique eksen+ayar constraint'leri + metal ayar CheckConstraint."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("urunler", "0017_varyant_ayar_fill"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="varyant",
            name="benzersiz_varyant_renk_beden",
        ),
        migrations.RemoveConstraint(
            model_name="varyant",
            name="benzersiz_varyant_beden_renksiz",
        ),
        migrations.RemoveConstraint(
            model_name="varyant",
            name="benzersiz_varyant_renk_bedensiz",
        ),
        migrations.RemoveConstraint(
            model_name="varyant",
            name="benzersiz_varyant_eksensiz",
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=False, beden__isnull=False, ayar__isnull=False
                ),
                fields=("urun", "renk", "beden", "ayar"),
                name="benzersiz_varyant_renk_beden_ayar",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=True, beden__isnull=False, ayar__isnull=False
                ),
                fields=("urun", "beden", "ayar"),
                name="benzersiz_varyant_beden_ayar_renksiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=False, beden__isnull=True, ayar__isnull=False
                ),
                fields=("urun", "renk", "ayar"),
                name="benzersiz_varyant_renk_ayar_bedensiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=True, beden__isnull=True, ayar__isnull=False
                ),
                fields=("urun", "ayar"),
                name="benzersiz_varyant_ayar_eksensiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=False, beden__isnull=False, ayar__isnull=True
                ),
                fields=("urun", "renk", "beden"),
                name="benzersiz_varyant_renk_beden_ayarsiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=True, beden__isnull=False, ayar__isnull=True
                ),
                fields=("urun", "beden"),
                name="benzersiz_varyant_beden_ayarsiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=False, beden__isnull=True, ayar__isnull=True
                ),
                fields=("urun", "renk"),
                name="benzersiz_varyant_renk_ayarsiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    renk__isnull=True, beden__isnull=True, ayar__isnull=True
                ),
                fields=("urun",),
                name="benzersiz_varyant_eksensiz_ayarsiz",
            ),
        ),
        migrations.AddConstraint(
            model_name="varyant",
            constraint=models.CheckConstraint(
                condition=models.Q(tip="TAS") | models.Q(ayar__isnull=False),
                name="varyant_metal_ayar_zorunlu",
            ),
        ),
    ]
