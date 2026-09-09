import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test' };

test('la home ritenta i timeout Supabase temporanei senza restituire errore 500', async t => {
  let newsAttempts = 0;
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/news') && !url.searchParams.has('category')) {
      newsAttempts += 1;
      if (newsAttempts === 1) return new Response('connection timeout', { status: 503 });
      return Response.json([{ id: 1, title: 'Notizia ufficiale', visible: true, created_at: '2026-09-08T10:00:00Z' }]);
    }
    return Response.json([]);
  });

  const response = await onRequest({ request: new Request('https://example.test/api/public/home'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(newsAttempts, 2);
  assert.equal(body.news[0].title, 'Notizia ufficiale');
});

test('una sorgente Supabase non disponibile non svuota le altre sezioni della home', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/market_items')) return new Response('connection timeout', { status: 503 });
    if (url.pathname.endsWith('/news') && !url.searchParams.has('category')) {
      return Response.json([{ id: 2, title: 'Contenuto disponibile', visible: true, created_at: '2026-09-08T10:00:00Z' }]);
    }
    return Response.json([]);
  });

  const response = await onRequest({ request: new Request('https://example.test/api/public/home'), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.news[0].title, 'Contenuto disponibile');
  assert.deepEqual(body.market, []);
});

test('la home legge i provider ufficiali direttamente quando Supabase non risponde', async t => {
  const pubDate = new Date().toUTCString();
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname.startsWith('/rest/v1/')) return new Response('connection timeout', { status: 503 });
    if (url.hostname === 'news.google.com') {
      return new Response(`<rss><channel><item>
        <title>Serie A | Sassuolo-Juventus | I convocati - Juventus Football Club</title>
        <link>https://www.juventus.com/it/news/articoli/sassuolo-juventus-convocati</link>
        <description>La lista ufficiale dei convocati per Sassuolo-Juventus.</description>
        <pubDate>${pubDate}</pubDate><source>Juventus.com</source>
      </item></channel></rss>`);
    }
    if (url.hostname === 'api.football-data.org') {
      return Response.json({ matches: [{
        id: 77,
        utcDate: '2026-09-13T18:45:00Z',
        status: 'SCHEDULED',
        competition: { name: 'Serie A' },
        homeTeam: { id: 471, name: 'US Sassuolo Calcio' },
        awayTeam: { id: 109, name: 'Juventus FC' },
        score: {},
      }] });
    }
    if (url.hostname === 'graph.instagram.com') {
      return Response.json({ data: [{
        id: 'ig-1',
        caption: 'Allenamento verso Sassuolo-Juventus',
        media_type: 'IMAGE',
        media_url: 'https://example.test/training.jpg',
        permalink: 'https://www.instagram.com/p/TEST/',
        timestamp: '2026-09-09T18:00:00Z',
      }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const fallbackEnv = {
    ...env,
    FOOTBALL_DATA_KEY: 'football-key',
    IG_ACCESS_TOKEN: 'instagram-key',
  };
  const response = await onRequest({ request: new Request('https://example.test/api/public/home'), env: fallbackEnv });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.news.length, 1);
  assert.equal(body.news[0].source, 'Juventus Football Club');
  assert.equal(body.matches.length, 1);
  assert.equal(body.social.length, 1);
});
