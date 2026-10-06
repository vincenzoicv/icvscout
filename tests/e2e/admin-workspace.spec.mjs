import { test, expect } from '@playwright/test';

async function workspace(page) {
  await page.route('https://**', route => route.abort());
  await page.route('**/api/admin/**', route => route.abort());
  await page.goto('/icv_admin.html');
  await page.evaluate(() => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    state.runs = [{type:'instagram_import',status:'error',created_at:new Date().toISOString()}];
    state.drafts = [{id:1,title:'Esempio di notizia da verificare prima della pubblicazione',body:'Testo dimostrativo per controllare la leggibilita della coda editoriale. Nessun contenuto reale viene modificato.',reliability:'trusted',review_status:'pending',source_name:'Fonte dimostrativa',created_at:new Date().toISOString()}];
    render();
  });
}

test('recent Instagram failure is never presented as a successful import', async ({page}) => {
  await workspace(page);
  await expect(page.locator('#adminAlerts .admin-alert-danger')).toContainText('Import Instagram non riuscito');
  await expect(page.locator('#adminAlerts')).not.toContainText('Instagram aggiornato');
  await page.evaluate(() => {state.runs[0].status='success';renderAdminAlerts();});
  await expect(page.locator('#adminAlerts .admin-alert-ok')).toContainText(['Instagram aggiornato']);
});

