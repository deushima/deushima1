(() => {
  const stage = document.querySelector('[data-hero-node-stage]');
  const svg = stage?.querySelector('[data-hero-node-mesh]');
  const nodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  if (!stage || !svg || nodes.length < 4) return;

  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const nodeByName = Object.fromEntries(nodes.map(node => [node.dataset.heroNode, node]));
  const depthByName = { works: 0.55, about: 0.82, launcher: 1, chat: 0.68 };

  const mainEdges = [
    ['chat', 'launcher'],
    ['launcher', 'about'],
    ['about', 'chat'],
    ['works', 'launcher'],
    ['works', 'about']
  ];

  const satellitePoints = [
    [0.34, 0.35], [0.42, 0.29], [0.47, 0.44], [0.59, 0.35],
    [0.62, 0.63], [0.43, 0.72], [0.31, 0.58], [0.70, 0.47]
  ];

  const satelliteEdges = [
    [0,1],[1,2],[2,0],[1,3],[2,3],[2,4],[3,4],[2,5],[4,5],[5,6],[6,2],[3,7],[7,4]
  ];

  let raf = 0;
  let startTime = performance.now();
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;

  function centerOf(node) {
    const stageRect = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2
    };
  }

  function line(x1, y1, x2, y2, soft = false, glintOffset = 0) {
    const el = document.createElementNS(ns, 'line');
    el.setAttribute('x1', x1.toFixed(2));
    el.setAttribute('y1', y1.toFixed(2));
    el.setAttribute('x2', x2.toFixed(2));
    el.setAttribute('y2', y2.toFixed(2));
    el.setAttribute('class', `hero-node-line${soft ? ' hero-node-line--soft' : ''}`);
    svg.appendChild(el);

    if (!soft) {
      const glint = document.createElementNS(ns, 'line');
      glint.setAttribute('x1', x1.toFixed(2));
      glint.setAttribute('y1', y1.toFixed(2));
      glint.setAttribute('x2', x2.toFixed(2));
      glint.setAttribute('y2', y2.toFixed(2));
      glint.setAttribute('class', 'hero-node-line--glint');
      glint.setAttribute('stroke-dashoffset', glintOffset.toFixed(2));
      svg.appendChild(glint);
    }
  }

  function dot(x, y, accent = false, radius = 1.7) {
    const el = document.createElementNS(ns, 'circle');
    el.setAttribute('cx', x.toFixed(2));
    el.setAttribute('cy', y.toFixed(2));
    el.setAttribute('r', radius);
    el.setAttribute('class', `hero-node-dot${accent ? ' hero-node-dot--accent' : ''}`);
    svg.appendChild(el);
  }

  function drawMesh(elapsed = 0) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();

    const centers = {};
    Object.entries(nodeByName).forEach(([name, node]) => {
      centers[name] = centerOf(node);
    });

    mainEdges.forEach(([from, to], index) => {
      const a = centers[from];
      const b = centers[to];
      if (a && b) line(a.x, a.y, b.x, b.y, false, -(elapsed * 34 + index * 19) % 108);
    });

    const satellites = satellitePoints.map(([x, y]) => ({ x: x * width, y: y * height }));
    satelliteEdges.forEach(([from, to]) => {
      const a = satellites[from];
      const b = satellites[to];
      line(a.x, a.y, b.x, b.y, true, 0);
    });

    satellites.forEach((point, index) => dot(point.x, point.y, index === 3 || index === 5, index === 3 || index === 5 ? 2.1 : 1.35));
    Object.values(centers).forEach((point, index) => dot(point.x, point.y, index === 1 || index === 2, 1.9));
  }

  function animate(now) {
    const elapsed = (now - startTime) / 1000;
    pointerX += (targetPointerX - pointerX) * 0.045;
    pointerY += (targetPointerY - pointerY) * 0.045;

    nodes.forEach((node, index) => {
      const phase = index * 1.63;
      const name = node.dataset.heroNode;
      const depth = depthByName[name] || 0.7;
      const driftMultiplier = coarsePointer ? 0.42 : 1;
      const x = Math.sin(elapsed * (0.31 + index * 0.025) + phase) * (index % 2 ? 4.6 : 3.6) * driftMultiplier;
      const y = Math.cos(elapsed * (0.27 + index * 0.022) + phase) * (index % 2 ? 3.6 : 4.4) * driftMultiplier;
      const parallaxX = coarsePointer ? 0 : pointerX * 8.5 * depth;
      const parallaxY = coarsePointer ? 0 : pointerY * 6.4 * depth;
      node.style.setProperty('--node-drift-x', `${x.toFixed(2)}px`);
      node.style.setProperty('--node-drift-y', `${y.toFixed(2)}px`);
      node.style.setProperty('--node-parallax-x', `${parallaxX.toFixed(2)}px`);
      node.style.setProperty('--node-parallax-y', `${parallaxY.toFixed(2)}px`);
    });
    drawMesh(elapsed);
    raf = requestAnimationFrame(animate);
  }

  function scheduleDraw() {
    cancelAnimationFrame(raf);
    if (reducedMotion) {
      nodes.forEach(node => {
        node.style.setProperty('--node-drift-x', '0px');
        node.style.setProperty('--node-drift-y', '0px');
        node.style.setProperty('--node-parallax-x', '0px');
        node.style.setProperty('--node-parallax-y', '0px');
      });
      requestAnimationFrame(drawMesh);
      return;
    }
    startTime = performance.now();
    raf = requestAnimationFrame(animate);
  }

  const resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawMesh));
  resizeObserver.observe(stage);
  nodes.forEach(node => resizeObserver.observe(node));
  window.addEventListener('resize', drawMesh, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(drawMesh, 160));
  window.addEventListener('load', drawMesh, { once: true });

  window.addEventListener('pointermove', (event) => {
    if (coarsePointer || reducedMotion) return;
    targetPointerX = Math.max(-1, Math.min(1, (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2));
    targetPointerY = Math.max(-1, Math.min(1, (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2));
  });

  window.addEventListener('blur', () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  nodes.forEach((node) => {
    node.addEventListener('pointermove', (event) => {
      if (coarsePointer || reducedMotion) return;
      const rect = node.getBoundingClientRect();
      const localX = (event.clientX - rect.left) / rect.width;
      const localY = (event.clientY - rect.top) / rect.height;
      node.style.setProperty('--node-sheen-x', `${(localX * 100).toFixed(1)}%`);
      node.style.setProperty('--node-sheen-y', `${(localY * 100).toFixed(1)}%`);
      node.style.setProperty('--node-tilt-x', `${((0.5 - localY) * 3.2).toFixed(2)}deg`);
      node.style.setProperty('--node-tilt-y', `${((localX - 0.5) * 4.2).toFixed(2)}deg`);
    });

    node.addEventListener('pointerleave', () => {
      node.style.setProperty('--node-sheen-x', '50%');
      node.style.setProperty('--node-sheen-y', '50%');
      node.style.setProperty('--node-tilt-x', '0deg');
      node.style.setProperty('--node-tilt-y', '0deg');
    });
  });

  scheduleDraw();
})();
