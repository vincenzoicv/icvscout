export const DEFAULT_HIGHLIGHTS = Object.freeze({
  mode: 'manual', title: 'Juventus - Parma 2-0',
  video_url: 'https://www.youtube.com/watch?v=n2loI5kB-vc',
});

export function highlightsVideoId(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id = null;
    if (url.hostname === 'youtu.be' && /^\/[\w-]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[1];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(embed|shorts|live)\/[\w-]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}

export function highlightsSetting(input) {
  const mode = input?.mode;
  if (!['manual', 'off'].includes(mode)) throw new Error('Selezione highlights non valida');
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const id = highlightsVideoId(input?.video_url);
  if (mode === 'manual' && (!title || !id)) throw new Error('Inserisci titolo e link HTTPS di un video YouTube valido');
  return {mode, title, video_url: id ? 'https://www.youtube.com/watch?v=' + id : ''};
}

export function publicHighlights(input) {
  try {
    const setting = highlightsSetting(input);
    if (setting.mode === 'off') return null;
    const video_id = highlightsVideoId(setting.video_url);
    return {title: setting.title, video_id, video_url: setting.video_url, thumbnail_url: '/api/public/highlights-thumbnail?id=' + video_id};
  } catch { return null; }
}

export async function highlightsThumbnail(videoId) {
  const options = {
    redirect: 'manual', signal: AbortSignal.timeout(8000),
  };
  let response = await fetch('https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg', options);
  if (response.status === 404) {
    await response.body?.cancel();
    response = await fetch('https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg', options);
  }
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') {
    await response.body?.cancel(); return new Response(null, {status: 502});
  }
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit || !response.body) {
    await response.body?.cancel(); return new Response(null, {status: 502});
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return new Response(null, {status: 502}); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, {headers: {'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'}});
}
