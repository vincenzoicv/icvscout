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

test('monitor registry validates empty and populated states',()=>{
  const monitor=JSON.parse(read('data/match-monitor.json'));
  assert.equal(monitor.version,1);
  assert.ok(Array.isArray(monitor.updates));
  assert.ok(monitor.updates.length<=6);
  if(monitor.match===null){
    assert.equal(monitor.updated_at,null);
    assert.deepEqual(monitor.updates,[]);
    return;
  }
  assert.ok(Number.isFinite(Date.parse(monitor.updated_at)));
  for(const key of ['home','away','competition']) assert.equal(typeof monitor.match[key],'string');
  assert.ok(Number.isFinite(Date.parse(monitor.match.kickoff)));
  for(const update of monitor.updates){
    for(const key of ['category','title','summary','source','source_url','published_at']) assert.equal(typeof update[key],'string');
    assert.equal(new URL(update.source_url).protocol,'https:');
    assert.ok(Number.isFinite(Date.parse(update.published_at)));
    assert.equal(update.significant,true);
  }
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
