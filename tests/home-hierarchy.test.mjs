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
