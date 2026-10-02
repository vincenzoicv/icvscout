const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function matchDay(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : '';
}
function teamName(value) {
  return normalize(value).split(' ').filter(word => !['fc', 'bc', 'ac', 'as', 'ss', 'calcio'].includes(word)).join(' ');
}
export function namesMatch(title, match) {
  const text = ' ' + normalize(title) + ' ';
  return [match.home, match.away].every(name => { const team = teamName(name); return team && text.includes(' ' + team + ' '); });
}
export function belongsToMatch(item, match, type) {
  if (item.match_id) return String(item.match_id) === String(match.match_id);
  if (!namesMatch(item.title, match)) return false;
  const day = matchDay(match.date);
  if (!day) return false;
  if (type === 'album' || item.match_date) return (item.match_date || item.date) === day;
  const stamp = Date.parse(item.published_at || item.date);
  const kickoff = Date.parse(match.date);
  // Conferences may be published before or just after kickoff; a title alone is insufficient.
  return Number.isFinite(stamp) && stamp >= kickoff - 48 * 3600000 && stamp <= kickoff + 48 * 3600000;
}
export function communityMatchKey(row) {
  return String(row.id || row.match_id || row.title || 'juventus').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
}
