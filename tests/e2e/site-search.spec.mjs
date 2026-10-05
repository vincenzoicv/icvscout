import {expect,test} from '@playwright/test';
const results=[
  {type:'news',title:'Notizia Juventus',summary:'Aggiornamento dal club.',date:'2026-10-03T12:00:00Z',href:'https://www.juventus.com/it/news/test'},
  {type:'match',title:'Juventus - Atalanta',summary:'Serie A · Finale 2-0',date:'2026-09-20T16:00:00Z',href:'/partita?match_id=558595'},
  {type:'player',title:'Bremer',summary:'Scheda giocatore',href:'/giocatore?slug=bremer'},
  {type:'market',title:'Mercato Juventus',summary:'Notizia di mercato',href:'/mercato'},
  {type:'social',title:'Social Juventus',summary:'Post dal campo',href:'https://www.instagram.com/p/test/'}
];
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/public/search?*',route=>route.fulfill({json:{results}}));
});
test('search filters results, dates and external sources and shares its active filter',async({page})=>{
  await page.goto('/cerca.html?q=Juventus');
  await expect(page.locator('.search-result')).toHaveCount(5);
  await expect(page.locator('.search-result').first()).toContainText('3 ott 2026');
  await expect(page.locator('.search-result').first()).toHaveAttribute('target','_blank');
  await expect(page.locator('.search-result').first()).toContainText('nuova scheda');
  await page.getByRole('button',{name:'Partite (1)',exact:true}).click();
  await expect(page.locator('.search-result')).toHaveCount(1);
  await expect(page).toHaveURL(/tipo=match/);
  await expect(page.locator('.search-result')).not.toHaveAttribute('target','_blank');
  await page.reload();
  await expect(page.getByRole('button',{name:'Partite (1)'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.locator('#siteSearchInput').fill('Atalanta');
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.getByRole('button',{name:'Partite (1)'})).toHaveAttribute('aria-pressed','true');
  await expect(page).toHaveURL(/tipo=match/);
  await expect(page.locator('.search-result')).toHaveCount(1);
});
test('context links connect search to the player archive and market',async({page})=>{
  await page.route('**/api/public/players?**',route=>route.fulfill({json:[{name:'Bremer',slug:'bremer',market:[],news_count:1}]}));
  await page.route('**/api/public/home',route=>route.fulfill({json:{market:[]}}));
  await page.goto('/cerca.html');
  const nav=page.getByRole('navigation',{name:'Archivi ICV'});
  await nav.getByRole('link',{name:'Giocatori',exact:true}).click();
  await expect(page).toHaveURL(/\/giocatori/);
  await expect(page.locator('.player-index-row')).toContainText('Bremer');
  await expect(nav.getByRole('link',{name:'Giocatori',exact:true})).toHaveAttribute('aria-current','page');
  await nav.getByRole('link',{name:'Mercato',exact:true}).click();
  await expect(page).toHaveURL(/\/mercato/);
  await expect(page.locator('#marketStatus')).toContainText('0 di 0');
  await expect(nav.getByRole('link',{name:'Mercato',exact:true})).toHaveAttribute('aria-current','page');
});
test('failed response exposes keyboard retry and unsafe links are excluded',async({page})=>{
  await page.route('**/api/public/search?*',route=>route.fulfill({status:503,body:'<!DOCTYPE html> upstream'}));
  await page.goto('/cerca.html?q=Juventus');
  await expect(page.locator('#searchRetry')).toBeVisible();
  await expect(page.locator('#searchStatus')).not.toContainText('DOCTYPE');
  await page.route('**/api/public/search?*',route=>route.fulfill({json:{results:[...results,{type:'news',title:'Unsafe',href:'javascript:alert(1)'},{type:'news',title:'Missing URL'}]}}));
  await page.locator('#searchRetry').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.search-result')).toHaveCount(5);
  await expect(page.locator('#searchRetry')).toBeHidden();
  await expect(page.locator('#searchStatus')).toBeFocused();
  await expect(page.locator('#searchResults')).toHaveAttribute('aria-busy','false');
});
test('latest search wins even when the previous response arrives late',async({page})=>{
  let release;const held=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/public/search?*',async route=>{
    if(new URL(route.request().url()).searchParams.get('q')==='prima')await held;
    await route.fulfill({json:{results:[{...results[0],title:route.request().url().includes('seconda')?'Seconda ricerca':'Prima ricerca'}]}}).catch(()=>{});
  });
  await page.goto('/cerca.html?q=prima');
  await page.locator('#siteSearchInput').fill('seconda');
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.locator('.search-result')).toContainText('Seconda ricerca');
  release();
  await expect(page.locator('.search-result')).not.toContainText('Prima ricerca');
});
test('empty states, history and phone/tablet widths remain usable',async({page})=>{
  await page.goto('/cerca.html');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await page.locator('#siteSearchInput').fill('Juventus');
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.locator('.search-result')).toHaveCount(5);
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'/tmp/icv-search-'+width+'.png',fullPage:false});
  }
  await page.goBack();
  await expect(page.locator('#siteSearchInput')).toHaveValue('');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await page.route('**/api/public/search?*',route=>route.fulfill({json:{results:[]}}));
  await page.locator('#siteSearchInput').fill('Nessuno');
  await page.getByRole('button',{name:'Cerca',exact:true}).click();
  await expect(page.locator('#searchStatus')).toContainText('Nessun risultato');
  await expect(page.locator('#searchFilters')).toBeHidden();
});
