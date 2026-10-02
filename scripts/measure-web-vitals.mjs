import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.ICV_PERF_URL || 'https://ilcalciodivince.com';
const output = process.env.ICV_PERF_OUTPUT || '/tmp/icv-web-vitals.json';
const bundle = await build({stdin:{contents:"import {onLCP,onCLS,onINP} from 'web-vitals';window.__vitals={};for(const observe of [onLCP,onCLS,onINP])observe(m=>window.__vitals[m.name]={value:m.value,rating:m.rating},{reportAllChanges:true});",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const browser = await chromium.launch({headless:true});
const samples = [];
try {
  for (const viewport of [{width:390,height:844},{width:1365,height:900}]) {
    for (let run=1;run<=3;run++) {
      const context = await browser.newContext({viewport});
      await context.addCookies([{name:'icv_internal_traffic',value:'1',url:base}]);
      const page = await context.newPage();
      await page.route('**/api/analytics',route=>route.abort());
      await page.addInitScript(bundle.outputFiles[0].text);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1600000,uploadThroughput:750000});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(3000);
      const theme = page.getByRole('button',{name:/cambia tema/i}).first();
      await theme.click();await page.waitForTimeout(500);await theme.click();
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(()=>window.__vitals);
      samples.push({viewport,run,metrics,interaction:'Two theme toggles',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      await context.close();
    }
  }
} finally { await browser.close(); }
await mkdir(new URL('.', 'file://'+output).pathname,{recursive:true});
await writeFile(output,JSON.stringify({measured_at:new Date().toISOString(),url:base,method:'Cold cache, 40ms network latency, 1.6MB/s down, CPU 4x; three samples per viewport. Lab data, not field percentiles.',samples},null,2));
console.log(JSON.stringify(samples,null,2));
