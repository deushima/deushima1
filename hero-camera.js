(() => {
  'use strict';

  const hero = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
  const stage = hero?.querySelector('[data-hero-node-stage]');
  if (!hero || !stage) return;
  if (hero.dataset.cameraReady === 'true') return;
  hero.dataset.cameraReady = 'true';

  const CONFIG = Object.freeze({
    minScale: 0.4,
    maxScale: 2.5,
    worldScreens: 7,
    zoomEaseMs: 120,
    panResistance: 0.22,
    autoPanMargin: 48,
    autoPanMaxSpeed: 760,
    keyboardPan: 40
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const interactionRoot = hero;
  const interactionDebugEnabled = new URLSearchParams(window.location.search).get('interactiondebug') === '1';
  const cancelHandlers = new Set();
  const fixedUiSelector = [
    '.nav',
    '.hero__copy',
    '.floating-cta',
    '.deu-chat-launcher',
    '.hero-custom-node-context',
    '.content-panel',
    '.design-viewer',
    '[data-audio-control]'
  ].join(',');

  interactionRoot.dataset.interactionRoot = 'workspace';

  const cameraLayer = document.createElement('div');
  cameraLayer.className = 'hero-node-camera';
  cameraLayer.dataset.heroNodeCamera = '';
  stage.parentNode.insertBefore(cameraLayer, stage);
  cameraLayer.appendChild(stage);

  const zoomIndicator = document.createElement('span');
  zoomIndicator.className = 'hero-camera-zoom';
  zoomIndicator.setAttribute('aria-hidden', 'true');
  zoomIndicator.textContent = '100%';
  hero.appendChild(zoomIndicator);

  let heroRect = hero.getBoundingClientRect();
  let width = Math.max(1, hero.clientWidth || heroRect.width);
  let height = Math.max(1, hero.clientHeight || heroRect.height);

  let world = makeWorldBounds(width, height);

  let current = {
    cx: width * 0.5,
    cy: height * 0.5,
    scale: 1
  };
  let target = { ...current };

  let stageOrigin = { x: 0, y: 0 };
  let raf = 0;
  let lastFrame = performance.now();
  let panState = null;
  let touchState = null;
  let spaceDown = false;
  let zoomTimer = 0;
  let lastPointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    target: hero,
    inside: false
  };
  let autoPan = {
    active: false,
    clientX: 0,
    clientY: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeWorldBounds(viewWidth, viewHeight) {
    const halfExtraX = ((CONFIG.worldScreens - 1) * viewWidth) * 0.5;
    const halfExtraY = ((CONFIG.worldScreens - 1) * viewHeight) * 0.5;
    return {
      minX: -halfExtraX,
      maxX: viewWidth + halfExtraX,
      minY: -halfExtraY,
      maxY: viewHeight + halfExtraY,
      width: viewWidth * CONFIG.worldScreens,
      height: viewHeight * CONFIG.worldScreens
    };
  }

  function isBlocked() {
    return [
      'is-content-panel-open',
      'is-design-viewer-open',
      'is-launcher-pop-open',
      'deu-chat-open',
      'is-page-leaving'
    ].some(className => document.body.classList.contains(className));
  }

  function isTextInput(targetEl) {
    return Boolean(targetEl?.closest?.('input, textarea, select, [contenteditable="true"]'));
  }

  function eventPath(event) {
    if (typeof event?.composedPath === 'function') return event.composedPath();
    const path = [];
    let node = event?.target || null;
    while (node) {
      path.push(node);
      node = node.parentNode || node.host || null;
    }
    path.push(window);
    return path;
  }

  function pathMatches(event, selector) {
    return eventPath(event).some(item => item instanceof Element && item.matches(selector));
  }

  function describeTarget(target) {
    if (!(target instanceof Element)) return String(target?.nodeName || target || 'unknown');
    const id = target.id ? `#${target.id}` : '';
    const classes = target.classList?.length ? `.${[...target.classList].join('.')}` : '';
    return `${target.tagName.toLowerCase()}${id}${classes}`;
  }

  function debugInteraction(type, event = null, extra = {}) {
    if (!interactionDebugEnabled) return;
    const path = event
      ? eventPath(event).slice(0, 10).map(describeTarget)
      : [];
    console.info(`[interaction] ${type}`, {
      button: event?.button,
      pointerId: event?.pointerId,
      target: event ? describeTarget(event.target) : null,
      path,
      prevented: Boolean(event?.defaultPrevented),
      isPanning: Boolean(panState),
      camera: { cx: current.cx, cy: current.cy, scale: current.scale },
      ...extra
    });
  }

  function registerCancelHandler(handler) {
    if (typeof handler !== 'function') return () => {};
    cancelHandlers.add(handler);
    return () => cancelHandlers.delete(handler);
  }

  function notifyCancelHandlers(reason, pointerId = null) {
    cancelHandlers.forEach(handler => {
      try { handler({ reason, pointerId }); } catch (error) {
        if (interactionDebugEnabled) console.warn('[interaction] cancel handler failed', error);
      }
    });
  }

  function isFixedUiTarget(targetEl) {
    if (!(targetEl instanceof Element)) return false;
    return Boolean(targetEl.closest(fixedUiSelector));
  }

  function isFixedUiEvent(event) {
    return pathMatches(event, fixedUiSelector);
  }

  function isInteractiveCanvasTarget(targetEl) {
    if (!(targetEl instanceof Element)) return false;
    return Boolean(targetEl.closest([
      '[data-hero-node]',
      '[data-custom-node]',
      '[data-node-disconnect]',
      '.hero-custom-connection-delete',
      '.hero-custom-node-line-hit'
    ].join(',')));
  }

  function pointInsideHero(clientX, clientY) {
    const rect = hero.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function cameraLimits(scaleValue = current.scale) {
    const halfW = width / (2 * scaleValue);
    const halfH = height / (2 * scaleValue);
    return {
      minCx: world.minX + halfW,
      maxCx: world.maxX - halfW,
      minCy: world.minY + halfH,
      maxCy: world.maxY - halfH
    };
  }

  function clampCamera(camera) {
    const limits = cameraLimits(camera.scale);
    return {
      cx: clamp(camera.cx, limits.minCx, limits.maxCx),
      cy: clamp(camera.cy, limits.minCy, limits.maxCy),
      scale: clamp(camera.scale, CONFIG.minScale, CONFIG.maxScale)
    };
  }

  function resist(value, min, max) {
    if (value < min) return min - (min - value) * CONFIG.panResistance;
    if (value > max) return max + (value - max) * CONFIG.panResistance;
    return value;
  }

  function applyPanResistance(camera) {
    const limits = cameraLimits(camera.scale);
    return {
      ...camera,
      cx: resist(camera.cx, limits.minCx, limits.maxCx),
      cy: resist(camera.cy, limits.minCy, limits.maxCy)
    };
  }

  function transformString(camera = current) {
    const tx = width * 0.5 - camera.cx * camera.scale;
    const ty = height * 0.5 - camera.cy * camera.scale;
    return `translate3d(${tx.toFixed(3)}px, ${ty.toFixed(3)}px, 0) scale(${camera.scale.toFixed(5)})`;
  }

  function applyTransform({ dispatch = true } = {}) {
    cameraLayer.style.transform = transformString(current);
    if (dispatch) {
      hero.dispatchEvent(new CustomEvent('deushima:camera-change', {
        detail: getState()
      }));
    }
  }

  function screenToWorld(clientX, clientY, camera = current) {
    const rect = hero.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: camera.cx + (localX - width * 0.5) / camera.scale,
      y: camera.cy + (localY - height * 0.5) / camera.scale
    };
  }

  function worldToScreen(worldX, worldY, camera = current) {
    const rect = hero.getBoundingClientRect();
    return {
      x: rect.left + width * 0.5 + (worldX - camera.cx) * camera.scale,
      y: rect.top + height * 0.5 + (worldY - camera.cy) * camera.scale
    };
  }

  function worldToStage(worldX, worldY) {
    return {
      x: worldX - stageOrigin.x,
      y: worldY - stageOrigin.y
    };
  }

  function stageToWorld(stageX, stageY) {
    return {
      x: stageOrigin.x + stageX,
      y: stageOrigin.y + stageY
    };
  }

  function getStageOrigin() {
    return { ...stageOrigin };
  }

  function measureStageOrigin() {
    const rect = stage.getBoundingClientRect();
    const worldPoint = screenToWorld(rect.left, rect.top);
    stageOrigin = {
      x: worldPoint.x,
      y: worldPoint.y
    };
  }

  function showZoomIndicator() {
    zoomIndicator.textContent = `${Math.round(current.scale * 100)}%`;
    zoomIndicator.classList.add('is-visible');
    window.clearTimeout(zoomTimer);
    zoomTimer = window.setTimeout(() => {
      zoomIndicator.classList.remove('is-visible');
    }, 1200);
  }

  function nearlyEqual(a, b, epsilon = 0.001) {
    return Math.abs(a - b) <= epsilon;
  }

  function isDefaultView() {
    return (
      nearlyEqual(current.cx, width * 0.5, 0.35) &&
      nearlyEqual(current.cy, height * 0.5, 0.35) &&
      nearlyEqual(current.scale, 1, 0.001)
    );
  }

  function needsAnimation() {
    return (
      !nearlyEqual(current.cx, target.cx, 0.02) ||
      !nearlyEqual(current.cy, target.cy, 0.02) ||
      !nearlyEqual(current.scale, target.scale, 0.0002) ||
      autoPan.active
    );
  }

  function applyAutoPan(dt) {
    if (!autoPan.active || isBlocked()) return false;
    const rect = hero.getBoundingClientRect();
    const x = autoPan.clientX - rect.left;
    const y = autoPan.clientY - rect.top;
    let vx = 0;
    let vy = 0;

    if (x < CONFIG.autoPanMargin) {
      const t = clamp((CONFIG.autoPanMargin - x) / CONFIG.autoPanMargin, 0, 1);
      vx = CONFIG.autoPanMaxSpeed * t * t;
    } else if (x > width - CONFIG.autoPanMargin) {
      const t = clamp((x - (width - CONFIG.autoPanMargin)) / CONFIG.autoPanMargin, 0, 1);
      vx = -CONFIG.autoPanMaxSpeed * t * t;
    }

    if (y < CONFIG.autoPanMargin) {
      const t = clamp((CONFIG.autoPanMargin - y) / CONFIG.autoPanMargin, 0, 1);
      vy = CONFIG.autoPanMaxSpeed * t * t;
    } else if (y > height - CONFIG.autoPanMargin) {
      const t = clamp((y - (height - CONFIG.autoPanMargin)) / CONFIG.autoPanMargin, 0, 1);
      vy = -CONFIG.autoPanMaxSpeed * t * t;
    }

    if (!vx && !vy) return false;

    const seconds = Math.min(0.05, dt / 1000);
    const next = {
      ...current,
      cx: current.cx - (vx * seconds) / current.scale,
      cy: current.cy - (vy * seconds) / current.scale
    };
    const resisted = applyPanResistance(next);
    current.cx = resisted.cx;
    current.cy = resisted.cy;
    target.cx = current.cx;
    target.cy = current.cy;
    return true;
  }

  function frame(now) {
    raf = 0;
    const dt = Math.max(1, Math.min(50, now - lastFrame));
    lastFrame = now;

    let changed = applyAutoPan(dt);

    if (!panState && !touchState?.activePan && !autoPan.active) {
      const duration = reducedMotion.matches ? 0 : CONFIG.zoomEaseMs;
      const alpha = duration <= 0 ? 1 : 1 - Math.exp(-dt / (duration * 0.34));

      const nextCx = current.cx + (target.cx - current.cx) * alpha;
      const nextCy = current.cy + (target.cy - current.cy) * alpha;
      const nextScale = current.scale + (target.scale - current.scale) * alpha;

      if (
        !nearlyEqual(nextCx, current.cx, 0.0001) ||
        !nearlyEqual(nextCy, current.cy, 0.0001) ||
        !nearlyEqual(nextScale, current.scale, 0.000001)
      ) {
        current.cx = nextCx;
        current.cy = nextCy;
        current.scale = nextScale;
        changed = true;
      }

      if (!needsAnimation()) {
        current = { ...target };
      }
    }

    if (changed || needsAnimation()) {
      applyTransform();
    }

    if (needsAnimation()) {
      raf = requestAnimationFrame(frame);
    }
  }

  function ensureFrame() {
    if (!raf && !document.hidden) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function setTarget(next, { immediate = false, elastic = false } = {}) {
    const withScale = {
      cx: Number.isFinite(next.cx) ? next.cx : target.cx,
      cy: Number.isFinite(next.cy) ? next.cy : target.cy,
      scale: clamp(Number.isFinite(next.scale) ? next.scale : target.scale, CONFIG.minScale, CONFIG.maxScale)
    };
    target = elastic ? applyPanResistance(withScale) : clampCamera(withScale);

    if (immediate || reducedMotion.matches) {
      current = { ...target };
      applyTransform();
      return;
    }
    ensureFrame();
  }

  function panByScreen(dx, dy, { immediate = true, elastic = true } = {}) {
    const base = immediate ? current : target;
    const next = {
      ...base,
      cx: base.cx - dx / base.scale,
      cy: base.cy - dy / base.scale
    };
    const adjusted = elastic ? applyPanResistance(next) : clampCamera(next);

    if (immediate || reducedMotion.matches) {
      current.cx = adjusted.cx;
      current.cy = adjusted.cy;
      target.cx = current.cx;
      target.cy = current.cy;
      applyTransform();
    } else {
      target.cx = adjusted.cx;
      target.cy = adjusted.cy;
      ensureFrame();
    }
  }

  function settleBounds() {
    const clamped = clampCamera(target);
    target.cx = clamped.cx;
    target.cy = clamped.cy;
    target.scale = clamped.scale;
    if (reducedMotion.matches) {
      current = { ...target };
      applyTransform();
    } else {
      ensureFrame();
    }
  }

  function zoomAt(clientX, clientY, scaleValue, { immediate = false } = {}) {
    if (isBlocked()) return;
    const nextScale = clamp(scaleValue, CONFIG.minScale, CONFIG.maxScale);
    const anchorWorld = screenToWorld(clientX, clientY, current);
    const rect = hero.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const next = {
      scale: nextScale,
      cx: anchorWorld.x - (localX - width * 0.5) / nextScale,
      cy: anchorWorld.y - (localY - height * 0.5) / nextScale
    };

    target = clampCamera(next);

    if (immediate || reducedMotion.matches) {
      current = { ...target };
      applyTransform();
    } else {
      ensureFrame();
    }
    showZoomIndicator();
  }

  function recenter({ animate = true } = {}) {
    target = {
      cx: width * 0.5,
      cy: height * 0.5,
      scale: 1
    };
    if (!animate || reducedMotion.matches) {
      current = { ...target };
      applyTransform();
    } else {
      ensureFrame();
    }
    showZoomIndicator();
  }

  function setAutoPanPointer(clientX, clientY, active = true) {
    autoPan.active = Boolean(active);
    autoPan.clientX = clientX;
    autoPan.clientY = clientY;
    if (autoPan.active) ensureFrame();
  }

  function clearAutoPan() {
    autoPan.active = false;
    settleBounds();
  }

  function startPointerPan(event, mode) {
    if (isBlocked()) return false;
    if (!pointInsideHero(event.clientX, event.clientY)) return false;
    if (isFixedUiEvent(event)) return false;

    event.preventDefault();
    event.stopPropagation();

    panState = {
      pointerId: event.pointerId,
      mode,
      lastX: event.clientX,
      lastY: event.clientY
    };
    interactionRoot.classList.add('is-camera-panning');
    try { interactionRoot.setPointerCapture?.(event.pointerId); } catch {}
    debugInteraction('pointerdown', event, { mode });
    return true;
  }

  function movePointerPan(event) {
    if (!panState || event.pointerId !== panState.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - panState.lastX;
    const dy = event.clientY - panState.lastY;
    panState.lastX = event.clientX;
    panState.lastY = event.clientY;
    panByScreen(dx, dy, { immediate: true, elastic: true });
  }

  function endPointerPan(event, reason = 'pointerup', releaseCapture = true) {
    if (!panState || (event?.pointerId != null && event.pointerId !== panState.pointerId)) return false;
    const pointerId = panState.pointerId;
    panState = null;
    interactionRoot.classList.remove('is-camera-panning');
    if (releaseCapture) {
      try {
        if (interactionRoot.hasPointerCapture?.(pointerId)) interactionRoot.releasePointerCapture(pointerId);
      } catch {}
    }
    settleBounds();
    debugInteraction(reason, event, { pointerId });
    return true;
  }

  function cancelInteraction(reason, pointerId = null) {
    if (panState && (pointerId == null || panState.pointerId === pointerId)) {
      endPointerPan(null, reason, true);
    }
    if (reason !== 'pointerup') {
      spaceDown = false;
      touchState = null;
      autoPan.active = false;
      interactionRoot.classList.remove('is-camera-space', 'is-camera-panning');
    }
    notifyCancelHandlers(reason, pointerId);
    debugInteraction(`cancel:${reason}`, null, { pointerId });
  }

  interactionRoot.addEventListener('pointerenter', () => {
    lastPointer.inside = true;
  }, { passive: true });

  interactionRoot.addEventListener('pointerleave', () => {
    if (!panState) lastPointer.inside = false;
  }, { passive: true });

  interactionRoot.addEventListener('pointermove', event => {
    lastPointer.inside = true;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    lastPointer.target = event.target;
    movePointerPan(event);
  }, { passive: false, capture: true });

  interactionRoot.addEventListener('pointerdown', event => {
    lastPointer.inside = true;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    lastPointer.target = event.target;
    debugInteraction('pointerdown', event);
    if (event.button === 1) {
      startPointerPan(event, 'middle');
      return;
    }
    if (event.button === 0 && spaceDown && !isTextInput(event.target)) {
      startPointerPan(event, 'space');
    }
  }, { capture: true });

  interactionRoot.addEventListener('pointerup', event => {
    endPointerPan(event, 'pointerup', true);
    debugInteraction('pointerup', event);
    window.setTimeout(() => notifyCancelHandlers('pointerup', event.pointerId), 0);
  }, { capture: true });

  interactionRoot.addEventListener('pointercancel', event => {
    endPointerPan(event, 'pointercancel', false);
    debugInteraction('pointercancel', event);
    window.setTimeout(() => cancelInteraction('pointercancel', event.pointerId), 0);
  }, { capture: true });

  interactionRoot.addEventListener('lostpointercapture', event => {
    debugInteraction('lostpointercapture', event);
    if (event.target === interactionRoot || panState?.pointerId === event.pointerId) {
      if (panState?.pointerId === event.pointerId) endPointerPan(event, 'lostpointercapture', false);
      cancelInteraction('lostpointercapture', event.pointerId);
      return;
    }

    // Child nodes and ports legitimately release their own capture during pointerup.
    // Defer cleanup so their normal pointerup finalizer can commit drag/connection first.
    window.setTimeout(() => notifyCancelHandlers('lostpointercapture', event.pointerId), 0);
  }, { capture: true });

  interactionRoot.addEventListener('auxclick', event => {
    if (event.button !== 1) return;
    if (!pointInsideHero(event.clientX, event.clientY)) return;
    if (isFixedUiEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    debugInteraction('auxclick', event);
  }, { capture: true });

  interactionRoot.addEventListener('wheel', event => {
    if (isBlocked() || isFixedUiEvent(event)) return;
    if (!pointInsideHero(event.clientX, event.clientY)) return;

    event.preventDefault();

    const sensitivity = event.ctrlKey ? 0.004 : 0.0016;
    const factor = Math.exp(-event.deltaY * sensitivity);
    const baseScale = target.scale;
    zoomAt(event.clientX, event.clientY, baseScale * factor, { immediate: false });
    debugInteraction('wheel', event, { ctrlKey: event.ctrlKey, nextScale: target.scale });
  }, { passive: false, capture: true });

  function touchPoint(touch) {
    return { x: touch.clientX, y: touch.clientY };
  }

  function touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function touchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) * 0.5,
      y: (a.clientY + b.clientY) * 0.5
    };
  }

  interactionRoot.addEventListener('touchstart', event => {
    if (isBlocked() || isFixedUiTarget(event.target)) return;

    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      const center = touchCenter(a, b);
      touchState = {
        type: 'pinch',
        startDistance: Math.max(1, touchDistance(a, b)),
        startScale: current.scale,
        lastCenter: center,
        activePan: true
      };
      event.preventDefault();
      return;
    }

    if (event.touches.length !== 1 || isInteractiveCanvasTarget(event.target)) return;

    const point = touchPoint(event.touches[0]);
    touchState = {
      type: 'pan',
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
      activePan: false
    };
  }, { passive: false, capture: true });

  interactionRoot.addEventListener('touchmove', event => {
    if (!touchState || isBlocked()) return;

    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      const center = touchCenter(a, b);
      if (touchState.type !== 'pinch') {
        touchState = {
          type: 'pinch',
          startDistance: Math.max(1, touchDistance(a, b)),
          startScale: current.scale,
          lastCenter: center,
          activePan: true
        };
      }
      event.preventDefault();

      const nextDistance = Math.max(1, touchDistance(a, b));
      const nextScale = clamp(
        touchState.startScale * (nextDistance / touchState.startDistance),
        CONFIG.minScale,
        CONFIG.maxScale
      );

      const dx = center.x - touchState.lastCenter.x;
      const dy = center.y - touchState.lastCenter.y;
      if (dx || dy) panByScreen(dx, dy, { immediate: true, elastic: true });
      zoomAt(center.x, center.y, nextScale, { immediate: true });
      touchState.lastCenter = center;
      return;
    }

    if (event.touches.length !== 1 || touchState.type !== 'pan') return;
    const point = touchPoint(event.touches[0]);
    const total = Math.hypot(point.x - touchState.startX, point.y - touchState.startY);
    if (!touchState.moved && total < 8) return;

    touchState.moved = true;
    touchState.activePan = true;
    event.preventDefault();

    const dx = point.x - touchState.lastX;
    const dy = point.y - touchState.lastY;
    touchState.lastX = point.x;
    touchState.lastY = point.y;
    panByScreen(dx, dy, { immediate: true, elastic: true });
  }, { passive: false, capture: true });

  function endTouch() {
    if (!touchState) return;
    const wasActive = touchState.activePan;
    touchState = null;
    if (wasActive) settleBounds();
  }

  interactionRoot.addEventListener('touchend', endTouch, { passive: true, capture: true });
  interactionRoot.addEventListener('touchcancel', endTouch, { passive: true, capture: true });

  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !isTextInput(event.target)) {
      const canvasFocused = document.activeElement === stage;
      const pointerInCanvas = (
        lastPointer.inside
        && pointInsideHero(lastPointer.x, lastPointer.y)
        && !isFixedUiTarget(lastPointer.target)
      );
      if (!isBlocked() && (canvasFocused || pointerInCanvas)) {
        event.preventDefault();
        spaceDown = true;
        interactionRoot.classList.add('is-camera-space');
      }
    }

    if (event.key === 'Escape' && !isTextInput(event.target)) cancelInteraction('escape');

    if (document.activeElement !== stage || isBlocked()) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      panByScreen(CONFIG.keyboardPan, 0, { immediate: false, elastic: false });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      panByScreen(-CONFIG.keyboardPan, 0, { immediate: false, elastic: false });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      panByScreen(0, CONFIG.keyboardPan, { immediate: false, elastic: false });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      panByScreen(0, -CONFIG.keyboardPan, { immediate: false, elastic: false });
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      const rect = hero.getBoundingClientRect();
      zoomAt(rect.left + width * 0.5, rect.top + height * 0.5, target.scale * 1.12);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      const rect = hero.getBoundingClientRect();
      zoomAt(rect.left + width * 0.5, rect.top + height * 0.5, target.scale / 1.12);
    } else if (event.key === '0') {
      event.preventDefault();
      recenter({ animate: !reducedMotion.matches });
    }
  });

  document.addEventListener('keyup', event => {
    if (event.code !== 'Space') return;
    spaceDown = false;
    interactionRoot.classList.remove('is-camera-space');
    if (panState?.mode === 'space') endPointerPan(null, 'space-keyup', true);
  });

  window.addEventListener('blur', () => {
    lastPointer.inside = false;
    cancelInteraction('window-blur');
  });

  function refreshGeometry({ recenterView = true } = {}) {
    heroRect = hero.getBoundingClientRect();
    width = Math.max(1, hero.clientWidth || heroRect.width);
    height = Math.max(1, hero.clientHeight || heroRect.height);
    world = makeWorldBounds(width, height);

    if (recenterView) {
      current = {
        cx: width * 0.5,
        cy: height * 0.5,
        scale: 1
      };
      target = { ...current };
    } else {
      current = clampCamera(current);
      target = clampCamera(target);
    }

    applyTransform({ dispatch: false });
    measureStageOrigin();
    applyTransform();
  }

  const resizeObserver = new ResizeObserver(() => {
    refreshGeometry({ recenterView: false });
  });
  resizeObserver.observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastPointer.inside = false;
      cancelInteraction('visibilitychange');
      return;
    }
    applyTransform();
  });

  const blockedUiObserver = new MutationObserver(() => {
    if (isBlocked()) cancelInteraction('blocked-ui');
  });
  blockedUiObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function getState() {
    return {
      cx: current.cx,
      cy: current.cy,
      scale: current.scale,
      targetCx: target.cx,
      targetCy: target.cy,
      targetScale: target.scale,
      width,
      height,
      world: { ...world },
      stageOrigin: { ...stageOrigin },
      panning: Boolean(panState || touchState?.activePan),
      autoPanning: autoPan.active,
      isDefault: isDefaultView()
    };
  }

  window.DeushimaWorkspaceInteraction = Object.freeze({
    root: interactionRoot,
    debugEnabled: interactionDebugEnabled,
    eventPath,
    pathMatches,
    isFixedUiEvent,
    isFixedUiTarget,
    pointInside: pointInsideHero,
    debug: debugInteraction,
    registerCancelHandler,
    cancel: cancelInteraction,
    getState: () => ({
      isPanning: Boolean(panState),
      pointerId: panState?.pointerId ?? null,
      mode: panState?.mode ?? null,
      spaceDown,
      blocked: isBlocked()
    })
  });

  if (interactionDebugEnabled) {
    console.info('[interaction] init', {
      userAgent: navigator.userAgent,
      root: describeTarget(interactionRoot),
      rootFound: Boolean(interactionRoot),
      state: window.DeushimaWorkspaceInteraction.getState()
    });
  }

  window.DeushimaHeroCamera = Object.freeze({
    config: CONFIG,
    getState,
    getWorldBounds: () => ({ ...world }),
    getStageOrigin,
    screenToWorld,
    worldToScreen,
    worldToStage,
    stageToWorld,
    panByScreen,
    zoomAt,
    recenter,
    isDefaultView,
    setAutoPanPointer,
    clearAutoPan,
    refreshGeometry
  });

  refreshGeometry({ recenterView: true });
})();
