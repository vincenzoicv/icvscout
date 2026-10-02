import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsToMatch, namesMatch, matchDay, communityMatchKey } from '../functions/lib/match-content.js';
import { onRequest } from '../functions/api/[[path]].js';
const match = { match_id: '558595', date: '2026-09-20T16:00:00Z', home: 'Juventus FC', away: 'Atalanta BC' };
test('media require both teams and the correct date', () => {
  assert.equal(belongsToMatch({title:'Juventus-Atalanta',date:'2026-09-20'},match,'album'),true);
  assert.equal(belongsToMatch({title:'Juventus-Atalanta',date:'2025-09-20'},match,'album'),false);
  assert.equal(belongsToMatch({title:'Juventus-Lazio',date:'2026-09-20'},match,'album'),false);
  assert.equal(belongsToMatch({title:'Juventus-Atalanta'},match,'conference'),false);
});
test('explicit ids prevent repeated fixtures from mixing', () => {
  assert.equal(belongsToMatch({match_id:'558596',title:'Juventus-Atalanta',date:'2026-09-20'},match,'album'),false);
  assert.equal(belongsToMatch({match_id:'558595'},match,'album'),true);
});
test('conferences have a bounded publication window', () => {
  assert.equal(belongsToMatch({title:'Spalletti dopo Juventus-Atalanta',published_at:'2026-09-20T20:00:00Z'},match,'conference'),true);
  assert.equal(belongsToMatch({title:'Spalletti dopo Juventus-Atalanta',published_at:'2026-09-24T20:00:00Z'},match,'conference'),false);
});
test('word boundaries and Rome dates are respected', () => {
  assert.equal(namesMatch('Juventus intervista', {...match,away:'Inter'}),false);
  assert.equal(matchDay('2026-09-20T23:30:00Z'),'2026-09-21');
  assert.equal(communityMatchKey({id:32,match_id:558595}),'32');
});
test('content endpoint excludes other games and respects hidden conferences and highlights',async t=>{
  let off=false;
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);
    if(url.pathname.endsWith('/match_reports'))return Response.json([{id:32,match_id:match.match_id,match_date:match.date,status:'finished',source_payload:{homeTeam:{name:match.home},awayTeam:{name:match.away}}}]);
    if(url.pathname.endsWith('/social_drafts'))return Response.json([{id:3,instagram_id:'ig3',platform:'instagram',media_type:'video',visible:true,status:'published',post_url:'https://www.instagram.com/reel/FIXTURE/',caption:'Conferenza stampa dopo Juventus-Atalanta',published_at:'2026-09-20T19:00:00Z'}]);
    if(url.pathname.endsWith('/site_settings')){
      const key=url.searchParams.get('key');
      if(key==='eq.featured_conference')return Response.json([{value:{mode:'off'}}]);
      if(key==='eq.featured_highlights')return Response.json([{value:{mode:off?'off':'manual',title:'Juventus 2 Atalanta 0',video_url:'https://www.youtube.com/watch?v=5bg04FuSCmM'}}]);
      if(key==='eq.match_photo_gallery')return Response.json([{value:{revision:'1',albums:[{id:'album1',title:'Juventus-Atalanta',date:'2026-09-20',published:true,photos:[{id:'photo1'}]},{id:'old',title:'Juventus-Atalanta',date:'2025-09-20',published:true,photos:[{id:'photo2'}]}]}}]);
      return Response.json([]);
    }
    throw new Error('Unexpected request');
  });
  const context={request:new Request('https://site.test/api/public/match-content?match_id=558595'),env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'}};
  let result=await (await onRequest(context)).json();
  assert.equal(result.highlights.video_id,'5bg04FuSCmM');
  assert.deepEqual(result.conferences,[]);assert.equal(result.albums.length,1);assert.equal(result.community_key,'32');
  off=true;result=await (await onRequest(context)).json();assert.equal(result.highlights,null);
});
