import {test,expect} from '@playwright/test';
const ago=days=>new Date(Date.now()-days*86400000).toISOString();
const news=[
  {id:'one',title:'Juventus in campo',body:'Allenamento della squadra.',category:'juventus',source:'Juventus.com',source_url:'https://www.juventus.com/it/news/test',created_at:ago(.2)},
  {id:'two',title:'Mercato Juventus',category:'mercato',source:'Sky Sport',source_url:'https://sport.sky.it/test',created_at:ago(3)},
  {id:'three',title:'Condizioni dei giocatori',category:'infortuni',source:'Juventus.com',source_url:'javascript:alert(1)',created_at:ago(40)},
  {id:'four',title:'Una notizia senza data',category:'juventus',source:'Sky Sport',source_url:'https://sport.sky.it/date'}
];
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/public/news?*',route=>route.fulfill({json:news}));
});
test('source, period and category combine and survive reload; reset restores results',async({page})=>{
  await page.goto('/news.html');
  await expect(page.locator('.news-item')).toHaveCount(4);
  await page.locator('#newsSource').selectOption('Sky Sport');
  await page.locator('#newsPeriod').selectOption('week');
  await page.getByRole('button',{name:'Mercato',exact:true}).click();
  await expect(page.locator('.news-item')).toHaveCount(1);
  await expect(page).toHaveURL(/categoria=calciomercato/);
  await expect(page).toHaveURL(/periodo=week/);
  await page.reload();
  await expect(page.locator('.news-item')).toHaveCount(1);
  await expect(page.locator('#newsSource')).toHaveValue('Sky Sport');
  await expect(page.locator('.news-item-actions').first()).toContainText('nuova scheda');
  await page.getByRole('button',{name:'Azzera filtri'}).click();
  await expect(page.locator('.news-item')).toHaveCount(4);
  await expect(page.locator('#newsSearch')).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('.news-item').nth(2).locator('h2 a')).toHaveAttribute('href','/community?news=three');
});
test('shared query and keyboard retry have usable focus and no leaked HTML',async({page})=>{
  await page.route('**/api/public/news?*',route=>route.fulfill({status:503,body:'<!doctype html> failure'}));
  await page.goto('/news.html?q=campo');
  await expect(page.locator('#newsRetry')).toBeVisible();
  await expect(page.locator('#newsStatus')).not.toContainText('doctype');
  await page.route('**/api/public/news?*',route=>route.fulfill({json:news}));
  await page.locator('#newsRetry').focus();await page.keyboard.press('Enter');
  await expect(page.locator('.news-item')).toHaveCount(1);
  await expect(page.locator('#newsSearch')).toBeFocused();
  await expect(page.locator('#newsList')).toHaveAttribute('aria-busy','false');
  await page.locator('#newsSearch').fill('nessuna');
  await expect(page.locator('#newsStatus')).toContainText('Nessuna notizia');
});
test('phone, tablet, desktop and light theme fit without clipped controls',async({page})=>{
  await page.goto('/news.html');
  await expect(page.locator('.news-item')).toHaveCount(4);
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'/tmp/icv-news-'+width+'.png'});
  }
  await page.locator('#pageTheme').click();
  await expect(page.locator('body')).toHaveClass(/light/);
  await expect(page.locator('.news-item h2 a').first()).toHaveCSS('color','rgb(23, 23, 23)');
  await expect(page.locator('.news-item-actions a').first()).toHaveCSS('color','rgb(129, 96, 12)');
  await page.screenshot({path:'/tmp/icv-news-light.png'});
});
