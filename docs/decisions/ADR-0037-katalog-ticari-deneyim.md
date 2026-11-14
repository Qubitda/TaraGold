# ADR-0037 — Katalog ticari deneyim (P0)

- **Durum**: Kabul (kullanıcı plan uygulamasını onayladı: Katalog P0 yeniden tasarım)
- **Kapsam**: `urunler`, `api`, `frontend` (katalog UX); fiyat motoru **yeniden yazılmaz**
- **İlgili**: ADR-0005, ADR-0018, ADR-0030, ADR-0031; P1’e ertelenen M2M koleksiyon/etiket

## Mevcut durum (Faz 0 denetim — DOĞRULANDI)

- Runtime refs: aktif `koleksiyon/renk/teknik/stil/olcu` sayıları **0** (seed çalışmamış / kısmi); ürün formu seçenekleri bu yüzden boş.
- Ürün yazma yalnız `/api/v1/ops/products/` (platform + submit/approve/publish).
- Alıcı `liste`/`detay` fiyat içermez; satın alma: varyant → `POST /quotes/` → `POST /carts/me/lines/` (`quote_id`).
- Taş maliyeti quote’ta `TeklifTasMaliyeti`; katalog `UrunTasi.bedel` vitrin (K-011).
- Ürün/varyant ImageField yok; `BACKEND_GAPS`’te açık media satırı yoktu.
- `docs/MASTER.md` bu repoda yok (DOĞRULANAMADI); §12 yerine bu ADR + BACKLOG.

## Kararlar (P0)

1. **Korunanlar**: `Urun`, `Varyant`, onay/yayın, firma sahipliği, refs tabloları, `pricing_service` / kör havuz maskeleme.
2. **`UrunGorsel`**: ürün FK, opsiyonel varyant FK, dosya, sıra, kapak, alt_metin, tip (`kapak|galeri|detay|video`); local `MEDIA` (S3 sonra).
3. **Bulk varyant**: renk×ölçü matrisi atomic servis + `POST …/variants/bulk/`.
4. **Fiyat önizleme**: mevcut quote motorunun ops-safe okuma yolu; teklif yoksa sahte fiyat yok, `teklif_gerekli` durumu.
5. **Yayın/onay checklist**: en az 1 aktif varyant (mevcut) + en az 1 kapak görseli (P0 ek); FE tamamlanma göstergesi aynı kuralları yansıtır.
6. **Refs UX**: seed idempotent; formda boş state + hızlı create (`POST /ops/catalog-refs/`).
7. **P1 ertelenen**: koleksiyon FK→M2M, etiket/rozet, taş yazma yüzeyi bütünlüğü, tam alıcı vitrin yeniden tasarımı.
8. **Yasak**: motor rewrite, maliyet/tedarikçi sızıntısı, sahte fiyat/KPI, onay/yayın bypass.

## Sonuçlar

- P0 şema/API/FE bu ADR’ye göre uygulanır.
- OpenAPI + `frontend/BACKEND_GAPS.md` galeri/preview gap satırları güncellenir.
