import {test,expect} from '@playwright/test';

async function workspace(page){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/admin/**',route=>route.abort());
  await page.goto('/icv_admin.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';
    state.matches=[{match_id:'one',title:'Partita di prova',status:'pre_match'},{match_id:'two',title:'Seconda partita',status:'pre_match'}];
    state.highlightsConfig={mode:'manual',title:'Video salvato',video_url:'https://www.youtube.com/watch?v=abcdefghijk'};
    state.conferenceConfig={mode:'auto'};state.conferenceOptions=[{id:1,hook:'Conferenza di prova'}];
    renderHighlightsSettings();render();
  });
}

test('refresh preserves dirty settings and editing another section keeps the warning',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('highlights'));
  await page.getByLabel('Titolo highlights',{exact:true}).fill('Titolo in lavorazione');
  await expect(page.locator('#adminUnsavedStatus')).toContainText('Highlights');
  await page.evaluate(()=>{state.highlightsConfig.title='Aggiornamento remoto';renderHighlightsSettings();setAdminTab('social');});
  await page.getByLabel('Selezione',{exact:true}).selectOption('off');
  await page.evaluate(()=>{renderSocial();setAdminTab('highlights');});
  await expect(page.locator('#highlightsTitle')).toHaveValue('Titolo in lavorazione');
  await expect(page.locator('#conferenceMode')).toHaveValue('off');
  await expect(page.locator('#adminUnsavedStatus')).toContainText('Sala stampa');
});

test('settings save retains newer input and an unconfirmed save never clears dirty state',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('highlights'));
  await page.locator('#highlightsTitle').fill('Titolo inviato');
  await page.evaluate(()=>{api=()=>new Promise(resolve=>window.finishSave=resolve);window.saving=saveHighlightsSelection();});
  await page.locator('#highlightsTitle').fill('Modifica successiva');
  await page.evaluate(async()=>{window.finishSave({highlights_config:{mode:'manual',title:'Titolo inviato',video_url:'https://www.youtube.com/watch?v=abcdefghijk'}});await window.saving;});
  await expect(page.locator('#highlightsTitle')).toHaveValue('Modifica successiva');
  await expect(page.locator('#adminUnsavedStatus')).toBeVisible();
  await page.evaluate(async()=>{api=()=>Promise.resolve({});await saveHighlightsSelection();});
  await expect(page.locator('#highlightsCurrent')).toContainText('non confermato');
  await expect(page.locator('#adminUnsavedStatus')).toBeVisible();
  await page.evaluate(async()=>{api=()=>Promise.resolve({highlights_config:{mode:'manual',title:'Modifica successiva',video_url:'https://www.youtube.com/watch?v=abcdefghijk'}});await saveHighlightsSelection();});
  await expect(page.locator('#adminUnsavedStatus')).toBeHidden();
});

test('match refresh preserves edits and changing match requires discard confirmation',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('advanced'));
  await page.getByLabel('Marcatori',{exact:true}).fill("Giocatore 65'");
  await page.evaluate(()=>{state.matches.reverse();renderMatches();});
  await expect(page.locator('#matchOverrideSelect')).toHaveValue('1');
  await expect(page.locator('#matchOverrideId')).toHaveValue('one');
  await expect(page.getByLabel('Marcatori',{exact:true})).toHaveValue("Giocatore 65'");
  page.once('dialog',dialog=>dialog.dismiss());
  await page.evaluate(()=>loadMatchOverride(0));
  await expect(page.locator('#matchOverrideId')).toHaveValue('one');
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>loadMatchOverride(0));
  await expect(page.locator('#matchOverrideId')).toHaveValue('two');
  await expect(page.locator('#adminUnsavedStatus')).toBeHidden();
});

test('reverting a field while save is pending remains a new unsaved edit',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('highlights'));
  await page.locator('#highlightsTitle').fill('Titolo inviato');
  await page.evaluate(()=>{api=()=>new Promise(resolve=>window.finishSave=resolve);window.saving=saveHighlightsSelection();});
  await page.locator('#highlightsTitle').fill('Video salvato');
  await page.evaluate(async()=>{window.finishSave({highlights_config:{mode:'manual',title:'Titolo inviato',video_url:'https://www.youtube.com/watch?v=abcdefghijk'}});await window.saving;});
  await expect(page.locator('#highlightsTitle')).toHaveValue('Video salvato');
  await expect(page.locator('#adminUnsavedStatus')).toBeVisible();
});

test('manual news publication blocks double submission and preserves newer copy',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('published'));
  await page.locator('#manualTitle').fill('Titolo da inviare');await page.locator('#manualBody').fill('Testo da inviare');
  const count=await page.evaluate(async()=>{
    window.writeCalls=0;load=()=>Promise.resolve();api=()=>{window.writeCalls++;return new Promise(resolve=>window.finishNews=resolve)};
    window.saving=publishManual();await publishManual();return window.writeCalls;
  });
  expect(count).toBe(1);
  await page.locator('#manualBody').fill('Testo successivo');
  await page.evaluate(async()=>{window.finishNews({news:{id:1}});await window.saving;});
  await expect(page.locator('#manualBody')).toHaveValue('Testo successivo');
  await expect(page.locator('#adminUnsavedStatus')).toBeVisible();
  await page.evaluate(async()=>{api=()=>Promise.resolve({});await publishManual();});
  await expect(page.locator('#toast')).toContainText('non confermata');
  await expect(page.locator('#manualBody')).toHaveValue('Testo successivo');
});

test('section overview can be reopened and highlights labels are readable',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('highlights'));
  await expect(page.locator('#adminOverview')).not.toHaveAttribute('open','');
  expect(await page.locator('label[for="highlightsTitle"]').evaluate(el=>getComputedStyle(el).fontSize)).toBe('14px');
  await page.getByText('Riepilogo operativo',{exact:true}).click();
  await expect(page.locator('#automationStatus')).toBeVisible();
  await page.getByText('Riepilogo operativo',{exact:true}).click();
  await expect(page.locator('#automationStatus')).toBeHidden();
});

test('match writes cannot overlap and failed saves retain editable values',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('advanced'));
  await page.getByLabel('Nota',{exact:true}).fill('Correzione in lavorazione');
  const pending=await page.evaluate(async()=>{
    window.writeCalls=0;api=()=>{window.writeCalls++;return new Promise(resolve=>window.finishMatch=resolve)};
    window.saving=saveMatchOverride();await saveMatchOverride();await clearMatchOverride();return window.writeCalls;
  });
  expect(pending).toBe(1);await expect(page.getByRole('button',{name:'Salva correzione'})).toBeDisabled();
  await page.evaluate(async()=>{window.finishMatch({});await window.saving;});
  await expect(page.locator('#toast')).toContainText('non confermato');
  await expect(page.getByRole('button',{name:'Salva correzione'})).toBeEnabled();
  await expect(page.getByLabel('Nota',{exact:true})).toHaveValue('Correzione in lavorazione');
});

test('unsaved work warns on leaving and forms fit small screens',async({page})=>{
  await workspace(page);await page.evaluate(()=>setAdminTab('published'));
  await page.locator('#manualTitle').fill('Bozza locale');
  const prevented=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
  expect(prevented).toBe(true);
  for(const width of [320,390,820,1440]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>setAdminTab('highlights'));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'/tmp/icv-admin-editors-'+width+'.png',fullPage:true});
  }
});
