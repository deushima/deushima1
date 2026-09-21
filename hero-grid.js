(() => {
  'use strict';

  const urlGridStyle = new URLSearchParams(window.location.search).get('grid');
  const GRID_STYLE = urlGridStyle === 'tiles' ? 'tiles' : 'dots';

  const GRID_CONFIG = Object.freeze({
    style: GRID_STYLE,
    spacingDesktop: 64,
    spacingMobile: 48,
    dotRadius: 1.6,
    dotRadiusActive: 2.6,
    lineWidth: 1,
    tileGap: 6,
    tileRadiusMin: 2,
    nodeFalloff: 140,
    nodeMaxShift: 26,
    cursorRadius: 160,
    cursorForce: 14,
    lerp: 0.14,
    settleThreshold: 0.08,
    desktopDprMax: 2,
    mobileDprMax: 1.5,
    mobileBreakpoint: 1023,
    vignetteFloor: 0.4,
    vignetteReach: 0.26,
    revealDuration: 1200,
    revealWaveShare: 0.56,
    nodesRevealDelay: 320,
    linesRevealDelay: 420,
    linesRevealDuration: 700,
    wakeAfterPointerMs: 180,
    wakeAfterDragMs: 420,
    recoveryInterval: 2500,
    nodeRadiusFallback: 24,
    lodMinScreenSpacing: 24,
    lodMaxScreenSpacing: 96
  });

  window.DeushimaGridConfig = GRID_CONFIG;
  window.GRID_CONFIG = GRID_CONFIG;
  window.GRID_STYLE = GRID_STYLE;

  const hero = document.querySelector('.hero--node-canvas');
  const canvas = hero?.querySelector('[data-node-grid]');
  const stage = hero?.querySelector('[data-hero-node-stage]');
  const originalNodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  const backgroundVideo = hero?.querySelector('[data-hero-video]');
  if (!hero || !canvas || !stage || !originalNodes.length) return;

  const ctx = canvas.getContext('2d', {
    alpha: true,
    desynchronized: true
  });
  if (!ctx) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia(`(max-width: ${GRID_CONFIG.mobileBreakpoint}px)`);
  const coarsePointerQuery = window.matchMedia('(pointer: coarse)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let canvasRectLeft = 0;
  let canvasRectTop = 0;

  let dotColor = 'rgba(255,255,255,.22)';
  let lineColor = 'rgba(255,255,255,.045)';
  let tileColor = 'rgba(255,255,255,.055)';

  let pointerClientX = -9999;
  let pointerClientY = -9999;
  let pointerInside = false;
  let pointerDownOnNode = false;
  let lastPointerAt = 0;

  let raf = 0;
  let activeUntil = 0;
  let hidden = document.hidden;
  let contextLost = false;
  let lastDrawAt = 0;
  let drawCount = 0;
  let recoveryCount = 0;
  let frameId = 0;

  let introStarted = false;
  let introStart = 0;
  let introComplete = false;
  let nodeRevealTimer = 0;

  let effectiveSpacing = GRID_CONFIG.spacingDesktop;
  let visibleCols = 0;
  let visibleRows = 0;
  let visibleCount = 0;
  let startCol = 0;
  let startRow = 0;

  let screenX = new Float32Array(0);
  let screenY = new Float32Array(0);
  let intensity = new Float32Array(0);
  let reveal = new Float32Array(0);

  let nodeRects = new Float32Array((originalNodes.length + 20) * 5);
  let nodeRectCount = 0;

  // Persistent warp offsets keyed by world-grid coordinate. Entries are only
  // created when a point first enters the viewport and are pruned later.
  const warpState = new Map();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep01(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function isMobile() {
    return mobileQuery.matches;
  }

  function isReducedMotion() {
    return reducedMotionQuery.matches;
  }

  function cameraApi() {
    return window.DeushimaHeroCamera || null;
  }

  function cameraState() {
    return cameraApi()?.getState?.() || {
      cx: width * 0.5,
      cy: height * 0.5,
      scale: 1,
      width,
      height
    };
  }

  function refreshColors() {
    const styles = getComputedStyle(hero);
    dotColor = styles.getPropertyValue('--grid-dot').trim() || 'rgba(255,255,255,.22)';
    lineColor = styles.getPropertyValue('--grid-line').trim() || 'rgba(255,255,255,.045)';
    tileColor = styles.getPropertyValue('--grid-tile').trim() || 'rgba(255,255,255,.055)';
  }

  function ensureCapacity(count) {
    if (screenX.length >= count) return;
    let capacity = Math.max(256, screenX.length || 256);
    while (capacity < count) capacity *= 2;
    screenX = new Float32Array(capacity);
    screenY = new Float32Array(capacity);
    intensity = new Float32Array(capacity);
    reveal = new Float32Array(capacity);
  }

  function resize(force = false) {
    const rect = hero.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(hero.clientWidth || rect.width));
    const nextHeight = Math.max(1, Math.round(hero.clientHeight || rect.height));
    const nextDpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile() ? GRID_CONFIG.mobileDprMax : GRID_CONFIG.desktopDprMax
    );

    canvasRectLeft = rect.left;
    canvasRectTop = rect.top;

    const changed = (
      force
      || width !== nextWidth
      || height !== nextHeight
      || dpr !== nextDpr
    );

    if (!changed) {
      wake(180);
      return;
    }

    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refreshColors();
    warpState.clear();
    wake(700);
  }

  function getWarpNodes() {
    return [
      ...originalNodes,
      ...stage.querySelectorAll('[data-grid-node="dynamic"]')
    ].slice(0, originalNodes.length + 20);
  }

  function updateNodeRects(scale) {
    const nodes = getWarpNodes();
    nodeRectCount = nodes.length;

    const required = nodeRectCount * 5;
    if (nodeRects.length < required) {
      nodeRects = new Float32Array(required);
    }

    const camera = cameraApi();
    const heroRect = hero.getBoundingClientRect();

    for (let index = 0; index < nodeRectCount; index += 1) {
      const node = nodes[index];
      const rect = node.getBoundingClientRect();
      const centerClientX = rect.left + rect.width * 0.5;
      const centerClientY = rect.top + rect.height * 0.5;
      const worldPoint = camera?.screenToWorld
        ? camera.screenToWorld(centerClientX, centerClientY)
        : {
            x: centerClientX - heroRect.left,
            y: centerClientY - heroRect.top
          };

      const offset = index * 5;
      const cssRadius = parseFloat(getComputedStyle(node).borderRadius) || GRID_CONFIG.nodeRadiusFallback;
      nodeRects[offset] = worldPoint.x;
      nodeRects[offset + 1] = worldPoint.y;
      nodeRects[offset + 2] = rect.width * 0.5 / scale;
      nodeRects[offset + 3] = rect.height * 0.5 / scale;
      nodeRects[offset + 4] = Math.min(
        cssRadius / scale,
        nodeRects[offset + 2],
        nodeRects[offset + 3]
      );
    }
  }

  function computeSpacing(scale) {
    let worldSpacing = isMobile() ? GRID_CONFIG.spacingMobile : GRID_CONFIG.spacingDesktop;
    let screenSpacing = worldSpacing * scale;

    while (screenSpacing < GRID_CONFIG.lodMinScreenSpacing) {
      worldSpacing *= 2;
      screenSpacing = worldSpacing * scale;
    }

    while (screenSpacing > GRID_CONFIG.lodMaxScreenSpacing && worldSpacing > 8) {
      worldSpacing *= 0.5;
      screenSpacing = worldSpacing * scale;
    }

    return worldSpacing;
  }

  function visibleWorldBounds() {
    const camera = cameraApi();
    if (camera?.screenToWorld) {
      const rect = hero.getBoundingClientRect();
      const a = camera.screenToWorld(rect.left, rect.top);
      const b = camera.screenToWorld(rect.right, rect.bottom);
      return {
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y)
      };
    }

    const state = cameraState();
    const halfW = width / (2 * state.scale);
    const halfH = height / (2 * state.scale);
    return {
      minX: state.cx - halfW,
      maxX: state.cx + halfW,
      minY: state.cy - halfH,
      maxY: state.cy + halfH
    };
  }

  function localScreenPoint(worldX, worldY) {
    const camera = cameraApi();
    if (camera?.worldToScreen) {
      const point = camera.worldToScreen(worldX, worldY);
      return {
        x: point.x - canvasRectLeft,
        y: point.y - canvasRectTop
      };
    }
    return { x: worldX, y: worldY };
  }

  function vignetteAtScreen(x, y) {
    const edgeX = Math.min(x / Math.max(width, 1), 1 - x / Math.max(width, 1));
    const edgeY = Math.min(y / Math.max(height, 1), 1 - y / Math.max(height, 1));
    const edge = clamp(Math.min(edgeX, edgeY) / GRID_CONFIG.vignetteReach, 0, 1);
    return GRID_CONFIG.vignetteFloor + (1 - GRID_CONFIG.vignetteFloor) * smoothstep01(edge);
  }

  function stateKey(spacingValue, col, row) {
    return `${spacingValue}:${col}:${row}`;
  }

  function getWarpEntry(key) {
    let entry = warpState.get(key);
    if (!entry) {
      entry = new Float32Array(4);
      warpState.set(key, entry);
    }
    entry[3] = frameId;
    return entry;
  }

  function pointWarp(worldX, worldY, scale, cursorWorld, cursorEnabled, entry) {
    const falloff = GRID_CONFIG.nodeFalloff / scale;
    const maxShift = GRID_CONFIG.nodeMaxShift / scale;
    const cursorRadius = GRID_CONFIG.cursorRadius / scale;
    const cursorForce = GRID_CONFIG.cursorForce / scale;

    let pushX = 0;
    let pushY = 0;
    let proximity = 0;

    for (let nodeIndex = 0; nodeIndex < nodeRectCount; nodeIndex += 1) {
      const offset = nodeIndex * 5;
      const cx = nodeRects[offset];
      const cy = nodeRects[offset + 1];
      const halfW = nodeRects[offset + 2];
      const halfH = nodeRects[offset + 3];
      const radius = nodeRects[offset + 4];

      const localX = worldX - cx;
      const localY = worldY - cy;
      const qx = Math.abs(localX) - Math.max(0, halfW - radius);
      const qy = Math.abs(localY) - Math.max(0, halfH - radius);
      const outsideX = Math.max(qx, 0);
      const outsideY = Math.max(qy, 0);
      const signedDistance = Math.hypot(outsideX, outsideY)
        + Math.min(Math.max(qx, qy), 0)
        - radius;

      if (signedDistance >= falloff) continue;

      const influence = smoothstep01(
        1 - clamp(Math.max(0, signedDistance) / Math.max(0.001, falloff), 0, 1)
      );
      proximity = Math.max(proximity, influence);

      let directionX = localX;
      let directionY = localY;
      let length = Math.hypot(directionX, directionY);
      if (length < 0.001) {
        directionX = 1;
        directionY = 0;
        length = 1;
      }

      const shift = maxShift * influence;
      pushX += directionX / length * shift;
      pushY += directionY / length * shift;
    }

    const totalShift = Math.hypot(pushX, pushY);
    if (totalShift > maxShift) {
      const ratio = maxShift / totalShift;
      pushX *= ratio;
      pushY *= ratio;
    }

    if (cursorEnabled && cursorWorld) {
      const dx = worldX - cursorWorld.x;
      const dy = worldY - cursorWorld.y;
      const distance = Math.hypot(dx, dy);
      if (distance < cursorRadius && distance > 0.001) {
        const influence = smoothstep01(1 - distance / cursorRadius);
        const shift = cursorForce * influence;
        pushX += dx / distance * shift;
        pushY += dy / distance * shift;
        proximity = Math.max(proximity, influence * 0.85);
      }
    }

    const lerp = isReducedMotion() ? 1 : GRID_CONFIG.lerp;
    const oldDx = entry[0];
    const oldDy = entry[1];
    entry[0] += (pushX - entry[0]) * lerp;
    entry[1] += (pushY - entry[1]) * lerp;
    entry[2] += (proximity - entry[2]) * lerp;

    return {
      dx: entry[0],
      dy: entry[1],
      intensity: entry[2],
      unsettled: (
        Math.abs(pushX - oldDx) > GRID_CONFIG.settleThreshold / scale
        || Math.abs(pushY - oldDy) > GRID_CONFIG.settleThreshold / scale
      )
    };
  }

  function prepareVisiblePoints(now) {
    const state = cameraState();
    const scale = Math.max(0.001, state.scale);
    const bounds = visibleWorldBounds();

    effectiveSpacing = computeSpacing(scale);
    startCol = Math.floor(bounds.minX / effectiveSpacing) - 1;
    const endCol = Math.ceil(bounds.maxX / effectiveSpacing) + 1;
    startRow = Math.floor(bounds.minY / effectiveSpacing) - 1;
    const endRow = Math.ceil(bounds.maxY / effectiveSpacing) + 1;

    visibleCols = Math.max(2, endCol - startCol + 1);
    visibleRows = Math.max(2, endRow - startRow + 1);
    visibleCount = visibleCols * visibleRows;
    ensureCapacity(visibleCount);

    updateNodeRects(scale);

    const camera = cameraApi();
    const cursorEnabled = (
      !isMobile()
      && !coarsePointerQuery.matches
      && pointerInside
      && !isReducedMotion()
    );
    const cursorWorld = cursorEnabled && camera?.screenToWorld
      ? camera.screenToWorld(pointerClientX, pointerClientY)
      : null;

    const elapsed = introStarted ? now - introStart : 0;
    const introProgress = introComplete
      ? 1
      : clamp(elapsed / GRID_CONFIG.revealDuration, 0, 1);
    const maxDistance = Math.hypot(width * 0.5, height * 0.5) || 1;

    let unsettled = false;
    let index = 0;

    for (let row = startRow; row <= endRow; row += 1) {
      const worldY = row * effectiveSpacing;
      for (let col = startCol; col <= endCol; col += 1) {
        const worldX = col * effectiveSpacing;
        const entry = getWarpEntry(stateKey(effectiveSpacing, col, row));
        const warp = pointWarp(worldX, worldY, scale, cursorWorld, cursorEnabled, entry);
        const point = localScreenPoint(worldX + warp.dx, worldY + warp.dy);

        screenX[index] = point.x;
        screenY[index] = point.y;
        intensity[index] = warp.intensity;
        unsettled = unsettled || warp.unsettled;

        if (!introComplete && !isReducedMotion()) {
          const basePoint = localScreenPoint(worldX, worldY);
          const distance = Math.hypot(basePoint.x - width * 0.5, basePoint.y - height * 0.5);
          const waveDelay = (distance / maxDistance) * GRID_CONFIG.revealWaveShare;
          const localProgress = clamp(
            (introProgress - waveDelay) / Math.max(0.001, 1 - waveDelay),
            0,
            1
          );
          reveal[index] = 1 - Math.pow(1 - localProgress, 3);
        } else {
          reveal[index] = 1;
        }

        index += 1;
      }
    }

    if (!introComplete && (introProgress >= 1 || isReducedMotion())) {
      introComplete = true;
      stage.classList.add('is-grid-nodes-visible');
      stage.classList.remove('is-grid-intro-active');
    }

    return { unsettled, scale };
  }

  function drawLines() {
    ctx.lineWidth = GRID_CONFIG.lineWidth;
    ctx.strokeStyle = lineColor;
    ctx.lineCap = 'round';

    for (let row = 0; row < visibleRows; row += 1) {
      for (let col = 0; col < visibleCols; col += 1) {
        const index = row * visibleCols + col;
        const sourceReveal = reveal[index];
        if (sourceReveal <= 0.002) continue;

        if (col + 1 < visibleCols) {
          const next = index + 1;
          const alpha = Math.min(sourceReveal, reveal[next])
            * Math.min(
              vignetteAtScreen(screenX[index], screenY[index]),
              vignetteAtScreen(screenX[next], screenY[next])
            )
            * (0.8 + Math.max(intensity[index], intensity[next]) * 0.2);

          if (alpha > 0.002) {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(screenX[index], screenY[index]);
            ctx.lineTo(screenX[next], screenY[next]);
            ctx.stroke();
          }
        }

        if (row + 1 < visibleRows) {
          const next = index + visibleCols;
          const alpha = Math.min(sourceReveal, reveal[next])
            * Math.min(
              vignetteAtScreen(screenX[index], screenY[index]),
              vignetteAtScreen(screenX[next], screenY[next])
            )
            * (0.8 + Math.max(intensity[index], intensity[next]) * 0.2);

          if (alpha > 0.002) {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(screenX[index], screenY[index]);
            ctx.lineTo(screenX[next], screenY[next]);
            ctx.stroke();
          }
        }
      }
    }
  }

  function drawDots(scale) {
    ctx.fillStyle = dotColor;
    const zoomRadius = Math.pow(scale, 0.12);

    for (let index = 0; index < visibleCount; index += 1) {
      const pointReveal = reveal[index];
      if (pointReveal <= 0.002) continue;

      const proximity = intensity[index];
      const radius = (
        GRID_CONFIG.dotRadius
        + (GRID_CONFIG.dotRadiusActive - GRID_CONFIG.dotRadius) * proximity
      ) * zoomRadius * (0.58 + pointReveal * 0.42);

      const alpha = pointReveal
        * vignetteAtScreen(screenX[index], screenY[index])
        * (0.7 + proximity * 0.3);

      if (alpha <= 0.002) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(screenX[index], screenY[index], radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundedRectPath(x, y, widthValue, heightValue, radiusValue) {
    const radius = Math.min(radiusValue, widthValue * 0.5, heightValue * 0.5);
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, widthValue, heightValue, radius);
      return;
    }

    const right = x + widthValue;
    const bottom = y + heightValue;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(right - radius, y);
    ctx.quadraticCurveTo(right, y, right, y + radius);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    ctx.lineTo(x + radius, bottom);
    ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function drawTiles(scale) {
    const screenSpacing = effectiveSpacing * scale;
    const size = Math.max(8, screenSpacing - GRID_CONFIG.tileGap);
    ctx.fillStyle = tileColor;

    for (let index = 0; index < visibleCount; index += 1) {
      const pointReveal = reveal[index];
      if (pointReveal <= 0.002) continue;

      const proximity = intensity[index];
      const cornerRadius = GRID_CONFIG.tileRadiusMin
        + (size * 0.5 - GRID_CONFIG.tileRadiusMin) * proximity;
      const scaledSize = size * (0.92 + pointReveal * 0.08);
      const alpha = pointReveal
        * vignetteAtScreen(screenX[index], screenY[index])
        * (0.72 + proximity * 0.28);

      if (alpha <= 0.002) continue;
      ctx.globalAlpha = alpha;
      roundedRectPath(
        screenX[index] - scaledSize * 0.5,
        screenY[index] - scaledSize * 0.5,
        scaledSize,
        scaledSize,
        cornerRadius
      );
      ctx.fill();
    }
  }

  function pruneWarpState() {
    if (frameId % 120 !== 0 || warpState.size < 1500) return;
    const threshold = frameId - 240;
    for (const [key, entry] of warpState) {
      if (entry[3] < threshold) warpState.delete(key);
    }
  }

  function draw(now) {
    if (contextLost || hidden) {
      raf = 0;
      return;
    }

    raf = 0;
    frameId += 1;
    lastDrawAt = now;
    drawCount += 1;

    ctx.clearRect(0, 0, width, height);
    const prepared = prepareVisiblePoints(now);

    if (GRID_STYLE === 'tiles') {
      drawTiles(prepared.scale);
    } else {
      drawLines();
      drawDots(prepared.scale);
    }

    ctx.globalAlpha = 1;

    const lineProgress = isReducedMotion()
      ? 1
      : clamp(
          (now - introStart - GRID_CONFIG.linesRevealDelay) / GRID_CONFIG.linesRevealDuration,
          0,
          1
        );
    stage.style.setProperty(
      '--line-draw-progress',
      (1 - Math.pow(1 - lineProgress, 3)).toFixed(4)
    );

    pruneWarpState();

    const shouldContinue = (
      !hidden
      && (
        !introComplete
        || prepared.unsettled
        || pointerDownOnNode
        || performance.now() < activeUntil
        || performance.now() - lastPointerAt < GRID_CONFIG.wakeAfterPointerMs
      )
    );

    if (shouldContinue) raf = requestAnimationFrame(draw);
  }

  function wake(duration = 260) {
    activeUntil = Math.max(activeUntil, performance.now() + duration);
    if (!raf && !hidden) raf = requestAnimationFrame(draw);
  }

  function startIntro() {
    if (introStarted) return;
    introStarted = true;
    introStart = performance.now();
    introComplete = isReducedMotion();

    hero.classList.add('is-grid-started');
    stage.classList.add('is-grid-intro-active');
    stage.style.setProperty('--line-draw-progress', introComplete ? '1' : '0');

    if (introComplete) {
      stage.classList.add('is-grid-nodes-visible');
      stage.classList.remove('is-grid-intro-active');
    } else {
      nodeRevealTimer = window.setTimeout(() => {
        stage.classList.add('is-grid-nodes-visible');
      }, GRID_CONFIG.nodesRevealDelay);
    }

    wake(GRID_CONFIG.revealDuration + 180);
  }

  function isSceneReady() {
    return (
      document.body.classList.contains('is-site-ready')
      && !document.documentElement.classList.contains('has-studio-splash')
    );
  }

  function ensureBackgroundVideo() {
    if (
      !backgroundVideo
      || hidden
      || isReducedMotion()
      || !isSceneReady()
      || !backgroundVideo.paused
    ) return;

    const playPromise = backgroundVideo.play();
    playPromise?.catch?.(() => {});
  }

  function recoverScene(forcePaint = false) {
    hidden = document.hidden;
    if (hidden || contextLost || !isSceneReady()) return false;

    const rect = hero.getBoundingClientRect();
    const expectedWidth = Math.max(1, Math.round(hero.clientWidth || rect.width));
    const expectedHeight = Math.max(1, Math.round(hero.clientHeight || rect.height));
    const expectedDpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile() ? GRID_CONFIG.mobileDprMax : GRID_CONFIG.desktopDprMax
    );

    const invalid = (
      width !== expectedWidth
      || height !== expectedHeight
      || canvas.width !== Math.max(1, Math.round(expectedWidth * expectedDpr))
      || canvas.height !== Math.max(1, Math.round(expectedHeight * expectedDpr))
    );

    if (invalid) {
      recoveryCount += 1;
      resize(true);
    } else {
      canvasRectLeft = rect.left;
      canvasRectTop = rect.top;
    }

    if (!introStarted) startIntro();
    else hero.classList.add('is-grid-started');

    if (introComplete) {
      stage.classList.add('is-grid-nodes-visible');
      stage.classList.remove('is-grid-intro-active');
      stage.style.setProperty('--line-draw-progress', '1');
    }

    if (forcePaint) {
      recoveryCount += 1;
      wake(180);
    }

    ensureBackgroundVideo();
    return true;
  }

  hero.addEventListener('pointermove', event => {
    if (isMobile() || coarsePointerQuery.matches || isReducedMotion()) return;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    pointerInside = true;
    lastPointerAt = performance.now();
    wake(220);
  }, { passive: true });

  hero.addEventListener('pointerleave', () => {
    pointerInside = false;
    pointerClientX = -9999;
    pointerClientY = -9999;
    wake(260);
  }, { passive: true });

  stage.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('[data-hero-node], [data-custom-node]')) return;
    pointerDownOnNode = true;
    wake(700);
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    if (!pointerDownOnNode) return;
    pointerDownOnNode = false;
    wake(GRID_CONFIG.wakeAfterDragMs);
  }, { passive: true });

  window.addEventListener('pointercancel', () => {
    pointerDownOnNode = false;
    wake(GRID_CONFIG.wakeAfterDragMs);
  }, { passive: true });

  hero.addEventListener('deushima:camera-change', () => {
    wake(220);
  });

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    recoverScene(true);
  });

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(hero);

  reducedMotionQuery.addEventListener?.('change', () => {
    window.clearTimeout(nodeRevealTimer);
    if (isReducedMotion()) {
      introComplete = true;
      stage.classList.add('is-grid-nodes-visible');
      stage.classList.remove('is-grid-intro-active');
      stage.style.setProperty('--line-draw-progress', '1');
    }
    resize(true);
  });

  mobileQuery.addEventListener?.('change', () => resize(true));

  const readyObserver = new MutationObserver(() => recoverScene(false));
  readyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  readyObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  canvas.addEventListener('contextlost', event => {
    event.preventDefault();
    contextLost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  });

  canvas.addEventListener('contextrestored', () => {
    contextLost = false;
    recoveryCount += 1;
    resize(true);
    recoverScene(true);
  });

  window.addEventListener('pageshow', () => recoverScene(true));
  window.addEventListener('load', () => recoverScene(true), { once: true });
  window.addEventListener('focus', () => recoverScene(true));

  backgroundVideo?.addEventListener('canplay', ensureBackgroundVideo);
  backgroundVideo?.addEventListener('loadeddata', ensureBackgroundVideo);

  window.setInterval(() => {
    if (!document.hidden) recoverScene(true);
  }, GRID_CONFIG.recoveryInterval);

  window.DeushimaGrid = Object.freeze({
    config: GRID_CONFIG,
    style: GRID_STYLE,
    getState: () => ({
      width,
      height,
      dpr,
      spacing: effectiveSpacing,
      cols: visibleCols,
      rows: visibleRows,
      points: visibleCount,
      running: Boolean(raf),
      introStarted,
      introComplete,
      pointerInside,
      contextLost,
      lastDrawAt,
      drawCount,
      recoveryCount,
      warpStates: warpState.size
    }),
    wake: (duration = 320) => wake(duration),
    refreshDynamicNodes: () => wake(700)
  });

  resize(true);
  recoverScene(false);
  window.setTimeout(() => recoverScene(true), 120);
  window.setTimeout(() => recoverScene(true), 700);
})();