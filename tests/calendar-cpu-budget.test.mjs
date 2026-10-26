import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, foldIcsLine } from '../functions/api/[[path]].js';

test('ICS folding preserves UTF-8 characters and the existing output byte for byte', () => {
  function original(line) {
    let current = '', bytes = 0;
    const parts = [], encoder = new TextEncoder();
    for (const char of line) {
      const size = encoder.encode(char).length;
      if (current && bytes + size > 73) { parts.push(current); current = ' ' + char; bytes = 1 + size; }
      else { current += char; bytes += size; }
    }
    return [...parts, current].join('\r\n');
  }
  for (const value of ['', 'A'.repeat(200), 'è perché Юве ⚽ 🤍🖤 '.repeat(40), 'A'.repeat(72) + 'é', '\ud800'.repeat(80)]) {
    const folded = foldIcsLine(value);
    assert.equal(folded, original(value));
    assert.equal(folded.replace(/\r\n /g, ''), value);
    assert.ok(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 73));
  }
});

test('the public calendar cache avoids provider calls and preserves all events and headers', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let stored, reads = 0;
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match() { return stored?.clone(); },
    async put(key, response) { assert.equal(response.headers.get('Cache-Control'), 'public, max-age=900'); stored = response; },
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'caches', previous) : delete globalThis.caches);
  t.mock.method(globalThis, 'fetch', async () => { reads++; return Response.json({ matches: [] }); });
  const call = suffix => onRequest({ request: new Request('https://example.test/api/juventus/calendar.ics' + suffix), env: { FOOTBALL_DATA_KEY: 'test' } });
  const first = await call('');
  assert.equal(first.headers.get('X-ICV-Cache'), 'MISS');
  const body = await first.text();
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 47);
  const second = await call('?utm_source=calendar');
  assert.equal(second.headers.get('X-ICV-Cache'), 'HIT');
  assert.equal(await second.text(), body);
  assert.equal(reads, 1);
  assert.match(second.headers.get('Content-Disposition'), /\.ics/);
  assert.match(second.headers.get('Content-Type'), /text\/calendar/);
  stored = undefined;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Unavailable' }, { status: 503 }));
  const fallback = await call('');
  assert.equal(fallback.status, 200);
  assert.equal(stored, undefined);
});
