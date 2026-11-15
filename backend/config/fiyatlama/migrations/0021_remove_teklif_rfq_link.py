from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("fiyatlama", "0020_gap_f3_06_teklif_rfq_link"),
        ("siparis", "0010_hazirlama_emri_backfill"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tedarikciteklif",
            name="rfq",
        ),
        migrations.RemoveField(
            model_name="tedarikciteklif",
            name="rfq_line",
        ),
    ]