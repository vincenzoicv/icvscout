const SEASON = 2026;
const stats = ['playedGames','won','draw','lost','points','goalsFor','goalsAgainst','goalDifference'];
function validate(rows, count) {
  if (rows.length !== count || new Set(rows.map(r=>r.team.id)).size !== count || !rows.some(r=>r.isJuventus)) throw new Error('Classifica incompleta');
  for (const row of rows) {
    if (!row.team.name || !/^\d+$/.test(row.team.id) || stats.some(key=>!Number.isInteger(row[key])) || row.playedGames < 0 || row.won + row.draw + row.lost !== row.playedGames) throw new Error('Dati classifica non validi');
  }
  const preseason = rows.every(row=>row.playedGames === 0);
  if (!preseason && rows.some(row=>!Number.isInteger(row.position) || row.position<1 || row.position>count)) throw new Error('Posizioni non valide');
  return {preseason, table:preseason ? rows.sort((a,b)=>a.team.name.localeCompare(b.team.name,'it')).map(row=>({...row,position:null})) : rows.sort((a,b)=>a.position-b.position)};
}
export function normalizeStandings(data, competition) {
  if (!['SA','EL'].includes(competition)) throw new Error('Competizione non valida');
  let rows;
  if (competition === 'SA') {
    if (data?.competition?.code !== 'SA' || !String(data?.season?.startDate).startsWith(SEASON+'-')) throw new Error('Stagione non corrente');
    rows = (data.standings?.find(group=>group.type === 'TOTAL')?.table || []).map(row=>({
      ...Object.fromEntries(stats.map(key=>[key,row[key]])), position:row.position,
      team:{id:String(row.team?.id),name:row.team?.shortName || row.team?.name,crest:row.team?.crest || ''},
      isJuventus:Number(row.team?.id)===109,
    }));
  } else {
    const group = Array.isArray(data) && data.find(group=>String(group.competitionId)==='14' && String(group.group?.seasonYear)==='2027' && group.items?.length===36);
    if (!group) throw new Error('Fase campionato non disponibile');
    rows = group.items.map(row=>({position:row.rank,playedGames:row.played,won:row.won,draw:row.drawn,lost:row.lost,
      points:row.points,goalsFor:row.goalsFor,goalsAgainst:row.goalsAgainst,goalDifference:row.goalDifference,
      team:{id:String(row.team?.id),name:row.team?.translations?.displayName?.IT || row.team?.internationalName,crest:row.team?.logoUrl || ''},
      isJuventus:String(row.team?.id)==='50139',
    }));
  }
  return {competition,season:'2026/27',...validate(rows,competition==='SA'?20:36)};
}
export async function standingsResponse(url, env) {
  const competition = url.searchParams.get('competition') || 'SA';
  if (!['SA','EL'].includes(competition)) return Response.json({error:'Competizione non valida'},{status:400});
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(new URL('/api/public/standings?competition='+competition+'&season='+SEASON,url));
  if (cache) { try { const hit=await cache.match(cacheKey); if(hit)return hit; } catch {} }
  const source = competition==='SA' ? 'https://www.legaseriea.it/it/serie-a/classifica' : 'https://www.uefa.com/uefaeuropaleague/standings/';
  try {
    if (competition==='SA' && !env.FOOTBALL_DATA_KEY) throw new Error('Fonte non configurata');
    const response = await fetch(competition==='SA' ? 'https://api.football-data.org/v4/competitions/SA/standings?season=2026' : 'https://standings.uefa.com/v1/standings?competitionId=14&seasonYear=2027', {
      headers:competition==='SA'?{'X-Auth-Token':env.FOOTBALL_DATA_KEY}:{},signal:AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Fonte non disponibile');
    const result = normalizeStandings(await response.json(),competition);
    const output=Response.json({...result,checkedAt:new Date().toISOString(),source,provider:competition==='SA'?'football-data.org':'UEFA'}, {headers:{'Cache-Control':'public, max-age=300'}});
    if(cache) { try { await cache.put(cacheKey,output.clone()); } catch {} }
    return output;
  } catch {
    return Response.json({error:'Classifica temporaneamente non disponibile',source},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
