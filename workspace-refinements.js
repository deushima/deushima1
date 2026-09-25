(() => {
  'use strict';

  const root = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
  const stage = root?.querySelector('[data-hero-node-stage]');
  const coreMesh = stage?.querySelector('.hero-custom-node-mesh');
  if (!root || !stage || !coreMesh || stage.dataset.refinementsReady === 'true') return;
  stage.dataset.refinementsReady = 'true';

  const ns = 'http://www.w3.org/2000/svg';
  const STORE = 'deushima:extra-ports:v1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scissorsSvg = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="6" cy="17" r="2.5"></circle><circle cx="6" cy="7" r="2.5"></circle><path d="m8 8.5 9 7.5"></path><path d="m8 15.5 9-7.5"></path></svg>';

  const style = document.createElement('style');
  style.dataset.workspaceRefinements = 'true';
  style.textContent = `
    .hero-custom-node-line--halo,.hero-custom-node-line--glint{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round}
    .hero-custom-node-line--halo{stroke:rgba(150,197,255,.19);stroke-width:5.4;opacity:.7;filter:blur(3.4px) drop-shadow(0 0 .7rem rgba(71,148,255,.16))}
    .hero-custom-node-line{stroke:rgba(190,221,255,.66)!important;stroke-width:1.05!important;opacity:1!important;filter:drop-shadow(0 0 .18rem rgba(202,230,255,.36)) drop-shadow(0 0 .45rem rgba(36,119,255,.16))}
    .hero-custom-node-line--glint{stroke:rgba(245,251,255,.95);stroke-width:1.15;stroke-dasharray:12 150;opacity:.55;filter:drop-shadow(0 0 .18rem rgba(255,255,255,.62)) drop-shadow(0 0 .42rem rgba(75,157,255,.28));animation:heroCustomConnectionGlint 3.2s linear infinite}
    @keyframes heroCustomConnectionGlint{to{stroke-dashoffset:-162}}
    .hero-custom-node-line.is-hovered,.hero-custom-node-line.is-selected{stroke:rgba(235,247,255,.98)!important;stroke-width:1.4!important}
    .hero-custom-node-line--halo.is-hovered,.hero-custom-node-line--halo.is-selected{stroke:rgba(198,225,255,.28);stroke-width:6.4;opacity:.92}
    .hero-custom-node-line--glint.is-hovered,.hero-custom-node-line--glint.is-selected{stroke:#fff;stroke-width:1.3;opacity:.94}
    .hero-custom-node-line--preview{stroke-width:1.15!important;stroke-dasharray:7 8!important}
    .hero-custom-node__port--extra{top:calc(var(--extra-port-position,.5)*100%)}
    .hero-custom-node__port--extra[data-port-side="left"]{left:-5px}.hero-custom-node__port--extra[data-port-side="right"]{right:-5px}
    .hero-custom-connection-delete{width:2.15rem!important;height:2.05rem!important;border:1px solid rgba(56,139,255,.98)!important;border-radius:.78rem!important;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0)),rgba(12,12,15,.97)!important;color:rgba(224,239,255,.98)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(36,119,255,.24),0 .5rem 1.6rem rgba(0,0,0,.36),0 0 1rem rgba(36,119,255,.3)!important}
    .hero-custom-connection-delete:hover,.hero-custom-connection-delete:focus-visible{border-color:rgba(93,166,255,1)!important;background:rgba(12,12,15,.99)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(36,119,255,.4),0 0 1.25rem rgba(36,119,255,.48)!important}
    .hero-custom-connection-delete svg{width:1.05rem;height:1.05rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
    .hero-custom-cut-particle{position:absolute;z-index:89;width:2px;height:2px;border-radius:50%;background:rgba(226,242,255,.92);box-shadow:0 0 5px rgba(88,164,255,.72);pointer-events:none}
  `;
  document.head.appendChild(style);

  const safeRead = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE) || '{}');
      return {
        ports: parsed && typeof parsed.ports === 'object' ? parsed.ports : {},
        connections: Array.isArray(parsed?.connections) ? parsed.connections : []
      };
    } catch {
      return { ports: {}, connections: [] };
    }
  };

  let state = safeRead();
  let gesture = null;
  let coreGesture = null;
  let activeNodeId = null;
  const connectionEls = new Map();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sideToken = side => side === 'left' ? 'in' : 'out';
  const sideFromToken = token => token === 'in' || token === 'left' ? 'left' : 'right';
  const cameraScale = () => window.DeushimaHeroCamera?.getState?.().scale || 1;

  function spawnCutParticles(localX, localY) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 7; i += 1) {
      const particle = document.createElement('span');
      particle.className = 'hero-custom-cut-particle';
      particle.style.left = `${localX}px`;
      particle.style.top = `${localY}px`;
      stage.appendChild(particle);
      const dx = (Math.random() - .5) * 24;
      const lift = -4 - Math.random() * 8;
      const fall = 28 + Math.random() * 34;
      const animation = particle.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * .45}px,${lift}px) scale(.9)`, opacity: .9, offset: .3 },
        { transform: `translate(${dx}px,${fall}px) scale(.3)`, opacity: 0 }
      ], { duration: 430 + Math.random() * 220, easing: 'cubic-bezier(.22,.66,.35,1)' });
      animation.onfinish = () => particle.remove();
    }
  }

  function upgradeCoreDeleteButton() {
    const button = stage.querySelector('.hero-custom-connection-delete:not([data-refinement-delete])');
    if (!button || button.dataset.scissorsReady === 'true') return;
    button.dataset.scissorsReady = 'true';
    button.innerHTML = scissorsSvg;
    button.setAttribute('aria-label', 'Disconnect');
    button.addEventListener('click', () => {
      spawnCutParticles(parseFloat(button.style.left) || 0, parseFloat(button.style.top) || 0);
    }, true);
  }

  function upgradeCoreConnectionGroup(group) {
    if (!(group instanceof SVGGElement) || !group.dataset.customConnection) return;
    const core = group.querySelector('.hero-custom-node-line');
    const hit = group.querySelector('.hero-custom-node-line-hit');
    if (!core || !hit) return;
    let halo = group.querySelector('.hero-custom-node-line--halo');
    let glint = group.querySelector('.hero-custom-node-line--glint');
    if (!halo) {
      halo = document.createElementNS(ns, 'path');
      halo.setAttribute('class', 'hero-custom-node-line--halo');
      group.insertBefore(halo, core);
    }
    if (!glint) {
      glint = document.createElementNS(ns, 'path');
      glint.setAttribute('class', 'hero-custom-node-line--glint');
      group.insertBefore(glint, hit);
    }
    const d = core.getAttribute('d') || '';
    halo.setAttribute('d', d);
    glint.setAttribute('d', d);
    ['is-hovered', 'is-selected'].forEach(className => {
      const enabled = core.classList.contains(className);
      halo.classList.toggle(className, enabled);
      glint.classList.toggle(className, enabled);
    });
  }

  coreMesh.querySelectorAll('[data-custom-connection]').forEach(upgradeCoreConnectionGroup);
  upgradeCoreDeleteButton();
  new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => {
          if (node instanceof SVGGElement) upgradeCoreConnectionGroup(node);
          if (node instanceof Element) node.querySelectorAll?.('[data-custom-connection]').forEach(upgradeCoreConnectionGroup);
        });
      } else if (record.target instanceof SVGPathElement && record.target.classList.contains('hero-custom-node-line')) {
        upgradeCoreConnectionGroup(record.target.closest('[data-custom-connection]'));
      }
    });
  }).observe(coreMesh, { subtree: true, childList: true, attributes: true, attributeFilter: ['d', 'class'] });

  const extraMesh = document.createElementNS(ns, 'svg');
  extraMesh.classList.add('hero-custom-node-mesh', 'hero-refinement-mesh');
  extraMesh.setAttribute('aria-hidden', 'true');
  coreMesh.insertAdjacentElement('afterend', extraMesh);
  const preview = document.createElementNS(ns, 'path');
  preview.setAttribute('class', 'hero-custom-node-line--preview');
  extraMesh.appendChild(preview);

  const cutButton = document.createElement('button');
  cutButton.type = 'button';
  cutButton.className = 'hero-custom-connection-delete';
  cutButton.dataset.refinementDelete = 'true';
  cutButton.setAttribute('aria-label', 'Disconnect');
  cutButton.innerHTML = scissorsSvg;
  stage.appendChild(cutButton);

  const customNode = nodeId => stage.querySelector(`[data-custom-node="${CSS.escape(nodeId)}"]`);

  function cleanupState() {
    const liveIds = new Set([...stage.querySelectorAll('[data-custom-node]')].map(node => node.dataset.customNode));
    let changed = false;
    Object.keys(state.ports).forEach(nodeId => {
      if (!liveIds.has(nodeId)) { delete state.ports[nodeId]; changed = true; }
    });
    const before = state.connections.length;
    state.connections = state.connections.filter(connection => [connection.from, connection.to].every(endpoint => endpoint.kind === 'orig' || liveIds.has(endpoint.nodeId)));
    if (state.connections.length !== before) changed = true;
    if (changed) save();
  }

  function renderPorts(nodeId) {
    const node = customNode(nodeId);
    if (!node) return;
    node.querySelectorAll('[data-extra-refinement-port]').forEach(port => port.remove());
    const ports = Array.isArray(state.ports[nodeId]) ? state.ports[nodeId] : [];
    ports.forEach(portData => {
      const port = document.createElement('span');
      port.className = 'hero-custom-node__port hero-custom-node__port--extra';
      port.dataset.extraRefinementPort = portData.id;
      port.dataset.portSide = portData.side;
      port.style.setProperty('--extra-port-position', String(portData.position));
      port.setAttribute('aria-hidden', 'true');
      node.appendChild(port);
    });
  }

  function renderAllPorts() {
    cleanupState();
    stage.querySelectorAll('[data-custom-node]').forEach(node => renderPorts(node.dataset.customNode));
  }

  const positions = [.28, .72, .18, .82, .39, .61];
  function addPort(nodeId, side) {
    const list = Array.isArray(state.ports[nodeId]) ? state.ports[nodeId] : [];
    const sameSide = list.filter(port => port.side === side);
    if (sameSide.length >= positions.length) return false;
    state.ports[nodeId] = [...list, { id: uid(side), side, position: positions[sameSide.length] }];
    save();
    renderPorts(nodeId);
    return true;
  }

  function removeLastPort(nodeId) {
    const list = Array.isArray(state.ports[nodeId]) ? [...state.ports[nodeId]] : [];
    const removed = list.pop();
    if (!removed) return false;
    state.ports[nodeId] = list;
    state.connections = state.connections.filter(connection => ![connection.from, connection.to].some(endpoint => endpoint.kind === 'extra' && endpoint.nodeId === nodeId && endpoint.portId === removed.id));
    save();
    renderPorts(nodeId);
    drawConnections();
    return true;
  }

  function endpointElement(endpoint) {
    if (!endpoint) return null;
    if (endpoint.kind === 'extra') return customNode(endpoint.nodeId)?.querySelector(`[data-extra-refinement-port="${CSS.escape(endpoint.portId)}"]`) || null;
    if (endpoint.kind === 'custom') return customNode(endpoint.nodeId)?.querySelector(`[data-custom-port="${sideToken(endpoint.side)}"]`) || null;
    if (endpoint.kind === 'orig') return stage.querySelector(`[data-hero-node="${CSS.escape(endpoint.name)}"] [data-node-port="${sideToken(endpoint.side)}"]`);
    return null;
  }

  function endpointFromPort(port) {
    if (!(port instanceof Element)) return null;
    const node = port.closest('[data-custom-node]');
    if (port.dataset.extraRefinementPort && node?.dataset.customNode) return { kind: 'extra', nodeId: node.dataset.customNode, portId: port.dataset.extraRefinementPort, side: port.dataset.portSide || 'right' };
    if (port.dataset.customPort && node?.dataset.customNode) return { kind: 'custom', nodeId: node.dataset.customNode, side: sideFromToken(port.dataset.customPort) };
    const original = port.closest('[data-hero-node]');
    if (port.dataset.nodePort && original?.dataset.heroNode) return { kind: 'orig', name: original.dataset.heroNode, side: sideFromToken(port.dataset.nodePort) };
    return null;
  }

  const endpointNodeKey = endpoint => endpoint.kind === 'orig' ? `orig:${endpoint.name}` : `custom:${endpoint.nodeId}`;
  function localCenter(endpoint) {
    const element = endpointElement(endpoint);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const scale = cameraScale();
    return { x: (rect.left - stageRect.left + rect.width / 2) / scale, y: (rect.top - stageRect.top + rect.height / 2) / scale };
  }

  function curve(from, to, fromSide, toSide) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const tension = Math.max(42, Math.min(190, Math.abs(dx) * .42 + Math.abs(dy) * .12));
    return {
      from,
      to,
      c1: { x: from.x + tension * (fromSide === 'left' ? -1 : 1), y: from.y },
      c2: { x: to.x + tension * (toSide === 'left' ? -1 : 1), y: to.y }
    };
  }

  const curvePath = points => `M ${points.from.x.toFixed(2)} ${points.from.y.toFixed(2)} C ${points.c1.x.toFixed(2)} ${points.c1.y.toFixed(2)}, ${points.c2.x.toFixed(2)} ${points.c2.y.toFixed(2)}, ${points.to.x.toFixed(2)} ${points.to.y.toFixed(2)}`;
  const midpoint = points => ({ x: .125 * points.from.x + .375 * points.c1.x + .375 * points.c2.x + .125 * points.to.x, y: .125 * points.from.y + .375 * points.c1.y + .375 * points.c2.y + .125 * points.to.y });

  function ensureConnection(connection) {
    if (connectionEls.has(connection.id)) return connectionEls.get(connection.id);
    const group = document.createElementNS(ns, 'g');
    group.dataset.refinementConnection = connection.id;
    const halo = document.createElementNS(ns, 'path');
    const core = document.createElementNS(ns, 'path');
    const glint = document.createElementNS(ns, 'path');
    const hit = document.createElementNS(ns, 'path');
    halo.setAttribute('class', 'hero-custom-node-line--halo');
    core.setAttribute('class', 'hero-custom-node-line');
    glint.setAttribute('class', 'hero-custom-node-line--glint');
    hit.setAttribute('class', 'hero-custom-node-line-hit');
    group.append(halo, core, glint, hit);
    extraMesh.insertBefore(group, preview);
    const record = { group, halo, core, glint, hit };
    connectionEls.set(connection.id, record);
    const setHover = enabled => [halo, core, glint].forEach(path => path.classList.toggle('is-hovered', enabled));
    hit.addEventListener('pointerenter', () => { setHover(true); showCut(connection.id); });
    hit.addEventListener('pointerleave', () => { setHover(false); if (!cutButton.matches(':hover')) hideCut(); });
    hit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showCut(connection.id); });
    return record;
  }

  function drawConnections() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    extraMesh.setAttribute('viewBox', `0 0 ${width} ${height}`);
    state.connections.forEach(connection => {
      const from = localCenter(connection.from);
      const to = localCenter(connection.to);
      if (!from || !to) return;
      const points = curve(from, to, connection.from.side, connection.to.side);
      const d = curvePath(points);
      const record = ensureConnection(connection);
      [record.halo, record.core, record.glint, record.hit].forEach(path => path.setAttribute('d', d));
      if (cutButton.dataset.connectionId === connection.id) positionCut(midpoint(points));
    });
    [...connectionEls.keys()].forEach(id => {
      if (state.connections.some(connection => connection.id === id)) return;
      connectionEls.get(id)?.group.remove();
      connectionEls.delete(id);
    });
  }

  function positionCut(point) {
    cutButton.style.left = `${point.x}px`;
    cutButton.style.top = `${point.y}px`;
    cutButton.classList.add('is-visible');
  }
  function showCut(id) {
    const connection = state.connections.find(item => item.id === id);
    if (!connection) return;
    cutButton.dataset.connectionId = id;
    const from = localCenter(connection.from);
    const to = localCenter(connection.to);
    if (from && to) positionCut(midpoint(curve(from, to, connection.from.side, connection.to.side)));
  }
  function hideCut() { delete cutButton.dataset.connectionId; cutButton.classList.remove('is-visible'); }

  cutButton.addEventListener('pointerleave', hideCut);
  cutButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const id = cutButton.dataset.connectionId;
    if (!id) return;
    spawnCutParticles(parseFloat(cutButton.style.left) || 0, parseFloat(cutButton.style.top) || 0);
    state.connections = state.connections.filter(connection => connection.id !== id);
    save();
    hideCut();
    drawConnections();
  });

  function nearestTarget(clientX, clientY, source) {
    let best = null;
    [...stage.querySelectorAll('[data-extra-refinement-port], [data-custom-port], [data-node-port]')].forEach(port => {
      const endpoint = endpointFromPort(port);
      if (!endpoint || endpointNodeKey(endpoint) === endpointNodeKey(source)) return;
      const rect = port.getBoundingClientRect();
      const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
      if (distance <= 46 && (!best || distance < best.distance)) best = { endpoint, port, distance };
    });
    return best;
  }

  function openCanvasMenuAt(clientX, clientY) {
    const rect = root.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    requestAnimationFrame(() => {
      if (document.querySelector('.hero-custom-node-context.is-open')) return;
      stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, clientX, clientY }));
    });
  }

  stage.addEventListener('pointerdown', event => {
    const extra = event.target instanceof Element ? event.target.closest('[data-extra-refinement-port]') : null;
    if (extra) {
      const source = endpointFromPort(extra);
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      gesture = { pointerId: event.pointerId, source, sourcePort: extra };
      extra.classList.add('is-active');
      try { extra.setPointerCapture?.(event.pointerId); } catch {}
      return;
    }
    const corePort = event.target instanceof Element ? event.target.closest('[data-custom-port], [data-node-port]') : null;
    if (corePort) coreGesture = { pointerId: event.pointerId, sourcePort: corePort, startX: event.clientX, startY: event.clientY };
  }, true);

  window.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const from = localCenter(gesture.source);
    if (!from) return;
    const target = nearestTarget(event.clientX, event.clientY, gesture.source);
    const stageRect = stage.getBoundingClientRect();
    const scale = cameraScale();
    const to = target ? localCenter(target.endpoint) : { x: (event.clientX - stageRect.left) / scale, y: (event.clientY - stageRect.top) / scale };
    if (!to) return;
    preview.setAttribute('d', curvePath(curve(from, to, gesture.source.side, target?.endpoint.side || (to.x >= from.x ? 'left' : 'right'))));
  }, { passive: true });

  window.addEventListener('pointerup', event => {
    if (gesture && event.pointerId === gesture.pointerId) {
      const current = gesture;
      const target = nearestTarget(event.clientX, event.clientY, current.source);
      gesture = null;
      current.sourcePort.classList.remove('is-active');
      preview.setAttribute('d', '');
      try { current.sourcePort.releasePointerCapture?.(event.pointerId); } catch {}
      if (target?.endpoint) {
        state.connections.push({ id: uid('conn'), from: current.source, to: target.endpoint });
        save();
        drawConnections();
      } else {
        openCanvasMenuAt(event.clientX, event.clientY);
      }
    }

    if (coreGesture && event.pointerId === coreGesture.pointerId) {
      const current = coreGesture;
      coreGesture = null;
      const source = endpointFromPort(current.sourcePort);
      if (!source) return;
      const target = nearestTarget(event.clientX, event.clientY, source);
      if (!target && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 8) openCanvasMenuAt(event.clientX, event.clientY);
    }
  });

  function menuButton(label, icon, handler, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-custom-node-context__item';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-disabled', String(disabled));
    button.innerHTML = `<span class="hero-custom-node-context__icon" aria-hidden="true">${icon}</span><span class="hero-custom-node-context__label"></span>`;
    button.querySelector('.hero-custom-node-context__label').textContent = label;
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (!disabled) handler(); });
    return button;
  }

  function showModifyMenu(nodeId) {
    const menu = document.querySelector('.hero-custom-node-context.is-open');
    if (!menu) return;
    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = 'Modific node';
    const note = document.createElement('div');
    note.className = 'hero-custom-node-context__note';
    note.textContent = 'Add independent start points on either side.';
    const list = Array.isArray(state.ports[nodeId]) ? state.ports[nodeId] : [];
    const leftCount = list.filter(port => port.side === 'left').length;
    const rightCount = list.filter(port => port.side === 'right').length;
    menu.replaceChildren(
      heading,
      menuButton('Add start point · left', '+', () => { if (addPort(nodeId, 'left')) showModifyMenu(nodeId); }, leftCount >= positions.length),
      menuButton('Add start point · right', '+', () => { if (addPort(nodeId, 'right')) showModifyMenu(nodeId); }, rightCount >= positions.length),
      menuButton('Remove last point', '−', () => { if (removeLastPort(nodeId)) showModifyMenu(nodeId); }, !list.length),
      note
    );
  }

  root.addEventListener('contextmenu', event => {
    const node = event.target instanceof Element ? event.target.closest('[data-custom-node]') : null;
    if (!node) return;
    activeNodeId = node.dataset.customNode;
    queueMicrotask(() => {
      const menu = document.querySelector('.hero-custom-node-context.is-open');
      if (!menu || !activeNodeId || menu.querySelector('[data-refinement-modify]')) return;
      const heading = menu.querySelector('.hero-custom-node-context__heading');
      if (!heading) return;
      const button = menuButton('Modific node', '+', () => showModifyMenu(activeNodeId));
      button.dataset.refinementModify = 'true';
      heading.insertAdjacentElement('afterend', button);
    });
  }, true);

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('.hero-custom-node-context__url-form')) return;
    const menu = form.closest('.hero-custom-node-context');
    if (menu?.querySelector('.hero-custom-node-context__heading')?.textContent?.trim() !== 'Link image') return;
    if (form.dataset.pinterestResolved === 'true') { delete form.dataset.pinterestResolved; return; }
    const input = form.querySelector('input[type="url"]');
    const message = form.querySelector('.hero-custom-node-context__url-message');
    let url;
    try { url = new URL(input?.value || ''); } catch { return; }
    const host = url.hostname.toLowerCase();
    const isPinterest = host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com');
    if (!isPinterest) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (message) message.textContent = 'Resolving Pinterest image…';
    try {
      const response = await fetch(`/api/media-resolver?url=${encodeURIComponent(url.href)}`, { headers: { accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data?.url) throw new Error('Resolver failed');
      input.value = data.url;
      form.dataset.pinterestResolved = 'true';
      form.requestSubmit();
    } catch {
      if (message) message.textContent = 'Could not resolve this Pinterest link.';
      input?.focus({ preventScroll: true });
    }
  }, true);

  const stageObserver = new MutationObserver(records => {
    let redraw = false;
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches?.('[data-custom-node]')) renderPorts(node.dataset.customNode);
        node.querySelectorAll?.('[data-custom-node]').forEach(custom => renderPorts(custom.dataset.customNode));
        redraw = true;
      });
      if (record.removedNodes.length) redraw = true;
    });
    if (redraw) { cleanupState(); upgradeCoreDeleteButton(); drawConnections(); }
  });
  stageObserver.observe(stage, { childList: true, subtree: true });
  root.addEventListener('deushima:camera-change', drawConnections);
  stage.addEventListener('deushima:hero-layout-change', drawConnections);
  window.addEventListener('resize', drawConnections, { passive: true });
  window.addEventListener('pointermove', () => { if (state.connections.length) drawConnections(); }, { passive: true });

  renderAllPorts();
  drawConnections();
})();
