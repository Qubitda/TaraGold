"""FAZ 1 — Varyant.ayar (metal zorunlu / TAS muaf) + unique eksen+ayar."""

from django.db import migrations, models
import django.db.models.deletion


def fill_varyant_ayar_from_urun(apps, schema_editor):
    Varyant = apps.get_model("urunler", "Varyant")
    metal_null = (
        Varyant.objects.exclude(tip="TAS")
        .filter(ayar_id__isnull=True, urun__ayar_id__isnull=True)
        .count()
    )
    if metal_null:
        raise RuntimeError(
            f"FAZ1: {metal_null} metal varyantın urun.ayar'ı null — "
            "tahminle doldurma yok; NOT NULL adımı çalıştırılmadı."
        )
    # Join üzerinden F() desteklenmez — satır satır (küçük katalog).
    qs = (
        Varyant.objects.exclude(tip="TAS")
        .filter(ayar_id__isnull=True)
        .select_related("urun")
    )
    for v in qs.iterator(chunk_size=500):
        Varyant.objects.filter(pk=v.pk).update(ayar_id=v.urun.ayar_id)


def noop_reverse(apps, schema_editor):
    pass


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
        migrations.RunPython(fill_varyant_ayar_from_urun, noop_reverse),
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
