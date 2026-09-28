(() => {
  'use strict';

  const CARD_SELECTOR = '.floating-card';
  const CONTROLS_SELECTOR = '.floating-card__controls';
  const ZOOM_SELECTOR = '.floating-card__zoom';

  function anchorZoomControl(card) {
    if (!(card instanceof Element)) return;
    const controls = card.querySelector(CONTROLS_SELECTOR);
    const zoom = card.querySelector(ZOOM_SELECTOR);
    if (!controls || !zoom) return;

    if (zoom.parentElement !== controls) {
      controls.appendChild(zoom);
    }

    zoom.dataset.zoomAnchored = 'true';
  }

  function upgrade(root = document) {
    if (root instanceof Element && root.matches(CARD_SELECTOR)) {
      anchorZoomControl(root);
    }
    root.querySelectorAll?.(CARD_SELECTOR).forEach(anchorZoomControl);
  }

  upgrade(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        upgrade(node);
      }
    }
  });

  const startObserver = () => {
    const target = document.querySelector('.floating-stage') || document.body;
    if (!target) return;
    observer.observe(target, { childList: true, subtree: true });
    upgrade(target);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();
