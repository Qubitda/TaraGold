
# Katalog → Ürün → Fiyat → Sipariş (proje kopyası)

Bu dosya ekteki CURSOR_SPEC içeriğidir. Uygulama notları:

- **SupplierOffer** bu kod tabanında `VaryantFiyat` ile karşılanır. `TedarikciTeklif` / `/supplier/offers` HTTP yolu geri açılmaz (410).
- Sipariş durumları backend gerçeğine uyar: `ONAY_BEKLIYOR`, `ONAYLANDI`, `HAZIRLANIYOR`, `HAZIR`, `REDDEDILDI`, `IPTAL` (+ legacy `OLUSTURULDU`). `SEVKIYAT` / `TAMAMLANDI` sevkiyat diliminde.
- Stok + has-gram borç: admin onay (`ADR-0001`). TL netliği yalnız ödeme/bağlantı anında.
- Önceki “kesin TL fiyat onayda” (`ADR-0038`) bu ADR ile revize edildi.

Aşağıda orijinal SPEC metni yer alır.

---

# Katalog → Ürün → Fiyat → Sipariş: Tek Kaynak Doküman

> Bu dosyayı projenin köküne `docs/SPEC.md` olarak koy. Cursor'a her yeni görevde
> "Önce docs/SPEC.md'yi oku" de. `.cursor/rules/` altına da kopyalarsan her sohbette otomatik okunur.
>
> **Neden bu dosya var:** `1.md` iki farklı fiyat modeli ve iki farklı terim ("komisyon" / "servis bedeli")
> içeriyor. Kodda da aynı kavram için üç ayrı durum sözlüğü var. Cursor hangisinin doğru olduğunu
> bilemiyor ve tahmin ediyor. Bu dosya o tahmini ortadan kaldırır.

---

## 0. Kesin kararlar (tartışmaya kapalı)

1. Resmi terim **Servis Bedeli**. "Komisyon" kelimesi kodda ve arayüzde kullanılmaz.
2. Fiyat hesabı **sadece backend'de** yapılır. Frontend fiyat hesaplamaz, sadece gösterir.
3. Müşteri **tedarikçiyi hiçbir ekranda görmez** (ad, kod, iletişim, maliyet, marj dahil).
4. Tedarikçi, sipariş **admin tarafından onaylanana kadar** siparişi göremez.
5. **TL fiyat vaadi yoktur.** Müşterinin gördüğü TL **yaklaşık**tır (“ödeme anındaki kurla netleşir”). Onayda has-gram (ve metal-dışı TL borç) kesinleşir; TL kur sabitlemesi ödeme/bağlantı anındadır (`ADR-0001`).
6. **Stok rezervasyonu onayda yapılır.** Gönderilen siparişte stok ayrılmaz; reddedilen siparişte geri bırakılacak bir şey yoktur.
7. **Tahsilatı platform yapar.** Müşteri ödemeyi platforma yapar, platform tedarikçiye öder. Tedarikçi müşteriden para toplamaz ve müşteriye fatura kesmez.
8. **Tek-parça (benzersiz) üründe ilk sipariş veren kazanır** (gönderim zamanına göre sıra).
9. Fiyat modeli olarak `1.md` Bölüm 10 geçerli (Servis Bedeli + 4 kontrat tipi). Bölüm 3'teki
   "komisyon matrisi" yalnızca *hangi kuralın uygulanacağını seçme sırası* (override hiyerarşisi) için kalır.

---

## 1. Zincir (tek cümle)

```
Ürün ──< Varyant ──< Tedarikçi Teklifi (SupplierOffer)
                         │
                         ▼
   Fiyat Motoru (backend): has gram × saf birim fiyat + işçilik + taş + ek bedel + Servis Bedeli
                         │
                         ▼
          Quote = TAHMİNİ fiyat (kilit yok, "yaklaşık" etiketli)
                         │
                         ▼
        Sepet Satırı (varyant + miktar + tahmini fiyat)
                         │
                         ▼
   Sipariş Gönder ──▶ Sipariş (ONAY_BEKLIYOR, tahmini fiyat yazılı, stok AYRILMAZ)
                         │
                         ▼
   Onay Havuzu (admin)
        ├─ Onayla: ① güncel rate ile KESİN fiyat hesapla ② stok ayır ③ siparişe yaz
        │          ④ tedarikçiye hazırlama emri aç ⑤ müşteriye kesin fiyatı göster
        └─ Reddet: müşteriye bildirim (stok/fiyat işlemi yok)
```

**Kural:** Zincirde bir halka eksikse ekran "çalışıyormuş gibi" görünür ama veri akmaz.
Cursor her halkayı ayrı ayrı doğrulamalı (bkz. Bölüm 6).