test('draft preview exposes saved text and supports Escape with focus restoration',async({page})=>{
  await workspace(page);
  const trigger=page.getByRole('button',{name:'Anteprima',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Esempio di notizia da verificare prima della pubblicazione'});
  await expect(dialog).toBeVisible();await expect(dialog.locator('#draftPreviewBody')).toContainText('Testo dimostrativo');
  await expect(dialog.getByRole('button',{name:'Chiudi',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.getElementById('draftPreview').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
});

test('preview rejects unsafe source URLs and does not interpret saved HTML',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{state.drafts[0].body='<img src=x onerror="window.previewInjected=true">';state.drafts[0].source_url='javascript:alert(1)';renderDrafts();openDraftPreview(1);});
  await expect(page.locator('#draftPreviewBody')).toContainText('<img');
  await expect(page.locator('#draftPreviewBody img')).toHaveCount(0);
  await expect(page.locator('#draftPreviewSource')).toBeHidden();
  await expect(page.locator('#draftList a')).toHaveCount(0);
  expect(await page.evaluate(()=>window.previewInjected)).toBeUndefined();
});

test('preview approval uses the existing review guard and closes only on success',async({page})=>{
  await workspace(page);await page.getByRole('button',{name:'Anteprima',exact:true}).click();
  await page.evaluate(()=>{api=()=>Promise.reject(new Error('Servizio temporaneamente non disponibile'));load=()=>Promise.resolve();});
  await page.getByRole('button',{name:'Approva e pubblica'}).click();
  await expect(page.locator('#draftPreview')).toBeVisible();await expect(page.locator('#draftPreviewStatus')).toContainText('temporaneamente');
  await page.evaluate(()=>{api=()=>Promise.resolve({already_approved:false});});
  await page.getByRole('button',{name:'Approva e pubblica'}).click();await expect(page.locator('#draftPreview')).toBeHidden();
});

test('stale draft previews cannot approve and fit a narrow viewport',async({page})=>{
  await workspace(page);await page.setViewportSize({width:320,height:700});
  await page.evaluate(()=>{state.readWarnings=['drafts'];openDraftPreview(1);});
  await expect(page.getByRole('button',{name:'Approva e pubblica'})).toBeDisabled();
  await expect(page.locator('#draftPreviewStatus')).toContainText('Bozze non aggiornate');
  const result=await page.evaluate(async()=>{let calls=0;api=()=>{calls++;return Promise.resolve()};await approveDraft(1);return calls;});expect(result).toBe(0);
  expect(await page.locator('#draftPreview').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-draft-preview-320.png'});
});

test('manual automation keeps a persistent status and blocks repeated launches',async({page})=>{
  await workspace(page);
  const result=await page.evaluate(async()=>{
    let calls=0,finish;api=()=>{calls++;return new Promise(resolve=>finish=resolve);};load=()=>Promise.resolve();
    const first=runAutomation('market');await runAutomation('market');
    const button=Array.from(document.querySelectorAll('button[onclick]')).find(b=>b.getAttribute('onclick')==="runAutomation('market')");
    const pending={calls,disabled:button.disabled,busy:button.getAttribute('aria-busy'),message:document.getElementById('automationActivity').textContent};
    finish({ok:true});await first;
    return {pending,disabled:button.disabled,busy:button.hasAttribute('aria-busy')};
  });
  expect(result.pending.calls).toBe(1);expect(result.pending.disabled).toBe(true);expect(result.pending.busy).toBe('true');expect(result.pending.message).toContain('In corso');
  expect(result.disabled).toBe(false);expect(result.busy).toBe(false);
  await expect(page.locator('#automationActivity')).toContainText('Completata');
});

test('failed payloads are not shown as completed and partial results remain visible',async({page})=>{
  await workspace(page);
  await page.evaluate(async()=>{load=()=>Promise.resolve();api=()=>Promise.resolve({ok:false,error:'Fonte non disponibile'});await runAutomation('market');});
  await expect(page.locator('#automationActivity')).toContainText('Non riuscita');
  await expect(page.locator('#automationActivity')).toContainText('Fonte non disponibile');
  await page.evaluate(async()=>{api=()=>Promise.resolve({ok:true,errors:[{source:'Fonte test',error:'Risposta lenta'}]});await runAutomation('market');});
  await expect(page.locator('#automationActivity')).toContainText('Completata con avvisi');
  await expect(page.locator('#automationActivity')).toContainText('Risposta lenta');
});

test('timeout remains uncertain after refresh and simultaneous jobs keep separate statuses',async({page})=>{
  await workspace(page);
  await page.evaluate(async()=>{load=()=>Promise.resolve();api=()=>Promise.reject(Object.assign(new Error('Gateway timeout'),{status:524}));await runAutomation('market');api=()=>Promise.resolve({ok:true,imported:2});await runAutomation('instagram_import');});
  await expect(page.locator('#automationActivity .uncertain')).toContainText('Esito da verificare');
  await expect(page.locator('#automationActivity .uncertain')).toContainText('Controlla il Monitor');
  await expect(page.locator('#automationActivity .done')).toContainText('Instagram');
  expect(await page.evaluate(()=>runningAutomations.size)).toBe(0);
  for(const width of [320,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/icv-automation-activity-${width}.png`,fullPage:true});
  }
});

test('desktop buttons and mobile section picker stay synchronized', async ({page}) => {
  await workspace(page);
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Pubblicate',exact:true}).click();
  await expect(page.locator('#adminNav button[data-tab="published"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#adminSection')).toHaveValue('published');
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Sezione',{exact:true}).selectOption('sources');
  await expect(page.locator('[data-panel="sources"]')).toBeVisible();
  await expect(page.locator('#adminNav button[data-tab="sources"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-panel="published"]').first()).toBeHidden();
  await page.getByLabel('Sezione',{exact:true}).selectOption('videos');
  await expect(page.locator('[data-panel="videos"]')).toBeVisible();
});

test('navigation groups stay accessible and monitor outages are explicit',async({page})=>{
  await workspace(page);
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('#adminNav').getByRole('group',{name:'Media',exact:true})).toBeVisible();
  await page.evaluate(()=>{state.readWarnings=['monitor'];render();setAdminTab('monitor');});
  await expect(page.locator('#monitorJobs')).toContainText('Monitor non disponibile');
  await expect(page.locator('#monitorKpis')).toBeEmpty();
  await expect(page.locator('#automationStatus')).toContainText('Stato non disponibile');
  await expect(page.locator('#adminAlerts')).toContainText('Stato Instagram non disponibile');
});

test('unavailable draft data is not presented as an empty or healthy queue',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{state.readWarnings=['drafts','news'];state.drafts=[];render();});
  await expect(page.locator('#adminReadWarnings')).toContainText('Dati non aggiornati');
  await expect(page.locator('#adminAlerts')).not.toContainText('Nessuna bozza in attesa');
  await expect(page.locator('#draftList')).toContainText('Bozze non disponibili');
  await expect(page.locator('#stDrafts')).toHaveText('--');
});

test('repeated Approva/Scarta requests are blocked while the first review is pending',async({page})=>{
  await workspace(page);
  const result=await page.evaluate(async()=>{
    let calls=0,complete;
    api=()=>{calls++;return new Promise(resolve=>complete=resolve);};load=()=>Promise.resolve();
    const first=approveDraft(1);const disabled=document.querySelector('[data-draft-id="1"] button').disabled;
    await approveDraft(1);await discardDraft(1);complete({already_approved:false});await first;
    return {calls,disabled,pending:pendingDraftReviews.size};
  });
  expect(result).toEqual({calls:1,disabled:true,pending:0});
});

test('disabled sources remain visible and can be reactivated',async({page})=>{
  await workspace(page);await page.evaluate(()=>{state.sources=[{name:'Fonte test',url:'https://example.com/feed',reliability:'trusted',active:false}];setAdminTab('sources');renderSources();});
  const toggle=page.getByLabel('Attiva: Fonte test');await expect(toggle).not.toBeChecked();
  await page.route('**/api/admin/news',route=>route.fulfill({json:{ok:true}}));
  await page.evaluate(()=>{load=()=>Promise.resolve();});await toggle.check();
  await expect(toggle).toBeChecked();await expect(toggle).toBeEnabled();
});

test('admin dashboard fits phone tablet and desktop without changing real data', async ({page}) => {
  await workspace(page);
  for (const width of [320,820,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`/tmp/icv-admin-${width}.png`,fullPage:true});
    const columns = await page.locator('.stats').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width===320 ? 2 : width===820 ? 3 : 5);
  }
});
