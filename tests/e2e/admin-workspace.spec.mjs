import { test, expect } from '@playwright/test';

async function workspace(page) {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/admin/**', route => route.abort());
  await page.goto('/icv_admin.html');
  await page.evaluate(() => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    state.runs = [{type:'instagram_import',status:'error',created_at:new Date().toISOString()}];
    state.drafts = [{id:1,title:'Esempio di notizia da verificare prima della pubblicazione',body:'Testo dimostrativo per controllare la leggibilita della coda editoriale. Nessun contenuto reale viene modificato.',reliability:'trusted',review_status:'pending',source_name:'Fonte dimostrativa',created_at:new Date().toISOString()}];
    render();
  });
}

test('recent Instagram failure is never presented as a successful import', async ({page}) => {
  await workspace(page);
  await expect(page.locator('#adminAlerts .admin-alert-danger')).toContainText('Import Instagram non riuscito');
  await expect(page.locator('#adminAlerts')).not.toContainText('Instagram aggiornato');
  await page.evaluate(() => {state.runs[0].status='success';renderAdminAlerts();});
  await expect(page.locator('#adminAlerts .admin-alert-ok')).toContainText(['Instagram aggiornato']);
});

test('desktop buttons and mobile section picker stay synchronized', async ({page}) => {
  await workspace(page);
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Pubblicate',exact:true}).click();
  await expect(page.locator('#adminNav button[data-tab="published"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#adminSection')).toHaveValue('published');
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Sezione',{exact:true}).selectOption('sources');
  await expect(page.locator('[data-panel="sources"]')).toBeVisible();
  await expect(page.locator('#adminNav button[data-tab="sources"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-panel="published"]').first()).toBeHidden();
});

test('admin dashboard fits phone tablet and desktop without changing real data', async ({page}) => {
  await workspace(page);
  for (const width of [320,820,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/icv-admin-${width}.png`,fullPage:true});
    const columns = await page.locator('.stats').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width===320 ? 2 : width===820 ? 3 : 5);
  }
});
