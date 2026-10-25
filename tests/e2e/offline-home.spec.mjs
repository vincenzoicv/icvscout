import {test,expect} from '@playwright/test';

test('installed PWA retains its home styles and calendar when offline',async({page,context})=>{
  await page.route('https://**',route=>route.abort());
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match('/assets/home-20261025.min.css'))).toBe(true);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toContainText('Vince');
  await expect.poll(()=>page.locator('.vince-top').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Bebas Neue');
  await expect(page.locator('#homeSyncMessage')).toContainText('Sei offline');
  const response=await page.goto('/calendario-juventus.html',{waitUntil:'domcontentloaded'});
  expect(response.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Calendario');
});
