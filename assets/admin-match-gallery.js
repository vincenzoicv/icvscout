(function () {
  'use strict';
  var root = document.getElementById('photoAdmin');
  if (!root) return;
  var store = null, selected = '', busy = false, dirty = false, loaded = false, generation = 0;
  var blobs = [], queueBlobs = [], files = [];
  var el = function (id) { return document.getElementById(id); };
  var esc = function (value) { return String(value || '').replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function message(value, error) { el('photoStatus').textContent = value; el('photoStatus').dataset.error = String(!!error); }
  function lock(value) { busy = value; el('photoControls').disabled = value || !store; el('photoRefresh').disabled = value; }
  function album() { return store && store.albums.find(function(a) { return a.id === selected; }); }
  function revoke(list) { list.forEach(function(url) { URL.revokeObjectURL(url); }); list.length = 0; }
  function clearQueue() { files = []; revoke(queueBlobs); el('photoFiles').value = ''; el('photoQueue').replaceChildren(); el('photoUpload').disabled = true; }
  function canLeave() { return !dirty || confirm('Ci sono modifiche non salvate. Vuoi abbandonarle?'); }
  async function refresh() {
    if (busy || !canLeave()) return;
    lock(true); message('Caricamento album...');
    try { store = await api('/api/admin/match-gallery'); loaded = true; dirty = false; render(); message(store.albums.length ? '' : 'Nessun album.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function send(action, values) {
    var data = await api('/api/admin/match-gallery', { method: 'POST', body: Object.assign({ action: action, album_id: selected, revision: store.revision }, values || {}) });
    store = data; selected = data.selected_id || ''; return data;
  }
  async function change(action, values, notice) {
    if (busy || !store) return;
    lock(true);
    try { var data = await send(action, values); dirty = false; render(); message(data.warning || notice || 'Salvato.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  function icon(name, label, action, id, disabled) {
    return '<button type="button" class="photo-icon" data-action="' + action + '" data-id="' + esc(id) + '" title="' + label + '" aria-label="' + label + '"' + (disabled ? ' disabled' : '') + '><img src="/assets/' + name + '.svg" alt=""></button>';
  }
  function render() {
    generation++; var currentGeneration = generation;
    revoke(blobs); clearQueue();
    el('photoAlbum').innerHTML = '<option value="">Nuovo album</option>' + store.albums.map(function(a) { return '<option value="' + a.id + '">' + esc(a.title) + ' · ' + a.date + (store.featured_id === a.id ? ' · In home' : '') + '</option>'; }).join('');
    var a = album();
    if (!a) selected = '';
    el('photoAlbum').value = selected;
    el('photoTitle').value = a ? a.title : '';
    el('photoDate').value = a ? a.date : new Date().toLocaleDateString('en-CA');
    el('photoCredit').value = a ? a.credit : 'Il Calcio di Vince';
    el('photoSaveAlbum').textContent = a ? 'Salva album' : 'Crea album';
    el('photoEditor').hidden = !a;
    el('photoAlbumState').textContent = a ? (a.published ? (store.featured_id === a.id ? 'Pubblicato in home' : 'Pubblicato · Non in evidenza') : 'Bozza · Foto riservate') : '';
    el('photoList').replaceChildren();
    if (!a) return;
    el('photoCount').textContent = a.photos.length + ' / 24 foto';
    el('photoPublish').disabled = !a.photos.length || store.featured_id === a.id;
    el('photoHide').disabled = !a.published;
    el('photoList').innerHTML = a.photos.map(function(p, index) {
      return '<article class="photo-tile"><div class="photo-image"><span>Caricamento...</span><img data-photo="' + p.id + '" alt="' + esc(p.caption || a.title) + '" hidden></div><div class="photo-tile-body"><label for="caption-' + p.id + '">Didascalia<input id="caption-' + p.id + '" maxlength="300" value="' + esc(p.caption) + '"></label><div class="photo-tile-bar"><span>' + (index === 0 ? 'Copertina' : 'Foto ' + (index + 1)) + '</span>' + icon('arrow-up','Sposta prima','up',p.id,index === 0) + icon('arrow-down','Sposta dopo','down',p.id,index === a.photos.length - 1) + icon('save','Salva didascalia','caption',p.id,false) + icon('trash-2','Elimina foto','remove',p.id,false) + '</div></div></article>';
    }).join('') || '<p class="photo-empty">Nessuna foto caricata.</p>';
    a.photos.forEach(async function(p) {
      try {
        var result = await fetch('/api/admin/match-photo?id=' + p.id, { headers: { 'X-ICV-Admin-Token': token() }, cache: 'no-store' });
        if (!result.ok) throw new Error('Anteprima non disponibile');
        var blob = await result.blob();
        if (currentGeneration !== generation) return;
        var url = URL.createObjectURL(blob); blobs.push(url);
        var img = root.querySelector('[data-photo="' + p.id + '"]');
        img.onload = function() { img.hidden = false; img.previousElementSibling.hidden = true; };
        img.onerror = function() { img.previousElementSibling.textContent = 'Anteprima non disponibile'; };
        img.src = url;
      } catch (error) {
        if (currentGeneration === generation) { var img = root.querySelector('[data-photo="' + p.id + '"]'); if (img) img.previousElementSibling.textContent = 'Anteprima non disponibile'; }
      }
    });
  }
  async function prepare(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa JPG, PNG o WebP. Esporta le foto HEIC in JPG.');
    if (file.size > 30 * 1024 * 1024) throw new Error('Il file supera 30 MB. Riducilo prima di caricarlo.');
    var img = new Image(), url = URL.createObjectURL(file);
    try {
      await new Promise(function(resolve, reject) { img.onload = resolve; img.onerror = function() { reject(new Error('Foto non leggibile')); }; img.src = url; });
      if (img.naturalWidth * img.naturalHeight > 80000000) throw new Error('Foto troppo grande: esportala in dimensioni ridotte.');
      var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), data;
      for (var size of [1920, 1600, 1280]) {
        var ratio = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        data = canvas.toDataURL('image/jpeg', .85);
        if (data.length < 1900000) return { image_data: data, width: canvas.width, height: canvas.height, rights_confirmed: true };
      }
      throw new Error('Foto troppo pesante dopo ottimizzazione. Prova un JPG piu piccolo.');
    } finally { URL.revokeObjectURL(url); }
  }
  el('photoAlbum').addEventListener('change', function() { if (busy || !canLeave()) { this.value = selected; return; } selected = this.value; dirty = false; render(); message(''); });
  el('photoNew').addEventListener('click', function() { if (canLeave()) { selected = ''; dirty = false; render(); el('photoTitle').focus(); } });
  el('photoRefresh').addEventListener('click', refresh);
  el('photoAlbumForm').addEventListener('input', function() { dirty = true; });
  el('photoAlbumForm').addEventListener('submit', function(event) { event.preventDefault(); saveAlbum(); });
  function showQueue() {
    revoke(queueBlobs); el('photoQueue').replaceChildren();
    files.forEach(function(file) { var figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption'); var url = URL.createObjectURL(file); queueBlobs.push(url); img.src = url; img.alt = ''; caption.textContent = file.name; figure.append(img, caption); el('photoQueue').append(figure); });
    el('photoUpload').disabled = !files.length; el('photoUpload').textContent = files.length ? 'Carica ' + files.length + ' foto' : 'Carica foto';
  }
  el('photoFiles').addEventListener('change', function() { files = Array.from(this.files || []); showQueue(); });
  el('photoUpload').addEventListener('click', async function() {
    if (busy || !files.length) return;
    if (dirty) { message('Salva le modifiche prima di caricare le foto.', true); return; }
    if (!el('photoRights').checked) { message('Conferma di avere i diritti per pubblicare le foto.', true); el('photoRights').focus(); return; }
    if (album().photos.length + files.length > 24) { message('Puoi caricare al massimo 24 foto per album.', true); return; }
    lock(true); var errors = [], uploaded = 0, batch = files.slice(), failed = [];
    for (var i = 0; i < batch.length; i++) {
      message('Caricamento ' + (i + 1) + ' di ' + batch.length + ': ' + batch[i].name);
      try { await send('upload', await prepare(batch[i])); uploaded++; }
      catch (error) { errors.push(batch[i].name + ': ' + error.message); failed.push(batch[i]); if (error.status === 409) { failed.push(...batch.slice(i + 1)); break; } }
    }
    render(); files = failed; showQueue(); lock(false); message(uploaded + ' foto caricate.' + (errors.length ? ' ' + errors.join(' · ') : ''), errors.length > 0);
  });
  function unchanged() { if (dirty) { message('Salva le modifiche prima di continuare.', true); return false; } return true; }
  el('photoPublish').addEventListener('click', function() { if (unchanged()) change('publish', {}, 'Album pubblicato in home.'); });
  el('photoHide').addEventListener('click', function() { if (unchanged()) change('hide', {}, 'Album nascosto.'); });
  el('photoDelete').addEventListener('click', function() { if (confirm('Eliminare questo album e tutte le sue foto?')) change('delete', {}, 'Album eliminato.'); });
  el('photoList').addEventListener('input', function() { dirty = true; });
  el('photoList').addEventListener('click', function(event) {
    var button = event.target.closest('button[data-action]'); if (!button || busy) return;
    var action = button.dataset.action, id = button.dataset.id;
    if (action === 'caption') {
      // Save all edited captions together before rerendering the photo list.
      saveAlbum(); return;
    }
    if (!unchanged()) return;
    if (action === 'remove') { if (confirm('Eliminare questa foto?')) change('remove', { photo_id: id }, 'Foto eliminata.'); }
    else change('move', { photo_id: id, direction: action === 'up' ? -1 : 1 }, 'Ordine aggiornato.');
  });
  function saveAlbum() {
    var current = album();
    var values = { title: el('photoTitle').value, date: el('photoDate').value, credit: el('photoCredit').value };
    if (current) values.captions = current.photos.map(function(p) { return { photo_id: p.id, caption: el('caption-' + p.id).value }; });
    return change(current ? 'update' : 'create', values, 'Album salvato.');
  }
  window.addEventListener('beforeunload', function(event) { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  window.ICVPhotoAdmin = { open: function() { if (!loaded) refresh(); } };
})();
