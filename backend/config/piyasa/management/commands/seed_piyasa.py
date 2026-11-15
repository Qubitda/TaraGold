"""Örnek piyasa panosu — Tanımlar metal/ayar + ADR-0022 grup/politika."""

from decimal import Decimal

from django.core.management.base import BaseCommand

from piyasa.models import (
    DarphaneIscilik,
    PiyasaKarPolitikasi,
    PiyasaMarjPolitikasi,
    PiyasaUrun,
)
from tanimlar.models import AyarMilyem, KiymetliMetal


class Command(BaseCommand):
    help = "Piyasa panosu örnek ürünler + politikalar + örnek darphane."

    def handle(self, *args, **options):
        PiyasaMarjPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={"marj_modu": PiyasaMarjPolitikasi.MarjModu.YUZDE},
        )
        PiyasaKarPolitikasi.objects.get_or_create(anahtar="default")

        metal, _ = KiymetliMetal.objects.get_or_create(
            kod="ALTIN", defaults={"ad": "Altın", "gram_bazli": True}
        )
        ayar22 = AyarMilyem.objects.filter(metal=metal, ayar_degeri=22).first()
        if ayar22 is None:
            ayar22 = AyarMilyem.objects.create(
                metal=metal,
                ayar_degeri=22,
                ayar_kodu="22K",
                milyem=Decimal("0.916"),
            )

        # ADR-0039: seed marjlar 0; admin sonra girer. Ticker varsayılan: has, 22ayar, ceyrek.
        rows = [
            {
                "kod": "has",
                "ad": "Has / Gram Altın",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.HAS,
                "ayar": None,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "ticker_da_goster": True,
                "sira": 10,
            },
            {
                "kod": "22ayar",
                "ad": "22 Ayar Bilezik",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.AYAR_GRAM,
                "ayar": ayar22,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "ticker_da_goster": True,
                "sira": 20,
            },
            {
                "kod": "gram24",
                "ad": "24 Ayar Gram Altın",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.AYAR_GRAM,
                "ayar": None,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "sira": 30,
            },
            {
                "kod": "ceyrek",
                "ad": "Çeyrek (Yeni)",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.SARRAFIYE,
                "varyant_etiket": PiyasaUrun.VaryantEtiket.YENI,
                "ayar": None,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "gram": Decimal("1.754"),
                "ticker_da_goster": True,
                "sira": 40,
            },
            {
                "kod": "ons_usd",
                "ad": "Ons (USD)",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.HAS,
                "ayar": None,
                "olcek": PiyasaUrun.Olcek.ONS,
                "cikti_pb": PiyasaUrun.CiktiPb.USD,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "gram": Decimal("1"),
                "sira": 5,
            },
            {
                "kod": "has_kg",
                "ad": "Has TL/KG",
                "bolum": PiyasaUrun.Bolum.ALTIN,
                "grup": PiyasaUrun.Grup.HAS,
                "ayar": None,
                "olcek": PiyasaUrun.Olcek.KG,
                "cikti_pb": PiyasaUrun.CiktiPb.TRY,
                "alis_marj": Decimal("0"),
                "satis_marj": Decimal("0"),
                "gram": Decimal("1"),
                "sira": 6,
            },
        ]
        yeni = 0
        for r in rows:
            obj, created = PiyasaUrun.objects.update_or_create(
                kod=r["kod"],
                defaults={
                    "ad": r["ad"],
                    "bolum": r.get("bolum", PiyasaUrun.Bolum.ALTIN),
                    "grup": r["grup"],
                    "varyant_etiket": r.get("varyant_etiket", ""),
                    "metal": metal,
                    "ayar": r["ayar"],
                    "olcek": r.get("olcek", PiyasaUrun.Olcek.GRAM),
                    "cikti_pb": r.get("cikti_pb", PiyasaUrun.CiktiPb.TRY),
                    "gram": r.get("gram", Decimal("1")),
                    "marj_tipi": PiyasaUrun.MarjTipi.YUZDE,
                    "alis_marj": r["alis_marj"],
                    "satis_marj": r["satis_marj"],
                    "ticker_da_goster": r.get("ticker_da_goster", False),
                    "aliciya_alis_goster": True,
                    "yuvarlama_adimi": Decimal("10"),
                    "sira": r["sira"],
                    "aktif": True,
                },
            )
            yeni += int(created)
            if obj.kod == "ceyrek":
                for kanal, tl in (
                    (DarphaneIscilik.Kanal.YENI_HAS, Decimal("50")),
                    (DarphaneIscilik.Kanal.ESKI_HAS, Decimal("30")),
                    (DarphaneIscilik.Kanal.BORSA_HAS, Decimal("20")),
                ):
                    DarphaneIscilik.objects.update_or_create(
                        urun=obj,
                        kanal=kanal,
                        defaults={"iscilik_tl": tl, "aktif": True, "sira": 0},
                    )

        self.stdout.write(
            self.style.SUCCESS(f"seed_piyasa tamam. yeni_urun={yeni}")
        )
