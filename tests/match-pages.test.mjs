import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/[[path]].js';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test' };

test('public match endpoint only returns the requested match fields', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.match(url.pathname, /match_reports$/);
    assert.equal(url.searchParams.get('match_id'), 'eq.match-42');
    return Response.json([{
      match_id: 'match-42', match_date: '2026-09-20T16:00:00Z', status: 'FINISHED',
      competition: 'Serie A', summary: 'Risultato e marcatori', updated_at: '2026-09-20T18:00:00Z',
      tactical_key: 'internal-key', private_column: 'must not leak',
      source_payload: {
        id: 42, utcDate: '2026-09-20T16:00:00Z', status: 'FINISHED',
        homeTeam: { name: 'Juventus FC', formation: '4-3-3', lineup: [{ name: 'Player One', position: 'Goalkeeper', shirtNumber: 1 }] },
        awayTeam: { name: 'Atalanta BC', lineup: [] },
        competition: { name: 'Serie A' }, matchday: 5, venue: 'Allianz Stadium',
        score: { fullTime: { home: 2, away: 0 } }, goals: [{ minute: 28, scorer: { name: 'Player One' }, team: { name: 'Juventus FC' } }],
        icv_meta: { provider: 'football-data.org', source_url: 'https://example.test/source' },
      },
    }]);
  });
  const response = await onRequest({ request: new Request('https://site.test/api/public/match?match_id=match-42'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.home, 'Juventus FC');
  assert.equal(body.homeScore, 2);
  assert.equal(body.goals[0].player, 'Player One');
  assert.equal(body.homeLineup.length, 1);
  assert.equal('private_column' in body, false);
  assert.equal('tactical_key' in body, false);
});

test('public match enriches a finished stored score with missing goals and lineups', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.hostname === 'db.test') return Response.json([{
      match_id: '558595', match_date: '2026-09-20T16:00:00Z', status: 'FINISHED',
      competition: 'Serie A', summary: 'Finale Juventus FC 2-0 Atalanta BC',
      source_payload: {
        id: 558595, utcDate: '2026-09-20T16:00:00Z', status: 'FINISHED',
        homeTeam: { id: 109, name: 'Juventus FC', lineup: [] },
        awayTeam: { id: 102, name: 'Atalanta BC', lineup: [] },
        competition: { name: 'Serie A' }, matchday: 5, venue: 'Allianz Stadium',
        score: { fullTime: { home: 2, away: 0 } }, goals: [],
        icv_manual: { active: true, status: 'finished', home_score: 2, away_score: 0, mvp: 'ICV Editor' },
      },
    }]);
    assert.equal(url.href, 'https://api.football-data.org/v4/matches/558595');
    assert.equal(options.headers['X-Auth-Token'], 'test');
    assert.equal(options.headers['X-Unfold-Lineups'], 'true');
    return Response.json({
      id: 558595, utcDate: '2026-09-20T16:00:00Z', status: 'FINISHED',
      homeTeam: { id: 109, name: 'Juventus FC', lineup: [] },
      awayTeam: { id: 102, name: 'Atalanta BC', lineup: [] },
      competition: { name: 'Serie A' }, matchday: 5, venue: 'Allianz Stadium',
      score: { fullTime: { home: 2, away: 0 } },
      goals: [], bookings: [],
    });
  });

  const response = await onRequest({ request: new Request('https://site.test/api/public/match?match_id=558595'), env: { ...env, FOOTBALL_DATA_KEY: 'test' } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(body.scorers, "Francisco Conceicao 28' · Bremer 77'");
  assert.equal(body.goals.length, 2);
  assert.equal(body.homeLineup.length, 11);
  assert.equal(body.homeLineup[0].name, 'Guglielmo Vicario');
  assert.equal(body.homeFormation, '4-2-3-1');
  assert.equal(body.awayLineup.length, 11);
  assert.equal(body.awayLineup[0].name, 'Marco Carnesecchi');
  assert.equal(body.bookings.length, 3);
  assert.equal(body.substitutions.length, 9);
  assert.equal(body.homeScore, 2);
  assert.equal(body.mvp, 'ICV Editor');
  assert.equal(body.source, 'Juventus.com');
  assert.equal(body.sourceUrl, 'https://www.juventus.com/it/news/articoli/serie-a-juventus-atalanta-il-tabellino-x3128');
});

