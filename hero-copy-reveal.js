(() => {
  'use strict';

  const CONFIG = Object.freeze({
    triggerDelay: 560,
    appearDuration: 500,
    travelDuration: 1000,
    settleDuration: 500,
    totalDuration: 2000,
    textStart: 500,
    textDuration: 900,
    lineStagger: 80,
    resetReplayDelay: 110,
    reducedFadeDuration: 260,
    appearEasing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    travelEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    textEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    glow: Object.freeze({
      color: 'rgba(190, 224, 255, 0.88)',
      size: '4.4rem',
      maxOpacity: 0.72,
      trailOpacity: 0.18,
      trailLength: '2.5rem'
    })
  });

  const root = document.querySelector('[data-hero-copy-reveal]');
  const stage = document.querySelector('[data-hero-node-stage]');
  const resetButton = stage?.querySelector('[data-node-reset]');
  if (!root || !stage) return;

  document.documentElement.classList.add('has-hero-copy-reveal');

  const stars = [...root.querySelectorAll('[data-hero-copy-star]')];
  const lines = [...root.querySelectorAll('[data-hero-copy-line]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  root.style.setProperty('--hero-copy-glow-color', CONFIG.glow.color);
  root.style.setProperty('--hero-copy-glow-size', CONFIG.glow.size);
  root.style.setProperty('--hero-copy-trail-length', CONFIG.glow.trailLength);

  let stageVisible = false;
  let initialPlayed = false;
  let initialTimer = 0;
  let finishTimer = 0;
  let runId = 0;
  let activeAnimations = [];

  function cancelCurrent() {
    runId += 1;
    window.clearTimeout(finishTimer);
    activeAnimations.forEach((animation) => {
      try { animation.cancel(); } catch {}
    });
    activeAnimations = [];
    root.classList.remove('is-copy-reveal-playing', 'is-copy-reveal-measuring');
  }

  function isSceneReady() {
    return (
      document.body.classList.contains('is-site-ready') &&
      !document.documentElement.classList.contains('has-studio-splash') &&
      !document.body.classList.contains('is-content-panel-open')
    );
  }

  function visibleLines() {
    return lines.filter((line) => {
      const owner = line.closest('h1, p, strong');
      return owner && getComputedStyle(owner).display !== 'none';
    });
  }

  function animateReduced() {
    cancelCurrent();
    const thisRun = runId;
    root.classList.remove('is-copy-reveal-complete');

    const targets = [
      ...visibleLines(),
      ...stars.filter((star) => getComputedStyle(star).display !== 'none')
    ];

    targets.forEach((target) => {
      const animation = target.animate([
        { opacity: 0 },
        { opacity: 1 }
      ], {
        duration: CONFIG.reducedFadeDuration,
        easing: 'ease-out',
        fill: 'both'
      });
      activeAnimations.push(animation);
    });

    finishTimer = window.setTimeout(() => {
      if (thisRun !== runId) return;
      root.classList.add('is-copy-reveal-complete');
      activeAnimations.forEach((animation) => {
        try { animation.cancel(); } catch {}
      });
      activeAnimations = [];
    }, CONFIG.reducedFadeDuration + 30);
  }

  async function animateFull() {
    cancelCurrent();
    const thisRun = runId;
    root.classList.remove('is-copy-reveal-complete');
    root.classList.add('is-copy-reveal-measuring', 'is-copy-reveal-playing');

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (thisRun !== runId) return;

    const rootRect = root.getBoundingClientRect();
    const centerX = rootRect.left + rootRect.width / 2;
    const centerY = rootRect.top + rootRect.height / 2;

    stars.forEach((star) => {
      const rect = star.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const starCenterX = rect.left + rect.width / 2;
      const starCenterY = rect.top + rect.height / 2;
      const dx = centerX - starCenterX;
      const dy = centerY - starCenterY;
      const appearEnd = CONFIG.appearDuration / CONFIG.totalDuration;
      const travelEnd = (CONFIG.appearDuration + CONFIG.travelDuration) / CONFIG.totalDuration;

      const flight = star.animate([
        {
          offset: 0,
          opacity: 0,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(0)`,
          easing: CONFIG.appearEasing
        },
        {
          offset: appearEnd,
          opacity: 1,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)`,
          easing: CONFIG.travelEasing
        },
        {
          offset: travelEnd,
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)',
          easing: 'ease-out'
        },
        {
          offset: 1,
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)'
        }
      ], {
        duration: CONFIG.totalDuration,
        fill: 'both'
      });
      activeAnimations.push(flight);

      const primary = star.querySelector('.hero__pin-shape--primary');
      const secondary = star.querySelector('.hero__pin-shape--secondary');
      [
        [primary, 0, 90, 180],
        [secondary, 45, 135, 225]
      ].forEach(([shape, start, middle, end]) => {
        if (!shape) return;
        const rotation = shape.animate([
          { offset: 0, transform: `rotate(${start}deg) scale(${start === 45 ? 0.58 : 1})`, easing: CONFIG.appearEasing },
          { offset: appearEnd, transform: `rotate(${middle}deg) scale(${start === 45 ? 0.58 : 1})`, easing: CONFIG.travelEasing },
          { offset: travelEnd, transform: `rotate(${end}deg) scale(${start === 45 ? 0.58 : 1})` },
          { offset: 1, transform: `rotate(${end}deg) scale(${start === 45 ? 0.58 : 1})` }
        ], {
          duration: CONFIG.totalDuration,
          fill: 'both'
        });
        activeAnimations.push(rotation);
      });

      const halo = star.querySelector('.hero__pin-halo');
      if (halo) {
        const max = CONFIG.glow.maxOpacity;
        const glow = halo.animate([
          { offset: 0, opacity: 0, transform: 'translate(-50%, -50%) scale(0.35)' },
          { offset: 0.12, opacity: max * 0.72, transform: 'translate(-50%, -50%) scale(0.9)' },
          { offset: appearEnd, opacity: max * 0.84, transform: 'translate(-50%, -50%) scale(1.02)' },
          { offset: 0.5, opacity: max, transform: 'translate(-50%, -50%) scale(1.16)' },
          { offset: travelEnd, opacity: max * 0.56, transform: 'translate(-50%, -50%) scale(1.04)' },
          { offset: 1, opacity: 0, transform: 'translate(-50%, -50%) scale(0.92)' }
        ], {
          duration: CONFIG.totalDuration,
          easing: 'ease-out',
          fill: 'both'
        });
        activeAnimations.push(glow);
      }

      const trail = star.querySelector('.hero__pin-trail');
      if (trail) {
        const trailAnimation = trail.animate([
          { offset: 0, opacity: 0, transform: 'translateY(-50%) scaleX(0.08)' },
          { offset: appearEnd, opacity: 0, transform: 'translateY(-50%) scaleX(0.08)' },
          { offset: 0.36, opacity: CONFIG.glow.trailOpacity * 0.72, transform: 'translateY(-50%) scaleX(0.66)' },
          { offset: 0.53, opacity: CONFIG.glow.trailOpacity, transform: 'translateY(-50%) scaleX(1)' },
          { offset: travelEnd, opacity: 0, transform: 'translateY(-50%) scaleX(0.32)' },
          { offset: 1, opacity: 0, transform: 'translateY(-50%) scaleX(0.2)' }
        ], {
          duration: CONFIG.totalDuration,
          easing: 'ease-out',
          fill: 'both'
        });
        activeAnimations.push(trailAnimation);
      }
    });

    visibleLines().forEach((line, index) => {
      const delay = CONFIG.textStart + index * CONFIG.lineStagger;
      const reveal = line.animate([
        {
          clipPath: 'inset(0 50% 0 50%)',
          opacity: 0,
          filter: 'blur(5px)',
          transform: 'translate3d(0, 0.42rem, 0)'
        },
        {
          offset: 0.38,
          opacity: 0.82,
          filter: 'blur(2px)'
        },
        {
          clipPath: 'inset(0 0% 0 0%)',
          opacity: 1,
          filter: 'blur(0px)',
          transform: 'translate3d(0, 0, 0)'
        }
      ], {
        duration: CONFIG.textDuration,
        delay,
        easing: CONFIG.textEasing,
        fill: 'both'
      });
      activeAnimations.push(reveal);
    });

    root.classList.remove('is-copy-reveal-measuring');

    finishTimer = window.setTimeout(() => {
      if (thisRun !== runId) return;
      root.classList.add('is-copy-reveal-complete');
      root.classList.remove('is-copy-reveal-playing');
      activeAnimations.forEach((animation) => {
        try { animation.cancel(); } catch {}
      });
      activeAnimations = [];
    }, CONFIG.totalDuration + 40);
  }

  function play() {
    if (reducedMotion.matches) {
      animateReduced();
      return;
    }
    animateFull();
  }

  function scheduleInitial() {
    if (initialPlayed || initialTimer || !stageVisible || !isSceneReady()) return;
    initialTimer = window.setTimeout(() => {
      initialTimer = 0;
      if (!stageVisible || !isSceneReady()) return;
      initialPlayed = true;
      play();
    }, CONFIG.triggerDelay);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      stageVisible = Boolean(entries[0]?.isIntersecting);
      if (stageVisible) scheduleInitial();
    }, {
      threshold: 0.3
    });
    observer.observe(stage);
  } else {
    stageVisible = true;
  }

  const sceneObserver = new MutationObserver(scheduleInitial);
  sceneObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  sceneObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  resetButton?.addEventListener('click', () => {
    window.clearTimeout(initialTimer);
    initialTimer = 0;
    window.setTimeout(() => {
      if (stageVisible && isSceneReady()) play();
    }, CONFIG.resetReplayDelay);
  });

  reducedMotion.addEventListener?.('change', () => {
    if (!root.classList.contains('is-copy-reveal-complete')) return;
    cancelCurrent();
    root.classList.add('is-copy-reveal-complete');
  });

  window.DeushimaHeroCopyReveal = Object.freeze({
    config: CONFIG,
    replay: play
  });

  scheduleInitial();
})();
