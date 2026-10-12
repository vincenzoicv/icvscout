import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helpers = html.slice(html.indexOf('var ICV_MATCH_FALLBACKS ='), html.indexOf('function matchMonitorMatches('));
const builder = html.slice(html.indexOf('function buildSeasonInsights('), html.indexOf('function renderSeasonInsights('));
class FixedDate extends Date { static now() { return Date.parse('2026-10-12T12:00:00Z'); } }
const {build, merge} = new Function('Date', helpers + builder + ';return {build:buildSeasonInsights,merge:allMatchHubRows};')(FixedDate);

test('season insights aggregate six league matches and chronological points', () => {
  const result = build(merge([]));
  assert.deepEqual(result.home, {games:3,points:7,won:2,draw:1,lost:0,goalsFor:5,goalsAgainst:1});
  assert.deepEqual(result.away, {games:3,points:4,won:1,draw:1,lost:1,goalsFor:4,goalsAgainst:4});
  assert.equal(result.total.points, 11);
  assert.deepEqual(result.trend.map(row => row.points), [3,6,7,7,10,11]);
  assert.deepEqual(result.trend.map(row => row.gain), [3,3,1,0,3,1]);
});

test('season insights reject cups, friendlies, incomplete scores and other seasons', () => {
  const valid = {date:'2026-10-11T18:45:00Z',status:'finished',competition:'Serie A',home:'Cagliari',away:'Juventus',homeScore:1,awayScore:1,matchday:6};
  const result = build([valid,
    {...valid, competition:'Europa League'}, {...valid, competition:'Amichevole'},
    {...valid, status:'scheduled'}, {...valid, homeScore:null}, {...valid, awayScore:-1},
    {...valid, date:'2025-10-11T18:45:00Z'}, {...valid, date:'2026-11-11T18:45:00Z'},
    {...valid, away:'Lazio'},
  ]);
  assert.equal(result.total.games, 1);
  assert.equal(result.total.points, 1);
  assert.equal(build([]).total.games, 0);
});

test('postponed rounds follow the actual match date and aliases do not double count', () => {
  const result = build(merge([{match_id:'lazio',match_date:'2026-10-18T18:45:00Z',status:'scheduled',competition:'Serie A',source_payload:{homeTeam:{name:'Juventus FC'},awayTeam:{name:'SS Lazio'}}}]));
  assert.equal(result.total.games, 6);
  const rounds = build([
    {date:'2026-09-15',competition:'Serie A',status:'finished',home:'Juventus',away:'Roma',homeScore:0,awayScore:0,matchday:2},
    {date:'2026-09-10',competition:'Serie A',status:'finished',home:'Juventus',away:'Lazio',homeScore:1,awayScore:0,matchday:3},
  ]);
  assert.deepEqual(rounds.trend.map(row => row.matchday), [3,2]);
  assert.deepEqual(rounds.trend.map(row => row.points), [3,4]);
});
