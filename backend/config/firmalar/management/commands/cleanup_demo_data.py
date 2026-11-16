"""Demo işlem verisini firma bazında sayar / onayla siler (seed_* komutlarına dokunmaz)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import models

from firmalar.models import Firma
from fiyatlama.models import VaryantFiyat
from siparis.models import Order
from stok.models import StockBalance, StockMovement


class Command(BaseCommand):
    help = (
        "Firma başına sipariş, stok hareketi ve VaryantFiyat sayımı. "
        "--confirm olmadan dry-run. PROTECT/FK engelinde durur."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--firma-kod",
            dest="firma_kod",
            default="",
            help="Yalnız bu firma_kodu (boş = tüm firmalar)",
        )
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Sayımlardan sonra silmeyi dene",
        )

    def handle(self, *args, **options):
        firma_kod = (options.get("firma_kod") or "").strip()
        confirm = bool(options.get("confirm"))
        qs = Firma.objects.all().order_by("id")
        if firma_kod:
            qs = qs.filter(firma_kodu=firma_kod)
        if not qs.exists():
            raise CommandError("Firma bulunamadı.")

        for firma in qs:
            counts = self._counts(firma)
            self.stdout.write(
                f"{firma.firma_kodu or firma.pk} · {firma.ad}: "
                f"siparis={counts['siparis']} "
                f"stock_movement={counts['stock_movement']} "
                f"stock_balance={counts['stock_balance']} "
                f"varyant_fiyat={counts['varyant_fiyat']}"
            )
            if not confirm:
                continue
            try:
                self._delete(firma)
                self.stdout.write(self.style.SUCCESS(f"  silindi: {firma.ad}"))
            except models.ProtectedError as exc:
                raise CommandError(
                    f"PROTECT/FK engeli — {firma.ad}: {exc}"
                ) from exc

        if not confirm:
            self.stdout.write(
                self.style.WARNING("Dry-run. Silmek için: --confirm (PROTECT durdurur)")
            )

    def _counts(self, firma: Firma) -> dict[str, int]:
        return {
            "siparis": Order.objects.filter(alici_firma=firma).count(),
            "stock_movement": StockMovement.objects.filter(
                warehouse__sahip_firma=firma
            ).count(),
            "stock_balance": StockBalance.objects.filter(
                warehouse__sahip_firma=firma
            ).count(),
            "varyant_fiyat": VaryantFiyat.objects.filter(
                varyant__urun__olusturan_firma=firma
            ).count(),
        }

    def _delete(self, firma: Firma) -> None:
        vf_qs = VaryantFiyat.objects.filter(varyant__urun__olusturan_firma=firma)
        vf_qs.delete()
        StockMovement.objects.filter(warehouse__sahip_firma=firma).delete()
        StockBalance.objects.filter(warehouse__sahip_firma=firma).delete()
        Order.objects.filter(alici_firma=firma).delete()