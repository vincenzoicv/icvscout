import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function setup({offline=false,cached=null,response=new Response('asset',{headers:{'content-type':'text/css'}})}={}) {
  const handlers={},stored=[],deleted=[];
  let precache=[],fetches=0;
  const cache={addAll:async urls=>{precache=[...urls];},put:async(req)=>stored.push(req.url),keys:async()=>[],delete:async key=>deleted.push(key)};
  const caches={open:async()=>cache,match:async()=>cached,keys:async()=>[],delete:async()=>true};
  const self={location:{origin:'https://icv.test'},addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting(){},clients:{claim(){}}};
  vm.runInNewContext(script,{self,caches,URL,fetch:async()=>{fetches++;if(offline)throw Error('offline');return response;}});
  const request=async(url,{method='GET',mode='cors'}={})=>{
    const pending=[];let result;
    handlers.fetch({request:{url:new URL(url,self.location.origin).href,method,mode},waitUntil:p=>pending.push(p),respondWith:p=>{result=p;}});
    const body=await result;await Promise.all(pending);return body;
  };
  return {handlers,request,stored,deleted,get precache(){return precache;},get fetches(){return fetches;}};
}
test('PWA installation avoids unused device images while preserving offline pages',async()=>{
  const state=setup();let done;
  state.handlers.install({waitUntil:p=>{done=p;}});await done;
  assert.ok(state.precache.includes('/calendario-juventus.html'));
  for(const page of ['/community.html','/quiz.html','/grafiche.html'])assert.ok(state.precache.includes(page));
  assert.ok(!state.precache.some(url=>/splash|hero-allianz|og-image|community-stadium/.test(url)));
  assert.ok(state.precache.length<16);
});
test('API, external requests, monitor data and writes never enter the static cache',async()=>{
  const state=setup();
  for(const url of ['/api/public/home','/data/match-monitor.json','https://other.test/asset.js'])assert.equal(await state.request(url),undefined);
  assert.equal(await state.request('/assets/a.js',{method:'POST'}),undefined);
  assert.equal(state.fetches,0);assert.equal(state.stored.length,0);
});
test('requested static assets are cached and an existing copy works offline',async()=>{
  const state=setup();assert.ok(await state.request('/assets/a.css?v=2'));
  assert.deepEqual(state.stored,['https://icv.test/assets/a.css?v=2']);
  const cached=new Response('offline image');const offline=setup({offline:true,cached});
  assert.equal(await offline.request('/assets/image.webp'),cached);assert.equal(offline.fetches,0);
});
test('HTML fallbacks and failed responses cannot poison static assets',async()=>{
  for(const response of [new Response('<html>',{headers:{'content-type':'text/html'}}),new Response('error',{status:503})]){
    const state=setup({response});await state.request('/assets/a.js');assert.equal(state.stored.length,0);
  }
});
test('offline navigation retains the cached home fallback',async()=>{
  const cached=new Response('home');const state=setup({offline:true,cached});
  assert.equal(await state.request('/',{mode:'navigate'}),cached);
});
