"""ADR-0039: kalem marj_tipi, bölüm, görünürlük; alış marjı işaret çevirisi."""

from decimal import Decimal

from django.db import migrations, models


def forwards_adr0039(apps, schema_editor):
    PiyasaUrun = apps.get_model("piyasa", "PiyasaUrun")
    PiyasaMarjPolitikasi = apps.get_model("piyasa", "PiyasaMarjPolitikasi")
    pol = PiyasaMarjPolitikasi.objects.filter(anahtar="default").first()
    default_tip = (pol.marj_modu if pol else None) or "YUZDE"

    ticker_defaults = {"has", "gram_has", "22ayar", "22a_bilezik", "ceyrek_yeni", "usd", "eur"}

    for u in PiyasaUrun.objects.all():
        # Eski semantik: alış düşer → yeni: alışa eklenen işaretli marj = -eski
        u.alis_marj = -(u.alis_marj or Decimal("0"))
        u.marj_tipi = default_tip
        varyant = getattr(u, "varyant_etiket", "") or ""
        grup = u.grup or "AYAR_GRAM"
        if grup == "DIGER":
            u.bolum = "DOVIZ"
            u.ondalik = 4
        elif varyant == "ESKI":
            u.bolum = "ESKI_ALTIN"
            u.ondalik = 2
        else:
            u.bolum = "ALTIN"
            u.ondalik = 2
        kod = (u.kod or "").lower()
        u.ticker_da_goster = kod in ticker_defaults or kod in {
            "has",
            "22ayar",
            "ceyrek",
        }
        u.alis_goster = True
        u.satis_goster = True
        u.aliciya_alis_goster = True
        u.aliciya_goster = True
        u.save(
            update_fields=[
                "alis_marj",
                "marj_tipi",
                "bolum",
                "ondalik",
                "ticker_da_goster",
                "alis_goster",
                "satis_goster",
                "aliciya_alis_goster",
                "aliciya_goster",
            ]
        )


def backwards_adr0039(apps, schema_editor):
    PiyasaUrun = apps.get_model("piyasa", "PiyasaUrun")
    for u in PiyasaUrun.objects.all():
        u.alis_marj = -(u.alis_marj or Decimal("0"))
        if u.alis_marj < 0:
            u.alis_marj = abs(u.alis_marj)
        u.save(update_fields=["alis_marj"])


class Migration(migrations.Migration):
    dependencies = [
        ("piyasa", "0006_marj_kurali_ve_backfill"),
    ]

    operations = [
        migrations.AddField(
            model_name="piyasaurun",
            name="bolum",
            field=models.CharField(
                choices=[
                    ("ALTIN", "Altın"),
                    ("ESKI_ALTIN", "Eski altınlar"),
                    ("DOVIZ", "Döviz kurları"),
                ],
                db_index=True,
                default="ALTIN",
                help_text="Pano paneli: ALTIN | ESKI_ALTIN | DOVIZ (ADR-0039).",
                max_length=16,
                verbose_name="Bölüm",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="marj_tipi",
            field=models.CharField(
                choices=[("TL", "TL (tutar)"), ("YUZDE", "Yüzde (%)")],
                default="YUZDE",
                help_text="Kalem bazında TL veya % (ADR-0039).",
                max_length=8,
                verbose_name="Marj tipi",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="alis_goster",
            field=models.BooleanField(
                default=True,
                help_text="False ise pano/ticker alış sütunu —.",
                verbose_name="Alış göster",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="satis_goster",
            field=models.BooleanField(
                default=True,
                help_text="False ise pano/ticker satış sütunu — (örn. 14/18 ayar).",
                verbose_name="Satış göster",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="aliciya_alis_goster",
            field=models.BooleanField(
                default=True,
                help_text="Q2: alıcı API/ticker’da alış kolonunu aç/kapa; ops her zaman görür.",
                verbose_name="Alıcıya alış göster",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="aliciya_goster",
            field=models.BooleanField(
                default=True,
                help_text="False ise kalem alıcı panosunda yok.",
                verbose_name="Alıcıya göster",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="ticker_da_goster",
            field=models.BooleanField(
                default=False,
                help_text="Global kayan şeritte görünürlük.",
                verbose_name="Ticker’da göster",
            ),
        ),
        migrations.AddField(
            model_name="piyasaurun",
            name="ondalik",
            field=models.PositiveSmallIntegerField(
                default=2,
                help_text="Gösterim ondalığı (altın 2, döviz 4).",
                verbose_name="Ondalık",
            ),
        ),
        migrations.AlterField(
            model_name="piyasaurun",
            name="alis_marj",
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal("0"),
                help_text="İşaretli. nihai_alis = ham + marj (TL) veya ham×(1+marj/100) (%).",
                max_digits=14,
                verbose_name="Alış marjı",
            ),
        ),
        migrations.AlterField(
            model_name="piyasaurun",
            name="satis_marj",
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal("0"),
                help_text="İşaretli. nihai_satis = ham + marj (TL) veya ham×(1+marj/100) (%).",
                max_digits=14,
                verbose_name="Satış marjı",
            ),
        ),
        migrations.AlterModelOptions(
            name="piyasaurun",
            options={
                "ordering": ["bolum", "sira", "kod"],
                "permissions": [("manage_piyasa", "Piyasa panosu yönetebilir")],
                "verbose_name": "Piyasa ürünü",
                "verbose_name_plural": "Piyasa ürünleri",
            },
        ),
        migrations.RunPython(forwards_adr0039, backwards_adr0039),
    ]
