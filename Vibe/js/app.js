/* ==========================================================================
   DEUSHIMA® / IVÁN RODRÍGUEZ — interacción
   Secuencia de fotogramas, scroll editorial, cursor y casos.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, n) => a + (b - a) * n;
  const pad = (n, size = 2) => String(n).padStart(size, '0');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const FRAME_COUNT = 65;
  const FRAME_DURATION = 3.233;

  const body = document.body;
  const root = document.documentElement;

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  /* -----------------------------------------------------------------------
     Estado
     ----------------------------------------------------------------------- */
  const state = {
    frames: [],
    framesLoaded: 0,
    framesReady: false,
    finished: false,
    frameIndex: -1,
    statement: null,
    sectionIndex: 0,
    drawnFrame: -1,
    heroProgress: 0,
    fragmentsDistance: 0,
    modalOpen: false,
    menuOpen: false,
    routeBusy: false,
    asciiStarted: false
  };

  /* -----------------------------------------------------------------------
     Reloj Buenos Aires
     ----------------------------------------------------------------------- */
  const clockFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const clockEl = $('#clock');
  const footerClockEl = $('#footer-clock');

  function tickClock() {
    const time = clockFormatter.format(new Date()).replace(/\u200e/g, '');
    if (clockEl) clockEl.textContent = `BA ${time}`;
    if (footerClockEl) footerClockEl.textContent = `BA ${time}`;
  }

  tickClock();
  window.setInterval(tickClock, 1000);

  /* -----------------------------------------------------------------------
     Loader + secuencia de frames
     ----------------------------------------------------------------------- */
  const loader = $('#loader');
  const loaderCount = $('#loader-count');
  const loaderBar = $('#loader-bar');
  const bootProgress = $('#boot-progress');
  const bootLines = $$('#loader [data-boot]');
  const bootThresholds = [0, 16, 64, 96];

  function updateBootLog(value) {
    if (bootProgress) bootProgress.textContent = `${String(value).padStart(3, '0')}%`;
    bootLines.forEach((line, index) => {
      line.classList.toggle('is-on', value >= bootThresholds[index]);
    });
  }

  function setLoaderProgress(percent) {
    const value = clamp(Math.round(percent), 0, 100);
    if (loaderCount) loaderCount.textContent = String(value).padStart(2, '0');
    if (loaderBar) loaderBar.style.transform = `scaleX(${value / 100})`;
    updateBootLog(value);
  }

  function finishLoading() {
    if (state.finished) return;
    state.finished = true;
    state.framesReady = true;
    setLoaderProgress(100);
    drawFrame(0, true);
    refreshAsciiSource();

    window.setTimeout(() => {
      if (loader) {
        loader.classList.add('is-done');
        loader.setAttribute('aria-hidden', 'true');
      }
      body.classList.remove('is-loading');
      body.classList.add('is-ready');
      initSmoothScroll();
      updateScroll(true);
    }, reduceMotion ? 0 : 620);
  }

  function loadFrames() {
    state.frames = Array.from({ length: FRAME_COUNT }, (_, index) => ({
      index,
      img: null,
      loaded: false
    }));

    let settled = 0;

    state.frames.forEach((entry) => {
      const img = new Image();
      entry.img = img;

      if (entry.index < 8) {
        img.fetchPriority = 'high';
      }

      const settle = () => {
        if (entry.settled) return;
        entry.settled = true;
        entry.loaded = true;
        state.framesLoaded += 1;
        settled += 1;
        setLoaderProgress((settled / FRAME_COUNT) * 100);

        if (entry.index === 0) drawFrame(0, true);
        if (entry.index === FRAME_COUNT - 1) refreshAsciiSource();
        if (state.framesReady) scheduleUpdate();
        if (settled >= FRAME_COUNT) finishLoading();
      };

      img.onload = settle;
      img.onerror = settle;
      img.src = `assets/frames/frame_${pad(entry.index + 1, 3)}.webp`;
    });

    // Red de seguridad: si una imagen tarda demasiado, la experiencia arranca igual.
    window.setTimeout(finishLoading, 12000);
  }

  /* -----------------------------------------------------------------------
     Canvas de la secuencia
     ----------------------------------------------------------------------- */
  const canvas = $('#hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let canvasW = 0;
  let canvasH = 0;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    canvas.width = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(state.frameIndex < 0 ? 0 : state.frameIndex, true);
  }

  function nearestLoadedFrame(index) {
    if (state.frames[index]?.loaded) return state.frames[index];
    for (let offset = 1; offset < FRAME_COUNT; offset += 1) {
      const before = state.frames[index - offset];
      const after = state.frames[index + offset];
      if (before?.loaded) return before;
      if (after?.loaded) return after;
    }
    return null;
  }

  function drawFrame(index, force = false) {
    if (!ctx || !canvasW || !canvasH) return;
    if (!force && index === state.drawnFrame) return;

    const entry = nearestLoadedFrame(clamp(index, 0, FRAME_COUNT - 1));
    if (!entry || !entry.img || !entry.img.naturalWidth) return;

    const img = entry.img;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const progress = state.heroProgress;
    const zoom = 1.035 + progress * 0.055;
    const scale = Math.max(canvasW / iw, canvasH / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const focalX = canvasW < 720 ? 0.53 : 0.5;
    const focalY = canvasW < 720 ? 0.4 : 0.46;
    const dx = (canvasW - dw) * focalX;
    const dy = (canvasH - dh) * focalY;

    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, dx, dy, dw, dh);

    state.drawnFrame = entry.index;
  }

  /* -----------------------------------------------------------------------
     Smooth scroll
     ----------------------------------------------------------------------- */
  let lenis = null;
  let rafId = 0;

  function initSmoothScroll() {
    if (reduceMotion || typeof window.Lenis === 'undefined') return;
    if (lenis) return;

    lenis = new window.Lenis({
      lerp: 0.085,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.15,
      syncTouch: false
    });

    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);
  }

  function scrollToTarget(target) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    if (target === '#top' || el === body) {
      if (lenis) lenis.scrollTo(0, { duration: 1.35 });
      else window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    if (lenis) {
      lenis.scrollTo(el, { duration: 1.35 });
    } else {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  /* -----------------------------------------------------------------------
     Scroll general
     ----------------------------------------------------------------------- */
  const hero = $('#hero');
  const frameCurrent = $('#frame-current');
  const heroProgressBar = $('#hero-progress');
  const heroTimecode = $('#hero-timecode');
  const statementEls = $$('[data-statement]');
  const projectEls = $$('.project');
  const fragments = $('#fragments');
  const fragmentsTrack = $('#fragments-track');
  const fragmentsBar = $('#fragments-bar');
  const studioFigure = $('.studio__figure .frame');
  const wordRoot = $('[data-words]');
  const scanReveals = $$('[data-scan]');
  let wordSpans = [];
  let ticking = false;

  /* -----------------------------------------------------------------------
     Palabras del manifiesto
     ----------------------------------------------------------------------- */
  function wrapWords(rootEl) {
    if (!rootEl) return [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
      const parts = node.nodeValue.split(/(\s+)/).filter(Boolean);
      const fragment = document.createDocumentFragment();

      parts.forEach((part) => {
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = part;
          fragment.appendChild(span);
        }
      });

      node.parentNode.replaceChild(fragment, node);
    });

    return $$('.w', rootEl);
  }

  function updateWords() {
    if (!wordRoot || !wordSpans.length) return;

    if (reduceMotion) {
      wordSpans.forEach((word) => word.classList.add('is-lit'));
      return;
    }

    const rect = wordRoot.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    const start = window.innerHeight * 0.92;
    const end = window.innerHeight * 0.3;
    const total = Math.max(rect.height + start - end, 1);
    const progress = clamp((start - rect.top) / total, 0, 1);
    const lit = Math.floor(progress * 1.18 * wordSpans.length);

    wordSpans.forEach((word, index) => {
      word.classList.toggle('is-lit', index < lit);
    });
  }

  /* -----------------------------------------------------------------------
     Secciones / navegación
     ----------------------------------------------------------------------- */
  const sectionIds = ['hero', 'studio', 'system', 'work', 'fragments', 'services', 'recognition', 'contact'];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
  const navAnchors = $$('.main-nav a');
  const railButtons = $$('.rail button');
  const railCount = $('#rail-count');
  const railPct = $('#rail-pct');
  const navMap = {
    studio: 'studio',
    system: 'system',
    work: 'work',
    services: 'services',
    contact: 'contact'
  };

  function updateSectionIndicator(force = false) {
    const marker = window.innerHeight * 0.42;
    let index = 0;

    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= marker) index = i;
    });

    if (!force && index === state.sectionIndex) return;
    state.sectionIndex = index;

    const currentId = sectionIds[index];

    navAnchors.forEach((a) => {
      const href = a.getAttribute('href')?.replace('#', '');
      a.classList.toggle('is-active', href === navMap[currentId]);
    });

    railButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.rail === currentId);
    });

    if (railCount) railCount.textContent = pad(index + 1);
  }

  /* -----------------------------------------------------------------------
     Actualización de scroll
     ----------------------------------------------------------------------- */
  function updateHero() {
    if (!hero) return;

    const rect = hero.getBoundingClientRect();
    const scrollRange = Math.max(hero.offsetHeight - window.innerHeight, 1);
    const progress = clamp(-rect.top / scrollRange, 0, 1);
    state.heroProgress = progress;

    const frameIndex = Math.round(progress * (FRAME_COUNT - 1));

    if (frameIndex !== state.frameIndex) {
      state.frameIndex = frameIndex;
      if (state.framesReady) drawFrame(frameIndex);
      if (frameCurrent) frameCurrent.textContent = pad(frameIndex + 1, 3);
    }

    if (state.framesReady) drawFrame(frameIndex);
    if (heroProgressBar) heroProgressBar.style.transform = `scaleX(${progress})`;
    if (heroTimecode) {
      const seconds = Math.floor(progress * FRAME_DURATION);
      const frames = Math.floor((progress * FRAME_DURATION - seconds) * 30);
      heroTimecode.textContent = `00:${pad(seconds)}:${pad(frames)}`;
    }

    hero.classList.toggle('is-scrolled', progress > 0.055);

    const thresholds = [0.09, 0.33, 0.56, 0.78];
    let statementIndex = -1;
    thresholds.forEach((threshold, index) => {
      if (progress >= threshold) statementIndex = index;
    });

    if (statementIndex !== state.statement) {
      state.statement = statementIndex;
      statementEls.forEach((el, index) => {
        el.classList.toggle('is-active', index === statementIndex);
      });
    }
  }

  function updateProjectStack() {
    if (!projectEls.length) return;

    if (window.innerWidth <= 940 || reduceMotion) {
      projectEls.forEach((project) => {
        const card = $('.project__card', project);
        if (card) {
          card.style.transform = '';
          card.style.filter = '';
        }
      });
      return;
    }

    projectEls.forEach((project, index) => {
      const card = $('.project__card', project);
      const next = projectEls[index + 1];
      if (!card) return;

      if (!next) {
        card.style.transform = '';
        card.style.filter = '';
        return;
      }

      const nextRect = next.getBoundingClientRect();
      const cover = clamp(1 - nextRect.top / window.innerHeight, 0, 1);
      card.style.transform = `scale(${1 - cover * 0.045})`;
      card.style.filter = `brightness(${1 - cover * 0.11})`;
    });
  }

  function updateFragments() {
    if (!fragments || !fragmentsTrack) return;

    if (window.innerWidth <= 940 || reduceMotion) {
      fragmentsTrack.style.transform = '';
      if (fragmentsBar) fragmentsBar.style.transform = '';
      return;
    }

    const rect = fragments.getBoundingClientRect();
    const total = Math.max(fragments.offsetHeight - window.innerHeight, 1);
    const progress = clamp(-rect.top / total, 0, 1);
    const max = Math.max(fragmentsTrack.scrollWidth - window.innerWidth, 0);

    fragmentsTrack.style.transform = `translate3d(${-max * progress}px, -50%, 0)`;
    if (fragmentsBar) fragmentsBar.style.transform = `scaleX(${progress})`;
  }

  function updateParallax() {
    if (!studioFigure || reduceMotion) return;
    const rect = studioFigure.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const relative = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
    studioFigure.style.setProperty('--parallax-y', `${relative * -6}%`);
  }

  const lightHeaderSections = $$('[data-header="light"]');

  function updateHeaderTheme() {
    if (!lightHeaderSections.length) return;

    let light = lightHeaderSections.some((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= 46 && rect.bottom >= 46;
    });

    if (!light && document.elementsFromPoint) {
      const stack = document.elementsFromPoint(window.innerWidth * 0.5, 40);
      light = stack.some((element) => element.closest && element.closest('[data-header="light"]'));
    }

    body.classList.toggle('header-light', light);
  }

  function updateScroll(force = false) {
    updateHero();
    updateProjectStack();
    updateFragments();
    updateParallax();
    updateWords();
    updateHeaderTheme();
    updateSectionIndicator(force);

    scanReveals.forEach((el) => {
      if (el.classList.contains('is-in')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.88 && rect.bottom > 0) {
        el.classList.add('is-in');
      }
    });

    if (railPct) {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const percent = Math.round(clamp(window.scrollY / max, 0, 1) * 100);
      railPct.textContent = `${String(percent).padStart(3, '0')}%`;
    }
  }

  function scheduleUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateScroll();
    });
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });

  /* -----------------------------------------------------------------------
     Text decode (solo al revelar; nunca al pasar el mouse)
     ----------------------------------------------------------------------- */
  const SCRAMBLE_POOL = '!<>-_\\/[]{}=+*^?#%&@';

  function scrambleText(el, duration = 620) {
    if (!el || reduceMotion || el.dataset.scrambling === 'true') return;

    const original = el.dataset.originalText || el.textContent.trim();
    if (!original) return;

    el.dataset.originalText = original;
    el.dataset.scrambling = 'true';
    el.setAttribute('aria-label', original);

    const chars = Array.from(original);
    const started = performance.now();

    const frame = (now) => {
      const t = clamp((now - started) / duration, 0, 1);
      const reveal = Math.floor(t * chars.length);

      el.textContent = chars
        .map((char, index) => {
          if (char === ' ' || char === '\n' || char === '\u00a0') return char;
          if (index < reveal) return char;
          if (Math.random() < 0.42) return char;
          return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
        })
        .join('');

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = original;
        el.dataset.scrambling = 'false';
      }
    };

    requestAnimationFrame(frame);
  }

  function initScrambles() {
    if (reduceMotion) return;

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          scrambleText(entry.target, 740);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.55, rootMargin: '0px 0px -8% 0px' }
    );

    $$('.project__title').forEach((title) => observer.observe(title));
  }

  /* -----------------------------------------------------------------------
     ASCII render system
     ----------------------------------------------------------------------- */
  const ASCII_RAMP = ' .:-=+*#%@';
  const ASCII_GLYPHS = '.:-=+*#%@';
  const asciiStage = $('#ascii-stage');
  const asciiCanvas = $('#ascii-canvas');
  const asciiFxCanvas = $('#ascii-fx');
  const asciiGridLabel = $('#ascii-grid');
  const asciiFootGrid = $('#ascii-foot-grid');
  const asciiCtx = asciiCanvas ? asciiCanvas.getContext('2d') : null;
  const asciiFxCtx = asciiFxCanvas ? asciiFxCanvas.getContext('2d') : null;
  const ascii = {
    source: null,
    target: null,
    norm: null,
    cols: 0,
    rows: 0,
    cellW: 8,
    cellH: 15,
    fontSize: 13,
    width: 0,
    height: 0,
    dpr: 1,
    pointerX: -999,
    pointerY: -999,
    pointerActive: false,
    fxRaf: 0,
    inView: false,
    area: { x: 0, y: 0, w: 0, h: 0 }
  };

  function refreshAsciiSource() {
    if (ascii.source && ascii.source.naturalWidth) {
      if (state.asciiStarted) resizeAscii();
      else if (ascii.inView && !state.asciiStarted) startAsciiDecode();
      return;
    }

    if (!ascii.source) {
      const img = new Image();
      img.decoding = 'async';
      img.src = window.__ASCII_SOURCE__ || 'assets/img/eter.webp';
      ascii.source = img;
      img.onload = () => {
        resizeAscii();
        if (ascii.inView && !state.asciiStarted) startAsciiDecode();
      };
    }
  }

  function computeAsciiTarget() {
    if (!ascii.source || !ascii.source.naturalWidth || !ascii.cols || !ascii.rows) return;

    const cols = ascii.cols;
    const rows = ascii.rows;
    const source = document.createElement('canvas');
    source.width = cols;
    source.height = rows;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    const img = ascii.source;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const targetAspect = ascii.area.w / ascii.area.h;
    const sourceAspect = iw / ih;
    let sx = 0;
    let sy = 0;
    let sw = iw;
    let sh = ih;

    if (sourceAspect > targetAspect) {
      sw = ih * targetAspect;
      sx = (iw - sw) / 2;
    } else {
      sh = iw / targetAspect;
      sy = (ih - sh) * 0.3;
    }

    sourceCtx.fillStyle = '#000';
    sourceCtx.fillRect(0, 0, cols, rows);
    sourceCtx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);

    let imageData;
    try {
      imageData = sourceCtx.getImageData(0, 0, cols, rows).data;
    } catch (error) {
      if (asciiStage) asciiStage.classList.add('is-error');
      return;
    }

    const data = imageData;
    const lum = new Float32Array(cols * rows);
    const histogram = new Uint32Array(256);

    for (let i = 0; i < cols * rows; i += 1) {
      const offset = i * 4;
      const value = (0.66 * data[offset] + 0.21 * data[offset + 1] + 0.13 * data[offset + 2]) / 255;
      lum[i] = value;
      histogram[clamp(Math.round(value * 255), 0, 255)] += 1;
    }

    // Ecualización de histograma para que el retrato conserve detalle en las
    // zonas medias y el fondo no se coma la retícula.
    const cdf = new Float32Array(256);
    let cumulative = 0;
    for (let i = 0; i < 256; i += 1) {
      cumulative += histogram[i];
      cdf[i] = cumulative / (cols * rows);
    }

    const target = new Array(cols * rows);
    const norm = new Float32Array(cols * rows);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const bin = clamp(Math.round(lum[i] * 255), 0, 255);
        const value = cdf[bin];
        norm[i] = value;
        target[i] = value < 0.11 ? ' ' : ASCII_RAMP[Math.round(value * (ASCII_RAMP.length - 1))];
      }
    }

    ascii.target = target;
    ascii.norm = norm;

    if (asciiGridLabel) asciiGridLabel.textContent = `${pad(cols, 3)} × ${pad(rows, 3)}`;
    if (asciiFootGrid) asciiFootGrid.textContent = `${pad(cols, 2)} × ${pad(rows, 2)}`;
  }

  function resizeAscii() {
    if (!asciiStage || !asciiCtx) return;

    const rect = asciiStage.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;

    ascii.dpr = Math.min(window.devicePixelRatio || 1, 2);
    ascii.width = rect.width;
    ascii.height = rect.height;

    [asciiCanvas, asciiFxCanvas].forEach((element) => {
      if (!element) return;
      element.width = Math.round(rect.width * ascii.dpr);
      element.height = Math.round(rect.height * ascii.dpr);
    });

    asciiCtx.setTransform(ascii.dpr, 0, 0, ascii.dpr, 0, 0);
    if (asciiFxCtx) asciiFxCtx.setTransform(ascii.dpr, 0, 0, ascii.dpr, 0, 0);

    let areaW = rect.width * 0.88;
    let areaH = areaW * 0.75;
    const maxH = rect.height * 0.68;
    if (areaH > maxH) {
      areaH = maxH;
      areaW = areaH / 0.75;
    }
    ascii.area = {
      x: (rect.width - areaW) / 2,
      y: (rect.height - areaH) / 2,
      w: areaW,
      h: areaH
    };

    const fontSize = rect.width < 520 ? 8 : rect.width < 900 ? 10 : 11;
    ascii.fontSize = fontSize;
    let cols = Math.floor(areaW / Math.max(5, fontSize * 0.62));
    let rows = Math.floor(areaH / Math.max(10, fontSize * 1.15));
    cols = clamp(cols, 40, 150);
    rows = clamp(rows, 24, 90);
    ascii.cols = cols;
    ascii.rows = rows;
    ascii.cellW = areaW / cols;
    ascii.cellH = areaH / rows;

    computeAsciiTarget();
    if (state.asciiStarted) renderAscii(1);
  }

  function renderAscii(progress = 1) {
    if (!asciiCtx || !ascii.target) return;

    const { cols, rows, cellW, cellH, fontSize, area } = ascii;

    asciiCtx.clearRect(0, 0, ascii.width, ascii.height);
    asciiCtx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    asciiCtx.textAlign = 'left';
    asciiCtx.textBaseline = 'top';

    let currentColor = '';

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const value = ascii.norm[i];
        const threshold = (x / cols) * 0.46 + (y / rows) * 0.24 + ((i * 9301 + 49297) % 233) / 233 * 0.22;
        const resolved = progress >= threshold;
        const targetChar = ascii.target[i];
        let char = targetChar;
        let color;

        if (targetChar === ' ' && resolved) {
          continue;
        } else if (!resolved) {
          if (Math.random() > 0.3) continue;
          char = ASCII_GLYPHS[Math.floor(Math.random() * ASCII_GLYPHS.length)];
          color = 'rgba(255, 59, 36, 0.26)';
        } else if (value > 0.64) {
          color = 'rgba(255, 59, 36, 0.86)';
        } else if (value > 0.34) {
          color = 'rgba(242, 238, 230, 0.8)';
        } else {
          color = 'rgba(142, 32, 24, 0.58)';
        }

        if (char === ' ') continue;

        if (color !== currentColor) {
          asciiCtx.fillStyle = color;
          currentColor = color;
        }

        asciiCtx.fillText(char, area.x + x * cellW, area.y + y * cellH);
      }
    }

    asciiCtx.strokeStyle = 'rgba(242, 238, 230, 0.18)';
    asciiCtx.lineWidth = 1;
    asciiCtx.strokeRect(area.x + 0.5, area.y + 0.5, area.w - 1, area.h - 1);

    const tick = 10;
    asciiCtx.strokeStyle = 'rgba(255, 59, 36, 0.7)';
    asciiCtx.beginPath();
    asciiCtx.moveTo(area.x, area.y + tick);
    asciiCtx.lineTo(area.x, area.y);
    asciiCtx.lineTo(area.x + tick, area.y);
    asciiCtx.moveTo(area.x + area.w - tick, area.y);
    asciiCtx.lineTo(area.x + area.w, area.y);
    asciiCtx.lineTo(area.x + area.w, area.y + tick);
    asciiCtx.stroke();
  }

  function startAsciiDecode() {
    if (!asciiStage || !asciiCtx) return;
    if (state.asciiStarted) return;
    if (!ascii.target) {
      ascii.inView = true;
      return;
    }

    state.asciiStarted = true;
    ascii.inView = true;

    if (reduceMotion) {
      renderAscii(1);
      asciiStage.classList.add('is-ready');
      return;
    }

    const duration = 1500;
    const started = performance.now();

    const frame = (now) => {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      renderAscii(eased);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        renderAscii(1);
        asciiStage.classList.add('is-ready');
      }
    };

    requestAnimationFrame(frame);
  }

  function drawAsciiFx() {
    ascii.fxRaf = 0;
    if (!asciiFxCtx || !ascii.width || !ascii.height) return;

    asciiFxCtx.clearRect(0, 0, ascii.width, ascii.height);
    if (!ascii.pointerActive || !state.asciiStarted) return;

    const { area, cellW, cellH } = ascii;
    const localX = ascii.pointerX - area.x;
    const localY = ascii.pointerY - area.y;
    if (localX < 0 || localY < 0 || localX > area.w || localY > area.h) return;

    const startX = Math.floor(localX / cellW) - 3;
    const startY = Math.floor(localY / cellH) - 2;

    asciiFxCtx.font = `${ascii.fontSize}px 'JetBrains Mono', monospace`;
    asciiFxCtx.textAlign = 'left';
    asciiFxCtx.textBaseline = 'top';

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        if (Math.random() < 0.42) continue;
        const char = ASCII_GLYPHS[Math.floor(Math.random() * ASCII_GLYPHS.length)];
        asciiFxCtx.fillStyle = Math.random() > 0.62 ? 'rgba(216,255,62,0.82)' : 'rgba(255,59,36,0.7)';
        asciiFxCtx.fillText(char, area.x + (startX + x) * cellW, area.y + (startY + y) * cellH);
      }
    }

    asciiFxCtx.strokeStyle = 'rgba(216, 255, 62, 0.35)';
    asciiFxCtx.lineWidth = 1;
    asciiFxCtx.strokeRect(
      area.x + startX * cellW + 2,
      area.y + startY * cellH + 2,
      cellW * 7 - 4,
      cellH * 5 - 4
    );
  }

  function scheduleAsciiFx() {
    if (ascii.fxRaf) return;
    ascii.fxRaf = requestAnimationFrame(drawAsciiFx);
  }

  function initAscii() {
    if (!asciiStage || !asciiCtx) return;

    resizeAscii();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (state.asciiStarted) renderAscii(1);
      });
    }

    asciiStage.addEventListener(
      'pointermove',
      (event) => {
        const rect = asciiStage.getBoundingClientRect();
        ascii.pointerX = event.clientX - rect.left;
        ascii.pointerY = event.clientY - rect.top;
        ascii.pointerActive = true;
        scheduleAsciiFx();
      },
      { passive: true }
    );

    asciiStage.addEventListener('pointerleave', () => {
      ascii.pointerActive = false;
      scheduleAsciiFx();
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            ascii.inView = true;
            startAsciiDecode();
          });
        },
        { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
      );
      observer.observe(asciiStage);
    } else {
      ascii.inView = true;
      startAsciiDecode();
    }
  }

  /* -----------------------------------------------------------------------
     Route transition
     ----------------------------------------------------------------------- */
  const routeWipe = $('#route-wipe');
  const routeLabel = $('#route-label');
  const routeNames = {
    top: 'INTRO',
    hero: 'INTRO',
    studio: 'STUDIO',
    system: 'SYSTEM',
    work: 'WORK',
    fragments: 'ARCHIVE',
    services: 'SERVICES',
    recognition: 'AWARDS',
    contact: 'CONTACT'
  };

  function navigateWithWipe(href) {
    const target = href === '#top' ? document.getElementById('top') : document.querySelector(href);
    if (!target) return;

    if (reduceMotion || !routeWipe) {
      scrollToTarget(href);
      if (history.pushState) history.pushState(null, '', href);
      return;
    }

    if (state.routeBusy) return;
    state.routeBusy = true;

    if (routeLabel) {
      routeLabel.textContent = `LOADING / ${routeNames[href.replace('#', '')] || 'MODULE'}`;
    }

    routeWipe.classList.remove('is-out');
    routeWipe.classList.add('is-active');

    window.setTimeout(() => {
      if (href === '#top') {
        if (lenis) lenis.scrollTo(0, { immediate: true });
        else window.scrollTo(0, 0);
      } else if (lenis) {
        lenis.scrollTo(target, { immediate: true });
      } else {
        target.scrollIntoView();
      }

      if (history.pushState) history.pushState(null, '', href);
      updateScroll(true);

      window.setTimeout(() => {
        routeWipe.classList.add('is-out');
        window.setTimeout(() => {
          routeWipe.classList.remove('is-active', 'is-out');
          state.routeBusy = false;
        }, 460);
      }, 60);
    }, 360);
  }

  /* -----------------------------------------------------------------------
     ASCII Lab — piezas animadas de ascii-magic-art
     ----------------------------------------------------------------------- */
  const LAB_PIECES = {
    'liquid-chrome': {
      name: 'Liquid Chrome',
      cols: 88,
      rows: 32,
      fps: 30,
      note: 'Mercurio líquido que se fusiona, se separa y refleja un estudio imaginario. Una pieza generativa, cuadro a cuadro.'
    },
    'spinning-torus': {
      name: 'Spinning Torus',
      cols: 48,
      rows: 24,
      fps: 30,
      note: 'Un anillo iluminado girando en dos ejes. Geometría pura dibujada con una rampa clásica de caracteres.'
    },
    'ivan-decode': {
      name: 'Deushima Decode',
      cols: 90,
      rows: 22,
      fps: 24,
      note: 'Un titular de bloque se desencripta columna a columna entre el ruido. Adaptación de decode-reveal con el nombre de la marca.'
    },
    'wireframe-globe': {
      name: 'Wireframe Globe',
      cols: 60,
      rows: 30,
      fps: 30,
      note: 'Una esfera de alambre de latitudes y longitudes girando sobre un eje inclinado, con líneas cercanas y lejanas.'
    }
  };

  const labSection = $('#ascii-lab');
  const labStage = $('#lab-stage');
  const labPre = $('#lab-pre');
  const labTitle = $('#lab-title');
  const labNote = $('#lab-note');
  const labGrid = $('#lab-grid');
  const labFps = $('#lab-fps');
  const labLook = $('#lab-look');
  const labUiMode = $('#lab-ui-mode');
  const labBoot = $('#lab-boot');
  const labPieceButtons = $$('[data-lab-piece]');
  const labLookButtons = $$('[data-lab-look]');
  const labMonoButton = $('[data-lab-mono]');
  const labPauseButton = $('[data-lab-pause]');
  const lab = {
    piece: 'liquid-chrome',
    look: 'ascii',
    mono: false,
    paused: reduceMotion,
    stop: null,
    mounted: false,
    switchingTimer: 0
  };

  function updateLabUI() {
    const data = LAB_PIECES[lab.piece];
    if (!data) return;

    if (labTitle) labTitle.textContent = data.name;
    if (labNote) labNote.textContent = data.note;
    if (labGrid) labGrid.textContent = `${pad(data.cols, 3)} × ${pad(data.rows, 3)}`;
    if (labFps) labFps.textContent = String(data.fps);
    if (labLook) labLook.textContent = lab.look.toUpperCase();
    if (labUiMode) labUiMode.textContent = `LOOK: ${lab.look.toUpperCase()}`;

    labPieceButtons.forEach((button) => {
      const active = button.dataset.labPiece === lab.piece;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    labLookButtons.forEach((button) => {
      const active = button.dataset.labLook === lab.look;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (labMonoButton) {
      labMonoButton.classList.toggle('is-active', lab.mono);
      labMonoButton.classList.toggle('is-current', !lab.mono);
      labMonoButton.setAttribute('aria-pressed', String(lab.mono));
      labMonoButton.textContent = lab.mono ? 'Mono' : 'Color';
    }

    if (labPauseButton) {
      labPauseButton.classList.toggle('is-active', lab.paused);
      labPauseButton.setAttribute('aria-pressed', String(lab.paused));
      labPauseButton.textContent = lab.paused ? 'Play' : 'Pausa';
    }

    if (labStage) {
      labStage.setAttribute('aria-label', `${data.name}, pieza ASCII animada de ascii-magic-art`);
    }
  }

  function mountLab(animate = true) {
    const data = LAB_PIECES[lab.piece];
    if (!data || !labStage || !labPre) return;

    labStage.classList.remove('is-live');
    if (animate) {
      labStage.classList.add('is-switching');
      window.clearTimeout(lab.switchingTimer);
      lab.switchingTimer = window.setTimeout(() => labStage.classList.remove('is-switching'), 620);
    }

    if (lab.stop) {
      lab.stop();
      lab.stop = null;
    }

    $$('canvas', labStage).forEach((canvas) => canvas.remove());
    labPre._canvas = null;
    labPre.style.display = '';
    labPre.style.fontSize = '16px';

    if (!window.AsciiLab || !window.AsciiLab.play || !window.AsciiLab.pieces[lab.piece]) {
      if (labBoot) labBoot.innerHTML = '<span class="mono">ASCII_LAB / OFFLINE</span>';
      return;
    }

    const mod = window.AsciiLab.pieces[lab.piece];
    lab.stop = window.AsciiLab.play(labPre, mod, {
      speed: 1,
      still: lab.paused || reduceMotion,
      look: {
        look: lab.look,
        mono: lab.mono
      }
    });

    lab.mounted = true;
    window.setTimeout(() => {
      if (!labStage) return;
      labStage.classList.add('is-live');
      if (labBoot) labBoot.remove();
    }, 160);
  }

  function initLab() {
    if (!labSection || !labStage || !labPre) return;
    updateLabUI();

    labPieceButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (lab.piece === button.dataset.labPiece) return;
        lab.piece = button.dataset.labPiece;
        updateLabUI();
        mountLab();
      });
    });

    labLookButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (lab.look === button.dataset.labLook) return;
        lab.look = button.dataset.labLook;
        updateLabUI();
        mountLab();
      });
    });

    if (labMonoButton) {
      labMonoButton.addEventListener('click', () => {
        lab.mono = !lab.mono;
        updateLabUI();
        mountLab();
      });
    }

    if (labPauseButton) {
      labPauseButton.addEventListener('click', () => {
        lab.paused = !lab.paused;
        updateLabUI();
        mountLab(false);
      });
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || lab.mounted) return;
            observer.disconnect();
            mountLab();
          });
        },
        { threshold: 0.12, rootMargin: '280px 0px' }
      );
      observer.observe(labSection);
    } else {
      mountLab();
    }
  }

  /* -----------------------------------------------------------------------
     Reveals
     ----------------------------------------------------------------------- */
  function initReveals() {
    const targets = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* -----------------------------------------------------------------------
     Contadores
     ----------------------------------------------------------------------- */
  function initCounters() {
    const counters = $$('[data-count]');
    if (!counters.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      counters.forEach((el) => {
        el.textContent = el.dataset.count;
      });
      return;
    }

    const animate = (el) => {
      const target = Number(el.dataset.count) || 0;
      const duration = 1350;
      const started = performance.now();

      const frame = (now) => {
        const t = clamp((now - started) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animate(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.7 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  /* -----------------------------------------------------------------------
     Cursor personalizado
     ----------------------------------------------------------------------- */
  function initCursor() {
    if (!finePointer || reduceMotion) return;

    const dot = $('.cursor');
    const ring = $('.cursor__ring');
    const label = $('[data-cursor-label]');
    if (!dot || !ring) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    window.addEventListener(
      'mousemove',
      (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        body.classList.add('has-cursor', 'cursor-ready');
        body.classList.remove('cursor-hidden');
        dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      },
      { passive: true }
    );

    document.addEventListener('pointerover', (event) => {
      const custom = event.target.closest('[data-cursor]');
      const link = event.target.closest('a, button');

      body.classList.toggle('cursor-hover', Boolean(custom));
      body.classList.toggle('cursor-link', !custom && Boolean(link));

      if (custom && label) {
        label.textContent = custom.dataset.cursor || 'Ver';
      }
    });

    document.addEventListener('mouseleave', () => {
      body.classList.add('cursor-hidden');
    });

    document.addEventListener('mouseenter', () => {
      body.classList.remove('cursor-hidden');
    });

    function loop() {
      ringX = lerp(ringX, mouseX, 0.16);
      ringY = lerp(ringY, mouseY, 0.16);
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  /* -----------------------------------------------------------------------
     Preview de servicios
     ----------------------------------------------------------------------- */
  function initServicesPreview() {
    const preview = $('#services-preview');
    const services = $$('.service');
    if (!preview || !services.length || !finePointer || reduceMotion) return;

    const previewImg = $('img', preview);
    let mouseX = 0;
    let mouseY = 0;
    let x = 0;
    let y = 0;
    let visible = false;

    services.forEach((service) => {
      service.addEventListener('mouseenter', () => {
        const src = service.dataset.preview;
        if (src && previewImg) previewImg.src = src;
        visible = true;
        preview.classList.add('is-visible');
      });

      service.addEventListener('mouseleave', () => {
        visible = false;
        preview.classList.remove('is-visible');
      });

      service.addEventListener(
        'mousemove',
        (event) => {
          mouseX = event.clientX;
          mouseY = event.clientY;
        },
        { passive: true }
      );
    });

    function loop() {
      if (visible) {
        x = lerp(x, mouseX, 0.12);
        y = lerp(y, mouseY, 0.12);
      } else {
        x = lerp(x, mouseX, 0.08);
        y = lerp(y, mouseY, 0.08);
      }
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  /* -----------------------------------------------------------------------
     Menú móvil
     ----------------------------------------------------------------------- */
  const menu = $('#menu');
  const menuToggle = $('#menu-toggle');

  function setMenu(open) {
    if (!menu || !menuToggle) return;
    state.menuOpen = open;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuToggle.setAttribute('aria-expanded', String(open));
    body.classList.toggle('menu-open', open);

    if (lenis) {
      if (open) lenis.stop();
      else lenis.start();
    }
  }

  function initMenu() {
    if (!menu || !menuToggle) return;

    menuToggle.addEventListener('click', () => setMenu(!state.menuOpen));

    $$('a', menu).forEach((link) => {
      link.addEventListener('click', () => setMenu(false));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.menuOpen) setMenu(false);
    });
  }

  /* -----------------------------------------------------------------------
     Casos
     ----------------------------------------------------------------------- */
  const caseModal = $('#case-modal');
  const caseContent = $('#case-content');
  const caseClose = $('.case-modal__close');
  let previouslyFocused = null;

  const cases = {
    nocturna: {
      index: '01',
      title: 'Nocturna',
      subtitle: 'Una marca para la noche que no necesita gritar.',
      year: '2025',
      location: 'Buenos Aires, AR',
      role: 'Identidad · Dirección de arte · Motion',
      challenge:
        'Nocturna había crecido de una fiesta entre amigos a un festival de tres días. La marca existía, pero no tenía un sistema: cada edición parecía una marca distinta y la comunicación se perdía entre luces, flyers y stories.',
      response:
        'Construimos un sistema que se comporta como el sonido: un módulo tipográfico que se estira, se corta y se repite; un rojo saturado como señal de entrada; y una gramática visual que cambia de intensidad según el horario. Del line-up al escenario, todo respira con la misma lógica.',
      metrics: [
        ['+38%', 'asistencia récord'],
        ['12k', 'piezas impresas'],
        ['3', 'días de festival']
      ],
      images: [
        ['assets/img/nocturna.webp', 'Campaña visual de Nocturna con tinta roja y azul'],
        ['assets/img/fragment-gradient.webp', 'Estudio de luz y color para la identidad de Nocturna'],
        ['assets/img/fragment-swatches.webp', 'Paleta cromática y pruebas de impresión de Nocturna']
      ],
      next: 'lumen'
    },
    lumen: {
      index: '02',
      title: 'Lumen',
      subtitle: 'El cuidado de la piel como una pausa, no como un procedimiento.',
      year: '2024',
      location: 'Ámsterdam, NL',
      role: 'Branding · Packaging · Dirección de arte',
      challenge:
        'Lumen quería entrar en un mercado saturado de promesas clínicas sin parecer otra marca de laboratorio. El desafío era traducir el cuidado de la piel a una experiencia sensorial, serena y premium, sin perder claridad.',
      response:
        'Creamos un sistema de identidad basado en la luz: un logotipo de trazos finos, una paleta de arena y ámbar, y un packaging que se sostiene como un objeto de ritual. La fotografía y el tono de voz completan una marca que baja el volumen para que el gesto se escuche.',
      metrics: [
        ['+27%', 'recompra'],
        ['04', 'rituales'],
        ['01', 'nueva categoría']
      ],
      images: [
        ['assets/img/lumen.webp', 'Envase de Lumen sobre arena y cactus'],
        ['assets/img/fragment-lumen.webp', 'Packaging y sistema de producto de Lumen'],
        ['assets/img/fragment-blue.webp', 'Textura azul utilizada en la campaña de Lumen']
      ],
      next: 'eter'
    },
    eter: {
      index: '03',
      title: 'Éter',
      subtitle: 'Cuerpo, memoria y deseo en una retícula que respira.',
      year: '2024',
      location: 'Ciudad de México, MX',
      role: 'Dirección editorial · Fotografía · Arte',
      challenge:
        'Éter nació como una revista impresa sobre lo intangible, pero su equipo venía de mundos muy distintos: fotografía, filosofía y moda. Había que darles una estructura editorial que uniera esas voces sin domesticarlas.',
      response:
        'Diseñamos una retícula que se rompe de forma intencional, con tres escalas tipográficas y una secuencia de imágenes que respira lento. La dirección de arte trabajó con el cuerpo y el error como material, no como ruido.',
      metrics: [
        ['04', 'ediciones'],
        ['02', 'países'],
        ['01', 'D&AD']
      ],
      images: [
        ['assets/img/eter.webp', 'Retrato editorial de la revista Éter'],
        ['assets/img/fragment-eter.webp', 'Selección de imagen para Éter'],
        ['assets/img/fragment-street.webp', 'Fotografía de calle para la dirección de arte de Éter']
      ],
      next: 'monolito'
    },
    monolito: {
      index: '04',
      title: 'Monolito',
      subtitle: 'Una identidad con el peso, el vacío y la estructura del hormigón.',
      year: '2023',
      location: 'Santiago, CL',
      role: 'Identidad · Digital · Señalética',
      challenge:
        'Después de una década de proyectos, Monolito necesitaba una identidad que estuviera a la altura de su arquitectura: rigurosa, silenciosa, pero capaz de habitar lo digital sin perder peso.',
      response:
        'Partimos del vacío como material. Un sistema modular de paneles, una tipografía compacta y un sitio editorial que se lee como una planta: por capas, sin adornos. La señalética traslada la lógica del edificio al espacio público.',
      metrics: [
        ['+64%', 'leads'],
        ['01', 'sistema'],
        ['03', 'sedes']
      ],
      images: [
        ['assets/img/monolito.webp', 'Arquitectura de paneles blancos para Monolito'],
        ['assets/img/fragment-monolito.webp', 'Detalle de retícula y arquitectura de Monolito'],
        ['assets/img/fragment-blue.webp', 'Textura de exploración visual para Monolito']
      ],
      next: 'nocturna'
    }
  };

  const caseOrder = ['nocturna', 'lumen', 'eter', 'monolito'];

  function renderCase(key) {
    const data = cases[key];
    if (!data || !caseContent) return;

    const nextIndex = (caseOrder.indexOf(key) + 1) % caseOrder.length;
    const nextKey = caseOrder[nextIndex];
    const nextCase = cases[nextKey];

    caseContent.innerHTML = `
      <div class="case__head">
        <span class="mono">Caso ${data.index} / 04</span>
        <span class="mono">${data.year} — ${data.location}</span>
      </div>

      <h2 class="case__title" id="case-title">${data.title}</h2>
      <p class="case__sub">${data.subtitle}</p>

      <div class="case__meta">
        <div><span class="mono">Rol</span><p>${data.role}</p></div>
        <div><span class="mono">Año</span><p>${data.year}</p></div>
        <div><span class="mono">Lugar</span><p>${data.location}</p></div>
      </div>

      <figure class="case__hero">
        <img src="${data.images[0][0]}" alt="${data.images[0][1]}" loading="eager">
        <figcaption class="mono">${data.title} — imagen principal</figcaption>
      </figure>

      <div class="case__body">
        <section>
          <span class="mono">01 — El desafío</span>
          <p>${data.challenge}</p>
        </section>
        <section>
          <span class="mono">02 — La respuesta</span>
          <p>${data.response}</p>
        </section>
        <section class="case__impact">
          <span class="mono">03 — Impacto</span>
          <div class="case__metrics">
            ${data.metrics.map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('')}
          </div>
        </section>
      </div>

      <div class="case__gallery">
        ${data.images
          .slice(1)
          .map(
            ([src, alt], i) => `
            <figure>
              <img src="${src}" alt="${alt}" loading="lazy">
              <figcaption class="mono">Fragmento ${pad(i + 1)} / ${data.title}</figcaption>
            </figure>`
          )
          .join('')}
      </div>

      <button class="case__next" type="button" data-next-case="${nextKey}">
        <span class="mono">Siguiente caso — ${nextCase.index}</span>
        <strong>${nextCase.title} <span aria-hidden="true">↗</span></strong>
      </button>
    `;

    const title = $('.case__title', caseContent);
    if (title) scrambleText(title, 760);
  }

  function openCase(key) {
    if (!caseModal || !caseContent || !cases[key]) return;

    previouslyFocused = document.activeElement;
    renderCase(key);
    state.modalOpen = true;
    caseModal.classList.add('is-open');
    caseModal.setAttribute('aria-hidden', 'false');
    body.classList.add('case-open');

    if (lenis) lenis.stop();
    caseContent.scrollTop = 0;
    if (caseClose) caseClose.focus({ preventScroll: true });
  }

  function closeCase() {
    if (!caseModal || !state.modalOpen) return;

    state.modalOpen = false;
    caseModal.classList.remove('is-open');
    caseModal.setAttribute('aria-hidden', 'true');
    body.classList.remove('case-open');

    if (lenis) lenis.start();
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus({ preventScroll: true });
    }
  }

  function initCases() {
    if (!caseModal) return;

    document.addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-case-open]');
      if (openButton) {
        openCase(openButton.dataset.caseOpen);
        return;
      }

      const closeTrigger = event.target.closest('[data-case-close]');
      if (closeTrigger) {
        closeCase();
        return;
      }

      const nextButton = event.target.closest('[data-next-case]');
      if (nextButton) {
        renderCase(nextButton.dataset.nextCase);
        if (caseContent) caseContent.scrollTop = 0;
        if (caseClose) caseClose.focus({ preventScroll: true });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!state.modalOpen) return;

      if (event.key === 'Escape') {
        closeCase();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = $$(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          caseModal
        ).filter((el) => el.offsetParent !== null);

        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* -----------------------------------------------------------------------
     Copiar email
     ----------------------------------------------------------------------- */
  const toast = $('#toast');
  let toastTimer = 0;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Email copiado');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Email copiado');
      } catch (fallbackError) {
        showToast(text);
      }
      document.body.removeChild(textarea);
    }
  }

  function initCopy() {
    const copyButton = $('[data-copy]');
    if (!copyButton) return;
    copyButton.addEventListener('click', () => copyText(copyButton.dataset.copy));
  }

  /* -----------------------------------------------------------------------
     Navegación por anclas
     ----------------------------------------------------------------------- */
  function initAnchors() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();

      if (link.classList.contains('skip-link')) {
        target.scrollIntoView();
        return;
      }

      if (state.menuOpen) setMenu(false);
      navigateWithWipe(href);
    });

    railButtons.forEach((button) => {
      button.addEventListener('click', () => {
        navigateWithWipe(`#${button.dataset.rail}`);
      });
    });
  }

  /* -----------------------------------------------------------------------
     Resize
     ----------------------------------------------------------------------- */
  function onResize() {
    resizeCanvas();
    resizeAscii();
    updateScroll(true);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 140);
  });

  /* -----------------------------------------------------------------------
     Init
     ----------------------------------------------------------------------- */
  function init() {
    resizeCanvas();
    wordSpans = wrapWords(wordRoot);
    initReveals();
    initCounters();
    initCursor();
    initServicesPreview();
    initScrambles();
    initAscii();
    initLab();
    initMenu();
    initCases();
    initCopy();
    initAnchors();
    updateBootLog(0);

    loadFrames();

    if (reduceMotion) {
      $$('.w').forEach((word) => word.classList.add('is-lit'));
      statementEls.forEach((el) => el.classList.remove('is-active'));
      body.classList.add('is-ready');
    }

    updateScroll(true);
  }

  init();
})();
