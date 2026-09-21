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
    nodeRadiusFallback: 24
  });

  window.DeushimaGridConfig = GRID_CONFIG;
  window.GRID_CONFIG = GRID_CONFIG;
  window.GRID_STYLE = GRID_STYLE;

  const hero = document.querySelector('.hero--node-canvas');
  const canvas = hero?.querySelector('[data-node-grid]');
  const stage = hero?.querySelector('[data-hero-node-stage]');
  const nodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  const resetButton = stage?.querySelector('[data-node-reset]');
  if (!hero || !canvas || !stage || !nodes.length) return;

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
  let spacing = GRID_CONFIG.spacingDesktop;
  let cols = 0;
  let rows = 0;
  let count = 0;
  let baseX = new Float32Array(0);
  let baseY = new Float32Array(0);
  let currentX = new Float32Array(0);
  let currentY = new Float32Array(0);
  let targetX = new Float32Array(0);
  let targetY = new Float32Array(0);
  let intensity = new Float32Array(0);
  let reveal = new Float32Array(0);
  let nodeRects = new Float32Array(nodes.length * 5);

  let dotColor = 'rgba(255,255,255,.22)';
  let lineColor = 'rgba(255,255,255,.045)';
  let tileColor = 'rgba(255,255,255,.055)';

  let pointerX = -9999;
  let pointerY = -9999;
  let pointerInside = false;
  let pointerDownOnNode = false;
  let lastPointerAt = 0;
  let activeUntil = 0;

  let raf = 0;
  let introStarted = false;
  let introStart = 0;
  let introComplete = false;
  let nodeRevealTimer = 0;
  let hidden = document.hidden;

  let canvasRectLeft = 0;
  let canvasRectTop = 0;
  let maxDistanceFromCenter = 1;

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

  function refreshColors() {
    const styles = getComputedStyle(hero);
    dotColor = styles.getPropertyValue('--grid-dot').trim() || 'rgba(255,255,255,.22)';
    lineColor = styles.getPropertyValue('--grid-line').trim() || 'rgba(255,255,255,.045)';
    tileColor = styles.getPropertyValue('--grid-tile').trim() || 'rgba(255,255,255,.055)';
  }

  function allocateGrid() {
    spacing = isMobile() ? GRID_CONFIG.spacingMobile : GRID_CONFIG.spacingDesktop;
    cols = Math.max(2, Math.ceil(width / spacing) + 2);
    rows = Math.max(2, Math.ceil(height / spacing) + 2);
    count = cols * rows;

    baseX = new Float32Array(count);
    baseY = new Float32Array(count);
    currentX = new Float32Array(count);
    currentY = new Float32Array(count);
    targetX = new Float32Array(count);
    targetY = new Float32Array(count);
    intensity = new Float32Array(count);
    reveal = new Float32Array(count);

    const startX = (width - (cols - 1) * spacing) * 0.5;
    const startY = (height - (rows - 1) * spacing) * 0.5;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    maxDistanceFromCenter = Math.hypot(centerX + spacing, centerY + spacing) || 1;

    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      const y = startY + row * spacing;
      for (let col = 0; col < cols; col += 1) {
        const x = startX + col * spacing;
        baseX[index] = x;
        baseY[index] = y;
        currentX[index] = x;
        currentY[index] = y;
        targetX[index] = x;
        targetY[index] = y;
        reveal[index] = isReducedMotion() ? 1 : 0;
        index += 1;
      }
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvasRectLeft = rect.left;
    canvasRectTop = rect.top;

    dpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile() ? GRID_CONFIG.mobileDprMax : GRID_CONFIG.desktopDprMax
    );

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refreshColors();
    allocateGrid();
    updateNodeRects();
    wake(700);
  }

  function updateNodeRects() {
    const heroRect = hero.getBoundingClientRect();
    canvasRectLeft = heroRect.left;
    canvasRectTop = heroRect.top;

    for (let index = 0; index < nodes.length; index += 1) {
      const rect = nodes[index].getBoundingClientRect();
      const offset = index * 5;
      const radius = parseFloat(getComputedStyle(nodes[index]).borderRadius) || GRID_CONFIG.nodeRadiusFallback;
      nodeRects[offset] = rect.left - canvasRectLeft + rect.width * 0.5;
      nodeRects[offset + 1] = rect.top - canvasRectTop + rect.height * 0.5;
      nodeRects[offset + 2] = rect.width * 0.5;
      nodeRects[offset + 3] = rect.height * 0.5;
      nodeRects[offset + 4] = Math.min(radius, rect.width * 0.5, rect.height * 0.5);
    }
  }

  function vignetteAt(x, y) {
    const edgeX = Math.min(x / Math.max(width, 1), 1 - x / Math.max(width, 1));
    const edgeY = Math.min(y / Math.max(height, 1), 1 - y / Math.max(height, 1));
    const edge = clamp(Math.min(edgeX, edgeY) / GRID_CONFIG.vignetteReach, 0, 1);
    return GRID_CONFIG.vignetteFloor + (1 - GRID_CONFIG.vignetteFloor) * smoothstep01(edge);
  }

  function updateTargets(now) {
    updateNodeRects();

    const cursorEnabled = !isMobile() && !coarsePointerQuery.matches && pointerInside;
    const reduced = isReducedMotion();
    const lerp = reduced ? 1 : GRID_CONFIG.lerp;
    const entranceElapsed = introStarted ? now - introStart : 0;
    const introProgress = introComplete
      ? 1
      : clamp(entranceElapsed / GRID_CONFIG.revealDuration, 0, 1);

    let unsettled = false;

    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      const px = baseX[pointIndex];
      const py = baseY[pointIndex];

      let pushX = 0;
      let pushY = 0;
      let proximity = 0;

      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        const offset = nodeIndex * 5;
        const cx = nodeRects[offset];
        const cy = nodeRects[offset + 1];
        const halfW = nodeRects[offset + 2];
        const halfH = nodeRects[offset + 3];
        const radius = nodeRects[offset + 4];

        const localX = px - cx;
        const localY = py - cy;
        const qx = Math.abs(localX) - Math.max(0, halfW - radius);
        const qy = Math.abs(localY) - Math.max(0, halfH - radius);
        const outsideX = Math.max(qx, 0);
        const outsideY = Math.max(qy, 0);
        const signedDistance = Math.hypot(outsideX, outsideY)
          + Math.min(Math.max(qx, qy), 0)
          - radius;

        if (signedDistance >= GRID_CONFIG.nodeFalloff) continue;

        const normalizedDistance = clamp(Math.max(0, signedDistance) / GRID_CONFIG.nodeFalloff, 0, 1);
        const influence = smoothstep01(1 - normalizedDistance);
        proximity = Math.max(proximity, influence);

        let directionX = localX;
        let directionY = localY;
        let directionLength = Math.hypot(directionX, directionY);
        if (directionLength < 0.001) {
          directionX = 1;
          directionY = 0;
          directionLength = 1;
        }

        const shift = GRID_CONFIG.nodeMaxShift * influence;
        pushX += directionX / directionLength * shift;
        pushY += directionY / directionLength * shift;
      }

      const pushLength = Math.hypot(pushX, pushY);
      if (pushLength > GRID_CONFIG.nodeMaxShift) {
        const scale = GRID_CONFIG.nodeMaxShift / pushLength;
        pushX *= scale;
        pushY *= scale;
      }

      if (cursorEnabled) {
        const cursorDx = px - pointerX;
        const cursorDy = py - pointerY;
        const cursorDistance = Math.hypot(cursorDx, cursorDy);
        if (cursorDistance < GRID_CONFIG.cursorRadius && cursorDistance > 0.001) {
          const cursorInfluence = smoothstep01(1 - cursorDistance / GRID_CONFIG.cursorRadius);
          const cursorShift = GRID_CONFIG.cursorForce * cursorInfluence;
          pushX += cursorDx / cursorDistance * cursorShift;
          pushY += cursorDy / cursorDistance * cursorShift;
          proximity = Math.max(proximity, cursorInfluence * 0.85);
        }
      }

      targetX[pointIndex] = px + pushX;
      targetY[pointIndex] = py + pushY;
      intensity[pointIndex] = proximity;

      const dx = targetX[pointIndex] - currentX[pointIndex];
      const dy = targetY[pointIndex] - currentY[pointIndex];

      currentX[pointIndex] += dx * lerp;
      currentY[pointIndex] += dy * lerp;

      if (Math.abs(dx) > GRID_CONFIG.settleThreshold || Math.abs(dy) > GRID_CONFIG.settleThreshold) {
        unsettled = true;
      }

      if (!introComplete && !reduced) {
        const distanceFromCenter = Math.hypot(px - width * 0.5, py - height * 0.5);
        const waveDelay = (distanceFromCenter / maxDistanceFromCenter) * GRID_CONFIG.revealWaveShare;
        const localProgress = clamp(
          (introProgress - waveDelay) / Math.max(0.001, 1 - waveDelay),
          0,
          1
        );
        reveal[pointIndex] = 1 - Math.pow(1 - localProgress, 3);
      } else {
        reveal[pointIndex] = 1;
      }
    }

    if (!introComplete && (introProgress >= 1 || reduced)) {
      introComplete = true;
      stage.classList.add('is-grid-nodes-visible');
      stage.classList.remove('is-grid-intro-active');
    }

    return unsettled;
  }

  function drawLines() {
    ctx.lineWidth = GRID_CONFIG.lineWidth;
    ctx.strokeStyle = lineColor;
    ctx.lineCap = 'round';

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const sourceReveal = reveal[index];
        if (sourceReveal <= 0.002) continue;

        if (col + 1 < cols) {
          const next = index + 1;
          const alpha = Math.min(sourceReveal, reveal[next])
            * Math.min(vignetteAt(baseX[index], baseY[index]), vignetteAt(baseX[next], baseY[next]))
            * (0.8 + Math.max(intensity[index], intensity[next]) * 0.2);

          if (alpha > 0.002) {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(currentX[index], currentY[index]);
            ctx.lineTo(currentX[next], currentY[next]);
            ctx.stroke();
          }
        }

        if (row + 1 < rows) {
          const next = index + cols;
          const alpha = Math.min(sourceReveal, reveal[next])
            * Math.min(vignetteAt(baseX[index], baseY[index]), vignetteAt(baseX[next], baseY[next]))
            * (0.8 + Math.max(intensity[index], intensity[next]) * 0.2);

          if (alpha > 0.002) {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(currentX[index], currentY[index]);
            ctx.lineTo(currentX[next], currentY[next]);
            ctx.stroke();
          }
        }
      }
    }
  }

  function drawDots() {
    ctx.fillStyle = dotColor;

    for (let index = 0; index < count; index += 1) {
      const pointReveal = reveal[index];
      if (pointReveal <= 0.002) continue;

      const proximity = intensity[index];
      const radius = (
        GRID_CONFIG.dotRadius
        + (GRID_CONFIG.dotRadiusActive - GRID_CONFIG.dotRadius) * proximity
      ) * (0.58 + pointReveal * 0.42);

      const alpha = pointReveal
        * vignetteAt(baseX[index], baseY[index])
        * (0.7 + proximity * 0.3);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(currentX[index], currentY[index], radius, 0, Math.PI * 2);
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

  function drawTiles() {
    const size = Math.max(8, spacing - GRID_CONFIG.tileGap);
    ctx.fillStyle = tileColor;

    for (let index = 0; index < count; index += 1) {
      const pointReveal = reveal[index];
      if (pointReveal <= 0.002) continue;

      const proximity = intensity[index];
      const cornerRadius = GRID_CONFIG.tileRadiusMin
        + (size * 0.5 - GRID_CONFIG.tileRadiusMin) * proximity;
      const scaledSize = size * (0.92 + pointReveal * 0.08);
      const alpha = pointReveal
        * vignetteAt(baseX[index], baseY[index])
        * (0.72 + proximity * 0.28);

      ctx.globalAlpha = alpha;
      roundedRectPath(
        currentX[index] - scaledSize * 0.5,
        currentY[index] - scaledSize * 0.5,
        scaledSize,
        scaledSize,
        cornerRadius
      );
      ctx.fill();
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    const unsettled = updateTargets(now);

    if (GRID_STYLE === 'tiles') {
      drawTiles();
    } else {
      drawLines();
      drawDots();
    }

    ctx.globalAlpha = 1;

    const lineProgress = isReducedMotion()
      ? 1
      : clamp(
          (now - introStart - GRID_CONFIG.linesRevealDelay) / GRID_CONFIG.linesRevealDuration,
          0,
          1
        );
    stage.style.setProperty('--line-draw-progress', (1 - Math.pow(1 - lineProgress, 3)).toFixed(4));

    const shouldContinue = !hidden && (
      !introComplete
      || unsettled
      || pointerDownOnNode
      || performance.now() < activeUntil
      || performance.now() - lastPointerAt < GRID_CONFIG.wakeAfterPointerMs
    );

    if (shouldContinue) {
      raf = requestAnimationFrame(draw);
    } else {
      raf = 0;
    }
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
    stage.style.setProperty('--line-draw-progress', isReducedMotion() ? '1' : '0');

    if (isReducedMotion()) {
      stage.classList.add('is-grid-nodes-visible');
    } else {
      nodeRevealTimer = window.setTimeout(() => {
        stage.classList.add('is-grid-nodes-visible');
      }, GRID_CONFIG.nodesRevealDelay);
    }

    wake(GRID_CONFIG.revealDuration + 160);
  }

  function maybeStartIntro() {
    if (
      document.body.classList.contains('is-site-ready')
      && !document.documentElement.classList.contains('has-studio-splash')
    ) {
      startIntro();
    }
  }

  hero.addEventListener('pointermove', (event) => {
    if (isMobile() || coarsePointerQuery.matches || isReducedMotion()) return;
    pointerX = event.clientX - canvasRectLeft;
    pointerY = event.clientY - canvasRectTop;
    pointerInside = true;
    lastPointerAt = performance.now();
    wake(220);
  }, { passive: true });

  hero.addEventListener('pointerleave', () => {
    pointerInside = false;
    pointerX = -9999;
    pointerY = -9999;
    wake(260);
  }, { passive: true });

  nodes.forEach((node) => {
    node.addEventListener('pointerdown', () => {
      pointerDownOnNode = true;
      wake(700);
    }, { passive: true });
  });

  window.addEventListener('pointerup', () => {
    if (!pointerDownOnNode) return;
    pointerDownOnNode = false;
    wake(GRID_CONFIG.wakeAfterDragMs);
  }, { passive: true });

  window.addEventListener('pointercancel', () => {
    pointerDownOnNode = false;
    wake(GRID_CONFIG.wakeAfterDragMs);
  }, { passive: true });

  resetButton?.addEventListener('click', () => {
    wake(850);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    wake(320);
  });

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(hero);
  resizeObserver.observe(stage);
  nodes.forEach((node) => resizeObserver.observe(node));

  reducedMotionQuery.addEventListener?.('change', () => {
    window.clearTimeout(nodeRevealTimer);
    if (isReducedMotion()) {
      introComplete = true;
      stage.classList.add('is-grid-nodes-visible');
      stage.style.setProperty('--line-draw-progress', '1');
    }
    resize();
  });

  mobileQuery.addEventListener?.('change', resize);

  const readyObserver = new MutationObserver(maybeStartIntro);
  readyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  resize();
  maybeStartIntro();
})();
