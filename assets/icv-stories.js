(() => {
  'use strict';
  const video = document.getElementById('icvStoryVideo');
  const play = document.getElementById('icvStoryPlay');
  const error = document.getElementById('icvStoryError');
  if (!video || !play || !error) return;

  function showError() {
    error.hidden = false;
  }

  play.addEventListener('click', () => {
    error.hidden = true;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.hidden = false;
    play.hidden = true;
    video.focus();
    video.play().catch(showError);
  });
  video.addEventListener('error', showError);

  function pause() {
    if (!video.paused) video.pause();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('pagehide', pause);
  // Pause when leaving the section, including navigation to another home tab.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) pause();
    }).observe(video.parentElement);
  }
})();
