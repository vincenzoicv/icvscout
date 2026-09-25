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
  [12,'Juventus','Venezia','20261122T113000Z'],
  [13,'Como','Juventus','20261129T194500Z'],
  [14,'Juventus','Udinese','20261206T170000Z'],
  [15,'Juventus','Monza','20261214T194500Z'],
  [16,'Roma','Juventus','20261219T194500Z'],
  [17,'Bologna','Juventus','20270103T194500Z'],
  [18,'Juventus','Torino','20270106T113000Z'],
  [19,'Inter','Juventus','20270110T194500Z'],
];

test('Serie A rounds 6-19 use the confirmed dates and Rome kickoffs',async()=>{
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  assert.equal(response.status,200);
  for(const [round,home,away,kickoff] of fixtures){
    const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes(`UID:juventus-serie-a-2026-27-g${round}@`));
    assert.ok(event,`manca la ${round}ª giornata`);
    assert.match(event,new RegExp(`SUMMARY:Serie A: ${home} - ${away}`));
    assert.match(event,new RegExp(`DTSTART:${kickoff}`));
    assert.match(event,new RegExp(round >= 12 ? 'LAST-MODIFIED:20260925T000000Z' : 'LAST-MODIFIED:20260903T124600Z'));
    if (round === 12) assert.match(event,/Diretta: DAZN/);
    else if (round <= 11) assert.match(event,/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata/);
    else assert.match(event,/il-calendario-della-juventus-nella-serie-a-2026-27/);
  }
  const cup=calendar.split('BEGIN:VEVENT').find(item=>item.includes('UID:juventus-coppa-italia-2026-27-ottavi@'));
  assert.ok(cup,'manca l’ottavo di Coppa Italia');
  assert.match(cup,/SUMMARY:Coppa Italia: Juventus - Sassuolo/);
  assert.match(cup,/DTSTART:20261203T200000Z/);
  assert.match(cup,/Ottavi di finale di Coppa Italia 2026\/27/);
});

test('the home fallback carries every newly confirmed kickoff',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const kickoff of ['2026-10-11T20:45:00+02:00','2026-10-18T20:45:00+02:00','2026-10-25T18:00:00+01:00','2026-10-28T20:45:00+01:00','2026-11-01T20:45:00+01:00','2026-11-08T20:45:00+01:00','2026-11-22T12:30:00+01:00','2026-11-29T20:45:00+01:00','2026-12-06T18:00:00+01:00','2026-12-14T20:45:00+01:00','2026-12-19T20:45:00+01:00','2027-01-03T20:45:00+01:00','2027-01-06T12:30:00+01:00','2027-01-10T20:45:00+01:00','2026-12-03T21:00:00+01:00']) assert.match(html,new RegExp(kickoff.replace(/[+]/g,'\\+')));
  assert.match(html,/broadcaster:"DAZN"/);
  assert.match(html,/previousKickoff:"2026-11-23T20:45:00\+01:00"/);
  assert.doesNotMatch(html,/{date:"2026-11-23T20:45:00\+01:00",status:"scheduled"/);
  assert.match(html,/roundLabel:"Ottavi di finale"/);
});

test('a later provider rescheduling remains authoritative',()=>{
  const match={id:1,matchday:6,status:'TIMED',utcDate:'2026-10-12T18:45:00Z',lastUpdated:'2026-09-04T08:00:00Z',competition:{code:'SA',name:'Serie A'},homeTeam:{id:104,name:'Cagliari'},awayTeam:{id:109,name:'Juventus'},score:{fullTime:{home:null,away:null}}};
  assert.equal(matchReportFromFootballData(match).match_date,'2026-10-12T18:45:00Z');
});

test('the later official matchday 12 notice replaces the earlier Monday slot',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({matches:[{id:12,matchday:12,status:'TIMED',utcDate:'2026-11-23T19:45:00Z',lastUpdated:'2026-09-26T08:00:00Z',competition:{code:'SA'},homeTeam:{name:'Juventus'},awayTeam:{name:'Venezia'}}]}));
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{FOOTBALL_DATA_KEY:'test'}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes('UID:juventus-serie-a-2026-27-g12@'));
  assert.match(event,/DTSTART:20261122T113000Z/);
  assert.match(event,/Diretta: DAZN/);
});

test('the revised 15th-round Monday kickoff replaces a stale Sunday provider slot',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({matches:[{id:15,matchday:15,status:'TIMED',utcDate:'2026-12-13T19:45:00Z',lastUpdated:'2026-09-26T08:00:00Z',competition:{code:'SA'},homeTeam:{name:'Juventus'},awayTeam:{name:'Monza'}}]}));
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{FOOTBALL_DATA_KEY:'test'}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes('UID:juventus-serie-a-2026-27-g15@'));
  assert.match(event,/DTSTART:20261214T194500Z/);
});

test('the public match detail corrects an archived stale 15th-round date',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json([{match_id:'g15',match_date:'2026-12-13T19:45:00Z',status:'SCHEDULED',competition:'Serie A',source_payload:{utcDate:'2026-12-13T19:45:00Z',status:'TIMED',matchday:15,competition:{name:'Serie A'},homeTeam:{name:'Juventus'},awayTeam:{name:'Monza'}}}]));
  const response=await onRequest({request:new Request('https://example.test/api/public/match?match_id=g15'),env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.date,'2026-12-14T19:45:00Z');
});

test('the match page has an official scheduled fallback without a match report',async()=>{
  const response=await onRequest({request:new Request('https://example.test/api/public/match?date=2026-11-22T11%3A30%3A00.000Z&home=Juventus&away=Venezia'),env:{}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.date,'2026-11-22T11:30:00Z');
  assert.equal(body.broadcaster,'DAZN');
  assert.equal(body.status,'scheduled');
});

test('Coppa Italia match page exposes its official round and kickoff',async()=>{
  const response=await onRequest({request:new Request('https://example.test/api/public/match?date=2026-12-03T20%3A00%3A00.000Z&home=Juventus&away=Sassuolo'),env:{}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.date,'2026-12-03T20:00:00Z');
  assert.equal(body.competition,'Coppa Italia');
  assert.equal(body.roundLabel,'Ottavi di finale');
});

test('calendar revision stays stable when the provider omits lastUpdated',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({matches:[{id:1,matchday:6,status:'SCHEDULED',utcDate:'2026-10-11T00:00:00Z',competition:{code:'SA'},homeTeam:{name:'Cagliari'},awayTeam:{name:'Juventus'}}]}));
  const response=await onRequest({request:new Request('https://example.test/api/juventus/calendar.ics'),env:{FOOTBALL_DATA_KEY:'test'}});
  const calendar=(await response.text()).replace(/\r\n /g,'');
  const event=calendar.split('BEGIN:VEVENT').find(item=>item.includes('UID:juventus-serie-a-2026-27-g6@'));
  assert.match(event,/LAST-MODIFIED:20260903T124600Z/);
  assert.match(event,/SEQUENCE:1788439560/);
});
