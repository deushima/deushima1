(() => {
  const root = document.documentElement;
  const splash = document.querySelector('[data-studio-splash]');
  const enterButton = document.querySelector('[data-splash-enter]');
  const SPLASH_KEY = 'deushimaStudioSplashV1';
  const FORCE_SPLASH = new URLSearchParams(window.location.search).get('intro') === '1';

  if (!splash || !enterButton || !root.classList.contains('has-studio-splash')) {
    splash?.setAttribute('aria-hidden', 'true');
    return;
  }

  let enterRequested = false;
  let entering = false;

  splash.setAttribute('aria-hidden', 'false');

  const art = splash.querySelector('.studio-splash__art');
  const loader = splash.querySelector('.studio-splash__loader');
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const splashVideo = art ? document.createElement('video') : null;

  if (splashVideo && art) {
    splashVideo.className = 'studio-splash__art-video';
    splashVideo.autoplay = !reducedMotionQuery.matches;
    splashVideo.loop = true;
    splashVideo.muted = true;
    splashVideo.defaultMuted = true;
    splashVideo.playsInline = true;
    splashVideo.preload = 'auto';
    splashVideo.disablePictureInPicture = true;
    splashVideo.setAttribute('muted', '');
    splashVideo.setAttribute('playsinline', '');
    splashVideo.setAttribute('webkit-playsinline', '');
    splashVideo.setAttribute('aria-hidden', 'true');
    splashVideo.setAttribute('tabindex', '-1');
    splashVideo.setAttribute('controlslist', 'nodownload noplaybackrate nofullscreen');
    splashVideo.src = 'Video%20Background/Video%20footer%20mobile.mp4';

    Object.assign(splashVideo.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center center',
      pointerEvents: 'none',
      userSelect: 'none',
      background: '#071120'
    });

    art.prepend(splashVideo);

    if (reducedMotionQuery.matches) {
      splashVideo.addEventListener('loadeddata', () => {
        splashVideo.pause();
        try {
          splashVideo.currentTime = 0.001;
        } catch {}
      }, { once: true });
    } else {
      const playPromise = splashVideo.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    }
  }

  const syncLoaderMotion = () => {
    if (!loader) return;

    if (reducedMotionQuery.matches) {
      loader.style.animation = 'none';
      loader.style.willChange = 'auto';
      return;
    }

    loader.style.animation = `studioSplashRotate ${mobileQuery.matches ? '2.8s' : '2.4s'} linear infinite`;
    loader.style.willChange = 'transform';
  };

  syncLoaderMotion();
  mobileQuery.addEventListener?.('change', syncLoaderMotion);
  reducedMotionQuery.addEventListener?.('change', syncLoaderMotion);

  const isSiteReady = () => document.body.classList.contains('is-site-ready');

  const finish = () => {
    splashVideo?.pause();
    splashVideo?.remove();
    mobileQuery.removeEventListener?.('change', syncLoaderMotion);
    reducedMotionQuery.removeEventListener?.('change', syncLoaderMotion);

    splash.classList.add('is-hidden');
    splash.setAttribute('aria-hidden', 'true');
    root.classList.remove('has-studio-splash', 'is-splash-entering');

    if (!FORCE_SPLASH) {
      try {
        sessionStorage.setItem(SPLASH_KEY, 'seen');
      } catch {}
    }
  };

  const reveal = () => {
    if (entering) return;
    entering = true;
    splash.classList.add('is-entering');
    root.classList.add('is-splash-entering');
    enterButton.disabled = true;
    enterButton.setAttribute('aria-disabled', 'true');

    window.setTimeout(finish, mobileQuery.matches ? 760 : 1120);
  };

  const requestEnter = () => {
    enterRequested = true;
    splash.classList.add('is-armed');
    if (isSiteReady()) reveal();
  };

  enterButton.addEventListener('click', requestEnter);

  const readyObserver = new MutationObserver(() => {
    if (!enterRequested || !isSiteReady()) return;
    readyObserver.disconnect();
    reveal();
  });
  readyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('load', () => {
    splash.classList.add('is-loaded');
    if (enterRequested && isSiteReady()) reveal();
  }, { once: true });

  window.requestAnimationFrame(() => {
    splash.classList.add('is-mounted');
    window.setTimeout(() => enterButton.focus({ preventScroll: true }), 280);
  });
})();

