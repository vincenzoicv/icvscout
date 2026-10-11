import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function privacy(stored, dnt = '0') {
  const values = new Map(stored ? [['icv_privacy_preferences', JSON.stringify(stored)]] : []);
  const window = {addEventListener(){}, dispatchEvent(){}};
  vm.runInNewContext(fs.readFileSync('assets/privacy-controls.js', 'utf8'), {
    window, navigator:{doNotTrack:dnt}, Date, JSON,
    document:{readyState:'loading', addEventListener(){}},
    localStorage:{getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value)},
    sessionStorage:{removeItem(){}}, CustomEvent:class {constructor(name,options){Object.assign(this,options);}}
  });
  return window.ICVPrivacy;
}

test('optional categories deny by default and legacy preferences require a new choice', () => {
  for (const stored of [null,{version:1,analytics:true,external_media:true,updated_at:new Date().toISOString()}]) {
    const api=privacy(stored);
    assert.equal(api.enabled('analytics'),false);
    assert.equal(api.enabled('external_media'),false);
    assert.equal(api.enabled('technical'),true);
    assert.equal(api.enabled('unknown'),false);
  }
});
test('explicit consent persists, revocation disables both and Do Not Track wins',()=>{
  const api=privacy();
  api.save({analytics:true,external_media:true});
  assert.equal(api.enabled('analytics'),true);
  assert.equal(api.enabled('external_media'),true);
  api.save({analytics:false,external_media:false});
  assert.equal(api.enabled('analytics'),false);
  assert.equal(api.enabled('external_media'),false);
  const dnt=privacy(null,'1');dnt.save({analytics:true});
  assert.equal(dnt.enabled('analytics'),false);
});
test('expired and malformed preferences cannot activate tracking',()=>{
  for(const updated_at of ['invalid',new Date(Date.now()-181*86400000).toISOString()]){
    const api=privacy({version:2,updated_at,analytics:true,external_media:true});
    assert.equal(api.enabled('analytics'),false);
    assert.equal(api.enabled('external_media'),false);
  }
});

test('analytics sends no request or session identifier before consent or after refusal',()=>{
  let consent=false, requests=0, sessions=0;
  const listeners={};
  const window={ICVPrivacy:{enabled:()=>consent},addEventListener:(key,fn)=>listeners[key]=fn,fetch:async()=>({ok:true})};
  vm.runInNewContext(fs.readFileSync('assets/analytics.js','utf8'),{
    window,Set,URL,URLSearchParams,JSON,Date,Math,Blob,
    location:{search:'',pathname:'/',hostname:'example.test',href:'https://example.test/'},
    navigator:{doNotTrack:'0',sendBeacon:()=>{requests++;}},
    document:{readyState:'complete',cookie:'',referrer:'',addEventListener(){}},
    sessionStorage:{getItem:()=>null,setItem:()=>{sessions++;}},
    crypto:{randomUUID:()=> 'test-session'}
  });
  window.ICVAnalytics.track('navigation');
  assert.equal(requests,0);assert.equal(sessions,0);
  consent=true;listeners['icv:privacychange']();assert.equal(requests,1);
  consent=false;listeners['icv:privacychange']();window.ICVAnalytics.track('navigation');
  assert.equal(requests,1);
});
