import {test,expect} from '@playwright/test';

const mb=1048576;
async function openVideos(page,routeHandler){
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/admin/**',route=>route.abort());
  await page.route('**/api/admin/videos**',routeHandler);
  await page.goto('/icv_admin.html');
  await page.evaluate(()=>{document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';setAdminTab('videos');});
  await expect(page.locator('#videoRefresh')).toBeEnabled();
}
const archive=videos=>({revision:'test',videos,max_bytes:20*mb,archive_limit:100*mb,used_bytes:videos.reduce((sum,item)=>sum+item.size,0)});

test('video quota exposes reservations and unfinished deletion without duplicate navigation',async({page})=>{
  await openVideos(page,route=>route.fulfill({json:archive([
    {id:'incomplete',title:'Intervista incompleta',description:'',uploading:true,size:10*mb},
    {id:'deleted',title:'Da eliminare',description:'',deleted:true,size:5*mb}
  ])}));
  await expect(page.locator('#videoSpaceDetails')).toContainText('85 MB disponibili');
  await expect(page.locator('#videoSpaceDetails')).toContainText('10 MB riservati');
  await expect(page.locator('#videoArchiveWarnings')).toContainText('spazio non e ancora liberato');
  await expect(page.locator('#videoFileLimit')).toContainText('20 MB');
  await expect(page.locator('#videoSpaceMeter')).toHaveAttribute('value',String(15*mb));
  await expect(page.locator('#adminSection option[value=videos]')).toHaveCount(1);
  await expect(page.locator('#videoAdminList [data-video-action=publish]')).toHaveCount(0);
  await expect(page.locator('#videoAdminList input').first()).toBeDisabled();
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/icv-video-quota-320.png',fullPage:true});
});

test('quota includes the cover and blocks an upload before creating a ticket',async({page})=>{
  let posts=0;
  await openVideos(page,route=>{if(route.request().method()==='POST')posts++;return route.fulfill({json:archive([{id:'existing',title:'Esistente',description:'',size:98*mb}])});});
  await page.locator('#videoUploadForm input[name=title]').fill('Nuova intervista');
  await page.locator('#videoFile').setInputFiles({name:'video.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(2*mb)});
  await page.locator('#videoCover').setInputFiles({name:'cover.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(mb)});
  await expect(page.locator('#videoSelection')).toContainText('Spazio insufficiente');
  await page.locator('#videoRights').check();await page.locator('#videoUploadForm button[type=submit]').click();
  await expect(page.locator('#videoAdminStatus')).toContainText('Spazio insufficiente');expect(posts).toBe(0);
  await page.locator('#videoOrigin').selectOption('social');
  await expect(page.locator('#videoSelection')).toContainText('nessun file video occupa spazio');
});

test('failed archive refresh disables writes and does not claim available quota',async({page})=>{
  let failed=false;
  await openVideos(page,route=>route.fulfill(failed?{status:503,json:{error:'Archivio non disponibile'}}:{json:archive([{id:'existing',title:'Esistente',description:'',size:mb}])}));
  failed=true;await page.locator('#videoRefresh').click();
  await expect(page.locator('#videoAdminStatus')).toContainText('temporaneamente non disponibile');
  await expect(page.locator('#videoSpace')).toHaveText('Spazio non verificato');
  await expect(page.locator('#videoSpaceMeter')).toBeHidden();
  await expect(page.locator('#videoUploadFields')).toHaveAttribute('disabled','');
  await expect(page.locator('#videoFile')).toBeDisabled();
  await expect(page.locator('#videoUploadForm button[type=submit]')).toBeDisabled();
  await expect(page.locator('#videoAdminList [data-video-action=publish]')).toBeDisabled();
  await expect(page.locator('#videoRefresh')).toBeEnabled();
});

test('video and cover share progress and completion waits for server confirmation',async({page})=>{
  let items=[],completed=false;
  await openVideos(page,route=>{
    const req=route.request();
    if(req.method()==='POST'){items=[{id:'ticket',title:'Intervista',description:'',size:32,uploading:true}];return route.fulfill({json:{id:'ticket',ok:true}});}
    if(req.method()==='PATCH'){completed=true;items[0].uploading=false;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:archive(items)});
  });
  await page.evaluate(()=>{
    window.uploadSteps=[];
    window.XMLHttpRequest=class{
      constructor(){this.upload={};this.status=200;this.responseText='{"ok":true}';}
      open(){}setRequestHeader(){}
      send(body){queueMicrotask(()=>{this.upload.onprogress({lengthComputable:true,loaded:body.size/2,total:body.size});window.uploadSteps.push({value:document.getElementById('videoProgress').value,status:document.getElementById('videoAdminStatus').textContent});this.onload();});}
    };
  });
  await page.locator('#videoUploadForm input[name=title]').fill('Intervista');
  await page.locator('#videoFile').setInputFiles({name:'video.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(16)});
  await page.locator('#videoCover').setInputFiles({name:'cover.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(16)});
  await page.locator('#videoRights').check();await page.locator('#videoUploadForm button[type=submit]').click();
  await expect(page.locator('#videoAdminStatus')).toHaveText('Video aggiunto in bozza.');
  expect(completed).toBe(true);
  const steps=await page.evaluate(()=>window.uploadSteps);
  expect(steps.map(step=>step.value)).toEqual([25,75]);
  expect(steps.map(step=>step.status)).toEqual(['Caricamento video...','Caricamento copertina...']);
  await expect(page.locator('#videoProgress')).toBeHidden();
  await expect(page.locator('#videoProgress')).toHaveAttribute('value','100');
});