---

## 2. Varlıklar ve ilişkiler

| Varlık | Kimin | İlişki | Müşteri görür mü |
|---|---|---|---|
| Ürün (`Urun`) | Platform kataloğu | Kategori, ayar/metal, taşlar, görseller | Evet |
| Varyant (`Varyant`) | Ürüne bağlı | SKU, gram, renk, beden, ek bedel | Evet |
| Tedarikçi Teklifi (`SupplierOffer`) | **Tedarikçi** | Varyanta bağlı; fiyat modeli, işçilik, geçerlilik | **Hayır** |
| Marj/Servis Bedeli kuralı | **Admin** | Kanal / tedarikçi / ikisi bazlı override | **Hayır** |
| Satış kanalı | Platform | Kuyumcu, çantacı, B2B API, B2C API | Evet (kendi kanalı) |
| Quote | Sistem | Varyant + kanal + alıcı → net fiyat, bitiş zamanı | Evet |
| Sepet satırı | Müşteri | `quote_id` + miktar | Evet |
| Sipariş + satırlar | Müşteri | Fiyat **snapshot** (sonradan değişmez) | Evet |
| Hazırlama emri | Sistem | Sipariş onaylanınca tedarikçiye açılır | Tedarikçi görür, alıcı adı **gizli** |

**Bağ kuralları**

- Bir varyantın satılabilmesi için: ürün **onaylı + yayında** ∧ en az bir **yayındaki teklif** ∧ ürün o **kanala atanmış** ∧ alıcının o kanala **erişimi** var.
- Bunlardan biri yoksa katalogda fiyat yerine **nedenini** gösteren rozet çıkar ("Fiyat yok: teklif yayında değil" gibi). Sessizce boş kalmaz.
- Sipariş satırında iki ayrı fiyat alanı vardır: **tahmini** (gönderirken yazılır) ve **kesin** (onayda yazılır, onaya kadar `null`). Bir kez yazılan kesin fiyat bir daha değişmez.

---

## 3. Fiyat hesabı (backend'in yaptığı iş, FE bilmek zorunda değil)

```
Has gram      = Gram × (Milyem / 1000)
Ham fiyat     = Has gram × Saf birim fiyat (günlük rate)
Satış fiyatı  = Ham fiyat + İşçilik + Taş bedeli + Ek bedel + Servis bedeli
Kâr           = İşçilik + Servis bedeli
```

**Ne zaman hesaplanır:** (a) katalogda/sepette tahmin için, (b) admin onayında kesin fiyat için.
Aynı motor, aynı formül; tek fark onaydaki sonucun siparişe **kalıcı** yazılması.

Müşteriye giden quote yalnızca şunları içerir: `toplam_vergisiz`, `gram`, `gram_basi_vergisiz`,
`para_birimi`, `expires_at`. **Kırılım (işçilik, servis bedeli, kâr) müşteri yüzeyinde yoktur.**

---

## 4. Sipariş durum makinesi (TEK sözlük)

Koddaki üç sözlük (`TASLAK/BEKLEMEDE…`, `ONAY_BEKLIYOR/OLUSTURULDU…`, `HAZIR/REDDEDILDI…`) bu tek
sözlükle değiştirilecek. Backend `durum` alanını şu an sadece `string` olarak tanımlıyor, yani FE
tahmin yürütüyor. **Önce backend'in gerçekte hangi değerleri döndürdüğü doğrulanmalı**, sonra bu tablo
buna göre sabitlenmeli.

| Kod | Müşteri etiketi | Admin etiketi | Sonraki |
|---|---|---|---|
| `ONAY_BEKLIYOR` | Onay bekliyor | Onay havuzunda | `ONAYLANDI`, `REDDEDILDI`, `IPTAL` |
| `ONAYLANDI` | Onaylandı | Tedarikçiye iletildi | `HAZIRLANIYOR` |
| `HAZIRLANIYOR` | Hazırlanıyor | Hazırlanıyor | `HAZIR` |
| `HAZIR` | Hazırlandı | Hazır | `SEVKIYAT` |
| `SEVKIYAT` | Kargoda | Sevkiyatta | `TAMAMLANDI` |
| `TAMAMLANDI` | Teslim edildi | Tamamlandı | (son) |
| `REDDEDILDI` | Reddedildi (+ neden) | Reddedildi | (son; müşteri aynı satırlarla sepeti yeniden açabilir) |
| `IPTAL` | İptal | İptal | (son) |

Tek dosyada tanımlanır: `lib/order-status.ts` → etiket, rozet rengi, izinli geçişler. Tüm ekranlar
oradan import eder. Başka hiçbir dosyada durum etiketi tanımlanmaz.

