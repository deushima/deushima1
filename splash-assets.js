/* Readiness, not a timer or a simulated byte counter. Only first-screen assets
   belong here; portfolio media and audio keep their existing lazy loading. */
(() => {
  const TIMEOUT = 30000;

  function waitForMedia(element, kind) {
    element.style.visibility = '';
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

  // Download the small intro loop once, with real transfer progress. The blob
  // is reused by the video element, so readiness means the entire file arrived
  // and a frame was decoded, not merely that metadata was available.
  function downloadVideo(video, url, onProgress = () => {}) {
    return new Promise((resolve) => {
      const request = new XMLHttpRequest();
      request.open('GET', url);
      request.responseType = 'blob';
      request.timeout = TIMEOUT;
      request.onprogress = (event) => onProgress({
        fraction: event.lengthComputable ? Math.min(0.95, event.loaded / event.total * 0.95) : 0,
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : null
      });
      const fail = () => { video.style.visibility = 'hidden'; resolve(false); };
      request.onerror = request.ontimeout = request.onabort = fail;
      request.onload = async () => {
        if (request.status < 200 || request.status >= 300 || !request.response?.size) return fail();
        onProgress({ fraction: 0.95, loaded: request.response.size, total: request.response.size });
        if (video.dataset.downloadUrl) URL.revokeObjectURL(video.dataset.downloadUrl);
        video.dataset.downloadUrl = URL.createObjectURL(request.response);
        const ready = waitForMedia(video, 'video');
        video.src = video.dataset.downloadUrl;
        video.load();
        resolve(await ready);
      };
      request.send();
    });
  }

  window.DeushimaSplashAssets = { waitForMedia, waitForFonts, downloadVideo };
})();
