import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DEFAULT_HIGHLIGHTS,highlightsVideoId,highlightsSetting,publicHighlights} from '../functions/lib/highlights.js';
import {onRequest} from '../functions/api/[[path]].js';

const env={ADMIN_TOKEN:'preview-test',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
const id='n2loI5kB-vc';
const adminHtml=readFileSync(new URL('../icv_admin.html',import.meta.url),'utf8');
function req(path,body,auth=true){return new Request('https://example.test/api/'+path,body?{method:'PATCH',headers:{'Content-Type':'application/json',...(auth?{'X-ICV-Admin-Token':'preview-test'}:{})},body:JSON.stringify(body)}:{});}
function mockDb(t){
  const state={setting:null,failed:false,imageStatus:200,imageType:'image/jpeg',imageSize:3,imageCalls:0};
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input);
    if(url.hostname==='i.ytimg.com'){
      state.imageCalls++;assert.equal(options.redirect,'manual');assert.ok(['/vi/'+id+'/maxresdefault.jpg','/vi/'+id+'/hqdefault.jpg'].includes(url.pathname));
      return new Response(new Uint8Array(state.imageSize),{status:state.imageStatus,headers:{'Content-Type':state.imageType}});
    }
    if(url.pathname.endsWith('/site_settings') && (url.searchParams.get('key')==='eq.featured_highlights' || options.method==='POST')){
      if(state.failed)return Response.json({message:'unavailable'},{status:503});
      if(options.method==='POST')state.setting=JSON.parse(options.body)[0].value;
      if(options.method==='PATCH')state.setting=JSON.parse(options.body).value;
      return Response.json(state.setting?[{key:'featured_highlights',value:state.setting}]:[]);
    }
    return Response.json([]);
  });return state;
}
test('YouTube URL normalization rejects other hosts, scripts, credentials and malformed IDs',()=>{
  for(const url of [DEFAULT_HIGHLIGHTS.video_url,'https://youtu.be/'+id+'?si=example','https://m.youtube.com/watch?v='+id,'https://youtube.com/embed/'+id])assert.equal(highlightsVideoId(url),id);
  for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v='+id,'http://youtube.com/watch?v='+id,'https://me@youtube.com/watch?v='+id,'https://youtube.com:444/watch?v='+id,'https://youtu.be/'+id+'/evil','https://youtube.com/watch?v=x'])assert.equal(highlightsVideoId(url),null);
  assert.throws(()=>highlightsSetting({mode:'auto'}));
  assert.throws(()=>highlightsSetting({...DEFAULT_HIGHLIGHTS,title:'  '}));
  assert.equal(publicHighlights({mode:'off'}),null);
  assert.equal(publicHighlights(DEFAULT_HIGHLIGHTS).thumbnail_url,'/api/public/highlights-thumbnail?id='+id);
});
test('admin gives highlights a dedicated, labelled panel',()=>{
  assert.match(adminHtml,/data-tab="highlights"[^>]*>Highlights<\/button>/);
  assert.match(adminHtml,/data-panel="highlights"/);
  assert.match(adminHtml,/label for="highlightsUrl">Link YouTube highlights<\/label>/);
  assert.doesNotMatch(adminHtml,/data-panel="advanced"[\s\S]*data-panel="highlights"[\s\S]*<div id="matchList">/);
});
test('manual selection persists in admin and home; off does not restore the seed',async(t)=>{
  const state=mockDb(t);
  let response=await onRequest({request:req('public/home'),env});
  assert.equal((await response.json()).featured_highlights.video_id,id);
  response=await onRequest({request:req('admin/news',{type:'featured_highlights',...DEFAULT_HIGHLIGHTS,title:'Titolo aggiornato'}),env});
  assert.equal(response.status,200);assert.equal(state.setting.title,'Titolo aggiornato');
  response=await onRequest({request:req('admin/news'),env:{...env}});
  assert.equal(response.status,401);
  response=await onRequest({request:new Request('https://example.test/api/admin/news',{headers:{'X-ICV-Admin-Token':'preview-test'}}),env});
  assert.equal((await response.json()).highlights_config.title,'Titolo aggiornato');
  await onRequest({request:req('admin/news',{type:'featured_highlights',...DEFAULT_HIGHLIGHTS,mode:'off'}),env});
  response=await onRequest({request:req('public/home'),env});assert.equal((await response.json()).featured_highlights,null);
  response=await onRequest({request:req('public/highlights-thumbnail?id='+id),env});assert.equal(response.status,404);
  state.failed=true;response=await onRequest({request:req('public/home'),env});assert.equal((await response.json()).featured_highlights,null);
});
test('unauthorized or invalid writes cannot change highlights',async(t)=>{
  const state=mockDb(t);
  for(const [body,auth,status] of [[{...DEFAULT_HIGHLIGHTS},false,401],[{...DEFAULT_HIGHLIGHTS,video_url:'https://evil.test'},true,400],[{mode:'auto'},true,400]]){
    const response=await onRequest({request:req('admin/news',{type:'featured_highlights',...body},auth),env});
    assert.equal(response.status,status);assert.equal(state.setting,null);
  }
});
test('thumbnail is limited to the published video and a bounded JPEG response',async(t)=>{
  const state=mockDb(t);
  const request=req('public/highlights-thumbnail?id='+id);
  let response=await onRequest({request,env});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,3);
  response=await onRequest({request:req('public/highlights-thumbnail?id=aaaaaaaaaaa'),env});assert.equal(response.status,404);assert.equal(state.imageCalls,1);
  state.imageStatus=302;assert.equal((await onRequest({request,env})).status,502);
  state.imageStatus=200;state.imageType='text/html';assert.equal((await onRequest({request,env})).status,502);
  state.imageType='image/jpeg';state.imageSize=2*1024*1024+1;assert.equal((await onRequest({request,env})).status,502);
});

