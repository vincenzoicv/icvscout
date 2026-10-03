(() => {
  const hero = document.querySelector('.hero');
  const signature = document.querySelector('.vince-signature em');
  if (!hero || !signature) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  document.fonts.ready.then(() => {
    if (!reduced.matches) hero.classList.add('is-entering');
  });
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    signature.style.removeProperty('background-image');
  };
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      hero.classList.remove('is-entering');
      reset();
    }
  });
  hero.addEventListener('pointermove', event => {
    if (reduced.matches || !fine.matches || frame) return;
    const x = event.clientX;
    frame = requestAnimationFrame(() => {
      const bounds = hero.getBoundingClientRect();
      const position = Math.max(20, Math.min(80, (x - bounds.left) / bounds.width * 100));
      signature.style.backgroundImage = `linear-gradient(115deg,#c4962a 10%,#edc768 ${position - 16}%,#fff0c4 ${position}%,#e8b84b ${position + 16}%,#bd8c28 90%)`;
      frame = 0;
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', reset);
})();
