"""ADR-0044 — montür/taş örnekleri (tüm uyumluluk alanları dolu). İnceleme için.

Önkoşul: seed_demo_portals (+ tercihen seed_demo_commerce).
Idempotent: DEMO-IM-* platform kodları.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from firmalar.models import Firma
from fiyatlama.models import TedarikciTeklif
from stok.models import StockBalance, StockMovement, Warehouse
from stok.services import ledger_servisi, warehouse_servisi
from tanimlar.models import AyarMilyem, KiymetliMetal, SatisKanali
from urunler.models import Kategori, Renk, TasKesimi, Urun, Varyant

User = get_user_model()

# (kod, ad) — sözlük önerisi; serbest kod da geçerli
EXTRA_KESIMLER = [
    ("ROUND", "Round / Brilliant"),
    ("CABOCHON", "Cabochon"),
    ("BEAD", "Boncuk / Bead"),
    ("HAM", "Ham / işlenmemiş"),
    ("RAW", "Raw nugget"),
]


class Command(BaseCommand):
    help = "ADR-0044 imalat örnek montür + her tür taş (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-commerce",
            action="store_true",
            help="seed_demo_commerce çağırma",
        )

    def handle(self, *args, **options):
        if not options["skip_commerce"]:
            try:
                call_command("seed_demo_commerce")
            except Exception as exc:  # noqa: BLE001
                self.stdout.write(self.style.WARNING(f"commerce seed atlandı: {exc}"))

        platform = Firma.objects.filter(firma_kodu="PLATFORM").first()
        ted = Firma.objects.filter(firma_kodu="DEMO_TEDARIKCI").first()
        ops = User.objects.filter(username="demo_ops").first()
        supplier = User.objects.filter(username="demo_tedarikci").first()
        if not all([platform, ted, ops, supplier]):
            self.stderr.write("Demo portal eksik — seed_demo_portals.")
            return

        metal = KiymetliMetal.objects.filter(gram_bazli=True).order_by("pk").first()
        ayar = (
            AyarMilyem.objects.filter(metal=metal, ayar_kodu="14K").first()
            or AyarMilyem.objects.filter(metal=metal).order_by("pk").first()
        )
        kat_yuzuk = (
            Kategori.objects.filter(kod="YUZUK").first()
            or Kategori.objects.order_by("pk").first()
        )
        kat_genel = (
            Kategori.objects.filter(kod="CHARM").first()
            or Kategori.objects.filter(kod="GENEL").first()
            or kat_yuzuk
        )
        if ayar is None or kat_yuzuk is None:
            self.stderr.write("Ayar/kategori yok — seed_tanimlar + seed_urunler.")
            return

        renk_sari = Renk.objects.filter(kod="SARI").first() or Renk.objects.first()
        now = timezone.now()
        bas, bit = date.today(), date.today() + timedelta(days=180)

        for kod, ad in EXTRA_KESIMLER:
            TasKesimi.objects.get_or_create(
                kod=kod, defaults={"ad": ad, "sira": 90, "aktif": True}
            )

        # --- Ürün + varyant örnekleri ---
        # Montür (imalata açık): tüm uyumluluk alanları dolu
        montur_specs = [
            {
                "platform_kodu": "DEMO-IM-MONTUR-01",
                "ad": "Örnek Montür — tek yuva yüzük",
                "aciklama": "ADR-0044 örnek: yuva=1, ROUND, 0.30–1.00 ct",
                "kategori": kat_yuzuk,
                "fiyat_tipi": "gram",
                "renk_ekseni": True,
                "varyant": {
                    "sku": "DEMO-IM-M01",
                    "tip": Varyant.Tip.MONTUR,
                    "gram": Decimal("2.800"),
                    "renk": renk_sari,
                    "yuva_adedi": 1,
                    "izinli_kesimler": ["ROUND"],
                    "karat_min": Decimal("0.300"),
                    "karat_max": Decimal("1.000"),
                    "tedarikci_sku": "MONT-TEK-ROUND",
                },
            },
            {
                "platform_kodu": "DEMO-IM-MONTUR-02",
                "ad": "Örnek Montür — 3 yuvalı charm",
                "aciklama": "ADR-0044 örnek: yuva=3, CABOCHON|BEAD|HAM, 0.50–2.50 ct toplam",
                "kategori": kat_genel,
                "fiyat_tipi": "gram",
                "renk_ekseni": False,
                "varyant": {
                    "sku": "DEMO-IM-M02",
                    "tip": Varyant.Tip.MONTUR,
                    "gram": Decimal("4.200"),
                    "renk": None,
                    "yuva_adedi": 3,
                    "izinli_kesimler": ["CABOCHON", "BEAD", "HAM"],
                    "karat_min": Decimal("0.500"),
                    "karat_max": Decimal("2.500"),
                    "tedarikci_sku": "MONT-3Y-MIX",
                },
            },
            {
                "platform_kodu": "DEMO-IM-MONTUR-BOS",
                "ad": "Örnek Montür — uyumluluk BOŞ (imalata kapalı)",
                "aciklama": "Sıkı kural: alanlar boş → İmalat listesinde görünmez",
                "kategori": kat_yuzuk,
                "fiyat_tipi": "gram",
                "renk_ekseni": False,
                "varyant": {
                    "sku": "DEMO-IM-MBOS",
                    "tip": Varyant.Tip.MONTUR,
                    "gram": Decimal("3.000"),
                    "renk": None,
                    "yuva_adedi": None,
                    "izinli_kesimler": [],
                    "karat_min": None,
                    "karat_max": None,
                    "tedarikci_sku": "MONT-BOS",
                },
            },
        ]

        # Taş — her tür (mücevher şart değil)
        tas_specs = [
            {
                "platform_kodu": "DEMO-IM-TAS-ZIRKON",
                "ad": "Örnek Taş — Zirkon ROUND 0.50 ct",
                "aciklama": "Sentetik / simülant; ROUND → Montür-01 ile uyumlu",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-TZIR",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("450.00"),
                    "karat": Decimal("0.500"),
                    "kesim_kod": "ROUND",
                    "tedarikci_sku": "ZIRKON-050-R",
                },
            },
            {
                "platform_kodu": "DEMO-IM-TAS-CAM",
                "ad": "Örnek Taş — Cam cabochon 1.20 ct",
                "aciklama": "Cam taş; CABOCHON → Montür-02 ile uyumlu",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-TCAM",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("80.00"),
                    "karat": Decimal("1.200"),
                    "kesim_kod": "CABOCHON",
                    "tedarikci_sku": "CAM-120-CAB",
                },
            },
            {
                "platform_kodu": "DEMO-IM-TAS-INCI",
                "ad": "Örnek Taş — İnci bead 0.80 ct",
                "aciklama": "İnci; BEAD → Montür-02",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-TINC",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("220.00"),
                    "karat": Decimal("0.800"),
                    "kesim_kod": "BEAD",
                    "tedarikci_sku": "INCI-080-BEAD",
                },
            },
            {
                "platform_kodu": "DEMO-IM-TAS-HAM",
                "ad": "Örnek Taş — Ham ametist 1.50 ct",
                "aciklama": "İşlenmemiş; HAM → Montür-02",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-THAM",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("160.00"),
                    "karat": Decimal("1.500"),
                    "kesim_kod": "HAM",
                    "tedarikci_sku": "AMETIST-HAM-150",
                },
            },
            {
                "platform_kodu": "DEMO-IM-TAS-PIRL",
                "ad": "Örnek Taş — Pırlanta ROUND 0.40 ct",
                "aciklama": "Değerli taş örneği; ROUND → Montür-01",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-TPIR",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("12500.00"),
                    "karat": Decimal("0.400"),
                    "kesim_kod": "ROUND",
                    "tedarikci_sku": "PIRL-040-R",
                    "benzersiz_parca": True,
                },
            },
            {
                "platform_kodu": "DEMO-IM-TAS-UYUMSUZ",
                "ad": "Örnek Taş — RAW nugget (hiçbir örnek montüre uymaz)",
                "aciklama": "RAW kodu örnek montür izinlilerinde yok → İmalat sağ panelde çıkmaz",
                "kategori": kat_genel,
                "fiyat_tipi": "sabit",
                "varyant": {
                    "sku": "DEMO-IM-TRAW",
                    "tip": Varyant.Tip.TAS,
                    "sabit_fiyat": Decimal("95.00"),
                    "karat": Decimal("2.000"),
                    "kesim_kod": "RAW",
                    "tedarikci_sku": "RAW-200",
                },
            },
        ]

        created_rows: list[tuple[str, Varyant]] = []

        for spec in montur_specs + tas_specs:
            urun, _ = Urun.objects.get_or_create(
                platform_kodu=spec["platform_kodu"],
                defaults={
                    "olusturan_firma": platform,
                    "ad": spec["ad"],
                    "aciklama": spec["aciklama"],
                    "kategori": spec["kategori"],
                    "ayar": ayar,
                    "fiyat_tipi": spec["fiyat_tipi"],
                    "renk_ekseni": bool(spec.get("renk_ekseni", False)),
                    "temin_tipi": "hazir",
                },
            )
            urun.ad = spec["ad"]
            urun.aciklama = spec["aciklama"]
            urun.kategori = spec["kategori"]
            urun.ayar = ayar
            urun.fiyat_tipi = spec["fiyat_tipi"]
            urun.renk_ekseni = bool(spec.get("renk_ekseni", False))
            urun.save()
            Urun.objects.filter(pk=urun.pk).update(
                onay_durumu="onayli",
                yayin_durumu="aktif",
                onaylayan_kullanici=ops,
                onay_zamani=now,
            )
            urun.refresh_from_db()

            vs = spec["varyant"]
            v = Varyant.objects.filter(urun=urun, sku=vs["sku"]).first()
            if v is None:
                v = Varyant(urun=urun, sku=vs["sku"])
            v.tip = vs["tip"]
            v.gram = vs.get("gram")
            v.sabit_fiyat = vs.get("sabit_fiyat")
            v.renk = vs.get("renk")
            v.yuva_adedi = vs.get("yuva_adedi")
            v.izinli_kesimler = list(vs.get("izinli_kesimler") or [])
            v.karat_min = vs.get("karat_min")
            v.karat_max = vs.get("karat_max")
            v.karat = vs.get("karat")
            v.kesim_kod = vs.get("kesim_kod") or ""
            v.tedarikci_sku = vs.get("tedarikci_sku") or ""
            v.benzersiz_parca = bool(vs.get("benzersiz_parca", False))
            v.ek_bedel = Decimal("0")
            v.aktif = True
            v.full_clean()
            v.save()
            created_rows.append((spec["platform_kodu"], v))

            # Teklif + stok (quote için)
            teklif = TedarikciTeklif.objects.filter(
                varyant=v, tedarikci=ted, durum=TedarikciTeklif.Durum.YAYINDA
            ).first()
            if teklif is None:
                if v.tip == Varyant.Tip.TAS:
                    teklif = TedarikciTeklif.objects.create(
                        varyant=v,
                        tedarikci=ted,
                        tedarikci_kodu=v.tedarikci_sku or v.sku,
                        fiyat_modeli=TedarikciTeklif.FiyatModeli.SABIT_PARCA,
                        birim_fiyat=v.sabit_fiyat or Decimal("100.00"),
                        durum=TedarikciTeklif.Durum.YAYINDA,
                        gecerlilik_baslangic=bas,
                        gecerlilik_bitis=bit,
                        eslestirme_durumu="onaylandi",
                        hedef_urun=urun,
                        oncelik=10,
                    )
                else:
                    teklif = TedarikciTeklif.objects.create(
                        varyant=v,
                        tedarikci=ted,
                        tedarikci_kodu=v.tedarikci_sku or v.sku,
                        fiyat_modeli=TedarikciTeklif.FiyatModeli.METAL_BAZLI,
                        gram=v.gram,
                        durum=TedarikciTeklif.Durum.YAYINDA,
                        gecerlilik_baslangic=bas,
                        gecerlilik_bitis=bit,
                        eslestirme_durumu="onaylandi",
                        hedef_urun=urun,
                        oncelik=10,
                        iscilik_override=Decimal("120.00"),
                    )
            wh = Warehouse.objects.filter(sahip_firma=ted, kod="DEMOWH").first()
            if wh is None:
                try:
                    wh = warehouse_servisi.olustur_warehouse(
                        actor=supplier,
                        sahip_firma=ted,
                        kod="DEMOWH",
                        ad="Demo tedarikçi depo",
                    )
                except Exception:  # noqa: BLE001
                    wh = Warehouse.objects.filter(
                        sahip_firma=ted, kod="DEMOWH"
                    ).first()
            if wh is not None:
                bal = StockBalance.objects.filter(
                    warehouse=wh, teklif=teklif
                ).first()
                if bal is None or bal.on_hand < Decimal("10"):
                    ledger_servisi.kaydet_hareket(
                        actor=supplier,
                        warehouse=wh,
                        teklif=teklif,
                        tip=StockMovement.Tip.GIRIS,
                        miktar=Decimal("30"),
                    )

        # Kanal TTL
        SatisKanali.objects.filter(aktif=True, quote_ttl_saniye__isnull=True).update(
            quote_ttl_saniye=300
        )

        self.stdout.write(self.style.SUCCESS("seed_demo_imalat tamam.\n"))
        self.stdout.write(
            f"{'Kod':<22} {'Tip':<8} {'SKU':<14} "
            f"{'yuva':>4} {'kesim/izinli':<28} {'ct/min-max':<14} imalata"
        )
        self.stdout.write("-" * 100)
        from urunler.services.uyumluluk_servisi import montur_imalata_acik

        for kod, v in created_rows:
            if v.tip == Varyant.Tip.MONTUR:
                izin = ",".join(v.izinli_kesimler or []) or "—"
                rng = (
                    f"{v.karat_min}-{v.karat_max}"
                    if v.karat_min is not None
                    else "—"
                )
                flag = "EVET" if montur_imalata_acik(v) else "HAYIR"
                self.stdout.write(
                    f"{kod:<22} {v.tip:<8} {v.sku:<14} "
                    f"{str(v.yuva_adedi or '—'):>4} {izin:<28} {rng:<14} {flag}"
                )
            else:
                self.stdout.write(
                    f"{kod:<22} {v.tip:<8} {v.sku:<14} "
                    f"{'—':>4} {(v.kesim_kod or '—'):<28} "
                    f"{str(v.karat or '—'):<14} (taş)"
                )

        self.stdout.write(
            "\nİncele: /urunler?scope=monturler | taslar | imalat\n"
            "  Montür-01 + Zirkon/Pırlanta ROUND → İmal et\n"
            "  Montür-02 + Cam/İnci/Ham → İmal et\n"
            "  Montür-BOS ve Taş-RAW imalatta eşleşmez.\n"
        )
