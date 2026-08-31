import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest, orderPublicMatches, matchReportFromFootballData } from '../functions/api/[[path]].js';

const oldMatch = {
  id:558608, matchday:4, utcDate:'2026-09-12T16:00:00Z', status:'TIMED',
  lastUpdated:'2026-08-29T08:00:00Z', competition:{code:'SA',name:'Serie A'},
  homeTeam:{id:471,name:'US Sassuolo Calcio'}, awayTeam:{id:109,name:'Juventus FC'},
  score:{fullTime:{home:null,away:null}},
};
const expected = [
  ['serie-a',3,'20260906T184500Z','06/09/2026, 20:45'],
  ['serie-a',4,'20260913T184500Z','13/09/2026, 20:45'],
  ['europa-league',1,'20260917T190000Z','17/09/2026, 21:00'],
  ['serie-a',5,'20260920T160000Z','20/09/2026, 18:00'],
];
const local = value => new Intl.DateTimeFormat('it-IT', {timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

test('September: correct stale import and stored rows, without duplicating Sassuolo in home', () => {
  const report = matchReportFromFootballData(oldMatch);
  assert.equal(report.match_date,'2026-09-13T18:45:00Z');
  assert.equal(report.source_payload.utcDate,report.match_date);
  assert.equal(oldMatch.utcDate,'2026-09-12T16:00:00Z');
  const staleRow = {...report,match_date:oldMatch.utcDate,source_payload:JSON.stringify(oldMatch)};
  const rows = orderPublicMatches([staleRow],{now:'2026-08-31T10:00:00Z'});
  assert.equal(rows[0].match_date,report.match_date);
  const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const source = html.slice(html.indexOf('function icvEsc('),html.indexOf('function matchHubFreshness('));
  const allRows = new Function(source + ';return allMatchHubRows')();
  const september = allRows(rows).filter(m => /^2026-09-/.test(m.date));
  assert.equal(september.length,4);
  assert.deepEqual(september.map(m=>local(m.date)),expected.map(e=>e[3]));
  assert.equal(september.filter(m=>/sassuolo/i.test(m.home)).length,1);
});

test('Correction leaves other fixtures, later scheduling and final results untouched', () => {
  for (const change of [
    {utcDate:'2026-09-14T18:45:00Z'}, {status:'FINISHED'}, {status:'POSTPONED'},
    {matchday:5}, {competition:{code:'EL'}}, {homeTeam:{name:'Milan'}},
    {utcDate:'2027-09-12T16:00:00Z'},
  ]) {
    const match = {...oldMatch,...change};
    assert.equal(matchReportFromFootballData(match).match_date,match.utcDate);
  }
});

test('Subscription: all four confirmed slots, stable UID and increased revision even with stale provider', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({matches:[oldMatch]});
  try {
    for (const env of [{},{FOOTBALL_DATA_KEY:'test'}]) {
      const response = await onRequest({request:new Request('https://ilcalciodivince.com/api/juventus/calendar.ics'),env});
      const text = (await response.text()).replace(/\r\n /g,'');
      assert.equal(response.status,200);
      assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,46);
      for (const [competition,day,kickoff] of expected) {
        const uid = `juventus-${competition}-2026-27-g${day}@ilcalciodivince.com`;
        const events = text.split('BEGIN:VEVENT').filter(event=>event.includes('UID:'+uid));
        assert.equal(events.length,1);
        assert.ok(events[0].includes('DTSTART:'+kickoff));
        if (day === 4) {
          assert.match(events[0],/LAST-MODIFIED:20260831T104456Z/);
          assert.ok(Number(events[0].match(/SEQUENCE:(\d+)/)[1]) > Date.parse(oldMatch.lastUpdated)/1000);
          assert.doesNotMatch(events[0],/20260912T160000Z/);
        }
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});
