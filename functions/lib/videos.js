const KEY = 'editorial_videos', BUCKET = 'editorial-videos';
export const VIDEO_LIMIT = 50 * 1024 * 1024;
const MULTIPART_LIMIT = 20 * 1024 * 1024;
const COVER_LIMIT = 2 * 1024 * 1024, ARCHIVE_LIMIT = 800 * 1024 * 1024;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (value, max) => String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const validID = id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id || '');

export async function readVideos(env, sb) {
  const rows = await sb(env, '/site_settings?key=eq.' + KEY + '&select=value&limit=1');
  if (!rows.length) return { revision: 'initial', videos: [] };
  const state = rows[0].value;
  if (!state?.revision || !Array.isArray(state.videos)) fail('Archivio video non valido', 500);
  return state;
}
export function publicVideos(state) {
  return state.videos.filter(v => v.published && !v.deleted && !v.uploading).sort((a,b) => b.published_at.localeCompare(a.published_at)).map(v => ({
    id: v.id, title: v.title, description: v.description, published_at: v.published_at,
    kind: v.kind || 'file', source_url: v.source_url || null,
    url: v.source_url ? null : '/api/public/video-file?id=' + v.id,
    poster: v.cover ? '/api/public/video-file?id=' + v.id + '&asset=cover' : null,
    captions: v.captions ? '/api/public/video-file?id=' + v.id + '&asset=captions' : null,
  }));
}
async function save(env, sb, state, previous) {
  state.revision = crypto.randomUUID();
  const payload = { key: KEY, value: state, updated_at: new Date().toISOString() };
  if (previous === 'initial') {
    try { await sb(env, '/site_settings', { method: 'POST', body: [payload] }); }
    catch { fail('Archivio modificato. Ricarica i video prima di riprovare.', 409); }
  } else {
    const rows = await sb(env, '/site_settings?key=eq.' + KEY + '&value->>revision=eq.' + encodeURIComponent(previous), { method: 'PATCH', body: payload, prefer: 'return=representation' });
    if (!rows.length) fail('Archivio modificato. Ricarica i video prima di riprovare.', 409);
  }
}
function storage(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Archivio video non configurato', 503);
  return { root: env.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY } };
}
async function bucket(env) {
  const { root, headers } = storage(env);
  let result = await fetch(root + '/bucket/' + BUCKET, { headers });
  if (!result.ok) {
    const detail = await result.json().catch(() => ({}));
    if (result.status !== 404 && Number(detail.statusCode) !== 404) fail('Archivio video non disponibile', 502);
    result = await fetch(root + '/bucket', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: VIDEO_LIMIT, allowed_mime_types: ['video/mp4', 'image/jpeg'] }) });
    if (!result.ok && result.status !== 409) fail('Impossibile preparare lo spazio video', 502);
    result = await fetch(root + '/bucket/' + BUCKET, { headers });
  }
  if (!result.ok) fail('Archivio video non disponibile', 502);
  const config = await result.json();
  if (config.public !== false) fail('Lo spazio video deve essere privato', 503);
  if (config.file_size_limit && config.file_size_limit < VIDEO_LIMIT) {
    const updated = await fetch(root + '/bucket/' + BUCKET, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ public: false, file_size_limit: VIDEO_LIMIT, allowed_mime_types: ['video/mp4','image/jpeg'] }) });
    if (!updated.ok) fail('Impossibile aggiornare il limite video', 502);
  }
}
export function socialVideo(value) {
  let url; try { url = new URL(value); } catch { fail('Inserisci un link Instagram o TikTok valido'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail('Usa un link HTTPS Instagram o TikTok');
  let match;
  if (['instagram.com','www.instagram.com'].includes(url.hostname) && (match = url.pathname.match(/^\/(reel|p)\/([\w-]{5,64})\/?$/))) return { kind: 'instagram', source_url: 'https://www.instagram.com/' + match[1] + '/' + match[2] + '/' };
  if (['tiktok.com','www.tiktok.com'].includes(url.hostname) && (match = url.pathname.match(/^\/@([\w.-]{1,64})\/video\/(\d{10,25})\/?$/))) return { kind: 'tiktok', source_url: 'https://www.tiktok.com/@' + match[1] + '/video/' + match[2] };
  fail('Usa il link completo del Reel, post Instagram o video TikTok, non il link breve di condivisione');
}
export async function resolveSocialVideo(value) {
  let url; try { url = new URL(value); } catch { return socialVideo(value); }
  if (!['vm.tiktok.com','vt.tiktok.com','www.tiktok.com'].includes(url.hostname) || !['/t/','/Z'].some(prefix=>url.pathname.startsWith(prefix)) && !['vm.tiktok.com','vt.tiktok.com'].includes(url.hostname)) return socialVideo(value);
  for (let i=0;i<5;i++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['vm.tiktok.com','vt.tiktok.com','www.tiktok.com','m.tiktok.com'].includes(url.hostname)) fail('Link TikTok non valido');
    if (/^\/@[\w.-]+\/video\/\d+\/?$/.test(url.pathname)) { url.hostname='www.tiktok.com';return socialVideo(url.href); }
    const response=await fetch(url.href,{redirect:'manual',signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    const location=response.headers.get('location');
    if (![301,302,303,307,308].includes(response.status)||!location) break;
    url=new URL(location,url);
  }
  fail('Link breve non risolvibile. Incolla il link completo del video TikTok');
}
async function jsonBody(request) {
  try { return JSON.parse(await (await boundedBody(request, 65536)).text()); }
  catch (error) { if (error.status) throw error; fail('Richiesta non valida'); }
}
async function streamAsset(request, env, sb, state) {
  const url = new URL(request.url), item = state.videos.find(v => v.id === url.searchParams.get('id') && v.uploading && !v.deleted);
  if (!item) fail('Caricamento non trovato', 404);
  const cover = url.searchParams.get('asset') === 'cover', expected = cover ? item.cover_size : item.video_size;
  if (!expected || !request.body) fail('File non previsto');
  if (Date.now() - Date.parse(item.created_at) > 86400000) fail('Caricamento scaduto. Elimina la bozza e riprova.', 409);
  if (item[cover ? 'cover_uploaded' : 'video_uploaded'] || item[cover ? 'cover_uploading' : 'video_uploading']) fail('File gia caricato o in caricamento', 409);
  const type = cover ? 'image/jpeg' : 'video/mp4';
  if (request.headers.get('content-type') !== type) fail('Formato file non valido');
  item[cover ? 'cover_uploading' : 'video_uploading'] = true;
  await save(env, sb, state, state.revision);
  let bytes = 0, prefix = new Uint8Array(), checked = false;
  // Only the small signature is buffered; the video passes directly to storage.
  const transform = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength; if (bytes > expected) fail('Dimensione file non valida', 413);
      if (!checked) {
        const needed = Math.min(16 - prefix.length, chunk.length), next = new Uint8Array(prefix.length + needed);
        next.set(prefix); next.set(chunk.subarray(0,needed),prefix.length); prefix = next;
        if (prefix.length === 16 || cover && prefix.length >= 3) {
          if (cover) { if (prefix[0] !== 255 || prefix[1] !== 216 || prefix[2] !== 255) fail('Copertina JPG non valida'); } else checkVideo(prefix);
          checked = true; controller.enqueue(prefix); if (chunk.length > needed) controller.enqueue(chunk.subarray(needed));
        }
      } else controller.enqueue(chunk);
    },
    flush() { if (!checked || bytes !== expected) fail('File incompleto o non valido'); }
  });
  const { root, headers } = storage(env), path = item.id + (cover ? '.jpg' : '.mp4');
  try {
    const result = await fetch(root + '/object/' + BUCKET + '/' + path, { method: 'POST', headers: { ...headers, 'Content-Type': type }, body: request.body.pipeThrough(transform), duplex: 'half' });
    if (!result.ok || bytes !== expected || !checked) fail('Caricamento non riuscito. Elimina la bozza incompleta e riprova.', 502);
    item[cover ? 'cover_uploaded' : 'video_uploaded'] = true;
    item[cover ? 'cover_uploading' : 'video_uploading'] = false;
    await save(env, sb, state, state.revision);
  } catch (error) { await remove(env, [path]); throw error; }
  return reply({ ok: true });
}
async function remove(env, paths) {
  const { root, headers } = storage(env);
  const result = await fetch(root + '/object/' + BUCKET, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  if (!result.ok) fail('Video nascosto, ma rimozione file non riuscita. Riprova a eliminarlo.', 502);
}
async function boundedBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) fail('File troppo grande', 413);
  const reader = request.body?.getReader(); if (!reader) fail('Richiesta vuota');
  const chunks = []; let bytes = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    bytes += chunk.value.length;
    if (bytes > limit) { await reader.cancel(); fail('File troppo grande', 413); }
    chunks.push(chunk.value);
  }
  return new Blob(chunks, { type: request.headers.get('content-type') || '' });
}
export function checkVideo(bytes) {
  if (bytes.length < 16 || new TextDecoder().decode(bytes.slice(4,8)) !== 'ftyp') fail('Usa un file MP4 valido');
}
export async function adminVideos(request, env, sb) {
  storage(env);
  let state = await readVideos(env, sb);
  if (request.method === 'GET') return reply({ ...state, max_bytes: VIDEO_LIMIT, archive_limit: ARCHIVE_LIMIT, used_bytes: state.videos.reduce((n,v) => n + v.size, 0) });
  if (request.method === 'PUT') return streamAsset(request, env, sb, state);
  if (!['POST','PATCH','DELETE'].includes(request.method)) return reply({ error: 'Metodo non consentito' }, 405);
  const type = request.headers.get('content-type') || '';
  if (request.method === 'POST') {
    if (type.includes('application/json')) {
      const body = await jsonBody(request);
      if (!body || body.revision !== state.revision) fail('Archivio modificato. Ricarica i video.', 409);
      const title = clean(body.title,160); if (!title) fail('Inserisci il titolo');
      if (body.rights !== true) fail('Conferma di avere i diritti per pubblicare il video');
      if (state.videos.length >= 50) fail('Archivio completo: massimo 50 video',413);
      const id = crypto.randomUUID(), item = { id, title, description: clean(body.description,1200), size: 0, rights_confirmed: true, published: false, published_at: null, created_at: new Date().toISOString() };
      if (body.source_url) {
        Object.assign(item,await resolveSocialVideo(body.source_url));
        if (state.videos.some(v => !v.deleted && v.source_url === item.source_url)) fail('Questo video e gia presente nell\'archivio',409);
      } else {
        if (!Number.isSafeInteger(body.video_size) || body.video_size < 16 || body.video_size > VIDEO_LIMIT) fail('Video MP4: massimo 50 MB',413);
        const cover = body.cover_size || 0;
        if (!Number.isSafeInteger(cover) || cover < 0 || cover > COVER_LIMIT) fail('Copertina JPG: massimo 2 MB');
        const captions = String(body.captions || '');
        if (new TextEncoder().encode(captions).length > 32768 || captions && !/^\uFEFF?WEBVTT(?:\s|$)/.test(captions)) fail('Sottotitoli VTT: massimo 32 KB');
        Object.assign(item,{kind:'file',uploading:true,video_size:body.video_size,cover_size:cover,cover:cover>0,captions,size:body.video_size+cover});
        if (state.videos.reduce((n,v)=>n+v.size,0)+item.size > ARCHIVE_LIMIT) fail('Spazio video esaurito: elimina un video prima di riprovare',413);
        await bucket(env);
      }
      state.videos.push(item); await save(env,sb,state,state.revision);
      return reply({ok:true,id},201);
    }
    if (!type.startsWith('multipart/form-data')) fail('Formato non valido', 415);
    const blob = await boundedBody(request, MULTIPART_LIMIT + COVER_LIMIT + 65536);
    let form;
    try { form = await new Response(blob, { headers: { 'Content-Type': type } }).formData(); }
    catch { fail('Richiesta di caricamento non valida'); }
    const title = clean(form.get('title'), 160), file = form.get('video'), cover = form.get('cover');
    if (!title) fail('Inserisci il titolo');
    if (form.get('rights') !== 'true') fail('Conferma di avere i diritti per pubblicare il video');
    if (!file || typeof file.arrayBuffer !== 'function' || file.type !== 'video/mp4') fail('Scegli un video MP4');
    if (!file.size || file.size > MULTIPART_LIMIT) fail('Usa il caricamento progressivo per video oltre 20 MB', 413);
    if (cover?.size && (cover.type !== 'image/jpeg' || cover.size > COVER_LIMIT)) fail('Copertina JPG: massimo 2 MB');
    const captionsFile = form.get('captions'); let captions = '';
    if (captionsFile?.size) {
      if (captionsFile.size > 32768) fail('Sottotitoli troppo grandi: massimo 32 KB');
      captions = await captionsFile.text();
      if (!/^\uFEFF?WEBVTT(?:\s|$)/.test(captions)) fail('Usa sottotitoli WebVTT validi');
    }
    if (form.get('revision') !== state.revision) fail('Archivio modificato. Ricarica i video.', 409);
    const size = file.size + (cover?.size || 0);
    if (state.videos.reduce((n,v) => n + v.size, 0) + size > ARCHIVE_LIMIT || state.videos.length >= 50) fail('Spazio video esaurito. Elimina un video prima di caricarne un altro.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer()); checkVideo(bytes);
    let coverBytes;
    if (cover?.size) { coverBytes = new Uint8Array(await cover.arrayBuffer()); if (coverBytes[0] !== 255 || coverBytes[1] !== 216 || coverBytes[2] !== 255) fail('La copertina non e un JPG valido'); }
    await bucket(env);
    const id = crypto.randomUUID(), paths = [], { root, headers } = storage(env);
    try {
      for (const [path, body, contentType] of [[id + '.mp4', bytes, 'video/mp4'], ...(coverBytes ? [[id + '.jpg', coverBytes, 'image/jpeg']] : [])]) {
        const result = await fetch(root + '/object/' + BUCKET + '/' + path, { method: 'POST', headers: { ...headers, 'Content-Type': contentType }, body });
        if (!result.ok) fail('Caricamento non riuscito. Nessun video pubblicato.', 502);
        paths.push(path);
      }
      const previous = state.revision;
      state.videos.push({ id, title, description: clean(form.get('description'), 1200), size, cover: !!coverBytes, captions, rights_confirmed: true, published: false, published_at: null, created_at: new Date().toISOString() });
      await save(env, sb, state, previous);
    } catch (error) {
      if (paths.length) { try { await remove(env, paths); } catch { fail('Caricamento incompleto: verifica i file residui nello spazio video.', 502); } }
      throw error;
    }
    return reply({ ok: true, id }, 201);
  }
  if (!type.includes('application/json')) fail('Formato non valido', 415);
  const body = await jsonBody(request);
  if (!body || !validID(body.id) || body.revision !== state.revision) fail('Archivio modificato. Ricarica i video.', 409);
  const item = state.videos.find(v => v.id === body.id); if (!item) fail('Video non trovato', 404);
  if (request.method === 'PATCH') {
    if (item.deleted) fail('Video in attesa di eliminazione');
    if (body.complete === true && item.uploading) {
      if (!item.video_uploaded || item.cover && !item.cover_uploaded) fail('Caricamento incompleto');
      item.uploading = false;
    }
    if (item.uploading && body.published) fail('Completa il caricamento prima di pubblicare');
    if ('title' in body) { const title = clean(body.title, 160); if (!title) fail('Inserisci il titolo'); item.title = title; }
    if ('description' in body) item.description = clean(body.description, 1200);
    if ('published' in body) { if (typeof body.published !== 'boolean') fail('Stato non valido'); item.published = body.published; if (item.published && !item.published_at) item.published_at = new Date().toISOString(); }
    await save(env, sb, state, state.revision);
  } else {
    // A tombstone keeps failed removals hidden and retryable.
    item.deleted = true; item.published = false;
    await save(env, sb, state, state.revision);
    if (!item.source_url) await remove(env, [item.id + '.mp4', ...(item.cover ? [item.id + '.jpg'] : [])]);
    state = await readVideos(env, sb); state.videos = state.videos.filter(v => v.id !== item.id);
    await save(env, sb, state, state.revision);
  }
  return reply({ ok: true });
}
export async function videoFile(request, env, sb, admin = false) {
  const url = new URL(request.url), id = url.searchParams.get('id'), asset = url.searchParams.get('asset') || 'video';
  if (!validID(id) || !['video','cover','captions'].includes(asset)) return reply({ error: 'Video non trovato' }, 404);
  const state = await readVideos(env, sb), item = state.videos.find(v => v.id === id && !v.deleted && (admin || v.published));
  if (!item || item.source_url || item.uploading || asset === 'cover' && !item.cover || asset === 'captions' && !item.captions) return reply({ error: 'Video non trovato' }, 404);
  if (asset === 'captions') return new Response(item.captions, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  const { root, headers } = storage(env), range = request.headers.get('range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return reply({ error: 'Intervallo non valido' }, 416);
  const result = await fetch(root + '/object/authenticated/' + BUCKET + '/' + id + (asset === 'cover' ? '.jpg' : '.mp4'), { headers: { ...headers, ...(range ? { Range: range } : {}) }, redirect: 'manual' });
  if (!result.ok && result.status !== 416) return reply({ error: 'File non disponibile' }, 502);
  const output = new Headers({ 'Content-Type': asset === 'cover' ? 'image/jpeg' : 'video/mp4', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
  for (const key of ['Content-Length','Content-Range']) if (result.headers.has(key)) output.set(key, result.headers.get(key));
  return new Response(result.body, { status: result.status, headers: output });
}
