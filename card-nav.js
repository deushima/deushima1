(() => {
  'use strict';
  const nav = document.querySelector('[data-card-nav]');
  const hero = nav?.closest('.hero--node-canvas');
  const toggle = nav?.querySelector('[data-card-nav-toggle]');
  const drawer = nav?.querySelector('[data-card-nav-drawer]');
  if (!hero || !toggle || !drawer) return;

  const ink = nav.querySelector('.card-nav__ink');
  const tactile = nav.querySelector('.card-nav__tactile');
  const dilate = nav.querySelector('[data-card-nav-dilate]');
  const mass = nav.querySelector('.card-nav__mass');
  const papers = [...nav.querySelectorAll('.card-nav__paper')];
  const groups = [...drawer.querySelectorAll('.directory__group')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'card-nav__close';
  closeButton.setAttribute('data-card-nav-close', '');
  closeButton.setAttribute('aria-label', 'Cerrar categorías');
  drawer.append(closeButton);

  const DURATION = 700;
  const LOGO_W = parseFloat(getComputedStyle(nav).getPropertyValue('--nav-logo-width')) || 172;
  const LOGO_H = LOGO_W * 983 / 3387;
  const THRESHOLD = 6;
  const HOLD_MS = 240;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const camera = () => window.DeushimaHeroCamera;

  // Exact cubic-bezier(.22, 1, .36, 1), shared by the geometric phases.
  const ease = t => {
    t = clamp(t, 0, 1);
    let lo = 0, hi = 1, u = t;
    for (let i = 0; i < 12; i++) {
      const x = 3 * (1 - u) ** 2 * u * .22 + 3 * (1 - u) * u * u * .36 + u ** 3;
      if (x < t) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return t === 0 || t === 1 ? t : 1 - (1 - u) ** 3;
  };
  const phase = (p, a, b) => ease((p - a) / (b - a));

  // Reuse WAAPI: one reversible clock, with frames only while transforming.
  const clock = new Animation(new KeyframeEffect(nav, [], {
    duration: DURATION, fill: 'both'
  }), document.timeline);
  clock.currentTime = 0;
  let frame = 0;
  let open = false;
  let progress = 0;
  let anchor = null;
  let moved = false;
  let drag = null;
  let suppressUntil = 0;
  let geometry = { width: 568, height: 148, cards: [] };
  let pulseTimer = 0;
  let tactileAnimation = null;
  const PULSE_INTERVAL = 6000;
  const TACTILE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function stopPulse() {
    clearTimeout(pulseTimer);
    pulseTimer = 0;
  }

  // Separate visual motion from the world's translation and the logo morph.
  function animateTactile(keyframes, duration) {
    if (!tactile) return;
    const current = getComputedStyle(tactile).transform;
    tactileAnimation?.cancel();
    tactileAnimation = null;
    if (reducedMotion.matches) return;
    const animation = tactile.animate([
      { transform: current === 'none' ? 'scale(1)' : current, offset: 0, easing: TACTILE_EASE },
      ...keyframes
    ], { duration, fill: 'forwards', easing: 'linear' });
    tactileAnimation = animation;
    animation.onfinish = () => {
      // Keep the compression while held; release the idle layer completely.
      if (tactileAnimation !== animation || drag) return;
      animation.cancel();
      tactileAnimation = null;
    };
  }

  function schedulePulse() {
    stopPulse();
    if (open || drag || document.hidden || reducedMotion.matches) return;
    pulseTimer = setTimeout(() => {
      pulseTimer = 0;
      if (open || drag || document.hidden || reducedMotion.matches) return;
      const rect = nav.getBoundingClientRect();
      const obscured = document.documentElement.classList.contains('has-studio-splash')
        || document.body.matches('.is-workspace-immersive, .is-content-panel-open, .is-design-viewer-open, .deu-chat-open');
      if (progress === 0 && !obscured && rect.bottom > 0 && rect.top < innerHeight
        && rect.right > 0 && rect.left < innerWidth) {
        animateTactile([
          { transform: 'scale(1.045)', offset: .48, easing: TACTILE_EASE },
          { transform: 'scale(1)', offset: 1 }
        ], 1000);
      }
      // Start-to-start cadence stays at six seconds, including pulse duration.
      schedulePulse();
    }, PULSE_INTERVAL);
  }

  function showGrip() {
    nav.classList.add('is-gripped');
    animateTactile([{ transform: 'scale(.945)', offset: 1 }], 170);
  }

  function measure() {
    // Layout coordinates, independent of camera zoom.
    geometry = {
      width: drawer.offsetWidth,
      height: drawer.offsetHeight,
      cards: groups.map(group => ({
        x: group.offsetLeft + group.offsetWidth / 2 - drawer.offsetWidth / 2,
        y: group.offsetTop + group.offsetHeight / 2 - drawer.offsetHeight / 2,
        width: group.offsetWidth, height: group.offsetHeight
      }))
    };
  }

  function initialAnchor() {
    const rect = hero.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + (innerWidth < 620 ? 64 : 90);
    return camera()?.screenToWorld(x, y) || { x: x - rect.left, y: y - rect.top };
  }

  function clampWorld() {
    const bounds = camera()?.getWorldBounds();
    if (!bounds || !anchor) return;
    anchor.x = clamp(anchor.x, bounds.minX + 80, bounds.maxX - 80);
    anchor.y = clamp(anchor.y, bounds.minY + 80, bounds.maxY - 80);
  }

  function placement(p) {
    const rect = hero.getBoundingClientRect();
    const worldScale = camera()?.getState().scale || 1;
    const point = camera()?.worldToScreen(anchor.x, anchor.y) || {
      x: rect.left + anchor.x, y: rect.top + anchor.y
    };
    const fitScale = Math.min((innerWidth - 32) / geometry.width, (innerHeight - 32) / geometry.height);
    // Open navigation remains readable at wide zoom and fits at close zoom.
    const menuScale = Math.min(clamp(worldScale, .85, 1.25), fitScale);
    const amount = phase(p, .12, .8);
    const scale = mix(worldScale, menuScale, amount);
    const halfW = geometry.width * menuScale / 2;
    const halfH = geometry.height * menuScale / 2;
    return {
      x: mix(point.x, clamp(point.x, 16 + halfW, innerWidth - 16 - halfW), amount),
      y: mix(point.y, clamp(point.y, 16 + halfH, innerHeight - 16 - halfH), amount),
      scale, rect
    };
  }

  function render(p = progress) {
    if (!anchor) anchor = initialAnchor();
    progress = p;
    const compression = phase(p, 0, .12);
    const stretch = phase(p, .12, .43);
    const division = phase(p, .43, .8);
    const text = phase(p, .78, 1);
    const width = p < .12 ? mix(LOGO_W, LOGO_W * .94, compression)
      : mix(LOGO_W * .94, geometry.width, stretch);
    const height = p < .12 ? mix(LOGO_H, LOGO_H * .9, compression)
      : mix(LOGO_H * .9, LOGO_H, stretch);
    const { x, y, scale, rect } = placement(p);
    nav.style.left = `${x - rect.left}px`;
    nav.style.top = `${y - rect.top}px`;
    nav.style.width = `${width}px`;
    nav.style.height = `${mix(height, geometry.height, division)}px`;
    nav.style.transform = `translate(-50%, -50%) scale(${scale})`;

    // The actual logo alpha swells into a solid sheet before separation.
    // Both surfaces match at the opaque handoff; there is no crossfade.
    ink.style.visibility = p < .43 ? 'visible' : 'hidden';
    ink.style.transform = `scale(${width / LOGO_W}, ${height / LOGO_H})`;
    dilate.setAttribute('radius', String(LOGO_H * .8 * phase(p, .16, .4)));
    mass.style.visibility = p >= .43 ? 'visible' : 'hidden';
    papers.forEach((paper, i) => {
      const target = geometry.cards[i];
      if (!target) return;
      const w = mix(geometry.width / 3 + .25, target.width, division);
      const h = mix(LOGO_H, target.height, division);
      const px = mix((i - 1) * geometry.width / 3, target.x, division);
      const py = mix(0, target.y, division);
      paper.style.width = `${w}px`;
      paper.style.height = `${h}px`;
      paper.style.borderRadius = `${7 * division}px`;
      paper.style.backgroundColor = `rgb(${mix(255, 244, division)}, ${mix(255, 243, division)}, ${mix(255, 238, division)})`;
      paper.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    });
    drawer.style.opacity = String(text);
    drawer.style.transform = `translate(-50%, calc(-50% + ${6 * (1 - text)}px))`;
    const ready = open && p >= .99;
    drawer.inert = !ready;
    drawer.setAttribute('aria-hidden', String(!ready));
    nav.classList.toggle('is-content-ready', ready);
  }

  function tick() {
    frame = 0;
    render(clamp(Number(clock.currentTime || 0) / DURATION, 0, 1));
    if (clock.playState === 'running') frame = requestAnimationFrame(tick);
  }

  function setOpen(next, restoreFocus = false) {
    if (open === next) return;
    stopPulse();
    animateTactile([{ transform: 'scale(1)', offset: 1 }], 150);
    open = next;
    nav.classList.toggle('is-card-nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open
      ? 'Cerrar categorías. Arrastrar desde un espacio libre para mover.'
      : 'Abrir categorías. Mantener presionado y arrastrar para mover.');
    if (!open && (restoreFocus || drawer.contains(document.activeElement))) toggle.focus({ preventScroll: true });
    if (reducedMotion.matches) {
      clock.pause();
      clock.currentTime = open ? DURATION : 0;
      render(open ? 1 : 0);
      if (!open) schedulePulse();
      return;
    }
    clock.playbackRate = open ? 1 : -1;
    clock.play();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  clock.onfinish = () => {
    render(open ? 1 : 0);
    if (!open) schedulePulse();
  };

  function moveAnchor(clientX, clientY) {
    const point = camera()?.screenToWorld(clientX, clientY) || { x: clientX, y: clientY };
    anchor = { x: point.x - drag.grip.x, y: point.y - drag.grip.y };
    clampWorld();
    render();
  }

  function endDrag(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
    const current = drag;
    drag = null;
    clearTimeout(current.timer);
    if (current.moved || current.cancelled || current.held || event?.type !== 'pointerup') {
      suppressUntil = performance.now() + 500;
    }
    nav.classList.remove('is-dragging', 'is-gripped');
    const released = event?.type === 'pointerup' && !current.cancelled;
    const rebound = released && (current.moved || current.held);
    animateTactile(rebound ? [
      { transform: 'scale(1.025)', offset: .42, easing: 'ease-in-out' },
      { transform: 'scale(.997)', offset: .74, easing: 'ease-out' },
      { transform: 'scale(1)', offset: 1 }
    ] : [{ transform: 'scale(1)', offset: 1 }], rebound ? 460 : 160);
    schedulePulse();
    camera()?.clearAutoPan();
    if (nav.hasPointerCapture(current.id)) nav.releasePointerCapture(current.id);
  }

  closeButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, true);
  });

  nav.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || event.target.closest('a, [data-card-nav-close]')) return;
    stopPulse();
    // Fit affects the drag grip, never the stored anchor on an ordinary tap.
    let visualAnchor = anchor;
    if (progress === 1) {
      const point = placement(1);
      visualAnchor = camera()?.screenToWorld(point.x, point.y) || { x: point.x, y: point.y };
    }
    const point = camera()?.screenToWorld(event.clientX, event.clientY) || { x: event.clientX, y: event.clientY };
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      grip: { x: point.x - visualAnchor.x, y: point.y - visualAnchor.y },
      moved: false, held: false, cancelled: false,
      ready: event.pointerType !== 'touch', timer: 0
    };
    if (drag.ready) showGrip();
    else animateTactile([{ transform: 'scale(.98)', offset: 1 }], 140);
    drag.timer = setTimeout(() => {
      if (!drag || drag.cancelled) return;
      drag.ready = true;
      drag.held = true;
      showGrip();
    }, HOLD_MS);
    nav.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });
  nav.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= THRESHOLD) return;
    if (!drag.ready) {
      drag.cancelled = true;
      clearTimeout(drag.timer);
      nav.classList.remove('is-gripped');
      animateTactile([{ transform: 'scale(1)', offset: 1 }], 160);
      return;
    }
    if (drag.cancelled) return;
    drag.moved = true;
    moved = true;
    nav.classList.add('is-dragging');
    moveAnchor(event.clientX, event.clientY);
    camera()?.setAutoPanPointer(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => nav.addEventListener(type, endDrag));
  window.addEventListener('blur', () => endDrag());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endDrag();
      stopPulse();
      tactileAnimation?.cancel();
      tactileAnimation = null;
    } else schedulePulse();
  });
  nav.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
  nav.addEventListener('dragstart', event => event.preventDefault());
  nav.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() < suppressUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  // Capture can retarget clicks to nav; delegate once for both pointer and keyboard.
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) { setOpen(false); return; }
    setOpen(!open);
  });
  document.addEventListener('pointerdown', event => {
    if (open && !nav.contains(event.target)) setOpen(false);
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false, true); }
  });
  hero.addEventListener('deushima:camera-change', () => {
    if (drag?.moved) moveAnchor(drag.lastX, drag.lastY);
    else render();
  });
  window.addEventListener('resize', () => {
    measure();
    if (!moved) anchor = initialAnchor();
    clampWorld();
    render();
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) { schedulePulse(); return; }
    stopPulse();
    tactileAnimation?.cancel();
    tactileAnimation = null;
    clock.pause();
    clock.currentTime = open ? DURATION : 0;
    render(open ? 1 : 0);
  });
  drawer.inert = true;
  measure();
  render(0);
  schedulePulse();
  // This script precedes the camera; initialize its anchor after all defer scripts.
  document.addEventListener('DOMContentLoaded', () => {
    anchor = initialAnchor();
    window.DeushimaWorkspaceInteraction?.registerCancelHandler(() => endDrag());
    measure();
    render();
  }, { once: true });
  document.fonts?.ready.then(() => { measure(); render(); });
})();
