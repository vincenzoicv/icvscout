import { expect, test } from '@playwright/test';
const rows = [
  ...Array.from({ length: 6 }, (_, i) => ({ player_name: 'Giocatore ' + i, note: 'Interesse Juventus', direction: 'incoming', deal_stage: 'interest', source_name: 'Sky Sport', updated_at: `2026-10-0${i + 1}T10:00:00Z`, source_url: 'https://sport.sky.it/calcio' })),
  { player_name: 'Locatelli', note: 'Rinnovo', direction: 'renewal', deal_stage: 'negotiation', source_name: 'Juventus', updated_at: '2026-10-04T12:00:00Z' },
  { player_name: 'Uscita', note: 'Cessione ufficiale', direction: 'outgoing', deal_stage: 'official', source_name: 'Juventus', updated_at: '2026-10-03T12:00:00Z', source_url: 'javascript:alert(1)' },
  { player_name: 'Scenario', note: 'Ipotesi', direction: 'scenario', deal_stage: 'interest', updated_at: '2026-10-01T10:00:00Z' }
];
test.beforeEach(async ({ page }) => {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/public/home', route => route.fulfill({ json: { market: rows } }));
});
test('market displays all groups and combines shareable filters', async ({ page }) => {
  await page.goto('/mercato.html');
  await expect(page.locator('.deal-card')).toHaveCount(9);
  await expect(page.getByRole('heading', { name: 'Rinnovi', exact: true })).toBeVisible();
  await expect(page.locator('.source-line a[href^="javascript:"]')).toHaveCount(0);
  await page.getByLabel('Direzione', { exact: true }).selectOption('incoming');
  await expect(page.locator('.deal-card')).toHaveCount(6);
  await expect(page.locator('.deal-card').first()).toContainText('Giocatore 5');
  await page.getByRole('searchbox').fill('Sky');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('Sky');
  await expect(page.getByLabel('Direzione', { exact: true })).toHaveValue('incoming');
  await expect(page.locator('.deal-card')).toHaveCount(6);
  await page.getByLabel('Stato', { exact: true }).selectOption('official');
  await expect(page.locator('.deal-card')).toHaveCount(0);
  await expect(page.locator('#marketGroups')).toContainText('Nessuna operazione corrisponde');
  await page.getByRole('button', { name: 'Azzera filtri' }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.locator('.deal-card')).toHaveCount(9);
});
test('market rejects bad responses and retries using keyboard', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/public/home', route => ++attempts === 1 ? route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Server error</h1>' }) : route.fulfill({ json: { market: rows } }));
  await page.goto('/mercato.html');
  await expect(page.locator('#marketError')).toBeVisible();
  await expect(page.locator('#marketGroups')).not.toContainText('Server error');
  await page.getByRole('button', { name: 'Riprova' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.deal-card')).toHaveCount(9);
  await expect(page.locator('#marketError')).toBeHidden();
});
test('market controls and cards fit mobile tablet and desktop', async ({ page }) => {
  await page.goto('/mercato.html?q=Giocatore');
  await expect(page.locator('.deal-card')).toHaveCount(6);
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/icv-market-${width}.png` });
  }
});
