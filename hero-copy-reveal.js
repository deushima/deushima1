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

  const loadStyle = (href, marker) => {
    if (document.querySelector(`link[data-${marker}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[marker] = '';
    document.head.appendChild(link);
  };

  loadScript('hero-copy-reveal-core.js?v=20260928-split1', 'heroCopyRevealCore');
  loadScript('workspace-media-enhancements.js?v=20260928-cosmos-svg-undo1', 'workspaceMediaEnhancements');
  loadScript('wire-node-autoconnect.js?v=20260928-wire-autoconnect2', 'wireNodeAutoconnect');
  loadStyle('workspace-marquee-selection.css?v=20260928-marquee1', 'workspaceMarqueeStyle');
  loadScript('workspace-marquee-selection.js?v=20260928-marquee-delete2', 'workspaceMarqueeSelection');
  loadStyle('hero-node-reference-layout.css?v=20260928-reference5', 'heroNodeReferenceLayoutStyle');
  loadScript('hero-node-reference-layout.js?v=20260928-reference3', 'heroNodeReferenceLayout');
  loadStyle('interface-typography-polish.css?v=20260928-editorial2', 'interfaceTypographyPolishStyle');
  loadScript('interface-typography-polish.js?v=20260928-editorial1', 'interfaceTypographyPolish');
  loadStyle('floating-card-zoom-polish.css?v=20260928-zoom1', 'floatingCardZoomPolishStyle');
  loadScript('floating-card-zoom-polish.js?v=20260928-zoom1', 'floatingCardZoomPolish');

  if (!document.querySelector('style[data-contact-status-cleanup]')) {
    const style = document.createElement('style');
    style.dataset.contactStatusCleanup = '';
    style.textContent = '.hero-node--contact .hero-node__status{display:none!important;}';
    document.head.appendChild(style);
  }
})();
