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

test('published news paging reaches all loaded rows and resets on filter changes',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{
    state.news=Array.from({length:65},(_,i)=>({id:i+1,title:'News test '+(i+1),body:'Testo test',source:'ICV',visible:i%2===0,reliability:'trusted'}));
    setAdminTab('published');renderNews();
  });
  await expect(page.locator('#newsList .item')).toHaveCount(20);
  await expect(page.locator('#newsResults')).toContainText('65 di 65 news caricate');
  await expect(page.locator('#newsResults')).toContainText('fino a 80 recenti');
  await expect(page.locator('#newsPrevious')).toBeDisabled();
  for(let i=0;i<3;i++)await page.locator('#newsNext').click();
  await expect(page.locator('#newsList .item')).toHaveCount(5);
  await expect(page.locator('#newsList')).toContainText('News test 65');
  await expect(page.locator('#newsNext')).toBeDisabled();
  await expect(page.getByRole('heading',{name:'News Pubblicate',exact:true})).toBeFocused();
  await page.getByLabel('Filtra news per visibilità').selectOption('hidden');
  await expect(page.locator('#newsPageLabel')).toHaveText('Pagina 1 di 2');
  await expect(page.locator('#newsResults')).toContainText('32 di 65');
  await page.getByLabel('Cerca news',{exact:true}).fill('inesistente');
  await expect(page.locator('#newsPagination')).toBeHidden();
  await expect(page.locator('#newsResults')).toContainText('0 di 65');
  await page.locator('#newsResetFilters').click();
  await expect(page.locator('#newsResults')).toContainText('65 di 65');
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-news-pagination-320.png',fullPage:true});
});

test('published news changes prevent repeated requests and disable stale actions',async({page})=>{
  await workspace(page);
  const result=await page.evaluate(async()=>{
    state.news=[{id:1,title:'News test',body:'Testo',visible:true}];setAdminTab('published');renderNews();
    let calls=0,resolve;load=()=>Promise.resolve();api=()=>{calls++;return new Promise(r=>resolve=r);};
    const first=toggleNews(1,true);await toggleNews(1,true);await deleteNews(1);
    const disabled=Array.from(document.querySelectorAll('#newsList button')).every(button=>button.disabled);
    resolve({ok:true});await first;
    api=()=>Promise.reject(new Error('Servizio non disponibile'));await toggleNews(1,true);
    const recovered=Array.from(document.querySelectorAll('#newsList button')).every(button=>!button.disabled);
    state.readWarnings=['news'];renderNews();await toggleNews(1,true);await deleteNews(1);
    return {calls,disabled,recovered,pending:pendingNewsChanges.size};
  });
  expect(result).toEqual({calls:1,disabled:true,recovered:true,pending:0});
  await expect(page.locator('#newsResults')).toContainText('conteggio da verificare');
  for(const button of await page.locator('#newsList button').all())await expect(button).toBeDisabled();
});

test('draft queue counts filtered results resets only draft filters and exposes readable states',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{state.drafts.push({id:2,title:'Formazione ufficiale',body:'Testo test',source_name:'Club test',reliability:'official',review_status:'ready'});state.filters.newsQuery='conserva';document.getElementById('newsQuery').value='conserva';renderDrafts();});
  await expect(page.locator('#draftResults')).toHaveText('2 di 2 bozze in attesa');
  await expect(page.locator('#draftResetFilters')).toBeHidden();
  await expect(page.locator('#draftList')).not.toContainText('pending');
  await expect(page.locator('#draftList')).toContainText('Pronta');
  await page.getByLabel('Filtra bozze per affidabilità').selectOption('official');
  await expect(page.locator('#draftResults')).toHaveText('1 di 2 bozze in attesa');
  await page.getByLabel('Cerca bozze',{exact:true}).fill('nessun risultato');
  await expect(page.locator('#draftResults')).toHaveText('0 di 2 bozze in attesa');
  await page.getByRole('button',{name:'Azzera filtri'}).click();
  await expect(page.locator('#draftResults')).toHaveText('2 di 2 bozze in attesa');
  expect(await page.evaluate(()=>state.filters.newsQuery)).toBe('conserva');
  await page.evaluate(()=>{state.readWarnings=['drafts'];renderDrafts();});
  await expect(page.locator('#draftResults')).toContainText('conteggio da verificare');
  for(const button of await page.locator('#draftList button').all()){
    if(await button.textContent()!=='Anteprima')await expect(button).toBeDisabled();
  }
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-draft-queue-320.png',fullPage:true});
});