---

## 5. Ekranlar ve kabul kriterleri (PNG'deki akış)

### 5.1 Müşteri: Katalog
- Liste, her ürün için **batch quote** ile fiyat gösterir (`POST /quotes/batch/`).
- Fiyat her yerde **"Tahmini fiyat"** etiketiyle gösterilir (katalog, ürün detayı, sepet, sipariş gönderme ekranı).
  Kısa açıklama: *"Kesin fiyat siparişiniz onaylandığında güncel kura göre belirlenir."*
- Fiyat gelmezse `reason_code` karşılığı Türkçe neden yazılır. **Sessizce boş kalmaz.**
- Buton adı **Sipariş Ver** (Satın Al yok).
- **Kabul:** Yayındaki, teklifi olan ürün için "Tahmini fiyat: X TL" görünür; teklifi olmayan için neden görünür.

### 5.2 Müşteri: Sepet / Sipariş oluşturma
- Sipariş Ver → varyant + miktar → sepet satırı (tahmini fiyatla).
- **Geri sayım ve "süresi doldu" yok.** Fiyat zaten tahmin; kilitlenmiyor. Sepet açılırken tahmin tazelenir.
- **Siparişi Gönder** → sipariş `ONAY_BEKLIYOR`. Sipariş satırlarına tahmini fiyat yazılır. Stok ayrılmaz.
- **Kabul:** Gönderince sepet boşalır; Siparişlerim'de `ONAY_BEKLIYOR` ve "Tahmini toplam" görünür.

### 5.3 Admin: Onay havuzu
- `GET /ops/orders/onay-havuzu/` sadece `ONAY_BEKLIYOR` olanları getirir.
- Detayda alıcı, satırlar, **tahmini** tutar ve (onay öncesi) **güncel hesaplanacak kesin tutar önizlemesi** görünür. Tedarikçi bilgisi varsayılan gizli.
- **Onayla** → `POST /ops/orders/{id}/onayla/` şunları **tek işlemde (atomik)** yapar:
  1. Güncel rate ile kesin fiyatı hesaplayıp satırlara yazar
  2. Stok ayırır. **Yetersizse onay başarısız olur**, sipariş `ONAY_BEKLIYOR` kalır, admin'e hangi satırın yetmediği söylenir
  3. Tedarikçiye hazırlama emri açar
  4. Siparişi `ONAYLANDI` yapar
- **Tek-parça ürün sırası:** Aynı benzersiz parçayı içeren birden çok `ONAY_BEKLIYOR` sipariş varsa **en eski gönderilen** onaylanabilir.
  Sonrakilerin Onayla butonu pasif olur ve "Önde bekleyen sipariş #X var" yazar. Öndeki reddedilir veya iptal edilirse sıradaki açılır.
  Onaylanınca parça ayrıldığı için kalan siparişler onaylanamaz; admin bunları reddeder.
- **Reddet** → neden zorunlu → `REDDEDILDI` → müşteriye bildirim.
- **Kabul:** Onaydan önce tedarikçide emir yok, onaydan sonra var; sipariş satırında kesin fiyat dolu, stok düşmüş.

### 5.4 Müşteri: Siparişlerim
- `ONAY_BEKLIYOR`: **Tahmini** tutar, rozet "Tahmini".
- `ONAYLANDI` ve sonrası: **Kesin** tutar gösterilir; tahmin yanında üstü çizili/küçük gösterilir, fark varsa "Fark: ±X TL" yazar.
- `REDDEDILDI`: neden görünür + **Sepeti yeniden aç ve gönder** (mevcut `reorder` ucu): aynı satırlar ve miktarlarla sepet açılır,
  tahmini fiyatlar tazelenir, müşteri tek tıkla tekrar gönderir. Eski sipariş `REDDEDILDI` olarak kayıtta kalır, yeni gönderim **yeni sipariş** olur.
  Reddedilen siparişteki tek-parça ürün başkasına gittiyse o satır sepette "Artık mevcut değil" uyarısıyla gelir.
- **Kabul:** Onaydan sonra ekran yenilenince "Tahmini" rozeti kalkar, "Kesin fiyat" görünür.

