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

  const isSiteReady = () => document.body.classList.contains('is-site-ready');

  const finish = () => {
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

    window.setTimeout(finish, window.matchMedia('(max-width: 760px)').matches ? 760 : 1120);
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
