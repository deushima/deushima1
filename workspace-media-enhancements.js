(() => {
  'use strict';

  const BOOT_KEY = '__deushimaWorkspaceMediaBootstrapV2';
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;

  const coreReady = () => Boolean(window.DeushimaWorkspaceHistory);
  const coreTag = () => document.querySelector('script[data-workspace-media-core]');

  function loadCore() {
    if (coreReady() || coreTag()) return;
    const script = document.createElement('script');
    script.src = 'workspace-media-core.js?v=20260928-cosmos-svg-undo3';
    script.dataset.workspaceMediaCore = 'true';
    script.async = true;
    document.head.appendChild(script);
  }

  function installDanglingConnectionMenu() {
    const PATCH_KEY = '__deushimaDanglingConnectionMenuV1';
    if (window[PATCH_KEY]) return;
    window[PATCH_KEY] = true;

    const root = document.querySelector('[data-workspace-interaction-root]');
    const stage = document.querySelector('[data-hero-node-stage]');
    if (!root || !stage) return;

    const PORT_SELECTOR = '[data-custom-port], [data-node-port]';
    const NODE_SELECTOR = '[data-custom-node], [data-hero-node]';
    const BLOCKED_SELECTOR = [
      '.hero-custom-node-context',
      '.card-nav',
      '.status-cluster',
      '.floating-cta',
      '.section-jump-control',
      '.deu-chat-launcher',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ].join(',');

    let gesture = null;

    const insideWorkspace = (x, y) => {
      const rect = root.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const resetGesture = () => {
      gesture = null;
    };

    window.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(PORT_SELECTOR) : null;
      if (!target || !stage.contains(target)) return;

      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
    }, true);

    window.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 8) {
        gesture.moved = true;
      }
    }, true);

    window.addEventListener('pointerup', event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const completed = gesture;
      resetGesture();
      if (!completed.moved || !insideWorkspace(event.clientX, event.clientY)) return;

      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (!(hit instanceof Element)) return;

      // Normal port-to-port connections keep their native behaviour.
      if (hit.closest(PORT_SELECTOR)) return;
      // Dropping on a node body or fixed UI should not summon the creation menu.
      if (hit.closest(NODE_SELECTOR) || hit.closest(BLOCKED_SELECTOR)) return;

      // Let the native connection pointerup finish first. custom-nodes.js already
      // tries to open this menu; this is a deterministic fallback for browsers /
      // pointer-capture paths where that hit-test is lost.
      window.setTimeout(() => {
        if (document.querySelector('.hero-custom-node-context.is-open')) return;
        if (!insideWorkspace(event.clientX, event.clientY)) return;

        root.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: 2,
          buttons: 0,
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY
        }));
      }, 24);
    }, true);

    window.addEventListener('pointercancel', event => {
      if (gesture && event.pointerId === gesture.pointerId) resetGesture();
    }, true);

    window.addEventListener('blur', resetGesture, { passive: true });
  }

  function start() {
    installDanglingConnectionMenu();
    if (coreReady()) return;
    const enhancementLoads = [...document.scripts].filter(script =>
      String(script.src || '').includes('workspace-media-enhancements.js')
    );

    if (enhancementLoads.length > 1) {
      window.setTimeout(() => {
        if (!coreReady()) loadCore();
      }, 1200);
      return;
    }

    loadCore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
