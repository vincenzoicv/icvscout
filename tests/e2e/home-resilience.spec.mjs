import {test,expect} from '@playwright/test';

const home={news:[{id:1,title:'Notizia verificata',body:'Contenuto disponibile.',source:'Juventus.com',source_url:'https://www.juventus.com/it/news/test'}],matches:[],market:[],social:[],live_desk:[]};

test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/**',route=>route.fulfill({json:[]}));
});

test('failed refresh keeps loaded news and retry restores the healthy state',async({page})=>{
  let failing=false;
  await page.route('**/api/public/home',route=>route.fulfill(failing?{status:503,json:{error:'Unavailable'}}:{json:home}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#homeNewsList')).toContainText('Notizia verificata');
  failing=true;
  await page.evaluate(()=>loadHomeDashboard());
  await expect(page.locator('#homeSyncMessage')).toContainText('Dati conservati');
  await expect(page.locator('#homeNewsList')).toContainText('Notizia verificata');
  await expect(page.locator('#homeSyncRetry svg')).toHaveCount(1);
  failing=false;
  await page.locator('#homeSyncRetry').click();
  await expect(page.locator('#homeSyncStatus')).toBeHidden();
  await expect(page.locator('#homeNewsList')).toContainText('Notizia verificata');
});

test('first load error offers a keyboard-accessible retry without horizontal overflow',async({page})=>{
  await page.route('**/assets/icv-stories.css*',route=>route.abort());
  await page.route('**/api/public/home',route=>route.fulfill({status:503,json:{}}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#homeSyncMessage')).toContainText('Aggiornamento non riuscito');
  await expect(page.locator('#homeSyncMessage')).not.toContainText('Dati conservati');
  await page.locator('#homeSyncRetry').focus();
  await expect(page.locator('#homeSyncRetry')).toBeFocused();
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
});

test('requests are deduplicated and a stalled response times out',async({page})=>{
  let requests=0;
  await page.clock.install();
  await page.route('**/api/public/home',async route=>{requests++;await route.fulfill({json:home});});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#homeNewsList')).toContainText('Notizia verificata');
  await page.route('**/api/public/home',()=>{requests++;});
  await page.evaluate(()=>{loadHomeDashboard();loadHomeDashboard();});
  await expect.poll(()=>requests).toBe(2);
  await page.clock.fastForward(12001);
  await expect(page.locator('#homeSyncMessage')).toContainText('Dati conservati');
  await expect(page.locator('#homeSyncRetry')).toBeEnabled();
});

test('connection recovery retries automatically and clears the offline notice',async({page})=>{
  let failing=true;
  await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
  await page.route('**/api/public/home',route=>route.fulfill(failing?{status:503,json:{}}:{json:home}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#homeSyncMessage')).toContainText('Sei offline');
  failing=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('#homeSyncStatus')).toBeHidden();
  await expect(page.locator('#homeNewsList')).toContainText('Notizia verificata');
});

test('install invitation respects privacy, native availability and focused fields',async({page})=>{
  await page.route('**/api/public/home',route=>route.fulfill({json:home}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  expect(await page.evaluate(()=>canAutoOpenInstallCard())).toBe(false);
  await page.evaluate(()=>{
    window.ICVPrivacy={get:()=>({updated_at:new Date().toISOString()})};
    deferredInstallPrompt={prompt(){},userChoice:Promise.resolve({outcome:'dismissed'})};
    window.matchMedia=()=>({matches:false});
    localStorage.removeItem(installPromptDismissKey);
    document.querySelectorAll('.icv-cookie-banner,.icv-privacy-layer,#iubenda-cs-banner').forEach(e=>e.remove());
  });
  expect(await page.evaluate(()=>canAutoOpenInstallCard())).toBe(true);
  await page.evaluate(()=>{
    const blocker=document.createElement('div');blocker.id='iubenda-cs-banner';blocker.textContent='Scelte privacy';document.body.append(blocker);
  });
  expect(await page.evaluate(()=>canAutoOpenInstallCard())).toBe(false);
  await page.evaluate(()=>{
    document.querySelector('#iubenda-cs-banner').remove();
    const input=document.createElement('input');document.body.append(input);input.focus();
  });
  expect(await page.evaluate(()=>canAutoOpenInstallCard())).toBe(false);
});

test('manual install panel closes with Escape and restores focus',async({page})=>{
  await page.route('**/api/public/home',route=>route.fulfill({json:home}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.querySelectorAll('.icv-cookie-banner,.icv-privacy-layer,#iubenda-cs-banner').forEach(e=>e.remove()));
  await page.locator('#installAppBtn').click();
  await expect(page.locator('.install-close')).toBeFocused();
  await expect(page.locator('#installCard')).toHaveAttribute('aria-hidden','false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#installCard')).toBeHidden();
  await expect(page.locator('#installAppBtn')).toBeFocused();
});
