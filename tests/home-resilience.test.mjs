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
