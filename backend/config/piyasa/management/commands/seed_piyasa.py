"""Canlı piyasa kalemleri — sektör panosu (has/ayar/işçilik/sarrafiye/gümüş)."""

from decimal import Decimal

from django.core.management.base import BaseCommand

from piyasa.models import (
    DarphaneIscilik,
    PiyasaKarPolitikasi,
    PiyasaMarjPolitikasi,
    PiyasaUrun,
)
from tanimlar.models import AyarMilyem, KiymetliMetal


def _ayar(metal, deger, kod, milyem):
    obj = AyarMilyem.objects.filter(metal=metal, ayar_degeri=deger).first()
    if obj is None:
        obj = AyarMilyem.objects.create(
            metal=metal,
            ayar_degeri=deger,
            ayar_kodu=kod,
            milyem=Decimal(milyem),
        )
    return obj


class Command(BaseCommand):
    help = "Piyasa panosu sektör kalemleri (Kızıltepe tarzı + sarrafiye/gümüş)."

    def handle(self, *args, **options):
        PiyasaMarjPolitikasi.objects.get_or_create(
            anahtar="default",
            defaults={"marj_modu": PiyasaMarjPolitikasi.MarjModu.YUZDE},
        )
        PiyasaKarPolitikasi.objects.get_or_create(anahtar="default")

        altin, _ = KiymetliMetal.objects.get_or_create(
            kod="ALTIN", defaults={"ad": "Altın", "gram_bazli": True}
        )
        gumus, _ = KiymetliMetal.objects.get_or_create(
            kod="GUMUS", defaults={"ad": "Gümüş", "gram_bazli": True}
        )
        ayar22 = _ayar(altin, 22, "22K", "0.916")
        ayar21 = _ayar(altin, 21, "21K", "0.875")
        ayar18 = _ayar(altin, 18, "18K", "0.750")
        ayar14 = _ayar(altin, 14, "14K", "0.585")

        # kod, ad, bolum, grup, varyant, metal, ayar, olcek, gram, ticker, sira, ondalik
        rows = [
            # --- Referans ---
            ("has", "HAS", "ALTIN", "HAS", "", altin, None, "GRAM", "1", True, 10, 2),
            ("ons", "ONS", "ALTIN", "HAS", "", altin, None, "ONS", "1", True, 20, 2),
            ("has_kg", "TL/KG", "ALTIN", "HAS", "", altin, None, "KG", "1", True, 30, 0),
            ("eur_kg", "EUR/KG (TL baz)", "ALTIN", "HAS", "", altin, None, "KG", "1", False, 40, 0),
            # --- Gram / imalat (sol kolon) ---
            ("hind_trabzon", "Hind-Trabzon-Dorik", "ALTIN", "ISCILIK", "", altin, None, "GRAM", "1", False, 100, 2),
            ("fantazi_akitma", "Fantazi-Akitma-Kabu", "ALTIN", "ISCILIK", "", altin, None, "GRAM", "1", False, 110, 2),
            ("cnc_ajda_22", "CNC-Ajda-22 Ayar Zin", "ALTIN", "ISCILIK", "", altin, ayar22, "GRAM", "1", False, 120, 2),
            ("gram24", "24 Ayar Gram Altın", "ALTIN", "AYAR_GRAM", "", altin, None, "GRAM", "1", True, 130, 2),
            # --- Ayar & bilezik (sağ kolon) ---
            ("22ayar", "22 Ayar / 916", "ALTIN", "AYAR_GRAM", "", altin, ayar22, "GRAM", "1", True, 200, 2),
            ("rek_bilezik", "Rek Bilezik", "ALTIN", "ISCILIK", "", altin, ayar22, "GRAM", "1", False, 210, 2),
            ("burma_bilezik", "Burma Bilezik", "ALTIN", "ISCILIK", "", altin, ayar22, "GRAM", "1", False, 220, 2),
            ("ayar21", "21 Ayar Zincir", "ALTIN", "AYAR_GRAM", "", altin, ayar21, "GRAM", "1", False, 230, 2),
            ("14ayar", "14 Ayar / 585", "ALTIN", "AYAR_GRAM", "", altin, ayar14, "GRAM", "1", False, 240, 2),
            ("cumhuriyet", "Cumhuriyet", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "7.216", False, 250, 0),
            # --- Gümüş ---
            ("gumus_ons", "Gümüş Ons", "ALTIN", "GUMUS", "", gumus, None, "ONS", "1", True, 300, 2),
            ("gumus_kg", "Gümüş TL/KG", "ALTIN", "GUMUS", "", gumus, None, "KG", "1", True, 310, 0),
            ("gumus_10g", "Gümüş TL (10g)", "ALTIN", "GUMUS", "", gumus, None, "GRAM", "10", True, 320, 2),
            # --- Sarrafiye yeni ---
            ("ceyrek_yeni", "Çeyrek", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "1.750", True, 400, 0),
            ("yarim_yeni", "Yarım", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "3.500", True, 410, 0),
            ("tam_yeni", "Tam", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "7.000", False, 420, 0),
            ("kemali", "Kemali", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "7.000", False, 430, 0),
            ("arma", "Arma", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "17.500", False, 440, 0),
            ("ata_yeni", "Ata", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "7.216", True, 450, 0),
            ("gremse_yeni", "Gremse", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "17.500", False, 460, 0),
            ("ata5_yeni", "Ata 5’li", "ALTIN", "SARRAFIYE", "YENI", altin, ayar22, "GRAM", "36.080", False, 470, 0),
            # --- Sarrafiye eski ---
            ("ceyrek_eski", "Eski Çeyrek", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "1.750", False, 500, 0),
            ("yarim_eski", "Eski Yarım", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "3.500", False, 510, 0),
            ("tam_eski", "Eski Tam", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "7.000", False, 520, 0),
            ("ata_eski", "Eski Ata", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "7.216", False, 530, 0),
            ("gremse_eski", "Eski Gremse", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "17.500", False, 540, 0),
            ("ata5_eski", "Eski Ata 5’li", "ESKI_ALTIN", "SARRAFIYE", "ESKI", altin, ayar22, "GRAM", "36.080", False, 550, 0),
            # --- Hurda örnek (ADR-0042: aynı formül; kullanıcı marj yazar) ---
            ("hurda_14", "14 Ayar Hurda", "ESKI_ALTIN", "AYAR_GRAM", "", altin, ayar14, "GRAM", "1", False, 600, 2),
            ("hurda_18", "18 Ayar Hurda", "ESKI_ALTIN", "AYAR_GRAM", "", altin, ayar18, "GRAM", "1", False, 610, 2),
            ("hurda_21", "21 Ayar Hurda", "ESKI_ALTIN", "AYAR_GRAM", "", altin, ayar21, "GRAM", "1", False, 620, 2),
            ("hurda_22", "22 Ayar Hurda", "ESKI_ALTIN", "AYAR_GRAM", "", altin, ayar22, "GRAM", "1", False, 630, 2),
        ]

        yeni = 0
        for (
            kod,
            ad,
            bolum,
            grup,
            varyant,
            metal,
            ayar,
            olcek,
            gram,
            ticker,
            sira,
            ondalik,
        ) in rows:
            _, created = PiyasaUrun.objects.update_or_create(
                kod=kod,
                defaults={
                    "ad": ad,
                    "bolum": bolum,
                    "grup": grup,
                    "varyant_etiket": varyant,
                    "metal": metal,
                    "ayar": ayar,
                    "olcek": olcek,
                    "cikti_pb": PiyasaUrun.CiktiPb.TRY,
                    "gram": Decimal(gram),
                    "marj_tipi": PiyasaUrun.MarjTipi.YUZDE,
                    "alis_marj": Decimal("0"),
                    "satis_marj": Decimal("0"),
                    "ticker_da_goster": ticker,
                    "aliciya_alis_goster": True,
                    "alis_goster": True,
                    "satis_goster": True,
                    "aliciya_goster": True,
                    "yuvarlama_adimi": Decimal("0.01"),
                    "ondalik": ondalik,
                    "sira": sira,
                    "aktif": True,
                },
            )
            yeni += int(created)

        ceyrek = PiyasaUrun.objects.filter(kod="ceyrek_yeni").first()
        if ceyrek:
            for kanal, tl in (
                (DarphaneIscilik.Kanal.YENI_HAS, Decimal("50")),
                (DarphaneIscilik.Kanal.ESKI_HAS, Decimal("30")),
                (DarphaneIscilik.Kanal.BORSA_HAS, Decimal("20")),
            ):
                DarphaneIscilik.objects.update_or_create(
                    urun=ceyrek,
                    kanal=kanal,
                    defaults={"iscilik_tl": tl, "aktif": True, "sira": 0},
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_piyasa tamam. yeni={yeni} aktif={PiyasaUrun.objects.filter(aktif=True).count()}"
            )
        )
