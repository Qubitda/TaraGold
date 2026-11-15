from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("siparis", "0010_hazirlama_emri_backfill"),
        ("fiyatlama", "0021_remove_teklif_rfq_link"),
    ]

    operations = [
        migrations.DeleteModel(
            name="RFQEslestirme",
        ),
        migrations.DeleteModel(
            name="RFQMessage",
        ),
        migrations.DeleteModel(
            name="RFQRevizyon",
        ),
        migrations.DeleteModel(
            name="RFQLine",
        ),
        migrations.DeleteModel(
            name="RFQ",
        ),
    ]