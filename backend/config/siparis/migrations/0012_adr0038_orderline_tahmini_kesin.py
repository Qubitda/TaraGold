"""ADR-0038: OrderLine tahmini/kesin; price_lock & stock_reservation nullable."""

from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


def backfill_tahmini(apps, schema_editor):
    OrderLine = apps.get_model("siparis", "OrderLine")
    for line in OrderLine.objects.all().iterator():
        snap_b = line.snapshot_birim_fiyat_vergisiz
        snap_s = line.snapshot_satir_tutari_vergisiz
        updates = []
        if line.tahmini_birim_fiyat_vergisiz is None and snap_b is not None:
            line.tahmini_birim_fiyat_vergisiz = snap_b
            updates.append("tahmini_birim_fiyat_vergisiz")
        if line.tahmini_satir_tutari_vergisiz is None and snap_s is not None:
            line.tahmini_satir_tutari_vergisiz = snap_s
            updates.append("tahmini_satir_tutari_vergisiz")
        if updates:
            line.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ("fiyatlama", "0023_varyant_fiyat_index_cleanup"),
        ("siparis", "0011_delete_rfq_domain"),
        ("stok", "0006_varyant_fiyat_index_cleanup"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderline",
            name="tahmini_birim_fiyat_vergisiz",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=18, null=True
            ),
        ),
        migrations.AddField(
            model_name="orderline",
            name="tahmini_satir_tutari_vergisiz",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=18, null=True
            ),
        ),
        migrations.AddField(
            model_name="orderline",
            name="price_quote",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="order_lines",
                to="fiyatlama.pricequote",
            ),
        ),
        migrations.AlterField(
            model_name="orderline",
            name="price_lock",
            field=models.OneToOneField(
                blank=True,
                help_text="Eski L-11 yolu; yeni siparişlerde boş.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="order_line",
                to="fiyatlama.pricelock",
            ),
        ),
        migrations.AlterField(
            model_name="orderline",
            name="stock_reservation",
            field=models.OneToOneField(
                blank=True,
                help_text="Onayda doldurulabilir; gönderimde boş.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="order_line",
                to="stok.stockreservation",
            ),
        ),
        migrations.AlterField(
            model_name="orderline",
            name="snapshot_birim_fiyat_vergisiz",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=18, null=True
            ),
        ),
        migrations.AlterField(
            model_name="orderline",
            name="snapshot_satir_tutari_vergisiz",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=18, null=True
            ),
        ),
        migrations.RunPython(backfill_tahmini, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="orderline",
            name="orderline_birim_fiyat_negatif_degil",
        ),
        migrations.RemoveConstraint(
            model_name="orderline",
            name="orderline_satir_tutar_negatif_degil",
        ),
        migrations.AddConstraint(
            model_name="orderline",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(snapshot_birim_fiyat_vergisiz__isnull=True)
                    | models.Q(snapshot_birim_fiyat_vergisiz__gte=0)
                ),
                name="orderline_birim_fiyat_negatif_degil",
            ),
        ),
        migrations.AddConstraint(
            model_name="orderline",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(snapshot_satir_tutari_vergisiz__isnull=True)
                    | models.Q(snapshot_satir_tutari_vergisiz__gte=0)
                ),
                name="orderline_satir_tutar_negatif_degil",
            ),
        ),
        migrations.AddConstraint(
            model_name="orderline",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(tahmini_birim_fiyat_vergisiz__isnull=True)
                    | models.Q(tahmini_birim_fiyat_vergisiz__gte=0)
                ),
                name="orderline_tahmini_birim_negatif_degil",
            ),
        ),
        migrations.AddConstraint(
            model_name="orderline",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(tahmini_satir_tutari_vergisiz__isnull=True)
                    | models.Q(tahmini_satir_tutari_vergisiz__gte=0)
                ),
                name="orderline_tahmini_satir_negatif_degil",
            ),
        ),
    ]
