import { test } from 'node:test';
import assert from 'node:assert/strict';
import cron from '../workers/icv-cron.js';
import { generateScheduledMatchCenter, upsertMatchReport, matchReportFromFootballData } from '../functions/api/[[path]].js';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test', FOOTBALL_DATA_KEY: 'test' };
const now = new Date('2026-10-26T12:00:00Z');
const match = (extra = {}) => ({ id: 99, utcDate: now.toISOString(), status: 'IN_PLAY', homeTeam: { id: 109, name: 'Juventus FC' }, awayTeam: { id: 1, name: 'Opponent' }, competition: { name: 'Serie A' }, score: { fullTime: { home: 1, away: 0 } }, goals: [], ...extra });

test('scheduled match checks skip provider and writes outside the match window', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith('/automation_runs')) return Response.json([{ status: 'ok', created_at: now.toISOString() }]);
    if (url.pathname.endsWith('/match_reports')) return Response.json([{ match_id: '99', match_date: '2026-10-28T19:45:00Z', status: 'pre_match' }]);
    throw new Error('Unexpected provider request');
  });
  const result = await generateScheduledMatchCenter(env, now);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.next_check_at, '2026-10-26T12:30:00.000Z');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => !call.options.method || call.options.method === 'GET'));
  assert.match(calls[0].url.searchParams.get('select'), /^match_id,match_date,status$/);
});

test('off-match polling wakes at the start of the pre-match window', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    return Response.json(url.pathname.endsWith('/automation_runs')
      ? [{ status: 'ok', created_at: now.toISOString() }]
      : [{ match_id: '99', match_date: '2026-10-26T13:40:00Z', status: 'pre_match' }]);
  });
  assert.equal((await generateScheduledMatchCenter(env, now)).next_check_at, '2026-10-26T12:10:00.000Z');
});

test('live polling fetches only the current match and skips identical database writes', async t => {
  const current = match();
  const previous = matchReportFromFootballData(current, { sourceUrl: 'https://api.football-data.org/v4/matches/99' });
  previous.source_payload.icv_meta.fetched_at = '2020-01-01T00:00:00Z';
  previous.source_payload = Object.fromEntries(Object.entries(previous.source_payload).reverse());
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.hostname === 'api.football-data.org') {
      assert.equal(url.pathname, '/v4/matches/99');
      return Response.json(current);
    }
    if (url.searchParams.get('select') === 'match_id,match_date,status') return Response.json([{ match_id: '99', match_date: now.toISOString(), status: 'in_play' }]);
    assert.equal(options.method, 'GET');
    return Response.json([{ id: 1, ...previous }]);
  });
  const result = await generateScheduledMatchCenter(env, now);
  assert.equal(result.changed, 0);
  assert.equal(result.next_check_at, '2026-10-26T12:01:00.000Z');
  assert.equal(calls.length, 3);
});

test('finished matches in the post-match window are checked every five minutes', async t => {
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'api.football-data.org') return Response.json(match({ status: 'FINISHED' }));
    if (url.searchParams.get('select') === 'match_id,match_date,status') return Response.json([{ match_id: '99', match_date: now.toISOString(), status: 'finished' }]);
    return Response.json([]);
  });
  assert.equal((await generateScheduledMatchCenter(env, now)).next_check_at, '2026-10-26T12:05:00.000Z');
});

test('calendar refresh avoids detailed history and updates only future fixtures', async t => {
  const future = new Date(Date.now() + 2 * 86400000).toISOString();
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'api.football-data.org') {
      assert.equal(options.headers['X-Unfold-Lineups'], undefined);
      return Response.json({ matches: [match({ status: 'FINISHED', utcDate: new Date(Date.now() - 86400000).toISOString() }), match({ id: 100, status: 'TIMED', utcDate: future })] });
    }
    if (options.method === 'POST') writes.push({ path: url.pathname, body: JSON.parse(options.body) });
    return Response.json([]);
  });
  const result = await generateScheduledMatchCenter(env, new Date());
  assert.equal(result.calendar.matches, 1);
  const reports = writes.filter(write => write.path.endsWith('/match_reports'));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].body[0].match_id, '100');
});

test('changed scores are persisted and editorial overrides are preserved', async t => {
  const previous = matchReportFromFootballData(match());
  previous.source_payload.icv_manual = { active: true, status: 'finished', home_score: 2, away_score: 0, scorers: "ICV 90'", mvp: 'Editorial choice' };
  let written;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    if (options.method === 'PATCH') { written = JSON.parse(options.body); return Response.json([]); }
    return Response.json([{ id: 1, ...previous }]);
  });
  assert.equal(await upsertMatchReport(env, matchReportFromFootballData(match({ score: { fullTime: { home: 1, away: 1 } } }))), true);
  assert.equal(written.source_payload.icv_manual.mvp, 'Editorial choice');
  assert.equal(written.status, 'finished');
  assert.match(written.title, /2-0/);
});

test('scheduler caches the next due time and still permits manual refresh', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let stored, calls = 0;
  const flags = [];
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match() { return stored?.clone(); },
    async put(key, response) { stored = response; },
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'caches', previous) : delete globalThis.caches);
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls++;
    flags.push(new URL(input).searchParams.get('scheduled'));
    return Response.json({ ok: true, next_check_at: new Date(now.getTime() + 1800000).toISOString() });
  });
  await cron.scheduled({ cron: '* * * * *', scheduledTime: now.getTime() }, { CRON_SECRET: 'test' });
  await cron.scheduled({ cron: '* * * * *', scheduledTime: now.getTime() + 60000 }, { CRON_SECRET: 'test' });
  assert.equal(calls, 1);
  await cron.fetch(new Request('https://cron.test/?job=match', { method: 'POST', headers: { 'X-ICV-Cron-Token': 'test' } }), { CRON_SECRET: 'test' });
  assert.equal(calls, 2);
  await cron.scheduled({ cron: '* * * * *', scheduledTime: now.getTime() + 1800001 }, { CRON_SECRET: 'test' });
  assert.equal(calls, 3);
  assert.deepEqual(flags, ['1', null, '1']);
});

test('scheduler retries after cache eviction or a failed API response', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let calls = 0, writes = 0;
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match() { throw new Error('Cache unavailable'); },
    async put() { writes++; },
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'caches', previous) : delete globalThis.caches);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ ok: false }, { status: 503 }); });
  await cron.scheduled({ cron: '* * * * *', scheduledTime: now.getTime() }, { CRON_SECRET: 'test' });
  await cron.scheduled({ cron: '* * * * *', scheduledTime: now.getTime() + 60000 }, { CRON_SECRET: 'test' });
  assert.equal(calls, 2);
  assert.equal(writes, 0);
});
