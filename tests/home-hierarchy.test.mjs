import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const conference=readFileSync(new URL('../assets/featured-conference.js',import.meta.url),'utf8');

test('home prioritizes live updates and news before editorial video sections',()=>{
  const match=home.indexOf('id="homeMatchHub"');
  const live=home.indexOf('id="homeLiveDeskPanel"');
  const news=home.indexOf('id="homeNewsList"');
  const highlights=home.indexOf('id="featuredHighlights"');
  const conferenceSection=home.indexOf('id="featuredConference"');
  assert.ok(match<live && live<news && news<highlights && highlights<conferenceSection);
});

test('home keeps the conference preview concise while Media can retain the archive',()=>{
  assert.match(conference,/slice\(0,root\.dataset\.archive==='true'\?100:3\)/);
  assert.match(home,/href="\/media">Archivio media/);
});

test('Match Hub starts neutral and only becomes ready after current data renders',()=>{
  assert.match(home,/id="homeMatchHub"[^>]*data-state="loading"[^>]*aria-busy="true"/);
  assert.match(home,/id="matchHubPhaseTitle">Caricamento prossima partita</);
  assert.doesNotMatch(home,/id="matchHubPhaseTitle">Verso Juventus FC-Parma Calcio 1913</);
  assert.match(home,/function renderMatchHub\(apiRows\)[\s\S]*?hub\.setAttribute\("aria-busy", "false"\)/);
});

test('news open a real destination with safe external-link behavior',()=>{
  assert.ok(home.includes('var sourceUrl = /^https:\\/\\//i.test(String(n.source_url || "")) ? String(n.source_url) : "";'));
  assert.ok(home.includes("class='news-card-link'"));
  assert.ok(home.includes("target='_blank' rel='noopener noreferrer'"));
  assert.ok(home.includes('var sourceUrl=/^https:\\/\\//i.test(String(n.source_url||""))?String(n.source_url):"";'));
  assert.ok(home.includes('external?" target=\'_blank\' rel=\'noopener noreferrer\'":""'));
});
