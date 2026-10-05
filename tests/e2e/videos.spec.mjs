import {test,expect} from '@playwright/test';
const videos=Array.from({length:4},(_,i)=>({id:'00000000-0000-0000-0000-00000000000'+i,title:'Video di prova '+i,description:'Anteprima privata della sezione video',published_at:'2026-10-0'+(5-i)+'T12:00:00Z',url:'/api/public/video-file?id=00000000-0000-0000-0000-00000000000'+i,poster:null,captions:null}));
test('TikTok: anteprima automatica con consenso salvato, senza autoplay',async({page},info)=>{
  const item={...videos[0],kind:'tiktok',source_url:'https://www.tiktok.com/@scout2015/video/6718335390845095173',url:null};
  await page.route('https://www.tiktok.com/**',route=>route.fulfill({body:'<p>Player TikTok</p>',contentType:'text/html'}));
  await page.route('**/api/public/videos',route=>route.fulfill({json:{videos:[item]}}));
  await page.goto('/');await expect(page.locator('#homeVideoList article')).toHaveCount(1);
  await expect(page.locator('#homeVideoList iframe')).toHaveCount(0);
  await page.evaluate(()=>ICVPrivacy.save({...ICVPrivacy.get(),external_media:true}));
  await page.locator('#homeVideos').scrollIntoViewIfNeeded();
  await expect(page.locator('#homeVideoList iframe')).toHaveAttribute('src',/autoplay=0/);
  await page.screenshot({path:'/tmp/icv-tiktok-auto-'+info.project.name+'.png'});
  await page.reload();await page.locator('#homeVideos').scrollIntoViewIfNeeded();
  await expect(page.locator('#homeVideoList iframe')).toHaveCount(1);
  await page.locator('.editorial-social-close').click();await expect(page.locator('#homeVideoList iframe')).toHaveCount(0);
  await page.evaluate(()=>ICVPrivacy.save({...ICVPrivacy.get(),external_media:false}));
  await page.reload();await page.locator('#homeVideos').scrollIntoViewIfNeeded();await expect(page.locator('#homeVideoList iframe')).toHaveCount(0);
});
test('social: nessun iframe prima del consenso, player interno e revoca immediata',async({page},info)=>{
  const social=[{...videos[0],kind:'instagram',source_url:'https://www.instagram.com/reel/Dd_eMBASwjy/',url:null},{...videos[1],kind:'tiktok',source_url:'https://www.tiktok.com/@scout2015/video/6718335390845095173',url:null}];
  let embeds=0;await page.route('https://www.instagram.com/**',route=>{embeds++;return route.fulfill({body:'<p>Player Instagram di prova</p>',contentType:'text/html'});});
  await page.route('https://www.tiktok.com/**',route=>{embeds++;return route.fulfill({body:'<p>Player TikTok di prova</p>',contentType:'text/html'});});
  await page.route('**/api/public/media',route=>route.fulfill({json:{videos:social,conferences:[],albums:[]}}));
  await page.goto('/media#video');await expect(page.locator('#mediaVideoList article')).toHaveCount(2);expect(embeds).toBe(0);await expect(page.locator('#mediaVideoList iframe')).toHaveCount(0);
  await page.locator('.editorial-social-load').first().click();await expect(page.locator('#mediaVideoList iframe')).toHaveAttribute('src','https://www.instagram.com/reel/Dd_eMBASwjy/embed/');
  await page.locator('.editorial-social-load').nth(1).click();await expect(page.locator('#mediaVideoList iframe')).toHaveCount(1);await expect(page.locator('#mediaVideoList iframe')).toHaveAttribute('src',/www.tiktok.com\/player\/v1\/6718335390845095173\?autoplay=0/);
  await page.screenshot({path:'/tmp/icv-social-'+info.project.name+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>ICVPrivacy.save({...ICVPrivacy.get(),external_media:false}));await expect(page.locator('#mediaVideoList iframe')).toHaveCount(0);
  await page.locator('.editorial-social-load').first().click();await page.locator('#mediaSearch').fill('assente');await expect(page.locator('#mediaVideoList iframe')).toHaveCount(0);
});
test('home: esattamente tre video, nessun download anticipato, layout senza overflow',async({page},info)=>{
  let downloads=0;await page.route('**/api/public/videos',route=>route.fulfill({json:{videos}}));
  await page.route('**/api/public/video-file?*',route=>{downloads++;return route.fulfill({status:404});});
  await page.goto('/');await expect(page.locator('#homeVideos')).toBeVisible();await expect(page.locator('#homeVideoList article')).toHaveCount(3);
  expect(await page.locator('#homeVideoList video').evaluateAll(nodes=>nodes.every(node=>node.preload==='none'&&!node.autoplay&&node.controls&&node.paused))).toBe(true);
  expect(downloads).toBe(0);await expect(page.locator('#homeVideos a')).toHaveAttribute('href','/media#video');
  await page.locator('#homeVideos').scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(info.project.name==='desktop')expect((await page.locator('#homeVideos').boundingBox()).width).toBeGreaterThan(900);
  await page.screenshot({path:'/tmp/icv-videos-home-'+info.project.name+'.png'});
});
test('home: archivio vuoto mantiene la sezione nascosta',async({page})=>{
  await page.route('**/api/public/videos',route=>route.fulfill({json:{videos:[]}}));await page.goto('/');await expect(page.locator('#homeVideos')).toBeHidden();
});
test('Media: archivio completo, filtro, ricerca e ordine',async({page},info)=>{
  await page.route('**/api/public/media',route=>route.fulfill({json:{videos,conferences:[],albums:[]}}));
  await page.goto('/media#video');await expect(page.locator('#mediaVideoList article')).toHaveCount(4);await expect(page.locator('[data-filter=video]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#mediaOrder').selectOption('oldest');await expect(page.locator('#mediaVideoList h3').first()).toHaveText('Video di prova 3');
  await page.locator('#mediaSearch').fill('prova 1');await expect(page.locator('#mediaVideoList article')).toHaveCount(1);
  await page.locator('#mediaSearch').fill('assente');await expect(page.locator('#mediaEmpty')).toBeVisible();
  await page.locator('#mediaReset').click();await page.locator('[data-filter=video]').click();await expect(page.locator('#mediaVideoList article')).toHaveCount(4);
  await expect(page.locator('[data-filter=video]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/icv-videos-media-'+info.project.name+'.png'});
});
test('video reale riproducibile, pausa degli altri player e uscita dai filtri',async({page})=>{
  await page.route('**/api/public/media',route=>route.fulfill({json:{videos:videos.slice(0,2),conferences:[],albums:[]}}));
  await page.route('**/api/public/video-file?*',route=>route.fulfill({path:'assets/nascita-juventus-20260831.mp4',contentType:'video/mp4'}));
  await page.goto('/media#video');const players=page.locator('#mediaVideoList video');await expect(players).toHaveCount(2);
  await players.nth(0).evaluate(video=>video.play());await expect.poll(()=>players.nth(0).evaluate(video=>video.currentTime)).toBeGreaterThan(0);
  await players.nth(1).evaluate(video=>video.play());await expect.poll(()=>players.nth(0).evaluate(video=>video.paused)).toBe(true);
  await page.locator('[data-filter=foto]').click();await expect(page.locator('[data-media-section=video]')).toBeHidden();expect(await page.locator('#mediaVideoList video').evaluateAll(nodes=>nodes.every(v=>v.paused))).toBe(true);
});
test('admin: upload dal computer in bozza, modifica, pubblicazione e rimozione',async({page},info)=>{
  let revision='initial',items=[];let uploadBody='';
  await page.route('**/api/admin/videos**',async route=>{
    const req=route.request(),method=req.method();
    if(method==='POST'){uploadBody=req.postData();items=[{id:videos[0].id,title:'Intervista di prova',description:'Descrizione di prova',published:false,size:16}];revision='r1';return route.fulfill({status:201,json:{ok:true,id:videos[0].id}});}
    if(method==='PUT')return route.fulfill({json:{ok:true}});
    if(method==='PATCH'){Object.assign(items[0],req.postDataJSON());revision='r2';return route.fulfill({json:{ok:true}});}
    if(method==='DELETE'){items=[];revision='r3';return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{revision,videos:items,max_bytes:20971520,archive_limit:209715200,used_bytes:items.length*16}});
  });
  await page.goto('/icv_admin');await page.evaluate(()=>{document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';});
  await page.evaluate(()=>setAdminTab('videos'));await expect(page.locator('#videoAdmin')).toBeVisible();await expect(page.locator('#videoAdminEmpty')).toBeVisible();
  await page.locator('#videoUploadForm input[name=title]').fill('Intervista di prova');await page.locator('#videoUploadForm textarea').fill('Descrizione di prova');
  await page.locator('#videoFile').setInputFiles({name:'intervista.mp4',mimeType:'video/mp4',buffer:Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0])});await page.locator('#videoRights').check();
  await page.locator('#videoUploadForm button[type=submit]').click();await expect(page.locator('#videoAdminList strong')).toHaveText('Bozza');expect(JSON.parse(uploadBody).video_size).toBe(16);
  await page.locator('#videoAdminList input').fill('Intervista aggiornata');await page.locator('#videoAdminList [data-video-action=publish]').click();await expect(page.locator('#videoAdminList strong')).toHaveText('Pubblicato');await expect(page.locator('#videoAdminList input')).toHaveValue('Intervista aggiornata');
  await page.screenshot({path:'/tmp/icv-videos-admin-'+info.project.name+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#videoAdminList [data-video-action=publish]').click();await expect(page.locator('#videoAdminList strong')).toHaveText('Bozza');
  page.on('dialog',dialog=>dialog.accept());await page.locator('#videoAdminList [data-video-action=delete]').click();await expect(page.locator('#videoAdminEmpty')).toBeVisible();
});
