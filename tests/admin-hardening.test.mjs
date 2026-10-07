import test from 'node:test';
import assert from 'node:assert/strict';
import cron from '../workers/icv-cron.js';
import {onRequest,buildAutomationMonitor} from '../functions/api/[[path]].js';

const env={ADMIN_TOKEN:'test-admin',SUPABASE_URL:'https://admin-db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
const request=(method='GET',body)=>new Request('https://icv.test/api/admin/news',{method,headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const run=req=>onRequest({request:req,env});

test('monitor exposes nested failures without counting partial results as clean successes',()=>{
  const monitor=buildAutomationMonitor([{type:'home_autopilot',status:'ok',created_at:'2026-10-06T10:00:00Z',payload:{ok:true,tasks:[{type:'market',result:{ok:false,error:'Fonte non disponibile'}},{type:'news',result:{ok:true,tasks:[{type:'feed',result:{ok:false}}]}}]}}],{now:'2026-10-06T11:00:00Z'});
  const job=monitor.jobs.find(job=>job.key==='home_autopilot');
  assert.equal(job.status,'degraded');assert.equal(job.success_streak,0);
  assert.equal(monitor.recent_runs[0].outcome,'warning');
  assert.ok(monitor.recent_runs[0].problems.includes('market: Fonte non disponibile'));
  assert.ok(monitor.recent_runs[0].problems.includes('news: feed: Operazione non riuscita'));
});

test('skipped attempts do not refresh a delayed job or become completed runs',()=>{
  const monitor=buildAutomationMonitor([
    {type:'news',status:'ok',created_at:'2026-10-06T10:55:00Z',payload:{ok:true,skipped:true,reason:'interval_not_elapsed'}},
    {type:'news',status:'ok',created_at:'2026-10-01T10:00:00Z',payload:{ok:true,skipped:3}},
    {type:'market',status:'pending',created_at:'2026-10-06T10:00:00Z',payload:{ok:true}},
    {type:'instagram_import',status:'ok',created_at:'invalid',payload:{}},
    {type:'instagram_import',status:'ok',created_at:'2027-10-06T10:00:00Z',payload:{}}
  ],{now:'2026-10-06T11:00:00Z'});
  const news=monitor.jobs.find(job=>job.key==='news');
  assert.equal(news.status,'delayed');assert.equal(news.last_run_at,'2026-10-01T10:00:00Z');
  assert.equal(news.last_attempt_outcome,'skipped');
  assert.equal(monitor.recent_runs.find(run=>run.type==='news').outcome,'skipped');
  assert.equal(monitor.recent_runs.find(run=>run.type==='market').outcome,'unknown');
  assert.equal(monitor.jobs.find(job=>job.key==='instagram_import').status,'idle');
});

test('source reports retain the actual news check date and feed identity',()=>{
  const created_at='2026-10-01T10:00:00Z';
  const monitor=buildAutomationMonitor([{type:'news',status:'ok',created_at,payload:{sources_report:[{source:'Fonte test',url:'https://example.test/feed',scanned:3,relevant:2,published:1}]}}],{now:'2026-10-06T11:00:00Z'});
  assert.equal(monitor.sources[0].last_checked_at,created_at);
  assert.equal(monitor.sources[0].url,'https://example.test/feed');
  assert.equal(monitor.sources[0].changed,1);
  const legacy=buildAutomationMonitor([{type:'news',status:'ok',created_at,payload:{sources_report:[{source:'Vecchia fonte'}]}}]);
  assert.equal(legacy.sources[0].url,null);
});

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
test('internal news phases reject anonymous requests before any outgoing work',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json([]);});
  for(const path of ['news-batch','task'])for(const method of ['GET','POST']){
    const response=await onRequest({request:new Request('https://icv.test/api/cron/'+path,{method}),env});
    assert.equal(response.status,401);
  }
  assert.equal(calls,0);
});
test('news collection spans isolated invocations and still records a current run',async t=>{
  const counts=[0],logs=[];let id=1,internal=0;
  const rss='<rss><channel>'+Array.from({length:12},(_,i)=>'<item><title>Juventus rinnovo giocatore test '+i+'</title><link>https://example.test/article/'+i+'</link><description>La Juventus prepara il rinnovo del contratto del giocatore '+i+'</description><pubDate>'+new Date().toUTCString()+'</pubDate></item>').join('')+'</channel></rss>';
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    counts[counts.length-1]++;
    const u=new URL(url);
    if(u.pathname==='/api/cron/news-batch'){
      assert.equal(options.redirect,'manual');
      assert.equal(u.origin,'https://icvscout-2026.pages.dev');
      internal++;counts.push(0);
      const response=await onRequest({request:new Request(url,options),env});
      assert.ok(counts.pop()<=40,'every source block stays within its request allowance');
      return response;
    }
    if(u.hostname!==new URL(env.SUPABASE_URL).hostname)return new Response(rss);
    if(options.method==='POST'){
      const rows=JSON.parse(options.body);
      if(u.pathname.endsWith('/automation_runs'))logs.push(...rows);
      return Response.json(rows.map(row=>({...row,id:id++})));
    }
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_news'})}),env});
  assert.equal(response.status,200);const result=await response.json();
  assert.ok(internal>1);assert.ok(counts[0]<50);assert.ok(result.scanned>0);assert.ok(result.inserted>0);
  assert.ok(result.errors.every(error=>!error.error.includes('subrequests')));
  assert.equal(logs.at(-1).type,'news');assert.equal(logs.at(-1).payload.scanned,result.scanned);
  assert.ok(result.sources_report.every(report=>!report.error));
});
test('home phases are isolated and the parent can record their result',async t=>{
  const tasks=[],logs=[];
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/api/cron/task'){const body=JSON.parse(options.body);tasks.push(body.action);assert.equal(u.origin,'https://icvscout-2026.pages.dev');assert.equal(options.redirect,'manual');assert.equal(options.headers['X-ICV-Cron-Token'],env.ADMIN_TOKEN);return Response.json({ok:true,scanned:3});}
    if(options.method==='POST'&&u.pathname.endsWith('/automation_runs'))logs.push(...JSON.parse(options.body));
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'home_autopilot'})}),env:{...env,IG_ACCESS_TOKEN:'test',FOOTBALL_DATA_KEY:'test'}});
  assert.equal(response.status,200);assert.deepEqual(tasks,['instagram_import','fetch_news','market','match_center']);
  assert.equal(logs.at(-1).type,'home_autopilot');
});
test('internal redirects are rejected without forwarding the cron credential',async t=>{
  const destinations=[];
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    destinations.push(String(url));
    if(new URL(url).pathname==='/api/cron/task'){
      assert.equal(options.redirect,'manual');
      return new Response(null,{status:302,headers:{Location:'https://other.test/'}});
    }
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'home_autopilot'})}),env});
  const result=await response.json();assert.equal(result.ok,false);
  assert.ok(result.tasks.some(task=>task.error?.includes('Reindirizzamento inatteso')));
  assert.ok(destinations.every(url=>!url.startsWith('https://other.test/')));
});
test('a partial news scan retains its position and is not shown as fully healthy',async t=>{
  let calls=0;const logs=[];
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/api/cron/news-batch'){
      calls++;const body=JSON.parse(options.body);assert.equal(body.offset,calls-1);
      return Response.json({ok:true,scanned:1,inserted:0,sources_report:[],next_offset:calls,errors:[]});
    }
    if(options.method==='POST'){logs.push(...JSON.parse(options.body));return Response.json([]);}
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_news'})}),env});
  const result=await response.json();assert.equal(calls,24);assert.equal(result.continuation.offset,24);assert.ok(result.warning);
  const monitor=buildAutomationMonitor([{...logs.at(-1),created_at:new Date().toISOString()}]);
  assert.equal(monitor.jobs.find(job=>job.key==='news').status,'degraded');
});
test('a following news run resumes the saved source and offset',async t=>{
  let first;
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/api/cron/news-batch'){
      const body=JSON.parse(options.body);first??=body;
      return Response.json({ok:true,scanned:0,sources_report:[],next_offset:null,errors:[]});
    }
    if(u.pathname.endsWith('/sources'))return Response.json([{name:'Fonte test',url:'https://example.test/feed',active:true,reliability:'trusted'}]);
    if(u.pathname.endsWith('/automation_runs')&&options.method!=='POST')return Response.json([{payload:{continuation:{source_url:'https://example.test/feed',offset:4}}}]);
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/admin/automate',{method:'POST',headers:{'X-ICV-Admin-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({action:'fetch_news'})}),env});
  assert.equal(response.status,200);assert.equal(first.source_url,'https://example.test/feed');assert.equal(first.offset,4);assert.equal((await response.json()).continuation,undefined);
});
test('a batch does not republish a draft that was already approved',async t=>{
  const title='Juventus rinnovo Mario Rossi';let writes=0;
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url);
    if(options.method&&options.method!=='GET')writes++;
    if(u.hostname==='example.test')return new Response('<rss><channel><item><title>'+title+'</title><link>https://example.test/article</link><pubDate>'+new Date().toUTCString()+'</pubDate></item></channel></rss>');
    if(u.pathname.endsWith('/sources'))return Response.json([{name:'Fonte test',url:'https://example.test/feed',active:true,reliability:'official'}]);
    if(u.pathname.endsWith('/news_drafts'))return Response.json([{id:5,title,review_status:'approved',source_name:'Fonte test',source_url:'https://example.test/article',created_at:new Date().toISOString()}]);
    return Response.json([]);
  });
  const response=await onRequest({request:new Request('https://icv.test/api/cron/news-batch',{method:'POST',headers:{'X-ICV-Cron-Token':env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({source_url:'https://example.test/feed'})}),env});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.skipped_duplicates,1);assert.equal(result.published,0);assert.equal(writes,0);
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
