"""MarjKurali tablosu + mevcut PiyasaMarjPolitikasi tekil kaydını global varsayılan kurala taşı."""

from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


def forwards_backfill(apps, schema_editor):
    PiyasaMarjPolitikasi = apps.get_model("piyasa", "PiyasaMarjPolitikasi")
    MarjKurali = apps.get_model("piyasa", "MarjKurali")

    pol = PiyasaMarjPolitikasi.objects.filter(anahtar="default").first()
    if pol is None:
        pol = PiyasaMarjPolitikasi.objects.order_by("pk").first()

    marj_turu = "YUZDE"
    deger = Decimal("0.0000")
    aktif = True
    if pol is not None:
        marj_turu = "GRAM_BASI_SABIT" if pol.marj_modu == "TL" else "YUZDE"
        deger = pol.marj_orani if pol.marj_orani is not None else Decimal("0.0000")
        aktif = bool(pol.aktif)

    existing = MarjKurali.objects.filter(kapsam="TUMU").first()
    if existing is None:
        MarjKurali.objects.create(
            ad="Global Varsayılan Marj Kuralı",
            kapsam="TUMU",
            marj_turu=marj_turu,
            deger=deger,
            aktif=aktif,
        )
    else:
        existing.marj_turu = marj_turu
        existing.deger = deger
        existing.aktif = aktif
        if not existing.ad:
            existing.ad = "Global Varsayılan Marj Kuralı"
        existing.save(update_fields=["ad", "marj_turu", "deger", "aktif"])


def backwards_restore(apps, schema_editor):
    PiyasaMarjPolitikasi = apps.get_model("piyasa", "PiyasaMarjPolitikasi")
    MarjKurali = apps.get_model("piyasa", "MarjKurali")

    rule = MarjKurali.objects.filter(kapsam="TUMU").first()
    if rule is None:
        return
    pol, _ = PiyasaMarjPolitikasi.objects.get_or_create(anahtar="default")
    pol.marj_modu = "TL" if rule.marj_turu == "GRAM_BASI_SABIT" else "YUZDE"
    pol.marj_orani = rule.deger
    pol.aktif = bool(rule.aktif)
    pol.save(update_fields=["marj_modu", "marj_orani", "aktif"])


class Migration(migrations.Migration):
    dependencies = [
        ("piyasa", "0005_gap_f3_02_marj_politikasi_fields"),
        ("tanimlar", "0007_satis_kanali_tip"),
        ("urunler", "0011_cap_piyasa_adr0018"),
    ]

    operations = [
        migrations.CreateModel(
            name="MarjKurali",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "ad",
                    models.CharField(
                        blank=True,
                        default="",
                        max_length=120,
                        verbose_name="Kural adı",
                    ),
                ),
                (
                    "kapsam",
                    models.CharField(
                        choices=[
                            ("TUMU", "Tümü (Global Varsayılan)"),
                            ("SATIS_KANALI", "Satış Kanalı"),
                            ("KATEGORI", "Kategori"),
                            ("FIYAT_GRUBU", "Fiyat Grubu"),
                        ],
                        default="TUMU",
                        max_length=24,
                        verbose_name="Kapsam",
                    ),
                ),
                (
                    "marj_turu",
                    models.CharField(
                        choices=[
                            ("YUZDE", "Yüzde (%)"),
                            ("GRAM_BASI_SABIT", "Gram Başı Sabit"),
                        ],
                        default="YUZDE",
                        max_length=24,
                        verbose_name="Marj türü",
                    ),
                ),
                (
                    "deger",
                    models.DecimalField(
                        decimal_places=4,
                        default=Decimal("0.0000"),
                        max_digits=14,
                        verbose_name="Değer",
                    ),
                ),
                ("aktif", models.BooleanField(default=True, verbose_name="Aktif")),
                ("olusturma", models.DateTimeField(auto_now_add=True)),
                ("guncelleme", models.DateTimeField(auto_now=True)),
                (
                    "fiyat_grubu",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="marj_kurallari",
                        to="tanimlar.fiyatgrubu",
                        verbose_name="Fiyat grubu",
                    ),
                ),
                (
                    "kategori",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="marj_kurallari",
                        to="urunler.kategori",
                        verbose_name="Kategori",
                    ),
                ),
                (
                    "satis_kanali",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="marj_kurallari",
                        to="tanimlar.satiskanali",
                        verbose_name="Satış kanalı",
                    ),
                ),
            ],
            options={
                "verbose_name": "Marj kuralı",
                "verbose_name_plural": "Marj kuralları",
                "ordering": ["kapsam", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="marjkurali",
            constraint=models.CheckConstraint(
                condition=Q(deger__gte=0),
                name="piyasa_marj_kurali_deger_non_neg",
            ),
        ),
        migrations.AddConstraint(
            model_name="marjkurali",
            constraint=models.UniqueConstraint(
                condition=Q(kapsam="TUMU"),
                fields=("kapsam",),
                name="piyasa_marj_kurali_tek_tumu",
            ),
        ),
        migrations.RunPython(forwards_backfill, backwards_restore),
    ]
