"""ADR-0035: çoklu aktif firma üyeliği + tek birincil oturum bağlamı."""

from django.db import migrations, models


def backfill_birincil(apps, schema_editor):
    FirmaUyelik = apps.get_model("firmalar", "FirmaUyelik")
    seen_users = set()
    for row in FirmaUyelik.objects.filter(aktif=True).order_by("-olusturma", "pk"):
        if row.kullanici_id not in seen_users:
            row.birincil = True
            row.save(update_fields=["birincil"])
            seen_users.add(row.kullanici_id)


def reverse_birincil(apps, schema_editor):
    FirmaUyelik = apps.get_model("firmalar", "FirmaUyelik")
    FirmaUyelik.objects.update(birincil=False)


class Migration(migrations.Migration):
    dependencies = [
        ("firmalar", "0016_adr0034_api_anahtar"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="firmauyelik",
            name="firmauyelik_tek_aktif_uyelik",
        ),
        migrations.AddField(
            model_name="firmauyelik",
            name="birincil",
            field=models.BooleanField(
                default=False,
                help_text="Aktif oturum bağlamı (Kullanici.firma/rol senkronu).",
            ),
        ),
        migrations.RunPython(backfill_birincil, reverse_birincil),
        migrations.AddConstraint(
            model_name="firmauyelik",
            constraint=models.UniqueConstraint(
                condition=models.Q(("birincil", True)),
                fields=("kullanici",),
                name="firmauyelik_tek_birincil_uyelik",
            ),
        ),
    ]
