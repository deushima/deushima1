(() => {
  const stage = document.querySelector('[data-hero-node-stage]');
  const svg = stage?.querySelector('[data-hero-node-mesh]');
  const nodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  const resetButton = stage?.querySelector('[data-node-reset]');
  if (!stage || !svg || nodes.length < 4) return;

  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const nodeByName = Object.fromEntries(nodes.map(node => [node.dataset.heroNode, node]));
  const depthByName = { works: 0.55, about: 0.82, launcher: 1, chat: 0.68 };
  const defaultEdges = [
    ['chat', 'launcher'],
    ['launcher', 'about'],
    ['about', 'chat'],
    ['works', 'launcher'],
    ['works', 'about']
  ];
  const layoutMode = () => window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
  const storageKey = () => `deushimaHeroCanvas:v2:${layoutMode()}`;
  const pairKey = (a, b) => [a, b].sort().join('::');
  const normalizeEdges = edges => {
    const seen = new Set();
    return (Array.isArray(edges) ? edges : [])
      .filter(edge => Array.isArray(edge) && edge.length === 2 && nodeByName[edge[0]] && nodeByName[edge[1]] && edge[0] !== edge[1])
      .filter(edge => {
        const key = pairKey(edge[0], edge[1]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  let edges = defaultEdges.map(edge => [...edge]);
  let raf = 0;
  let startTime = performance.now();
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let dragState = null;
  let connectionState = null;
  let suppressClickUntil = 0;
  let loadedMode = layoutMode();

  function edgeSetsMatch(a, b) {
    const left = new Set(a.map(edge => pairKey(edge[0], edge[1])));
    const right = new Set(b.map(edge => pairKey(edge[0], edge[1])));
    return left.size === right.size && [...left].every(key => right.has(key));
  }

  function setCustomizedState() {
    stage.classList.toggle('is-customized', !edgeSetsMatch(edges, defaultEdges) || nodes.some(node => node.style.getPropertyValue('--node-x')));
  }

  function readSavedCanvas() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.positions && typeof saved.positions === 'object') {
        Object.entries(saved.positions).forEach(([name, pos]) => {
          const node = nodeByName[name];
          if (!node || !Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) return;
          node.style.setProperty('--node-x', `${pos.x * 100}%`);
          node.style.setProperty('--node-y', `${pos.y * 100}%`);
        });
      }
      if (saved?.edges) edges = normalizeEdges(saved.edges);
    } catch {}
    setCustomizedState();
  }

  function saveCanvas() {
    const positions = {};
    nodes.forEach(node => {
      const xValue = node.style.getPropertyValue('--node-x');
      const yValue = node.style.getPropertyValue('--node-y');
      if (!xValue || !yValue) return;
      const x = parseFloat(xValue) / 100;
      const y = parseFloat(yValue) / 100;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      positions[node.dataset.heroNode] = { x, y };
    });
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ positions, edges }));
    } catch {}
    setCustomizedState();
  }

  function resetCanvas() {
    nodes.forEach(node => {
      node.style.removeProperty('--node-x');
      node.style.removeProperty('--node-y');
      node.classList.remove('is-dragging', 'is-connect-target');
    });
    edges = defaultEdges.map(edge => [...edge]);
    try { localStorage.removeItem(storageKey()); } catch {}
    setCustomizedState();
    requestAnimationFrame(() => drawMesh());
  }

  function centerOf(node) {
    const stageRect = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2
    };
  }

  function pointOf(element) {
    if (!element) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2
    };
  }

  function connectionPoints(fromNode, toNode) {
    const fromCenter = centerOf(fromNode);
    const toCenter = centerOf(toNode);
    const targetIsRight = toCenter.x >= fromCenter.x;
    const fromPort = fromNode.querySelector(targetIsRight ? '.hero-node__port--out' : '.hero-node__port--in');
    const toPort = toNode.querySelector(targetIsRight ? '.hero-node__port--in' : '.hero-node__port--out');
    return {
      from: pointOf(fromPort) || fromCenter,
      to: pointOf(toPort) || toCenter
    };
  }

  function line(x1, y1, x2, y2, glintOffset = 0) {
    const el = document.createElementNS(ns, 'line');
    el.setAttribute('x1', x1.toFixed(2));
    el.setAttribute('y1', y1.toFixed(2));
    el.setAttribute('x2', x2.toFixed(2));
    el.setAttribute('y2', y2.toFixed(2));
    el.setAttribute('class', 'hero-node-line');
    svg.appendChild(el);

    const glint = document.createElementNS(ns, 'line');
    glint.setAttribute('x1', x1.toFixed(2));
    glint.setAttribute('y1', y1.toFixed(2));
    glint.setAttribute('x2', x2.toFixed(2));
    glint.setAttribute('y2', y2.toFixed(2));
    glint.setAttribute('class', 'hero-node-line--glint');
    glint.setAttribute('stroke-dashoffset', glintOffset.toFixed(2));
    svg.appendChild(glint);
  }

  function previewLine(x1, y1, x2, y2) {
    const el = document.createElementNS(ns, 'line');
    el.setAttribute('x1', x1.toFixed(2));
    el.setAttribute('y1', y1.toFixed(2));
    el.setAttribute('x2', x2.toFixed(2));
    el.setAttribute('y2', y2.toFixed(2));
    el.setAttribute('class', 'hero-node-line--preview');
    svg.appendChild(el);
  }

  function drawMesh(elapsed = 0) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();

    edges.forEach(([from, to], index) => {
      const fromNode = nodeByName[from];
      const toNode = nodeByName[to];
      if (!fromNode || !toNode) return;
      const points = connectionPoints(fromNode, toNode);
      line(points.from.x, points.from.y, points.to.x, points.to.y, -(elapsed * 34 + index * 19) % 108);
    });

    if (connectionState) {
      const source = pointOf(connectionState.activePort) || centerOf(nodeByName[connectionState.sourceName]);
      if (source) previewLine(source.x, source.y, connectionState.pointerX, connectionState.pointerY);
    }
  }

  function freeNodePosition(clientX, clientY, grabOffsetX, grabOffsetY) {
    const stageRect = stage.getBoundingClientRect();
    const x = clientX - stageRect.left - grabOffsetX;
    const y = clientY - stageRect.top - grabOffsetY;
    return { x, y, stageRect };
  }

  function beginNodeDrag(event, node) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('[data-node-port]')) return;
    const stageRect = stage.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    dragState = {
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - (nodeRect.left + nodeRect.width / 2),
      grabOffsetY: event.clientY - (nodeRect.top + nodeRect.height / 2),
      moved: false,
      stageRect
    };
    node.setPointerCapture?.(event.pointerId);
  }

  function moveNodeDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.moved && distance < (coarsePointer ? 7 : 4)) return;
    if (!dragState.moved) {
      dragState.moved = true;
      dragState.node.classList.add('is-dragging');
      dragState.node.style.setProperty('--node-drift-x', '0px');
      dragState.node.style.setProperty('--node-drift-y', '0px');
      dragState.node.style.setProperty('--node-parallax-x', '0px');
      dragState.node.style.setProperty('--node-parallax-y', '0px');
    }

    event.preventDefault();
    const pos = freeNodePosition(event.clientX, event.clientY, dragState.grabOffsetX, dragState.grabOffsetY);
    dragState.node.style.setProperty('--node-x', `${(pos.x / pos.stageRect.width * 100).toFixed(4)}%`);
    dragState.node.style.setProperty('--node-y', `${(pos.y / pos.stageRect.height * 100).toFixed(4)}%`);
  }

  function endNodeDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const { node, moved } = dragState;
    node.releasePointerCapture?.(event.pointerId);
    node.classList.remove('is-dragging');
    if (moved) {
      suppressClickUntil = performance.now() + 420;
      saveCanvas();
    }
    dragState = null;
  }

  function setConnectTarget(targetName) {
    nodes.forEach(node => node.classList.toggle('is-connect-target', node.dataset.heroNode === targetName));
  }

  function beginConnection(event, port) {
    const node = port.closest('[data-hero-node]');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const stageRect = stage.getBoundingClientRect();
    connectionState = {
      pointerId: event.pointerId,
      sourceName: node.dataset.heroNode,
      pointerX: event.clientX - stageRect.left,
      pointerY: event.clientY - stageRect.top,
      activePort: port,
      targetName: null
    };
    port.classList.add('is-active');
    stage.classList.add('is-editing');
    port.setPointerCapture?.(event.pointerId);
  }

  function moveConnection(event) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    connectionState.pointerX = event.clientX - stageRect.left;
    connectionState.pointerY = event.clientY - stageRect.top;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-hero-node]');
    const targetName = hit?.dataset?.heroNode;
    connectionState.targetName = targetName && targetName !== connectionState.sourceName ? targetName : null;
    setConnectTarget(connectionState.targetName);
  }

  function endConnection(event) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;
    const releaseHit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-hero-node]');
    const releaseName = releaseHit?.dataset?.heroNode;
    const targetName = releaseName && releaseName !== connectionState.sourceName
      ? releaseName
      : connectionState.targetName;
    const { sourceName, activePort } = connectionState;
    activePort.releasePointerCapture?.(event.pointerId);
    activePort.classList.remove('is-active');
    stage.classList.remove('is-editing');
    setConnectTarget(null);

    if (targetName) {
      const key = pairKey(sourceName, targetName);
      const existingIndex = edges.findIndex(([a, b]) => pairKey(a, b) === key);
      if (existingIndex >= 0) edges.splice(existingIndex, 1);
      else edges.push([sourceName, targetName]);
      suppressClickUntil = performance.now() + 360;
      saveCanvas();
    }

    connectionState = null;
    requestAnimationFrame(drawMesh);
  }

  function animate(now) {
    const elapsed = (now - startTime) / 1000;
    pointerX += (targetPointerX - pointerX) * 0.045;
    pointerY += (targetPointerY - pointerY) * 0.045;

    nodes.forEach((node, index) => {
      const isDragging = dragState?.node === node && dragState.moved;
      const phase = index * 1.63;
      const name = node.dataset.heroNode;
      const depth = depthByName[name] || 0.7;
      const driftMultiplier = coarsePointer ? 0.32 : 1;
      const x = isDragging ? 0 : Math.sin(elapsed * (0.31 + index * 0.025) + phase) * (index % 2 ? 4.6 : 3.6) * driftMultiplier;
      const y = isDragging ? 0 : Math.cos(elapsed * (0.27 + index * 0.022) + phase) * (index % 2 ? 3.6 : 4.4) * driftMultiplier;
      const parallaxX = coarsePointer || isDragging ? 0 : pointerX * 8.5 * depth;
      const parallaxY = coarsePointer || isDragging ? 0 : pointerY * 6.4 * depth;
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

  window.addEventListener('resize', () => {
    const nextMode = layoutMode();
    if (nextMode !== loadedMode) {
      loadedMode = nextMode;
      nodes.forEach(node => {
        node.style.removeProperty('--node-x');
        node.style.removeProperty('--node-y');
      });
      edges = defaultEdges.map(edge => [...edge]);
      readSavedCanvas();
    }
    drawMesh();
  }, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(drawMesh, 160));
  window.addEventListener('load', drawMesh, { once: true });

  window.addEventListener('pointermove', (event) => {
    if (!coarsePointer && !reducedMotion) {
      targetPointerX = Math.max(-1, Math.min(1, (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2));
      targetPointerY = Math.max(-1, Math.min(1, (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2));
    }
    moveNodeDrag(event);
    moveConnection(event);
  }, { passive: false });

  window.addEventListener('pointerup', (event) => {
    endNodeDrag(event);
    endConnection(event);
  });
  window.addEventListener('pointercancel', (event) => {
    endNodeDrag(event);
    endConnection(event);
  });

  window.addEventListener('blur', () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  nodes.forEach((node) => {
    node.draggable = false;
    node.addEventListener('dragstart', event => event.preventDefault());
    node.addEventListener('pointerdown', (event) => beginNodeDrag(event, node));
    node.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    node.addEventListener('pointermove', (event) => {
      if (coarsePointer || reducedMotion || dragState?.node === node) return;
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

    node.querySelectorAll('[data-node-port]').forEach(port => {
      port.addEventListener('pointerdown', event => beginConnection(event, port));
    });
  });

  resetButton?.addEventListener('click', resetCanvas);

  readSavedCanvas();
  scheduleDraw();
})();
