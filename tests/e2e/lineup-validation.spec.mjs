import {test,expect} from '@playwright/test';
const names=['Vicario','Gatti','Bremer','Kelly','Kalulu','Douglas Luiz','Koopmeiners','Celik','McKennie','Woltemade','Kolo Muani'];
const positions=[[0,7.4],[3.1,4.5],[0,4.5],[-3.1,4.5],[4.5,.8],[1.5,.8],[-1.5,.8],[-4.5,.8],[0,-2.8],[-2,-5.7],[2,-5.7]];
const registry={formation:{module:'3-4-1-2',source:'Sky Sport',source_url:'https://sport.sky.it/calcio',updated_at:'2026-10-21T20:00:00Z',players:names.map((name,i)=>({name,x:positions[i][0],z:positions[i][1]}))}};
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/**',route=>route.abort());
  await page.goto('/',{waitUntil:'domcontentloaded'});
});
test('long names fit their 3D labels on small and large screens',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(data=>renderMatchHubProbable(data,true),registry);
  await expect(page.locator('.lineup-projected-label')).toHaveCount(11);
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:1000});
    await page.locator('#matchHubProbable').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.lineup-projected-label').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1))).toBe(true);
    await page.locator('#matchHubProbable').screenshot({path:`/tmp/icv-lineup-names-${width}.png`});
  }
});
test('lineup exposes a safe source link and rejects duplicate or extra players',async({page})=>{
  await page.evaluate(data=>renderMatchHubProbable(data,true),registry);
  const source=page.locator('#matchHubProbableNote a');
  await expect(source).toHaveAttribute('href',registry.formation.source_url);
  await expect(source).toHaveAttribute('rel','noopener noreferrer');
  await source.focus();await expect(source).toBeFocused();
  for(const kind of ['duplicate','extra','unsafe']){
    await page.evaluate(({data,kind})=>{
      if(kind==='duplicate')data.formation.players[1].name=data.formation.players[0].name;
      if(kind==='extra')data.formation.players.push(data.formation.players[0]);
      if(kind==='unsafe')data.formation.source_url='javascript:alert(1)';
      renderMatchHubProbable(data,true);
    },{data:registry,kind});
    if(kind==='unsafe')await expect(source).toHaveCount(0);
    else await expect(page.locator('#matchHubProbable')).toBeHidden();
  }
});
