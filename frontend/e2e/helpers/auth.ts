import type { Page } from "@playwright/test";

export function e2eCredentials(): { username: string; password: string } {
  return {
    username: process.env.E2E_USERNAME || "demo_alici",
    password: process.env.E2E_PASSWORD || "DemoPortal1!",
  };
}

/** UI login via Vite proxy → Django session/CSRF. No API route mocks. */
export async function loginAsBuyer(page: Page): Promise<void> {
  const { username, password } = e2eCredentials();
  await page.goto("/login");
  await page.locator("#login-username").fill(username);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /Giriş Yap/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}
