import {expect,test} from '@playwright/test';
const match={match_id:'558595',community_key:'32',home:'Juventus FC',away:'Atalanta BC',date:'2026-09-20T16:00:00Z',status:'finished',competition:'Serie A',matchday:5,homeScore:2,awayScore:0,goals:[],homeLineup:[],awayLineup:[]};
const photo={id:'photo1',caption:'Juventus-Atalanta',width:640,height:480,url:'/assets/icv-logo-160.jpg'};
const content={community_key:'32',highlights:{title:'Juventus 2 Atalanta 0',video_id:'5bg04FuSCmM'},conferences:[],albums:[{id:'album1',title:'Juventus-Atalanta',date:'2026-09-20',credit:'ICV',photos:[photo]}]};
test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/public/match?*',route=>route.fulfill({json:match}));
  await page.route('**/api/public/match-content?*',route=>route.fulfill({json:content}));
  await page.route('**/api/community/match-room?*',route=>route.fulfill({json:{messages:[{body:'Grande vittoria!',created_at:match.date,author:{display_name:'Tifoso ICV'}}]}}));
  await page.route('**/api/public/highlights-thumbnail?*',route=>route.fulfill({status:404}));
});
test('match media, gallery and discussion remain accessible without preloading external players',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/partita.html?match_id=558595');
  await page.getByRole('link',{name:'Video',exact:true}).click();
  await expect(page.locator('#featuredHighlights')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('link',{name:'Foto',exact:true}).click();
  await page.getByRole('button',{name:/Apri foto 1/}).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link',{name:'Discussione',exact:true}).click();
  await expect(page.locator('#matchMessages')).toContainText('Grande vittoria!');
  await expect(page.locator('#matchRoomLink')).toHaveAttribute('href','/community?match_id=558595');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('content service failure keeps the score and exposes a retry',async({page})=>{
  await page.route('**/api/public/match-content?*',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto('/partita.html?match_id=558595');
  await page.locator('#matchExtras').scrollIntoViewIfNeeded();
  await expect(page.locator('#matchContentRetry')).toBeVisible();
  await expect(page.locator('.match-score')).toContainText('2');
  await page.route('**/api/public/match-content?*',route=>route.fulfill({json:{...content,highlights:null,albums:[]}}));
  await page.locator('#matchContentRetry').click();
  await expect(page.locator('#matchPhotosEmpty')).toBeVisible();
  await expect(page.locator('#matchVideosEmpty')).toBeVisible();
});
test('finished and future matches distinguish missing data from a goalless result',async({page})=>{
  await page.goto('/partita.html?match_id=558595');
  await expect(page.locator('#matchDetail')).toContainText('La fonte non fornisce la formazione');
  await expect(page.locator('#matchDetail')).toContainText('La fonte non fornisce i marcatori');
  await page.route('**/api/public/match?*',route=>route.fulfill({json:{...match,status:'TIMED',homeScore:null,awayScore:null}}));
  await page.reload();
  await expect(page.locator('#matchDetail')).toContainText('Formazione ufficiale non ancora disponibile.');
  await expect(page.locator('#matchDetail')).toContainText('La partita non è ancora iniziata.');
  await page.route('**/api/public/match?*',route=>route.fulfill({json:{...match,homeScore:0,awayScore:0}}));
  await page.reload();
  await expect(page.locator('#matchDetail')).toContainText('Nessuna rete.');
});
test('timeline orders stoppage time and renders Italian roles and explicit substitutions',async({page})=>{
  await page.route('**/api/public/match?*',route=>route.fulfill({json:{...match,homeFormation:'4-3-3',homeLineup:[{name:'Portiere test',position:'Goalkeeper'},{name:'Difensore test',position:'Centre-Back'},{name:'Ruolo test',position:'Unknown'}],goals:[{minute:45,injuryTime:3,player:'Autogol test',type:'OWN_GOAL'},{minute:0,player:'Gol test',type:'PENALTY'}],bookings:[{minute:45,injuryTime:1,player:'Espulso test',card:'YELLOW_RED_CARD'}],substitutions:[{minute:46,player:'Entrante test',replacedPlayer:'Uscente test'}]}}));
  await page.goto('/partita.html?match_id=558595');
  await expect(page.locator('.match-event-label')).toHaveText(['Gol su rigore','Espulsione','Autogol','Sostituzione']);
  await expect(page.locator('.match-minute')).toHaveText(["0'","45+1'","45+3'","46'"]);
  await expect(page.locator('.match-change')).toContainText('Entra Entrante test');
  await expect(page.locator('.match-change')).toContainText('Esce Uscente test');
  await expect(page.locator('.lineup-player span')).toHaveText(['Portiere','Difensore centrale','Ruolo non specificato']);
  await expect(page.locator('.match-event-icon svg')).toHaveCount(4);
  for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('referto retry works from the keyboard without exposing server HTML',async({page})=>{
  await page.route('**/api/public/match?*',route=>route.fulfill({status:503,body:'<!DOCTYPE html><html>Server unavailable</html>'}));
  await page.goto('/partita.html?match_id=558595');
  const retry=page.getByRole('button',{name:'Riprova',exact:true});
  await expect(retry).toBeVisible();
  await expect(page.locator('#matchDetail')).not.toContainText('DOCTYPE');
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(retry).toBeFocused();
  await page.route('**/api/public/match?*',route=>route.fulfill({json:match}));
  await page.keyboard.press('Enter');
  await expect(page.locator('.match-score')).toContainText('2');
  await expect(page.locator('#matchDetail')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#matchDetail')).toBeFocused();
});
test('retry removes a gallery that is no longer published',async({page})=>{
  await page.route('**/api/public/match-content?*',route=>route.fulfill({json:{...content,partial:true}}));
  await page.goto('/partita.html?match_id=558595');
  await page.getByRole('link',{name:'Foto',exact:true}).click();
  await expect(page.locator('#matchGallery')).toBeVisible();
  await page.route('**/api/public/match-content?*',route=>route.fulfill({json:{...content,albums:[]}}));
  await page.locator('#matchContentRetry').click();
  await expect(page.locator('#matchGallery')).toBeHidden();
  await expect(page.locator('#matchPhotosEmpty')).toBeVisible();
});
test('small phone and iPad layouts fit and retain explicit player consent',async({page})=>{
  for(const width of [320,820]){
    await page.setViewportSize({width,height:1180});
    await page.goto('/partita.html?match_id=558595');
    await page.getByRole('link',{name:'Video',exact:true}).click();
    await expect(page.locator('#featuredHighlights')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.locator('#highlightsPlay').click();
    await expect(page.locator('#highlightsEmbed iframe')).toHaveCount(1);
    await page.locator('#highlightsStop').click();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
    await page.screenshot({path:'/tmp/icv-match-'+width+'.png',fullPage:true});
  }
});
