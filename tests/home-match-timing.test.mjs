import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const names=['matchHubRomeDayNumber','matchHubPhase','matchHubDate'];
const code=names.map(name=>{
  const start=html.indexOf('function '+name+'(');
  return html.slice(start,html.indexOf('\n}\n',start)+2);
}).join('\n');
function context(now){
  const RealDate=Date;
  class Clock extends RealDate {
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return new RealDate(now).getTime();}
  }
  return vm.runInNewContext(code+';({matchHubPhase,matchHubDate})',{Date:Clock,Intl});
}

test('matchday follows the Rome calendar, not a rolling 24-hour window',()=>{
  const match={date:'2026-10-22T16:45:00Z'};
  assert.equal(context('2026-10-21T20:00:00Z').matchHubPhase(match,null,false),'buildup');
  assert.equal(context('2026-10-21T22:00:00Z').matchHubPhase(match,null,false),'matchday');
  assert.equal(context('2026-10-22T16:00:00Z').matchHubPhase(match,null,false),'matchday');
});
test('live and final phases retain priority over matchday',()=>{
  const ui=context('2026-10-22T20:00:00Z');
  const latest={date:'2026-10-22T16:45:00Z',status:'finished'};
  assert.equal(ui.matchHubPhase(latest,latest,true),'live');
  assert.equal(ui.matchHubPhase(null,latest,false),'final');
});
test('kickoff uses Rome time including daylight-saving transitions',()=>{
  const ui=context('2026-10-22T00:00:00Z');
  assert.match(ui.matchHubDate({date:'2026-10-22T16:45:00Z'}),/18:45/);
  assert.match(ui.matchHubDate({date:'2026-10-25T17:00:00Z'}),/18:00/);
});
