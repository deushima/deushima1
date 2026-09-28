(() => {
  'use strict';

  const loadScript = (src, marker) => {
    if (document.querySelector(`script[data-${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset[marker] = '';
    document.head.appendChild(script);
  };

  loadScript('hero-copy-reveal-core.js?v=20260928-split1', 'heroCopyRevealCore');
  loadScript('workspace-media-enhancements.js?v=20260928-cosmos-svg-undo1', 'workspaceMediaEnhancements');
})();
