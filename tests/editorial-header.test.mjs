import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const editorialPages=['classifica.html','media.html','calendario-juventus.html'];

test('editorial pages share the same complete navigation and brand treatment',()=>{
  for(const page of editorialPages){
    const html=file(page);
    assert.match(html,/class="page-header"/);
    assert.match(html,/class="page-brand-copy"/);
    assert.match(html,/<small>Il Calcio di Vince<\/small>/);
    assert.match(html,/<nav aria-label="Menu principale">/);
    for(const href of ['/','/classifica?competizione=serie-a','/classifica?competizione=europa-league','/calendario-juventus','/media','/community','/news']){
      assert.match(html,new RegExp(`href="${href.replace(/[?]/g,'\\?')}"`));
    }
    assert.match(html,/id="pageTheme"/);
    assert.match(html,/section-pages\.css\?v=20260916-1/);
    assert.match(html,/section-pages\.js\?v=20260913-1/);
  }
});

test('News ha un archivio dedicato con ricerca e link espliciti a fonte e discussione',()=>{
  const html=file('news.html');
  const js=file('assets/news-page.js');
  assert.match(html,/<title>News Juventus/);
  assert.match(html,/id="newsSearch"/);
  assert.match(html,/href="\/news" aria-current="page"/);
  assert.match(js,/\/api\/public\/news\?limit=30/);
  assert.match(js,/Apri la fonte/);
  assert.match(js,/<h2><a href=/);
  assert.match(js,/Discussione ICV/);
  assert.match(js,/url\.protocol==='https:'/);
});

test('shared header stays visible and synchronizes the browser theme color',()=>{
  const css=file('assets/section-pages.css');
  const js=file('assets/section-pages.js');
  assert.match(css,/\.page-header\{position:sticky;top:0;z-index:100/);
  assert.match(css,/\.page-brand-copy\{display:flex;flex-direction:column/);
  assert.match(css,/backdrop-filter:blur\(20px\)/);
  assert.match(js,/replace\(\/\\\.html\$\//);
  assert.match(js,/getElementById\('themeColor'\)/);
});

test('main editorial pages expose the Google preferred-source action',()=>{
  const pages=['index.html',...editorialPages];
  for(const page of pages){
    const html=file(page);
    assert.match(html,/https:\/\/www\.google\.com\/preferences\/source\?q=ilcalciodivince\.com/);
    assert.match(html,/Segui su Google/);
    assert.match(html,/rel="noopener noreferrer"/);
  }
});
