import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const admin = readFileSync(new URL('../icv_admin.html', import.meta.url), 'utf8');
test('partial scans and nested home warnings are not presented as clean completion', () => {
  const context = vm.createContext({});
  vm.runInContext(admin.slice(admin.indexOf('function firstAutomationError('), admin.indexOf('function friendlyAutomationError(')), context);
  assert.equal(context.firstAutomationError({ok:true,warning:'Giro parziale'}),'Giro parziale');
  assert.equal(context.firstAutomationError({ok:true,tasks:[{type:'news',result:{ok:true,warning:'Giro parziale'}}]}),'news: Giro parziale');
});
function client(fetch) {
  const context = { fetch, AbortController, setTimeout, clearTimeout, token: () => 'test-only', state: { drafts: ['previous'] }, showToast: message => context.toast = message };
  vm.createContext(context);
  vm.runInContext(admin.slice(admin.indexOf('function api(path'), admin.indexOf('function apiForm')), context);
  vm.runInContext(admin.slice(admin.indexOf('function load(strict)'), admin.indexOf('var runningAutomations')), context);
  context.sectionUnavailable = name => (context.state.readWarnings || []).includes(name);
  return context;
}

test('admin maps HTML 503/524 errors to readable messages without exposing HTML', async () => {
  for (const status of [503, 524]) {
    const context = client(async () => new Response('<!DOCTYPE HTML><html>gateway error</html>', { status }));
    await assert.rejects(context.api('/api/admin/news'), error => {
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /DOCTYPE|<html>/);
      assert.match(error.message, status === 503 ? /temporaneamente/ : /non ha risposto in tempo/);
      return true;
    });
  }
});

test('detached admin refresh handles failure, keeps old data and strict login still rejects', async () => {
  const context = client(async () => new Response('Unavailable', { status: 503 }));
  assert.equal(await context.load(), false);
  assert.deepEqual(context.state.drafts, ['previous']);
  assert.match(context.toast, /Elenco non aggiornato/);
  await assert.rejects(context.load(true), /temporaneamente/);
});

test('malformed successful response does not erase loaded drafts', async () => {
  const context = client(async () => new Response('<html>unexpected proxy response</html>', { status: 200 }));
  assert.equal(await context.load(), false);
  assert.deepEqual(context.state.drafts, ['previous']);
});

test('RSS timeout covers a stalled response body and retries are bounded', async () => {
  const { fetchSourceItems } = await import(new URL('../functions/api/[[path]].js', import.meta.url));
  const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
  let calls = 0;
  globalThis.setTimeout = (callback, ms, ...args) => originalTimer(callback, ms === 5000 ? 10 : ms === 350 || ms === 900 ? 0 : ms, ...args);
  globalThis.fetch = async (url, options) => {
    calls++;
    return {
      ok: true,
      text: () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      })
    };
  };
  try {
    await assert.rejects(fetchSourceItems({ name: 'Fixture', url: 'https://example.com/feed/' }), /HTTP 504/);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimer;
  }
});
