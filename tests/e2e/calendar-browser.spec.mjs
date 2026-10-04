import {expect,test} from '@playwright/test';
const fixtures=[
  ['20260917T190000Z','Europa League: Juventus - NEC Nijmegen','Europa League','1ª giornata'],
  ['20260920T160000Z','Juventus: Juventus 2-0 Atalanta','Serie A','5ª giornata\\nRisultato finale: Juventus 2-0 Atalanta'],
  ['20261011T184500Z','Serie A: Cagliari - Juventus','Serie A','6ª giornata\\nData e orario confermati.'],
  ['20261015T190000Z','Europa League: Celta Vigo - Juventus','Europa League','2ª giornata\\nDiretta: Sky.'],
  ['20261203T200000Z','Coppa Italia: Juventus - Sassuolo','Coppa Italia','Ottavi di finale\\nDiretta: Italia 1.'],
  ['20270117','Serie A: Juventus - Roma','Serie A','20ª giornata']
];
const ics='BEGIN:VCALENDAR\r\n'+fixtures.map(([date,title,category,description])=>'BEGIN:VEVENT\r\nDTSTART'+(date.length===8?';VALUE=DATE':'')+':'+date+'\r\nSUMMARY:'+title+'\r\nCATEGORIES:'+category+'\r\nDESCRIPTION:'+description+'\r\nEND:VEVENT').join('\r\n')+'\r\nEND:VCALENDAR';
test.beforeEach(async({page})=>{
  await page.route('https://**',r=>r.abort());
  await page.route('**/api/juventus/calendar.ics',r=>r.fulfill({body:ics,contentType:'text/calendar'}));
  await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});
});
test('calendar combines period, venue, competition and opponent filters',async({page})=>{
  await page.goto('/calendario-juventus.html');
  await expect(page.locator('#allPreview .match')).toHaveCount(4);
  await expect(page.locator('#nextMatch strong')).toHaveText('Cagliari - Juventus');
  await expect(page.locator('.next-match-referto')).toHaveAttribute('href',/home=Cagliari&away=Juventus/);
  await page.getByRole('button',{name:'Coppa Italia',exact:true}).click();
  await expect(page.locator('#coppaPreview .match')).toHaveCount(1);
  await expect(page.locator('#coppaPreview')).toContainText('Diretta Italia 1');
  await page.locator('#calendarVenue').selectOption('away');
  await expect(page.locator('#coppaPreview')).toContainText('Nessuna partita');
  await page.getByRole('button',{name:'Ripristina i filtri'}).click();
  await page.locator('#calendarOpponent').fill('CELTA');
  await expect(page.locator('#allPreview .match')).toHaveCount(1);
  await expect(page.locator('#allPreview')).toContainText('Diretta Sky');
  await page.locator('#calendarOpponent').fill('');
  await page.locator('#calendarPeriod').selectOption('finished');
  await expect(page.locator('#allPreview .match')).toHaveCount(1);
  await expect(page.locator('#allPreview')).toContainText('Juventus 2-0 Atalanta');
  await expect(page.locator('#allPreview .match-detail-link')).toHaveAttribute('href',/home=Juventus&away=Atalanta/);
});
test('all-day uncertainty, keyboard controls and responsive layouts',async({page})=>{
  await page.goto('/calendario-juventus.html#coppa-italia');
  await expect(page.getByRole('button',{name:'Coppa Italia',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Ripristina i filtri'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#allPreview')).toContainText('Orario da confermare');
  await expect(page.locator('#allPreview')).not.toContainText('Diretta DAZN');
  await page.locator('#calendarPeriod').selectOption('all');
  await expect(page.locator('#allPreview')).toContainText('Esito non disponibile');
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.page-header nav>a').evaluateAll(links=>links.every(link=>link.scrollWidth<=link.clientWidth))).toBe(true);
    await page.locator('#main-content').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/tmp/icv-calendar-'+width+'.png',fullPage:false});
  }
});
test('failed calendar exposes a working retry and preserves subscription destinations',async({page})=>{
  await page.route('**/api/juventus/calendar.ics',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/calendario-juventus.html');
  await expect(page.locator('#calendarRetry')).toBeVisible();
  await page.route('**/api/juventus/calendar.ics',r=>r.fulfill({body:ics,contentType:'text/calendar'}));
  await page.locator('#calendarRetry').click();
  await expect(page.locator('#allPreview .match')).toHaveCount(4);
  await expect(page.locator('#calendarRetry')).toBeHidden();
  expect(await page.evaluate(()=>publicCalendarUrl)).toBe('https://ilcalciodivince.com/api/juventus/calendar.ics');
});
