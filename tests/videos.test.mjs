import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminVideos,videoFile,publicVideos,VIDEO_LIMIT,socialVideo,resolveSocialVideo} from '../functions/lib/videos.js';
import {onRequest} from '../functions/api/[[path]].js';
const env={ADMIN_TOKEN:'admin-test',SUPABASE_URL:'https://video-db.test',SUPABASE_SERVICE_ROLE_KEY:'private-test'};
const mp4=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
function store(t){
  let state=null;const objects=new Map(),calls=[];let conflict=false,deleteError=false;
  const sb=async(_env,path,options={})=>{
    if(!options.method)return state?[{value:structuredClone(state)}]:[];
    if(options.method==='POST'){if(state||conflict)throw new Error('Conflict');state=structuredClone(options.body[0].value);}
    else{if(conflict||new URL('https://db.test'+path).searchParams.get('value->>revision')!=='eq.'+state.revision)return [];state=structuredClone(options.body.value);}
    return [{value:structuredClone(state)}];
  };
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    calls.push({url,options});const path=new URL(url).pathname;
    if(path.includes('/bucket/'))return Response.json({public:false});
    if(options.method==='DELETE'){if(deleteError)return new Response(null,{status:503});for(const key of JSON.parse(options.body).prefixes)objects.delete(key);return Response.json({});}
    if(options.method==='POST'){objects.set(path.split('/').pop(),options.body instanceof ReadableStream?new Uint8Array(await new Response(options.body).arrayBuffer()):options.body);return Response.json({});}
    const bytes=objects.get(path.split('/').pop());if(!bytes)return new Response(null,{status:404});
    if(options.headers.Range)return new Response(bytes.slice(0,8),{status:206,headers:{'Content-Range':'bytes 0-7/16','Content-Length':'8'}});
    return new Response(bytes);
  });
  return {sb,objects,calls,get state(){return state;},set conflict(value){conflict=value;},set deleteError(value){deleteError=value;}};
}
function upload(revision='initial',extra={}){
  const form=new FormData();form.set('title','Intervista ICV');form.set('description','Dopo la partita');form.set('rights','true');form.set('revision',revision);form.set('video',new Blob([mp4],{type:'video/mp4'}),'video.mp4');
  for(const [key,value] of Object.entries(extra))form.set(key,value);
  return new Request('https://icv.test/api/admin/videos',{method:'POST',body:form});
}
const mutate=(state,method,values)=>new Request('https://icv.test/api/admin/videos',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,id:state.videos[0].id,...values})});
const file=(id,asset='',headers={})=>new Request('https://icv.test/api/public/video-file?id='+id+asset,{headers});
const create=(state,values)=>new Request('https://icv.test/api/admin/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state?.revision||'initial',title:'Intervista',rights:true,...values})});

test('social: link canonici sicuri, duplicati, pubblicazione e nessun file da eliminare',async t=>{
  assert.equal(socialVideo('https://instagram.com/reel/Abcd123/?utm_source=test').source_url,'https://www.instagram.com/reel/Abcd123/');
  for(const value of ['http://instagram.com/reel/Abcd123/','https://evil.test/reel/Abcd123/','https://instagram.com.evil.test/reel/Abcd123/','https://user:pass@instagram.com/reel/Abcd123/','https://www.tiktok.com/@user/video/nope','https://vm.tiktok.com/abc'])assert.throws(()=>socialVideo(value));
  const db=store(t);await adminVideos(create(null,{source_url:'https://www.tiktok.com/@scout2015/video/6718335390845095173'}),env,db.sb);
  await assert.rejects(adminVideos(create(db.state,{source_url:db.state.videos[0].source_url}),env,db.sb),{status:409});
  await adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb);assert.equal(publicVideos(db.state)[0].kind,'tiktok');assert.equal(publicVideos(db.state)[0].url,null);
  assert.equal((await videoFile(file(db.state.videos[0].id),env,db.sb,true)).status,404);
  await adminVideos(mutate(db.state,'DELETE',{}),env,db.sb);assert.equal(db.calls.length,0);assert.equal(db.state.videos.length,0);
});
test('link TikTok brevi: redirect limitati, nessuna richiesta a domini non autorizzati',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://www.tiktok.com/@scout2015/video/6718335390845095173'}});});
  assert.equal((await resolveSocialVideo('https://vm.tiktok.com/Zabc/')).kind,'tiktok');assert.equal(calls.length,1);
  t.mock.method(globalThis,'fetch',async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://private.example/secret'}});});
  await assert.rejects(resolveSocialVideo('https://vt.tiktok.com/Zabc/'));assert.equal(calls.length,2);
  await assert.rejects(resolveSocialVideo('https://user:password@vm.tiktok.com/Zabc/'));assert.equal(calls.length,2);
});
test('upload progressivo: quote prenotate, firma e dimensioni verificate, completamento obbligatorio',async t=>{
  const db=store(t);await adminVideos(create(null,{video_size:mp4.length}),env,db.sb);const id=db.state.videos[0].id;
  await assert.rejects(adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb));
  await assert.rejects(adminVideos(mutate(db.state,'PATCH',{complete:true}),env,db.sb));
  const put=body=>new Request('https://icv.test/api/admin/videos?id='+id+'&asset=video',{method:'PUT',headers:{'Content-Type':'video/mp4'},body});
  await adminVideos(put(mp4),env,db.sb);assert.equal(db.objects.get(id+'.mp4').length,16);
  await assert.rejects(adminVideos(put(mp4),env,db.sb),{status:409});
  await adminVideos(mutate(db.state,'PATCH',{complete:true,published:true}),env,db.sb);assert.equal(publicVideos(db.state).length,1);
  await assert.rejects(adminVideos(create(db.state,{video_size:VIDEO_LIMIT+1}),env,db.sb),{status:413});
});
test('upload progressivo invalido lascia una bozza incompleta senza file pubblico',async t=>{
  const db=store(t);await adminVideos(create(null,{video_size:16}),env,db.sb);const id=db.state.videos[0].id;
  await assert.rejects(adminVideos(new Request('https://icv.test/api/admin/videos?id='+id,{method:'PUT',headers:{'Content-Type':'video/mp4'},body:new Uint8Array(16)}),env,db.sb));
  assert.equal(db.objects.size,0);assert.equal(publicVideos(db.state).length,0);
  await adminVideos(mutate(db.state,'DELETE',{}),env,db.sb);assert.equal(db.state.videos.length,0);
});

