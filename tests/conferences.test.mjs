import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseConference,conferencePhase,instagramPost,instagramThumbnail} from '../functions/lib/conferences.js';
import {onRequest} from '../functions/api/[[path]].js';

const now=Date.parse('2026-08-30T12:00:00Z');
const pre={id:1,platform:'instagram',instagram_id:'ig1',media_type:'video',status:'published',visible:true,post_url:'https://www.instagram.com/reel/PRE/',caption:'Conferenza stampa di Spalletti prima di Juventus Parma',published_at:'2026-08-28T15:00:00Z'};
const post={...pre,id:2,instagram_id:'ig2',post_url:'https://www.instagram.com/reel/POST/',caption:'La conferenza stampa di Spalletti post Juventus Parma',published_at:'2026-08-30T11:00:00Z'};
test('l ultima conferenza post partita sostituisce la pre, non gli altri reel',()=>{
  const interview={...post,id:3,caption:'Prima intervista di Grabara',published_at:'2026-08-30T11:59:00Z'};
  assert.equal(chooseConference([pre,interview,post],{},now).id,2);
  assert.equal(chooseConference([pre,interview],{},now).phase,'pre');
  for(const text of ['Conferenza stampa post-partita','Conferenza stampa #postpartita','Conferenza stampa dopo Juventus Parma'])assert.equal(conferencePhase({caption:text}),'post');
  assert.equal(conferencePhase({caption:'Conferenza stampa alla vigilia di Juve Milan'}),'pre');
  assert.equal(conferencePhase({caption:'Nuovo acquisto ufficiale'}),null);
});
test('controlli editoriali: manuale, nascosta, video non pubblicati e date future',()=>{
  assert.equal(chooseConference([pre,post],{mode:'manual',post_id:1,phase:'pre'},now).id,1);
  assert.equal(chooseConference([pre],{mode:'off'},now),null);
  for(const row of [{...pre,visible:false},{...pre,status:'draft'},{...pre,media_type:'image'},{...pre,instagram_id:null},{...pre,published_at:'bad'},{...pre,published_at:'2030-01-01'}])assert.equal(chooseConference([row],{},now),null);
  assert.equal(chooseConference([pre],{mode:'manual',post_id:99},now),null);
});
test('URL sicuri, nessun URL MP4 o URL firmato nel risultato pubblico',()=>{
  assert.equal(instagramPost('https://www.instagram.com/p/ABC/?igsh=x'),'https://www.instagram.com/p/ABC/');
  for(const url of ['http://instagram.com/reel/A/','https://instagram.com.evil.test/reel/A/','https://a@instagram.com/reel/A/','javascript:alert(1)'])assert.equal(instagramPost(url),null);
  assert.ok(instagramThumbnail('https://scontent.cdninstagram.com/photo.jpg'));
  for(const url of ['https://evil.test/p','https://cdninstagram.com.evil.test/p','http://scontent.cdninstagram.com/p','https://127.0.0.1/p'])assert.equal(instagramThumbnail(url),null);
  const selected=chooseConference([{...pre,media_url:'secret-mp4',thumbnail_url:'signed-url'}],{},now);
  assert.equal(selected.media_url,undefined);assert.match(selected.thumbnail_url,/^\/api\/public\/conference-thumbnail/);
});
test('il salvataggio della selezione richiede autenticazione amministratore',async()=>{
  const result=await onRequest({request:new Request('https://example.test/api/admin/news',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'featured_conference',mode:'off'})}),env:{ADMIN_TOKEN:'test-only'}});
  assert.equal(result.status,401);
});

test('API home seleziona la conferenza oltre il limite dei tre post; salvataggio manuale persistente',async(t)=>{
  let setting=null;
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input);calls.push(url.pathname+url.search);
    if(url.pathname.endsWith('/site_settings')){
      if(options.method==='POST')setting=JSON.parse(options.body)[0].value;
      if(options.method==='PATCH')setting=JSON.parse(options.body).value;
      return Response.json(setting ? [{key:'featured_conference',value:setting}] : []);
    }
    if(url.pathname.endsWith('/social_drafts'))return Response.json(url.searchParams.get('id')==='eq.1' ? [pre] : [pre,post]);
    return Response.json([]);
  });
  const env={ADMIN_TOKEN:'test',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
  const home=await onRequest({request:new Request('https://example.test/api/public/home'),env});
  assert.equal((await home.json()).featured_conference.id,2);
  assert.ok(calls.some(url=>url.includes('media_type=eq.video') && url.includes('limit=100')));
  const response=await onRequest({request:new Request('https://example.test/api/admin/news',{method:'PATCH',headers:{'X-ICV-Admin-Token':'test','Content-Type':'application/json'},body:JSON.stringify({type:'featured_conference',mode:'manual',post_id:1,phase:'pre'})}),env});
  assert.equal(response.status,200);assert.equal(setting.mode,'manual');
  assert.equal((await response.json()).featured_conference.id,1);
});

test('importazione aggiorna la miniatura ma non riattiva un contenuto nascosto',async(t)=>{
  let payload;
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input);
    if(url.hostname==='graph.instagram.com')return Response.json({data:[{id:'ig1',permalink:pre.post_url,caption:pre.caption,media_type:'VIDEO',thumbnail_url:'https://scontent.cdninstagram.com/new.jpg',timestamp:pre.published_at}]});
    if(url.pathname.endsWith('/social_drafts')){
      if(options.method==='PATCH'){payload=JSON.parse(options.body);return Response.json([]);}
      return Response.json([{id:1,visible:false}]);
    }
    return Response.json([]);
  });
  const env={ADMIN_TOKEN:'test',IG_ACCESS_TOKEN:'test',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
  const response=await onRequest({request:new Request('https://example.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':'test','Content-Type':'application/json'},body:JSON.stringify({action:'instagram_import'})}),env});
  assert.equal(response.status,200);assert.equal(payload.visible,false);assert.match(payload.thumbnail_url,/new.jpg/);
});
