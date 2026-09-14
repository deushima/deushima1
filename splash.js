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
