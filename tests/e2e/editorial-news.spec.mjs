import {expect,test} from '@playwright/test';

const news=[
  {id:1,title:'Le condizioni di Conceicao',body:'Aggiornamento del club.',category:'infortuni',source:'Juventus.com',source_url:'https://www.juventus.com/it/news/',created_at:'2026-10-03T12:00:00Z',related_players:[{name:'Conceicao',slug:'conceicao'}]},
  {id:2,title:'Donnarumma: le novita sul contratto',body:'Dettagli del contratto.',category:'calciomercato',source:'Sky Sport',source_url:'https://sport.sky.it/calcio',created_at:'2026-10-02T12:00:00Z'},
  {id:3,title:'Amichevole Juventus-Cremonese',body:'Amichevole Juventus-Cremonese',category:'juventus',source:'Juventus.com',source_url:'javascript:alert(1)',created_at:'invalid'},
];
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/**',route=>route.fulfill({json:{}}));
  await page.route('**/api/public/news?*',route=>route.fulfill({json:news}));
  await page.route('**/api/public/home',route=>route.fulfill({json:{news,market:[],matches:[],social:[]}}));
});

test('News combines category and accent-insensitive search, with safe source links',async({page})=>{
  await page.goto('/news');
  await expect(page.locator('.news-item')).toHaveCount(3);
  await expect(page.locator('.news-lead')).toHaveCount(1);
  await expect(page.locator('.news-item').nth(2).locator('p')).toHaveCount(0);
  await expect(page.locator('.news-item').nth(2).getByRole('link',{name:'Amichevole Juventus-Cremonese',exact:true})).toHaveAttribute('href','/community?news=3');
  await expect(page.getByRole('link',{name:'Le condizioni di Conceicao',exact:true})).toHaveAttribute('rel','noopener noreferrer');
  const market=page.getByRole('button',{name:'Mercato',exact:true});
  await market.focus();await page.keyboard.press('Enter');
  await expect(market).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.news-item')).toHaveCount(1);
  await page.getByRole('searchbox').fill('Conceicao');
  await expect(page.locator('.news-item')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Nessuna notizia');
  await page.getByRole('button',{name:'Tutte',exact:true}).click();
  await page.getByRole('searchbox').fill('Conceiçao');
  await expect(page.locator('.news-item')).toHaveCount(1);
});

test('News recovers from a failed request and handles empty data',async({page})=>{
  let requests=0;
  await page.route('**/api/public/news?*',route=>++requests===1?route.fulfill({status:503,body:'unavailable'}):route.fulfill({json:[]}));
  await page.goto('/news');
  await expect(page.getByRole('button',{name:'Riprova',exact:true})).toBeVisible();
  await expect(page.locator('#newsList')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Riprova',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Non ci sono notizie');
  await expect(page.locator('#newsCount')).toHaveText('0 notizie');
});

test('News hierarchy and home headlines fit all viewports and both themes',async({page})=>{
  for(const [width,height] of [[1440,900],[820,1180],[390,844],[320,700]]){
    await page.setViewportSize({width,height});
    await page.goto('/news');await expect(page.locator('.news-item')).toHaveCount(3);
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/icv-news-${width}.png`,fullPage:true});
    const wasLight=await page.locator('body').evaluate(el=>el.classList.contains('light'));
    await page.getByRole('button',{name:'Cambia tema'}).click();
    expect(await page.locator('body').evaluate(el=>el.classList.contains('light'))).toBe(!wasLight);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto('/');
    await expect(page.locator('.home-news-story')).toHaveCount(3);
    await expect(page.locator('.home-news-story').first().getByRole('link',{name:'Scheda Conceicao'})).toHaveAttribute('href','/giocatore?slug=conceicao');
    await page.locator('#homeNewsList').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.home-news-panel').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
    await expect(page.locator('.home-news-story').first().locator('h3')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/icv-news-home-${width}.png`});
  }
});

test('the shared primary brand and menus stay reachable on internal pages',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [1440,820,320]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/news','/media','/classifica','/calendario-juventus','/partita?match_id=558595','/cerca','/mercato','/grafiche','/giocatore?slug=donnarumma']){
      await page.goto(path);
      await expect(page.locator('.page-brand strong')).toHaveText('Il Calcio di Vince');
      await expect(page.locator('.page-brand')).toBeVisible();
      await expect(page.locator('#pageTheme')).toBeVisible();
      const brand=await page.locator('.page-brand').boundingBox();
      expect(brand.x+brand.width).toBeLessThanOrEqual(width);
      await page.locator('.classifica-menu summary').focus();
      await page.keyboard.press('Enter');
      const europe=page.locator('.classifica-menu').getByRole('link',{name:'Europa League',exact:true});
      await expect(europe).toBeVisible();
      expect(await europe.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('.classifica-menu')).not.toHaveAttribute('open');
      await page.locator('.page-header nav>a').last().focus();
      await expect(page.locator('.page-header nav>a').last()).toHaveAttribute('href','/cerca');
    }
  }
});