### 5.5 Tedarikçi: Hazırlama
- Sadece `ONAYLANDI` sonrası emirleri görür, alıcı alanı `null`.
- **Kabul:** Alıcı adı ağ yanıtında bile bulunmaz (sadece UI'da gizlemek yetmez).

---

## 6. Cursor'a çalışma yöntemi (sırayla ver, tek seferde hepsini isteme)

Cursor "her şeyi bir seferde yap" denince yarım ve birbirine bağlanmayan kod üretir. Şu sırayla ilerle:

**Önemli:** Fiyatın onayda kesinleşmesi ve stoğun onayda ayrılması **backend değişikliği** gerektirir
(şu an sipariş gönderilirken fiyat snapshot'ı yazılıyor). Frontend bunu taklit edemez. Bu dosyayı backend
projesindeki Cursor'a da ver.

**Adım 0 (yeni): "Hiç fiyat gelmiyor" teşhisi.** Katalog fiyatı şu üç koşuldan biri yüzünden sessizce hiç sorgulanmıyor olabilir
(`catalog-view.tsx` ~403. satır): kullanıcıda `can_lock_quote`/`can_view_cart` yetkisi yok; alıcıya hiç satış kanalı atanmamış
(`selectedKanalId` boş); ürünün `varsayilan_varyant_id` değeri yok. Network sekmesinde `/quotes/batch/` isteği gidiyor mu, ne dönüyor kontrol et.

**Adım 1: Sadece teşhis, kod yazma.**
> docs/SPEC.md'yi oku. Kodu değiştirme. Bölüm 1'deki zincirin her halkası için (Ürün → Varyant → Teklif →
> Quote → Sepet → Checkout → Sipariş → Onay havuzu → Hazırlama emri) şunu çıkar: hangi dosya/fonksiyon bunu
> yapıyor, hangi API uç noktasını çağırıyor, çalışıyor mu yoksa eksik/sahte veri mi var. Tablo olarak ver.

**Adım 2: Durum sözlüğünü birleştir.**
> Bölüm 4'e göre `lib/order-status.ts` oluştur. Koddaki tüm sipariş durum etiketlerini oradan okuyacak
> şekilde değiştir. Başka bir şeye dokunma. Önce `lib/api/schema.d.ts` ve backend yanıtından gerçek
> değerleri doğrula; farklıysa dur ve bana sor.

**Adım 3: Tek halkayı düzelt (örn. "Katalogda fiyat görünmüyor").**
> Sadece Bölüm 5.1'i uygula. Kabul kriterini sağlayan bir test yaz. Bitince hangi dosyaları değiştirdiğini listele.

**Adım 4, 5, 6:** 5.2 → 5.3 → 5.4 → 5.5 aynı şekilde, her biri ayrı oturumda.

**Her görevin sonuna ekle:**
> Kabul kriterini karşılamıyorsa "bitti" deme. Mock/sahte veri kullandıysan açıkça yaz. Frontend'de fiyat hesaplama yapma.

---

## 7. Kararlar (hepsi verildi)

| # | Konu | Karar |
|---|---|---|
| 1 | Fiyat ne zaman kesinleşir | Admin onayında. Öncesi "tahmini" |
| 2 | Stok rezervasyonu | Onayda |
| 3 | Para akışı | Tahsilatı platform yapar |
| 4 | Tek-parça çakışması | İlk sipariş veren kazanır (bkz. 5.3) |
| 5 | Reddedilen sipariş | Aynı satırlarla sepet yeniden açılır, tekrar gönderilir |
| 6 | Fiyat farkı | Müşteriden tekrar onay istenmez, fark gösterilir (varsayılan) |

**Karar 2 ile 4 arasındaki gerilim:** Stok onayda ayrıldığı için "ilk veren" kuralını sistem değil **onay sırası** belirler.
Bunu garanti etmek için 5.3'teki sıra kuralı şart. Aksi halde admin ikinci siparişi önce onaylarsa ilk veren kaybeder.

---

## 8. Para akışı: tasarıma etkisi

- **Müşteri → Platform:** Tahsilat siparişe bağlı kaydedilir (`POST /ops/orders/{id}/tahsilat/`, `payments/intents`). Müşteri cari hesabı platformda tutulur.
- **Platform → Tedarikçi:** Tedarikçi ödemesi ayrı akış (`/ops/finance/tedarikci-odeme/`, hak ediş). Gram bazlı cari hesap bu tarafta çalışır.
- **Fatura:** Müşteriye kesilen fatura ve kargo etiketi **platform markasıyla** çıkar. Tedarikçi adı hiçbir belgede geçmez.
- **Tedarikçi ekranı:** Müşteri ödeme durumunu veya tutarını görmez; sadece "hazırla" emri ve kendi hak edişini görür.
- **Müşteri ekranı:** Siparişlerim'de ödeme durumu (bekliyor/ödendi) ve bakiye görünür.

**Henüz belirlenmemiş (para akışının devamı, sipariş işini engellemez):** Tahsilat **ne zaman** yapılır?
Onaydan hemen sonra mı, sevkiyattan önce mi, yoksa vadeli (cari) mi?