test('monitor history filters expose warnings and skipped reasons without false completion',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{
    state.automationMonitor={generated_at:new Date().toISOString(),counts:{},jobs:[],sources:[{source:'Fonte vecchia',status:'healthy',last_checked_at:'2026-01-01T10:00:00Z',scanned:3,relevant:1,changed:0}],recent_runs:[
      {type:'news',status:'ok',outcome:'skipped',reason:'interval_not_elapsed',created_at:'2026-10-06T10:00:00Z'},
      {type:'home_autopilot',status:'ok',outcome:'warning',problems:['market: Fonte non disponibile <script>'],created_at:'2026-10-06T09:00:00Z'},
      {type:'market',status:'pending',outcome:'unknown',created_at:'2026-10-06T08:00:00Z'}
    ]};setAdminTab('monitor');renderAutomationMonitor();
  });
  await expect(page.locator('#monitorSources')).toContainText('Da aggiornare');
  await expect(page.locator('#monitorHistory')).not.toContainText('Completata');
  await page.getByLabel('Filtra storico per esito').selectOption('problems');
  await expect(page.locator('#monitorHistory .monitor-history-row')).toHaveCount(1);
  await expect(page.locator('#monitorHistory')).toContainText('Fonte non disponibile <script>');
  await expect(page.locator('#monitorHistory script')).toHaveCount(0);
  await page.getByLabel('Filtra storico per esito').selectOption('skipped');
  await expect(page.locator('#monitorHistory')).toContainText('Intervallo minimo non ancora trascorso');
  await page.getByLabel('Filtra storico per processo').selectOption('market');
  await expect(page.locator('#monitorHistory')).toContainText('Nessuna esecuzione corrisponde');
  await page.getByLabel('Filtra storico per esito').selectOption('unknown');
  await expect(page.locator('#monitorHistory')).toContainText('Da verificare');
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-monitor-320.png',fullPage:true});
});

test('source filters combine activation and health and keep settings after restoration',async({page})=>{
  await workspace(page);
  await page.evaluate(()=>{
    state.sources=[{name:'Fonte test',url:'https://example.test/feed',reliability:'trusted',active:true},{name:'Fonte test extra',url:'https://example.test/extra',reliability:'trusted',active:false}];
    state.automationMonitor={sources:[{source:'Fonte test',url:'https://example.test/feed',last_checked_at:new Date().toISOString(),status:'error',detail:'Risposta lenta',scanned:0,relevant:0,changed:0}]};
    setAdminTab('sources');renderSources();
  });
  await expect(page.locator('#sourceResults')).toContainText('2 di 2');
  await expect(page.getByRole('link',{name:'Apri feed di Fonte test',exact:true})).toHaveAttribute('href','https://example.test/feed');
  await expect(page.locator('#sourceList .item').nth(1)).toContainText('Non verificata');
  await page.getByLabel('Filtra fonti per ultimo controllo').selectOption('problems');
  await expect(page.locator('#sourceList .item')).toHaveCount(1);
  await expect(page.locator('#sourceList')).toContainText('Risposta lenta');
  await page.getByLabel('Filtra fonti per attivazione').selectOption('inactive');
  await expect(page.locator('#sourceResults')).toContainText('0 di 2');
  await page.evaluate(()=>{state.filters.sourceActive='all';restoreContentFilters();});
  await expect(page.getByLabel('Filtra fonti per attivazione')).toHaveValue('inactive');
});

test('old checks and monitor outages do not imply current source health',async({page})=>{
  await workspace(page);await page.setViewportSize({width:320,height:700});
  await page.evaluate(()=>{
    state.sources=[{name:'Fonte test',url:'https://example.test/'+('long-feed-path-'.repeat(15)),reliability:'trusted'}];
    state.automationMonitor={sources:[{source:'Fonte test',last_checked_at:new Date(Date.now()-48*60*60*1000).toISOString(),status:'healthy',scanned:3,relevant:2,changed:0}]};
    setAdminTab('sources');renderSources();
  });
  await expect(page.locator('#sourceList')).toContainText('Controllo da aggiornare');
  await page.getByLabel('Filtra fonti per ultimo controllo').selectOption('healthy');
  await expect(page.locator('#sourceList .item')).toHaveCount(0);
  await page.getByLabel('Filtra fonti per ultimo controllo').selectOption('unchecked');
  await expect(page.locator('#sourceList .item')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-sources-320.png',fullPage:true});
  await page.evaluate(()=>{state.readWarnings=['monitor'];state.sources[0].url='javascript:alert(1)';renderSources();});
  await expect(page.locator('#sourceList a')).toHaveCount(0);
  await expect(page.locator('#sourceList')).toContainText('stato della fonte non verificabile');
});

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
    for(let i=0;i<100&&!calls;i++)await new Promise(resolve=>setTimeout(resolve,10));
    const button=Array.from(document.querySelectorAll('button[onclick]')).find(b=>b.getAttribute('onclick')==="runAutomation('market')");
    const pending={calls,disabled:button.disabled,busy:button.getAttribute('aria-busy'),message:document.getElementById('automationActivity').textContent};
    finish({ok:true});await first;
    return {pending,disabled:button.disabled,busy:button.hasAttribute('aria-busy')};
  });
  expect(result.pending.calls).toBe(1);expect(result.pending.disabled).toBe(true);expect(result.pending.busy).toBe('true');expect(result.pending.message).toContain('In corso');
  expect(result.disabled).toBe(false);expect(result.busy).toBe(false);
  await expect(page.locator('#automationActivity')).toContainText('Completata');
});

