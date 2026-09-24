(() => {
  'use strict';

  const control = document.querySelector('[data-section-jump]');
  const hero = document.querySelector('.hero--node-canvas');
  const footer = document.querySelector('.site-footer');
  if (!(control instanceof HTMLButtonElement) || !hero || !footer) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let direction = control.dataset.direction === 'up' ? 'up' : 'down';
  let animationFrame = 0;
  let scrollSyncFrame = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function maxScrollY() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function documentTop(element) {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  function getTargets() {
    const max = maxScrollY();
    return {
      canvas: clamp(documentTop(hero), 0, max),
      footer: clamp(documentTop(footer), 0, max),
      max
    };
  }

  function setDirection(nextDirection) {
    if (nextDirection !== 'up' && nextDirection !== 'down') return;
    direction = nextDirection;
    control.dataset.direction = nextDirection;
    const label = nextDirection === 'up' ? 'Volver al canvas' : 'Bajar al footer';
    control.setAttribute('aria-label', label);
    control.title = label;
  }

  function syncDirectionAtLimits() {
    const targets = getTargets();
    const tolerance = clamp(window.innerHeight * 0.01, 4, 12);
    control.hidden = targets.max <= tolerance;
    if (control.hidden) return;

    if (window.scrollY >= targets.footer - tolerance) {
      setDirection('up');
    } else if (window.scrollY <= targets.canvas + tolerance) {
      setDirection('down');
    }
  }

  function easeInOutCubic(progress) {
    return progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  }

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    document.body.classList.remove('is-section-jumping');
  }

  function animateTo(rawTarget) {
    stopAnimation();

    const destination = clamp(rawTarget, 0, maxScrollY());
    const start = window.scrollY;
    const distance = destination - start;

    if (Math.abs(distance) < 1 || reducedMotion.matches) {
      window.scrollTo(0, destination);
      syncDirectionAtLimits();
      return;
    }

    const duration = clamp(640 + Math.abs(distance) * 0.12, 640, 1050);
    const startedAt = performance.now();
    document.body.classList.add('is-section-jumping');

    const step = now => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      window.scrollTo(0, start + distance * easeInOutCubic(progress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
        return;
      }

      animationFrame = 0;
      window.scrollTo(0, destination);
      document.body.classList.remove('is-section-jumping');
      syncDirectionAtLimits();
    };

    animationFrame = requestAnimationFrame(step);
  }

  control.addEventListener('click', () => {
    const targets = getTargets();
    animateTo(direction === 'up' ? targets.canvas : targets.footer);
  });

  function requestDirectionSync() {
    if (scrollSyncFrame) return;
    scrollSyncFrame = requestAnimationFrame(() => {
      scrollSyncFrame = 0;
      syncDirectionAtLimits();
    });
  }

  window.addEventListener('scroll', requestDirectionSync, { passive: true });
  window.addEventListener('resize', requestDirectionSync, { passive: true });

  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) stopAnimation();
    syncDirectionAtLimits();
  });

  syncDirectionAtLimits();
})();
