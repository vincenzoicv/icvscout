import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test' };

function setup(t, { failedSource = false, brokenCache = false } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const entries = new Map();
  let requests = 0;
  let now = 0;
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match(key) {
      if (brokenCache) throw new Error('Cache unavailable');
      const entry = entries.get(key.url);
      return entry && entry.expires > now ? entry.response.clone() : undefined;
    },
    async put(key, response) {
      if (brokenCache) throw new Error('Cache unavailable');
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
      entries.set(key.url, { response: new Response(await response.text(), response), expires: now + 30 });
    },
  } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'caches', previous);
    else delete globalThis.caches;
  });
  t.mock.method(globalThis, 'fetch', async input => {
    requests++;
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (failedSource && url.pathname.endsWith('/market_items')) return new Response('Unavailable', { status: 503 });
    if (url.pathname.endsWith('/news') && !url.searchParams.has('category')) {
      return Response.json([{ id: 1, title: 'Notizia ufficiale', visible: true, created_at: new Date().toISOString() }]);
    }
    return Response.json([]);
  });
  return {
    entries,
    requests: () => requests,
    expire: () => { now = 31; },
    home: (suffix = '', method = 'GET', context = {}) => onRequest({
      ...context, request: new Request(`https://example.test/api/public/home${suffix}`, { method }), env,
    }),
  };
}

test('home cache skips all upstream work and ignores tracking query strings', async t => {
  const state = setup(t);
  const first = await state.home('?utm_source=first');
  const payload = await first.json();
  const initialRequests = state.requests();
  assert.ok(initialRequests > 0);
  assert.equal(first.headers.get('X-ICV-Cache'), 'MISS');
  const second = await state.home('?utm_source=second');
  assert.equal(second.headers.get('X-ICV-Cache'), 'HIT');
  assert.equal(second.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await second.json(), payload);
  assert.equal(state.requests(), initialRequests);
  assert.deepEqual([...state.entries.keys()], ['https://example.test/api/cache/public-home-v2']);
  state.expire();
  assert.equal((await state.home()).headers.get('X-ICV-Cache'), 'MISS');
  assert.ok(state.requests() > initialRequests);
});

test('home does not cache degraded source reads', async t => {
  const state = setup(t, { failedSource: true });
  const response = await state.home();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).news.length, 1);
  assert.equal(state.entries.size, 0);
});

test('home remains available when cache reads or asynchronous writes fail', async t => {
  const state = setup(t, { brokenCache: true });
  const pending = [];
  const response = await state.home('', 'GET', { waitUntil: task => pending.push(task) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).news.length, 1);
  await Promise.all(pending);
});

test('non-GET home requests never use the shared cache', async t => {
  const state = setup(t);
  await state.home();
  const initialRequests = state.requests();
  assert.equal((await state.home('', 'POST')).headers.get('X-ICV-Cache'), 'MISS');
  assert.ok(state.requests() > initialRequests);
});
