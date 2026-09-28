(() => {
  'use strict';

  const apply = () => {
    document.querySelector('.deu-chat__kicker')?.remove();
    document.querySelector('.content-panel__surface--about .section-kicker')?.remove();

    const title = document.querySelector('.content-panel__surface--about .about-info-bar h2 .wipe-text');
    if (title) {
      title.innerHTML = '<span class="about-info-bar__title-line">ART &amp; VISUAL DIRECTOR</span><span class="about-info-bar__title-line">MULTIMEDIA DESIGNER</span>';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();
