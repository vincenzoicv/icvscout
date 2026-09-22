import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const highlights=readFileSync(new URL('../assets/featured-highlights.css',import.meta.url),'utf8');
const calendar=readFileSync(new URL('../calendario-juventus.html',import.meta.url),'utf8');

test('narrow Match Hub uses stable team columns without arbitrary word breaks',()=>{
  assert.match(home,/\.match-hub-teams\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\);width:100%;gap:8px;\}/);
  assert.match(home,/\.match-hub-team\{min-width:0;font-size:26px;overflow-wrap:break-word;word-break:normal;hyphens:none;\}/);
});

test('featured highlights remain bounded by their mobile container',()=>{
  assert.match(highlights,/\.featured-highlights\{[^}]*width:100%;max-width:100%;min-width:0;/);
  assert.match(highlights,/\.highlights-stage\{[^}]*width:100%;max-width:100%;min-width:0;/);
  assert.match(highlights,/@media\(max-width:650px\)[\s\S]*\.highlights-stage\{min-height:0;\}/);
});

test('calendar puts the next fixture and subscription action ahead of the longer introduction',()=>{
  const hero=calendar.slice(calendar.indexOf('<section class="hero">'),calendar.indexOf('<main>'));
  assert.ok(hero.indexOf('id="nextMatch"')<hero.indexOf('class="lead"'));
  assert.ok(hero.indexOf('Aggiungi al calendario')<hero.indexOf('id="calendarOptions"'));
  assert.match(calendar,/@media\(max-width:900px\)\{\.hero\{min-height:0;display:block/);
  assert.match(calendar,/\.next-match-link\{width:100%;margin-top:15px\}/);
});
