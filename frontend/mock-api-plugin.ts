import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

function nowIso(): string {
  return new Date().toISOString();
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return {};
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  cookies?: string[]
): void {
  if (cookies?.length) {
    res.setHeader("Set-Cookie", cookies);
  }
  if (status === 204) {
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function paginate<T>(items: T[], url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("page_size") || "20") || 20)
  );
  const start = (page - 1) * pageSize;
  const results = items.slice(start, start + pageSize);
  return {
    count: items.length,
    page,
    page_size: pageSize,
    next: start + pageSize < items.length ? `?page=${page + 1}` : null,
    previous: page > 1 ? `?page=${page - 1}` : null,
    results,
  };
}

function createMockState() {
  let nextId = 1000;
  const genId = () => ++nextId;

  const sessions = new Map<string, string>();

  const firma = {
    id: 1,
    ad: "TaraGold Platform A.Ş.",
    aktif: true,
    alici_mi: true,
    platform_mu: true,
    tedarikci_mi: true,
  };

  const capabilities = {
    can_act_as: true,
    can_approve: true,
    can_checkout: true,
    can_lock_quote: true,
    can_manage_addresses: true,
    can_manage_offers: true,
    can_manage_org: true,
    can_manage_qc: true,
    can_manage_return: true,
    can_manage_rfq: true,
    can_manage_shipment: true,
    can_manage_users: true,
    can_view_cart: true,
    can_view_catalog: true,
    can_view_credit: true,
    can_view_finance: true,
    can_view_ops: true,
    can_view_ops_finance: true,
    can_view_orders: true,
    can_view_shipments: true,
    can_view_supplier_stock: true,
  };

  const profile = {
    id: 1,
    username: "demo",
    first_name: "Tara",
    last_name: "Yönetici",
    email: "demo@taragold.local",
    email_verified: true,
    rol: "PLATFORM_YONETICI",
    firma_id: 1,
    firma,
    allowed_actions: ["update_profile", "change_password"],
  };

  const addresses = [
    {
      id: 1,
      baslik: "Merkez Ofis & Kasa",
      tip: "TESLIMAT",
      ulke: "TR",
      il: "İstanbul",
      ilce: "Fatih",
      posta_kodu: "34120",
      adres: "Kapalıçarşı Kalpakçılar Cad. No: 42",
      acik_adres: "Kapalıçarşı Kalpakçılar Cad. No: 42",
      varsayilan: true,
      aktif: true,
    },
    {
      id: 2,
      baslik: "Kuyumcukent Şube",
      tip: "FATURA",
      ulke: "TR",
      il: "İstanbul",
      ilce: "Bahçelievler",
      posta_kodu: "34197",
      adres: "Kuyumcukent Atölye Bloğu Kat: 3 No: 18",
      acik_adres: "Kuyumcukent Atölye Bloğu Kat: 3 No: 18",
      varsayilan: false,
      aktif: true,
    },
  ];

  const catalogProducts = [
    {
      id: 101,
      ad: "22 Ayar Adana Burma Bilezik",
      platform_kodu: "TG-BLZ-22-001",
      kategori: "Bilezik",
      kategori_id: 1,
      ayar: "22K (916)",
      ayar_id: 1,
      aciklama: "Standart 22 ayar 30gr burma bilezik.",
      fiyat_tipi: "GRAM_HAS_ISCILIK",
      onay_durumu: "ONAYLANDI",
      yayin_durumu: "aktif",
      olusturan_firma_id: 1,
      varyant_count: 2,
      allowed_actions: ["quote", "publish"],
      varyantlar: [
        { id: 1001, sku: "TG-BLZ-22-001-62", beden: "62 mm", renk: "Sarı", gram: "30.000", aktif: true },
        { id: 1002, sku: "TG-BLZ-22-001-64", beden: "64 mm", renk: "Sarı", gram: "32.000", aktif: true },
      ],
    },
    {
      id: 102,
      ad: "14 Ayar Tektaş Montür Yüzük",
      platform_kodu: "TG-YZK-14-014",
      kategori: "Yüzük",
      kategori_id: 2,
      ayar: "14K (585)",
      ayar_id: 2,
      aciklama: "Klasik 6 tırnak montür.",
      fiyat_tipi: "GRAM_HAS_ISCILIK",
      onay_durumu: "ONAYLANDI",
      yayin_durumu: "aktif",
      olusturan_firma_id: 1,
      varyant_count: 2,
      allowed_actions: ["quote", "publish"],
      varyantlar: [
        { id: 1003, sku: "TG-YZK-14-014-14", beden: "14", renk: "Beyaz", gram: "3.450", aktif: true },
        { id: 1004, sku: "TG-YZK-14-014-16", beden: "16", renk: "Roze", gram: "3.600", aktif: true },
      ],
    },
    {
      id: 103,
      ad: "24 Ayar 100gr Külçe Altın",
      platform_kodu: "TG-KLC-24-100",
      kategori: "Külçe",
      kategori_id: 3,
      ayar: "24K (995)",
      ayar_id: 3,
      aciklama: "Rafineri sertifikalı 995.0 külçe.",
      fiyat_tipi: "GRAM_HAS",
      onay_durumu: "ONAYLANDI",
      yayin_durumu: "aktif",
      olusturan_firma_id: 1,
      varyant_count: 1,
      allowed_actions: ["quote"],
      varyantlar: [
        { id: 1005, sku: "TG-KLC-24-100G", beden: "Standart", renk: "Sarı", gram: "100.000", aktif: true },
      ],
    },
  ];

  const quotes = new Map<number, any>();
  const priceLocks = new Map<number, any>();

  const cart: any = {
    id: 1,
    alici_firma_id: 1,
    sube_id: null,
    line_count: 1,
    server_now: nowIso(),
    allowed_actions: ["add_line", "checkout"],
    lines: [
      {
        id: 1,
        varyant_id: 1001,
        varyant_sku: "TG-BLZ-22-001-62",
        urun_ad: "22 Ayar Adana Burma Bilezik",
        quote_id: 501,
        miktar: "2.000",
        birim: "ADET",
        birim_fiyat_vergisiz: "98450.00",
        para_birimi: "TRY",
        gecerlilik_sonu: new Date(Date.now() + 300_000).toISOString(),
      },
    ],
  };

  const orders: any[] = [
    {
      id: 201,
      alici_firma_id: 2,
      alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
      durum: "HAZIRLANIYOR",
      idempotency_key: "seed-order-201",
      line_count: 1,
      satir_sayisi: 1,
      toplamlar: { TRY: "196900.00" },
      olusturma_tarihi: new Date(Date.now() - 86_400_000).toISOString(),
      allowed_actions: ["reorder"],
      lines: [
        {
          id: 1,
          varyant_id: 1001,
          varyant_sku: "TG-BLZ-22-001-62",
          urun_ad: "22 Ayar Adana Burma Bilezik",
          miktar: "2.000",
          birim: "ADET",
          snapshot_birim_fiyat_vergisiz: "98450.00",
          snapshot_satir_tutari_vergisiz: "196900.00",
          para_birimi: "TRY",
        },
      ],
      satirlar: [
        {
          id: 1,
          varyant_id: 1001,
          platform_kodu: "TG-BLZ-22-001-62",
          miktar: "2.000",
          birim: "ADET",
          para_birimi: "TRY",
          satir_tutari: "196900.00",
          teslim_modeli: "PLATFORM_QC",
        },
      ],
      hazirlama_emirleri: [
        {
          id: 1,
          tedarikci_firma_id: 2,
          tedarikci_ad: "Anadolu Kuyumculuk Ltd.",
          durum: "HAZIRLANIYOR",
          teslim_modeli: "PLATFORM_QC",
          hazir_zamani: null,
        },
      ],
    },
    {
      id: 202,
      alici_firma_id: 2,
      alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
      durum: "ONAY_BEKLIYOR",
      idempotency_key: "seed-order-202",
      line_count: 1,
      satir_sayisi: 1,
      toplamlar: { TRY: "49250.00" },
      olusturma_tarihi: new Date(Date.now() - 3_600_000).toISOString(),
      allowed_actions: ["cancel", "reorder"],
      lines: [
        {
          id: 2,
          varyant_id: 1003,
          varyant_sku: "TG-YZK-14-014-14",
          urun_ad: "14 Ayar Tektaş Montür Yüzük",
          miktar: "5.000",
          birim: "ADET",
          snapshot_birim_fiyat_vergisiz: "9850.00",
          snapshot_satir_tutari_vergisiz: "49250.00",
          para_birimi: "TRY",
        },
      ],
      satirlar: [
        {
          id: 2,
          varyant_id: 1003,
          platform_kodu: "TG-YZK-14-014-14",
          miktar: "5.000",
          birim: "ADET",
          para_birimi: "TRY",
          satir_tutari: "49250.00",
          teslim_modeli: "PLATFORM_QC",
        },
      ],
      hazirlama_emirleri: [],
    },
  ];

  const rfqs: any[] = [
    {
      id: 301,
      talep_tipi: "STANDART",
      durum: "GONDERILDI",
      baslik: "22K Burma Bilezik Toptan Alım",
      olusturma_tarihi: new Date(Date.now() - 7_200_000).toISOString(),
      allowed_actions: ["send", "add_message", "add_revision"],
      lines: [
        {
          id: 1,
          varyant_id: 1001,
          miktar: "10.000",
          birim: "ADET",
          aciklama: "62mm standart ölçü",
        },
      ],
      messages: [],
      revizyonlar: [],
    },
  ];

  const rfqMatches: any[] = [
    {
      id: 901,
      rfq_line_id: 1,
      varyant_id: 1001,
      durum: "ONERILDI",
      skor: "0.94",
      kanit: "22K Burma 62mm eşleşme",
      allowed_actions: ["approve", "reject"],
    },
  ];

  const supplierOffers: any[] = [
    {
      id: 401,
      varyant_id: 1001,
      fiyat_modeli: "HAS_PLUS_ISCILIK",
      birim_fiyat: "120.00",
      gram: "30.000",
      iscilik_override: "120.00",
      durum: "YAYINDA",
      para_birimi: "TRY",
      versiyon: 1,
      tedarikci_kodu: "TDK-22K-001",
      allowed_actions: ["deactivate", "new_version"],
    },
  ];

  const hazirlamaOrders: any[] = [
    {
      order_id: 201,
      durum: "HAZIRLANIYOR",
      hazirlama_durumu: "HAZIRLANIYOR",
      alici: null,
      satirlar: [
        {
          order_line_id: 1,
          varyant_id: 1001,
          platform_kodu: "TG-BLZ-22-001-62",
          miktar: "2.000",
          birim: "ADET",
          teslim_modeli: "PLATFORM_QC",
        },
      ],
    },
  ];

  const stockBalances: any[] = [
    {
      id: 1,
      warehouse_id: 1,
      warehouse_ad: "Ana Kasa Depo",
      teklif_id: 401,
      sku: "TG-BLZ-22-001-62",
      on_hand: "25.000",
      reserved: "2.000",
      available: "23.000",
      birim: "ADET",
    },
    {
      id: 2,
      warehouse_id: 1,
      warehouse_ad: "Ana Kasa Depo",
      teklif_id: 401,
      sku: "TG-YZK-14-014-14",
      on_hand: "40.000",
      reserved: "5.000",
      available: "35.000",
      birim: "ADET",
    },
  ];

  const ledgerEntries: any[] = [
    {
      id: 1,
      hareket_tipi: "SIPARIS_BORC",
      yon: "BORC",
      tutar: "196900.00",
      para_birimi: "TRY",
      referans_tip: "ORDER",
      referans_id: 201,
      olusturma_tarihi: new Date(Date.now() - 86_400_000).toISOString(),
      allowed_actions: [],
    },
    {
      id: 2,
      hareket_tipi: "TAHSILAT",
      yon: "ALACAK",
      tutar: "250000.00",
      para_birimi: "TRY",
      referans_tip: "PAYMENT",
      referans_id: 1,
      olusturma_tarihi: new Date(Date.now() - 43_200_000).toISOString(),
      allowed_actions: [],
    },
  ];

  const shipments: any[] = [
    {
      id: 601,
      order_id: 201,
      alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
      durum: "YOLDA",
      teslim_modeli: "PLATFORM_QC",
      sevk_yonu: "PLATFORM_TO_ALICI",
      tasiyici: "Loomis Zırhlı Lojistik",
      kargo_firma: "Loomis",
      takip_no: "LOOMIS-TR-99812",
      notlar: "Zırhlı araç teslimatı",
      pod: null,
      olusturma_tarihi: new Date(Date.now() - 18_000_000).toISOString(),
      allowed_actions: ["deliver", "add_pod", "cancel"],
    },
  ];

  const returnsList: any[] = [
    {
      id: 751,
      order_id: 201,
      alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
      shipment_id: 601,
      durum: "TASLAK",
      sebep: "Numune ayar kontrol farkı",
      iade_sebebi: "Numune ayar kontrol farkı",
      mahsup_tutari: null,
      notlar: "",
      stok_iade_yapildi: false,
      finans_mahsup_yapildi: false,
      olusturma_tarihi: new Date(Date.now() - 3_600_000).toISOString(),
      lines: [
        {
          id: 1,
          order_line_id: 1,
          varyant_sku: "TG-BLZ-22-001-62",
          miktar: "1.000",
          birim: "ADET",
        },
      ],
      allowed_actions: ["submit_review", "approve", "reject", "cancel"],
    },
  ];

  const inspections: any[] = [
    {
      id: 701,
      order_id: 201,
      order_line_id: 1,
      alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
      durum: "TASLAK",
      shipment_blok: true,
      notlar: "İlk parti ayar & gram kontrolü",
      olusturma_tarihi: new Date(Date.now() - 7_200_000).toISOString(),
      measurements: [],
      allowed_actions: ["start", "cancel"],
    },
  ];

  const warehousesSeed: any[] = [
    {
      id: 1,
      kod: "KASA-01",
      ad: "Ana Kasa Depo",
      sahip_tipi: "PLATFORM",
      sahip_firma_id: 1,
      sahip_firma_ad: "TaraGold Platform A.Ş.",
      aktif: true,
      olusturma_tarihi: nowIso(),
    },
  ];

  const categoriesSeed: any[] = [
    {
      id: 1,
      kod: "BILEZIK",
      ad: "Bilezik",
      slug: "bilezik",
      tam_ad: "Bilezik",
      ust_id: null,
      fiyat_grubu_id: 1,
      fiyat_grubu_ad: "VIP Kuyumcu",
      etkin_fiyat_grubu_id: 1,
      etkin_fiyat_grubu_ad: "VIP Kuyumcu",
      sira: 10,
      aktif: true,
      dahili: false,
      one_cikan: true,
      urun_sayisi: 1,
    },
    {
      id: 2,
      kod: "YUZUK",
      ad: "Yüzük",
      slug: "yuzuk",
      tam_ad: "Yüzük",
      ust_id: null,
      fiyat_grubu_id: 1,
      fiyat_grubu_ad: "VIP Kuyumcu",
      etkin_fiyat_grubu_id: 1,
      etkin_fiyat_grubu_ad: "VIP Kuyumcu",
      sira: 20,
      aktif: true,
      dahili: false,
      one_cikan: true,
      urun_sayisi: 1,
    },
    {
      id: 3,
      kod: "KULCE",
      ad: "Külçe",
      slug: "kulce",
      tam_ad: "Külçe",
      ust_id: null,
      fiyat_grubu_id: 2,
      fiyat_grubu_ad: "B2B API Standart",
      etkin_fiyat_grubu_id: 2,
      etkin_fiyat_grubu_ad: "B2B API Standart",
      sira: 30,
      aktif: true,
      dahili: false,
      one_cikan: false,
      urun_sayisi: 1,
    },
  ];

  const opsRenkler: any[] = [
    { id: 1, kod: "SARI", ad: "Sarı", hex_kodu: "#D4AF37" },
    { id: 2, kod: "BEYAZ", ad: "Beyaz", hex_kodu: "#E5E7EB" },
    { id: 3, kod: "ROZE", ad: "Roze", hex_kodu: "#E8A89A" },
  ];
  const opsOlculer: any[] = [
    { id: 1, tip: "BILEZIK_CAP", sayisal_deger: "62.00", deger: "62 mm" },
    { id: 2, tip: "YUZUK_NO", sayisal_deger: "14.00", deger: "14" },
  ];
  const opsAyarlar: any[] = [
    { id: 1, metal_id: 1, metal_kod: "XAU", metal_ad: "Altın", fiyat_kaynagi: "HAS_ALTIN", ayar_degeri: 22, ayar_kodu: "22K", milyem: "0.9160" },
    { id: 2, metal_id: 1, metal_kod: "XAU", metal_ad: "Altın", fiyat_kaynagi: "HAS_ALTIN", ayar_degeri: 14, ayar_kodu: "14K", milyem: "0.5850" },
    { id: 3, metal_id: 1, metal_kod: "XAU", metal_ad: "Altın", fiyat_kaynagi: "HAS_ALTIN", ayar_degeri: 24, ayar_kodu: "24K", milyem: "0.9950" },
  ];
  const opsMetalKurlari: any[] = [
    { id: 1, metal_id: 1, metal_kod: "XAU", metal_ad: "Altın", saglayici_id: 1, saglayici_kod: "NADIR", kur_tipi: "SATIS", saf_birim_fiyat: "3450.00", kaynak: "CANLI", manuel_neden: "", zaman: nowIso() },
  ];
  const opsDovizKurlari: any[] = [
    { id: 1, para_birimi: "USD", saglayici_id: 1, saglayici_kod: "TCMB", kur_tipi: "SATIS", kur: "38.2000", kaynak: "CANLI", manuel_neden: "", zaman: nowIso() },
    { id: 2, para_birimi: "EUR", saglayici_id: 1, saglayici_kod: "TCMB", kur_tipi: "SATIS", kur: "41.4500", kaynak: "CANLI", manuel_neden: "", zaman: nowIso() },
  ];
  const marjPolitikasi = {
    alis_marj: "0.50",
    satis_marj: "1.25",
    marj_modu: "YUZDE",
    guncelleme_tarihi: nowIso(),
  };
  const opsCariList: any[] = [
    {
      id: 1,
      firma_id: 2,
      firma_ad: "Anadolu Kuyumculuk Ltd.",
      karsi_firma_id: 1,
      karsi_firma_ad: "TaraGold Platform A.Ş.",
      para_birimi: "TRY",
      bakiye: "53100.00",
      kredi_limiti: "1000000.00",
      guncelleme_tarihi: nowIso(),
    },
    {
      id: 2,
      firma_id: 1,
      firma_ad: "TaraGold Platform A.Ş.",
      karsi_firma_id: 2,
      karsi_firma_ad: "Anadolu Kuyumculuk Ltd.",
      para_birimi: "USD",
      bakiye: "12500.00",
      kredi_limiti: "250000.00",
      guncelleme_tarihi: nowIso(),
    },
  ];

  const orgUnits: any[] = [
    { id: 1, ad: "Merkez Satınalma", kod: "SAT-01", aktif: true },
    { id: 2, ad: "Kuyumcukent Şube", kod: "SUB-02", aktif: true },
  ];

  const approvals: any[] = [
    {
      id: 801,
      durum: "BEKLEMEDE",
      tutar: "49250.00",
      para_birimi: "TRY",
      gerekce: "Sipariş #202 limit onayı",
      olusturma_tarihi: new Date(Date.now() - 3_500_000).toISOString(),
      allowed_actions: ["approve", "reject"],
    },
  ];

  const invites: any[] = [
    {
      id: 1,
      email: "satin-alma@taragold.local",
      rol: "ALICI_SATINALMA",
      durum: "BEKLEMEDE",
    },
  ];

  const opsFirmalar: any[] = [
    {
      id: 1,
      ad: "TaraGold Platform A.Ş.",
      firma_kodu: "TG-PLAT",
      durum: "AKTIF",
      alici_mi: true,
      tedarikci_mi: true,
      onay_durumu: "ONAYLANDI",
      aktif: true,
      unvan: "TaraGold Platform Kıymetli Madenler A.Ş.",
      vergi_no: "8150042190",
      vergi_dairesi: "Beyazıt",
      telefon: "+90 212 555 0100",
      eposta: "ops@taragold.local",
      vade_gun: 0,
      tipler: ["PLATFORM", "ALICI", "TEDARIKCI"],
    },
    {
      id: 2,
      ad: "Anadolu Kuyumculuk Ltd.",
      firma_kodu: "ANADOLU-01",
      durum: "AKTIF",
      alici_mi: true,
      tedarikci_mi: true,
      onay_durumu: "ONAYLANDI",
      aktif: true,
      unvan: "Anadolu Kuyumculuk San. ve Tic. Ltd. Şti.",
      vergi_no: "0680112233",
      vergi_dairesi: "Çankaya",
      telefon: "+90 312 444 0200",
      eposta: "finans@anadolukuyum.local",
      vade_gun: 15,
      tipler: ["ALICI", "TEDARIKCI"],
    },
  ];

  const firmaKontaklar = new Map<number, any[]>([
    [
      1,
      [
        {
          id: 1,
          ad_soyad: "Ahmet Yılmaz",
          departman: "Operasyon",
          gorev: "Platform Müdürü",
          telefon: "+90 532 100 2030",
          eposta: "ahmet@taragold.local",
          birincil: true,
        },
      ],
    ],
    [
      2,
      [
        {
          id: 2,
          ad_soyad: "Mehmet Demir",
          departman: "Satınalma",
          gorev: "Mağaza Yetkilisi",
          telefon: "+90 533 200 4050",
          eposta: "mehmet@anadolukuyum.local",
          birincil: true,
        },
      ],
    ],
  ]);
  const firmaAdresler = new Map<number, any[]>([
    [
      1,
      [
        {
          id: 1,
          tip: "MERKEZ",
          il: "İstanbul",
          ilce: "Fatih",
          adres: "Kapalıçarşı Kalpakçılar Cad. No: 42",
          varsayilan: true,
        },
      ],
    ],
    [2, []],
  ]);
  const firmaBanka = new Map<number, any[]>([
    [
      1,
      [
        {
          id: 1,
          banka_adi: "Ziraat Bankası",
          iban: "TR100001000000000000000001",
          swift_bic: "TCZBTR2A",
          para_birimi: "TRY",
          aktif: true,
        },
      ],
    ],
    [2, []],
  ]);
  const firmaBelgeler = new Map<number, any[]>([
    [
      1,
      [
        {
          id: 1,
          tip: "VERGI_LEVHASI",
          baslik: "2026 Vergi Levhası",
          storage_key: "docs/tg-plat-vergi-2026.pdf",
          content_type: "application/pdf",
          byte_size: 245120,
        },
      ],
    ],
    [2, []],
  ]);

  const kanalIzinleri: any[] = [
    {
      id: 1,
      tedarikci_firma_id: 2,
      satis_kanali_id: 1,
      durum: "BEKLEMEDE",
      talep_tarihi: new Date(Date.now() - 86_400_000).toISOString(),
      karar_tarihi: null,
    },
    {
      id: 2,
      tedarikci_firma_id: 1,
      satis_kanali_id: 2,
      durum: "ONAYLI",
      talep_tarihi: new Date(Date.now() - 172_800_000).toISOString(),
      karar_tarihi: new Date(Date.now() - 170_000_000).toISOString(),
    },
  ];

  const firmaUsers: any[] = [
    {
      id: 1,
      kullanici_id: 1,
      firma_id: 1,
      username: "admin",
      rol: "PLATFORM_YONETICI",
      aktif: true,
    },
    {
      id: 2,
      kullanici_id: 2,
      firma_id: 2,
      username: "anadolu_alici",
      rol: "ALICI_SATINALMA",
      aktif: true,
    },
    {
      id: 3,
      kullanici_id: 3,
      firma_id: 1,
      username: "tedarikci_demo",
      rol: "TEDARIKCI_YETKILI",
      aktif: true,
    },
  ];

  const paymentIntents: any[] = [
    {
      id: 1,
      order_id: 201,
      alici_firma_id: 1,
      durum: "TAHSIL_EDILDI",
      tutar: "196900.00",
      para_birimi: "TRY",
      olusturma_tarihi: new Date(Date.now() - 43_200_000).toISOString(),
    },
  ];

  const salesChannels = [
    { id: 1, kod: "KUYUMCU_PORTAL", ad: "Kuyumcu Portal", quote_ttl_saniye: 180, aktif: true },
    { id: 2, kod: "B2B_API", ad: "B2B Kurumsal API Kanalı", quote_ttl_saniye: 60, aktif: true },
    { id: 3, kod: "B2C", ad: "B2C Dağıtım Kanalı", quote_ttl_saniye: 90, aktif: true },
  ];

  const fiyatGruplari = [
    { id: 1, kod: "VIP_KUYUMCU", ad: "VIP Kuyumcu" },
    { id: 2, kod: "B2B_API_STD", ad: "B2B API Standart" },
  ];

  const aliciKanalErisimleri: any[] = [
    {
      id: 1,
      firma_id: 2,
      firma_ad: "Anadolu Kuyumculuk Ltd.",
      satis_kanali_id: 1,
      satis_kanali_kod: "KUYUMCU_PORTAL",
      satis_kanali_ad: "Kuyumcu Portal",
      fiyat_grubu_id: 1,
      fiyat_grubu_ad: "VIP Kuyumcu",
      fiyat_grubu_kod: "VIP_KUYUMCU",
      aktif: true,
    },
  ];

  const hakEdisler: any[] = [
    {
      id: 901,
      order_id: 201,
      quality_inspection_id: 701,
      tedarikci_firma_id: 2,
      tedarikci_firma_ad: "Anadolu Kuyumculuk Ltd.",
      durum: "ODENEBILIR",
      gram: "60.000",
      tutar: "182000.00",
      para_birimi: "TRY",
      vade_tarihi: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      hak_edis_tarihi: nowIso(),
      odeme_tarihi: null,
      odeme_ledger_entry_id: null,
      aciklama: "Sipariş #201 hazırlık hak edişi",
      olusturma_tarihi: new Date(Date.now() - 36_000_000).toISOString(),
    },
  ];

  const belgeAyarlari = {
    proforma_disclaimer: "Resmi fatura yerine geçmez.",
    irsaliye_baslik: "İrsaliye",
    irsaliye_alt_metin: "Sevk irsaliyesidir; resmi fatura sistem dışında düzenlenir.",
    guncelleme_tarihi: nowIso(),
  };

  const belgeler: any[] = [
    {
      id: 1,
      firma_id: 2,
      tip: "PROFORMA",
      baslik: "Proforma #201 Rev.1",
      content_type: "application/pdf",
      byte_size: 4096,
      order_id: 201,
      revizyon: 1,
      belge_turu: "PROFORMA",
      olusturma_tarihi: new Date(Date.now() - 40_000_000).toISOString(),
    },
    {
      id: 2,
      firma_id: 2,
      tip: "IRSALIYE",
      baslik: "İrsaliye #201 Rev.1",
      content_type: "application/pdf",
      byte_size: 3840,
      order_id: 201,
      revizyon: 1,
      belge_turu: "IRSALIYE",
      olusturma_tarihi: new Date(Date.now() - 20_000_000).toISOString(),
    },
  ];

  let activeUyelikFirmaId = 1;
  const userUyelikler = [
    {
      id: 1,
      kullanici_id: 1,
      firma_id: 1,
      firma_ad: "TaraGold Platform A.Ş.",
      firma_kodu: "TG-PLAT",
      username: "demo",
      rol: "PLATFORM_YONETICI",
      aktif: true,
      birincil: true,
    },
    {
      id: 2,
      kullanici_id: 1,
      firma_id: 2,
      firma_ad: "Anadolu Kuyumculuk Ltd.",
      firma_kodu: "ANADOLU-01",
      username: "demo",
      rol: "ALICI_YETKILI",
      aktif: true,
      birincil: false,
    },
  ];

  const apiKeys = new Map<number, any[]>([
    [
      1,
      [
        {
          id: 5001,
          ad: "Varsayılan Feed Anahtarı",
          key_prefix: "tg_demo",
          scopes: ["feed:read"],
          iptal: false,
          satis_kanali_id: 2,
          rate_limit_per_min: 120,
          olusturma: new Date(Date.now() - 86_400_000).toISOString(),
          api_key: "tg_demo_feed_key_2026",
        },
      ],
    ],
  ]);

  let actAsState: {
    active: boolean;
    target_id?: number;
    target_username?: string;
    actor_username?: string;
  } = { active: false };

  const defaultQuote = (id: number, varyantId = 1001, paraBirimi = "TRY") => ({
    id,
    varyant_id: varyantId,
    varyant_sku: "TG-BLZ-22-001-62",
    urun: "22 Ayar Adana Burma Bilezik",
    durum: "AKTIF",
    gram: "30.000",
    gram_basi_vergisiz: "3281.67",
    toplam_vergisiz: "98450.00",
    has_gram: "27.480",
    para_birimi: paraBirimi,
    expires_at: new Date(Date.now() + 180_000).toISOString(),
    allowed_actions: ["lock", "add_to_cart"],
    net_ozet: {
      toplam_vergisiz: "98450.00",
      gram: "30.000",
      gram_basi_vergisiz: "3281.67",
      has_gram: "27.480",
    },
  });
  quotes.set(501, defaultQuote(501));

  function buildMe(username: string) {
    const uy =
      userUyelikler.find((u) => u.firma_id === activeUyelikFirmaId) ||
      userUyelikler[0];
    const activeFirma =
      opsFirmalar.find((f) => f.id === uy.firma_id) || firma;
    const isPlat = uy.firma_id === 1;
    return {
      id: 1,
      username: actAsState.active && actAsState.target_username ? actAsState.target_username : username,
      rol: uy.rol,
      email_verified: true,
      firma_id: activeFirma.id,
      firma: {
        id: activeFirma.id,
        ad: activeFirma.ad,
        aktif: activeFirma.aktif,
        alici_mi: activeFirma.alici_mi,
        platform_mu: isPlat,
        tedarikci_mi: activeFirma.tedarikci_mi,
      },
      capabilities: isPlat
        ? capabilities
        : {
            ...capabilities,
            can_act_as: false,
            can_approve: false,
            can_view_ops: false,
            can_view_ops_finance: false,
            can_manage_qc: false,
          },
      act_as: actAsState.active ? actAsState : { active: false },
    };
  }

  return async function handleApi(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const rawUrl = req.url || "/";
    if (!rawUrl.startsWith("/api/v1/")) return false;

    const url = new URL(rawUrl, "http://localhost:3000");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = (req.method || "GET").toUpperCase();
    const cookies = parseCookies(req);

    // Health & CSRF (public)
    if (path === "/health/" && method === "GET") {
      sendJson(res, 200, { status: "ok", api: "v1", service: "taragold-mock" });
      return true;
    }
    if (path === "/ready/" && method === "GET") {
      sendJson(res, 200, {
        status: "ready",
        service: "taragold",
        api: "v1",
        checks: { database: "ok" },
      });
      return true;
    }
    if (path === "/auth/csrf/" && method === "GET") {
      const token = cookies.csrftoken || crypto.randomBytes(16).toString("hex");
      sendJson(
        res,
        200,
        { csrf_token: token },
        [`csrftoken=${token}; Path=/; SameSite=Lax`]
      );
      return true;
    }

    if (path === "/auth/login/" && method === "POST") {
      const body = await readJsonBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      if (!username || !password) {
        sendJson(res, 400, {
          status: 400,
          title: "Doğrulama Hatası",
          detail: "Kullanıcı adı ve parola zorunludur.",
        });
        return true;
      }
      const sid = crypto.randomBytes(16).toString("hex");
      sessions.set(sid, username);
      profile.username = username;
      activeUyelikFirmaId = 1;
      actAsState = { active: false };
      sendJson(res, 200, buildMe(username), [
        `tg_session=${sid}; Path=/; HttpOnly; SameSite=Lax`,
      ]);
      return true;
    }

    if (path === "/auth/logout/" && method === "POST") {
      if (cookies.tg_session) sessions.delete(cookies.tg_session);
      actAsState = { active: false };
      sendJson(res, 200, { ok: true }, [
        "tg_session=; Path=/; Max-Age=0; SameSite=Lax",
      ]);
      return true;
    }

    if (path === "/auth/password-reset/" && method === "POST") {
      const body = await readJsonBody(req);
      if (!String(body.email || "").trim()) {
        sendJson(res, 400, { status: 400, title: "E-posta zorunlu", detail: "E-posta adresi zorunludur." });
        return true;
      }
      sendJson(res, 200, {
        detail: "Eğer e-posta kayıtlıysa parola sıfırlama bağlantısı gönderildi.",
      });
      return true;
    }

    if (path === "/auth/password-reset/confirm/" && method === "POST") {
      const body = await readJsonBody(req);
      if (!body.uid || !body.token || !body.new_password || body.new_password !== body.new_password_confirm) {
        sendJson(res, 400, {
          status: 400,
          title: "Doğrulama Hatası",
          detail: "UID, token ve eşleşen yeni parolalar zorunludur.",
        });
        return true;
      }
      sendJson(res, 200, { detail: "Parolanız başarıyla sıfırlandı." });
      return true;
    }

    if (path === "/auth/invites/accept/" && method === "POST") {
      const body = await readJsonBody(req);
      const uname = String(body.username || "").trim();
      if (!body.token || !uname || !body.password || body.password !== body.password_confirm) {
        sendJson(res, 400, {
          status: 400,
          title: "Davet Doğrulama Hatası",
          detail: "Davet token, kullanıcı adı ve eşleşen parolalar zorunludur.",
        });
        return true;
      }
      const newUid = genId();
      firmaUsers.push({
        id: newUid,
        kullanici_id: newUid,
        firma_id: 1,
        username: uname,
        rol: "ALICI_SATINALMA",
        aktif: true,
      });
      if (invites[0]) invites[0].durum = "KABUL_EDILDI";
      sendJson(res, 200, { detail: "Davet kabul edildi ve hesap oluşturuldu.", username: uname });
      return true;
    }

    // Feed endpoints (authenticated via X-Api-Key header)
    if (path.startsWith("/feed/") && method === "GET") {
      const apiKeyHeader = String(req.headers["x-api-key"] || "").trim();
      const allKeys = Array.from(apiKeys.values()).flat();
      const validKey = allKeys.find((k) => !k.iptal && k.api_key === apiKeyHeader);
      if (!apiKeyHeader || !validKey) {
        sendJson(res, 401, {
          status: 401,
          title: "Geçersiz API Anahtarı",
          detail: "Geçerli ve aktif bir X-Api-Key başlığı gereklidir.",
        });
        return true;
      }
      const isXml = (url.searchParams.get("format") || "json").toLowerCase() === "xml";
      if (path === "/feed/urunler/") {
        if (isXml) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(
            `<?xml version="1.0" encoding="utf-8"?><urunler>${catalogProducts
              .map((p) => `<urun id="${p.id}" kod="${p.platform_kodu}"><ad>${p.ad}</ad></urun>`)
              .join("")}</urunler>`
          );
          return true;
        }
        sendJson(res, 200, { count: catalogProducts.length, results: catalogProducts });
        return true;
      }
      const feedUrunMatch = /^\/feed\/urunler\/(\d+)\/$/.exec(path);
      if (feedUrunMatch) {
        const p = catalogProducts.find((x) => x.id === Number(feedUrunMatch[1]));
        if (!p) {
          sendJson(res, 404, { status: 404, title: "Ürün bulunamadı" });
          return true;
        }
        if (isXml) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(`<?xml version="1.0" encoding="utf-8"?><urun id="${p.id}" kod="${p.platform_kodu}"><ad>${p.ad}</ad></urun>`);
          return true;
        }
        sendJson(res, 200, p);
        return true;
      }
      if (path === "/feed/stok-fiyat/") {
        const items = catalogProducts.flatMap((p) =>
          p.varyantlar.map((v) => ({
            urun_id: p.id,
            varyant_id: v.id,
            sku: v.sku,
            fiyat_vergisiz: "98450.00",
            para_birimi: "TRY",
            stok_musait: "23.000",
          }))
        );
        if (isXml) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(
            `<?xml version="1.0" encoding="utf-8"?><stokFiyat>${items
              .map((i) => `<kalem varyant_id="${i.varyant_id}" sku="${i.sku}" fiyat="${i.fiyat_vergisiz}" />`)
              .join("")}</stokFiyat>`
          );
          return true;
        }
        sendJson(res, 200, { count: items.length, results: items });
        return true;
      }
      if (path === "/feed/schema.xsd") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.end(
          `<?xml version="1.0" encoding="utf-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  <xs:element name="urunler">\n    <xs:complexType><xs:sequence><xs:element name="urun" maxOccurs="unbounded" /></xs:sequence></xs:complexType>\n  </xs:element>\n</xs:schema>`
        );
        return true;
      }
    }

    if (path === "/auth/mfa/verify/" && method === "POST") {
      const username = (cookies.tg_session && sessions.get(cookies.tg_session)) || "demo";
      sendJson(res, 200, buildMe(username));
      return true;
    }

    if (path === "/auth/mfa/resend/" && method === "POST") {
      sendJson(res, 200, { detail: "Kod gönderildi.", mfa_ok: false });
      return true;
    }

    // Auth check for remaining endpoints
    const username = cookies.tg_session ? sessions.get(cookies.tg_session) : undefined;
    if (!username) {
      sendJson(res, 401, {
        status: 401,
        title: "Yetkisiz",
        detail: "Oturum bulunamadı. Lütfen giriş yapın.",
        code: "not_authenticated",
      });
      return true;
    }

    if (path === "/act-as/start/" && method === "POST") {
      const body = await readJsonBody(req);
      const targetId = Number(body.user_id || 0);
      if (!targetId) {
        sendJson(res, 400, { status: 400, title: "Geçersiz kullanıcı", detail: "user_id zorunludur." });
        return true;
      }
      const targetUser = firmaUsers.find((u) => u.kullanici_id === targetId || u.id === targetId);
      const targetUsername = targetUser ? targetUser.username : `kullanici_${targetId}`;
      actAsState = {
        active: true,
        target_id: targetId,
        target_username: targetUsername,
        actor_username: username,
      };
      sendJson(res, 200, {
        act_as: true,
        target_id: targetId,
        target_username: targetUsername,
        redirect_url: "/",
      });
      return true;
    }

    if (path === "/act-as/stop/" && method === "POST") {
      actAsState = { active: false };
      sendJson(res, 200, { act_as: false, actor_id: 1, redirect_url: "/" });
      return true;
    }

    if (path === "/auth/email-verify/confirm/" && method === "POST") {
      profile.email_verified = true;
      sendJson(res, 200, {
        detail: "E-posta doğrulandı.",
        username,
        email_verified: true,
      });
      return true;
    }

    // /me & profile
    if (path === "/me/" && method === "GET") {
      sendJson(res, 200, buildMe(username));
      return true;
    }
    if (path === "/me/uyelikler/" && method === "GET") {
      sendJson(res, 200, {
        results: userUyelikler.map((u) => ({ ...u, username })),
      });
      return true;
    }
    if (path === "/me/switch-firma/" && method === "POST") {
      const body = await readJsonBody(req);
      const fid = Number(body.firma_id);
      const target = userUyelikler.find((u) => u.firma_id === fid && u.aktif);
      if (!target) {
        sendJson(res, 400, {
          status: 400,
          title: "Üyelik bulunamadı",
          detail: "Bu firmada aktif üyeliğiniz bulunmamaktadır.",
        });
        return true;
      }
      activeUyelikFirmaId = fid;
      sendJson(res, 200, {
        uyelik: { ...target, username },
        me: buildMe(username),
      });
      return true;
    }
    if (path === "/me/dashboard/" && method === "GET") {
      sendJson(res, 200, {
        username,
        firma_id: 1,
        firma_ad: firma.ad,
        firma_kodu: "TG-PLAT",
        rol: "PLATFORM_YONETICI",
        cart_id: cart.id,
        cart_line_count: cart.lines.length,
        order_count: orders.length,
        rfq_count: rfqs.length,
        rfq_ozel_count: 0,
      });
      return true;
    }
    if (path === "/me/profile/") {
      if (method === "GET") {
        sendJson(res, 200, { ...profile, username });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        if (typeof body.first_name === "string") profile.first_name = body.first_name;
        if (typeof body.last_name === "string") profile.last_name = body.last_name;
        sendJson(res, 200, { ...profile, username });
        return true;
      }
    }
    if (path === "/me/addresses/") {
      if (method === "GET") {
        sendJson(res, 200, paginate(addresses, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const item = { id: genId(), aktif: true, varsayilan: false, ...body };
        addresses.push(item as any);
        sendJson(res, 201, item);
        return true;
      }
    }
    const addrMatch = /^\/me\/addresses\/(\d+)\/$/.exec(path);
    if (addrMatch) {
      const id = Number(addrMatch[1]);
      const idx = addresses.findIndex((a) => a.id === id);
      if (idx === -1) {
        sendJson(res, 404, { status: 404, title: "Bulunamadı" });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(addresses[idx], body);
        sendJson(res, 200, addresses[idx]);
        return true;
      }
      if (method === "DELETE") {
        addresses.splice(idx, 1);
        sendJson(res, 204, null);
        return true;
      }
    }
    if (path === "/auth/password-change/" && method === "POST") {
      sendJson(res, 200, { detail: "Parola güncellendi." });
      return true;
    }
    if (path === "/auth/email-verify/" && method === "POST") {
      sendJson(res, 200, { detail: "Doğrulama e-postası gönderildi." });
      return true;
    }

    // Piyasa Pano (GAP-F3-01)
    if (path === "/piyasa/pano/" && method === "GET") {
      const rawOlcek = (url.searchParams.get("olcek") || "").trim().toUpperCase();
      const allowedOlcek = new Set(["ONS", "KG", "GRAM"]);
      if (rawOlcek && !allowedOlcek.has(rawOlcek)) {
        sendJson(res, 400, {
          type: "about:blank",
          title: "Doğrulama Hatası",
          status: 400,
          detail: `Geçersiz olcek: '${rawOlcek}' (ONS|KG|GRAM).`,
          errors: { olcek: [`Geçersiz olcek: '${rawOlcek}' (ONS|KG|GRAM).`] },
        });
        return true;
      }

      const now = nowIso();
      const allRows = [
        {
          kod: "HAS_TRY",
          ad: "Has Altın (Gram TRY)",
          fiyat: "3185.40",
          para_birimi: "TRY",
          olcek: "GRAM",
          kaynak: "CANLI",
          guncelleme: now,
          banner: null,
        },
        {
          kod: "HAS_USD",
          ad: "Has Altın (Gram USD)",
          fiyat: "89.20",
          para_birimi: "USD",
          olcek: "GRAM",
          kaynak: "CANLI",
          guncelleme: now,
          banner: null,
        },
        {
          kod: "HAS_KG_TRY",
          ad: "Has Altın (KG TRY)",
          fiyat: "3185400.00",
          para_birimi: "TRY",
          olcek: "KG",
          kaynak: "CANLI",
          guncelleme: now,
          banner: null,
        },
        {
          kod: "HAS_KG_USD",
          ad: "Has Altın (KG USD)",
          fiyat: "89200.00",
          para_birimi: "USD",
          olcek: "KG",
          kaynak: "CANLI",
          guncelleme: now,
          banner: null,
        },
        {
          kod: "HAS_ONS_USD",
          ad: "Has Altın (ONS USD)",
          fiyat: "2774.43",
          para_birimi: "USD",
          olcek: "ONS",
          kaynak: "CANLI",
          guncelleme: now,
          banner: null,
        },
        {
          kod: "HAS_ONS_TRY",
          ad: "Has Altın (ONS TRY)",
          fiyat: "99077.09",
          para_birimi: "TRY",
          olcek: "ONS",
          kaynak: "LKG",
          guncelleme: now,
          banner: "Son bilinen geçerli kur (LKG) aktif.",
        },
      ];

      const satirlar = rawOlcek
        ? allRows.filter((r) => r.olcek === rawOlcek)
        : allRows;

      sendJson(res, 200, {
        server_now: now,
        olcek: rawOlcek || null,
        satirlar,
      });
      return true;
    }

    // Catalog, Categories, Definitions & Ops Products
    if (path === "/catalog/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const filtered = q
        ? catalogProducts.filter((p) => `${p.ad} ${p.platform_kodu} ${p.kategori}`.toLowerCase().includes(q))
        : catalogProducts;
      sendJson(res, 200, paginate(filtered, url));
      return true;
    }
    if (path === "/catalog/monturler/" && method === "GET") {
      sendJson(res, 200, paginate(catalogProducts.filter((p) => p.kategori === "Yüzük"), url));
      return true;
    }
    if (path === "/catalog/taslar/" && method === "GET") {
      sendJson(res, 200, {
        count: 1,
        results: [{ id: 1, kod: "PRL", ad: "Pırlanta", degerli: true, sira: 1 }],
        referanslar: { kesimler: [], berrakliklar: [], renk_dereceleri: [], kesim_kaliteleri: [], sertifika_kurumlari: [], menseiler: [] },
      });
      return true;
    }
    const catDetailMatch = /^\/catalog\/(\d+)\/$/.exec(path);
    if (catDetailMatch && method === "GET") {
      const item = catalogProducts.find((p) => p.id === Number(catDetailMatch[1]));
      if (!item) {
        sendJson(res, 404, { status: 404, title: "Ürün bulunamadı" });
        return true;
      }
      sendJson(res, 200, item);
      return true;
    }
    if (path === "/categories/" && method === "GET") {
      const activeOnly = categoriesSeed.filter((c) => c.aktif);
      sendJson(res, 200, paginate(activeOnly, url));
      return true;
    }
    if (path === "/ops/categories/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const filtered = q
          ? categoriesSeed.filter((c) => `${c.ad} ${c.kod}`.toLowerCase().includes(q))
          : categoriesSeed;
        sendJson(res, 200, paginate(filtered, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const c = {
          id: genId(),
          kod: String(body.kod || "KAT").toUpperCase(),
          ad: String(body.ad || "Yeni Kategori"),
          slug: String(body.ad || "yeni").toLowerCase().replace(/\s+/g, "-"),
          tam_ad: String(body.ad || "Yeni Kategori"),
          ust_id: body.ust_id ?? null,
          fiyat_grubu_id: body.fiyat_grubu_id ?? null,
          sira: Number(body.sira ?? 0),
          aktif: body.aktif !== false,
          dahili: Boolean(body.dahili),
          one_cikan: Boolean(body.one_cikan),
          urun_sayisi: 0,
        };
        categoriesSeed.push(c);
        sendJson(res, 201, c);
        return true;
      }
    }
    const opsCatDetailMatch = /^\/ops\/categories\/(\d+)\/$/.exec(path);
    if (opsCatDetailMatch) {
      const idx = categoriesSeed.findIndex((c) => c.id === Number(opsCatDetailMatch[1]));
      if (idx === -1) {
        sendJson(res, 404, { status: 404, title: "Kategori bulunamadı" });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(categoriesSeed[idx], body);
        sendJson(res, 200, categoriesSeed[idx]);
        return true;
      }
      if (method === "DELETE") {
        const [removed] = categoriesSeed.splice(idx, 1);
        sendJson(res, 200, { deleted: true, id: removed.id });
        return true;
      }
    }
    if (path === "/ops/catalog-refs/") {
      if (method === "GET") {
        sendJson(res, 200, {
          renkler: opsRenkler,
          olculer: opsOlculer,
          ayarlar: opsAyarlar,
          birimler: [
            { kod: "ADET", ad: "Adet" },
            { kod: "GRAM", ad: "Gram" },
          ],
          olcu_tipleri: [
            { kod: "STANDART", ad: "Standart" },
            { kod: "YUZUK_NO", ad: "Yüzük Numarası" },
            { kod: "BILEZIK_CAP", ad: "Bilezik Çapı" },
          ],
          fiyat_tipleri: [
            { kod: "GRAM_HAS_ISCILIK", ad: "Has + İşçilik" },
            { kod: "SABIT_FIYAT", ad: "Sabit Fiyat" },
          ],
          temin_tipleri: [
            { kod: "STOKTAN", ad: "Stoktan Teslim" },
            { kod: "SIPARIS_UZERINE", ad: "Sipariş Üzerine" },
          ],
          server_now: nowIso(),
        });
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const item = { id: genId(), ...body };
        if (body.tip === "renk") opsRenkler.push(item as any);
        else if (body.tip === "olcu") opsOlculer.push(item as any);
        sendJson(res, 201, item);
        return true;
      }
    }
    if (path === "/ops/piyasa/marj-politikasi/") {
      if (method === "GET") {
        sendJson(res, 200, marjPolitikasi);
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(marjPolitikasi, body, { guncelleme_tarihi: nowIso() });
        sendJson(res, 200, marjPolitikasi);
        return true;
      }
    }
    const opsDefMatch = /^\/ops\/definitions\/([^/]+)\/(?:([^/]+)\/)?$/.exec(path);
    if (opsDefMatch) {
      const kaynak = opsDefMatch[1];
      const itemId = opsDefMatch[2];
      const store: any[] =
        kaynak === "satis-kanallari"
          ? salesChannels
          : kaynak === "fiyat-gruplari"
            ? fiyatGruplari
            : kaynak === "ayar-milyem"
              ? opsAyarlar
              : kaynak === "metal-kurlari"
                ? opsMetalKurlari
                : kaynak === "doviz-kurlari"
                  ? opsDovizKurlari
                  : [
                      { id: "ADET", kod: "ADET", ad: "Adet" },
                      { id: "GRAM", kod: "GRAM", ad: "Gram" },
                    ];
      if (!itemId && method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const filtered = q
          ? store.filter((x) => JSON.stringify(x).toLowerCase().includes(q))
          : store;
        sendJson(res, 200, {
          kaynak,
          ...paginate(filtered, url),
          server_now: nowIso(),
          refs: {
            metaller: [{ id: 1, kod: "XAU", ad: "Altın", gram_bazli: true }],
            saglayicilar: [{ id: 1, kod: "NADIR", ad: "Nadir", aktif: true }],
            kur_tipleri: ["ALIS", "SATIS"],
            fiyat_kaynaklari: ["HAS_ALTIN", "SABIT"],
            para_birimleri: ["TRY", "USD", "EUR"],
          },
        });
        return true;
      }
      if (!itemId && method === "POST") {
        const body = await readJsonBody(req);
        const created = { id: genId(), aktif: true, sira: 0, ...body };
        store.push(created);
        sendJson(res, 201, created);
        return true;
      }
      if (itemId) {
        const idx = store.findIndex((x) => String(x.id) === String(itemId));
        if (idx === -1) {
          sendJson(res, 404, { status: 404, title: "Tanım bulunamadı" });
          return true;
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          Object.assign(store[idx], body);
          sendJson(res, 200, store[idx]);
          return true;
        }
        if (method === "DELETE") {
          const [removed] = store.splice(idx, 1);
          sendJson(res, 200, { deleted: true, id: removed.id, kaynak });
          return true;
        }
      }
    }
    if (path === "/ops/products/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const filtered = q
          ? catalogProducts.filter((p) => `${p.ad} ${p.platform_kodu} ${p.kategori}`.toLowerCase().includes(q))
          : catalogProducts;
        sendJson(res, 200, paginate(filtered, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const id = genId();
        const cat = categoriesSeed.find((c) => c.id === Number(body.kategori_id));
        const item = {
          id,
          ad: String(body.ad || "Yeni Ürün"),
          platform_kodu: `TG-NEW-${id}`,
          kategori: cat?.ad || "Genel",
          kategori_id: Number(body.kategori_id || 1),
          ayar: "14K",
          ayar_id: Number(body.ayar_id || 2),
          aciklama: String(body.aciklama || ""),
          fiyat_tipi: String(body.fiyat_tipi || "GRAM_HAS_ISCILIK"),
          onay_durumu: "TASLAK",
          yayin_durumu: "taslak",
          olusturan_firma_id: 1,
          varyant_count: 0,
          allowed_actions: ["submit", "add_variant"],
          varyantlar: [],
        };
        catalogProducts.unshift(item);
        sendJson(res, 201, item);
        return true;
      }
    }
    const opsVariantMatch = /^\/ops\/products\/(\d+)\/variants\/(\d+)\/$/.exec(path);
    if (opsVariantMatch) {
      const prod = catalogProducts.find((p) => p.id === Number(opsVariantMatch[1]));
      if (!prod) {
        sendJson(res, 404, { status: 404, title: "Ürün bulunamadı" });
        return true;
      }
      const vIdx = prod.varyantlar.findIndex((v) => v.id === Number(opsVariantMatch[2]));
      if (vIdx === -1) {
        sendJson(res, 404, { status: 404, title: "Varyant bulunamadı" });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(prod.varyantlar[vIdx], body);
        sendJson(res, 200, prod.varyantlar[vIdx]);
        return true;
      }
      if (method === "DELETE") {
        const [rem] = prod.varyantlar.splice(vIdx, 1);
        prod.varyant_count = prod.varyantlar.length;
        sendJson(res, 200, { deleted: true, id: rem.id });
        return true;
      }
    }
    const opsProdMatch = /^\/ops\/products\/(\d+)\/(?:(variants|channels|submit|approve|reject|publish|unpublish)\/)?$/.exec(path);
    if (opsProdMatch) {
      const prodIdx = catalogProducts.findIndex((p) => p.id === Number(opsProdMatch[1]));
      if (prodIdx === -1) {
        sendJson(res, 404, { status: 404, title: "Bulunamadı" });
        return true;
      }
      const prod = catalogProducts[prodIdx];
      const action = opsProdMatch[2];
      if (!action && method === "GET") {
        sendJson(res, 200, prod);
        return true;
      }
      if (!action && method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(prod, body);
        sendJson(res, 200, prod);
        return true;
      }
      if (!action && method === "DELETE") {
        catalogProducts.splice(prodIdx, 1);
        sendJson(res, 200, { deleted: true, id: prod.id });
        return true;
      }
      if (action === "channels") {
        if (method === "GET") {
          sendJson(res, 200, {
            urun_id: prod.id,
            results: salesChannels.map((ch) => ({
              kanal_id: ch.id,
              kod: ch.kod,
              ad: ch.ad,
              atanmis: true,
              aktif: ch.aktif,
            })),
          });
          return true;
        }
        if (method === "POST") {
          sendJson(res, 200, { ok: true });
          return true;
        }
      }
      if (action === "variants" && method === "POST") {
        const body = await readJsonBody(req);
        const vid = genId();
        const variant = {
          id: vid,
          sku: `${prod.platform_kodu}-${vid}`,
          beden: "Standart",
          renk: "Sarı",
          gram: body.gram ? String(body.gram) : "10.000",
          aktif: true,
        };
        prod.varyantlar.push(variant);
        prod.varyant_count = prod.varyantlar.length;
        sendJson(res, 201, variant);
        return true;
      }
      if (method === "POST") {
        if (action === "submit") prod.onay_durumu = "ONAY_BEKLIYOR";
        if (action === "approve") prod.onay_durumu = "ONAYLANDI";
        if (action === "reject") prod.onay_durumu = "REDDEDILDI";
        if (action === "publish") prod.yayin_durumu = "aktif";
        if (action === "unpublish") prod.yayin_durumu = "pasif";
        sendJson(res, 200, prod);
        return true;
      }
    }

    if (path === "/supplier/variants/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const rows = catalogProducts.flatMap((p) =>
        p.varyantlar.map((v) => ({
          id: v.id,
          sku: v.sku,
          urun_id: p.id,
          urun_ad: p.ad,
          platform_kodu: p.platform_kodu,
          gram: v.gram,
          renk: v.renk,
          beden: v.beden,
        }))
      );
      const filtered = q ? rows.filter((r) => `${r.sku} ${r.urun_ad}`.toLowerCase().includes(q)) : rows;
      sendJson(res, 200, paginate(filtered, url));
      return true;
    }

    // Quotes & Price Locks
    if (path === "/quotes/") {
      if (method === "GET") {
        sendJson(res, 200, paginate(Array.from(quotes.values()), url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const id = genId();
        const q = defaultQuote(id, Number(body.varyant_id || 1001), String(body.para_birimi || "TRY"));
        quotes.set(id, q);
        sendJson(res, 201, q);
        return true;
      }
    }
    const quoteMatch = /^\/quotes\/(\d+)\/$/.exec(path);
    if (quoteMatch && method === "GET") {
      const id = Number(quoteMatch[1]);
      const q = quotes.get(id) || defaultQuote(id);
      sendJson(res, 200, q);
      return true;
    }
    if (path === "/price-locks/" && method === "GET") {
      sendJson(res, 200, paginate(Array.from(priceLocks.values()), url));
      return true;
    }
    if (path === "/price-locks/" && method === "POST") {
      const body = await readJsonBody(req);
      const id = genId();
      const q = quotes.get(Number(body.quote_id)) || defaultQuote(Number(body.quote_id || 501));
      const lock = {
        id,
        quote_id: q.id,
        toplam_vergisiz: q.toplam_vergisiz,
        para_birimi: q.para_birimi,
        durum: "AKTIF",
        expires_at: new Date(Date.now() + 180_000).toISOString(),
        gecerli: true,
      };
      priceLocks.set(id, lock);
      sendJson(res, 201, lock);
      return true;
    }
    const lockMatch = /^\/price-locks\/(\d+)\/$/.exec(path);
    if (lockMatch && method === "GET") {
      const id = Number(lockMatch[1]);
      const l = priceLocks.get(id) || {
        id,
        quote_id: 501,
        toplam_vergisiz: "98450.00",
        para_birimi: "TRY",
        durum: "AKTIF",
        expires_at: new Date(Date.now() + 180_000).toISOString(),
        gecerli: true,
      };
      sendJson(res, 200, l);
      return true;
    }

    // RFQs & Supplier Offers
    if ((path === "/rfqs/" || path === "/supplier/rfqs/") && method === "GET") {
      sendJson(res, 200, paginate(rfqs, url));
      return true;
    }
    if (path === "/rfqs/" && method === "POST") {
      const body = await readJsonBody(req);
      const rfq = {
        id: genId(),
        talep_tipi: body.talep_tipi || "STANDART",
        durum: "TASLAK",
        baslik: body.baslik || "Yeni RFQ Talebi",
        olusturma_tarihi: nowIso(),
        allowed_actions: ["send"],
        lines: body.lines || [],
      };
      rfqs.unshift(rfq);
      sendJson(res, 201, rfq);
      return true;
    }
    const rfqDetailMatch = /^\/(?:supplier\/)?rfqs\/(\d+)\/(?:(send|messages|revisions)\/)?$/.exec(path);
    if (rfqDetailMatch) {
      const rfq = rfqs.find((r) => r.id === Number(rfqDetailMatch[1]));
      if (!rfq) {
        sendJson(res, 404, { status: 404, title: "RFQ bulunamadı" });
        return true;
      }
      const sub = rfqDetailMatch[2];
      if (sub === "send" && method === "POST") {
        rfq.durum = "GONDERILDI";
        sendJson(res, 200, rfq);
        return true;
      }
      if (sub === "messages" && method === "POST") {
        const body = await readJsonBody(req);
        const msg = {
          id: genId(),
          gonderen_rol: path.startsWith("/supplier/") ? "TEDARIKCI" : "ALICI",
          govde: String(body.govde || ""),
          olusturma_tarihi: nowIso(),
        };
        rfq.messages = rfq.messages || [];
        rfq.messages.push(msg);
        sendJson(res, 201, msg);
        return true;
      }
      if (sub === "revisions" && method === "POST") {
        const body = await readJsonBody(req);
        rfq.revizyonlar = rfq.revizyonlar || [];
        const rev = {
          id: genId(),
          versiyon: rfq.revizyonlar.length + 1,
          ozet: String(body.ozet || ""),
          olusturma_tarihi: nowIso(),
        };
        rfq.revizyonlar.push(rev);
        sendJson(res, 201, rev);
        return true;
      }
      sendJson(res, 200, rfq);
      return true;
    }

    const rfqMatchCand = /^\/ops\/rfq-lines\/(\d+)\/match-candidates\/$/.exec(path);
    if (rfqMatchCand && method === "GET") {
      const lineId = Number(rfqMatchCand[1]);
      const candidates = catalogProducts.flatMap((p) =>
        p.varyantlar.map((v) => ({
          varyant_id: v.id,
          sku: v.sku,
          urun_ad: p.ad,
          skor: "0.94",
          neden: `${p.ayar} · ${v.gram}g`,
        }))
      );
      sendJson(res, 200, { rfq_line_id: lineId, results: candidates });
      return true;
    }
    const rfqLineMatchesPath = /^\/ops\/rfq-lines\/(\d+)\/matches\/$/.exec(path);
    if (rfqLineMatchesPath) {
      const lineId = Number(rfqLineMatchesPath[1]);
      if (method === "GET") {
        sendJson(res, 200, {
          rfq_line_id: lineId,
          results: rfqMatches.filter((m) => m.rfq_line_id === lineId),
        });
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const m = {
          id: genId(),
          rfq_line_id: lineId,
          varyant_id: Number(body.varyant_id),
          durum: "ONERILDI",
          skor: body.skor || "0.90",
          kanit: body.kanit || "",
          allowed_actions: ["approve", "reject"],
        };
        rfqMatches.push(m);
        sendJson(res, 201, m);
        return true;
      }
    }
    const rfqMatchAction = /^\/ops\/rfq-matches\/(\d+)\/(approve|reject)\/$/.exec(path);
    if (rfqMatchAction && method === "POST") {
      const m = rfqMatches.find((x) => x.id === Number(rfqMatchAction[1]));
      if (!m) {
        sendJson(res, 404, { status: 404, title: "Eşleşme bulunamadı" });
        return true;
      }
      m.durum = rfqMatchAction[2] === "approve" ? "ONAYLANDI" : "REDDEDILDI";
      m.allowed_actions = [];
      sendJson(res, 200, m);
      return true;
    }

    if (path === "/supplier/offers/") {
      if (method === "GET") {
        sendJson(res, 200, paginate(supplierOffers, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const offer = {
          id: genId(),
          durum: "TASLAK",
          para_birimi: "TRY",
          versiyon: 1,
          allowed_actions: ["submit", "new_version"],
          ...body,
        };
        supplierOffers.unshift(offer);
        sendJson(res, 201, offer);
        return true;
      }
    }
    const offerDetailMatch = /^\/supplier\/offers\/(\d+)\/$/.exec(path);
    if (offerDetailMatch && method === "GET") {
      const offer = supplierOffers.find((o) => o.id === Number(offerDetailMatch[1]));
      if (!offer) {
        sendJson(res, 404, { status: 404, title: "Teklif bulunamadı" });
        return true;
      }
      sendJson(res, 200, offer);
      return true;
    }
    const offerActionMatch = /^\/supplier\/offers\/(\d+)\/(submit|deactivate|versions)\/$/.exec(path);
    if (offerActionMatch && method === "POST") {
      const offer = supplierOffers.find((o) => o.id === Number(offerActionMatch[1]));
      if (!offer) {
        sendJson(res, 404, { status: 404, title: "Teklif bulunamadı" });
        return true;
      }
      const act = offerActionMatch[2];
      if (act === "versions") {
        const body = await readJsonBody(req);
        const newVer = {
          ...offer,
          id: genId(),
          versiyon: (offer.versiyon || 1) + 1,
          ...(body.gram ? { gram: String(body.gram) } : {}),
          ...(body.birim_fiyat ? { birim_fiyat: String(body.birim_fiyat) } : {}),
          ...(body.fiyat_modeli ? { fiyat_modeli: String(body.fiyat_modeli) } : {}),
          durum: "TASLAK",
          allowed_actions: ["submit", "new_version"],
        };
        supplierOffers.unshift(newVer);
        sendJson(res, 201, newVer);
        return true;
      }
      offer.durum = act === "submit" ? "YAYINDA" : "PASIF";
      offer.allowed_actions = act === "submit" ? ["deactivate", "new_version"] : ["new_version"];
      sendJson(res, 200, offer);
      return true;
    }
    if (path === "/supplier/offers/import/preview/" && method === "POST") {
      const body = await readJsonBody(req);
      const lines = String(body.csv || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const satirlar = lines.slice(1).map((line, i) => {
        const cols = line.split(",");
        return {
          satir_no: i + 1,
          fiyat_modeli: cols[0] || "HAS_PLUS_ISCILIK",
          sku: cols[1] || "TG-BLZ-22-001-62",
          gecerli: true,
        };
      });
      sendJson(res, 200, {
        gecerli_adet: satirlar.length,
        hatali_adet: 0,
        satirlar,
        hatalar: [],
      });
      return true;
    }
    if (path === "/supplier/offers/import/commit/" && method === "POST") {
      const body = await readJsonBody(req);
      const count = Array.isArray(body.satirlar) ? body.satirlar.length : 0;
      sendJson(res, 200, { olusturulan_adet: count, teklif_idler: [] });
      return true;
    }

    // Cart, Checkout, Orders
    if (path === "/carts/me/" && method === "GET") {
      cart.server_now = nowIso();
      cart.line_count = cart.lines.length;
      sendJson(res, 200, cart);
      return true;
    }
    const cartIdMatch = /^\/carts\/(\d+)\/$/.exec(path);
    if (cartIdMatch && method === "GET") {
      const cid = Number(cartIdMatch[1]);
      if (cid !== cart.id) {
        sendJson(res, 404, { status: 404, title: "Sepet bulunamadı" });
        return true;
      }
      cart.server_now = nowIso();
      cart.line_count = cart.lines.length;
      sendJson(res, 200, cart);
      return true;
    }
    if (path === "/carts/me/lines/" && method === "POST") {
      const body = await readJsonBody(req);
      const line = {
        id: genId(),
        varyant_id: 1001,
        quote_id: Number(body.quote_id || 501),
        miktar: String(body.miktar || "1.000"),
        birim: "ADET",
        birim_fiyat_vergisiz: "98450.00",
        para_birimi: "TRY",
        gecerlilik_sonu: new Date(Date.now() + 180_000).toISOString(),
      };
      cart.lines.push(line);
      cart.line_count = cart.lines.length;
      sendJson(res, 201, cart);
      return true;
    }
    const cartLineMatch = /^\/carts\/me\/lines\/(\d+)\/$/.exec(path);
    if (cartLineMatch) {
      const id = Number(cartLineMatch[1]);
      const idx = cart.lines.findIndex((l: any) => l.id === id);
      if (idx === -1) {
        sendJson(res, 404, { status: 404, title: "Satır bulunamadı" });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        cart.lines[idx].miktar = String(body.miktar || cart.lines[idx].miktar);
        sendJson(res, 200, cart);
        return true;
      }
      if (method === "DELETE") {
        cart.lines.splice(idx, 1);
        cart.line_count = cart.lines.length;
        sendJson(res, 204, null);
        return true;
      }
    }
    if (path === "/checkouts/" && method === "POST") {
      const cid = genId();
      const oid = genId();
      const satirlar = cart.lines.map((l: any, idx: number) => ({
        id: idx + 1,
        varyant_id: l.varyant_id,
        platform_kodu: `TG-VAR-${l.varyant_id}`,
        miktar: l.miktar,
        birim: l.birim,
        para_birimi: l.para_birimi,
        satir_tutari: l.birim_fiyat_vergisiz,
        teslim_modeli: "PLATFORM_QC",
      }));
      const newOrder = {
        id: oid,
        alici_firma_id: activeUyelikFirmaId || 2,
        alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
        durum: "ONAY_BEKLIYOR",
        idempotency_key: `chk-${cid}`,
        line_count: cart.lines.length,
        satir_sayisi: cart.lines.length,
        toplamlar: { TRY: "98450.00" },
        olusturma_tarihi: nowIso(),
        allowed_actions: ["cancel", "reorder"],
        lines: cart.lines.map((l: any, idx: number) => ({
          id: idx + 1,
          varyant_id: l.varyant_id,
          miktar: l.miktar,
          birim: l.birim,
          snapshot_birim_fiyat_vergisiz: l.birim_fiyat_vergisiz,
          snapshot_satir_tutari_vergisiz: l.birim_fiyat_vergisiz,
          para_birimi: l.para_birimi,
        })),
        satirlar,
        hazirlama_emirleri: [],
      };
      orders.unshift(newOrder);
      cart.lines = [];
      cart.line_count = 0;
      sendJson(res, 201, { checkout_id: cid, durum: "TAMAMLANDI", order_id: oid, server_now: nowIso() });
      return true;
    }
    if (path === "/orders/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
      let list = orders;
      if (d) list = list.filter((o) => o.durum === d);
      if (q) list = list.filter((o) => `${o.id} ${o.alici_firma_ad || ""} ${o.durum}`.toLowerCase().includes(q));
      sendJson(res, 200, paginate(list, url));
      return true;
    }
    const orderMatch = /^\/orders\/(\d+)\/(?:(cancel|reorder)\/)?$/.exec(path);
    if (orderMatch) {
      const ord = orders.find((o) => o.id === Number(orderMatch[1]));
      if (!ord) {
        sendJson(res, 404, { status: 404, title: "Sipariş bulunamadı" });
        return true;
      }
      if (orderMatch[2] === "cancel" && method === "POST") {
        ord.durum = "IPTAL";
        sendJson(res, 200, ord);
        return true;
      }
      if (orderMatch[2] === "reorder" && method === "POST") {
        sendJson(res, 200, cart);
        return true;
      }
      sendJson(res, 200, ord);
      return true;
    }
    if (path === "/bulk-orders/" && method === "POST") {
      const body = await readJsonBody(req);
      const oid = genId();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      sendJson(res, 201, {
        order_id: oid,
        replayed: false,
        accepted: rows.map((r: any, i: number) => ({
          satir_no: i + 1,
          sku: String(r.sku || "SKU"),
          miktar: String(r.miktar || "1"),
          birim: r.birim || "ADET",
        })),
        errors: [],
      });
      return true;
    }
    if (path === "/ops/orders/" && method === "GET") {
      const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
      const aid = url.searchParams.get("alici_firma_id");
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      let list = orders;
      if (d) list = list.filter((o) => o.durum === d);
      if (aid) list = list.filter((o) => String(o.alici_firma_id) === String(aid));
      if (q) list = list.filter((o) => `${o.id} ${o.alici_firma_ad || ""} ${o.durum}`.toLowerCase().includes(q));
      sendJson(res, 200, paginate(list, url));
      return true;
    }
    if (path === "/ops/orders/summary/" && method === "GET") {
      sendJson(res, 200, {
        counts: {
          ONAY_BEKLIYOR: orders.filter((o) => o.durum === "ONAY_BEKLIYOR").length,
          HAZIRLANIYOR: orders.filter((o) => o.durum === "HAZIRLANIYOR").length,
          TOPLAM: orders.length,
        },
        server_now: nowIso(),
      });
      return true;
    }
    if (path === "/ops/orders/onay-havuzu/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      let pool = orders.filter(
        (o) => o.durum === "ONAY_BEKLIYOR" || o.durum === "OLUSTURULDU" || o.durum === "BEKLEMEDE"
      );
      if (q) pool = pool.filter((o) => `${o.id} ${o.alici_firma_ad || ""}`.toLowerCase().includes(q));
      sendJson(res, 200, { count: pool.length, results: pool });
      return true;
    }
    const opsOrdMatch = /^\/ops\/orders\/(\d+)\/(onayla|reddet|tahsilat|proforma|irsaliye)\/$/.exec(path);
    if (opsOrdMatch && method === "POST") {
      const ord = orders.find((o) => o.id === Number(opsOrdMatch[1]));
      const act = opsOrdMatch[2];
      if (!ord) {
        sendJson(res, 404, { status: 404, title: "Sipariş bulunamadı" });
        return true;
      }
      if (act === "onayla") {
        ord.durum = "HAZIRLANIYOR";
        ord.hazirlama_emirleri = [
          {
            id: genId(),
            tedarikci_firma_id: 2,
            tedarikci_ad: "Anadolu Kuyumculuk Ltd.",
            durum: "HAZIRLANIYOR",
            teslim_modeli: "PLATFORM_QC",
            hazir_zamani: null,
          },
        ];
        if (!hazirlamaOrders.some((h) => h.order_id === ord.id)) {
          hazirlamaOrders.unshift({
            order_id: ord.id,
            durum: "HAZIRLANIYOR",
            hazirlama_durumu: "HAZIRLANIYOR",
            alici: null,
            satirlar: (ord.satirlar || []).map((s: any) => ({
              order_line_id: s.id,
              varyant_id: s.varyant_id,
              platform_kodu: s.platform_kodu || `TG-VAR-${s.varyant_id}`,
              miktar: s.miktar,
              birim: s.birim,
              teslim_modeli: s.teslim_modeli || "PLATFORM_QC",
            })),
          });
        }
        sendJson(res, 200, ord);
        return true;
      }
      if (act === "reddet") {
        ord.durum = "IPTAL";
        sendJson(res, 200, ord);
        return true;
      }
      if (act === "tahsilat") {
        const body = await readJsonBody(req);
        const lid = genId();
        const pb = String(body.para_birimi || "TRY");
        ledgerEntries.unshift({
          id: lid,
          hareket_tipi: "TAHSILAT",
          yon: "ALACAK",
          tutar: String(body.tutar || "0.00"),
          para_birimi: pb,
          referans_tip: "ORDER",
          referans_id: ord.id,
          olusturma_tarihi: nowIso(),
          allowed_actions: [],
        });
        sendJson(res, 200, {
          ledger_entry_id: lid,
          tutar: String(body.tutar || "0.00"),
          para_birimi: pb,
        });
        return true;
      }
      if (act === "proforma" || act === "irsaliye") {
        const tip = act === "proforma" ? "PROFORMA" : "IRSALIYE";
        const rev = belgeler.filter((b) => b.order_id === ord.id && b.tip === tip).length + 1;
        const docId = genId();
        belgeler.unshift({
          id: docId,
          firma_id: ord.alici_firma_id || 2,
          tip,
          baslik: `${act === "proforma" ? "Proforma" : belgeAyarlari.irsaliye_baslik} #${ord.id} Rev.${rev}`,
          content_type: "application/pdf",
          byte_size: 4096,
          order_id: ord.id,
          revizyon: rev,
          belge_turu: tip,
          olusturma_tarihi: nowIso(),
        });
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("X-Document-Id", String(docId));
        res.setHeader("Content-Disposition", `attachment; filename="${act}-${ord.id}-r${rev}.pdf"`);
        res.end(`%PDF-1.4\n%TaraBank ${tip} Order #${ord.id} Rev.${rev}\n%%EOF\n`);
        return true;
      }
    }

    if (path === "/supplier/hazirlama/" && method === "GET") {
      sendJson(res, 200, hazirlamaOrders);
      return true;
    }
    const hazirMatch = /^\/supplier\/hazirlama\/(\d+)\/(hazir|irsaliye)\/$/.exec(path);
    if (hazirMatch && method === "POST") {
      const oid = Number(hazirMatch[1]);
      const target = hazirlamaOrders.find((h) => h.order_id === oid);
      if (!target) {
        sendJson(res, 404, { status: 404, title: "Hazırlama emri bulunamadı" });
        return true;
      }
      if (hazirMatch[2] === "hazir") {
        target.durum = "HAZIR";
        target.hazirlama_durumu = "HAZIR";
        const ord = orders.find((o) => o.id === oid);
        if (ord) {
          ord.durum = "HAZIR";
          for (const e of ord.hazirlama_emirleri || []) {
            e.durum = "HAZIR";
            e.hazir_zamani = nowIso();
          }
        }
        sendJson(res, 200, target);
        return true;
      }
      const docId = genId();
      const rev = belgeler.filter((b) => b.order_id === oid && b.tip === "TEDARIKCI_IRSALIYE").length + 1;
      belgeler.unshift({
        id: docId,
        firma_id: 2,
        tip: "TEDARIKCI_IRSALIYE",
        baslik: `Tedarikçi İrsaliyesi #${oid} Rev.${rev}`,
        content_type: "application/pdf",
        byte_size: 3500,
        order_id: oid,
        revizyon: rev,
        belge_turu: "TEDARIKCI_IRSALIYE",
        olusturma_tarihi: nowIso(),
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("X-Document-Id", String(docId));
      res.setHeader("Content-Disposition", `attachment; filename="tedarikci-irsaliye-${oid}-r${rev}.pdf"`);
      res.end(`%PDF-1.4\n%TaraBank Tedarikci Irsaliye Order #${oid}\n%%EOF\n`);
      return true;
    }

    // Belgeler / Documents & BelgeAyarlari
    if ((path === "/belgeler/" || path === "/documents/") && method === "GET") {
      const tipFilter = (url.searchParams.get("tip") || "").trim().toUpperCase();
      const orderFilter = url.searchParams.get("order_id");
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      let list = belgeler.map((b) => ({
        ...b,
        firma_ad: opsFirmalar.find((f) => f.id === b.firma_id)?.ad || "",
        download_url: `/api/v1/documents/${b.id}/download/`,
      }));
      if (tipFilter) list = list.filter((b) => b.tip === tipFilter);
      if (orderFilter) list = list.filter((b) => String(b.order_id) === String(orderFilter));
      if (q) list = list.filter((b) => `${b.baslik} ${b.firma_ad} ${b.id}`.toLowerCase().includes(q));
      sendJson(res, 200, paginate(list, url));
      return true;
    }
    const belgeDownloadMatch = /^\/(?:belgeler|documents)\/(\d+)\/download\/$/.exec(path);
    if (belgeDownloadMatch && method === "GET") {
      const doc = belgeler.find((b) => b.id === Number(belgeDownloadMatch[1]));
      if (!doc) {
        sendJson(res, 404, { status: 404, title: "Belge bulunamadı" });
        return true;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("X-Document-Id", String(doc.id));
      res.setHeader("Content-Disposition", `attachment; filename="belge-${doc.id}.pdf"`);
      res.end(`%PDF-1.4\n%TaraBank ${doc.baslik}\n%%EOF\n`);
      return true;
    }
    if (path === "/ops/belge-ayarlari/") {
      if (method === "GET") {
        sendJson(res, 200, belgeAyarlari);
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        if (typeof body.proforma_disclaimer === "string" && body.proforma_disclaimer.trim()) {
          belgeAyarlari.proforma_disclaimer = body.proforma_disclaimer.trim();
        }
        if (typeof body.irsaliye_baslik === "string" && body.irsaliye_baslik.trim()) {
          belgeAyarlari.irsaliye_baslik = body.irsaliye_baslik.trim();
        }
        if (typeof body.irsaliye_alt_metin === "string" && body.irsaliye_alt_metin.trim()) {
          belgeAyarlari.irsaliye_alt_metin = body.irsaliye_alt_metin.trim();
        }
        belgeAyarlari.guncelleme_tarihi = nowIso();
        sendJson(res, 200, belgeAyarlari);
        return true;
      }
    }

    // Warehouses & Stock
    if (path === "/supplier/warehouses/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const filtered = q
          ? warehousesSeed.filter((w) => `${w.kod} ${w.ad}`.toLowerCase().includes(q))
          : warehousesSeed;
        sendJson(res, 200, paginate(filtered, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const w = {
          id: genId(),
          kod: String(body.kod || "DEPO").toUpperCase(),
          ad: String(body.ad || "Yeni Depo"),
          sahip_tipi: "PLATFORM",
          sahip_firma_id: Number(body.sahip_firma_id || 1),
          sahip_firma_ad: opsFirmalar.find((f) => f.id === Number(body.sahip_firma_id || 1))?.ad || "Platform",
          aktif: body.aktif !== false,
          olusturma_tarihi: nowIso(),
        };
        warehousesSeed.push(w);
        sendJson(res, 201, w);
        return true;
      }
    }
    const whDetailMatch = /^\/supplier\/warehouses\/(\d+)\/$/.exec(path);
    if (whDetailMatch) {
      const idx = warehousesSeed.findIndex((w) => w.id === Number(whDetailMatch[1]));
      if (idx === -1) {
        sendJson(res, 404, { status: 404, title: "Depo bulunamadı" });
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(warehousesSeed[idx], body);
        sendJson(res, 200, warehousesSeed[idx]);
        return true;
      }
      if (method === "DELETE") {
        const [rem] = warehousesSeed.splice(idx, 1);
        sendJson(res, 200, { deleted: true, id: rem.id });
        return true;
      }
    }
    if (path === "/supplier/stock/" && method === "GET") {
      sendJson(res, 200, paginate(stockBalances, url));
      return true;
    }
    if (path === "/supplier/stock/adjustments/" && method === "POST") {
      const body = await readJsonBody(req);
      const delta = Number(body.miktar || 0);
      if (stockBalances[0] && Number.isFinite(delta)) {
        const nextOnHand = Math.max(0, Number(stockBalances[0].on_hand) + delta);
        stockBalances[0].on_hand = nextOnHand.toFixed(3);
        stockBalances[0].available = Math.max(0, nextOnHand - Number(stockBalances[0].reserved)).toFixed(3);
      }
      sendJson(res, 201, { ok: true });
      return true;
    }

    // Finance & Credit
    if (path === "/finance/me/" && method === "GET") {
      sendJson(res, 200, {
        para_birimi: url.searchParams.get("para_birimi") || "TRY",
        server_now: nowIso(),
        allowed_actions: [],
      });
      return true;
    }
    if (path === "/credit/me/" && method === "GET") {
      sendJson(res, 200, {
        bakiye: "53100.00",
        kredi_limiti: "1000000.00",
        kullanilabilir: "946900.00",
        limit_aktif: true,
        para_birimi: url.searchParams.get("para_birimi") || "TRY",
      });
      return true;
    }
    if (path === "/credit/check/" && method === "POST") {
      const body = await readJsonBody(req);
      const tutar = Number(body.tutar || 0);
      const pb = String(body.para_birimi || "TRY");
      if (!Number.isFinite(tutar) || tutar <= 0) {
        sendJson(res, 400, { status: 400, title: "Geçersiz tutar", detail: "Pozitif bir tutar giriniz." });
        return true;
      }
      if (tutar > 946900) {
        sendJson(res, 400, {
          status: 400,
          title: "Kredi Limiti Yetersiz",
          detail: "Talep edilen tutar kullanılabilir kredi limitini aşıyor (946900.00).",
        });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        credit: {
          bakiye: "53100.00",
          kredi_limiti: "1000000.00",
          kullanilabilir: "946900.00",
          limit_aktif: true,
          para_birimi: pb,
        },
      });
      return true;
    }
    if (path === "/finance/cari/" && method === "GET") {
      sendJson(
        res,
        200,
        paginate(
          [
            {
              id: 1,
              bakiye: "53100.00",
              kredi_limiti: "1000000.00",
              para_birimi: "TRY",
              guncelleme_tarihi: nowIso(),
              allowed_actions: ["view"],
            },
          ],
          url
        )
      );
      return true;
    }
    const cariDetailMatch = /^\/finance\/cari\/(\d+)\/$/.exec(path);
    if (cariDetailMatch && method === "GET") {
      if (Number(cariDetailMatch[1]) !== 1) {
        sendJson(res, 404, { status: 404, title: "Cari hesap bulunamadı" });
        return true;
      }
      sendJson(res, 200, {
        id: 1,
        bakiye: "53100.00",
        kredi_limiti: "1000000.00",
        para_birimi: "TRY",
        guncelleme_tarihi: nowIso(),
        allowed_actions: ["view"],
      });
      return true;
    }
    if (path === "/finance/ledger/" && method === "GET") {
      sendJson(res, 200, paginate(ledgerEntries, url));
      return true;
    }
    if (path === "/ops/finance/" && method === "GET") {
      sendJson(res, 200, {
        cari_count: 2,
        ledger_count: ledgerEntries.length,
        ops: true,
        payment_intent_count: paymentIntents.length,
        recent_ledger: ledgerEntries.slice(0, 5),
        recent_payments: paymentIntents.slice(0, 5),
      });
      return true;
    }
    if (path === "/ops/finance/cari/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const filtered = q
        ? opsCariList.filter((c) => `${c.firma_ad} ${c.karsi_firma_ad} ${c.para_birimi}`.toLowerCase().includes(q))
        : opsCariList;
      sendJson(res, 200, paginate(filtered, url));
      return true;
    }
    const opsCariDetailMatch = /^\/ops\/finance\/cari\/(\d+)\/$/.exec(path);
    if (opsCariDetailMatch) {
      const target = opsCariList.find((c) => c.id === Number(opsCariDetailMatch[1]));
      if (!target) {
        sendJson(res, 404, { status: 404, title: "Cari hesap bulunamadı" });
        return true;
      }
      if (method === "GET") {
        sendJson(res, 200, target);
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        if (body.kredi_limiti !== undefined) {
          target.kredi_limiti = String(body.kredi_limiti);
          target.guncelleme_tarihi = nowIso();
        }
        sendJson(res, 200, target);
        return true;
      }
    }
    if (path === "/ops/finance/ledger/" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const rows = ledgerEntries.map((e) => ({
        firma_id: 2,
        firma_ad: "Anadolu Kuyumculuk Ltd.",
        karsi_firma_id: 1,
        karsi_firma_ad: "TaraGold Platform A.Ş.",
        ...e,
      }));
      const filtered = q
        ? rows.filter((e) => `${e.hareket_tipi} ${e.firma_ad} ${e.referans_tip}`.toLowerCase().includes(q))
        : rows;
      sendJson(res, 200, paginate(filtered, url));
      return true;
    }
    if (path === "/ops/finance/payments/" && method === "GET") {
      sendJson(res, 200, paginate(paymentIntents, url));
      return true;
    }
    if (path === "/ops/finance/hak-edis/" && method === "GET") {
      const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
      const list = d ? hakEdisler.filter((h) => h.durum === d) : hakEdisler;
      sendJson(res, 200, { ...paginate(list, url), ops: true });
      return true;
    }
    if (path === "/ops/finance/tedarikci-odeme/" && method === "POST") {
      const body = await readJsonBody(req);
      const tedId = Number(body.tedarikci_firma_id);
      if (!tedId || !body.tutar) {
        sendJson(res, 400, { status: 400, title: "Doğrulama Hatası", detail: "tedarikci_firma_id ve tutar zorunludur." });
        return true;
      }
      const lid = genId();
      const pb = String(body.para_birimi || "TRY");
      ledgerEntries.unshift({
        id: lid,
        hareket_tipi: "TEDARIKCI_ODEME",
        yon: "BORC",
        tutar: String(body.tutar),
        para_birimi: pb,
        referans_tip: body.order_id ? "ORDER" : "TEDARIKCI_ODEME",
        referans_id: body.order_id ? Number(body.order_id) : lid,
        olusturma_tarihi: nowIso(),
        allowed_actions: [],
      });
      let updatedHe = null;
      if (body.hak_edis_id) {
        const he = hakEdisler.find((h) => h.id === Number(body.hak_edis_id));
        if (he) {
          he.durum = "ODENDI";
          he.odeme_tarihi = nowIso();
          he.odeme_ledger_entry_id = lid;
          updatedHe = he;
        }
      }
      sendJson(res, 201, {
        ledger_entry_id: lid,
        tutar: String(body.tutar),
        para_birimi: pb,
        tedarikci_firma_id: tedId,
        hak_edis: updatedHe,
      });
      return true;
    }
    if (path === "/payments/intents/" || path === "/payments/webhook/") {
      sendJson(res, 410, {
        status: 410,
        title: "Sanal POS Devre Dışı",
        detail: "Sanal POS ve tüketici ödeme akışı normatif iş modeli gereği kapatılmıştır. Tahsilatlar /ops/orders/{id}/tahsilat/ üzerinden elle kaydedilir.",
      });
      return true;
    }

    // Logistics & Returns
    if ((path === "/ops/shipments/" || path === "/shipments/") && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
      let list = shipments;
      if (d) list = list.filter((s) => s.durum === d);
      if (q) list = list.filter((s) => `${s.tasiyici || ""} ${s.kargo_firma || ""} ${s.takip_no || ""} ${s.alici_firma_ad || ""}`.toLowerCase().includes(q));
      sendJson(res, 200, paginate(list, url));
      return true;
    }
    if (path === "/ops/shipments/" && method === "POST") {
      const body = await readJsonBody(req);
      const ord = orders.find((o) => o.id === Number(body.order_id || 201));
      const s = {
        id: genId(),
        order_id: Number(body.order_id || 201),
        alici_firma_ad: ord?.alici_firma_ad || "Anadolu Kuyumculuk Ltd.",
        durum: "TASLAK",
        teslim_modeli: String(body.teslim_modeli || "PLATFORM_QC"),
        sevk_yonu: String(body.sevk_yonu || "PLATFORM_TO_ALICI"),
        tasiyici: String(body.tasiyici || ""),
        kargo_firma: "",
        takip_no: String(body.takip_no || ""),
        notlar: String(body.notlar || ""),
        pod: null,
        olusturma_tarihi: nowIso(),
        allowed_actions: ["prepare", "cancel"],
      };
      shipments.unshift(s);
      sendJson(res, 201, s);
      return true;
    }
    const shipDetailMatch = /^\/(?:ops\/)?shipments\/(\d+)\/$/.exec(path);
    if (shipDetailMatch && method === "GET") {
      const s = shipments.find((x) => x.id === Number(shipDetailMatch[1]));
      if (!s) {
        sendJson(res, 404, { status: 404, title: "Sevkiyat bulunamadı" });
        return true;
      }
      sendJson(res, 200, s);
      return true;
    }
    const shipActionMatch = /^\/ops\/shipments\/(\d+)\/(prepare|dispatch|deliver|cancel|pod)\/$/.exec(path);
    if (shipActionMatch && method === "POST") {
      const s = shipments.find((x) => x.id === Number(shipActionMatch[1]));
      if (!s) {
        sendJson(res, 404, { status: 404, title: "Sevkiyat bulunamadı" });
        return true;
      }
      const act = shipActionMatch[2];
      const body = await readJsonBody(req);
      if (act === "prepare") {
        s.durum = "HAZIR";
        s.allowed_actions = ["dispatch", "cancel"];
      }
      if (act === "dispatch") {
        s.durum = "YOLDA";
        if (body.kargo_firma) s.kargo_firma = String(body.kargo_firma);
        if (body.takip_no) s.takip_no = String(body.takip_no);
        s.allowed_actions = ["deliver", "add_pod", "cancel"];
      }
      if (act === "pod") {
        s.pod = {
          teslim_alan: String(body.teslim_alan || ""),
          notlar: String(body.notlar || ""),
          belgeler_ref: String(body.belgeler_ref || ""),
          olusturma_tarihi: nowIso(),
        };
        s.allowed_actions = ["deliver", "cancel"];
      }
      if (act === "deliver") {
        s.durum = "TESLIM";
        s.allowed_actions = [];
      }
      if (act === "cancel") {
        s.durum = "IPTAL";
        s.allowed_actions = [];
      }
      sendJson(res, 200, s);
      return true;
    }
    if (path === "/returns/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
        let list = returnsList;
        if (d) list = list.filter((r) => r.durum === d);
        if (q) list = list.filter((r) => `${r.sebep || ""} ${r.iade_sebebi || ""} ${r.alici_firma_ad || ""}`.toLowerCase().includes(q));
        sendJson(res, 200, paginate(list, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const r = {
          id: genId(),
          order_id: Number(body.order_id || 201),
          alici_firma_ad: orders.find((o) => o.id === Number(body.order_id || 201))?.alici_firma_ad || "Anadolu Kuyumculuk Ltd.",
          shipment_id: Number(body.shipment_id || 601),
          durum: "TASLAK",
          sebep: String(body.sebep || body.iade_sebebi || ""),
          iade_sebebi: String(body.iade_sebebi || body.sebep || ""),
          mahsup_tutari: body.mahsup_tutari ?? null,
          notlar: String(body.notlar || ""),
          stok_iade_yapildi: false,
          finans_mahsup_yapildi: false,
          olusturma_tarihi: nowIso(),
          lines: Array.isArray(body.lines)
            ? body.lines.map((l: any, idx: number) => ({
                id: idx + 1,
                order_line_id: Number(l.order_line_id || 1),
                varyant_sku: "TG-BLZ-22-001-62",
                miktar: String(l.miktar || "1"),
              }))
            : [],
          allowed_actions: ["submit_review", "approve", "reject", "cancel"],
        };
        returnsList.unshift(r);
        sendJson(res, 201, r);
        return true;
      }
    }
    const retDetailMatch = /^\/returns\/(\d+)\/$/.exec(path);
    if (retDetailMatch && method === "GET") {
      const r = returnsList.find((x) => x.id === Number(retDetailMatch[1]));
      if (!r) {
        sendJson(res, 404, { status: 404, title: "İade bulunamadı" });
        return true;
      }
      sendJson(res, 200, r);
      return true;
    }
    const retActionMatch = /^\/returns\/(\d+)\/(submit|approve|reject|cancel|mahsup)\/$/.exec(path);
    if (retActionMatch && method === "POST") {
      const r = returnsList.find((x) => x.id === Number(retActionMatch[1]));
      if (!r) {
        sendJson(res, 404, { status: 404, title: "İade bulunamadı" });
        return true;
      }
      const act = retActionMatch[2];
      if (act === "submit") {
        r.durum = "INCELENIYOR";
        r.allowed_actions = ["approve", "reject", "cancel"];
      }
      if (act === "approve") {
        r.durum = "ONAYLANDI";
        r.stok_iade_yapildi = true;
        r.allowed_actions = ["mahsup"];
      }
      if (act === "reject") {
        r.durum = "REDDEDILDI";
        r.allowed_actions = [];
      }
      if (act === "cancel") {
        r.durum = "IPTAL";
        r.allowed_actions = [];
      }
      if (act === "mahsup") {
        r.finans_mahsup_yapildi = true;
        r.durum = "MAHSUP_EDILDI";
        r.allowed_actions = [];
      }
      sendJson(res, 200, r);
      return true;
    }

    // Quality (QC)
    if (path === "/ops/inspections/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const d = (url.searchParams.get("durum") || "").trim().toUpperCase();
        let list = inspections;
        if (d) list = list.filter((i) => i.durum === d);
        if (q) list = list.filter((i) => `${i.notlar || ""} ${i.alici_firma_ad || ""} ${i.durum}`.toLowerCase().includes(q));
        sendJson(res, 200, paginate(list, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const ins = {
          id: genId(),
          order_id: Number(body.order_id || 201),
          order_line_id: body.order_line_id ? Number(body.order_line_id) : null,
          alici_firma_ad: orders.find((o) => o.id === Number(body.order_id || 201))?.alici_firma_ad || "Anadolu Kuyumculuk Ltd.",
          durum: "TASLAK",
          shipment_blok: true,
          notlar: String(body.notlar || ""),
          olusturma_tarihi: nowIso(),
          measurements: [],
          server_now: nowIso(),
          allowed_actions: ["start", "cancel"],
        };
        inspections.unshift(ins);
        sendJson(res, 201, ins);
        return true;
      }
    }
    const qcMatch = /^\/ops\/inspections\/(\d+)\/(?:(start|measurements|pass|fail|cancel)\/)?$/.exec(path);
    if (qcMatch) {
      const ins = inspections.find((x) => x.id === Number(qcMatch[1]));
      if (!ins) {
        sendJson(res, 404, { status: 404, title: "QC kaydı bulunamadı" });
        return true;
      }
      const act = qcMatch[2];
      if (!act && method === "GET") {
        sendJson(res, 200, ins);
        return true;
      }
      if (act === "start" && method === "POST") {
        ins.durum = "OLCUMDE";
        ins.allowed_actions = ["add_measurement", "pass", "fail", "cancel"];
      }
      if (act === "measurements" && method === "POST") {
        const body = await readJsonBody(req);
        const m = {
          id: genId(),
          order_line_id: Number(body.order_line_id || 1),
          birim: "GRAM",
          beklenen: "30.000",
          olculen: String(body.olculen || "30.000"),
          sapma_abs: "0.000",
          sonuc: "UYGUN",
          override_uygulandi: Boolean(body.override_gerekce),
          olusturma_tarihi: nowIso(),
        };
        ins.measurements = ins.measurements || [];
        ins.measurements.push(m);
        sendJson(res, 201, ins);
        return true;
      }
      if (act === "pass" && method === "POST") {
        ins.durum = "GECTI";
        ins.shipment_blok = false;
        ins.allowed_actions = [];
      }
      if (act === "fail" && method === "POST") {
        ins.durum = "KALDI";
        ins.allowed_actions = [];
      }
      if (act === "cancel" && method === "POST") {
        ins.durum = "IPTAL";
        ins.allowed_actions = [];
      }
      sendJson(res, 200, ins);
      return true;
    }

    // Org, Approvals, Invites, Ops Firmalar
    if (path === "/org-units/") {
      if (method === "GET") {
        sendJson(res, 200, paginate(orgUnits, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const u = { id: genId(), aktif: true, ...body };
        orgUnits.push(u);
        sendJson(res, 201, u);
        return true;
      }
    }
    const orgMembersMatch = /^\/org-units\/(\d+)\/members\/$/.exec(path);
    if (orgMembersMatch) {
      if (method === "GET") {
        sendJson(res, 200, paginate([], url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        sendJson(res, 201, { id: genId(), ...body });
        return true;
      }
    }
    if (path === "/approvals/") {
      if (method === "GET") {
        sendJson(res, 200, paginate(approvals, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const ap = {
          id: genId(),
          durum: "BEKLEMEDE",
          para_birimi: "TRY",
          olusturma_tarihi: nowIso(),
          allowed_actions: ["approve", "reject"],
          ...body,
        };
        approvals.unshift(ap);
        sendJson(res, 201, ap);
        return true;
      }
    }
    const apMatch = /^\/approvals\/(\d+)\/(submit|approve|reject)\/$/.exec(path);
    if (apMatch && method === "POST") {
      const ap = approvals.find((a) => a.id === Number(apMatch[1]));
      if (!ap) {
        sendJson(res, 404, { status: 404, title: "Onay bulunamadı" });
        return true;
      }
      ap.durum = apMatch[2] === "approve" ? "ONAYLANDI" : apMatch[2] === "reject" ? "REDDEDILDI" : "BEKLEMEDE";
      sendJson(res, 200, ap);
      return true;
    }
    if (path === "/auth/invites/" && method === "GET") {
      sendJson(res, 200, paginate(invites, url));
      return true;
    }
    if (path === "/auth/invites/create/" && method === "POST") {
      const body = await readJsonBody(req);
      const inv = { id: genId(), durum: "BEKLEMEDE", ...body };
      invites.unshift(inv);
      sendJson(res, 201, inv);
      return true;
    }
    if (path === "/ops/firmalar/") {
      if (method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const tip = (url.searchParams.get("tip") || "").trim().toLowerCase();
        let list = opsFirmalar;
        if (tip === "alici") list = list.filter((f) => f.alici_mi);
        if (tip === "tedarikci") list = list.filter((f) => f.tedarikci_mi);
        if (q) list = list.filter((f) => `${f.ad} ${f.firma_kodu} ${f.unvan || ""}`.toLowerCase().includes(q));
        sendJson(res, 200, paginate(list, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const f = {
          id: genId(),
          durum: "AKTIF",
          onay_durumu: "BEKLEMEDE",
          aktif: true,
          alici_mi: true,
          tedarikci_mi: false,
          ...body,
        };
        opsFirmalar.unshift(f);
        sendJson(res, 201, f);
        return true;
      }
    }
    const opsFirmaDetailMatch = /^\/ops\/firmalar\/(\d+)\/$/.exec(path);
    if (opsFirmaDetailMatch) {
      const fIdx = opsFirmalar.findIndex((x) => x.id === Number(opsFirmaDetailMatch[1]));
      if (fIdx === -1) {
        sendJson(res, 404, { status: 404, title: "Firma bulunamadı" });
        return true;
      }
      const f = opsFirmalar[fIdx];
      if (method === "GET") {
        sendJson(res, 200, f);
        return true;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        Object.assign(f, body);
        sendJson(res, 200, f);
        return true;
      }
      if (method === "DELETE") {
        opsFirmalar.splice(fIdx, 1);
        sendJson(res, 204, null);
        return true;
      }
    }
    const opsFirmaSubMatch = /^\/ops\/firmalar\/(\d+)\/(kontaklar|adresler|banka|belgeler)\/$/.exec(path);
    if (opsFirmaSubMatch) {
      const fid = Number(opsFirmaSubMatch[1]);
      const kind = opsFirmaSubMatch[2];
      const store =
        kind === "kontaklar"
          ? firmaKontaklar
          : kind === "adresler"
            ? firmaAdresler
            : kind === "banka"
              ? firmaBanka
              : firmaBelgeler;
      const list = store.get(fid) || [];
      if (method === "GET") {
        sendJson(res, 200, list);
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const item = { id: genId(), ...body };
        list.push(item);
        store.set(fid, list);
        sendJson(res, 201, item);
        return true;
      }
    }
    const opsFirmaKeysMatch = /^\/ops\/firmalar\/(\d+)\/api-anahtarlar\/(?:(\d+)\/iptal\/)?$/.exec(path);
    if (opsFirmaKeysMatch) {
      const fid = Number(opsFirmaKeysMatch[1]);
      const list = apiKeys.get(fid) || [];
      if (!opsFirmaKeysMatch[2] && method === "GET") {
        sendJson(res, 200, list);
        return true;
      }
      if (!opsFirmaKeysMatch[2] && method === "POST") {
        const body = await readJsonBody(req);
        const key = {
          id: genId(),
          ad: String(body.ad || "Anahtar"),
          key_prefix: "tg_live",
          scopes: Array.isArray(body.scopes) ? body.scopes : ["feed:read"],
          iptal: false,
          satis_kanali_id: 2,
          rate_limit_per_min: 120,
          olusturma: nowIso(),
          api_key: `tg_live_${crypto.randomBytes(8).toString("hex")}`,
        };
        list.unshift(key);
        apiKeys.set(fid, list);
        sendJson(res, 201, key);
        return true;
      }
      if (opsFirmaKeysMatch[2] && method === "POST") {
        const target = list.find((k) => k.id === Number(opsFirmaKeysMatch[2]));
        if (target) target.iptal = true;
        sendJson(res, 200, target || {});
        return true;
      }
    }
    const opsFirmaActMatch = /^\/ops\/firmalar\/(\d+)\/(onayla|askiya-al|davet)\/$/.exec(path);
    if (opsFirmaActMatch && method === "POST") {
      const f = opsFirmalar.find((x) => x.id === Number(opsFirmaActMatch[1]));
      if (!f) {
        sendJson(res, 404, { status: 404, title: "Firma bulunamadı" });
        return true;
      }
      if (opsFirmaActMatch[2] === "onayla") {
        f.onay_durumu = "ONAYLANDI";
        f.durum = "AKTIF";
        f.aktif = true;
      }
      if (opsFirmaActMatch[2] === "askiya-al") {
        f.durum = "ASKIDA";
        f.aktif = false;
      }
      if (opsFirmaActMatch[2] === "davet") {
        const body = await readJsonBody(req);
        invites.unshift({
          id: genId(),
          email: String(body.email || ""),
          rol: String(body.rol || "ALICI_SATINALMA"),
          durum: "BEKLEMEDE",
        });
      }
      sendJson(res, 200, f);
      return true;
    }

    if (path === "/ops/kanal-izinleri/" && method === "GET") {
      const d = url.searchParams.get("durum");
      const filtered = d ? kanalIzinleri.filter((x) => x.durum === d) : kanalIzinleri;
      sendJson(res, 200, paginate(filtered, url));
      return true;
    }
    const kanalActMatch = /^\/ops\/kanal-izinleri\/(\d+)\/(onayla|reddet)\/$/.exec(path);
    if (kanalActMatch && method === "POST") {
      const item = kanalIzinleri.find((x) => x.id === Number(kanalActMatch[1]));
      if (!item) {
        sendJson(res, 404, { status: 404, title: "Kanal izni bulunamadı" });
        return true;
      }
      item.durum = kanalActMatch[2] === "onayla" ? "ONAYLI" : "RED";
      item.karar_tarihi = nowIso();
      sendJson(res, 200, item);
      return true;
    }

    if (path === "/firma/kullanicilar/" && method === "GET") {
      const fid = url.searchParams.get("firma_id");
      const filtered = fid
        ? firmaUsers.filter((u) => String(u.firma_id) === String(fid))
        : firmaUsers;
      sendJson(res, 200, filtered);
      return true;
    }
    const firmaUserMatch = /^\/firma\/kullanicilar\/(\d+)\/$/.exec(path);
    if (firmaUserMatch && method === "PATCH") {
      const uid = Number(firmaUserMatch[1]);
      const u = firmaUsers.find((x) => x.kullanici_id === uid || x.id === uid);
      if (!u) {
        sendJson(res, 404, { status: 404, title: "Kullanıcı bulunamadı" });
        return true;
      }
      const body = await readJsonBody(req);
      if (typeof body.rol === "string") u.rol = body.rol;
      if (typeof body.aktif === "boolean") u.aktif = body.aktif;
      sendJson(res, 200, u);
      return true;
    }

    // Alıcı / API Kanal Erişimleri & Fiyat Grupları
    if (path === "/ops/alici-kanal-erisimleri/") {
      if (method === "GET") {
        const fid = url.searchParams.get("firma_id");
        const list = fid
          ? aliciKanalErisimleri.filter((x) => String(x.firma_id) === String(fid))
          : aliciKanalErisimleri;
        sendJson(res, 200, paginate(list, url));
        return true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const f = opsFirmalar.find((x) => x.id === Number(body.firma_id));
        const ch = salesChannels.find((x) => x.id === Number(body.satis_kanali_id));
        const fg = fiyatGruplari.find((x) => x.id === Number(body.fiyat_grubu_id));
        if (!f || !ch || !fg) {
          sendJson(res, 400, { status: 400, title: "Geçersiz seçim" });
          return true;
        }
        const existing = aliciKanalErisimleri.find(
          (x) => x.firma_id === f.id && x.satis_kanali_id === ch.id
        );
        if (existing) {
          existing.fiyat_grubu_id = fg.id;
          existing.fiyat_grubu_ad = fg.ad;
          existing.fiyat_grubu_kod = fg.kod;
          existing.aktif = body.aktif !== false;
          sendJson(res, 201, existing);
          return true;
        }
        const item = {
          id: genId(),
          firma_id: f.id,
          firma_ad: f.ad,
          satis_kanali_id: ch.id,
          satis_kanali_kod: ch.kod,
          satis_kanali_ad: ch.ad,
          fiyat_grubu_id: fg.id,
          fiyat_grubu_ad: fg.ad,
          fiyat_grubu_kod: fg.kod,
          aktif: body.aktif !== false,
        };
        aliciKanalErisimleri.unshift(item);
        sendJson(res, 201, item);
        return true;
      }
    }
    const aliciToggleMatch = /^\/ops\/alici-kanal-erisimleri\/(\d+)\/toggle\/$/.exec(path);
    if (aliciToggleMatch && method === "POST") {
      const target = aliciKanalErisimleri.find((x) => x.id === Number(aliciToggleMatch[1]));
      if (!target) {
        sendJson(res, 404, { status: 404, title: "Kanal erişimi bulunamadı" });
        return true;
      }
      target.aktif = !target.aktif;
      sendJson(res, 200, target);
      return true;
    }
    if (path === "/ops/fiyat-gruplari/" && method === "GET") {
      sendJson(res, 200, { count: fiyatGruplari.length, results: fiyatGruplari });
      return true;
    }

    // Sales channels & Reports
    if (path === "/sales-channels/" && method === "GET") {
      sendJson(res, 200, {
        count: salesChannels.length,
        results: salesChannels,
        server_now: nowIso(),
      });
      return true;
    }
    if (path === "/reports/orders/" && method === "GET") {
      sendJson(res, 200, {
        siparis_adet: orders.length,
        ciro_vergisiz: "246150.00",
        para_birimi: "TRY",
        read_model: "mock",
        scope: "tenant",
      });
      return true;
    }
    if (path === "/reports/buyer-behavior/" && method === "GET") {
      sendJson(res, 200, {
        quote_adet: quotes.size,
        lock_adet: priceLocks.size,
        siparis_adet: orders.length,
        read_model: "mock",
        scope: "tenant",
      });
      return true;
    }
    if (path === "/ops/anomalies/ciro/" && method === "GET") {
      const esik = url.searchParams.get("esik_ciro") || "100000";
      const esikNum = Number(esik) || 100000;
      const ciroVal = 246150;
      const uyarilar =
        ciroVal >= esikNum
          ? [
              {
                alici_firma_id: 2,
                alici_firma_ad: "Anadolu Kuyumculuk Ltd.",
                ciro_vergisiz: ciroVal.toFixed(2),
                esik_ciro: esikNum.toFixed(2),
                anomali: true,
              },
            ]
          : [];
      sendJson(res, 200, {
        esik_ciro: esik,
        read_model: "mock",
        scope: "platform",
        uyari_adet: uyarilar.length,
        uyarilar,
      });
      return true;
    }

    sendJson(res, 404, {
      status: 404,
      title: "Endpoint Mock Bulunamadı",
      detail: `${method} ${path} mock handler tanımlı değil.`,
    });
    return true;
  };
}

export function mockApiPlugin(): Plugin {
  const handler = createMockState();
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    void handler(req, res)
      .then((handled) => {
        if (!handled) next();
      })
      .catch((err) => {
        next(err);
      });
  };

  return {
    name: "taragold-mock-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