test('manual launches are coordinated across tabs without queued duplicate requests',async({page,context})=>{
  await workspace(page);
  await page.evaluate(()=>{window.automationCalls=0;load=()=>Promise.resolve();api=()=>{window.automationCalls++;return new Promise(resolve=>window.finishAutomation=resolve)};window.pendingAutomation=runAutomation('market');});
  await expect.poll(()=>page.evaluate(()=>window.automationCalls)).toBe(1);
  const other=await context.newPage();await workspace(other);
  await other.evaluate(async()=>{window.automationCalls=0;load=()=>Promise.resolve();api=()=>{window.automationCalls++;return Promise.resolve({ok:true})};await runAutomation('fetch_news');});
  expect(await other.evaluate(()=>window.automationCalls)).toBe(0);
  await expect(other.locator('.toast')).toContainText("un'altra scheda");
  await page.evaluate(async()=>{window.finishAutomation({ok:true});await window.pendingAutomation;});
  await other.evaluate(()=>runAutomation('fetch_news'));
  expect(await other.evaluate(()=>window.automationCalls)).toBe(1);
  await other.close();
});

test('completed activity survives reload and interrupted activity remains uncertain',async({page})=>{
  await workspace(page);
  await page.evaluate(async()=>{load=()=>Promise.resolve();api=()=>Promise.resolve({ok:true});await runAutomation('market');});
  await page.reload();await page.evaluate(()=>{document.getElementById('panel').style.display='block'});
  await expect(page.locator('#automationActivity .done')).toContainText('Mercato');
  await expect(page.locator('#automationActivity time')).toHaveCount(1);
  await page.evaluate(()=>setAutomationActivity('instagram_import','running','Attendi'));
  await page.reload();await page.evaluate(()=>{document.getElementById('panel').style.display='block'});
  await expect(page.locator('#automationActivity .uncertain')).toContainText('esito confermato');
  await expect(page.locator('#automationActivity .uncertain')).toContainText('Monitor');
});

test('unavailable storage and browser locks do not prevent a manual operation',async({page})=>{
  await workspace(page);
  const result=await page.evaluate(async()=>{
    Object.defineProperty(navigator,'locks',{value:undefined});
    const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('Storage non disponibile')};
    let calls=0;api=()=>{calls++;return Promise.resolve({ok:true})};load=()=>Promise.resolve();
    try{await runAutomation('market');return {calls,status:automationActivity.get('market').status}}finally{Storage.prototype.setItem=original}
  });
  expect(result).toEqual({calls:1,status:'done'});
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

test('manual outcomes distinguish missing confirmation disabled jobs and nested failures',async({page})=>{
  await workspace(page);
  for(const payload of [{},null,[],{ok:'true'}]){
    await page.evaluate(async payload=>{load=()=>Promise.resolve();api=()=>Promise.resolve(payload);await runAutomation('market');},payload);
    await expect(page.locator('#automationActivity .uncertain')).toContainText('Esito da verificare');
    await expect(page.locator('#automationActivity .done')).toHaveCount(0);
  }
  await page.evaluate(async()=>{state.latestFetch={scanned:7};api=()=>Promise.resolve({ok:true,skipped:true,reason:'interval_not_elapsed'});await runAutomation('fetch_news');});
  await expect(page.locator('#automationActivity .skipped')).toContainText('Intervallo minimo');
  expect(await page.evaluate(()=>state.latestFetch.scanned)).toBe(7);
  await page.evaluate(async()=>{api=()=>Promise.resolve({ok:true,disabled:true});await runAutomation('youtube_scout');restoreAutomationActivity();});
  await expect(page.locator('#automationActivity .skipped').filter({hasText:'YouTube Scout'})).toContainText('Processo disattivato');
  await page.evaluate(async()=>{api=()=>Promise.resolve({ok:true,tasks:[{type:'market',result:{ok:false,error:'Feed non disponibile'}}]});await runAutomation('home_autopilot');});
  await expect(page.locator('#automationActivity .warning')).toContainText('market: Feed non disponibile');
  await page.evaluate(async()=>{api=()=>Promise.resolve({ok:true,skipped:3});await runAutomation('youtube_scout');});
  await expect(page.locator('#automationActivity .done')).toContainText('YouTube Scout');
  expect(await page.evaluate(()=>runningAutomations.size)).toBe(0);
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
