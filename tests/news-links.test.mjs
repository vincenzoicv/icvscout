import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const community=readFileSync(new URL('../community.html',import.meta.url),'utf8');

test('community resolves internal news detail links from the home page',()=>{
  assert.match(community,/new URLSearchParams\(location\.search\)\.get\("news"\)/);
  assert.match(community,/if\(\/\^\\d\+\$\/\.test\(newsLink\|\|""\)\)openSavedNews\(newsLink\)/);
  assert.match(community,/async function openSavedNews\(id\).*?communityApi\("news\/"\+id\)/s);
});
