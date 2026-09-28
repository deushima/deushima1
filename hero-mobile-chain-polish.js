(() => {
  'use strict';

  const mq = window.matchMedia('(max-width: 640px)');
  const stage = document.querySelector('[data-hero-node-stage]');
  if (!stage) return;

  const ns = 'http://www.w3.org/2000/svg';
  let mesh = null;
  let raf = 0;

  const queueDraw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
  };

  const ensureMesh = () => {
    if (mesh?.isConnected) return mesh;
    mesh = document.createElementNS(ns, 'svg');
    mesh.classList.add('hero-mobile-chain-mesh');
    mesh.setAttribute('aria-hidden', 'true');
    stage.insertBefore(mesh, stage.querySelector('.hero-node'));
    return mesh;
  };

  const stagePoint = (node, edge) => {
    const stageRect = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const scale = window.DeushimaHeroCamera?.getState?.().scale || 1;
    return {
      x: (rect.left - stageRect.left + rect.width / 2) / scale,
      y: (edge === 'top' ? rect.top - stageRect.top : rect.bottom - stageRect.top) / scale
    };
  };

  const nodeById = id => stage.querySelector(`[data-hero-node="${CSS.escape(id)}"]`);

  const getEdges = () => {
    const state = window.DeushimaHeroNodes?.getWorkspaceState?.();
    if (Array.isArray(state?.edges) && state.edges.length) return state.edges;
    return [
      ['contact', 'chat'],
      ['chat', 'works'],
      ['works', 'launcher'],
      ['launcher', 'about']
    ];
  };

  const verticalPath = (a, b) => {
    const aCenter = a.getBoundingClientRect();
    const bCenter = b.getBoundingClientRect();
    const aY = aCenter.top + aCenter.height / 2;
    const bY = bCenter.top + bCenter.height / 2;
    const down = bY >= aY;
    const from = stagePoint(a, down ? 'bottom' : 'top');
    const to = stagePoint(b, down ? 'top' : 'bottom');
    const dy = to.y - from.y;
    const tension = Math.max(24, Math.min(86, Math.abs(dy) * 0.46));
    const dir = dy >= 0 ? 1 : -1;
    const c1x = from.x;
    const c1y = from.y + tension * dir;
    const c2x = to.x;
    const c2y = to.y - tension * dir;
    return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  };

  function draw() {
    const svg = ensureMesh();
    svg.replaceChildren();
    svg.style.display = mq.matches ? '' : 'none';
    if (!mq.matches) return;

    getEdges().forEach(([fromId, toId]) => {
      const from = nodeById(fromId);
      const to = nodeById(toId);
      if (!from || !to) return;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', verticalPath(from, to));
      svg.appendChild(path);
    });
  }

  const mutationObserver = new MutationObserver(queueDraw);
  mutationObserver.observe(stage, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  stage.addEventListener('deushima:hero-layout-change', queueDraw);
  stage.addEventListener('pointermove', queueDraw, { passive: true });
  stage.addEventListener('pointerup', queueDraw, { passive: true });
  window.addEventListener('resize', queueDraw, { passive: true });
  window.addEventListener('orientationchange', queueDraw, { passive: true });

  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', queueDraw);
  else mq.addListener?.(queueDraw);

  [0, 80, 220, 520, 1000].forEach(delay => window.setTimeout(queueDraw, delay));
})();
