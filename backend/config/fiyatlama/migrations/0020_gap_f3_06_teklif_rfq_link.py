import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("fiyatlama", "0019_cap_piyasa_adr0018"),
        ("siparis", "0010_hazirlama_emri_backfill"),
    ]

    operations = [
        migrations.AddField(
            model_name="tedarikciteklif",
            name="rfq",
            field=models.ForeignKey(
                blank=True,
                help_text="GAP-F3-06: teklifin yanıtladığı RFQ.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tedarikci_teklifleri",
                to="siparis.rfq",
            ),
        ),
        migrations.AddField(
            model_name="tedarikciteklif",
            name="rfq_line",
            field=models.ForeignKey(
                blank=True,
                help_text="GAP-F3-06: teklifin yanıtladığı RFQ satırı.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tedarikci_teklifleri",
                to="siparis.rfqline",
            ),
        ),
    ]
