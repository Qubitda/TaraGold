"""ADR-0043 — CartLine/OrderLine bilesim + unique (cart, varyant, anahtar)."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("siparis", "0014_adr0001_v2_bilesen_usd"),
    ]

    operations = [
        migrations.AddField(
            model_name="cartline",
            name="bilesim",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="cartline",
            name="bilesim_anahtar",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="orderline",
            name="bilesim",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.RemoveConstraint(
            model_name="cartline",
            name="cartline_cart_varyant_uniq",
        ),
        migrations.AddConstraint(
            model_name="cartline",
            constraint=models.UniqueConstraint(
                fields=("cart", "varyant", "bilesim_anahtar"),
                name="cartline_cart_varyant_bilesim_uniq",
            ),
        ),
    ]
