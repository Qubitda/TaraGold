import { test, expect } from "@playwright/test";
import { loginAsBuyer } from "./helpers/auth";

/**
 * E2E: gerçek Vite proxy → Django. API route mock yasak.
 * Önkoşul: Django runserver + seed_demo_portals (+ commerce seed tercih).
 */
test.describe("portal akışları (gerçek API)", () => {
  test("login sayfası Türkçe ve erişilebilir", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(page.getByRole("heading", { name: /TaraGold/i })).toBeVisible();
  });

  test("yetkisiz firma URL’i login’e düşer", async ({ page }) => {
    await page.goto("/firmalar");
    await expect(page).toHaveURL(/\/login/);
  });

  test("bilinmeyen yol 404 gösterir", async ({ page }) => {
    await loginAsBuyer(page);
    await page.goto("/bu-yol-yok-xyz");
    await expect(
      page.getByRole("heading", { name: /Sayfa bulunamadı/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText("404");
  });

  test("oturumlu ama yetkisiz sayfa 403 gösterir", async ({ page }) => {
    await loginAsBuyer(page);
    await page.goto("/firmalar");
    await expect(page.getByRole("heading", { name: /yetkiniz yok/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText("403");
  });

  test("katalog ve sipariş sayfaları seed ile yüklenir", async ({ page }) => {
    await loginAsBuyer(page);

    await page.goto("/urunler");
    await expect(
      page.getByRole("heading", { name: "Ürün Kataloğu", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/siparis");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
