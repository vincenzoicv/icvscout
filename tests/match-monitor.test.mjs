import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Match Hub includes a source-backed 48-hour monitoring panel',()=>{
  const html=read('index.html');
  assert.match(html,/id="matchHubIntel"/);
  assert.match(html,/function matchMonitorMatches\(/);
  assert.match(html,/kickoff - 48 \* 3600000/);
  assert.match(html,/now < kickoff/);
  assert.match(html,/significant !== false/);
  assert.match(html,/\^https:\\\/\\\//);
  assert.match(html,/rel=\\"noopener noreferrer\\"/);
  assert.match(html,/loadMatchMonitor\(allMatchHubRows\(matches\)\)/);
});

test('monitor registry starts empty and validates as JSON',()=>{
  const monitor=JSON.parse(read('data/match-monitor.json'));
  assert.deepEqual(monitor,{version:1,updated_at:null,match:null,updates:[]});
});

test('monitor helper only matches the same fixture and a nearby kickoff',()=>{
  const html=read('index.html');
  const start=html.indexOf('function matchHubTeamKey(');
  const end=html.indexOf('function matchMonitorTime(',start);
  const source=html.slice(start,end);
  const context={};
  vm.runInNewContext(source+';result=matchMonitorMatches({match:{home:"Juventus",away:"Milan",kickoff:"2026-09-06T18:45:00Z"}},{home:"Juventus FC",away:"AC Milan",date:"2026-09-06T20:45:00+02:00"});',context);
  assert.equal(context.result,true);
  vm.runInNewContext(source+';result=matchMonitorMatches({match:{home:"Juventus",away:"Milan",kickoff:"2026-09-06T18:45:00Z"}},{home:"Juventus",away:"Lazio",date:"2026-09-06T20:45:00+02:00"});',context);
  assert.equal(context.result,false);
});
