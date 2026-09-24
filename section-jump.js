(() => {
  'use strict';

  const control = document.querySelector('[data-section-jump]');
  const pad = control?.querySelector('[data-sling-pad]');
  const move = control?.querySelector('[data-sling-move]');
  const tension = control?.querySelector('[data-sling-tension]');
  const band = control?.querySelector('[data-sling-band]');
  const hot = control?.querySelector('[data-sling-hot]');
  const arc = control?.querySelector('[data-sling-arc]');
  const icon = control?.querySelector('[data-sling-icon]');
  const particlesRoot = control?.querySelector('[data-sling-particles]');
  const hero = document.querySelector('.hero--node-canvas');
  const footer = document.querySelector('.site-footer');

  if (
    !(control instanceof HTMLElement) ||
    !(pad instanceof HTMLButtonElement) ||
    !(move instanceof HTMLElement) ||
    !(tension instanceof SVGGElement) ||
    !(band instanceof SVGPathElement) ||
    !(hot instanceof SVGPathElement) ||
    !(arc instanceof SVGCircleElement) ||
    !(icon instanceof HTMLElement) ||
    !(particlesRoot instanceof HTMLElement) ||
    !hero ||
    !footer
  ) return;

  const SIZE = 46;
  const ARM = 40;
  const MAX_PULL = 140;
  const LAUNCH_SPEED = 2600;
  const RECOIL = 0.2;
  const FLIGHT = 120;
  const PARTICLES = 14;
  const SPREAD = 60;
  const FINGER_MAX = 3000;
  const HAND_MAX = 6000;
  const CANCEL = 0.5;
  const POWER_CAP = 1.5;
  const DOT_MS = 300;
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const SLOP = { fine: 4, coarse: 8 };
  const WELL_R = 26;
  const PAD_R = SIZE / 2 - 1.5;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let direction = control.dataset.direction === 'up' ? 'up' : 'down';
  let scrollFrame = 0;
  let syncFrame = 0;
  let springFrame = 0;
  let grip = null;
  let armed = false;
  let px = 0;
  let py = 0;
  let power = 0;
  let dotPending = false;
  let dotTimer = 0;
  let pullDir = direction === 'up' ? { ux: 0, uy: 1 } : { ux: 0, uy: -1 };

  const dots = Array.from({ length: PARTICLES }, () => {
    const dot = document.createElement('span');
    dot.className = 'sling-button__dot';
    dot.setAttribute('aria-hidden', 'true');
    particlesRoot.appendChild(dot);
    return dot;
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const maxScrollY = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const documentTop = element =>
    element.getBoundingClientRect().top + window.scrollY;

  function getTargets() {
    const max = maxScrollY();
    return {
      canvas: clamp(documentTop(hero), 0, max),
      footer: clamp(documentTop(footer), 0, max),
      max
    };
  }

  const idleArrowAngle = () => (direction === 'up' ? 180 : 0);

  function relaxIcon() {
    icon.style.transition = reducedMotion.matches
      ? 'none'
      : 'transform 360ms cubic-bezier(0.23, 1, 0.32, 1)';
    icon.style.transform = `rotate(${idleArrowAngle()}deg)`;
  }

  function aimIcon(ux, uy, distance) {
    const launchAngle = (Math.atan2(-uy, -ux) * 180) / Math.PI - 90;
    const base = idleArrowAngle();
    const delta = ((launchAngle - base + 540) % 360) - 180;
    icon.style.transition = 'none';
    icon.style.transform = `rotate(${base + delta * clamp(distance / 12, 0, 1)}deg)`;
  }

  function setDirection(next) {
    if (next !== 'up' && next !== 'down') return;
    direction = next;
    control.dataset.direction = next;
    const label = next === 'up' ? 'Volver al canvas' : 'Bajar al footer';
    control.title = label;
    pad.title = label;
    pad.setAttribute('aria-label', label);

    if (!grip) {
      pullDir = next === 'up' ? { ux: 0, uy: 1 } : { ux: 0, uy: -1 };
      relaxIcon();
    }
  }

  function syncDirectionAtLimits() {
    const targets = getTargets();
    const tolerance = clamp(window.innerHeight * 0.01, 4, 12);
    control.hidden = targets.max <= tolerance;
    if (control.hidden) return;

    if (window.scrollY >= targets.footer - tolerance) setDirection('up');
    else if (window.scrollY <= targets.canvas + tolerance) setDirection('down');
  }

  const easeInOutCubic = progress =>
    progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

  function stopScrollAnimation() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    document.body.classList.remove('is-section-jumping');
  }

  function animateTo(rawTarget) {
    stopScrollAnimation();

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
        scrollFrame = requestAnimationFrame(step);
        return;
      }

      scrollFrame = 0;
      window.scrollTo(0, destination);
      document.body.classList.remove('is-section-jumping');
      syncDirectionAtLimits();
    };

    scrollFrame = requestAnimationFrame(step);
  }

  function send() {
    const targets = getTargets();
    animateTo(direction === 'up' ? targets.canvas : targets.footer);
  }

  function launchDots() {
    dotPending = false;
    clearTimeout(dotTimer);
    relaxIcon();

    const { ux, uy } = pullDir;
    const base = Math.atan2(-uy, -ux);
    const cone = (SPREAD * Math.PI) / 180;
    const push = 0.85 + 0.35 * power;

    dots.forEach((dot, index) => {
      const lead = index === 0;
      const angle =
        base + (lead ? 0 : (Math.random() + Math.random() - 1) * (cone / 2));
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      const reach = (lead ? FLIGHT : FLIGHT * (0.3 + Math.random())) * push;
      const drift = lead ? 0 : (Math.random() - 0.5) * FLIGHT * 0.4;
      const scale = lead ? 1 : 0.3 + Math.random() * 0.6;
      const shrink = lead ? 0.6 : scale * (0.2 + Math.random() * 0.4);
      const duration = lead ? DOT_MS : DOT_MS * (0.7 + Math.random());
      const delay = lead ? 0 : Math.random() * 70;
      const target = WELL_R + reach;

      dot.animate(
        [
          { transform: `translate(${cx * WELL_R}px, ${cy * WELL_R}px) scale(${scale})` },
          {
            transform:
              `translate(${cx * target - cy * drift}px, ${cy * target + cx * drift}px) scale(${shrink})`
          }
        ],
        { duration, delay, easing: EASE_OUT }
      );

      dot.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.55 },
          { opacity: 0, offset: 1 }
        ],
        { duration, delay, easing: 'linear' }
      );
    });
  }

  function paint() {
    const { ux, uy } = pullDir;
    const projection = px * ux + py * uy;
    const progress = clamp(projection / ARM, 0, 1);
    const distance = Math.hypot(px, py);
    let path = '';

    if (distance > 0.5) {
      const a = Math.atan2(py, px);
      const b = Math.acos(clamp((WELL_R - PAD_R) / distance, -1, 1));
      path = [a + b, a - b]
        .map(theta => {
          const cx = Math.cos(theta);
          const cy = Math.sin(theta);
          return (
            `M${(WELL_R * cx).toFixed(2)},${(WELL_R * cy).toFixed(2)}` +
            `L${(px + PAD_R * cx).toFixed(2)},${(py + PAD_R * cy).toFixed(2)}`
          );
        })
        .join('');
    }

    band.setAttribute('d', path);
    hot.setAttribute('d', path);
    hot.style.opacity = String(progress);
    tension.style.opacity = String(clamp(projection / 6, 0, 1));
    arc.setAttribute('stroke-dasharray', `${progress} ${1 - progress}`);
    arc.setAttribute('stroke-dashoffset', String(progress / 2));
    arc.style.opacity = progress > 0.01 ? '1' : '0';
    arc.setAttribute(
      'transform',
      `rotate(${(Math.atan2(-uy, -ux) * 180) / Math.PI})`
    );

    if (grip) aimIcon(ux, uy, distance);
    if (dotPending && projection <= SIZE / 4) launchDots();
  }

  function setPosition(x, y) {
    px = x;
    py = y;
    move.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    paint();
  }

  function setArmed(next) {
    if (armed === next) return;
    armed = next;
    control.toggleAttribute('data-armed', next);
    pad.toggleAttribute('data-armed', next);
  }

  function stopSpring() {
    if (springFrame) cancelAnimationFrame(springFrame);
    springFrame = 0;
  }

  function settle(initialVelocity) {
    stopSpring();

    if (reducedMotion.matches) {
      setPosition(0, 0);
      pullDir = direction === 'up' ? { ux: 0, uy: 1 } : { ux: 0, uy: -1 };
      relaxIcon();
      return;
    }

    let vx = initialVelocity.x;
    let vy = initialVelocity.y;
    let last = performance.now();
    const stiffness = 320;
    const damping = 28 - RECOIL * 24;

    const step = now => {
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;

      vx += (-stiffness * px - damping * vx) * dt;
      vy += (-stiffness * py - damping * vy) * dt;
      setPosition(px + vx * dt, py + vy * dt);

      if (Math.hypot(px, py) < 0.12 && Math.hypot(vx, vy) < 4) {
        springFrame = 0;
        setPosition(0, 0);
        pullDir = direction === 'up' ? { ux: 0, uy: 1 } : { ux: 0, uy: -1 };
        relaxIcon();
        return;
      }

      springFrame = requestAnimationFrame(step);
    };

    springFrame = requestAnimationFrame(step);
  }

  function flashAndBurst(delay = 110) {
    power = 0;
    pullDir = direction === 'up' ? { ux: 0, uy: 1 } : { ux: 0, uy: -1 };
    dotPending = true;
    clearTimeout(dotTimer);
    dotTimer = setTimeout(launchDots, delay);
    control.setAttribute('data-sent', '');
    setTimeout(() => control.removeAttribute('data-sent'), 180);
  }

  function onPointerDown(event) {
    event.stopPropagation();
    if (grip || event.button !== 0) return;
    event.preventDefault();

    stopSpring();
    stopScrollAnimation();

    const rect = control.getBoundingClientRect();
    const scale = rect.width / (control.offsetWidth || rect.width) || 1;
    const distance = Math.hypot(px, py);
    const clampedDistance = Math.min(distance, 0.95 * MAX_PULL);
    const rawDistance =
      distance > 0.5
        ? (MAX_PULL * clampedDistance) / (MAX_PULL - clampedDistance)
        : 0;

    grip = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scale,
      moved: false,
      history: [],
      rawOrigin:
        distance > 0.5
          ? {
              x: (rawDistance * px) / distance,
              y: (rawDistance * py) / distance
            }
          : { x: 0, y: 0 },
      slop: event.pointerType === 'touch' ? SLOP.coarse : SLOP.fine
    };

    try {
      pad.setPointerCapture(event.pointerId);
    } catch {}

    pad.setAttribute('data-held', '');
  }

  function onPointerMove(event) {
    const active = grip;
    if (!active || active.id !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = (event.clientX - active.startX) / active.scale;
    const dy = (event.clientY - active.startY) / active.scale;
    const rawX = active.rawOrigin.x + dx;
    const rawY = active.rawOrigin.y + dy;

    if (!active.moved && Math.hypot(dx, dy) > active.slop) active.moved = true;

    const raw = Math.hypot(rawX, rawY);
    if (raw < 0.01) {
      setPosition(0, 0);
      setArmed(false);
      return;
    }

    const distance = (MAX_PULL * raw) / (MAX_PULL + raw);
    const ux = rawX / raw;
    const uy = rawY / raw;
    pullDir = { ux, uy };
    setPosition(distance * ux, distance * uy);

    const now = performance.now();
    active.history.push({ x: px, y: py, t: now });
    while (
      active.history.length > 4 ||
      (active.history[0] && now - active.history[0].t > 80)
    ) {
      active.history.shift();
    }

    setArmed(distance >= ARM);
  }

  function release(pointerId, cancelled) {
    const active = grip;
    if (!active || active.id !== pointerId) return;
    grip = null;

    try {
      pad.releasePointerCapture(pointerId);
    } catch {}

    pad.removeAttribute('data-held');

    const distance = Math.hypot(px, py);
    const pullPower = distance / ARM;
    const { ux, uy } = pullDir;
    let vx = 0;
    let vy = 0;

    if (!cancelled && active.history.length > 1) {
      const first = active.history[0];
      const last = active.history[active.history.length - 1];
      const dt = last.t - first.t;

      if (dt > 0 && performance.now() - last.t < 50) {
        vx = ((last.x - first.x) / dt) * 1000;
        vy = ((last.y - first.y) / dt) * 1000;
      }
    }

    const fingerSpeed = Math.hypot(vx, vy);
    if (fingerSpeed > FINGER_MAX) {
      vx *= FINGER_MAX / fingerSpeed;
      vy *= FINGER_MAX / fingerSpeed;
    }

    if (!active.moved) {
      relaxIcon();
      if (!cancelled) {
        flashAndBurst();
        send();
      }
      settle({ x: 0, y: 0 });
    } else {
      const fire = armed && !cancelled;
      const launch =
        (fire ? 1 : CANCEL) *
        LAUNCH_SPEED *
        Math.min(pullPower, fire ? POWER_CAP : 1);

      let launchX = vx - ux * launch;
      let launchY = vy - uy * launch;
      const handSpeed = Math.hypot(launchX, launchY);

      if (handSpeed > HAND_MAX) {
        launchX *= HAND_MAX / handSpeed;
        launchY *= HAND_MAX / handSpeed;
      }

      if (fire) {
        power = clamp(
          (Math.min(pullPower, POWER_CAP) - 1) / (POWER_CAP - 1),
          0,
          1
        );
        dotPending = true;
        clearTimeout(dotTimer);
        dotTimer = setTimeout(launchDots, 150);
        control.setAttribute('data-sent', '');
        setTimeout(() => control.removeAttribute('data-sent'), 180);
        send();
      } else {
        relaxIcon();
      }

      settle({ x: launchX, y: launchY });
    }

    setArmed(false);
  }

  pad.addEventListener('pointerdown', onPointerDown);
  pad.addEventListener('pointermove', onPointerMove);
  pad.addEventListener('pointerup', event => {
    event.preventDefault();
    event.stopPropagation();
    release(event.pointerId, false);
  });
  pad.addEventListener('pointercancel', event => release(event.pointerId, true));
  pad.addEventListener('lostpointercapture', event => release(event.pointerId, true));

  pad.addEventListener('keydown', event => {
    if (event.key === 'Escape' && grip) {
      event.preventDefault();
      release(grip.id, true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      flashAndBurst();
      send();
    }
  });

  control.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
  control.addEventListener('mousedown', event => event.stopPropagation());
  control.addEventListener('touchstart', event => event.stopPropagation(), { passive: true });
  control.addEventListener('contextmenu', event => event.stopPropagation());

  function requestDirectionSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      syncDirectionAtLimits();
    });
  }

  window.addEventListener('scroll', requestDirectionSync, { passive: true });
  window.addEventListener('resize', requestDirectionSync, { passive: true });

  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) {
      stopScrollAnimation();
      stopSpring();
      setPosition(0, 0);
    }
    syncDirectionAtLimits();
  });

  relaxIcon();
  paint();
  syncDirectionAtLimits();
})();
