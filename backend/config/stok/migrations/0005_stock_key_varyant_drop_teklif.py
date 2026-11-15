"""Stok anahtarı (warehouse, varyant, birim); teklif FK kaldır."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("stok", "0004_balance_reserved_le_on_hand"),
        ("fiyatlama", "0021_remove_teklif_rfq_link"),
        ("urunler", "0009_f4_070_legacy_stock_readonly"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="stockbalance",
                    name="stockbalance_wh_teklif_birim_uniq",
                ),
                migrations.RemoveField(model_name="stockbalance", name="teklif"),
                migrations.RemoveField(model_name="stockmovement", name="teklif"),
                migrations.RemoveField(model_name="stockreservation", name="teklif"),
                migrations.AddConstraint(
                    model_name="stockbalance",
                    constraint=models.UniqueConstraint(
                        fields=("warehouse", "varyant", "birim"),
                        name="stockbalance_wh_varyant_birim_uniq",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=[
                        "ALTER TABLE stok_stockbalance DROP CONSTRAINT IF EXISTS stockbalance_wh_teklif_birim_uniq;",
                        "ALTER TABLE stok_stockbalance DROP COLUMN IF EXISTS teklif_id CASCADE;",
                        "ALTER TABLE stok_stockmovement DROP COLUMN IF EXISTS teklif_id CASCADE;",
                        "ALTER TABLE stok_stockreservation DROP COLUMN IF EXISTS teklif_id CASCADE;",
                        """
                        DO $$ BEGIN
                          IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'stockbalance_wh_varyant_birim_uniq'
                          ) THEN
                            ALTER TABLE stok_stockbalance
                              ADD CONSTRAINT stockbalance_wh_varyant_birim_uniq
                              UNIQUE (warehouse_id, varyant_id, birim);
                          END IF;
                        END $$;
                        """,
                    ],
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
    ]