test('video caricato privato, pubblicato, modificato, nascosto e rimosso',async t=>{
  const db=store(t);assert.equal((await adminVideos(upload(),env,db.sb)).status,201);
  const id=db.state.videos[0].id;assert.equal(publicVideos(db.state).length,0);
  assert.equal((await videoFile(file(id),env,db.sb)).status,404);
  assert.equal((await videoFile(file(id),env,db.sb,true)).status,200);
  await adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb);
  const published=publicVideos(db.state);assert.equal(published.length,1);assert.equal(published[0].size,undefined);assert.ok(!JSON.stringify(published).includes('private-test'));
  const range=await videoFile(file(id,'',{Range:'bytes=0-7'}),env,db.sb);assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 0-7/16');assert.equal(range.headers.get('cache-control'),'no-store');assert.equal((await range.arrayBuffer()).byteLength,8);
  await adminVideos(mutate(db.state,'PATCH',{title:'Titolo nuovo',description:'<testo>',published:false}),env,db.sb);
  assert.equal(db.state.videos[0].description,'testo');assert.equal((await videoFile(file(id),env,db.sb)).status,404);
  await adminVideos(mutate(db.state,'DELETE',{}),env,db.sb);assert.equal(db.state.videos.length,0);assert.equal(db.objects.size,0);
});
test('tutte le operazioni admin e le anteprime richiedono autenticazione',async()=>{
  for(const path of ['admin/videos','admin/video-file?id=00000000-0000-0000-0000-000000000000'])for(const method of ['GET','POST','PUT','PATCH','DELETE']){
    const response=await onRequest({request:new Request('https://icv.test/api/'+path,{method}),env});assert.equal(response.status,401);
  }
});
test('rifiuta MIME falso, MP4 invalido, consenso assente e file troppo grandi',async t=>{
  const db=store(t);
  for(const extra of [{rights:'false'},{video:new Blob(['html'],{type:'text/html'})},{video:new Blob(['fake mp4'],{type:'video/mp4'})},{video:new Blob([new Uint8Array(20*1048576+1)],{type:'video/mp4'})},{cover:new Blob(['fake'],{type:'image/jpeg'})},{captions:new Blob(['wrong'],{type:'text/vtt'})}])await assert.rejects(adminVideos(upload('initial',extra),env,db.sb));
  assert.equal(db.objects.size,0);assert.equal(db.state,null);
});
test('revisioni obsolete e concorrenza non sovrascrivono e puliscono i file',async t=>{
  const db=store(t);await adminVideos(upload(),env,db.sb);
  await assert.rejects(adminVideos(upload('old'),env,db.sb),{status:409});
  db.conflict=true;await assert.rejects(adminVideos(upload(db.state.revision),env,db.sb),{status:409});assert.equal(db.objects.size,1);assert.equal(db.state.videos.length,1);
});
test('eliminazione fallita resta nascosta e ripetibile',async t=>{
  const db=store(t);await adminVideos(upload(),env,db.sb);await adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb);
  db.deleteError=true;await assert.rejects(adminVideos(mutate(db.state,'DELETE',{}),env,db.sb),{status:502});assert.equal(publicVideos(db.state).length,0);assert.equal(db.objects.size,1);
  db.deleteError=false;await adminVideos(mutate(db.state,'DELETE',{}),env,db.sb);assert.equal(db.objects.size,0);
});
test('sottotitoli e copertina sono disponibili solo dopo pubblicazione',async t=>{
  const db=store(t);await adminVideos(upload('initial',{cover:new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'}),captions:new Blob(['WEBVTT\n\n00:00.000 --> 00:01.000\nCiao'],{type:'text/vtt'})}),env,db.sb);const id=db.state.videos[0].id;
  assert.equal((await videoFile(file(id,'&asset=captions'),env,db.sb)).status,404);await adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb);
  const captions=await videoFile(file(id,'&asset=captions'),env,db.sb);assert.match(captions.headers.get('content-type'),/text\/vtt/);assert.match(await captions.text(),/WEBVTT/);
  assert.equal((await videoFile(file(id,'&asset=cover'),env,db.sb)).status,200);
});
test('date ordinate, niente bozza o tombstone in archivio pubblico',()=>{
  const videos=Array.from({length:5},(_,i)=>({id:String(i),title:'Video '+i,published_at:'2026-10-0'+(i+1),published:i!==2,deleted:i===4}));assert.deepEqual(publicVideos({videos}).map(v=>v.id),['3','1','0']);
});
test('limite archivio e range invalidi sono applicati dal server',async t=>{
  const db=store(t);await adminVideos(upload(),env,db.sb);db.state.videos[0].size=800*1048576;
  await assert.rejects(adminVideos(upload(db.state.revision),env,db.sb),{status:413});
  await adminVideos(mutate(db.state,'PATCH',{published:true}),env,db.sb);assert.equal((await videoFile(file(db.state.videos[0].id,'',{Range:'bytes=-'}),env,db.sb)).status,416);
});
test('un bucket pubblico o un archivio non disponibile non vengono usati',async t=>{
  const db=store(t);t.mock.method(globalThis,'fetch',async()=>Response.json({public:true}));
  await assert.rejects(adminVideos(upload(),env,db.sb),{status:503});assert.equal(db.objects.size,0);
  await assert.rejects(adminVideos(new Request('https://icv.test/api/admin/videos'),env,async()=>{throw new Error('Unavailable');}),/Unavailable/);
});
test('multipart malformato e JSON non valido restituiscono errore controllato',async t=>{
  const db=store(t);
  await assert.rejects(adminVideos(new Request('https://icv.test/api/admin/videos',{method:'POST',headers:{'Content-Type':'multipart/form-data'},body:'broken'}),env,db.sb),{status:400});
  await assert.rejects(adminVideos(new Request('https://icv.test/api/admin/videos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'null'}),env,db.sb),{status:409});
});
