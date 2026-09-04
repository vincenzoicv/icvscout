import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest,matchReportFromFootballData} from '../functions/api/[[path]].js';

const fixtures=[
  [6,'Cagliari','Juventus','20261011T184500Z'],
  [7,'Juventus','Lazio','20261018T184500Z'],
  [8,'Lecce','Juventus','20261025T170000Z'],
  [9,'Genoa','Juventus','20261028T194500Z'],
  [10,'Juventus','Napoli','20261101T194500Z'],
  [11,'Fiorentina','Juventus','20261108T194500Z'],
  [12,'Juventus','Venezia','20261123T194500Z'],
];

test('Serie A rounds 6-12 use the official dates and Rome kickoffs',async()=>{
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  assert.equal(response.status,200);
  for(const [round,home,away,kickoff] of fixtures){
    const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes(`UID:juventus-serie-a-2026-27-g${round}@`));
    assert.ok(event,`manca la ${round}ª giornata`);
    assert.match(event,new RegExp(`SUMMARY:Serie A: ${home} - ${away}`));
    assert.match(event,new RegExp(`DTSTART:${kickoff}`));
    assert.match(event,/LAST-MODIFIED:20260903T124600Z/);
    assert.match(event,/serie-a-2026-27-anticipi-e-posticipi-dalla-giornata-sei-alla-dodici/);
  }
});

test('the home fallback carries every newly confirmed kickoff',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const kickoff of ['2026-10-11T20:45:00+02:00','2026-10-18T20:45:00+02:00','2026-10-25T18:00:00+01:00','2026-10-28T20:45:00+01:00','2026-11-01T20:45:00+01:00','2026-11-08T20:45:00+01:00','2026-11-23T20:45:00+01:00']) assert.match(html,new RegExp(kickoff.replace(/[+]/g,'\\+')));
  assert.doesNotMatch(html,/2026-11-22T/);
});

test('a later provider rescheduling remains authoritative',()=>{
  const match={id:1,matchday:6,status:'TIMED',utcDate:'2026-10-12T18:45:00Z',lastUpdated:'2026-09-04T08:00:00Z',competition:{code:'SA',name:'Serie A'},homeTeam:{id:104,name:'Cagliari'},awayTeam:{id:109,name:'Juventus'},score:{fullTime:{home:null,away:null}}};
  assert.equal(matchReportFromFootballData(match).match_date,'2026-10-12T18:45:00Z');
});

test('calendar revision stays stable when the provider omits lastUpdated',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({matches:[{id:1,matchday:6,status:'SCHEDULED',utcDate:'2026-10-11T00:00:00Z',competition:{code:'SA'},homeTeam:{name:'Cagliari'},awayTeam:{name:'Juventus'}}]}));
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{FOOTBALL_DATA_KEY:'test'}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes('UID:juventus-serie-a-2026-27-g6@'));
  assert.match(event,/LAST-MODIFIED:20260903T124600Z/);
  assert.match(event,/SEQUENCE:1788439560/);
});
