export function instagramPost(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password) return null;
    const match = /^\/(reel|p)\/([\w-]+)\/?$/.exec(url.pathname);
    return match ? 'https://www.instagram.com/' + match[1] + '/' + match[2] + '/' : null;
  } catch { return null; }
}

export function conferencePhase(row) {
  const text = String(row.caption || row.hook || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (!/conferenza\s*(?:stampa|di\b)|press\s*conference/.test(text)) return null;
  function phase(value) {
    if (/\bpost[-_\s]*(?:partita|match|gara)\b|\bdopo\b|\bpost\s+\w/.test(value)) return 'post';
    if (/\bpre[-_\s]*(?:partita|match|gara)\b|\bprima\b|\bvigilia\b|\bpre\s+\w/.test(value)) return 'pre';
    return null;
  }
  return phase(text.split('\n').find(Boolean) || text) || phase(text) || 'press';
}

export function conferenceSetting(input = {}) {
  return {mode:['auto','manual','off'].includes(input?.mode) ? input.mode : 'auto',post_id:Number.isSafeInteger(Number(input?.post_id)) && Number(input.post_id)>0 ? Number(input.post_id) : null,phase:['pre','post','press'].includes(input?.phase) ? input.phase : 'press'};
}

export function chooseConference(rows, input, now = Date.now()) {
  const setting = conferenceSetting(input);
  if (setting.mode === 'off') return null;
  const candidates = (Array.isArray(rows) ? rows : []).filter(row => row && row.platform === 'instagram' && String(row.media_type).toLowerCase() === 'video' && row.visible !== false && row.status === 'published' && instagramPost(row.post_url) && Number.isFinite(Date.parse(row.published_at)) && Date.parse(row.published_at) <= now + 300000);
  const selected = setting.mode === 'manual'
    ? candidates.find(row => Number(row.id) === setting.post_id)
    : candidates.filter(row => row.instagram_id && conferencePhase(row)).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at) || Number(b.id)-Number(a.id))[0];
  if (!selected) return null;
  const title = String(selected.caption || selected.hook || 'Conferenza stampa').split('\n').find(line=>line.trim()) || 'Conferenza stampa';
  return {
    id:selected.id,
    title:title.replace(/https?:\/\/\S+|#[\w\u00c0-\u024f]+/g,'').replace(/\s+/g,' ').trim().slice(0,160) || 'Conferenza stampa',
    phase:setting.mode === 'manual' ? setting.phase : conferencePhase(selected),
    post_url:instagramPost(selected.post_url),
    published_at:selected.published_at,
    thumbnail_url:'/api/public/conference-thumbnail?id=' + encodeURIComponent(selected.id) + '&v=' + encodeURIComponent(selected.updated_at || selected.published_at),
  };
}

export function instagramThumbnail(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && ['cdninstagram.com','fbcdn.net'].some(host=>url.hostname.endsWith('.'+host)) ? url.href : null;
  } catch {return null;}
}

export function conferenceCollection(rows, input, now = Date.now()) {
  const featured = chooseConference(rows, input, now);
  if (!featured) return { featured: null, recent: [] };
  const recent = [], urls = new Set([featured.post_url]);
  for (const row of [...rows].sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at))) {
    if (Date.parse(row.published_at) < now - 30 * 86400000) continue;
    const item = chooseConference([row], {mode:'auto'}, now);
    if (!item || urls.has(item.post_url)) continue;
    urls.add(item.post_url); recent.push(item);
    if (recent.length === 4) break;
  }
  return { featured, recent };
}
