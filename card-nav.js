(() => {
  'use strict';

  const root = document.querySelector('[data-card-nav]');
  const nav = root?.querySelector('[data-card-nav-shell]');
  const toggle = root?.querySelector('[data-card-nav-toggle]');
  const content = root?.querySelector('[data-card-nav-content]');
  const cards = Array.from(root?.querySelectorAll('[data-card-nav-card]') || []);

  if (!root || !nav || !toggle || !content || !cards.length) return;

  let isExpanded = false;
  let timeline = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  function calculateHeight() {
    if (!isMobile()) return 260;

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

    const height = 60 + content.scrollHeight + 8;

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
      nav.style.height = isExpanded ? String(calculateHeight()) + 'px' : '60px';
      cards.forEach((card) => {
        card.style.opacity = isExpanded ? '1' : '0';
        card.style.transform = isExpanded ? 'translateY(0)' : 'translateY(50px)';
      });
      return;
    }

    window.gsap.set(nav, { height: 60, overflow: 'hidden' });
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
    nav.style.height = '60px';
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
    if (!wasExpanded) return;

    setA11y(true);
    if (timeline) timeline.progress(1);
    else nav.style.height = String(calculateHeight()) + 'px';
  });

  setA11y(false);
  buildTimeline();
})();
