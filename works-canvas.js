(() => {
  'use strict';

  const panel = document.querySelector('[data-panel="works"]');
  const canvasRoot = panel?.querySelector('[data-work-canvas]');
  const surface = panel?.querySelector('.content-panel__surface--works');
  const viewport = panel?.querySelector('[data-work-viewport]');
  const world = panel?.querySelector('[data-work-world]');
  const svg = panel?.querySelector('[data-work-links]');
  const gridCanvas = panel?.querySelector('[data-work-grid]');
  const backgroundVideo = panel?.querySelector('[data-work-background]');
  const rootEl = panel?.querySelector('[data-work-root]');
  const categories = panel ? [...panel.querySelectorAll('[data-work-trigger]')] : [];
  const fitButton = panel?.querySelector('[data-work-fit]');
  const resetButton = panel?.querySelector('[data-work-reset]');
  const backButton = panel?.querySelector('[data-work-back]');
  const zoomLabel = panel?.querySelector('[data-work-zoom]');
  const breadcrumbCurrent = panel?.querySelector('[data-work-breadcrumb-current]');

  if (!panel || !canvasRoot || !surface || !viewport || !world || !svg || !gridCanvas || !rootEl || categories.length !== 4) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = window.matchMedia('(max-width: 640px)');
  const tabletLayout = window.matchMedia('(max-width: 1023px)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const sharedGrid = window.DeushimaGridConfig || window.GRID_CONFIG || {};
  const CONFIG = Object.freeze({
    worldWidth: 1360,
    worldHeight: 820,
    minZoom: 0.6,
    maxZoom: 1.6,
    fitPaddingDesktop: 72,
    fitPaddingTablet: 48,
    cameraDuration: 500,
    dragThreshold: 5,
    gridSpacingDesktop: sharedGrid.spacingDesktop || 64,
    gridSpacingMobile: sharedGrid.spacingMobile || 48,
    dotRadius: sharedGrid.dotRadius || 1.6,
    dotRadiusActive: sharedGrid.dotRadiusActive || 2.6,
    nodeFalloff: sharedGrid.nodeFalloff || 140,
    nodeMaxShift: sharedGrid.nodeMaxShift || 26,
    cursorRadius: sharedGrid.cursorRadius || 160,
    cursorForce: sharedGrid.cursorForce || 14,
    lerp: sharedGrid.lerp || 0.14,
    settleThreshold: sharedGrid.settleThreshold || 0.08,
    dprDesktop: sharedGrid.desktopDprMax || 2,
    dprTablet: sharedGrid.mobileDprMax || 1.5,
    vignetteFloor: sharedGrid.vignetteFloor || 0.4,
    vignetteReach: sharedGrid.vignetteReach || 0.26,
    revealDuration: sharedGrid.revealDuration || 1200,
    recoveryInterval: sharedGrid.recoveryInterval || 2500
  });

  const BASE = [
    { x: 510, y: 175 },
    { x: 900, y: 300 },
    { x: 555, y: 590 },
    { x: 980, y: 645 }
  ];

  const CHILD_POSITIONS = [
    { x: 845, y: 145 },
    { x: 1200, y: 245 },
    { x: 870, y: 655 },
    { x: 1240, y: 605 }
  ];

  const LABELS = [
    'DEUSHIMA / 2021-2024',
    'NATIONAL & INTERNATIONAL BRANDS',
    'VISUAL DIRECTION / MARKETING',
    'PACKAGING / SOCIAL / GARMENTS / 3D'
  ];

  const rootModel = {
    el: rootEl,
    x: 155,
    y: 410,
    baseX: 155,
    baseY: 410,
    kind: 'root'
  };

  const models = categories.map((el, index) => ({
    el,
    index,
    x: BASE[index].x,
    y: BASE[index].y,
    baseX: BASE[index].x,
    baseY: BASE[index].y,
    kind: 'category'
  }));

  let childModel = null;
  let childLink = null;
  let expandedIndex = -1;
  let lastCategoryFocus = null;
  let suppressClickUntil = 0;
  let panelOpen = false;
  let sceneReady = false;
  let introStart = 0;
  let entryTimers = [];

  const camera = { x: 0, y: 0, scale: 1 };
  let cameraAnimation = 0;

  const linkRecords = [];
  const activePointers = new Map();
  let panState = null;
  let pinchState = null;

  let dragState = null;

  const grid = {
    ctx: gridCanvas.getContext('2d', { alpha: true, desynchronized: true }),
    width: 0,
    height: 0,
    dpr: 1,
    spacing: CONFIG.gridSpacingDesktop,
    count: 0,
    cols: 0,
    rows: 0,
    baseX: new Float32Array(0),
    baseY: new Float32Array(0),
    dx: new Float32Array(0),
    dy: new Float32Array(0),
    targetDx: new Float32Array(0),
    targetDy: new Float32Array(0),
    intensity: new Float32Array(0),
    reveal: new Float32Array(0),
    screenX: new Float32Array(0),
    screenY: new Float32Array(0),
    nodeRects: new Float32Array(36),
    nodeRectCount: 0,
    dotColor: 'rgba(255,255,255,.22)',
    lineColor: 'rgba(255,255,255,.045)',
    raf: 0,
    activeUntil: 0,
    introStart: 0,
    introComplete: false,
    pointerX: -9999,
    pointerY: -9999,
    pointerInside: false,
    lastPointerAt: 0,
    contextLost: false
  };

  if (!grid.ctx) {
    canvasRoot.classList.add('is-grid-fallback');
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const isMobile = () => mobileLayout.matches;
  const isTablet = () => tabletLayout.matches;

  let lastWorkHoverAt = 0;

  function playWorkSfx(soundName, options = {}) {
    const sfx = window.DeushimaSFX;
    if (!sfx?.playScoped || !sfx.getEnabled?.()) return false;

    if (soundName === 'nodeHover') {
      const now = performance.now();
      const minInterval = sfx.config?.performance?.hoverMinIntervalMs || 60;
      if (now - lastWorkHoverAt < minInterval) return false;
      lastWorkHoverAt = now;
    }

    return sfx.playScoped(soundName, options);
  }

  function getNodeSize(model) {
    return {
      width: Math.max(1, model.el.offsetWidth || model.el.getBoundingClientRect().width / Math.max(camera.scale, 0.001)),
      height: Math.max(1, model.el.offsetHeight || model.el.getBoundingClientRect().height / Math.max(camera.scale, 0.001))
    };
  }

  function renderModel(model) {
    if (isMobile()) return;
    model.el.style.setProperty('--work-node-x', `${model.x.toFixed(2)}px`);
    model.el.style.setProperty('--work-node-y', `${model.y.toFixed(2)}px`);
  }

  function renderAllModels() {
    renderModel(rootModel);
    models.forEach(renderModel);
    if (childModel) renderModel(childModel);
    updateLinks();
  }

  function applyCamera() {
    if (isMobile()) {
      world.style.transform = 'none';
      if (zoomLabel) zoomLabel.textContent = '100%';
      return;
    }
    world.style.transform = `translate3d(${camera.x.toFixed(2)}px, ${camera.y.toFixed(2)}px, 0) scale(${camera.scale.toFixed(4)})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(camera.scale * 100)}%`;
    wakeGrid(360);
  }

  function getBounds(includeChild = false) {
    const all = [rootModel, ...models];
    if (includeChild && childModel) all.push(childModel);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    all.forEach((model) => {
      const size = getNodeSize(model);
      minX = Math.min(minX, model.x - size.width * 0.5);
      minY = Math.min(minY, model.y - size.height * 0.5);
      maxX = Math.max(maxX, model.x + size.width * 0.5);
      maxY = Math.max(maxY, model.y + size.height * 0.5);
    });

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function getFitCamera(includeChild = false) {
    const rect = viewport.getBoundingClientRect();
    const bounds = getBounds(includeChild);
    const padding = isTablet() ? CONFIG.fitPaddingTablet : CONFIG.fitPaddingDesktop;
    const availableWidth = Math.max(1, rect.width - padding * 2);
    const availableHeight = Math.max(1, rect.height - padding * 2);
    const scale = clamp(
      Math.min(availableWidth / Math.max(bounds.width, 1), availableHeight / Math.max(bounds.height, 1), 1.08),
      CONFIG.minZoom,
      CONFIG.maxZoom
    );
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;
    return {
      scale,
      x: rect.width * 0.5 - centerX * scale,
      y: rect.height * 0.5 - centerY * scale
    };
  }

  function cancelCameraAnimation() {
    if (cameraAnimation) cancelAnimationFrame(cameraAnimation);
    cameraAnimation = 0;
  }

  function animateCamera(target, duration = CONFIG.cameraDuration) {
    cancelCameraAnimation();

    if (isMobile() || reducedMotion.matches || duration <= 0) {
      camera.x = target.x;
      camera.y = target.y;
      camera.scale = target.scale;
      applyCamera();
      return Promise.resolve();
    }

    const start = performance.now();
    const from = { ...camera };

    return new Promise((resolve) => {
      const frame = (now) => {
        const progress = clamp((now - start) / duration, 0, 1);
        const eased = easeOut(progress);
        camera.x = lerp(from.x, target.x, eased);
        camera.y = lerp(from.y, target.y, eased);
        camera.scale = lerp(from.scale, target.scale, eased);
        applyCamera();

        if (progress < 1) {
          cameraAnimation = requestAnimationFrame(frame);
        } else {
          cameraAnimation = 0;
          resolve();
        }
      };
      cameraAnimation = requestAnimationFrame(frame);
    });
  }

  function fitView(animate = true) {
    if (isMobile()) {
      applyCamera();
      return;
    }
    const target = getFitCamera(expandedIndex >= 0);
    animateCamera(target, animate ? CONFIG.cameraDuration : 0);
  }

  function zoomAt(clientX, clientY, nextScale) {
    if (isMobile()) return;
    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const scale = clamp(nextScale, CONFIG.minZoom, CONFIG.maxZoom);
    const worldX = (localX - camera.x) / camera.scale;
    const worldY = (localY - camera.y) / camera.scale;
    camera.x = localX - worldX * scale;
    camera.y = localY - worldY * scale;
    camera.scale = scale;
    applyCamera();
  }

  function curve(from, to) {
    const dx = to.x - from.x;
    const handle = clamp(Math.abs(dx) * 0.44, 70, 250);
    const direction = dx >= 0 ? 1 : -1;
    return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${(from.x + handle * direction).toFixed(2)} ${from.y.toFixed(2)}, ${(to.x - handle * direction).toFixed(2)} ${to.y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }

  function portPoint(model, side) {
    const size = getNodeSize(model);
    return {
      x: model.x + (side === 'out' ? size.width * 0.5 : -size.width * 0.5),
      y: model.y
    };
  }

  function createLink(from, to, key, delay = 0) {
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.dataset.workLink = key;

    const base = document.createElementNS(ns, 'path');
    base.setAttribute('class', 'work-link');
    base.setAttribute('pathLength', '1');

    const pulse = document.createElementNS(ns, 'path');
    pulse.setAttribute('class', 'work-link__pulse');
    pulse.setAttribute('pathLength', '1');

    const flareFrom = document.createElementNS(ns, 'rect');
    flareFrom.setAttribute('class', 'work-link-flare');
    flareFrom.setAttribute('width', '2');
    flareFrom.setAttribute('height', '18');

    const flareTo = document.createElementNS(ns, 'rect');
    flareTo.setAttribute('class', 'work-link-flare');
    flareTo.setAttribute('width', '2');
    flareTo.setAttribute('height', '18');

    group.append(base, pulse, flareFrom, flareTo);
    svg.appendChild(group);

    const record = { key, from, to, group, base, pulse, flareFrom, flareTo };
    linkRecords.push(record);
    updateLink(record);

    if (!reducedMotion.matches) {
      base.animate(
        [{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }],
        { duration: 620, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
      );
    }

    return record;
  }

  function updateLink(record) {
    const from = portPoint(record.from, 'out');
    const to = portPoint(record.to, 'in');
    const d = curve(from, to);
    record.base.setAttribute('d', d);
    record.pulse.setAttribute('d', d);
    record.flareFrom.setAttribute('x', (from.x - 1).toFixed(2));
    record.flareFrom.setAttribute('y', (from.y - 9).toFixed(2));
    record.flareTo.setAttribute('x', (to.x - 1).toFixed(2));
    record.flareTo.setAttribute('y', (to.y - 9).toFixed(2));
  }

  function updateLinks() {
    linkRecords.forEach(updateLink);
  }

  function setLinkHot(record, hot) {
    if (!record) return;
    [record.base, record.pulse, record.flareFrom, record.flareTo].forEach((el) => el.classList.toggle('is-hot', hot));
  }

  function pulseLink(record) {
    if (!record || reducedMotion.matches) return;
    setLinkHot(record, true);
    const animation = record.pulse.animate(
      [{ strokeDashoffset: '1', opacity: 0 }, { opacity: .86, offset: .18 }, { strokeDashoffset: '-1', opacity: 0 }],
      { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
    animation.finished.catch(() => {}).then(() => {
      if (!record.from.el.matches(':hover') && !record.to.el.matches(':hover')) setLinkHot(record, false);
    });
  }

  function setupBaseLinks() {
    svg.innerHTML = '';
    linkRecords.length = 0;
    models.forEach((model, index) => createLink(rootModel, model, `root-${index}`, 260 + index * 85));
  }

  function animateBaseLinks() {
    if (reducedMotion.matches) return;
    linkRecords.filter((record) => record.key.startsWith('root-')).forEach((record, index) => {
      record.base.animate(
        [{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }],
        {
          duration: 620,
          delay: 260 + index * 85,
          easing: 'cubic-bezier(.22,1,.36,1)',
          fill: 'both'
        }
      );
    });
  }

  function clearEntryTimers() {
    entryTimers.forEach(clearTimeout);
    entryTimers = [];
  }

  function playEntry() {
    clearEntryTimers();
    canvasRoot.classList.remove('is-leaving', 'is-ready');
    canvasRoot.classList.add('is-entering', 'is-grid-visible');

    rootEl.style.transitionDelay = reducedMotion.matches ? '0ms' : '150ms';
    models.forEach((model, index) => {
      model.el.style.transitionDelay = reducedMotion.matches ? '0ms' : `${280 + index * 90}ms`;
    });

    requestAnimationFrame(() => {
      canvasRoot.classList.add('is-ready');
    });

    const cleanup = window.setTimeout(() => {
      canvasRoot.classList.remove('is-entering');
      rootEl.style.transitionDelay = '';
      models.forEach((model) => { model.el.style.transitionDelay = ''; });
    }, reducedMotion.matches ? 40 : 900);
    entryTimers.push(cleanup);
  }

  function getSourceForVideo(video) {
    const sources = [...video.querySelectorAll('source')];
    const matched = sources.find((source) => !source.media || window.matchMedia(source.media).matches);
    return matched?.getAttribute('src') || video.currentSrc || video.getAttribute('src') || '';
  }

  function playVideo(video) {
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    const promise = video.play();
    promise?.catch?.(() => {});
  }

  function syncVideos(open) {
    const videos = [...panel.querySelectorAll('[data-work-video]')];
    videos.forEach((video) => {
      if (open) playVideo(video);
      else video.pause();
    });

    if (!backgroundVideo) return;
    if (open && !reducedMotion.matches) playVideo(backgroundVideo);
    else backgroundVideo.pause();
  }

  function createProjectNode(index) {
    const category = models[index];
    const sourceVideo = category.el.querySelector('[data-work-video]');
    const title = category.el.querySelector('strong')?.textContent?.trim() || `Work ${index + 1}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'work-node work-node--project';
    button.dataset.workProject = String(index);
    button.setAttribute('aria-label', `Abrir ${title}`);

    const inPort = document.createElement('span');
    inPort.className = 'work-node__port work-node__port--in';
    inPort.setAttribute('aria-hidden', 'true');

    const media = document.createElement('span');
    media.className = 'work-node__media';

    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');

    [...sourceVideo.querySelectorAll('source')].forEach((source) => {
      video.appendChild(source.cloneNode(true));
    });
    media.appendChild(video);

    const body = document.createElement('span');
    body.className = 'work-node__body';

    const top = document.createElement('span');
    top.className = 'work-node__topline';

    const number = document.createElement('span');
    number.className = 'work-node__index';
    number.textContent = String(index + 1).padStart(2, '0');

    const chip = document.createElement('span');
    chip.className = 'work-node__chip';
    chip.textContent = LABELS[index];

    const strong = document.createElement('strong');
    strong.textContent = title;

    top.append(number, chip);
    body.append(top, strong);
    button.append(inPort, media, body);

    button.addEventListener('pointerdown', (event) => {
      playWorkSfx('nodeSelect', {
        element: button,
        eventTimestamp: event.timeStamp
      });
    }, { passive: true });

    button.addEventListener('click', () => {
      const src = getSourceForVideo(video) || getSourceForVideo(sourceVideo);
      if (!src) return;
      window.DeushimaOpenDesignViewer?.({
        type: 'video',
        src,
        title
      });
    });

    button.addEventListener('pointerenter', (event) => {
      if (!coarsePointer.matches && event.pointerType !== 'touch') {
        playWorkSfx('nodeHover', {
          element: button,
          eventTimestamp: event.timeStamp
        });
      }
      button.classList.add('is-hot');
      if (childLink) {
        setLinkHot(childLink, true);
        pulseLink(childLink);
      }
    });

    button.addEventListener('pointerleave', () => {
      button.classList.remove('is-hot');
      if (childLink) setLinkHot(childLink, false);
    });

    return { button, video, title };
  }

  function removeChild(immediate = false) {
    if (!childModel) return;

    const element = childModel.el;
    const wrap = element.closest('.work-canvas__mobile-child');

    if (!immediate && !reducedMotion.matches) {
      element.classList.remove('is-visible');
      window.setTimeout(() => {
        wrap?.remove();
        if (!wrap) element.remove();
      }, 180);
    } else {
      wrap?.remove();
      if (!wrap) element.remove();
    }

    childModel.video?.pause();
    childModel = null;

    if (childLink) {
      childLink.group.remove();
      const index = linkRecords.indexOf(childLink);
      if (index >= 0) linkRecords.splice(index, 1);
      childLink = null;
    }

    wakeGrid(500);
  }

  function focusCameraOnExpanded(index) {
    if (isMobile() || !childModel) return;
    const category = models[index];
    const centerX = (category.x + childModel.x) * 0.5;
    const centerY = (category.y + childModel.y) * 0.5;
    const rect = viewport.getBoundingClientRect();
    const targetScale = clamp(Math.max(camera.scale, 1.02), CONFIG.minZoom, 1.18);

    animateCamera({
      scale: targetScale,
      x: rect.width * 0.5 - centerX * targetScale,
      y: rect.height * 0.5 - centerY * targetScale
    });
  }

  function selectCategory(index) {
    if (performance.now() < suppressClickUntil) return;
    if (expandedIndex === index) return;
    if (expandedIndex >= 0) collapseExpanded({ restoreFocus: false, immediate: true });

    const category = models[index];
    expandedIndex = index;
    lastCategoryFocus = category.el;
    canvasRoot.classList.add('is-expanded');

    models.forEach((model) => {
      const selected = model.index === index;
      model.el.classList.toggle('is-selected', selected);
      model.el.classList.toggle('is-muted', !selected);
      model.el.setAttribute('aria-expanded', selected ? 'true' : 'false');
    });

    if (breadcrumbCurrent) breadcrumbCurrent.textContent = `/ ${category.el.querySelector('strong')?.textContent?.trim() || ''}`;

    const project = createProjectNode(index);

    if (isMobile()) {
      const wrapper = document.createElement('div');
      wrapper.className = 'work-canvas__mobile-child is-visible';
      wrapper.appendChild(project.button);
      category.el.insertAdjacentElement('afterend', wrapper);
      childModel = {
        el: project.button,
        video: project.video,
        x: 0,
        y: 0,
        baseX: 0,
        baseY: 0,
        kind: 'project',
        index
      };
      project.button.classList.add('is-visible');
      playVideo(project.video);
      wakeGrid(600);
      return;
    }

    const position = CHILD_POSITIONS[index];
    childModel = {
      el: project.button,
      video: project.video,
      x: position.x,
      y: position.y,
      baseX: position.x,
      baseY: position.y,
      kind: 'project',
      index
    };

    world.appendChild(project.button);
    renderModel(childModel);

    project.button.style.setProperty('--work-entry-x', `${(category.x - childModel.x).toFixed(2)}px`);
    project.button.style.setProperty('--work-entry-y', `${(category.y - childModel.y).toFixed(2)}px`);
    project.button.style.setProperty('--work-entry-scale', '.86');

    childLink = createLink(category, childModel, `child-${index}`, 80);

    requestAnimationFrame(() => {
      project.button.classList.add('is-visible');
      project.button.style.setProperty('--work-entry-x', '0px');
      project.button.style.setProperty('--work-entry-y', '0px');
      project.button.style.setProperty('--work-entry-scale', '1');
      playVideo(project.video);
    });

    focusCameraOnExpanded(index);
    wakeGrid(900);
  }

  function collapseExpanded({ restoreFocus = true, immediate = false } = {}) {
    if (expandedIndex < 0) return false;

    const focusTarget = lastCategoryFocus;
    const index = expandedIndex;
    expandedIndex = -1;

    canvasRoot.classList.remove('is-expanded');
    models.forEach((model) => {
      model.el.classList.remove('is-selected', 'is-muted');
      model.el.setAttribute('aria-expanded', 'false');
    });

    if (breadcrumbCurrent) breadcrumbCurrent.textContent = '';
    removeChild(immediate);

    if (!isMobile()) fitView(!immediate);

    if (restoreFocus && focusTarget?.focus) {
      window.setTimeout(() => focusTarget.focus({ preventScroll: true }), immediate ? 0 : CONFIG.cameraDuration + 30);
    }

    wakeGrid(700);
    return index >= 0;
  }

  function startCategoryDrag(event, model) {
    if (isMobile() || event.button > 0) return;

    dragState = {
      model,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: model.x,
      baseY: model.y,
      dragging: false,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      lastSfxAt: 0
    };
    model.el.setPointerCapture?.(event.pointerId);
  }

  function moveCategoryDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.dragging && Math.hypot(dx, dy) < CONFIG.dragThreshold) return;
    if (!dragState.dragging) {
      dragState.dragging = true;
      dragState.model.el.classList.add('is-dragging');
      playWorkSfx('pickup', {
        element: dragState.model.el,
        eventTimestamp: event.timeStamp
      });
      dragState.lastSfxAt = 0;
    }

    const now = performance.now();
    const dragStep = window.DeushimaSFX?.config?.performance?.dragStepMs || 70;
    if (now - dragState.lastSfxAt >= dragStep) {
      const dt = Math.max(8, now - dragState.lastTime);
      const speed = Math.hypot(
        event.clientX - dragState.lastX,
        event.clientY - dragState.lastY
      ) / dt * 1000;
      const bucket = clamp(Math.round((speed / 1650) * 4), 0, 4);
      playWorkSfx('drag', {
        element: dragState.model.el,
        degree: -5 + bucket,
        eventTimestamp: event.timeStamp,
        gainScale: 0.92
      });
      dragState.lastSfxAt = now;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      dragState.lastTime = now;
    }

    event.preventDefault();
    dragState.model.x = dragState.baseX + dx / camera.scale;
    dragState.model.y = dragState.baseY + dy / camera.scale;
    renderModel(dragState.model);
    updateLinks();
    wakeGrid(520);
  }

  function endCategoryDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const wasDragging = dragState.dragging;
    dragState.model.el.releasePointerCapture?.(event.pointerId);
    dragState.model.el.classList.remove('is-dragging');

    if (wasDragging) {
      suppressClickUntil = performance.now() + 280;
      playWorkSfx('drop', {
        element: dragState.model.el,
        eventTimestamp: event.timeStamp
      });
    }
    dragState = null;
    wakeGrid(450);
  }

  function animateReset() {
    collapseExpanded({ restoreFocus: false, immediate: true });
    if (isMobile()) {
      viewport.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      return;
    }

    const start = performance.now();
    const from = models.map((model) => ({ x: model.x, y: model.y }));
    const duration = reducedMotion.matches ? 0 : 520;

    const frame = (now) => {
      const p = duration ? clamp((now - start) / duration, 0, 1) : 1;
      const e = easeOut(p);

      models.forEach((model, index) => {
        model.x = lerp(from[index].x, model.baseX, e);
        model.y = lerp(from[index].y, model.baseY, e);
        renderModel(model);
      });

      updateLinks();
      wakeGrid(80);

      if (p < 1) requestAnimationFrame(frame);
      else fitView(true);
    };

    requestAnimationFrame(frame);
  }

  function setupCategoryEvents() {
    models.forEach((model, index) => {
      const baseLink = linkRecords[index];

      model.el.addEventListener('pointerenter', (event) => {
        if (coarsePointer.matches || event.pointerType === 'touch') return;
        playWorkSfx('nodeHover', {
          element: model.el,
          eventTimestamp: event.timeStamp
        });
        model.el.classList.add('is-hot');
        setLinkHot(baseLink, true);
        pulseLink(baseLink);
        wakeGrid(260);
      });

      model.el.addEventListener('pointerleave', () => {
        model.el.classList.remove('is-hot');
        setLinkHot(baseLink, false);
        wakeGrid(240);
      });

      model.el.addEventListener('pointerdown', (event) => {
        playWorkSfx('nodeSelect', {
          element: model.el,
          eventTimestamp: event.timeStamp
        });
        startCategoryDrag(event, model);
      });
      model.el.addEventListener('pointermove', moveCategoryDrag);
      model.el.addEventListener('pointerup', endCategoryDrag);
      model.el.addEventListener('pointercancel', endCategoryDrag);
      model.el.addEventListener('click', () => selectCategory(index));
    });
  }

  function startPanPointer(event) {
    if (isMobile()) return;
    if (event.target.closest('.work-node, .work-canvas__toolbar, .work-canvas__controls, .work-canvas__reset')) return;

    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture?.(event.pointerId);

    if (activePointers.size === 1) {
      panState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cameraX: camera.x,
        cameraY: camera.y
      };
      pinchState = null;
      viewport.classList.add('is-panning');
    } else if (activePointers.size === 2) {
      const points = [...activePointers.values()];
      const rect = viewport.getBoundingClientRect();
      const midX = (points[0].x + points[1].x) * 0.5 - rect.left;
      const midY = (points[0].y + points[1].y) * 0.5 - rect.top;
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchState = {
        distance: Math.max(distance, 1),
        scale: camera.scale,
        worldX: (midX - camera.x) / camera.scale,
        worldY: (midY - camera.y) / camera.scale
      };
      panState = null;
    }
  }

  function movePanPointer(event) {
    if (!activePointers.has(event.pointerId) || isMobile()) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size >= 2 && pinchState) {
      event.preventDefault();
      const points = [...activePointers.values()].slice(0, 2);
      const rect = viewport.getBoundingClientRect();
      const midX = (points[0].x + points[1].x) * 0.5 - rect.left;
      const midY = (points[0].y + points[1].y) * 0.5 - rect.top;
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const scale = clamp(pinchState.scale * distance / pinchState.distance, CONFIG.minZoom, CONFIG.maxZoom);
      camera.scale = scale;
      camera.x = midX - pinchState.worldX * scale;
      camera.y = midY - pinchState.worldY * scale;
      applyCamera();
      return;
    }

    if (panState && panState.pointerId === event.pointerId) {
      event.preventDefault();
      camera.x = panState.cameraX + event.clientX - panState.startX;
      camera.y = panState.cameraY + event.clientY - panState.startY;
      applyCamera();
    }
  }

  function endPanPointer(event) {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    viewport.releasePointerCapture?.(event.pointerId);

    if (!activePointers.size) {
      panState = null;
      pinchState = null;
      viewport.classList.remove('is-panning');
    } else if (activePointers.size === 1) {
      const [pointerId, point] = [...activePointers.entries()][0];
      panState = {
        pointerId,
        startX: point.x,
        startY: point.y,
        cameraX: camera.x,
        cameraY: camera.y
      };
      pinchState = null;
    }
  }

  viewport.addEventListener('pointerdown', startPanPointer);
  viewport.addEventListener('pointermove', movePanPointer);
  viewport.addEventListener('pointerup', endPanPointer);
  viewport.addEventListener('pointercancel', endPanPointer);

  viewport.addEventListener('wheel', (event) => {
    if (isMobile()) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(event.clientX, event.clientY, camera.scale * factor);
  }, { passive: false });

  viewport.addEventListener('dblclick', (event) => {
    if (isMobile() || event.target.closest('.work-node')) return;
    fitView(true);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (tabletLayout.matches || coarsePointer.matches) return;
    const rect = gridCanvas.getBoundingClientRect();
    grid.pointerX = event.clientX - rect.left;
    grid.pointerY = event.clientY - rect.top;
    grid.pointerInside = true;
    grid.lastPointerAt = performance.now();
    wakeGrid(220);
  }, { passive: true });

  viewport.addEventListener('pointerleave', () => {
    grid.pointerInside = false;
    grid.pointerX = -9999;
    grid.pointerY = -9999;
    wakeGrid(260);
  }, { passive: true });

  viewport.addEventListener('scroll', () => {
    if (isMobile()) wakeGrid(180);
  }, { passive: true });

  function signedDistanceToRoundedRect(px, py, cx, cy, halfW, halfH, radius) {
    const qx = Math.abs(px - cx) - Math.max(0, halfW - radius);
    const qy = Math.abs(py - cy) - Math.max(0, halfH - radius);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
  }

  function fillGridNodeRects() {
    let count = 0;

    const writeRect = (cx, cy, halfW, halfH, radius) => {
      const offset = count * 5;
      if (offset + 4 >= grid.nodeRects.length) return;
      grid.nodeRects[offset] = cx;
      grid.nodeRects[offset + 1] = cy;
      grid.nodeRects[offset + 2] = halfW;
      grid.nodeRects[offset + 3] = halfH;
      grid.nodeRects[offset + 4] = radius;
      count += 1;
    };

    if (isMobile()) {
      const canvasRect = gridCanvas.getBoundingClientRect();
      const elements = [rootEl, ...categories];
      if (childModel) elements.push(childModel.el);

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const cy = rect.top - canvasRect.top + rect.height * .5;
        const halfH = rect.height * .5;
        if (cy + halfH < 0 || cy - halfH > grid.height) continue;
        writeRect(
          rect.left - canvasRect.left + rect.width * .5,
          cy,
          rect.width * .5,
          halfH,
          Math.min(parseFloat(getComputedStyle(el).borderRadius) || 20, rect.width * .5, halfH)
        );
      }
    } else {
      const all = [rootModel, ...models];
      if (childModel) all.push(childModel);

      for (const model of all) {
        const size = getNodeSize(model);
        writeRect(
          model.x,
          model.y,
          size.width * .5,
          size.height * .5,
          Math.min(parseFloat(getComputedStyle(model.el).borderRadius) || 24, size.width * .5, size.height * .5)
        );
      }
    }

    grid.nodeRectCount = count;
    return count;
  }

  function buildGrid() {
    if (!grid.ctx) return;

    const rect = surface.getBoundingClientRect();
    grid.width = Math.max(1, Math.round(surface.clientWidth || rect.width));
    grid.height = Math.max(1, Math.round(surface.clientHeight || rect.height));
    grid.dpr = Math.min(window.devicePixelRatio || 1, isTablet() ? CONFIG.dprTablet : CONFIG.dprDesktop);
    grid.spacing = isTablet() ? CONFIG.gridSpacingMobile : CONFIG.gridSpacingDesktop;

    gridCanvas.width = Math.max(1, Math.round(grid.width * grid.dpr));
    gridCanvas.height = Math.max(1, Math.round(grid.height * grid.dpr));
    gridCanvas.style.width = `${grid.width}px`;
    gridCanvas.style.height = `${grid.height}px`;
    grid.ctx.setTransform(grid.dpr, 0, 0, grid.dpr, 0, 0);

    let points = [];

    if (isMobile()) {
      grid.cols = Math.ceil(grid.width / grid.spacing) + 3;
      grid.rows = Math.ceil(grid.height / grid.spacing) + 3;
      const startX = (grid.width - (grid.cols - 1) * grid.spacing) * .5;
      const startY = (grid.height - (grid.rows - 1) * grid.spacing) * .5;
      for (let row = 0; row < grid.rows; row += 1) {
        for (let col = 0; col < grid.cols; col += 1) {
          points.push([startX + col * grid.spacing, startY + row * grid.spacing]);
        }
      }
    } else {
      const minX = -1024;
      const maxX = 3000;
      const minY = -800;
      const maxY = 2000;
      grid.cols = Math.floor((maxX - minX) / grid.spacing) + 1;
      grid.rows = Math.floor((maxY - minY) / grid.spacing) + 1;
      for (let y = minY; y <= maxY; y += grid.spacing) {
        for (let x = minX; x <= maxX; x += grid.spacing) {
          points.push([x, y]);
        }
      }
    }

    grid.count = points.length;
    grid.baseX = new Float32Array(grid.count);
    grid.baseY = new Float32Array(grid.count);
    grid.dx = new Float32Array(grid.count);
    grid.dy = new Float32Array(grid.count);
    grid.targetDx = new Float32Array(grid.count);
    grid.targetDy = new Float32Array(grid.count);
    grid.intensity = new Float32Array(grid.count);
    grid.reveal = new Float32Array(grid.count);
    grid.screenX = new Float32Array(grid.count);
    grid.screenY = new Float32Array(grid.count);

    const computed = getComputedStyle(canvasRoot);
    grid.dotColor = computed.getPropertyValue('--work-grid-dot').trim() || 'rgba(255,255,255,.22)';
    grid.lineColor = computed.getPropertyValue('--work-grid-line').trim() || 'rgba(255,255,255,.045)';

    points.forEach((point, index) => {
      grid.baseX[index] = point[0];
      grid.baseY[index] = point[1];
      grid.reveal[index] = reducedMotion.matches ? 1 : 0;
    });

    grid.introComplete = reducedMotion.matches;
    wakeGrid(900);
  }

  function vignette(x, y) {
    const edgeX = Math.min(x / Math.max(grid.width, 1), 1 - x / Math.max(grid.width, 1));
    const edgeY = Math.min(y / Math.max(grid.height, 1), 1 - y / Math.max(grid.height, 1));
    const edge = clamp(Math.min(edgeX, edgeY) / CONFIG.vignetteReach, 0, 1);
    const smooth = edge * edge * (3 - 2 * edge);
    return CONFIG.vignetteFloor + (1 - CONFIG.vignetteFloor) * smooth;
  }

  function drawGrid(now) {
    if (!grid.ctx || grid.contextLost || document.hidden || !panelOpen) {
      grid.raf = 0;
      return;
    }

    const ctx = grid.ctx;
    const rectCount = fillGridNodeRects();
    const mobile = isMobile();
    const cursorEnabled = !tabletLayout.matches && !coarsePointer.matches && grid.pointerInside;
    const introProgress = grid.introComplete ? 1 : clamp((now - grid.introStart) / CONFIG.revealDuration, 0, 1);
    const centerX = grid.width * .5;
    const centerY = grid.height * .5;
    const maxDistance = Math.hypot(centerX, centerY) || 1;
    let unsettled = false;

    ctx.clearRect(0, 0, grid.width, grid.height);

    const screenX = grid.screenX;
    const screenY = grid.screenY;

    for (let i = 0; i < grid.count; i += 1) {
      const bx = grid.baseX[i];
      const by = grid.baseY[i];
      let px = bx;
      let py = by;
      let proximity = 0;

      let sampleX = bx;
      let sampleY = by;

      if (!mobile) {
        sampleX = bx;
        sampleY = by;
      }

      let pushX = 0;
      let pushY = 0;

      for (let rectIndex = 0; rectIndex < rectCount; rectIndex += 1) {
        const offset = rectIndex * 5;
        const distance = signedDistanceToRoundedRect(
          sampleX,
          sampleY,
          grid.nodeRects[offset],
          grid.nodeRects[offset + 1],
          grid.nodeRects[offset + 2],
          grid.nodeRects[offset + 3],
          grid.nodeRects[offset + 4]
        );

        if (distance >= CONFIG.nodeFalloff) continue;
        const n = clamp(Math.max(0, distance) / CONFIG.nodeFalloff, 0, 1);
        const influence = 1 - n;
        const smoothInfluence = influence * influence * (3 - 2 * influence);
        proximity = Math.max(proximity, smoothInfluence);

        let vx = sampleX - grid.nodeRects[offset];
        let vy = sampleY - grid.nodeRects[offset + 1];
        let len = Math.hypot(vx, vy);
        if (len < .001) {
          vx = 1;
          vy = 0;
          len = 1;
        }

        const shift = CONFIG.nodeMaxShift * smoothInfluence;
        pushX += vx / len * shift;
        pushY += vy / len * shift;
      }

      const pushLength = Math.hypot(pushX, pushY);
      if (pushLength > CONFIG.nodeMaxShift) {
        pushX *= CONFIG.nodeMaxShift / pushLength;
        pushY *= CONFIG.nodeMaxShift / pushLength;
      }

      if (cursorEnabled) {
        const cursorWorldX = mobile ? grid.pointerX : (grid.pointerX - camera.x) / camera.scale;
        const cursorWorldY = mobile ? grid.pointerY : (grid.pointerY - camera.y) / camera.scale;
        const cursorRadius = mobile ? CONFIG.cursorRadius : CONFIG.cursorRadius / camera.scale;
        const cursorForce = mobile ? CONFIG.cursorForce : CONFIG.cursorForce / camera.scale;
        const dx = bx - cursorWorldX;
        const dy = by - cursorWorldY;
        const distance = Math.hypot(dx, dy);
        if (distance > .001 && distance < cursorRadius) {
          const inf = 1 - distance / cursorRadius;
          const smoothInf = inf * inf * (3 - 2 * inf);
          pushX += dx / distance * cursorForce * smoothInf;
          pushY += dy / distance * cursorForce * smoothInf;
          proximity = Math.max(proximity, smoothInf);
        }
      }

      grid.targetDx[i] = pushX;
      grid.targetDy[i] = pushY;
      grid.intensity[i] = proximity;

      const factor = reducedMotion.matches ? 1 : CONFIG.lerp;
      const ddx = grid.targetDx[i] - grid.dx[i];
      const ddy = grid.targetDy[i] - grid.dy[i];
      grid.dx[i] += ddx * factor;
      grid.dy[i] += ddy * factor;

      if (Math.abs(ddx) > CONFIG.settleThreshold || Math.abs(ddy) > CONFIG.settleThreshold) unsettled = true;

      px += grid.dx[i];
      py += grid.dy[i];

      if (!mobile) {
        screenX[i] = camera.x + px * camera.scale;
        screenY[i] = camera.y + py * camera.scale;
      } else {
        screenX[i] = px;
        screenY[i] = py;
      }

      if (!grid.introComplete && !reducedMotion.matches) {
        const distance = Math.hypot(screenX[i] - centerX, screenY[i] - centerY);
        const delay = distance / maxDistance * .56;
        const local = clamp((introProgress - delay) / Math.max(.001, 1 - delay), 0, 1);
        grid.reveal[i] = easeOut(local);
      } else {
        grid.reveal[i] = 1;
      }
    }

    if (!grid.introComplete && (introProgress >= 1 || reducedMotion.matches)) grid.introComplete = true;

    ctx.lineWidth = 1;
    ctx.strokeStyle = grid.lineColor;
    ctx.fillStyle = grid.dotColor;
    ctx.lineCap = 'round';

    const spacingScreen = mobile ? grid.spacing : grid.spacing * camera.scale;
    const colsApprox = grid.cols;

    for (let i = 0; i < grid.count; i += 1) {
      const x = screenX[i];
      const y = screenY[i];
      if (x < -grid.spacing || x > grid.width + grid.spacing || y < -grid.spacing || y > grid.height + grid.spacing) continue;

      const reveal = grid.reveal[i];
      if (reveal <= .002) continue;

      const alpha = reveal * vignette(x, y) * (.7 + grid.intensity[i] * .3);
      const radius = CONFIG.dotRadius + (CONFIG.dotRadiusActive - CONFIG.dotRadius) * grid.intensity[i];

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      const right = i + 1;
      if (right < grid.count && Math.abs(screenX[right] - x) < spacingScreen * 1.75) {
        const rx = screenX[right];
        const ry = screenY[right];
        if (rx > -grid.spacing && rx < grid.width + grid.spacing && ry > -grid.spacing && ry < grid.height + grid.spacing) {
          ctx.globalAlpha = Math.min(reveal, grid.reveal[right]) * vignette(x, y) * .9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(rx, ry);
          ctx.stroke();
        }
      }

      const down = i + colsApprox;
      if (down < grid.count) {
        const dx = screenX[down];
        const dy = screenY[down];
        if (Math.abs(dy - y) < spacingScreen * 1.75 && dx > -grid.spacing && dx < grid.width + grid.spacing && dy > -grid.spacing && dy < grid.height + grid.spacing) {
          ctx.globalAlpha = Math.min(reveal, grid.reveal[down]) * vignette(x, y) * .9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(dx, dy);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;

    const shouldContinue = (
      !grid.introComplete
      || unsettled
      || dragState?.dragging
      || cameraAnimation
      || performance.now() < grid.activeUntil
      || performance.now() - grid.lastPointerAt < 180
    );

    if (shouldContinue) {
      grid.raf = requestAnimationFrame(drawGrid);
    } else {
      grid.raf = 0;
    }
  }

  function wakeGrid(duration = 300) {
    if (!grid.ctx || !panelOpen) return;
    grid.activeUntil = Math.max(grid.activeUntil, performance.now() + duration);
    if (!grid.raf && !document.hidden) grid.raf = requestAnimationFrame(drawGrid);
  }

  function resizeGrid(force = false) {
    if (!grid.ctx) return;
    const rect = surface.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(surface.clientWidth || rect.width));
    const nextHeight = Math.max(1, Math.round(surface.clientHeight || rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, isTablet() ? CONFIG.dprTablet : CONFIG.dprDesktop);
    const nextSpacing = isTablet() ? CONFIG.gridSpacingMobile : CONFIG.gridSpacingDesktop;

    if (!force && grid.width === nextWidth && grid.height === nextHeight && grid.dpr === nextDpr && grid.spacing === nextSpacing) return;
    buildGrid();
  }

  function openScene() {
    if (panelOpen && sceneReady) {
      wakeGrid(400);
      return;
    }

    panelOpen = true;
    sceneReady = true;
    canvasRoot.classList.remove('is-leaving');
    canvasRoot.classList.add('is-grid-visible');

    renderAllModels();
    updateLinks();
    animateBaseLinks();
    setupCategoryEventsOnce();

    if (!isMobile()) {
      const target = getFitCamera(false);
      camera.x = target.x;
      camera.y = target.y;
      camera.scale = target.scale;
      applyCamera();
    } else {
      applyCamera();
    }

    resizeGrid(true);
    grid.introStart = performance.now();
    grid.introComplete = reducedMotion.matches;
    grid.reveal.fill(reducedMotion.matches ? 1 : 0);

    syncVideos(true);
    playEntry();
    wakeGrid(CONFIG.revealDuration + 220);
  }

  function closeScene() {
    if (!panelOpen) return;
    panelOpen = false;
    canvasRoot.classList.add('is-leaving');
    collapseExpanded({ restoreFocus: false, immediate: true });
    cancelCameraAnimation();
    activePointers.clear();
    panState = null;
    pinchState = null;
    dragState = null;

    if (grid.raf) cancelAnimationFrame(grid.raf);
    grid.raf = 0;

    window.setTimeout(() => {
      syncVideos(false);
      canvasRoot.classList.remove('is-leaving');
    }, reducedMotion.matches ? 0 : 180);
  }

  let categoryEventsReady = false;
  function setupCategoryEventsOnce() {
    if (categoryEventsReady) return;
    categoryEventsReady = true;
    setupCategoryEvents();
  }

  fitButton?.addEventListener('click', () => fitView(true));
  resetButton?.addEventListener('click', (event) => {
    playWorkSfx('reset', {
      element: resetButton,
      eventTimestamp: event.timeStamp
    });
    animateReset();
  });
  backButton?.addEventListener('click', () => collapseExpanded({ restoreFocus: true }));

  const resizeObserver = new ResizeObserver(() => {
    if (!panelOpen) return;
    resizeGrid();
    if (!isMobile()) fitView(false);
    renderAllModels();
  });
  resizeObserver.observe(surface);

  gridCanvas.addEventListener('contextlost', (event) => {
    event.preventDefault();
    grid.contextLost = true;
    if (grid.raf) cancelAnimationFrame(grid.raf);
    grid.raf = 0;
    canvasRoot.classList.add('is-grid-fallback');
  });

  gridCanvas.addEventListener('contextrestored', () => {
    grid.contextLost = false;
    canvasRoot.classList.remove('is-grid-fallback');
    resizeGrid(true);
    wakeGrid(700);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (grid.raf) cancelAnimationFrame(grid.raf);
      grid.raf = 0;
      syncVideos(false);
    } else if (panelOpen) {
      syncVideos(true);
      resizeGrid(true);
      wakeGrid(600);
    }
  });

  window.addEventListener('pageshow', () => {
    if (panel.classList.contains('is-panel-open')) {
      panelOpen = false;
      openScene();
    }
  });

  window.setInterval(() => {
    if (!panel.classList.contains('is-panel-open')) return;
    if (!panelOpen) openScene();
    resizeGrid();
    syncVideos(true);
    wakeGrid(80);
  }, CONFIG.recoveryInterval);

  const panelObserver = new MutationObserver(() => {
    if (panel.classList.contains('is-panel-open')) openScene();
    else closeScene();
  });
  panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });

  mobileLayout.addEventListener?.('change', () => {
    collapseExpanded({ restoreFocus: false, immediate: true });
    resizeGrid(true);
    renderAllModels();
    if (panelOpen) fitView(false);
  });

  tabletLayout.addEventListener?.('change', () => {
    resizeGrid(true);
    if (panelOpen && !isMobile()) fitView(false);
  });

  reducedMotion.addEventListener?.('change', () => {
    resizeGrid(true);
    wakeGrid(500);
  });

  window.DeushimaWorkCanvas = Object.freeze({
    open: openScene,
    close: closeScene,
    back: () => collapseExpanded({ restoreFocus: true }),
    isExpanded: () => expandedIndex >= 0,
    fit: () => fitView(true),
    reset: animateReset,
    getState: () => ({
      open: panelOpen,
      expandedIndex,
      camera: { ...camera },
      mobile: isMobile(),
      gridRunning: Boolean(grid.raf),
      gridPoints: grid.count
    })
  });

  renderAllModels();
  setupBaseLinks();
  setupCategoryEventsOnce();

  if (panel.classList.contains('is-panel-open')) openScene();
})();
