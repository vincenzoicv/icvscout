import { expect, test } from '@playwright/test';
const players = [
  { name: 'Donnarumma', slug: 'donnarumma', news_count: 2, market: [{ updated_at: '2026-10-04' }] },
  { name: 'Conceicao', slug: 'conceicao', aliases: ['Conceicao', 'Francisco'], news_count: 5, market: [{ updated_at: '2026-10-02' }] },
  { name: 'Locatelli', slug: 'locatelli', news_count: 1, market: [] }
];
test.beforeEach(async ({ page }) => {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/public/players?**', route => route.fulfill({ json: players }));
});
test('index searches names and aliases and shares sorting', async ({ page }) => {
  await page.goto('/giocatori.html');
  await expect(page.locator('.player-index-row')).toHaveCount(3);
  await expect(page.locator('.player-index-row').first()).toContainText('Donnarumma');
  await page.getByLabel('Ordine', { exact: true }).selectOption('news');
  await expect(page.locator('.player-index-row').first()).toContainText('Conceicao');
  await page.getByRole('searchbox').fill('Francisco');
  await expect(page.locator('.player-index-row')).toHaveCount(1);
  await expect(page.locator('.player-index-row')).toHaveAttribute('href', '/giocatore?slug=conceicao');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('Francisco');
  await expect(page.getByLabel('Ordine', { exact: true })).toHaveValue('news');
  await page.getByRole('button', { name: 'Azzera filtri' }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.locator('.player-index-row')).toHaveCount(3);
  await page.getByRole('searchbox').fill('Nessuno');
  await expect(page.locator('#playerIndexList')).toContainText('Nessun profilo corrisponde');
});
test('index retries server failures without exposing markup', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/public/players?**', route => ++requests === 1 ? route.fulfill({ status: 503, body: '<h1>Server error</h1>' }) : route.fulfill({ json: players }));
  await page.goto('/giocatori.html');
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();
  await page.getByRole('button', { name: 'Riprova' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.player-index-row')).toHaveCount(3);
  await expect(page.locator('#playerIndexError')).toBeHidden();
});
test('index fits phone tablet and desktop', async ({ page }) => {
  await page.goto('/giocatori.html');
  await expect(page.locator('.player-index-row')).toHaveCount(3);
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/icv-player-index-${width}.png` });
  }
});
