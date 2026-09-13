import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const highlights=readFileSync(new URL('../assets/featured-highlights.css',import.meta.url),'utf8');

test('narrow Match Hub uses stable team columns without arbitrary word breaks',()=>{
  assert.match(home,/\.match-hub-teams\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\);width:100%;gap:8px;\}/);
  assert.match(home,/\.match-hub-team\{min-width:0;font-size:26px;overflow-wrap:break-word;word-break:normal;hyphens:none;\}/);
});

test('featured highlights remain bounded by their mobile container',()=>{
  assert.match(highlights,/\.featured-highlights\{[^}]*width:100%;max-width:100%;min-width:0;/);
  assert.match(highlights,/\.highlights-stage\{[^}]*width:100%;max-width:100%;min-width:0;/);
  assert.match(highlights,/@media\(max-width:650px\)[\s\S]*\.highlights-stage\{min-height:0;\}/);
});
