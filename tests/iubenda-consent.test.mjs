import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(dnt = '0') {
  let expressed = false, purposes = {}, opened = 0;
  const values = new Map([['icv_privacy_preferences', JSON.stringify({version:3, analytics:true, external_media:true, updated_at:new Date().toISOString()})]]);
  const window = {addEventListener(){}, dispatchEvent(){}, clearTimeout(){}, fetch:async()=>{throw new Error('CMP receipts belong to iubenda');}};
  const document = {readyState:'loading', addEventListener(){}, removeEventListener(){}, querySelector(){return null;},
    getElementById(){return {};}, body:{appendChild(){}},
    createElement(){return {setAttribute(){},addEventListener(){},remove(){}};}};
  vm.runInNewContext(fs.readFileSync('assets/privacy-controls.js', 'utf8'), {
    window, document, location:{pathname:'/'}, navigator:{doNotTrack:dnt}, Date, JSON,
    crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'},
    localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},
    sessionStorage:{removeItem(){}}, CustomEvent:class {constructor(name,options){Object.assign(this,options);}}
  });
  window._iub.cs = {api:{getPreferences:()=>({purposes}),isPreferenceExpressed:()=>expressed,openPreferences:()=>{opened++;}}};
  return {window, api:window.ICVPrivacy, set(p, e=true){purposes=p;expressed=e;window._iub.csConfiguration.callback.onReady();}, opened:()=>opened};
}

test('CMP ignores legacy grants, maps explicit purposes and propagates revocation', () => {
  const s = setup();
  assert.equal(s.api.enabled('analytics'),false);
  assert.equal(s.api.enabled('external_media'),false);
  s.set({3:true,4:true},false);
  assert.equal(s.api.enabled('external_media'),false);
  s.set({3:true,4:false});
  assert.equal(s.api.enabled('external_media'),true);
  assert.equal(s.api.enabled('analytics'),false);
  s.set({3:false,4:true});
  assert.equal(s.api.enabled('external_media'),false);
  assert.equal(s.api.enabled('analytics'),true);
  s.set({3:false,4:false});
  assert.equal(s.api.enabled('analytics'),false);
});

test('media clicks open CMP without granting consent and DNT still wins', () => {
  const s=setup('1'); s.set({3:false,4:true});
  assert.equal(s.api.enabled('analytics'),false);
  s.api.save({analytics:true,external_media:true});
  assert.equal(s.opened(),1);
  assert.equal(s.api.enabled('external_media'),false);
  const config=s.window._iub.csConfiguration;
  assert.equal(config.purposes,'1,3,4');
  assert.equal(config.cookiePolicyUrl,'https://ilcalciodivince.com/cookie-policy');
  assert.equal(config.banner.rejectButtonDisplay,true);
  assert.equal(config.preferenceCookie.expireAfter,180);
});

test('every click-to-load video rechecks permission after requesting it', () => {
  for(const file of ['assets/featured-highlights.js','assets/featured-conference.js','assets/editorial-videos.js']) {
    assert.match(fs.readFileSync(file,'utf8'), /if\(!window\.ICVPrivacy\.enabled\('external_media'\)\)return;/);
  }
});

test('CMP failure starts a deny-by-default local fallback and late recovery returns control to CMP', () => {
  const s=setup();
  s.window._iub.csConfiguration.callback.onStartupFailed();
  assert.equal(s.api.enabled('analytics'),false);
  assert.equal(s.api.enabled('external_media'),false);
  s.api.save({analytics:false,external_media:true},'media');
  assert.equal(s.api.enabled('external_media'),true);
  s.set({},false);
  assert.equal(s.api.enabled('external_media'),false);
});
