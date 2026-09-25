(() => {
  'use strict';

  const root = document.querySelector('[data-card-nav]');
  const nav = root?.querySelector('[data-card-nav-shell]');
  const toggle = root?.querySelector('[data-card-nav-toggle]');
  const content = root?.querySelector('[data-card-nav-content]');
  const dragSurface = root?.querySelector('.card-nav-top');
  const cards = Array.from(root?.querySelectorAll('[data-card-nav-card]') || []);

  if (!root || !nav || !toggle || !content || !dragSurface || !cards.length) return;

  let isExpanded = false;
  let timeline = null;
  let offsetX = 0;
  let offsetY = 0;
  let dragState = null;
  let suppressClick = false;
  let reboundTimer = 0;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function applyOffset() {
    root.style.setProperty('--card-nav-x', offsetX + 'px');
    root.style.setProperty('--card-nav-y', offsetY + 'px');
  }

  function getDragBounds() {
    const rect = root.getBoundingClientRect();
    const margin = 12;

    return {
      minX: offsetX + margin - rect.left,
      maxX: offsetX + window.innerWidth - margin - rect.right,
      minY: offsetY + margin - rect.top,
      maxY: offsetY + window.innerHeight - margin - rect.bottom
    };
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    if (!dragSurface.contains(event.target)) return;
    if (event.target.closest('a, button')) return;

    const bounds = getDragBounds();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offsetX,
      baseY: offsetY,
      bounds,
      moved: false
    };

    window.clearTimeout(reboundTimer);
    root.classList.remove('is-rebounding');
    root.classList.add('is-dragging');
    root.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.hypot(dx, dy) > 3) dragState.moved = true;

    offsetX = clamp(dragState.baseX + dx, dragState.bounds.minX, dragState.bounds.maxX);
    offsetY = clamp(dragState.baseY + dy, dragState.bounds.minY, dragState.bounds.maxY);
    applyOffset();
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const moved = dragState.moved;
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture(event.pointerId);
    dragState = null;
    root.classList.remove('is-dragging');
    root.classList.remove('is-rebounding');
    void root.offsetWidth;
    root.classList.add('is-rebounding');

    reboundTimer = window.setTimeout(() => {
      root.classList.remove('is-rebounding');
    }, 560);

    if (moved) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  }

  function calculateHeight() {
    if (!isMobile()) return 238;

    const previous = {
      visibility: content.style.visibility,
      pointerEvents: content.style.pointerEvents,
      position: content.style.position,
      height: content.style.height
    };

    content.style.visibility = 'visible';
    content.style.pointerEvents = 'auto';
    content.style.position = 'static';
    content.style.height = 'auto';

    const height = 52 + content.scrollHeight + 8;

    content.style.visibility = previous.visibility;
    content.style.pointerEvents = previous.pointerEvents;
    content.style.position = previous.position;
    content.style.height = previous.height;

    return height;
  }

  function setA11y(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menu' : 'Abrir menu');
    content.setAttribute('aria-hidden', String(!open));
    nav.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
  }

  function buildTimeline() {
    if (timeline?.kill) timeline.kill();

    if (!window.gsap || reducedMotion.matches) {
      timeline = null;
      nav.style.height = isExpanded ? String(calculateHeight()) + 'px' : '52px';
      cards.forEach((card) => {
        card.style.opacity = isExpanded ? '1' : '0';
        card.style.transform = isExpanded ? 'translateY(0)' : 'translateY(50px)';
      });
      return;
    }

    window.gsap.set(nav, { height: 52, overflow: 'hidden' });
    window.gsap.set(cards, { y: 50, opacity: 0 });

    timeline = window.gsap.timeline({ paused: true });
    timeline.to(nav, {
      height: calculateHeight,
      duration: 0.4,
      ease: 'power3.out'
    });
    timeline.to(cards, {
      y: 0,
      opacity: 1,
      duration: 0.4,
      ease: 'power3.out',
      stagger: 0.08
    }, '-=0.1');
  }

  function openMenu() {
    if (isExpanded) return;
    isExpanded = true;
    setA11y(true);

    if (timeline) {
      timeline.play(0);
      return;
    }

    nav.style.height = String(calculateHeight()) + 'px';
    cards.forEach((card) => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  }

  function closeMenu() {
    if (!isExpanded) return;
    setA11y(false);

    if (timeline) {
      timeline.eventCallback('onReverseComplete', () => {
        isExpanded = false;
        if (timeline) timeline.eventCallback('onReverseComplete', null);
      });
      timeline.reverse();
      return;
    }

    isExpanded = false;
    nav.style.height = '52px';
    cards.forEach((card) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(50px)';
    });
  }

  function toggleMenu() {
    if (isExpanded) closeMenu();
    else openMenu();
  }

  toggle.addEventListener('click', toggleMenu);

  root.addEventListener('pointerdown', beginDrag);
  root.addEventListener('pointermove', moveDrag);
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  content.addEventListener('click', (event) => {
    const action = event.target.closest('a, button');
    if (!action) return;
    window.setTimeout(closeMenu, 40);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isExpanded || root.contains(event.target)) return;
    closeMenu();
  });

  window.addEventListener('resize', () => {
    const wasExpanded = isExpanded;
    buildTimeline();

    const bounds = getDragBounds();
    offsetX = clamp(offsetX, bounds.minX, bounds.maxX);
    offsetY = clamp(offsetY, bounds.minY, bounds.maxY);
    applyOffset();

    if (!wasExpanded) return;

    setA11y(true);
    if (timeline) timeline.progress(1);
    else nav.style.height = String(calculateHeight()) + 'px';
  });

  setA11y(false);
  buildTimeline();
})();


(() => {
  if (document.querySelector('script[data-workspace-refinements]')) return;
  const script = document.createElement('script');
  script.src = './workspace-refinements.js?v=20260925-1';
  script.defer = true;
  script.dataset.workspaceRefinements = 'true';
  document.head.appendChild(script);
})();
