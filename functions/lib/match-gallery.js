const KEY = 'match_photo_gallery';
const BUCKET = 'match-photos';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BODY = 3 * 1024 * 1024;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const text = (value, limit) => String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, limit);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function readMatchGallery(env, sb) {
  const rows = await sb(env, '/site_settings?key=eq.' + KEY + '&select=value&limit=1');
  if (!rows.length) return { revision: 'initial', featured_id: null, albums: [] };
  const value = rows[0].value;
  if (!value || !Array.isArray(value.albums) || !value.revision) fail('Archivio foto non valido', 500);
  return value;
}

export function publicMatchGallery(state) {
  const album = state.albums.find(item => item.id === state.featured_id && item.published && item.photos.length);
  if (!album) return null;
  return {
    id: album.id, title: album.title, date: album.date, credit: album.credit,
    photos: album.photos.map(photo => ({
      id: photo.id, caption: photo.caption, width: photo.width, height: photo.height,
      url: '/api/public/match-photo?id=' + photo.id,
    })),
  };
}

export function publicMatchAlbums(state) {
  return state.albums.filter(album=>album.published && album.photos.length)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)))
    .map(album=>publicMatchGallery({...state,featured_id:album.id}));
}

// Compare the stored revision atomically so another admin tab cannot overwrite an album.
async function save(env, sb, state, previous) {
  state.revision = crypto.randomUUID();
  const payload = { key: KEY, value: state, updated_at: new Date().toISOString() };
  if (previous === 'initial') {
    try { await sb(env, '/site_settings', { method: 'POST', body: [payload] }); }
    catch { fail('Archivio modificato: ricarica gli album prima di riprovare.', 409); }
  } else {
    const updated = await sb(env, '/site_settings?key=eq.' + KEY + '&value->>revision=eq.' + encodeURIComponent(previous), {
      method: 'PATCH', body: payload, prefer: 'return=representation',
    });
    if (!updated.length) fail('Archivio modificato: ricarica gli album prima di riprovare.', 409);
  }
}

async function bodyJSON(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) fail('Formato richiesta non valido', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY) fail('File troppo grande', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Richiesta vuota');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); fail('File troppo grande', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Richiesta non valida');
    return value;
  }
  catch { fail('Richiesta non valida'); }
}

export function decodePhoto(data) {
  const match = typeof data === 'string' && data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4) fail('Usa una foto JPG, PNG o WebP valida');
  if (match[2].length > Math.ceil(MAX_BYTES / 3) * 4) fail('Foto troppo grande: massimo 2 MB dopo ottimizzazione', 413);
  let bytes;
  try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); }
  catch { fail('Foto non valida'); }
  const type = match[1];
  const valid = type === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'png' ? [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)
    : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (!valid || bytes.length < 16) fail('Il contenuto del file non corrisponde a una foto valida');
  return { bytes, type: 'image/' + type, extension: type === 'jpeg' ? 'jpg' : type };
}

function storage(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('Archivio foto non configurato', 503);
  return { root: env.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1', headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
  } };
}

async function ensurePrivateBucket(env) {
  const { root, headers } = storage(env);
  const found = await fetch(root + '/bucket/' + BUCKET, { headers });
  if (found.ok) {
    if ((await found.json()).public !== false) fail('Il bucket foto deve essere privato', 503);
    return;
  }
  const detail = await found.json().catch(() => ({}));
  if (found.status !== 404 && Number(detail.statusCode) !== 404 && !/bucket not found/i.test(detail.message || '')) fail('Archivio foto non disponibile', 502);
  const created = await fetch(root + '/bucket', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({
    id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
  }) });
  if (!created.ok && created.status !== 409) fail('Impossibile creare archivio foto', 502);
  if (created.status === 409) {
    const check = await fetch(root + '/bucket/' + BUCKET, { headers });
    if (!check.ok || (await check.json()).public !== false) fail('Archivio foto privato non disponibile', 503);
  }
}

