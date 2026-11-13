"""ADR-0036 backfill: mevcut onaylı/hazırlanan siparişler için HazirlamaEmri üret (veri kaybı yok)."""

from django.db import migrations


def forwards(apps, schema_editor):
    Order = apps.get_model("siparis", "Order")
    OrderLine = apps.get_model("siparis", "OrderLine")
    HazirlamaEmri = apps.get_model("siparis", "HazirlamaEmri")

    target_orders = Order.objects.filter(
        durum__in=["ONAYLANDI", "HAZIRLANIYOR", "HAZIR", "IPTAL"]
    )
    created = 0
    for order in target_orders.iterator():
        lines = (
            OrderLine.objects.filter(order_id=order.pk)
            .select_related("stock_reservation__teklif")
        )
        by_supplier: dict[int, str] = {}
        for line in lines:
            res = getattr(line, "stock_reservation", None)
            teklif = getattr(res, "teklif", None) if res else None
            ted_id = getattr(teklif, "tedarikci_id", None) if teklif else None
            if not ted_id:
                continue
            tm = getattr(line, "teslim_modeli", "PLATFORM_QC") or "PLATFORM_QC"
            if ted_id not in by_supplier:
                by_supplier[ted_id] = tm
            elif tm == "PLATFORM_QC":
                by_supplier[ted_id] = "PLATFORM_QC"
        if order.durum == "HAZIR":
            emir_durum = "HAZIR"
        elif order.durum == "IPTAL":
            emir_durum = "IPTAL"
        else:
            emir_durum = "HAZIRLANIYOR"
        for ted_id, tm in by_supplier.items():
            _, was_created = HazirlamaEmri.objects.get_or_create(
                order_id=order.pk,
                tedarikci_firma_id=ted_id,
                defaults={
                    "durum": emir_durum,
                    "teslim_modeli": tm,
                },
            )
            if was_created:
                created += 1
    print(f"ADR-0036 backfill HazirlamaEmri: {created}")


def backwards(apps, schema_editor):
    HazirlamaEmri = apps.get_model("siparis", "HazirlamaEmri")
    HazirlamaEmri.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("siparis", "0009_normatif_hazirlama_emri"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
