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

  function start() {
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
