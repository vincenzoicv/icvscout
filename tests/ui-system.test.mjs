import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const publicPages=[
  'index.html','classifica.html','calendario-juventus.html','community.html',
  'media.html','mercato.html','grafiche.html','giocatore.html','agenda.html',
  'quiz.html','mondiali.html','privacy.html','cookie-policy.html',
  'regolamento-community.html',
];
const ui=readFileSync(new URL('assets/icv-ui-system.css',root),'utf8');

test('le pagine pubbliche usano la base visiva condivisa',()=>{
  for(const page of publicPages){
    const html=readFileSync(new URL(page,root),'utf8');
    assert.match(html,/\/assets\/icv-ui-system\.css\?v=20260923-2/,page);
  }
});

test('il sistema visivo definisce ruoli, spazi, controlli e movimento coerenti',()=>{
  assert.match(ui,/--icv-font-display:'Bebas Neue'/);
  assert.match(ui,/--icv-font-body:'Barlow'/);
  assert.match(ui,/--icv-font-label:'Barlow Condensed'/);
  assert.match(ui,/--icv-font-editorial:'Playfair Display'/);
  assert.match(ui,/--icv-space-1:4px;[\s\S]*--icv-space-7:48px/);
  assert.match(ui,/--icv-control-height:44px/);
  assert.match(ui,/--icv-motion-fast:150ms;[\s\S]*--icv-motion-media:240ms/);
  assert.match(ui,/--icv-motion-reveal:520ms;[\s\S]*--icv-motion-hero:680ms/);
  assert.match(ui,/min-height:var\(--icv-control-height\)!important/);
  assert.match(ui,/@media\(prefers-reduced-motion:reduce\)/);
});

test('le animazioni di ingresso della home usano ritmi condivisi',()=>{
  const home=readFileSync(new URL('index.html',root),'utf8');
  const animationBlock=home.slice(home.indexOf('function animateLiveDeskRows'),home.indexOf('function setupRevealAnimations'));
  assert.doesNotMatch(animationBlock,/duration:\s*(440|460|480|560|620|920)/);
  assert.match(animationBlock,/duration:\s*520/);
  assert.match(animationBlock,/duration:\s*680/);
});
