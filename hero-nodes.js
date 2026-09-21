(() => {
  const stage = document.querySelector('[data-hero-node-stage]');
  const svg = stage?.querySelector('[data-hero-node-mesh]');
  const nodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  const disconnectButton = stage?.querySelector('[data-node-disconnect]');
  if (!stage || !svg || nodes.length < 4) return;

  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const mobilePerformance = window.matchMedia('(max-width: 760px)').matches;
  const nodeByName = Object.fromEntries(nodes.map(node => [node.dataset.heroNode, node]));
  const depthByName = { works: 0.55, about: 0.82, launcher: 1, chat: 0.68, contact: 0.9 };
  const defaultEdges = [
    ['chat', 'launcher'],
    ['launcher', 'about'],
    ['about', 'chat'],
    ['works', 'launcher'],
    ['contact', 'launcher'],
    ['contact', 'works']
  ];
  const layoutMode = () => window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
  const storageKey = () => `deushimaHeroCanvas:v6:${layoutMode()}`;
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
  let drawQueued = 0;
  let startTime = performance.now();
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let dragState = null;
  let connectionState = null;
  let hoveredEdge = null;
  let hoveredNodeName = null;
  let hoveredNodeStartedAt = 0;
  let disconnectHover = false;
  let suppressClickUntil = 0;
  let loadedMode = layoutMode();

  function edgeSetsMatch(a, b) {
    const left = new Set(a.map(edge => pairKey(edge[0], edge[1])));
    const right = new Set(b.map(edge => pairKey(edge[0], edge[1])));
    return left.size === right.size && [...left].every(key => right.has(key));
  }

  function isDefaultCanvas() {
    return edgeSetsMatch(edges, defaultEdges)
      && nodes.every(node => (
        !node.style.getPropertyValue('--node-x')
        && !node.style.getPropertyValue('--node-y')
      ));
  }

  function setCustomizedState() {
    const isDefault = isDefaultCanvas();
    stage.classList.toggle('is-customized', !isDefault);
    stage.dispatchEvent(new CustomEvent('deushima:hero-layout-change', {
      detail: { isDefault }
    }));
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
    queueDraw();
  }

  function queueDraw() {
    if (drawQueued) return;
    drawQueued = requestAnimationFrame(() => {
      drawQueued = 0;
      drawMesh();
    });
  }

  function cameraScale() {
    return window.DeushimaHeroCamera?.getState?.().scale || 1;
  }

  function screenToStageLocal(clientX, clientY) {
    const stageRect = stage.getBoundingClientRect();
    const scale = cameraScale();
    return {
      x: (clientX - stageRect.left) / scale,
      y: (clientY - stageRect.top) / scale,
      width: stage.clientWidth,
      height: stage.clientHeight,
      scale,
      stageRect
    };
  }

  function centerOf(node) {
    const stageRect = stage.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const scale = cameraScale();
    return {
      x: (rect.left - stageRect.left + rect.width / 2) / scale,
      y: (rect.top - stageRect.top + rect.height / 2) / scale
    };
  }

  function pointOf(element) {
    if (!element) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const scale = cameraScale();
    return {
      x: (rect.left - stageRect.left + rect.width / 2) / scale,
      y: (rect.top - stageRect.top + rect.height / 2) / scale
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

  function cubicPoint(points, t) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    return {
      x: uuu * points.from.x + 3 * uu * t * points.c1.x + 3 * u * tt * points.c2.x + ttt * points.to.x,
      y: uuu * points.from.y + 3 * uu * t * points.c1.y + 3 * u * tt * points.c2.y + ttt * points.to.y
    };
  }

  function curveFor(points) {
    const dx = points.to.x - points.from.x;
    const dy = points.to.y - points.from.y;
    const tension = Math.max(34, Math.min(150, Math.abs(dx) * 0.46 + Math.abs(dy) * 0.08));
    const direction = dx >= 0 ? 1 : -1;
    return {
      ...points,
      c1: { x: points.from.x + tension * direction, y: points.from.y },
      c2: { x: points.to.x - tension * direction, y: points.to.y }
    };
  }

  function curvePath(points) {
    return `M ${points.from.x.toFixed(2)} ${points.from.y.toFixed(2)} C ${points.c1.x.toFixed(2)} ${points.c1.y.toFixed(2)}, ${points.c2.x.toFixed(2)} ${points.c2.y.toFixed(2)}, ${points.to.x.toFixed(2)} ${points.to.y.toFixed(2)}`;
  }

  function positionDisconnectButton(points, t = 0.5) {
    if (!disconnectButton || !points) return;
    const point = cubicPoint(curveFor(points), t);
    disconnectButton.style.setProperty('--disconnect-x', `${point.x.toFixed(2)}px`);
    disconnectButton.style.setProperty('--disconnect-y', `${point.y.toFixed(2)}px`);
  }

  function showDisconnect(edgeKey, t = 0.5) {
    if (!disconnectButton || coarsePointer) return;
    if (hoveredEdge?.key === edgeKey) t = hoveredEdge.t;
    hoveredEdge = { key: edgeKey, t };
    disconnectButton.dataset.edgeKey = edgeKey;
    disconnectButton.classList.add('is-visible');
    disconnectButton.setAttribute('aria-hidden', 'false');
    disconnectButton.tabIndex = 0;
  }

  function hideDisconnect() {
    if (!disconnectButton || disconnectHover) return;
    hoveredEdge = null;
    delete disconnectButton.dataset.edgeKey;
    disconnectButton.classList.remove('is-visible');
    disconnectButton.setAttribute('aria-hidden', 'true');
    disconnectButton.tabIndex = -1;
  }

  function closestPointOnCurve(px, py, rawPoints) {
    const points = curveFor(rawPoints);
    let best = null;
    const steps = 28;
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const point = cubicPoint(points, t);
      const distance = Math.hypot(px - point.x, py - point.y);
      if (!best || distance < best.distance) best = { ...point, t, distance };
    }
    return best;
  }

  function updateEdgeProximity(event) {
    if (coarsePointer || connectionState || dragState?.moved || disconnectHover) return;
    if (disconnectButton && event.target.closest?.('[data-node-disconnect]')) return;
    const pointer = screenToStageLocal(event.clientX, event.clientY);
    const px = pointer.x;
    const py = pointer.y;

    if (hoveredEdge?.key) {
      const locked = edges.find(([from, to]) => pairKey(from, to) === hoveredEdge.key);
      if (locked) {
        const fromNode = nodeByName[locked[0]];
        const toNode = nodeByName[locked[1]];
        if (fromNode && toNode) {
          const lockedPoints = connectionPoints(fromNode, toNode);
          const lockedNearest = closestPointOnCurve(px, py, lockedPoints);
          if (lockedNearest.distance <= 78) {
            positionDisconnectButton(lockedPoints, hoveredEdge.t);
            return;
          }
        }
      }
    }

    let best = null;

    edges.forEach(([from, to]) => {
      const fromNode = nodeByName[from];
      const toNode = nodeByName[to];
      if (!fromNode || !toNode) return;
      const points = connectionPoints(fromNode, toNode);
      const nearest = closestPointOnCurve(px, py, points);
      if (!best || nearest.distance < best.distance) {
        best = { ...nearest, key: pairKey(from, to), points };
      }
    });

    if (best && best.distance <= 18) {
      showDisconnect(best.key, best.t);
      positionDisconnectButton(best.points, hoveredEdge?.t ?? best.t);
    } else {
      hideDisconnect();
    }
  }

  function updatePortProximity(event) {
    if (coarsePointer) return;
    const radius = 62;
    nodes.forEach(node => {
      node.querySelectorAll('[data-node-port]').forEach(port => {
        const rect = port.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const distance = Math.hypot(event.clientX - cx, event.clientY - cy);
        const proximity = Math.max(0, Math.min(1, 1 - distance / radius));
        port.style.setProperty('--port-proximity', proximity.toFixed(3));
        port.classList.toggle('is-near', proximity > 0.06);
      });
    });
  }

  function appendPath(points, className, edgeKey, dashOffset, hotOverride = false, extraClass = '') {
    const el = document.createElementNS(ns, 'path');
    const hot = hotOverride || hoveredEdge?.key === edgeKey;
    el.setAttribute('d', curvePath(points));
    el.setAttribute('class', `${className}${hot ? ' is-hovered' : ''}${extraClass ? ` ${extraClass}` : ''}`);
    if (className === 'hero-node-line') el.setAttribute('pathLength', '1');
    if (dashOffset !== undefined) el.setAttribute('stroke-dashoffset', dashOffset.toFixed(2));
    svg.appendChild(el);
    return el;
  }

  function appendFlare(point, hot) {
    const halo = document.createElementNS(ns, 'ellipse');
    halo.setAttribute('cx', point.x.toFixed(2));
    halo.setAttribute('cy', point.y.toFixed(2));
    halo.setAttribute('rx', '1.8');
    halo.setAttribute('ry', '11');
    halo.setAttribute('class', `hero-node-line-flare hero-node-line-flare--halo${hot ? ' is-hovered' : ''}`);
    svg.appendChild(halo);

    const core = document.createElementNS(ns, 'ellipse');
    core.setAttribute('cx', point.x.toFixed(2));
    core.setAttribute('cy', point.y.toFixed(2));
    core.setAttribute('rx', '0.9');
    core.setAttribute('ry', '9');
    core.setAttribute('class', `hero-node-line-flare hero-node-line-flare--core${hot ? ' is-hovered' : ''}`);
    svg.appendChild(core);
  }

  function line(x1, y1, x2, y2, edgeKey, glintOffset = 0, nodeHot = false) {
    const edgeHot = hoveredEdge?.key === edgeKey;
    const hot = edgeHot || nodeHot;
    const pulseAge = hoveredNodeName ? performance.now() - hoveredNodeStartedAt : 9999;
    const pulseActive = nodeHot && pulseAge <= 700;
    const pulseOffset = pulseActive ? -(pulseAge / 700) * 220 : glintOffset;
    const points = curveFor({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
    if (!mobilePerformance) appendPath(points, 'hero-node-line--halo', edgeKey, undefined, hot);
    appendPath(points, 'hero-node-line', edgeKey, undefined, hot);
    if (mobilePerformance) {
      appendFlare(points.from, hot);
      appendFlare(points.to, hot);
      return;
    }
    appendPath(
      points,
      'hero-node-line--glint',
      edgeKey,
      pulseOffset,
      hot,
      pulseActive ? 'is-pulse-active' : ''
    );
    appendFlare(points.from, hot);
    appendFlare(points.to, hot);
  }

  function previewLine(x1, y1, x2, y2) {
    const points = curveFor({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
    appendPath(points, 'hero-node-line--preview', '__preview__');
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
      const edgeKey = pairKey(from, to);
      const nodeHot = hoveredNodeName === from || hoveredNodeName === to;
      line(
        points.from.x,
        points.from.y,
        points.to.x,
        points.to.y,
        edgeKey,
        -(elapsed * 34 + index * 19) % 108,
        nodeHot
      );
      if (hoveredEdge?.key === edgeKey) positionDisconnectButton(points, hoveredEdge.t);
    });

    if (connectionState) {
      const source = pointOf(connectionState.activePort) || centerOf(nodeByName[connectionState.sourceName]);
      if (source) previewLine(source.x, source.y, connectionState.pointerX, connectionState.pointerY);
    }
  }

  function clampOriginalNodeToWorld(x, y, node) {
    const camera = window.DeushimaHeroCamera;
    const bounds = camera?.getWorldBounds?.();
    const origin = camera?.getStageOrigin?.();
    if (!bounds || !origin || !node) return { x, y };

    const halfW = Math.max(1, node.offsetWidth) * 0.5;
    const halfH = Math.max(1, node.offsetHeight) * 0.5;
    const worldX = origin.x + x;
    const worldY = origin.y + y;

    return {
      x: Math.max(bounds.minX + halfW, Math.min(bounds.maxX - halfW, worldX)) - origin.x,
      y: Math.max(bounds.minY + halfH, Math.min(bounds.maxY - halfH, worldY)) - origin.y
    };
  }

  function freeNodePosition(clientX, clientY, grabOffsetX, grabOffsetY, node = null) {
    const point = screenToStageLocal(clientX, clientY);
    const raw = {
      x: point.x - grabOffsetX,
      y: point.y - grabOffsetY
    };
    const clamped = clampOriginalNodeToWorld(raw.x, raw.y, node);
    return {
      x: clamped.x,
      y: clamped.y,
      width: point.width,
      height: point.height
    };
  }

  function beginNodeDrag(event, node) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('[data-node-port]')) return;
    hideDisconnect();
    const nodeRect = node.getBoundingClientRect();
    const scale = cameraScale();
    dragState = {
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      grabOffsetX: (event.clientX - (nodeRect.left + nodeRect.width / 2)) / scale,
      grabOffsetY: (event.clientY - (nodeRect.top + nodeRect.height / 2)) / scale,
      moved: false
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
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
    const pos = freeNodePosition(event.clientX, event.clientY, dragState.grabOffsetX, dragState.grabOffsetY, dragState.node);
    dragState.node.style.setProperty('--node-x', `${(pos.x / Math.max(1, pos.width) * 100).toFixed(4)}%`);
    dragState.node.style.setProperty('--node-y', `${(pos.y / Math.max(1, pos.height) * 100).toFixed(4)}%`);
    window.DeushimaHeroCamera?.setAutoPanPointer?.(event.clientX, event.clientY, true);
    if (mobilePerformance) queueDraw();
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
    window.DeushimaHeroCamera?.clearAutoPan?.();
    dragState = null;
  }

  function setConnectTarget(targetName) {
    nodes.forEach(node => node.classList.toggle('is-connect-target', node.dataset.heroNode === targetName));
  }

  function beginConnection(event, port) {
    const node = port.closest('[data-hero-node]');
    if (!node) return;
    hideDisconnect();
    event.preventDefault();
    event.stopPropagation();
    const pointer = screenToStageLocal(event.clientX, event.clientY);
    connectionState = {
      pointerId: event.pointerId,
      sourceName: node.dataset.heroNode,
      pointerX: pointer.x,
      pointerY: pointer.y,
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
    const pointer = screenToStageLocal(event.clientX, event.clientY);
    connectionState.pointerX = pointer.x;
    connectionState.pointerY = pointer.y;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-hero-node]');
    const targetName = hit?.dataset?.heroNode;
    connectionState.targetName = targetName && targetName !== connectionState.sourceName ? targetName : null;
    setConnectTarget(connectionState.targetName);
    if (mobilePerformance) queueDraw();
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
    queueDraw();
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
    if (reducedMotion || mobilePerformance) {
      nodes.forEach(node => {
        node.style.setProperty('--node-drift-x', '0px');
        node.style.setProperty('--node-drift-y', '0px');
        node.style.setProperty('--node-parallax-x', '0px');
        node.style.setProperty('--node-parallax-y', '0px');
      });
      queueDraw();
      return;
    }
    startTime = performance.now();
    raf = requestAnimationFrame(animate);
  }

  stage.closest('.hero--node-canvas')?.addEventListener('deushima:camera-change', () => {
    queueDraw();
    if (!dragState?.moved) return;
    const pos = freeNodePosition(
      dragState.lastClientX,
      dragState.lastClientY,
      dragState.grabOffsetX,
      dragState.grabOffsetY,
      dragState.node
    );
    dragState.node.style.setProperty('--node-x', `${(pos.x / Math.max(1, pos.width) * 100).toFixed(4)}%`);
    dragState.node.style.setProperty('--node-y', `${(pos.y / Math.max(1, pos.height) * 100).toFixed(4)}%`);
  });

  const resizeObserver = new ResizeObserver(queueDraw);
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
    queueDraw();
  }, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(queueDraw, 160));
  window.addEventListener('load', queueDraw, { once: true });

  window.addEventListener('pointermove', (event) => {
    if (!coarsePointer && !reducedMotion) {
      targetPointerX = Math.max(-1, Math.min(1, (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2));
      targetPointerY = Math.max(-1, Math.min(1, (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2));
    }
    moveNodeDrag(event);
    moveConnection(event);
    updatePortProximity(event);
    updateEdgeProximity(event);
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
    nodes.forEach(node => node.querySelectorAll('[data-node-port]').forEach(port => {
      port.classList.remove('is-near');
      port.style.setProperty('--port-proximity', '0');
    }));
    hoveredNodeName = null;
    hoveredNodeStartedAt = 0;
    disconnectHover = false;
    hideDisconnect();
  });

  nodes.forEach((node) => {
    node.draggable = false;

    node.addEventListener('pointerenter', () => {
      if (coarsePointer) return;
      hoveredNodeName = node.dataset.heroNode || null;
      hoveredNodeStartedAt = performance.now();
      queueDraw();
    });

    node.addEventListener('pointerleave', () => {
      if (hoveredNodeName === node.dataset.heroNode) {
        hoveredNodeName = null;
        hoveredNodeStartedAt = 0;
        queueDraw();
      }
    });
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


  disconnectButton?.addEventListener('pointerenter', () => {
    disconnectHover = true;
  });

  disconnectButton?.addEventListener('pointerleave', () => {
    disconnectHover = false;
    hideDisconnect();
  });

  disconnectButton?.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  disconnectButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const key = disconnectButton.dataset.edgeKey;
    if (!key) return;
    const index = edges.findIndex(([a, b]) => pairKey(a, b) === key);
    if (index < 0) return;
    edges.splice(index, 1);
    disconnectHover = false;
    hideDisconnect();
    saveCanvas();
    queueDraw();
  });

  window.DeushimaHeroNodes = Object.freeze({
    resetOriginals: resetCanvas,
    isDefaultLayout: isDefaultCanvas,
    requestDraw: queueDraw,
    getOriginalNodes: () => [...nodes]
  });

  readSavedCanvas();
  scheduleDraw();
})();