import {test,expect} from '@playwright/test';
const photo={url:'/assets/icv-logo-160.jpg',caption:'Foto Juventus',width:160,height:160};
const data={conferences:[
  {id:1,title:'Conferenza Juventus Atalanta',phase:'post',published_at:'2026-09-20T19:00:00Z',post_url:'https://www.instagram.com/reel/TestOne/'},
  {id:2,title:'Conferenza Juventus NEC',phase:'pre',published_at:'2026-09-16T12:00:00Z',post_url:'https://www.instagram.com/reel/TestTwo/'}
],albums:[
  {id:1,title:'Juventus Atalanta',date:'2026-09-20',photos:[photo,photo]},
  {id:2,title:'Juventus NEC',date:'2026-09-17',photos:[photo]}
]};
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/public/media',route=>route.fulfill({json:data}));
});
test('media combines type, title and order and restores shared URL',async({page})=>{
  await page.goto('/media.html');
  await expect(page.locator('#mediaStatus')).toHaveText('5 contenuti');
  await page.getByRole('button',{name:'Foto (2)',exact:true}).click();
  await expect(page.locator('[data-media-section="sala-stampa"]')).toBeHidden();
  await page.locator('#mediaOrder').selectOption('oldest');
  await expect(page.locator('.album-card').first()).toContainText('NEC');
  await page.getByRole('searchbox',{name:'Cerca nei media'}).fill('Atalanta');
  await expect(page.locator('.album-card')).toHaveCount(1);
  await expect(page.locator('#mediaStatus')).toHaveText('1 contenuto');
  await page.reload();
  await expect(page.locator('.album-card')).toHaveCount(1);
  await expect(page.locator('#mediaOrder')).toHaveValue('oldest');
  await page.getByRole('button',{name:'Azzera filtri'}).click();
  await expect(page.locator('#mediaSearch')).toBeFocused();
  await expect(page.locator('#mediaStatus')).toHaveText('5 contenuti');
  await expect(page.locator('iframe')).toHaveCount(0);
});
test('album opens keyboard gallery and filtering clears the selected album',async({page})=>{
  await page.goto('/media.html#foto');
  await page.getByRole('button',{name:'Apri album Juventus Atalanta',exact:true}).click();
  await expect(page.locator('#matchGalleryHeading')).toBeFocused();
  await page.getByRole('button',{name:/Apri foto 1 di 2/}).click();
  await expect(page.locator('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#matchPhotoPosition')).toHaveText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toBeHidden();
  await expect(page.getByRole('button',{name:/Apri foto 1 di 2/})).toBeFocused();
  await page.locator('#mediaSearch').fill('non esiste');
  await expect(page.locator('#mediaEmpty')).toBeVisible();
  await expect(page.locator('#matchGallery')).toBeHidden();
});
test('media retry restores keyboard focus and previews fallback without loading external players',async({page})=>{
  await page.route('**/api/public/media',route=>route.fulfill({status:503,body:'<!doctype html> failure'}));
  await page.goto('/media.html');
  await expect(page.locator('#mediaError')).toBeVisible();
  await page.route('**/api/public/media',route=>route.fulfill({json:data}));
  await page.locator('#mediaRetry').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#mediaStatus')).toHaveText('5 contenuti');
  await expect(page.locator('#mediaSearch')).toBeFocused();
  await expect(page.locator('#mediaError')).toBeHidden();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.locator('.album-card img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
});
test('controls and real media areas fit on phone, tablet and desktop',async({page})=>{
  await page.goto('/media.html#foto');
  await expect(page.locator('.album-card')).toHaveCount(2);
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'/tmp/icv-media-'+width+'.png'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Apri album Juventus Atalanta',exact:true}).click();
  await expect(page.locator('#matchGalleryHeading')).toBeFocused();
});
