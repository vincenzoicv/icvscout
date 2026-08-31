(function() {
  'use strict';
  var section = document.getElementById('matchGallery');
  if (!section) return;
  var gallery = null, index = 0, opener = null, scrollStyle = '', startX = null;
  var dialog = document.createElement('dialog');
  dialog.className = 'match-lightbox'; dialog.setAttribute('aria-labelledby','matchPhotoTitle');
  dialog.innerHTML = '<div class="match-lightbox-bar"><h2 id="matchPhotoTitle"></h2><button type="button" data-close aria-label="Chiudi galleria" title="Chiudi galleria"><img src="/assets/x.svg" alt=""></button></div><div class="match-lightbox-image"><p role="status">Caricamento foto...</p><img alt="" hidden></div><div class="match-lightbox-caption"><p id="matchPhotoCaption"></p></div><div class="match-lightbox-controls"><button type="button" data-prev aria-label="Foto precedente" title="Foto precedente"><img src="/assets/chevron-left.svg" alt=""></button><span id="matchPhotoPosition" aria-live="polite"></span><button type="button" data-next aria-label="Foto successiva" title="Foto successiva"><img src="/assets/chevron-right.svg" alt=""></button></div>';
  document.body.appendChild(dialog);
  var image = dialog.querySelector('.match-lightbox-image>img'), status = dialog.querySelector('[role=status]');
  function show(number) {
    index = Math.max(0, Math.min(gallery.photos.length - 1, number));
    var photo = gallery.photos[index];
    dialog.querySelector('#matchPhotoTitle').textContent = gallery.title;
    dialog.querySelector('#matchPhotoCaption').textContent = [photo.caption, gallery.credit ? 'Foto: ' + gallery.credit : ''].filter(Boolean).join(' · ');
    dialog.querySelector('#matchPhotoPosition').textContent = (index + 1) + ' / ' + gallery.photos.length;
    dialog.querySelector('[data-prev]').disabled = index === 0;
    dialog.querySelector('[data-next]').disabled = index === gallery.photos.length - 1;
    image.hidden = true; status.hidden = false; status.textContent = 'Caricamento foto...';
    image.onload = function() { image.hidden = false; status.hidden = true; };
    image.onerror = function() { image.hidden = true; status.hidden = false; status.textContent = 'Foto non disponibile. Riprova piu tardi.'; };
    image.alt = photo.caption || gallery.title + ', foto ' + (index + 1); image.src = photo.url;
  }
  function close() { dialog.close(); }
  dialog.querySelector('[data-close]').addEventListener('click',close);
  dialog.querySelector('[data-prev]').addEventListener('click',function() { show(index - 1); });
  dialog.querySelector('[data-next]').addEventListener('click',function() { show(index + 1); });
  dialog.addEventListener('keydown',function(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1)); }
  });
  dialog.addEventListener('close',function() { document.body.style.overflow = scrollStyle; image.removeAttribute('src'); if (opener && opener.isConnected) opener.focus({preventScroll:true}); });
  dialog.querySelector('.match-lightbox-image').addEventListener('touchstart',function(event) { startX = event.touches.length === 1 ? event.touches[0].clientX : null; },{passive:true});
  dialog.querySelector('.match-lightbox-image').addEventListener('touchend',function(event) { if (startX !== null) { var distance = event.changedTouches[0].clientX - startX; if (Math.abs(distance) > 60) show(index + (distance < 0 ? 1 : -1)); } startX = null; },{passive:true});
  function render(next) {
      gallery = next;
      if (!gallery || !gallery.photos.length) return;
      document.getElementById('matchGalleryHeading').textContent = gallery.title;
      document.getElementById('matchGalleryMeta').textContent = new Date(gallery.date + 'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) + ' · ' + gallery.photos.length + ' foto';
      document.getElementById('matchGalleryCredit').textContent = gallery.credit ? 'Foto: ' + gallery.credit : '';
      var grid = document.getElementById('matchGalleryPhotos'); grid.replaceChildren(); grid.dataset.count = String(Math.min(5, gallery.photos.length));
      gallery.photos.slice(0,5).forEach(function(photo, number) {
        var button = document.createElement('button'), img = document.createElement('img');
        button.type = 'button'; button.className = 'match-gallery-photo'; button.setAttribute('aria-label','Apri foto ' + (number + 1) + ' di ' + gallery.photos.length + ': ' + (photo.caption || gallery.title));
        img.src = photo.url; img.alt = photo.caption || gallery.title; img.width = photo.width; img.height = photo.height; img.loading = 'lazy'; img.decoding = 'async';
        button.appendChild(img);
        if (number === 4 && gallery.photos.length > 5) { var more = document.createElement('span'); more.textContent = '+' + (gallery.photos.length - 5) + ' foto'; button.appendChild(more); }
        button.addEventListener('click',function() { opener = button; scrollStyle = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.showModal(); show(number); });
        grid.appendChild(button);
      });
      section.hidden = false;
  }
  async function load() {
    try {
      var result = await fetch('/api/public/match-gallery', {cache:'no-store'});
      if (!result.ok) return;
      render((await result.json()).gallery);
    } catch (_) { /* An unavailable gallery must not block match data or the conference. */ }
  }
  window.ICVGallery = {render:render};
  if(section.dataset.manual !== 'true') load();
})();
