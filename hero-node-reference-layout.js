(() => {
  'use strict';

  const TARGET_EDGES = Object.freeze([
    Object.freeze(['chat', 'launcher']),
    Object.freeze(['works', 'launcher']),
    Object.freeze(['launcher', 'contact']),
    Object.freeze(['launcher', 'about'])
  ]);

  const layoutMode = () => window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
  const migrationKey = mode => `deushima:hero-reference-layout:v1:${mode}`;

  const cloneEdges = () => TARGET_EDGES.map(edge => [...edge]);
  const pairKey = edge => [...edge].sort().join('::');
  const targetEdgeSet = new Set(TARGET_EDGES.map(pairKey));

  const stateMatchesReference = state => {
    const positions = Array.isArray(state?.positions) ? state.positions : [];
    const edges = Array.isArray(state?.edges) ? state.edges : [];
    if (positions.length) return false;
    if (edges.length !== TARGET_EDGES.length) return false;
    const current = new Set(edges.map(pairKey));
    return current.size === targetEdgeSet.size && [...targetEdgeSet].every(key => current.has(key));
  };

  const start = () => {
    const api = window.DeushimaHeroNodes;
    const stage = document.querySelector('[data-hero-node-stage]');
    if (!api?.applyWorkspaceState || !api?.getWorkspaceState || !stage) {
      window.setTimeout(start, 80);
      return;
    }

    if (window.__deushimaHeroReferenceLayoutReady) return;
    window.__deushimaHeroReferenceLayoutReady = true;

    const original = api;

    const applyReference = ({ persist = true } = {}) => {
      original.applyWorkspaceState({
        positions: [],
        edges: cloneEdges()
      }, { persist });
      original.requestDraw?.();
      return true;
    };

    const migrateModeIfNeeded = () => {
      const mode = layoutMode();
      let migrated = false;
      try { migrated = localStorage.getItem(migrationKey(mode)) === '1'; } catch {}
      if (migrated) return;

      applyReference({ persist: true });
      try { localStorage.setItem(migrationKey(mode), '1'); } catch {}
    };

    window.DeushimaHeroNodes = Object.freeze({
      ...original,
      resetOriginals: () => applyReference({ persist: true }),
      isDefaultLayout: () => stateMatchesReference(original.getWorkspaceState())
    });

    migrateModeIfNeeded();

    const mq = window.matchMedia('(max-width: 640px)');
    const onModeChange = () => {
      window.setTimeout(() => {
        migrateModeIfNeeded();
        original.requestDraw?.();
      }, 40);
    };

    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onModeChange);
    else mq.addListener?.(onModeChange);

    window.addEventListener('resize', () => original.requestDraw?.(), { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
