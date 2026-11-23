import { expect, test } from "@playwright/test";

test("i pallini della forma aprono il dettaglio della partita selezionata", async ({ page, baseURL }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.route("**/api/public/home", route => route.fulfill({ json: { matches: [] } }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const buttons = page.locator("#matchHubForm").getByRole("button");
  const dialog = page.getByRole("dialog");
  await expect(buttons).toHaveCount(5);

  const venezia = buttons.last();
  await venezia.focus();
  await venezia.press("Enter");
  await expect(dialog).toHaveAccessibleName("Juventus 4-0 Venezia");
  await expect(dialog).toContainText("Serie A");
  await expect(dialog).toContainText("Woltemade 53'");
  await expect(dialog.getByRole("link", { name: "Vai al tabellino" })).toHaveAttribute("href", "/partita?match_id=558521");
  await expect(dialog.locator("#matchHubFormGoals li")).toHaveCount(4);
  const centered = await dialog.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2) < 2
      && Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2) < 2
      && element.scrollWidth <= element.clientWidth;
  });
  expect(centered).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(venezia).toBeFocused();

  await buttons.first().click();
  await expect(dialog).toHaveAccessibleName("Genoa 2-0 Juventus");
  await expect(dialog).toContainText("Ehizibue 12'");
  const href = await dialog.getByRole("link", { name: "Vai al tabellino" }).getAttribute("href");
  const target = new URL(href, baseURL);
  expect(target.pathname).toBe("/partita");
  expect(target.searchParams.get("match_id")).toBe("558552");
  await dialog.getByRole("button", { name: "Chiudi dettaglio partita" }).click();
  await expect(dialog).not.toBeVisible();

  await venezia.click();
  await dialog.getByRole("link", { name: "Vai al tabellino" }).click();
  await expect(page).toHaveURL(/\/partita\?match_id=558521$/);
  await expect(page.locator("#matchDetail")).toContainText("Kolo Muani 71' (rig.)");
  await expect(page.getByRole("list", { name: "Cronologia della partita" })).toContainText("Woltemade");
});
