import { test, expect } from '@playwright/test';
const data = { player: { name: 'Donnarumma', updated_at: '2026-10-04T12:00:00Z' }, news: [{ title: 'Notizia sul giocatore', source_url: 'https://example.com/news', source: 'Fonte', created_at: '2026-10-04' }], market: [{ note: 'Aggiornamento mercato', source_url: 'javascript:alert(1)', updated_at: '2026-10-03' }], discussions: [] };
test.beforeEach(async ({ page }) => {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/public/players/**', route => route.fulfill({ json: data }));
});
test('player tabs support keyboard, shared hash and metric links', async ({ page }) => {
  await page.goto('/giocatore.html?slug=donnarumma#news');
  await expect(page.getByRole('tab', { name: 'News', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'News', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Notizia sul giocatore/ })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('tab', { name: 'News', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mercato', exact: true })).toBeFocused();
  await expect(page.locator('#marketList a')).not.toHaveAttribute('href', /javascript:/);
  await page.keyboard.press('Home');
  await expect(page.getByRole('link', { name: '1 Notizie collegate' })).toBeVisible();
  await page.getByRole('link', { name: '1 Notizie collegate' }).click();
  await expect(page.getByRole('tab', { name: 'News', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'News', exact: true })).toHaveAttribute('aria-selected', 'true');
});
test('temporary failure retries and missing profiles offer search', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/public/players/**', route => ++attempts === 1 ? route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Server Error</h1>' }) : route.fulfill({ json: data }));
  await page.goto('/giocatore.html?slug=donnarumma');
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Server Error');
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('heading', { name: 'Donnarumma', exact: true })).toBeVisible();
  await page.route('**/api/public/players/**', route => route.fulfill({ status: 404, json: { error: 'Missing' } }));
  await page.goto('/giocatore.html?slug=missing');
  await expect(page.getByRole('button', { name: 'Riprova' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Cerca un giocatore' })).toBeVisible();
  await page.goto('/giocatore.html');
  await expect(page.getByRole('heading', { name: 'Scegli un giocatore' })).toBeVisible();
});
test('player content and tabs fit narrow screens and long names', async ({ page }) => {
  await page.route('**/api/public/players/**', route => route.fulfill({ json: { ...data, player: { name: 'Francisco Conceicao' } } }));
  await page.goto('/giocatore.html?slug=conceicao');
  await expect(page.getByRole('heading', { name: 'Francisco Conceicao' })).toBeVisible();
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/icv-player-${width}.png` });
  }
});
