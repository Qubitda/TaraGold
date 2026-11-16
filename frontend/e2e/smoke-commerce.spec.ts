import { test, expect } from "@playwright/test";
import { loginAsBuyer } from "./helpers/auth";

/**
 * Duman: giriş → katalog → sepete ekle → sipariş oluştur.
 * Mock YOK — Vite proxy → Django.
 *
 * Önkoşullar (README + docs/RUNBOOK.md):
 * - Postgres + migrate + createcachetable
 * - seed_demo_portals (+ seed_demo_commerce / stok+teklif seed)
 * - Django runserver (8000) + tercihen ingest --loop
 * - E2E_USERNAME / E2E_PASSWORD (varsayılan demo_alici)
 * - USE_MOCK=false
 */
test.describe("duman — commerce", () => {
  test("login → katalog → sepet → sipariş", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsBuyer(page);

    await page.goto("/urunler");
    await expect(
      page.getByRole("heading", { name: /Ürün Kataloğu|Katalog|Ürünler/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Fiyatı olan kart (ilk DEMO satırı bazen teklifsiz)
    const pricedCard = page
      .locator("article")
      .filter({ hasText: /Tahmini fiyat|₺/ })
      .first();
    await expect(pricedCard).toBeVisible({ timeout: 30_000 });
    const orderBtn = pricedCard.getByRole("button", { name: /Sipariş Ver/i });
    await expect(orderBtn).toBeEnabled({ timeout: 60_000 });
    await orderBtn.click();

    // Başarılı ekleme: toast + /siparis?tab=cart yönlendirmesi
    await expect(
      page.getByText(/Sipariş listesine eklendi|Eklendi/i).first()
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(/\/siparis/, { timeout: 30_000 });

    const cartTab = page.getByRole("button", { name: /Yeni sipariş/i });
    if (await cartTab.count()) {
      await cartTab.first().click();
    }

    const sendBtn = page.getByRole("button", { name: /Siparişi Gönder/i }).first();
    await expect(sendBtn).toBeVisible({ timeout: 30_000 });
    await sendBtn.click();

    // Modal içindeki ikinci "Siparişi Gönder"
    const modalSubmit = page.getByRole("button", { name: /Siparişi Gönder/i }).last();
    await expect(modalSubmit).toBeVisible({ timeout: 15_000 });
    await modalSubmit.click();

    await expect(
      page.getByText(/Sipariş oluşturuldu/i).first()
    ).toBeVisible({ timeout: 60_000 });
  });
});