test('Venezia final report fills missing match data from the verified club report', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{
    match_id: '558521', match_date: '2026-11-22T11:30:00Z', status: 'finished', competition: 'Serie A',
    source_payload: {
      homeTeam: { name: 'Juventus FC', lineup: [] }, awayTeam: { name: 'Venezia FC', lineup: [] },
      score: { fullTime: { home: 4, away: 0 } }, goals: [], matchday: 12,
      icv_meta: { provider: 'football-data.org' },
    },
  }]));
  const response = await onRequest({ request: new Request('https://site.test/api/public/match?match_id=558521'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.scorers, "Woltemade 53' · Koopmeiners 59' · Cabal 65' · Kolo Muani 71' (rig.)");
  assert.deepEqual(body.goals.map(goal => goal.minute), [53, 59, 65, 71]);
  assert.equal(body.goals.at(-1).type, 'PENALTY');
  assert.equal(body.homeLineup.length, 11);
  assert.equal(body.awayLineup.length, 11);
  assert.equal(body.substitutions.length, 10);
  assert.equal(body.source, 'Juventus.com');
  assert.match(body.sourceUrl, /juventus-venezia-il-tabellino$/);
});

test('the verified Venezia report works without an archive, while unknown IDs return 404', async () => {
  const requestMatch = id => onRequest({ request: new Request('https://site.test/api/public/match?match_id=' + id), env: {} });
  const response = await requestMatch('558521');
  assert.equal(response.status, 200);
  const match = await response.json();
  assert.deepEqual([match.homeScore, match.awayScore], [4, 0]);
  assert.equal(match.goals.length, 4);
  assert.equal((await requestMatch('unknown')).status, 404);
});

test('recent verified results resolve by date and team aliases without the archive', async () => {
  const fixtures = [
    ['2026-10-28T19:45:00Z', 'Genoa', 'Juventus', '558552', 2, 0, [12, 28]],
    ['2026-11-01T19:45:00Z', 'Juventus', 'Napoli', '558547', 2, 0, [70, 87]],
    ['2026-11-05T20:00:00Z', 'AZ', 'Juventus', 'uel-az-20261105', 1, 2, [19, 37, 88]],
    ['2026-11-08T20:45:00+01:00', 'Fiorentina', 'Juventus', '558529', 2, 2, [4, 32, 54, 66]],
    ['2026-11-22T11:30:00Z', 'Juventus', 'Venezia', '558521', 4, 0, [53, 59, 65, 71]],
  ];
  for (const [date, home, away, id, homeScore, awayScore, minutes] of fixtures) {
    const query = new URLSearchParams({ date, home, away });
    const response = await onRequest({ request: new Request('https://site.test/api/public/match?' + query), env: {} });
    assert.equal(response.status, 200);
    const match = await response.json();
    assert.equal(match.match_id, id);
    assert.equal(match.status, 'finished');
    assert.deepEqual([match.homeScore, match.awayScore], [homeScore, awayScore]);
    assert.deepEqual(match.goals.map(goal => goal.minute), minutes);
    assert.equal(match.homeLineup.length, 11);
    assert.equal(match.awayLineup.length, 11);
  }
});

test('the verified Fiorentina result replaces stale scheduled archive data', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{
    id: 22, match_id: '558529', match_date: '2026-11-08T19:45:00Z', status: 'pre_match',
    competition: 'Serie A', source_payload: {
      homeTeam: { name: 'ACF Fiorentina' }, awayTeam: { name: 'Juventus FC' },
      score: { fullTime: { home: null, away: null } }, matchday: 11,
    },
  }]));
  const response = await onRequest({ request: new Request('https://site.test/api/public/match?match_id=558529'), env });
  const match = await response.json();
  assert.equal(match.community_key, '22');
  assert.equal(match.status, 'finished');
  assert.equal(match.scorers, "Pellegrino 4' · Woltemade 32' · Njie 54' · Bremer 66'");
  assert.deepEqual([match.homeScore, match.awayScore], [2, 2]);
});