async function removeObjects(env, paths) {
  if (!paths.length) return;
  const { root, headers } = storage(env);
  const removed = await fetch(root + '/object/' + BUCKET, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  if (!removed.ok) throw new Error('Rimozione file non riuscita');
}

export async function matchPhotoResponse(request, env, sb, admin = false) {
  const id = new URL(request.url).searchParams.get('id');
  if (!uuid(id)) return response({ error: 'Foto non trovata' }, 404);
  const state = await readMatchGallery(env, sb);
  const album = state.albums.find(a => (admin || a.published) && a.photos.some(p => p.id === id));
  const photo = album?.photos.find(p => p.id === id);
  if (!photo) return response({ error: 'Foto non trovata' }, 404);
  const { root, headers } = storage(env);
  const result = await fetch(root + '/object/authenticated/' + BUCKET + '/' + encodeURIComponent(photo.path), { headers, redirect: 'manual' });
  if (!result.ok) return response({ error: 'Foto non disponibile' }, 502);
  return new Response(result.body, { headers: {
    'Content-Type': photo.content_type, 'X-Content-Type-Options': 'nosniff',
    // A hidden/deleted album must not remain accessible from a browser cache.
    'Cache-Control': 'no-store',
  } });
}

export async function adminMatchGallery(request, env, sb) {
  storage(env);
  const state = await readMatchGallery(env, sb);
  if (request.method === 'GET') return response(state);
  if (request.method !== 'POST') return response({ error: 'Metodo non consentito' }, 405);
  const body = await bodyJSON(request);
  if (body.revision !== state.revision) fail('Archivio modificato: ricarica gli album prima di riprovare.', 409);
  const previous = state.revision;
  let album = state.albums.find(a => a.id === body.album_id);
  const deleted = []; let uploaded = null;
  if (body.action === 'create') {
    if (state.albums.length >= 40) fail('Limite di 40 album raggiunto');
    album = { id: crypto.randomUUID(), title: text(body.title, 120), date: text(body.date, 10), credit: text(body.credit, 160), published: false, photos: [] };
    if (!album.title || !validDate(album.date)) fail('Inserisci titolo e data della partita');
    state.albums.unshift(album);
  } else {
    if (!album) fail('Album non trovato', 404);
    const photo = album.photos.find(p => p.id === body.photo_id);
    switch (body.action) {
      case 'update':
        if (!text(body.title, 120) || !validDate(body.date)) fail('Inserisci titolo e data della partita');
        album.title = text(body.title, 120); album.date = body.date; album.credit = text(body.credit, 160);
        if (body.captions !== undefined) {
          if (!Array.isArray(body.captions) || body.captions.length > 24) fail('Didascalie non valide');
          for (const item of body.captions) {
            const target = album.photos.find(p => p.id === item?.photo_id);
            if (!target) fail('Foto non trovata', 404);
            target.caption = text(item.caption, 300);
          }
        }
        break;
      case 'upload': {
        if (body.rights_confirmed !== true) fail('Conferma di avere i diritti di pubblicazione');
        if (album.photos.length >= 24) fail('Massimo 24 foto per album');
        const image = decodePhoto(body.image_data);
        const width = Number(body.width), height = Number(body.height);
        if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 2400)) fail('Dimensioni foto non valide');
        await ensurePrivateBucket(env);
        const id = crypto.randomUUID(), path = id + '.' + image.extension;
        const { root, headers } = storage(env);
        const result = await fetch(root + '/object/' + BUCKET + '/' + path, { method: 'POST', headers: { ...headers, 'Content-Type': image.type, 'x-upsert': 'false' }, body: image.bytes });
        if (!result.ok) fail('Caricamento foto non riuscito. Riprova.', 502);
        uploaded = path;
        album.photos.push({ id, path, content_type: image.type, width, height, caption: '', rights_confirmed_at: new Date().toISOString() });
        break;
      }
      case 'caption':
        if (!photo) fail('Foto non trovata', 404);
        photo.caption = text(body.caption, 300);
        break;
      case 'move': {
        if (!photo || ![-1, 1].includes(body.direction)) fail('Spostamento non valido');
        const from = album.photos.indexOf(photo), to = Math.max(0, Math.min(album.photos.length - 1, from + body.direction));
        album.photos.splice(from, 1); album.photos.splice(to, 0, photo);
        break;
      }
      case 'remove':
        if (!photo) fail('Foto non trovata', 404);
        deleted.push(photo.path); album.photos = album.photos.filter(p => p.id !== photo.id);
        if (!album.photos.length) { album.published = false; if (state.featured_id === album.id) state.featured_id = null; }
        break;
      case 'publish':
        if (!album.photos.length) fail('Carica almeno una foto prima di pubblicare');
        album.published = true; state.featured_id = album.id;
        break;
      case 'hide':
        album.published = false; if (state.featured_id === album.id) state.featured_id = null;
        break;
      case 'delete':
        deleted.push(...album.photos.map(p => p.path)); state.albums = state.albums.filter(a => a.id !== album.id);
        if (state.featured_id === album.id) state.featured_id = null;
        album = null;
        break;
      default: fail('Operazione non valida');
    }
  }
  try { await save(env, sb, state, previous); }
  catch (error) { if (uploaded) await removeObjects(env, [uploaded]).catch(() => {}); throw error; }
  let warning = '';
  if (deleted.length) await removeObjects(env, deleted).catch(() => { warning = 'Foto rimosse dalla galleria. Pulizia archivio non completata.'; });
  return response({ ...state, selected_id: album?.id || null, warning });
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
