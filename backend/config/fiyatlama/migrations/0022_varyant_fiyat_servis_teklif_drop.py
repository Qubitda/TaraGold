"""VaryantFiyat + ServisBedeliKurali; PriceQuote teklif → varyant_fiyat; drop teklif."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fiyatlama", "0021_remove_teklif_rfq_link"),
        ("stok", "0005_stock_key_varyant_drop_teklif"),
        ("urunler", "0009_f4_070_legacy_stock_readonly"),
        ("firmalar", "0001_initial"),
        ("tanimlar", "0002_faz3_3_kur_politikasi"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="VaryantFiyat",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("versiyon", models.PositiveIntegerField(default=1)),
                ("durum", models.CharField(choices=[("AKTIF", "Aktif"), ("PASIF", "Pasif")], default="AKTIF", max_length=8)),
                ("fiyat_modeli", models.CharField(choices=[("METAL_BAZLI", "Metal bazlı (gram × milyem × birim)"), ("GRAM_BIRIM", "Gram × birim fiyat"), ("SABIT_PARCA", "Parça başı sabit tutar")], max_length=16)),
                ("gram", models.DecimalField(blank=True, decimal_places=4, max_digits=12, null=True)),
                ("birim_fiyat", models.DecimalField(blank=True, decimal_places=4, max_digits=18, null=True)),
                ("para_birimi", models.CharField(default="TRY", max_length=3)),
                ("iscilik", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tas_bedeli", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("ek_bedel", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("olusturma_tarihi", models.DateTimeField(auto_now_add=True)),
                ("guncelleme_tarihi", models.DateTimeField(auto_now=True)),
                ("olusturan", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="olusturdugu_varyant_fiyatlari", to=settings.AUTH_USER_MODEL)),
                ("onceki", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sonraki_versiyonlar", to="fiyatlama.varyantfiyat")),
                ("tedarikci", models.ForeignKey(help_text="Stok/sevkiyat/hak ediş için tedarikçi (kör havuz).", on_delete=django.db.models.deletion.PROTECT, related_name="varyant_fiyatlari", to="firmalar.firma")),
                ("varyant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="fiyatlar", to="urunler.varyant")),
            ],
            options={
                "verbose_name": "Varyant fiyat",
                "verbose_name_plural": "Varyant fiyatları",
                "ordering": ["varyant_id", "-versiyon"],
                "permissions": [("manage_varyant_fiyat", "Varyant fiyatını yönetebilir")],
            },
        ),
        migrations.CreateModel(
            name="ServisBedeliKurali",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ad", models.CharField(max_length=128)),
                ("kapsam", models.CharField(choices=[("PLATFORM", "Platform varsayılan"), ("KANAL", "Kanal"), ("TEDARIKCI", "Tedarikçi"), ("TEDARIKCI_KANAL", "Tedarikçi + kanal")], max_length=16)),
                ("birim_tipi", models.CharField(choices=[("TRL", "Sabit TL"), ("GRAM", "TL / has gram (veya gram)"), ("YUZDE", "Ham fiyatın yüzdesi"), ("CURRENCY", "Sabit tutar (kur ile döviz)")], max_length=8)),
                ("deger", models.DecimalField(decimal_places=6, max_digits=18)),
                ("para_birimi", models.CharField(default="TRY", help_text="CURRENCY biriminde kaynak tutar PB.", max_length=3)),
                ("kampanya_mi", models.BooleanField(default=False)),
                ("gecerlilik_baslangic", models.DateField(blank=True, null=True)),
                ("gecerlilik_bitis", models.DateField(blank=True, null=True)),
                ("durum", models.CharField(choices=[("TASLAK", "Taslak"), ("AKTIF", "Aktif"), ("PASIF", "Pasif")], default="TASLAK", max_length=8)),
                ("onay_zamani", models.DateTimeField(blank=True, null=True)),
                ("olusturma_tarihi", models.DateTimeField(auto_now_add=True)),
                ("guncelleme_tarihi", models.DateTimeField(auto_now=True)),
                ("olusturan", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="olusturdugu_servis_bedeli_kurallari", to=settings.AUTH_USER_MODEL)),
                ("onaylayan", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="onayladigi_servis_bedeli_kurallari", to=settings.AUTH_USER_MODEL)),
                ("satis_kanali", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="servis_bedeli_kurallari", to="tanimlar.satiskanali")),
                ("tedarikci", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="servis_bedeli_kurallari", to="firmalar.firma")),
            ],
            options={
                "verbose_name": "Servis bedeli kuralı",
                "verbose_name_plural": "Servis bedeli kuralları",
                "ordering": ["-kampanya_mi", "kapsam", "-id"],
                "permissions": [("approve_servis_bedeli_kampanya", "Servis bedeli kampanyasını onaylar")],
            },
        ),
        migrations.AddField(
            model_name="pricequote",
            name="varyant_fiyat",
            field=models.ForeignKey(blank=True, help_text="Ops Stok & Fiyat kaynağı; teklif kaldırıldı.", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="price_quotes", to="fiyatlama.varyantfiyat"),
        ),
        migrations.AddField(
            model_name="pricequote",
            name="fiyat_kaynagi_versiyon",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name="pricequoteline",
            name="kalem_tipi",
            field=models.CharField(choices=[("metal", "Metal"), ("iscilik", "İşçilik"), ("kanal_marj", "Kanal marjı (alias)"), ("servis_bedeli", "Servis bedeli"), ("tas", "Taş"), ("ek_bedel", "Ek bedel"), ("gram_birim", "Gram × birim"), ("sabit_parca", "Sabit parça"), ("hedef_toplam", "Hedef toplam (KS-6)"), ("ham", "Ham (hop)")], max_length=16),
        ),
        migrations.AddConstraint(
            model_name="varyantfiyat",
            constraint=models.UniqueConstraint(condition=models.Q(("durum", "AKTIF")), fields=("varyant",), name="varyantfiyat_tek_aktif"),
        ),
        migrations.AddConstraint(
            model_name="varyantfiyat",
            constraint=models.CheckConstraint(condition=models.Q(("fiyat_modeli__in", ["METAL_BAZLI", "GRAM_BIRIM", "SABIT_PARCA"])), name="varyantfiyat_model_gecerli"),
        ),
        migrations.AddIndex(
            model_name="varyantfiyat",
            index=models.Index(fields=["varyant", "durum"], name="fiyatlama_v_varyant_7a0b1c_idx"),
        ),
        migrations.AddIndex(
            model_name="varyantfiyat",
            index=models.Index(fields=["tedarikci"], name="fiyatlama_v_tedarik_8d2e3f_idx"),
        ),
        migrations.AddIndex(
            model_name="servisbedelikurali",
            index=models.Index(fields=["kapsam", "durum"], name="fiyatlama_s_kapsam_9a1b2c_idx"),
        ),
        migrations.AddIndex(
            model_name="servisbedelikurali",
            index=models.Index(fields=["satis_kanali", "tedarikci"], name="fiyatlama_s_satis_k_0c2d3e_idx"),
        ),
        migrations.RemoveField(model_name="pricequote", name="teklif"),
        migrations.RemoveField(model_name="pricequote", name="teklif_versiyon"),
        # TedarikciTeklif / TeklifTasMaliyeti tabloları belgeler FK nedeniyle
        # sonraki dilimde düşülür; üretim yolu VaryantFiyat.
    ]
