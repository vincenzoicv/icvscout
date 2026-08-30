import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]].js';
import {decodePhoto} from '../functions/lib/match-gallery.js';
import {galleryStore} from './helpers/gallery-store.mjs';

const env={ADMIN_TOKEN:'test-admin',SUPABASE_URL:'https://gallery-db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5N8AAAAASUVORK5CYII=';
const request=(path,body,auth=true)=>new Request('https://icv.test/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'X-ICV-Admin-Token':'test-admin'}:{})},...(body?{body:JSON.stringify(body)}:{})});

test('album completo: bozza privata, upload, didascalia, ordine, pubblicazione, rimozione',async(t)=>{
  const db=galleryStore();t.mock.method(globalThis,'fetch',db.fetch);
  let state=await (await onRequest({request:request('admin/match-gallery'),env})).json();
  const action=async(action,extra={})=>{
    const r=await onRequest({request:request('admin/match-gallery',{action,revision:state.revision,album_id:state.selected_id,...extra}),env});
    const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));state=data;return data;
  };
  await action('create',{title:'Juventus - Parma',date:'2026-08-29',credit:'ICV'});
  assert.equal(state.albums[0].published,false);
  let r=await onRequest({request:request('admin/match-gallery',{action:'publish',revision:state.revision,album_id:state.selected_id}),env});assert.equal(r.status,400);
  await action('upload',{image_data:png,width:1,height:1,rights_confirmed:true});
  assert.equal(db.bucket.public,false);assert.equal(db.objects.size,1);
  const first=state.albums[0].photos[0].id;
  r=await onRequest({request:request('public/match-photo?id='+first,null,false),env});assert.equal(r.status,404);
  r=await onRequest({request:request('admin/match-photo?id='+first),env});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok((await r.arrayBuffer()).byteLength>16);
  await action('upload',{image_data:png,width:1,height:1,rights_confirmed:true});
  const second=state.albums[0].photos[1].id;
  await action('caption',{photo_id:second,caption:'Esultanza'});
  await action('update',{title:'Juventus - Parma',date:'2026-08-29',credit:'ICV',captions:[{photo_id:first,caption:'Stadio'}]});
  assert.equal(state.albums[0].photos[0].caption,'Stadio');
  await action('move',{photo_id:second,direction:-1});assert.equal(state.albums[0].photos[0].id,second);
  await action('publish');
  const pub=await (await onRequest({request:request('public/match-gallery',null,false),env})).json();
  assert.equal(pub.gallery.photos[0].caption,'Esultanza');
  assert.equal(pub.gallery.photos[0].path,undefined);assert.ok(!JSON.stringify(pub).includes('test-service'));
  r=await onRequest({request:request('public/match-photo?id='+first,null,false),env});assert.equal(r.status,200);
  await action('hide');r=await onRequest({request:request('public/match-photo?id='+first,null,false),env});assert.equal(r.status,404);
  await action('remove',{photo_id:first});assert.equal(db.objects.size,1);
  await action('delete');assert.equal(db.objects.size,0);assert.equal(state.albums.length,0);
});

test('upload e lettura bozze richiedono sempre autenticazione',async()=>{
  for(const path of ['admin/match-gallery','admin/match-photo?id=00000000-0000-0000-0000-000000000000']){
    const r=await onRequest({request:request(path,null,false),env});assert.equal(r.status,401);
  }
  const r=await onRequest({request:request('admin/match-gallery',{action:'create'},false),env});assert.equal(r.status,401);
});

test('rifiuta formati attivi, MIME falsi, file enormi e date non valide',async(t)=>{
  for(const data of ['data:image/svg+xml;base64,PHN2Zz4=',png.replace('image/png','image/jpeg'),'data:image/jpeg;base64,'+'A'.repeat(3000000)])assert.throws(()=>decodePhoto(data));
  const db=galleryStore();t.mock.method(globalThis,'fetch',db.fetch);
  const r=await onRequest({request:request('admin/match-gallery',{action:'create',revision:'initial',title:'Prova',date:'2026-02-31'}),env});assert.equal(r.status,400);assert.equal(db.value,null);
});

test('due schede admin non si sovrascrivono e i file non salvati vengono puliti',async(t)=>{
  const db=galleryStore();let race=false;
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    if(race && options.method==='PATCH' && String(input).includes('/site_settings'))return Response.json([]);
    return db.fetch(input,options);
  });
  const created=await (await onRequest({request:request('admin/match-gallery',{action:'create',revision:'initial',title:'Partita',date:'2026-08-29'}),env})).json();
  let r=await onRequest({request:request('admin/match-gallery',{action:'hide',revision:'stale',album_id:created.selected_id}),env});assert.equal(r.status,409);
  race=true;
  r=await onRequest({request:request('admin/match-gallery',{action:'upload',revision:created.revision,album_id:created.selected_id,image_data:png,width:1,height:1,rights_confirmed:true}),env});
  assert.equal(r.status,409);assert.equal(db.objects.size,0);assert.equal(db.value.albums[0].photos.length,0);
});

test('errore archivio non si trasforma in album vuoto sovrascrivibile',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('Unavailable',{status:503}));
  const r=await onRequest({request:request('admin/match-gallery'),env});assert.equal(r.status,500);
});

test('upload senza consenso e accesso a foto sconosciute sono bloccati',async(t)=>{
  const db=galleryStore();t.mock.method(globalThis,'fetch',db.fetch);
  const a=await (await onRequest({request:request('admin/match-gallery',{action:'create',revision:'initial',title:'Partita',date:'2026-08-29'}),env})).json();
  const r=await onRequest({request:request('admin/match-gallery',{action:'upload',revision:a.revision,album_id:a.selected_id,image_data:png,width:1,height:1}),env});assert.equal(r.status,400);assert.equal(db.objects.size,0);
  for(const id of ['../../other','00000000-0000-0000-0000-000000000000'])assert.equal((await onRequest({request:request('public/match-photo?id='+id,null,false),env})).status,404);
});

test('JSON nullo o primitivo restituisce un errore di validazione',async(t)=>{
  const db=galleryStore();t.mock.method(globalThis,'fetch',db.fetch);
  for(const body of ['null','[]','42']){
    const request=new Request('https://icv.test/api/admin/match-gallery',{method:'POST',headers:{'Content-Type':'application/json','X-ICV-Admin-Token':'test-admin'},body});
    assert.equal((await onRequest({request,env})).status,400);
  }
});
