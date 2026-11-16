"""FAZ 1b — metal varyant ayar'ını ürün ayarından doldur (tahmin yok)."""

from django.db import migrations


def fill_varyant_ayar_from_urun(apps, schema_editor):
    Varyant = apps.get_model("urunler", "Varyant")
    bad = list(
        Varyant.objects.exclude(tip="TAS")
        .filter(ayar_id__isnull=True, urun__ayar_id__isnull=True)
        .values_list("id", "tip", "urun_id")[:200]
    )
    if bad:
        sample = ", ".join(f"id={i}/tip={t}/urun_id={u}" for i, t, u in bad[:50])
        raise RuntimeError(
            f"FAZ1: {len(bad)}+ metal varyantın urun.ayar'ı null — "
            f"tahminle doldurma yok. Örnek: {sample}"
        )
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
    """Uzun katalogda tek transaction riskli olabilir → atomic=False."""

    atomic = False

    dependencies = [
        ("urunler", "0017_varyant_ayar_nullable"),
    ]

    operations = [
        migrations.RunPython(fill_varyant_ayar_from_urun, noop_reverse),
    ]