function playerHarness(){
  class Element{
    constructor(){this.hidden=false;this.children=[];this.listeners={};this.attributes={};this.textContent='';}
    addEventListener(name,fn){this.listeners[name]=fn;}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];if(name==='src')delete this.src;}
    replaceChildren(){this.children=[];}
    append(child){this.children.push(child);}
    get childElementCount(){return this.children.length;}
    focus(){}
  }
  const elements=Object.fromEntries(['featuredHighlights','highlightsStage','highlightsEmbed','highlightsPlay','highlightsStop','highlightsPoster','highlightsStatus','highlightsHeading','highlightsOriginal'].map(id=>[id,new Element()]));
  const listeners={},document={getElementById:id=>elements[id],createElement:()=>new Element(),addEventListener:(name,fn)=>listeners[name]=fn};
  let consent=false;
  const window={addEventListener:(name,fn)=>listeners[name]=fn,ICVPrivacy:{enabled:()=>consent,get:()=>({external_media:consent}),save:value=>{consent=value.external_media;listeners['icv:privacychange']();}}};
  vm.runInNewContext(readFileSync(new URL('../assets/featured-highlights.js',import.meta.url),'utf8'),{document,window,location:{hash:''},setTimeout:()=>1,clearTimeout:()=>{},IntersectionObserver:class{observe(){}}});
  return {elements,window,listeners};
}
test('player is click-only, preserves playback on refresh and closes on consent revocation or hide',()=>{
  const {elements:e,window:w}=playerHarness();
  w.ICVHighlights.render(publicHighlights(DEFAULT_HIGHLIGHTS));
  assert.equal(e.highlightsEmbed.childElementCount,0);assert.match(e.highlightsPoster.src,/^\/api\//);
  e.highlightsPlay.listeners.click();
  const frame=e.highlightsEmbed.children[0];assert.match(frame.src,/^https:\/\/www.youtube-nocookie.com\/embed\/n2loI5kB-vc\?playsinline=1$/);assert.equal(frame.referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(w.ICVPrivacy.enabled(),true);
  w.ICVHighlights.render(publicHighlights(DEFAULT_HIGHLIGHTS));assert.equal(e.highlightsEmbed.children[0],frame);
  w.ICVPrivacy.save({external_media:false});assert.equal(e.highlightsEmbed.childElementCount,0);
  e.highlightsPlay.listeners.click();w.ICVHighlights.render(null);assert.equal(e.highlightsEmbed.childElementCount,0);assert.equal(e.featuredHighlights.hidden,true);
});
test('player rejects invalid data and remains usable without privacy script or thumbnail',()=>{
  const {elements:e,window:w}=playerHarness();
  w.ICVHighlights.render({video_id:'../evil'});assert.equal(e.featuredHighlights.hidden,true);
  w.ICVHighlights.render(publicHighlights(DEFAULT_HIGHLIGHTS));
  e.highlightsPoster.listeners.error();assert.equal(e.highlightsPoster.hidden,true);
  delete w.ICVPrivacy;e.highlightsPlay.listeners.click();assert.equal(e.highlightsEmbed.childElementCount,0);assert.match(e.highlightsStatus.textContent,/Guarda su YouTube/);
});
