import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/community/**", route => route.fulfill({ json: { configured: false, posts: [], profiles: [], players: [], items: [] } }));
  await page.goto("/community.html");
  await page.evaluate(() => openSearch());
});

test("search results are semantic links and buttons with keyboard focus contained", async ({ page }) => {
  await page.route("**/api/community/search?**", route => route.fulfill({ json: {
    players: [{ slug: "yildiz", name: "Yildiz", news_count: 2 }],
    profiles: [{ username: "vince", display_name: "Vince" }],
    news: [{ id: 5, title: "Notizia Juventus", body: "Dettagli" }]
  } }));
  const dialog = page.getByRole("dialog", { name: "Cerca nella Community" });
  await page.getByRole("searchbox", { name: "Cerca nella Community" }).fill("Juve");
  await dialog.getByRole("button", { name: "Cerca", exact: true }).click();
  await expect(page.locator("#communitySearchStatus")).toContainText("3 risultati");
  await expect(dialog.getByRole("link", { name: /Yildiz/ })).toHaveAttribute("href", "/giocatore?slug=yildiz");
  await expect(dialog.getByRole("button", { name: /Vince/ })).toBeVisible();
  await dialog.getByRole("link", { name: /Notizia Juventus/ }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Chiudi ricerca" })).toBeFocused();
});

test("failed searches retry without exposing server markup", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/community/search?**", route => ++attempts === 1
    ? route.fulfill({ status: 503, contentType: "text/html", body: "<!DOCTYPE html><h1>Error</h1>" })
    : route.fulfill({ json: { news: [] } }));
  await page.getByRole("searchbox").fill("Juve");
  await page.locator("#searchModal .publish").click();
  await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();
  await expect(page.locator("#searchResults")).not.toContainText("DOCTYPE");
  await page.getByRole("button", { name: "Riprova" }).click();
  await expect(page.locator("#communitySearchStatus")).toContainText("Nessun risultato");
});

test("editing a query prevents an older response from replacing results", async ({ page }) => {
  await page.route("**/api/community/search?**", async route => {
    const old = route.request().url().includes("Vecchia");
    if (old) await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ json: { news: [{ id: old ? 1 : 2, title: old ? "Vecchia notizia" : "Nuova notizia" }] } }).catch(() => {});
  });
  await page.getByRole("searchbox").fill("Vecchia");
  await page.locator("#searchModal .publish").click();
  await page.getByRole("searchbox").fill("Nuova");
  await page.locator("#searchModal .publish").click();
  await expect(page.getByRole("link", { name: "Nuova notizia News ICV" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.locator("#searchResults")).not.toContainText("Vecchia notizia");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
