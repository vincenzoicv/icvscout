import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const publicPages=[
  'index.html','classifica.html','calendario-juventus.html','community.html',
  'media.html','news.html','mercato.html','grafiche.html','giocatore.html','agenda.html',
  'quiz.html','mondiali.html','privacy.html','cookie-policy.html',
  'regolamento-community.html',
];
const ui=readFileSync(new URL('assets/icv-ui-system.css',root),'utf8');

test('le pagine pubbliche usano la base visiva condivisa',()=>{
  for(const page of publicPages){
    const html=readFileSync(new URL(page,root),'utf8');
    assert.match(html,/\/assets\/icv-ui-system\.css\?v=20260925-1/,page);
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
  assert.match(ui,/--icv-motion-reveal:240ms;[\s\S]*--icv-motion-hero:420ms/);
  assert.match(ui,/min-height:var\(--icv-control-height\)!important/);
  assert.match(ui,/@media\(prefers-reduced-motion:reduce\)/);
});

test('Riduci movimento disattiva animazioni, transizioni e scorrimenti fluidi anche via JavaScript',()=>{
  assert.match(ui,/animation:none!important/);
  assert.match(ui,/transition:none!important/);
  assert.match(ui,/scroll-behavior:auto!important/);
  const home=readFileSync(new URL('index.html',root),'utf8');
  const community=readFileSync(new URL('community.html',root),'utf8');
  const quiz=readFileSync(new URL('quiz.html',root),'utf8');
  const lineup=readFileSync(new URL('src/lineup-pitch-3d.js',root),'utf8');
  assert.match(home,/icvReducedMotion\(\)\?"auto":"smooth"/);
  assert.match(home,/motionQuery\.addEventListener\("change",\s*syncMotionPreference\)/);
  assert.match(community,/matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\?"auto":"smooth"/);
  assert.match(quiz,/matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\?"auto":"smooth"/);
  assert.match(lineup,/stopIntroForReducedMotion/);
});

test('Orbit accompagna solo gli stati iniziali di caricamento e resta fermo con Riduci movimento',()=>{
  assert.match(ui,/\.icv-orbit-loader::before/);
  assert.match(ui,/\.icv-orbit-loader::after/);
  assert.match(ui,/\.icv-orbit-loader\{border-color:/);
  assert.match(ui,/\.loading--orbit\{display:flex/);
  const home=readFileSync(new URL('index.html',root),'utf8');
  const calendar=readFileSync(new URL('calendario-juventus.html',root),'utf8');
  const agenda=readFileSync(new URL('agenda.html',root),'utf8');
  assert.doesNotMatch(home,/Verificato ora|matchHubUpdated/);
  assert.equal((calendar.match(/class="loading loading--orbit" role="status"><span class="icv-orbit-loader" aria-hidden="true">/g)||[]).length,3);
  assert.match(agenda,/class="loading loading--orbit" role="status"><span class="icv-orbit-loader" aria-hidden="true">/);
});

test('le animazioni di ingresso della home usano ritmi condivisi',()=>{
  const home=readFileSync(new URL('index.html',root),'utf8');
  const animationBlock=home.slice(home.indexOf('function animateLiveDeskRows'),home.indexOf('function setupRevealAnimations'));
  assert.doesNotMatch(animationBlock,/duration:\s*(440|460|480|560|620|920)/);
  assert.match(home,/var ICV_MOTION = \{ reveal: 240, hero: 420 \}/);
  assert.match(animationBlock,/duration:\s*ICV_MOTION\.reveal/);
  assert.match(animationBlock,/duration:\s*ICV_MOTION\.hero/);
});
