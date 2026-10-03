import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
});

test('approved wordmark fits desktop, iPad and phones with a visible match hub', async ({ page }) => {
  for (const [width, height] of [[1440,900],[820,1180],[390,844],[320,700]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', {name:'Il Calcio di Vince',exact:true})).toBeVisible();
    await expect(page.locator('.hero-season-link')).toHaveAttribute('href','/calendario-juventus');
    await expect(page.locator('.hero')).toHaveClass(/is-entering/);
    await page.waitForTimeout(2400);
    const layout = await page.evaluate(() => {
      const title = document.querySelector('.vince-wordmark').getBoundingClientRect();
      return {left:title.left,right:title.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,hub:document.querySelector('#homeDash').getBoundingClientRect().top,image:document.querySelector('.hero-stadium-img').naturalWidth};
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(layout.overflow).toBe(false);
    expect(layout.hub).toBeLessThan(height - (width < 600 ? 70 : 0));
    expect(layout.image).toBeGreaterThan(0);
    await page.locator('.hero-season-link').focus();
    expect(await page.locator('.hero-season-link').evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.locator('.hero-season-link').evaluate(el=>el.blur());
    await page.screenshot({path:`/tmp/vince-published-${width}.png`});
  }
});

test('reduced motion stays readable and stops a running title entrance', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('.hero')).not.toHaveClass(/is-entering/);
  expect(await page.locator('.hero-season-link').evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.reload();
  await expect(page.locator('.hero')).toHaveClass(/is-entering/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.hero')).not.toHaveClass(/is-entering/);
  expect(await page.locator('.vince-top b').first().evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(page.getByRole('heading',{name:'Il Calcio di Vince',exact:true})).toBeVisible();
});
