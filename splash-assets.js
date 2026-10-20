/* Readiness, not a timer or a simulated byte counter. Only first-screen assets
   belong here; portfolio media and audio keep their existing lazy loading. */
(() => {
  const TIMEOUT = 12000;

  function waitForMedia(element, kind) {
    return new Promise((resolve) => {
      let settled = false;
      let decoding = false;
      const events = kind === 'image' ? ['load'] : ['loadeddata', 'canplay'];
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        events.forEach((name) => element.removeEventListener(name, check));
        element.removeEventListener('error', fail);
        // A late resource must not pop into the already-revealed composition.
        if (!ready) {
          element.style.visibility = 'hidden';
          if (kind === 'video') {
            element.pause();
            element.removeAttribute('src');
            element.load();
          }
        }
        resolve(ready);
      };
      const fail = () => finish(false);
      const check = () => {
        if (settled || decoding) return;
        if (kind === 'video') {
          if (element.readyState >= 3) finish(true);
        } else if (element.complete) {
          if (!element.naturalWidth) return fail();
          decoding = true;
          if (typeof element.decode === 'function') {
            element.decode().then(() => finish(true), fail);
          } else finish(true);
        }
      };
      const timer = setTimeout(fail, TIMEOUT);
      events.forEach((name) => element.addEventListener(name, check));
      element.addEventListener('error', fail);
      check();
    });
  }

  function waitForFonts() {
    if (!document.fonts) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), TIMEOUT);
      Promise.all([400, 500, 600, 700, 800].map((weight) =>
        document.fonts.load(`${weight} 16px Inter`)
      )).then((faces) => {
        clearTimeout(timer);
        resolve(faces.every((list) => list.length > 0));
      }, () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  window.DeushimaSplashAssets = { waitForMedia, waitForFonts };
})();
