import test from 'node:test';
import assert from 'node:assert/strict';
import cron from '../workers/icv-cron.js';
import {onRequest,buildAutomationMonitor} from '../functions/api/[[path]].js';

const env={ADMIN_TOKEN:'test-admin',SUPABASE_URL:'https://admin-db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
const request=(method='GET',body)=>new Request('https://icv.test/api/admin/news',{method,headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const run=req=>onRequest({request:req,env});

test('monitor reads each process independently and does not hide slower jobs',async t=>{
  const types=[];t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);if(u.pathname.endsWith('/automation_runs')){const type=u.searchParams.get('type');types.push(type);return Response.json([{id:type,type:type.slice(3),status:'ok',created_at:'2026-10-06T10:00:00Z',payload:{}}]);}
    return Response.json([]);
  });
  const data=await(await run(request())).json();
  assert.equal(types.length,7);assert.ok(types.includes('eq.news'));
  assert.ok(data.automation_monitor.jobs.find(job=>job.key==='news').last_run_at);
});
test('monitor read failure is reported rather than showing never-run jobs',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new URL(url).pathname.endsWith('/automation_runs')?Response.json({message:'unavailable'},{status:500}):Response.json([]));
  const data=await(await run(request())).json();assert.ok(data.read_warnings.includes('monitor'));assert.equal(data.automation_monitor,null);
});
test('balanced monitor history retains news and manual jobs are not marked late',()=>{
  const runs=Array.from({length:60},(_,id)=>({id,type:'match_center',status:'ok',created_at:'2026-10-06T10:00:00Z',payload:{}}));
  runs.push({id:100,type:'news',status:'ok',created_at:'2026-10-01T10:00:00Z',payload:{}});
  const monitor=buildAutomationMonitor(runs,{now:'2026-10-06T11:00:00Z',cadences:{news:null}});
  assert.equal(monitor.jobs.find(job=>job.key==='news').status,'healthy');
  assert.equal(monitor.recent_runs.filter(run=>run.type==='match_center').length,4);
  assert.ok(monitor.recent_runs.some(run=>run.type==='news'));
});

test('cron denies anonymous and wrong tokens before making any outgoing request',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({ok:true});});
  for(const method of ['GET','POST'])for(const token of ['', 'wrong']){
    const r=await cron.fetch(new Request('https://cron.test/?job=all',{method,headers:{'X-ICV-Cron-Token':token}}),{CRON_SECRET:'test-cron'});
    assert.equal(r.status,401);
  }
  const r=await cron.fetch(new Request('https://cron.test/?job=all',{headers:{'X-ICV-Cron-Token':'test-cron'}}),{CRON_SECRET:'test-cron'});
  assert.equal(r.status,405);assert.equal(calls,0);
});
test('cron allows authenticated POST and keeps scheduled runs independent of HTTP auth',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({ok:true});});
  const r=await cron.fetch(new Request('https://cron.test/?job=match',{method:'POST',headers:{'X-ICV-Cron-Token':'test-cron'}}),{CRON_SECRET:'test-cron'});
  assert.equal(r.status,200);assert.equal(calls[0].options.headers['X-ICV-Cron-Token'],'test-cron');
  await cron.scheduled({cron:'* * * * *'},{CRON_SECRET:'test-cron'});
  assert.equal(calls.length,2);
});
test('admin includes disabled defaults and reports database read failures',async t=>{
  t.mock.method(globalThis,'fetch',async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/news_drafts'))return Response.json({message:'database unavailable'},{status:500});
    if(path.endsWith('/sources'))return Response.json([{id:1,name:'Juventus.com diretto',url:'https://www.juventus.com/it/',active:false,reliability:'official'}]);
    return Response.json([]);
  });
  const r=await run(request());assert.equal(r.status,200);const data=await r.json();
  assert.ok(data.read_warnings.includes('drafts'));
  const source=data.sources.filter(s=>s.url==='https://www.juventus.com/it/');assert.equal(source.length,1);assert.equal(source[0].active,false);
});
test('source activation persists without replacing reliability',async t=>{
  const writes=[];t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(options.method==='PATCH'){writes.push(JSON.parse(options.body));return Response.json([]);}
    if(new URL(url).pathname.endsWith('/sources'))return Response.json([{id:1,name:'Juventus.com diretto',url:'https://www.juventus.com/it/',active:false,reliability:'official'}]);
    return Response.json([]);
  });
  const r=await run(request('PATCH',{type:'source_status',url:'https://www.juventus.com/it/',active:true}));assert.equal(r.status,200);assert.deepEqual(writes,[{active:true}]);
});
test('disabled default is never scanned by Fetch News',async t=>{
  const outside=[];t.mock.method(globalThis,'fetch',async(url)=>{
    if(new URL(url).hostname!=='admin-db.test'){outside.push(String(url));return new Response('<rss><channel></channel></rss>');}
    if(new URL(url).pathname.endsWith('/sources'))return Response.json([{id:1,name:'Juventus.com diretto',url:'https://www.juventus.com/it/',active:false,reliability:'official'}]);
    return Response.json([]);
  });
  const r=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_news'})}),env});
  assert.equal(r.status,200);assert.ok(!outside.includes('https://www.juventus.com/it/'));
});
test('source database outage stops the scan instead of reactivating defaults',async t=>{
  let outside=0;t.mock.method(globalThis,'fetch',async(url)=>{
    if(new URL(url).hostname!=='admin-db.test'){outside++;return new Response('<rss/>');}
    return Response.json({message:'unavailable'},{status:500});
  });
  const r=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_news'})}),env});
  assert.equal(r.status,500);assert.equal(outside,0);
});
test('approval uses the atomic RPC, not separate insert and draft PATCH',async t=>{
  const writes=[];t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const path=new URL(url).pathname;
    if(options.method==='POST'){writes.push(path);assert.equal(path,'/rest/v1/rpc/icv_approve_news_draft');return Response.json({news:{id:7},already_approved:true});}
    return Response.json([{id:1,title:'Titolo',body:'Testo',source_name:'ICV',review_status:'needs_review',reliability:'trusted'}]);
  });
  const r=await run(request('POST',{type:'approve_draft',id:1}));assert.equal(r.status,200);assert.equal((await r.json()).already_approved,true);assert.equal(writes.length,1);
});
test('discard cannot overwrite a concurrently approved draft',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options={})=>{assert.match(url,/review_status=neq.approved/);assert.equal(options.method,'PATCH');return Response.json([]);});
  const r=await run(request('PATCH',{type:'discard_draft',id:1}));assert.equal(r.status,409);
});
