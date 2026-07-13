import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
});

test("Community renders its primary navigation and feed controls", async ({ page }) => {
  await page.goto("/community", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/ICV Community/);
  await expect(page.getByRole("navigation", { name: "Filtri feed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seguiti" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Cosa ne pensi della Juve?" })).toBeVisible();
});

test("Match Room opens as an accessible dialog", async ({ page }) => {
  await page.goto("/community", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Match (Center|Room)|Serie A/ }).click();
  await expect(page.getByRole("dialog", { name: "Match Room" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Messaggio Match Room" })).toBeVisible();
});

test("deep post routes keep the Community shell", async ({ page }) => {
  await page.goto("/community/post/00000000-0000-4000-8000-000000000000", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/ICV Community/);
  await expect(page.getByRole("dialog", { name: "Conversazione" })).toBeVisible();
});
