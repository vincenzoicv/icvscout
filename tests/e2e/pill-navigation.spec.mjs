import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
});
test('shared navigation keeps links, current page and keyboard dropdown',async({page})=>{
  await page.goto('/cerca.html');
  const nav=page.getByRole('navigation',{name:'Menu principale'});
  await expect(nav).toHaveClass(/icv-pill-nav/);
  await expect(nav.getByRole('link',{name:'Cerca',exact:true})).toHaveAttribute('aria-current','page');
  await expect(nav.getByRole('link',{name:'Calendario'})).toHaveAttribute('href','/calendario-juventus');
  const summary=nav.locator('summary');
  await summary.focus();await page.keyboard.press('Enter');
  await expect(nav.getByRole('link',{name:'Serie A',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary).toBeFocused();
  await expect(nav.locator('details')).not.toHaveAttribute('open','');
  await summary.click();await page.locator('h1').click();
  await expect(nav.locator('details')).not.toHaveAttribute('open','');
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await nav.getByRole('link',{name:'Calendario'}).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:'/tmp/icv-pill-'+width+'.png'});
  }
});
test('home indicator follows pointer and reduced motion is static',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const nav=page.getByRole('navigation',{name:'Menu principale'});
  await expect(nav.getByRole('button',{name:'Home',exact:true})).toHaveClass(/icv-pill-target/);
  await nav.getByRole('link',{name:'Calendario'}).hover();
  await expect(nav.getByRole('link',{name:'Calendario'})).toHaveClass(/icv-pill-target/);
  await page.mouse.move(0,300);
  await expect(nav.getByRole('button',{name:'Home',exact:true})).toHaveClass(/icv-pill-target/);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await nav.locator('.icv-pill-indicator').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.screenshot({path:'/tmp/icv-pill-home.png'});
  await page.setViewportSize({width:390,height:844});
  await expect(nav).toBeHidden();
  await expect(page.locator('.mob-nav')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