(() => {
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  if (!mobileQuery.matches) return;

  const bridge = document.querySelector('.logo-bridge');
  const rail = bridge?.querySelector('.logo-bridge__rail');
  const track = bridge?.querySelector('.logo-bridge__track');
  const firstSet = track?.querySelector('.logo-bridge__set');
  if (!bridge || !rail || !track || !firstSet) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const marqueeDuration = 38;
  let loopWidth = 0;
  let position = 0;
  let baseVelocity = 0;
  let throwVelocity = 0;
  let lastFrameTime = performance.now();
  let rafId = null;
  let isDragging = false;
  let activePointerId = null;
  let dragStartX = 0;
  let lastDragX = 0;
  let lastDragTime = 0;
  let gestureVelocity = 0;
  let isNearViewport = false;

  bridge.classList.remove('is-mobile-native-scroll');
  bridge.classList.add('is-physics-ready', 'is-mobile-kinetic');

  rail.scrollLeft = 0;
  rail.style.overflowX = 'hidden';
  rail.style.overflowY = 'hidden';
  rail.style.touchAction = 'pan-y';
  rail.style.overscrollBehaviorX = 'contain';
  rail.style.cursor = 'grab';

  track.style.setProperty('animation', 'none', 'important');
  track.style.setProperty('will-change', 'transform', 'important');
  track.style.touchAction = 'pan-y';
  track.style.userSelect = 'none';
  track.style.webkitUserSelect = 'none';

  track.querySelectorAll('img').forEach((image) => {
    image.draggable = false;
    image.style.pointerEvents = 'none';
    image.addEventListener('dragstart', (event) => event.preventDefault());
  });

  const wrapPosition = (value) => {
    if (!loopWidth) return value;
    let wrapped = value % loopWidth;
    if (wrapped > 0) wrapped -= loopWidth;
    return wrapped;
  };

  const applyPosition = () => {
    track.style.setProperty(
      'transform',
      `translate3d(${wrapPosition(position).toFixed(2)}px, 0, 0)`,
      'important'
    );
  };

  const measure = () => {
    loopWidth = firstSet.getBoundingClientRect().width;
    baseVelocity = reducedMotionQuery.matches || !loopWidth ? 0 : -loopWidth / marqueeDuration;
    position = wrapPosition(position);
    applyPosition();
  };

  const shouldAnimate = () => (
    isNearViewport &&
    !document.hidden &&
    !document.body.classList.contains('is-content-panel-open') &&
    !document.documentElement.classList.contains('has-studio-splash')
  );

  const requestLoop = () => {
    if (rafId !== null || !shouldAnimate()) return;
    lastFrameTime = performance.now();
    rafId = window.requestAnimationFrame(animate);
  };

  function animate(now) {
    rafId = null;
    if (!shouldAnimate()) return;

    const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    if (!isDragging) {
      position += (baseVelocity + throwVelocity) * dt;
      throwVelocity *= Math.pow(0.922, dt * 60);
      if (Math.abs(throwVelocity) < 3) throwVelocity = 0;
    }

    position = wrapPosition(position);
    applyPosition();
    rafId = window.requestAnimationFrame(animate);
  }

  const syncLoop = () => {
    if (shouldAnimate()) {
      requestLoop();
      return;
    }

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const onPointerDown = (event) => {
    if (!loopWidth || (event.pointerType === 'mouse' && event.button !== 0)) return;

    isDragging = true;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    lastDragX = event.clientX;
    lastDragTime = performance.now();
    gestureVelocity = 0;
    throwVelocity = 0;
    bridge.classList.add('is-dragging');
    rail.style.cursor = 'grabbing';
    rail.setPointerCapture?.(event.pointerId);
    requestLoop();
  };

  const onPointerMove = (event) => {
    if (!isDragging || event.pointerId !== activePointerId) return;

    const now = performance.now();
    const dx = event.clientX - lastDragX;
    const dt = Math.max(8, now - lastDragTime);

    position += dx;
    gestureVelocity = gestureVelocity * 0.68 + (dx / dt) * 1000 * 0.32;
    lastDragX = event.clientX;
    lastDragTime = now;

    if (Math.abs(event.clientX - dragStartX) > 4) {
      bridge.dataset.userDragged = 'true';
    }

    applyPosition();
  };

  const endDrag = (event) => {
    if (!isDragging || event.pointerId !== activePointerId) return;

    isDragging = false;
    activePointerId = null;
    throwVelocity = Math.max(-2400, Math.min(2400, gestureVelocity));
    bridge.classList.remove('is-dragging');
    rail.style.cursor = 'grab';
    rail.releasePointerCapture?.(event.pointerId);
    requestLoop();
  };

  rail.addEventListener('pointerdown', onPointerDown);
  rail.addEventListener('pointermove', onPointerMove);
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('lostpointercapture', () => {
    if (!isDragging) return;
    isDragging = false;
    activePointerId = null;
    bridge.classList.remove('is-dragging');
    rail.style.cursor = 'grab';
    requestLoop();
  });

  const visibilityObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      isNearViewport = Boolean(entries[0]?.isIntersecting);
      syncLoop();
    }, { rootMargin: '140px 0px 140px', threshold: 0 })
    : null;

  if (visibilityObserver) {
    visibilityObserver.observe(bridge);
  } else {
    isNearViewport = true;
  }

  const classObserver = new MutationObserver(syncLoop);
  classObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => {
      measure();
      syncLoop();
    })
    : null;

  resizeObserver?.observe(firstSet);
  window.addEventListener('resize', () => {
    measure();
    syncLoop();
  }, { passive: true });
  document.addEventListener('visibilitychange', syncLoop, { passive: true });
  reducedMotionQuery.addEventListener?.('change', () => {
    measure();
    syncLoop();
  });

  measure();
  applyPosition();
  syncLoop();
})();

(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 760px) {
      .hero__pin {
        display: block !important;
        width: 0.62rem;
        height: 0.62rem;
        color: rgba(255, 255, 255, 0.9);
        filter: drop-shadow(0 0 0.42rem rgba(255, 255, 255, 0.16));
      }

      .hero__pin--left {
        left: -1.05rem;
        top: 0.52rem;
      }

      .hero__pin--right {
        right: -1.05rem;
        top: 0.52rem;
      }
    }
  `;
  document.head.appendChild(style);
})();
