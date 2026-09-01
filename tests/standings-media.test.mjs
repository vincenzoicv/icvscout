import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeStandings,standingsResponse} from '../functions/lib/standings.js';
import {conferenceArchive} from '../functions/lib/conferences.js';
import {publicMatchAlbums} from '../functions/lib/match-gallery.js';
import {onRequest} from '../functions/api/[[path]].js';
const sa=()=>({competition:{code:'SA'},season:{startDate:'2026-08-23'},standings:[{type:'HOME',table:[]},{type:'TOTAL',table:Array.from({length:20},(_,i)=>({position:i+1,playedGames:2,won:2,draw:0,lost:0,points:6,goalsFor:3,goalsAgainst:0,goalDifference:3,team:{id:i===2?109:i+1,name:i===2?'Juventus':'Club '+i}}))}]});
const el=()=>[{competitionId:'14',group:{seasonYear:'2027'},items:Array.from({length:36},(_,i)=>({rank:1,played:0,won:0,drawn:0,lost:0,points:0,goalsFor:0,goalsAgainst:0,goalDifference:0,team:{id:i===2?'50139':String(i+1),internationalName:i===2?'Juventus':'Club '+i}}))}];
test('standings status disappears after loading and retry retains its loading state',async()=>{
  const elements=new Map();
  const element=()=>({textContent:'',hidden:false,children:[],classList:{add(){}},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(type,handler){this[type]=handler;}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  let resolve;
  const context={location:{search:''},URLSearchParams,document:{getElementById:get,querySelector:()=>element(),createElement:element},fetch:()=>new Promise(done=>{resolve=done;})};
  vm.runInNewContext(readFileSync(new URL('../assets/standings-page.js',import.meta.url),'utf8'),context);
  assert.equal(get('standingsStatus').hidden,false);
  resolve({ok:true,json:async()=>({...normalizeStandings(sa(),'SA'),checkedAt:'2026-08-31T12:42:00Z',provider:'football-data.org'})});
  await new Promise(done=>setImmediate(done));
  assert.equal(get('standingsStatus').hidden,true);
  assert.equal(get('standingsStatus').textContent,'');
  assert.equal(get('standingsRows').children.length,20);
  assert.equal(get('standingsContent').hidden,false);
  const retry=get('standingsRetry').click();
  assert.equal(get('standingsStatus').hidden,false);
  assert.match(get('standingsStatus').textContent,/Caricamento/);
  resolve({ok:false});await retry;
  assert.equal(get('standingsStatus').hidden,true);
  assert.equal(get('standingsError').hidden,false);
});
test('Juventus stat cards and chart still update without a duplicate standings table',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="standingsTable"/);
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',style:{}});return elements.get(id);};
  const cards=Array.from({length:6},(_,i)=>({querySelector:selector=>get(i+selector)}));
  const context={JUVE_ID:109,CURRENT_SEASON_LABEL:'2026/27',document:{getElementById:get,querySelectorAll:()=>cards}};
  const fn=html.slice(html.indexOf('function renderStandings(table)'),html.indexOf('// Init',html.indexOf('function renderStandings(table)')));
  vm.runInNewContext(fn+'\nrenderStandings('+JSON.stringify(sa().standings[1].table)+');',context);
  assert.equal(get('0.stat-val').textContent,6);
  assert.equal(get('0.stat-lbl').textContent,'Punti (2 gare)');
  assert.equal(get('1.stat-val').textContent,'1.5');
  assert.equal(get('barv3').textContent,6);
  assert.match(get('statsSecTag').textContent,/2 partite/);
});
test('Serie A uses current season TOTAL table and Juventus identity',()=>{
  const result=normalizeStandings(sa(),'SA');assert.equal(result.table.length,20);assert.equal(result.preseason,false);assert.equal(result.table.find(r=>r.isJuventus).position,3);
  const stale=sa();stale.season.startDate='2025-08-23';assert.throws(()=>normalizeStandings(stale,'SA'));
  const partial=sa();partial.standings[1].table.pop();assert.throws(()=>normalizeStandings(partial,'SA'));
  const invalid=sa();invalid.standings[1].table[0].points=null;assert.throws(()=>normalizeStandings(invalid,'SA'));
});
test('Europa League shows 36 zero-point clubs without fabricated positions',()=>{
  const result=normalizeStandings(el(),'EL');assert.equal(result.preseason,true);assert.equal(result.table.length,36);assert.ok(result.table.every(row=>row.position===null && row.points===0));assert.ok(result.table.some(row=>row.isJuventus));
  const stale=el();stale[0].group.seasonYear='2026';assert.throws(()=>normalizeStandings(stale,'EL'));
});
test('after kickoff UEFA positions and results replace the alphabetical list',()=>{
  const data=el();data[0].items.forEach((row,i)=>{row.rank=i+1;row.played=1;row.drawn=1;row.points=1;});
  const result=normalizeStandings(data,'EL');assert.equal(result.preseason,false);assert.equal(result.table[2].position,3);
});
test('standings endpoint separates providers, auth and cache; upstream errors fail closed',async(t)=>{
  let broken=false;t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(broken)return new Response('offline',{status:503});
    if(String(url).includes('football-data')){assert.equal(options.headers['X-Auth-Token'],'test');assert.ok(String(url).endsWith('season=2026'));return Response.json(sa());}
    assert.equal(options.headers['X-Auth-Token'],undefined);assert.match(String(url),/standings.uefa.com/);return Response.json(el());
  });
  for(const competition of ['SA','EL']){const response=await standingsResponse(new URL('https://example.test/?competition='+competition),{FOOTBALL_DATA_KEY:'test'});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/max-age=300/);assert.equal((await response.json()).competition,competition);}
  assert.equal((await standingsResponse(new URL('https://example.test/?competition=XX'),{})).status,400);
  broken=true;const response=await standingsResponse(new URL('https://example.test/'),{FOOTBALL_DATA_KEY:'test'});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});