test('Cagliari final report includes verified scorers without editorial awards', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{
    match_id: '558584', match_date: '2026-10-11T18:45:00Z', status: 'finished', competition: 'Serie A',
    source_payload: {
      homeTeam: { name: 'Cagliari Calcio' }, awayTeam: { name: 'Juventus FC' },
      score: { fullTime: { home: 1, away: 1 } }, goals: [], matchday: 6,
    },
  }]));
  const response = await onRequest({ request: new Request('https://site.test/api/public/match?match_id=558584'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.scorers, "Maldini 20' · Kolo Muani 81'");
  assert.equal(body.homeScore, 1);
  assert.equal(body.awayScore, 1);
  assert.equal(body.awayLineup.length, 11);
  assert.equal(body.awayFormation, '4-2-3-1');
  assert.equal(body.substitutions.length, 10);
  assert.ok(!body.mvp);
  assert.ok(!body.worst);
});

test('public search spans published news, fixtures and Instagram posts', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/news')) return Response.json([{
      id: 8, title: 'Yildiz guida la Juventus', body: 'La notizia pubblica su Kenan Yildiz.',
      source: 'Juventus.com', source_url: 'https://www.juventus.com/it/news/yildiz',
      category: 'juventus', visible: true, created_at: '2026-09-25T10:00:00Z', reliability: 'official',
    }]);
    if (url.pathname.endsWith('/market_items')) return Response.json([]);
    if (url.pathname.endsWith('/match_reports')) return Response.json([{
      match_id: 'fixture-7', match_date: '2026-10-11T18:45:00Z', status: 'SCHEDULED', competition: 'Serie A', summary: '',
      source_payload: { id: 7, utcDate: '2026-10-11T18:45:00Z', status: 'TIMED', homeTeam: { name: 'Cagliari' }, awayTeam: { name: 'Juventus FC' }, competition: { name: 'Serie A' } },
    }]);
    if (url.pathname.endsWith('/social_drafts')) return Response.json([{
      id: 9, platform: 'instagram', visible: true, post_url: 'https://www.instagram.com/p/POST/',
      caption: 'Juventus e Kenan Yildiz in allenamento', published_at: '2026-09-24T10:00:00Z',
    }]);
    return Response.json([]);
  });
  const response = await onRequest({ request: new Request('https://site.test/api/public/search?q=Juventus'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.results.some(result => result.type === 'news' && result.href === 'https://www.juventus.com/it/news/yildiz'));
  assert.ok(body.results.some(result => result.type === 'match' && result.href === '/partita?match_id=fixture-7'));
  assert.ok(body.results.some(result => result.type === 'social' && result.href === 'https://www.instagram.com/p/POST/'));
});

test('search requires at least two characters and the homepage exposes search', async t => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; return Response.json([]); });
  const response = await onRequest({ request: new Request('https://site.test/api/public/search?q=a'), env });
  assert.deepEqual(await response.json(), { query: 'a', results: [] });
  assert.equal(called, false);
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const calendar = readFileSync(new URL('../calendario-juventus.html', import.meta.url), 'utf8');
  assert.match(home, /href="\/cerca" class="header-search"/);
  assert.match(calendar, /detailHref = event => '\/partita\?date='/);
  assert.match(home, /href="\/cerca" class="header-search"/);
  assert.match(readFileSync(new URL('../cerca.html', import.meta.url), 'utf8'), /search-page\.js\?v=20261022-1/);
  assert.match(readFileSync(new URL('../partita.html', import.meta.url), 'utf8'), /match-pages\.js\?v=20261123-1/);
});

test('clean match URLs rely on Pages clean-URL handling without redirect loops', () => {
  const redirects = readFileSync(new URL('../_redirects', import.meta.url), 'utf8');
  assert.doesNotMatch(redirects, /^\/(?:cerca|partita)(?:\.html)?\s+\/(?:cerca|partita)(?:\.html)?\s+\d+$/m);
});

test('match pages localize the scheduled provider states', () => {
  const script = readFileSync(new URL('../assets/match-pages.js', import.meta.url), 'utf8');
  assert.match(script, /timed:'In programma',pre_match:'In programma'/);
  assert.match(script, /match\.substitutions/);
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /Verificato ora|matchHubUpdated/);
});
