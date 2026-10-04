(function () {
  'use strict';
  const query = document.getElementById('playerIndexQuery'), order = document.getElementById('playerIndexOrder'), reset = document.getElementById('playerIndexReset');
  const list = document.getElementById('playerIndexList'), status = document.getElementById('playerIndexStatus'), error = document.getElementById('playerIndexError'), retry = document.getElementById('playerIndexRetry');
  let players = [], loading = false;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
  const freshness = player => Math.max(0, ...(player.market || []).map(item => new Date(item.updated_at).getTime()).filter(Number.isFinite));
  function writeUrl() {
    const url = new URL(location.href);
    if (query.value.trim()) url.searchParams.set('q', query.value.trim()); else url.searchParams.delete('q');
    if (order.value !== 'recent') url.searchParams.set('ordine', order.value); else url.searchParams.delete('ordine');
    history.replaceState(null, '', url);
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    query.value = (params.get('q') || '').slice(0, 100);
    order.value = ['recent', 'name', 'news'].includes(params.get('ordine')) ? params.get('ordine') : 'recent';
  }
  function render() {
    const q = normalize(query.value.trim());
    const visible = players.filter(player => !q || normalize([player.name, ...(player.aliases || [])].join(' ')).includes(q)).sort((a, b) => {
      const name = a.name.localeCompare(b.name, 'it');
      return order.value === 'name' ? name : order.value === 'news' ? (b.news_count || 0) - (a.news_count || 0) || name : freshness(b) - freshness(a) || name;
    });
    reset.hidden = !q && order.value === 'recent';
    list.replaceChildren();
    status.textContent = visible.length + ' di ' + players.length + ' profili';
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.textContent = q ? 'Nessun profilo corrisponde alla ricerca.' : 'Nessun profilo disponibile.';
      list.append(empty);
    }
    visible.forEach(player => {
      const link = document.createElement('a');
      link.className = 'player-index-row';
      link.href = '/giocatore?slug=' + encodeURIComponent(player.slug);
      const avatar = document.createElement('span');
      avatar.className = 'player-index-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = player.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
      const copy = document.createElement('span'), name = document.createElement('strong'), meta = document.createElement('span');
      name.textContent = player.name;
      meta.className = 'player-index-meta';
      meta.textContent = (player.news_count || 0) + ' news · ' + (player.market || []).length + ' segnali mercato';
      copy.append(name, meta);
      const latest = freshness(player);
      if (latest) {
        const time = document.createElement('time');
        time.dateTime = new Date(latest).toISOString();
        time.textContent = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' }).format(latest);
        copy.append(time);
      }
      link.append(avatar, copy);
      list.append(link);
    });
  }
  async function load() {
    if (loading) return;
    loading = true; error.hidden = true; retry.disabled = true;
    list.setAttribute('aria-busy', 'true'); status.textContent = 'Caricamento profili...';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/public/players?limit=80', { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error();
      players = data.filter(player => player && typeof player.name === 'string' && typeof player.slug === 'string').map(player => ({ ...player, market: Array.isArray(player.market) ? player.market : [], aliases: Array.isArray(player.aliases) ? player.aliases : [] }));
      render();
    } catch {
      status.textContent = 'Caricamento non riuscito'; error.hidden = false;
    } finally { clearTimeout(timer); loading = false; retry.disabled = false; list.removeAttribute('aria-busy'); }
  }
  document.getElementById('playerIndexFilters').addEventListener('submit', event => event.preventDefault());
  query.addEventListener('input', () => { writeUrl(); if (!loading) render(); });
  order.addEventListener('change', () => { writeUrl(); if (!loading) render(); });
  reset.addEventListener('click', () => { query.value = ''; order.value = 'recent'; writeUrl(); render(); query.focus(); });
  retry.addEventListener('click', () => { query.focus(); load(); });
  window.addEventListener('popstate', () => { restore(); render(); });
  restore(); load();
}());