const conference={id:1,instagram_id:'ig1',platform:'instagram',media_type:'video',status:'published',visible:true,post_url:'https://www.instagram.com/reel/OLD/',caption:'Conferenza stampa post partita',published_at:'2026-06-01T10:00:00Z',thumbnail_url:'https://scontent.cdninstagram.com/p.jpg'};
const album={id:'album',title:'Partita',date:'2026-08-29',published:true,credit:'ICV',photos:[{id:'photo',caption:'Esultanza',width:800,height:600,path:'private/storage/path'}]};
test('conference archive keeps old published posts but excludes hidden, draft, future and duplicate records',()=>{
  const rows=[conference,{...conference,id:2},{...conference,id:3,visible:false},{...conference,id:4,status:'draft'},{...conference,id:5,published_at:'2030-01-01'}];
  assert.equal(conferenceArchive(rows,{},Date.parse('2026-08-31')).length,1);assert.deepEqual(conferenceArchive(rows,{mode:'off'}),[]);
  assert.ok(!JSON.stringify(conferenceArchive(rows,{})).includes('cdninstagram'));
});
test('photo archive only exposes published nonempty albums without private storage paths',()=>{
  const state={featured_id:'other',albums:[album,{...album,id:'draft',published:false},{...album,id:'empty',photos:[]}]};
  const result=publicMatchAlbums(state);assert.equal(result.length,1);assert.equal(result[0].id,'album');assert.equal(result[0].photos[0].url,'/api/public/match-photo?id=photo');assert.ok(!JSON.stringify(result).includes('private/'));
});
test('public media API returns authorized archive metadata and hides disabled conferences',async(t)=>{
  let off=false;t.mock.method(globalThis,'fetch',async(input)=>{
    const url=new URL(input);
    if(url.pathname.endsWith('/social_drafts'))return Response.json([conference]);
    if(url.searchParams.get('key')==='eq.featured_conference')return Response.json([{value:{mode:off?'off':'auto'}}]);
    if(url.searchParams.get('key')==='eq.match_photo_gallery')return Response.json([{value:{revision:'r1',albums:[album],featured_id:'album'}}]);
    return Response.json([]);
  });
  const request=new Request('https://example.test/api/public/media'),env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
  let response=await onRequest({request,env});assert.equal(response.status,200);let data=await response.json();assert.equal(data.conferences.length,1);assert.equal(data.albums.length,1);
  off=true;data=await (await onRequest({request,env})).json();assert.equal(data.conferences.length,0);assert.equal(data.albums.length,1);
});
test('archive thumbnail remains protected for old hidden or disabled posts',async(t)=>{
  let hidden=false,off=false;t.mock.method(globalThis,'fetch',async(input)=>{
    const url=new URL(input);
    if(url.hostname==='scontent.cdninstagram.com')return new Response('image',{headers:{'content-type':'image/jpeg'}});
    if(url.pathname.endsWith('/site_settings'))return Response.json([{value:{mode:off?'off':'auto'}}]);
    if(url.pathname.endsWith('/social_drafts'))return Response.json(url.searchParams.has('id')?[{...conference,visible:!hidden}]:[]);
    return Response.json([]);
  });
  const request=new Request('https://example.test/api/public/conference-thumbnail?id=1'),env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
  assert.equal((await onRequest({request,env})).status,200);hidden=true;assert.equal((await onRequest({request,env})).status,404);hidden=false;off=true;assert.equal((await onRequest({request,env})).status,404);
});
test('new pages keep semantic navigation, stats deep link and existing privacy-aware players',()=>{
  const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
  assert.match(file('index.html'),/<summary>Classifica<\/summary>/);assert.match(file('classifica.html'),/href="\/#statistiche"/);assert.match(file('media.html'),/data-manual="true"/);assert.match(file('media.html'),/privacy-controls.js/);
  const pageCss=file('assets/section-pages.css');
  assert.match(pageCss,/nav>a,.page-header .page-header-inner>nav>details>summary/);
  assert.match(pageCss,/border-radius:999px/);
  assert.match(pageCss,/min-height:44px/);
  assert.match(pageCss,/prefers-reduced-motion:reduce/);
  assert.match(file('classifica.html'),/section-pages\.css\?v=20260901-2/);
  assert.match(file('media.html'),/section-pages\.css\?v=20260901-2/);
  for(const name of ['section-pages','standings-page','media-page','featured-conference','match-gallery'])assert.doesNotThrow(()=>new vm.Script(file('assets/'+name+'.js')));
});
test('scheduled date placeholders are all-day, confirmed kickoffs retain their time',async(t)=>{
  let status='SCHEDULED';t.mock.method(globalThis,'fetch',async()=>Response.json({matches:[{id:1,matchday:6,competition:{code:'SA'},homeTeam:{name:'Cagliari'},awayTeam:{name:'Juventus'},utcDate:'2026-10-11T00:00:00Z',lastUpdated:'2026-08-01T00:00:00Z',status}]}));
  const request=new Request('https://example.test/api/juventus/calendar.ics'),env={FOOTBALL_DATA_KEY:'test'};
  let calendar=(await (await onRequest({request,env})).text()).replace(/\r\n /g,'');
  let event=calendar.split('BEGIN:VEVENT').find(event=>event.includes('UID:juventus-serie-a-2026-27-g6@'));
  assert.match(event,/DTSTART;VALUE=DATE:20261011/);assert.match(event,/giorno e orario da confermare/);assert.match(event,/LAST-MODIFIED:20260831T112000Z/);
  status='TIMED';calendar=(await (await onRequest({request,env})).text()).replace(/\r\n /g,'');event=calendar.split('BEGIN:VEVENT').find(event=>event.includes('UID:juventus-serie-a-2026-27-g6@'));assert.match(event,/DTSTART:20261011T000000Z/);
});
