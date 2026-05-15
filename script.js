const hero = document.querySelector(".hero");
const preloader = document.querySelector("[data-preloader]");
const timeNode = document.querySelector("[data-current-time]");
const video = document.querySelector("[data-hero-video]");
const floatingSection = document.querySelector(".floating-section");
const pageTransition = document.querySelector("[data-page-transition]");
const workArchive = document.querySelector("[data-work-archive]");
const contactForm = document.querySelector("[data-contact-form]");
const footerPrompt = document.querySelector("[data-footer-prompt]");
const siteCursor = document.querySelector("[data-site-cursor]");
const backgroundToggle = document.querySelector("[data-background-toggle]");
const designViewer = document.querySelector("[data-design-viewer]");
const designViewerPanel = designViewer?.querySelector(".design-viewer__panel");
const designViewerStage = designViewer?.querySelector("[data-design-stage]");
const designViewerImage = designViewer?.querySelector("[data-design-image]");
const designViewerTitle = designViewer?.querySelector("[data-design-title]");
const designViewerZoom = designViewer?.querySelector("[data-design-zoom]");
const launcherPop = document.querySelector("[data-launcher-pop]");
const launcherPopPanel = launcherPop?.querySelector(".launcher-pop__panel");
const CONTACT_ENDPOINT = "https://api.web3forms.com/submit";
const CONTACT_ACCESS_KEY = "8b8a51cd-3ec4-4b6d-8712-1bdc14969f4f";
const compactPointerQuery = window.matchMedia("(pointer: coarse)");
const compactLayoutQuery = window.matchMedia("(max-width: 760px)");

let pointerX = 0;
let pointerY = 0;
let cursorX = -320;
let cursorY = -320;
let targetCursorX = -320;
let targetCursorY = -320;
let targetX = 0;
let targetY = 0;
let velocityX = 0;
let velocityY = 0;
let targetVelocityX = 0;
let targetVelocityY = 0;
let distortion = 0;
let targetDistortion = 0;
let lastX = null;
let lastY = null;
let scrollTicking = false;
let introTextStarted = false;
let preloaderHideStarted = false;
let pageTransitionStarted = false;
let lastFocusedElement = null;
let viewerScale = 1;
let viewerX = 0;
let viewerY = 0;
let viewerPanning = false;
let viewerPointerId = null;
let viewerStartX = 0;
let viewerStartY = 0;
let viewerBaseX = 0;
let viewerBaseY = 0;
let viewerTouchMode = null;
let viewerTouchDistance = 0;
let viewerTouchScale = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeOutCubic(value) {
  const x = clamp(value, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function updateTime() {
  if (!timeNode) return;

  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  timeNode.textContent = formatter.format(new Date());
}

function hidePreloader() {
  if (preloaderHideStarted) return;
  preloaderHideStarted = true;

  preloader?.classList.add("is-opening");

  window.setTimeout(() => {
    preloader?.classList.add("is-hidden");
    document.body.classList.add("is-site-ready");
    initIntroText();
    syncInitialHashScroll();
  }, 820);
}

function syncInitialHashScroll() {
  const id = window.location.hash ? window.location.hash.slice(1) : "";
  if (!id) return;

  const target = document.getElementById(id);
  if (!target) return;

  function jumpToTarget() {
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: "auto" });
    requestScrollParallax();
  }

  window.setTimeout(jumpToTarget, 90);
  window.setTimeout(jumpToTarget, 520);
}

function handlePointerMove(event) {
  const movementX = lastX === null ? 0 : event.clientX - lastX;
  const movementY = lastY === null ? 0 : event.clientY - lastY;
  const movement = Math.hypot(movementX, movementY);

  lastX = event.clientX;
  lastY = event.clientY;
  targetCursorX = event.clientX;
  targetCursorY = event.clientY;
  targetX = (event.clientX / window.innerWidth - 0.5) * 2;
  targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  targetVelocityX = movementX;
  targetVelocityY = movementY;
  targetDistortion = Math.min(1, movement / 48);
}

function animate() {
  pointerX += (targetX - pointerX) * 0.045;
  pointerY += (targetY - pointerY) * 0.045;
  cursorX += (targetCursorX - cursorX) * 0.18;
  cursorY += (targetCursorY - cursorY) * 0.18;
  velocityX += (targetVelocityX - velocityX) * 0.16;
  velocityY += (targetVelocityY - velocityY) * 0.16;
  distortion += (targetDistortion - distortion) * 0.16;
  targetVelocityX *= 0.78;
  targetVelocityY *= 0.78;
  targetDistortion *= 0.82;
  const speed = Math.min(1, Math.hypot(velocityX, velocityY) / 62);

  if (hero) {
    const angle = Math.atan2(velocityY, velocityX) * 180 / Math.PI;

    hero.style.setProperty("--video-x", `${(-pointerX * 12).toFixed(2)}px`);
    hero.style.setProperty("--video-y", `${(-pointerY * 8).toFixed(2)}px`);
    hero.style.setProperty("--video-scale", "1.035");
    hero.style.setProperty("--cursor-x", `${cursorX.toFixed(2)}px`);
    hero.style.setProperty("--cursor-y", `${cursorY.toFixed(2)}px`);
    hero.style.setProperty("--cursor-opacity", `${Math.min(0.82, 0.08 + distortion * 0.74).toFixed(3)}`);
    hero.style.setProperty("--cursor-rotate", `${angle.toFixed(2)}deg`);
    hero.style.setProperty("--cursor-stretch-x", `${(1 + speed * 0.62).toFixed(3)}`);
    hero.style.setProperty("--cursor-stretch-y", `${(1 - speed * 0.18).toFixed(3)}`);
  }

  if (siteCursor) {
    document.documentElement.style.setProperty("--site-cursor-x", `${cursorX.toFixed(2)}px`);
    document.documentElement.style.setProperty("--site-cursor-y", `${cursorY.toFixed(2)}px`);
    document.documentElement.style.setProperty("--site-cursor-scale", `${(1 + Math.min(0.2, speed * 0.12)).toFixed(3)}`);
  }

  requestAnimationFrame(animate);
}

function updateScrollParallax() {
  const viewportHeight = window.innerHeight || 1;
  const heroProgress = clamp(window.scrollY / viewportHeight, 0, 1);
  const heroFade = smoothstep(clamp(window.scrollY / (viewportHeight * 0.82), 0, 1));

  if (hero) {
    const heroEat = smoothstep(clamp(window.scrollY / (viewportHeight * 0.92), 0, 1));

    hero.style.setProperty("--hero-scroll-y", `${(heroProgress * 96).toFixed(2)}px`);
    hero.style.setProperty("--hero-nav-y", `${(-heroProgress * 22).toFixed(2)}px`);
    hero.style.setProperty("--hero-copy-y", `${(-heroProgress * 42).toFixed(2)}px`);
    hero.style.setProperty("--hero-dim", `${(heroFade * 0.34).toFixed(3)}`);
    hero.style.setProperty("--hero-eat-opacity", `${(heroEat * 0.56).toFixed(3)}`);
    hero.style.setProperty("--hero-eat-y", `${((1 - heroEat) * 72).toFixed(2)}%`);
    hero.style.setProperty("--hero-edge-fade", `${(0.2 + heroFade * 0.34).toFixed(3)}`);
    hero.style.setProperty("--video-scroll-scale", `${(1.07 - heroFade * 0.055).toFixed(3)}`);
  }

  if (floatingSection) {
    const rect = floatingSection.getBoundingClientRect();
    const reveal = easeOutCubic((viewportHeight - rect.top) / (viewportHeight * 0.82));
    const headerReveal = smoothstep((reveal - 0.05) / 0.58);

    floatingSection.style.setProperty("--works-glow-y", "0px");
    floatingSection.style.setProperty("--works-header-y", `${((1 - headerReveal) * 44).toFixed(2)}px`);
    const panelY = (1 - headerReveal) * 18 - reveal * 4;

    floatingSection.style.setProperty("--works-panel-y", `${panelY.toFixed(2)}px`);
    floatingSection.style.setProperty("--works-panel-scale", `${(0.982 + headerReveal * 0.018).toFixed(3)}`);
    floatingSection.style.setProperty("--works-panel-opacity", `${(0.72 + headerReveal * 0.28).toFixed(3)}`);
    floatingSection.style.setProperty("--works-panel-glow-y", `${(panelY * 0.55).toFixed(2)}px`);
    floatingSection.style.setProperty("--works-panel-glow-opacity", `${(0.2 + headerReveal * 0.16).toFixed(3)}`);
    floatingSection.style.setProperty("--works-darkness", `${(0.18 + reveal * 0.16).toFixed(3)}`);
    floatingSection.style.setProperty("--works-top-shadow", `${(0.03 + reveal * 0.11).toFixed(3)}`);
    floatingSection.style.setProperty("--works-header-opacity", `${(0.28 + headerReveal * 0.72).toFixed(3)}`);
    floatingSection.style.setProperty("--works-stage-y", "0px");
    floatingSection.style.setProperty("--works-stage-z", "0px");
    floatingSection.style.setProperty("--works-stage-rotate", "0deg");
    floatingSection.style.setProperty("--works-stage-opacity", "1");
    floatingSection.style.setProperty("--works-stage-scale", "1");
    floatingSection.style.setProperty("--works-stage-blur", "0px");
  }
}

function requestScrollParallax() {
  if (scrollTicking) return;
  scrollTicking = true;

  requestAnimationFrame(() => {
    scrollTicking = false;
    updateScrollParallax();
  });
}

function initVideo() {
  if (!video) return;

  video.muted = true;
  video.playsInline = true;

  const playPromise = video.play();
  if (playPromise) {
    playPromise.catch(() => {
      video.setAttribute("controls", "");
    });
  }
}

function shouldUsePageTransition(link, event) {
  if (!link || !link.href) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.hasAttribute("download")) return false;

  const target = link.getAttribute("target");
  if (target && target !== "_self") return false;

  const rawHref = link.getAttribute("href") || "";
  const normalizedHref = rawHref.trim().toLowerCase();
  if (!normalizedHref || normalizedHref.startsWith("#")) return false;
  if (normalizedHref.startsWith("mailto:") || normalizedHref.startsWith("tel:")) return false;
  if (normalizedHref.startsWith("javascript:")) return false;
  if (link.dataset.directNav === "true") return false;

  const nextUrl = new URL(link.href, window.location.href);
  if (nextUrl.href === window.location.href) return false;
  if (nextUrl.pathname === window.location.pathname && nextUrl.hash && nextUrl.origin === window.location.origin) return false;

  return true;
}

function isEmbeddedPage() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isPrimaryLinkClick(link, event) {
  if (!link || !link.href) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.hasAttribute("download")) return false;
  return true;
}

function startPageTransition(destination) {
  if (!pageTransition) {
    window.location.href = destination;
    return;
  }

  if (pageTransitionStarted) return;
  pageTransitionStarted = true;
  document.body.classList.add("is-page-leaving");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    window.location.href = destination;
  }, prefersReducedMotion ? 80 : 900);
}

function initPageTransitions() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");

    if (link?.dataset.launcherNav === "true") {
      if (!isPrimaryLinkClick(link, event)) return;

      if (link.getAttribute("target") === "_blank" || isEmbeddedPage()) {
        if (pageTransition && !pageTransitionStarted) {
          pageTransitionStarted = true;
          document.body.classList.add("is-page-leaving");
          window.setTimeout(() => {
            pageTransitionStarted = false;
            document.body.classList.remove("is-page-leaving");
          }, 900);
        }
        return;
      }

      event.preventDefault();
      startPageTransition(link.href);
      return;
    }

    if (!shouldUsePageTransition(link, event)) return;

    event.preventDefault();
    startPageTransition(link.href);
  });

  window.addEventListener("pageshow", () => {
    pageTransitionStarted = false;
    document.body.classList.remove("is-page-leaving");
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function typeText(element, text, speed = 22) {
  if (!element) return Promise.resolve();

  element.textContent = "";
  element.classList.remove("is-type-pending");
  element.classList.add("is-typing");
  const textNode = document.createTextNode("");
  element.appendChild(textNode);

  return new Promise((resolve) => {
    let index = 0;
    const interval = window.setInterval(() => {
      if (index < text.length) {
        textNode.appendData(text[index]);
        index += 1;
        return;
      }

      window.clearInterval(interval);
      window.setTimeout(() => {
        element.classList.remove("is-typing");
        element.classList.add("is-type-complete");
        resolve();
      }, 110);
    }, speed);
  });
}

function prepareWipeLink(link) {
  if (!link) return;

  const text = link.textContent.trim();
  link.dataset.wipeText = text;
  link.setAttribute("aria-label", text);
  link.textContent = "";

  const textNode = document.createElement("span");
  textNode.className = "wipe-link-text";
  textNode.textContent = text;
  link.appendChild(textNode);
}

function revealWipeLink(link, index) {
  if (!link) return;
  link.style.setProperty("--link-delay", `${(index * 0.032).toFixed(3)}s`);
  link.classList.add("is-wipe-ready");
}

async function initIntroText() {
  if (introTextStarted) return;
  introTextStarted = true;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const titles = Array.from(document.querySelectorAll(".directory__title.js-type-text"));
  const wipeLinks = Array.from(document.querySelectorAll(".directory .js-wipe-link"));

  titles.forEach((item) => {
    const text = item.textContent.trim();
    item.dataset.typeText = text;
    item.setAttribute("aria-label", text);
    item.style.minWidth = `${Math.max(2, text.length * 0.54)}em`;
    item.textContent = "";
    item.classList.add("is-type-pending");
  });

  wipeLinks.forEach(prepareWipeLink);

  await wait(80);

  await Promise.all(
    titles.map((item, index) => (
      wait(index * 58).then(() => typeText(item, item.dataset.typeText || "", 9))
    ))
  );

  await wait(55);
  wipeLinks.forEach(revealWipeLink);
}

function initTextReveals() {
  const revealRoots = document.querySelectorAll(".floating-section__header");
  if (!revealRoots.length) return;

  if (!("IntersectionObserver" in window)) {
    revealRoots.forEach((root) => root.classList.add("is-in-view"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in-view");
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: "0px 0px -18% 0px",
    threshold: 0.18
  });

  revealRoots.forEach((root) => observer.observe(root));
}

function getFloatingAssets() {
  return [
    { title: "Heroines", src: "Flotantes/Optimizados/heroines-2.webp", width: 306, height: 434, x: 0.86, angle: 8, floatY: 0.43, imageScale: 0.96, controlInset: "-0.22rem", collisionScale: 1.14, mobileX: 0.72, mobileY: 0.46, mobileWidth: 170, mobileAngle: 9 },
    { title: "Bestseller", src: "Flotantes/Optimizados/bestseller.webp", width: 294, height: 388, x: 0.18, angle: -9, floatY: 0.64, imageScale: 0.92, controlInset: "-0.58rem", collisionScale: 1.18, mobileX: 0.3, mobileY: 0.59, mobileWidth: 142, mobileAngle: -13, mobileHidden: true },
    { title: "New Era Classic", src: "Flotantes/Optimizados/new-era-classic-png-negro.webp", width: 304, height: 365, x: 0.39, angle: -4, floatY: 0.66, imageScale: 0.84, imageOffsetY: "-0.72rem", controlInset: "-0.68rem -0.58rem -1.22rem", collisionScale: 1.2, mobileX: 0.29, mobileY: 0.35, mobileWidth: 166, mobileAngle: -5 },
    { title: "Existence Design", src: "Flotantes/Optimizados/Existencia y destino.webp", width: 432, height: 487, x: 0.68, angle: 10, floatY: 0.4, imageScale: 0.95, controlInset: "-0.42rem", collisionScale: 1.16, mobileX: 0.68, mobileY: 0.68, mobileWidth: 202, mobileAngle: 12 },
    { title: "Cultural Change", src: "Flotantes/Optimizados/Cultural-change.webp", width: 358, height: 446, x: 0.58, angle: -15, floatY: 0.6, imageScale: 0.96, controlInset: "-0.34rem", collisionScale: 1.16, mobileX: 0.58, mobileY: 0.25, mobileWidth: 184, mobileAngle: -18 },
    { title: "Big Boss", src: "Flotantes/Optimizados/big-boss-negativo.webp", width: 282, height: 376, x: 0.31, angle: 5, floatY: 0.48, imageScale: 0.95, controlInset: "-0.32rem", collisionScale: 1.14, mobileX: 0.46, mobileY: 0.79, mobileWidth: 150, mobileAngle: 5, mobileHidden: true }
  ];
}

function makeWander(index) {
  const seed = (index + 1) * 12.9898;
  return {
    x: Math.sin(seed) * 0.5,
    y: Math.cos(seed * 1.37) * 0.5,
    tx: Math.sin(seed * 2.11) * 0.5,
    ty: Math.cos(seed * 1.91) * 0.5,
    next: 0
  };
}

function updateWander(wander, time, index) {
  if (time > wander.next) {
    const seed = time * 0.19 + index * 2.41;
    wander.tx = Math.sin(seed * 2.7) * 0.5;
    wander.ty = Math.cos(seed * 2.1) * 0.5;
    wander.next = time + 4.6 + (index % 3) * 1.15;
  }

  wander.x += (wander.tx - wander.x) * 0.0042;
  wander.y += (wander.ty - wander.y) * 0.0042;
}

function stopViewerButtonEvent(event) {
  event.stopPropagation();
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function applyViewerTransform() {
  if (!designViewerImage) return;

  designViewerImage.style.setProperty("--viewer-x", `${viewerX.toFixed(2)}px`);
  designViewerImage.style.setProperty("--viewer-y", `${viewerY.toFixed(2)}px`);
  designViewerImage.style.setProperty("--viewer-scale", viewerScale.toFixed(3));
  if (designViewerZoom) designViewerZoom.textContent = `${Math.round(viewerScale * 100)}%`;
}

function resetDesignViewer() {
  viewerScale = 1;
  viewerX = 0;
  viewerY = 0;
  applyViewerTransform();
}

function zoomDesignViewerAt(clientX, clientY, nextScale) {
  if (!designViewerStage) return;

  const rect = designViewerStage.getBoundingClientRect();
  const localX = clientX - rect.left - rect.width / 2;
  const localY = clientY - rect.top - rect.height / 2;
  const scale = clamp(nextScale, 0.72, 5.2);
  const ratio = scale / viewerScale;

  viewerX = localX - (localX - viewerX) * ratio;
  viewerY = localY - (localY - viewerY) * ratio;
  viewerScale = scale;
  applyViewerTransform();
}

function openDesignViewer(asset) {
  if (!designViewer || !designViewerImage || !designViewerTitle || !designViewerPanel) return;

  lastFocusedElement = document.activeElement;
  designViewerImage.src = asset.src;
  designViewerImage.alt = asset.title || "Design detail";
  designViewerTitle.textContent = asset.title || "Selected piece";
  designViewer.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-design-viewer-open");
  resetDesignViewer();

  window.requestAnimationFrame(() => {
    designViewer.classList.add("is-open");
    designViewerPanel.focus({ preventScroll: true });
  });
}

function closeDesignViewer() {
  if (!designViewer) return;

  designViewer.classList.remove("is-open");
  designViewer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-design-viewer-open");
  designViewerStage?.classList.remove("is-panning");
  viewerPanning = false;
  viewerPointerId = null;
  viewerTouchMode = null;

  if (lastFocusedElement?.focus) {
    window.setTimeout(() => lastFocusedElement.focus({ preventScroll: true }), 80);
  }
}

function initDesignViewer() {
  if (!designViewer || !designViewerStage || !designViewerPanel) return;

  designViewer.querySelectorAll("[data-design-close]").forEach((button) => {
    button.addEventListener("click", closeDesignViewer);
  });

  designViewerStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const zoomAmount = event.deltaY < 0 ? 1.12 : 0.9;
    zoomDesignViewerAt(event.clientX, event.clientY, viewerScale * zoomAmount);
  }, { passive: false });

  designViewerStage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    viewerPanning = true;
    viewerPointerId = event.pointerId;
    viewerStartX = event.clientX;
    viewerStartY = event.clientY;
    viewerBaseX = viewerX;
    viewerBaseY = viewerY;
    designViewerStage.setPointerCapture?.(event.pointerId);
    designViewerStage.classList.add("is-panning");
  });

  designViewerStage.addEventListener("pointermove", (event) => {
    if (!viewerPanning || event.pointerId !== viewerPointerId) return;
    viewerX = viewerBaseX + event.clientX - viewerStartX;
    viewerY = viewerBaseY + event.clientY - viewerStartY;
    applyViewerTransform();
  });

  function releasePointer(event) {
    if (event.pointerId !== viewerPointerId) return;
    viewerPanning = false;
    viewerPointerId = null;
    designViewerStage.classList.remove("is-panning");
  }

  designViewerStage.addEventListener("pointerup", releasePointer);
  designViewerStage.addEventListener("pointercancel", releasePointer);
  designViewerStage.addEventListener("dblclick", resetDesignViewer);

  designViewerStage.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      viewerTouchMode = "pan";
      viewerStartX = event.touches[0].clientX;
      viewerStartY = event.touches[0].clientY;
      viewerBaseX = viewerX;
      viewerBaseY = viewerY;
    } else if (event.touches.length === 2) {
      viewerTouchMode = "pinch";
      viewerTouchDistance = getTouchDistance(event.touches);
      viewerTouchScale = viewerScale;
    }
  }, { passive: false });

  designViewerStage.addEventListener("touchmove", (event) => {
    event.preventDefault();
    if (viewerTouchMode === "pinch" && event.touches.length === 2) {
      const center = getTouchCenter(event.touches);
      const nextScale = viewerTouchScale * (getTouchDistance(event.touches) / viewerTouchDistance);
      zoomDesignViewerAt(center.x, center.y, nextScale);
      return;
    }

    if (viewerTouchMode === "pan" && event.touches.length === 1) {
      viewerX = viewerBaseX + event.touches[0].clientX - viewerStartX;
      viewerY = viewerBaseY + event.touches[0].clientY - viewerStartY;
      applyViewerTransform();
    }
  }, { passive: false });

  designViewerStage.addEventListener("touchend", () => {
    viewerTouchMode = null;
  });

  document.addEventListener("keydown", (event) => {
    if (!designViewer.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeDesignViewer();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(designViewer.querySelectorAll("button, [tabindex]:not([tabindex='-1'])"))
      .filter((item) => !item.hasAttribute("disabled"));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function openLauncherPop() {
  if (!launcherPop || !launcherPopPanel) return;
  if (document.body.classList.contains("is-design-viewer-open") || document.body.classList.contains("is-page-leaving")) {
    window.setTimeout(openLauncherPop, 1800);
    return;
  }

  lastFocusedElement = document.activeElement;
  launcherPop.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-launcher-pop-open");

  window.requestAnimationFrame(() => {
    launcherPop.classList.add("is-open");
    launcherPopPanel.focus({ preventScroll: true });
  });
}

function closeLauncherPop(remember = true) {
  if (!launcherPop) return;

  launcherPop.classList.remove("is-open");
  launcherPop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-launcher-pop-open");

  if (remember) {
    try {
      sessionStorage.setItem("deushimaLauncherPopSeen", "true");
    } catch {
      // Ignore storage restrictions in embedded previews.
    }
  }

  if (lastFocusedElement?.focus) {
    window.setTimeout(() => lastFocusedElement.focus({ preventScroll: true }), 80);
  }
}

function initLauncherPop() {
  if (!launcherPop || !launcherPopPanel) return;

  let alreadySeen = false;
  try {
    alreadySeen = sessionStorage.getItem("deushimaLauncherPopSeen") === "true";
  } catch {
    alreadySeen = false;
  }

  launcherPop.querySelectorAll("[data-launcher-pop-close]").forEach((button) => {
    button.addEventListener("click", () => closeLauncherPop(true));
  });

  launcherPop.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", () => closeLauncherPop(true));
  });

  document.addEventListener("keydown", (event) => {
    if (!launcherPop.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeLauncherPop(true);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(launcherPop.querySelectorAll("a[href], button, [tabindex]:not([tabindex='-1'])"))
      .filter((item) => !item.hasAttribute("disabled"));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (alreadySeen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.setTimeout(openLauncherPop, 10000);
}

function initWorkArchive() {
  if (!workArchive) return;

  const videos = Array.from(workArchive.querySelectorAll("[data-work-video]"));
  const triggers = Array.from(workArchive.querySelectorAll("[data-work-trigger]"));
  if (!videos.length || !triggers.length) return;

  let activeIndex = 0;
  let userInteracting = false;
  let interactionTimer = 0;
  let scrollTickingArchive = false;
  let archiveVisible = false;

  function isCompactArchive() {
    return compactLayoutQuery.matches;
  }

  function playVideo(videoNode) {
    if (!videoNode) return;
    videoNode.muted = true;
    videoNode.playsInline = true;
    const playPromise = videoNode.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  }

  function pauseVideo(videoNode) {
    if (!videoNode) return;
    videoNode.pause();
  }

  function syncVideoPlayback() {
    const compact = isCompactArchive();
    videos.forEach((videoNode, videoIndex) => {
      videoNode.preload = compact ? "metadata" : "auto";
      if (archiveVisible && (!compact || videoIndex === activeIndex)) {
        playVideo(videoNode);
      } else {
        pauseVideo(videoNode);
      }
    });
  }

  function playAllVideos() {
    syncVideoPlayback();
  }

  function pauseAllVideos() {
    videos.forEach(pauseVideo);
  }

  function setActiveWork(index, fromUser = false) {
    const nextIndex = clamp(index, 0, videos.length - 1);
    if (nextIndex === activeIndex && fromUser) {
      window.clearTimeout(interactionTimer);
    }

    activeIndex = nextIndex;
    videos.forEach((videoNode, videoIndex) => {
      const isActive = videoIndex === activeIndex;
      videoNode.classList.toggle("is-active", isActive);
    });

    triggers.forEach((trigger, triggerIndex) => {
      trigger.classList.toggle("is-active", triggerIndex === activeIndex);
    });

    if (fromUser) {
      userInteracting = true;
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        userInteracting = false;
      }, 1200);
    }

    syncVideoPlayback();
  }

  function updateByScroll() {
    scrollTickingArchive = false;
    if (userInteracting) return;

    const rect = workArchive.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    if (rect.top > viewportHeight || rect.bottom < 0) return;

    const progress = clamp((viewportHeight * 0.62 - rect.top) / Math.max(rect.height - viewportHeight * 0.28, 1), 0, 0.999);
    setActiveWork(Math.floor(progress * videos.length));
  }

  function requestArchiveScroll() {
    if (scrollTickingArchive) return;
    scrollTickingArchive = true;
    window.requestAnimationFrame(updateByScroll);
  }

  triggers.forEach((trigger) => {
    const index = Number(trigger.dataset.workIndex || 0);
    trigger.addEventListener("pointerenter", () => setActiveWork(index, true));
    trigger.addEventListener("focus", () => setActiveWork(index, true));
    trigger.addEventListener("click", () => setActiveWork(index, true));
  });

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      archiveVisible = visible;
      if (visible) {
        playAllVideos();
        window.addEventListener("scroll", requestArchiveScroll, { passive: true });
        requestArchiveScroll();
      } else {
        window.removeEventListener("scroll", requestArchiveScroll);
        pauseAllVideos();
      }
    }, { threshold: 0.12 })
    : null;

  if (observer) {
    observer.observe(workArchive);
  } else {
    archiveVisible = true;
    playAllVideos();
    window.addEventListener("scroll", requestArchiveScroll, { passive: true });
  }

  setActiveWork(0);
  window.addEventListener("resize", syncVideoPlayback);
}

function initContactForm() {
  if (!contactForm) return;

  const statusNode = contactForm.querySelector("[data-contact-status]");
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.textContent || "Send message ->";

  function setStatus(message, state = "") {
    if (!statusNode) return;
    statusNode.textContent = message;
    if (state) {
      statusNode.dataset.state = state;
    } else {
      delete statusNode.dataset.state;
    }
  }

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;

    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();

    formData.append("access_key", CONTACT_ACCESS_KEY);
    formData.append("subject", `Nuevo contacto de ${name || "portfolio"} - Deushima`);
    formData.append("from_name", "Portfolio Deushima");
    formData.append("replyto", email);

    if (submitButton) {
      submitButton.textContent = "Sending...";
      submitButton.disabled = true;
    }

    setStatus("Enviando...", "pending");

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || "contact-submit-failed");
      }

      contactForm.reset();
      setStatus("Mensaje enviado. Gracias.", "success");
    } catch (error) {
      console.warn("Contact form error:", error);
      setStatus("No se pudo enviar. Intenta de nuevo.", "error");
    } finally {
      if (submitButton) {
        submitButton.textContent = submitLabel;
        submitButton.disabled = false;
      }
    }
  });
}

function initFooterPromptTyping() {
  if (!footerPrompt) return;

  const fullText = footerPrompt.dataset.fullText || "";
  if (!fullText.trim()) return;

  footerPrompt.textContent = "";
  let started = false;

  function writePrompt() {
    if (started) return;
    started = true;

    let index = 0;
    const step = () => {
      index = Math.min(index + 4, fullText.length);
      footerPrompt.textContent = fullText.slice(0, index);
      if (index < fullText.length) {
        window.setTimeout(step, 14);
      }
    };

    window.setTimeout(step, 180);
  }

  if (!("IntersectionObserver" in window)) {
    writePrompt();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      writePrompt();
      observer.disconnect();
    }
  }, { threshold: 0.34 });

  observer.observe(footerPrompt);
}

function initSiteCursor() {
  if (!siteCursor || compactPointerQuery.matches || compactLayoutQuery.matches) return;

  const interactiveSelector = "a, button, input, textarea, [role='button'], .floating-card, .design-viewer__stage";
  document.body.classList.add("has-site-cursor");

  window.addEventListener("pointerenter", () => {
    document.body.classList.add("is-cursor-active");
  });

  window.addEventListener("pointerleave", () => {
    document.body.classList.remove("is-cursor-active", "is-cursor-hover");
  });

  window.addEventListener("pointermove", () => {
    document.body.classList.add("is-cursor-active");
  }, { passive: true });

  document.addEventListener("pointerover", (event) => {
    if (event.target instanceof Element && event.target.closest(interactiveSelector)) {
      document.body.classList.add("is-cursor-hover");
    }
  }, { passive: true });

  document.addEventListener("pointerout", (event) => {
    const nextTarget = event.relatedTarget;
    if (
      event.target instanceof Element &&
      event.target.closest(interactiveSelector) &&
      (!(nextTarget instanceof Element) || !nextTarget.closest(interactiveSelector))
    ) {
      document.body.classList.remove("is-cursor-hover");
    }
  }, { passive: true });
}

function setBackgroundMode(enabled) {
  document.body.classList.toggle("is-liquid-mode", enabled);
  if (!backgroundToggle) return;

  backgroundToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  backgroundToggle.setAttribute("aria-label", enabled ? "Desactivar fondo liquido" : "Activar fondo liquido");
}

function initBackgroundToggle() {
  if (!backgroundToggle) return;

  let enabled = false;
  try {
    enabled = localStorage.getItem("deushimaLiquidMode") === "true";
  } catch {
    enabled = false;
  }

  setBackgroundMode(enabled);
  backgroundToggle.addEventListener("click", () => {
    enabled = !document.body.classList.contains("is-liquid-mode");
    setBackgroundMode(enabled);
    try {
      localStorage.setItem("deushimaLiquidMode", enabled ? "true" : "false");
    } catch {
      // Ignore storage restrictions in embedded previews.
    }
  });
}

function releaseMatterScroll(mouse) {
  if (!mouse || !mouse.element || !mouse.mousewheel) return;
  mouse.element.removeEventListener("mousewheel", mouse.mousewheel);
  mouse.element.removeEventListener("DOMMouseScroll", mouse.mousewheel);
  mouse.element.removeEventListener("wheel", mouse.mousewheel);
}

function createFloatingElement(asset, index, width, height) {
  const element = document.createElement("article");
  const image = document.createElement("img");
  const controls = document.createElement("span");
  const hint = document.createElement("span");
  const zoomButton = document.createElement("button");

  element.className = "floating-card";
  if (asset.modifier) {
    element.classList.add(`floating-card--${asset.modifier}`);
  }
  element.style.setProperty("--card-w", `${width}px`);
  element.style.setProperty("--card-h", `${height}px`);
  element.style.setProperty("--image-scale", asset.imageScale || 1);
  if (asset.imageOffsetX) {
    element.style.setProperty("--image-x", asset.imageOffsetX);
  }
  if (asset.imageOffsetY) {
    element.style.setProperty("--image-y", asset.imageOffsetY);
  }
  if (asset.controlInset) {
    element.style.setProperty("--control-inset", asset.controlInset);
  }

  image.className = "floating-card__image";
  image.src = asset.src;
  image.alt = asset.title || "";
  image.draggable = false;

  controls.className = "floating-card__controls";
  ["nw", "ne", "se", "sw", "e", "w"].forEach((position) => {
    const handle = document.createElement("span");
    handle.className = `floating-card__handle floating-card__handle--${position}`;
    controls.appendChild(handle);
  });

  hint.className = "floating-card__hint";
  hint.textContent = `piece ${String(index + 1).padStart(2, "0")}`;

  zoomButton.className = "floating-card__zoom";
  zoomButton.type = "button";
  zoomButton.setAttribute("aria-label", `Ver ${asset.title || `pieza ${index + 1}`}`);
  zoomButton.addEventListener("pointerdown", stopViewerButtonEvent);
  zoomButton.addEventListener("mousedown", stopViewerButtonEvent);
  zoomButton.addEventListener("touchstart", stopViewerButtonEvent, { passive: false });
  zoomButton.addEventListener("click", (event) => {
    stopViewerButtonEvent(event);
    event.preventDefault();
    openDesignViewer(asset);
  });

  element.append(image, controls, zoomButton, hint);
  return element;
}

function isCompactFloatingLayout(stage) {
  return stage.getBoundingClientRect().width < 760 || window.matchMedia("(max-width: 760px)").matches;
}

function initFloatingMobile(stage) {
  if (!stage || stage.dataset.floatingReady === "mobile") return null;
  stage.dataset.floatingReady = "mobile";
  stage.classList.add("floating-stage--mobile");

  const assets = getFloatingAssets().filter((asset) => !asset.mobileHidden);
  const cards = [];
  let activeCard = null;
  let frameId = 0;
  let lastFrame = 0;

  function setActiveCard(card) {
    if (activeCard) activeCard.element.classList.remove("is-active");
    activeCard = card;
    if (activeCard) activeCard.element.classList.add("is-active");
  }

  function releaseCard(card) {
    if (!card) return;
    card.dragging = false;
    stage.classList.remove("is-grabbing");
    card.element.releasePointerCapture?.(card.pointerId);
  }

  function createCard(asset, index) {
    const rect = stage.getBoundingClientRect();
    const baseWidth = asset.mobileWidth || 170;
    const width = clamp(baseWidth * (rect.width / 390), baseWidth * 0.82, baseWidth * 1.08);
    const height = width * (asset.height / asset.width);
    const element = createFloatingElement(asset, index, width, height);
    const card = {
      element,
      index,
      width,
      height,
      anchorX: asset.mobileX || asset.x,
      anchorY: asset.mobileY || asset.floatY,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: (asset.mobileAngle ?? asset.angle) * Math.PI / 180,
      phase: index * 1.91,
      wander: makeWander(index),
      dragging: false,
      pointerId: null,
      grabX: 0,
      grabY: 0,
      lastX: 0,
      lastY: 0,
      lastTime: performance.now()
    };

    const minY = Math.min(132, rect.height * 0.16);
    card.x = clamp(rect.width * card.anchorX - width / 2, -width * 0.18, rect.width - width * 0.82);
    card.y = clamp(rect.height * card.anchorY - height / 2, minY, rect.height - height * 0.55);

    stage.appendChild(element);
    cards.push(card);

    element.addEventListener("pointerdown", (event) => {
      const now = performance.now();
      const rect = stage.getBoundingClientRect();
      card.dragging = true;
      card.pointerId = event.pointerId;
      card.grabX = event.clientX - rect.left - card.x;
      card.grabY = event.clientY - rect.top - card.y;
      card.lastX = event.clientX;
      card.lastY = event.clientY;
      card.lastTime = now;
      element.setPointerCapture?.(event.pointerId);
      setActiveCard(card);
      stage.classList.add("is-grabbing");
    });

    element.addEventListener("pointermove", (event) => {
      if (!card.dragging) return;

      const now = performance.now();
      const rect = stage.getBoundingClientRect();
      const dt = Math.max(16, now - card.lastTime);
      card.x = event.clientX - rect.left - card.grabX;
      card.y = event.clientY - rect.top - card.grabY;
      card.vx = (event.clientX - card.lastX) / dt * 5;
      card.vy = (event.clientY - card.lastY) / dt * 5;
      card.lastX = event.clientX;
      card.lastY = event.clientY;
      card.lastTime = now;
    });

    element.addEventListener("pointerup", () => releaseCard(card));
    element.addEventListener("pointercancel", () => releaseCard(card));
  }

  function animateMobile(now = performance.now()) {
    frameId = window.requestAnimationFrame(animateMobile);
    if (document.hidden || now - lastFrame < 32) return;
    lastFrame = now;

    const rect = stage.getBoundingClientRect();
    const time = performance.now() * 0.001;
    const minY = Math.min(132, rect.height * 0.16);

    for (const card of cards) {
      if (!card.dragging) {
        updateWander(card.wander, time, card.index);
        const targetX = rect.width * card.anchorX - card.width / 2 + card.wander.x * rect.width * 0.064;
        const targetY = rect.height * card.anchorY - card.height / 2 + card.wander.y * rect.height * 0.052;

        card.vx += (targetX - card.x) * 0.0038;
        card.vy += (targetY - card.y) * 0.0038;
        card.vx *= 0.905;
        card.vy *= 0.905;
        card.x += clamp(card.vx, -1.04, 1.04);
        card.y += clamp(card.vy, -1.04, 1.04);
      }

      card.x = clamp(card.x, -card.width * 0.32, rect.width - card.width * 0.68);
      card.y = clamp(card.y, minY, rect.height - card.height * 0.58);
      card.element.style.transform = `translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, 0) rotate(${card.angle.toFixed(4)}rad)`;
    }
  }

  assets.forEach(createCard);
  frameId = window.requestAnimationFrame(animateMobile);

  return () => {
    window.cancelAnimationFrame(frameId);
    stage.classList.remove("floating-stage--mobile", "is-grabbing");
    stage.innerHTML = "";
  };
}

function initFloatingFallback(stage) {
  if (!stage || stage.dataset.floatingReady === "fallback") return null;
  stage.dataset.floatingReady = "fallback";

  const assets = getFloatingAssets();
  const cards = [];
  let activeCard = null;
  let frameId = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setActiveCard(card) {
    if (activeCard) activeCard.element.classList.remove("is-active");
    activeCard = card;
    if (activeCard) activeCard.element.classList.add("is-active");
  }

  function resizeCard(event, card) {
    event.preventDefault();
    event.stopPropagation();

    const nextScale = clamp(card.scale * (event.deltaY < 0 ? 1.06 : 0.94), 0.66, 1.34);
    const ratio = nextScale / card.scale;
    if (Math.abs(ratio - 1) < 0.01) return;

    card.scale = nextScale;
    card.width *= ratio;
    card.height *= ratio;
    card.radius = Math.max(card.width, card.height) * 0.4;
    card.element.style.setProperty("--card-w", `${card.width}px`);
    card.element.style.setProperty("--card-h", `${card.height}px`);
    setActiveCard(card);
  }

  function releaseCard(card) {
    if (!card) return;
    card.dragging = false;
    stage.classList.remove("is-grabbing");
    card.element.releasePointerCapture?.(card.pointerId);
  }

  function createCard(asset, index) {
    const rect = stage.getBoundingClientRect();
    const responsiveScale = clamp(rect.width / 1500, 0.48, 0.68);
    const width = asset.width * responsiveScale;
    const height = asset.height * responsiveScale;
    const element = createFloatingElement(asset, index, width, height);
    const card = {
      element,
      index,
      width,
      height,
      x: clamp(rect.width * asset.x - width / 2, 24, rect.width - width - 24),
      y: clamp(rect.height * asset.floatY - height / 2, 24, rect.height - height - 24),
      vx: (index % 2 === 0 ? 0.08 : -0.08),
      vy: 0,
      angle: asset.angle * Math.PI / 180,
      va: 0,
      scale: 1,
      anchorX: asset.x,
      floatY: asset.floatY,
      phase: index * 1.73,
      wander: makeWander(index),
      radius: Math.max(width, height) * (asset.collisionScale || 1.1) * 0.55,
      dragging: false,
      pointerId: null,
      grabX: 0,
      grabY: 0,
      lastX: 0,
      lastY: 0,
      lastTime: performance.now()
    };

    stage.appendChild(element);
    cards.push(card);

    element.addEventListener("pointerdown", (event) => {
      const now = performance.now();
      const rect = stage.getBoundingClientRect();
      card.dragging = true;
      card.pointerId = event.pointerId;
      card.grabX = event.clientX - rect.left - card.x;
      card.grabY = event.clientY - rect.top - card.y;
      card.lastX = event.clientX;
      card.lastY = event.clientY;
      card.lastTime = now;
      element.setPointerCapture?.(event.pointerId);
      setActiveCard(card);
      stage.classList.add("is-grabbing");
    });

    element.addEventListener("pointermove", (event) => {
      if (!card.dragging) return;

      const now = performance.now();
      const rect = stage.getBoundingClientRect();
      const dt = Math.max(16, now - card.lastTime);
      card.x = event.clientX - rect.left - card.grabX;
      card.y = event.clientY - rect.top - card.grabY;
      card.vx = (event.clientX - card.lastX) / dt * 16;
      card.vy = (event.clientY - card.lastY) / dt * 16;
      card.va = card.vx * 0.00035;
      card.lastX = event.clientX;
      card.lastY = event.clientY;
      card.lastTime = now;
    });

    element.addEventListener("pointerup", () => releaseCard(card));
    element.addEventListener("pointercancel", () => releaseCard(card));
    element.addEventListener("wheel", (event) => resizeCard(event, card), { passive: false });
  }

  function solveCollision(a, b) {
    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const distance = Math.hypot(dx, dy) || 1;
    const minDistance = (a.radius + b.radius) * 0.82;
    if (distance >= minDistance) return;

    const overlap = (minDistance - distance) * 0.18;
    const nx = dx / distance;
    const ny = dy / distance;

    if (!a.dragging) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      a.vx -= nx * 0.032;
      a.vy -= ny * 0.032;
    }

    if (!b.dragging) {
      b.x += nx * overlap;
      b.y += ny * overlap;
      b.vx += nx * 0.032;
      b.vy += ny * 0.032;
    }
  }

  function animateFallback() {
    const rect = stage.getBoundingClientRect();
    const time = performance.now() * 0.001;

    for (const card of cards) {
      if (!card.dragging) {
        updateWander(card.wander, time, card.index);
        const targetY = rect.height * card.floatY + card.wander.y * rect.height * 0.16 + Math.sin(time * 0.12 + card.phase) * 22;
        const targetX = rect.width * card.anchorX + card.wander.x * rect.width * 0.14 + Math.cos(time * 0.105 + card.phase) * 22;

        card.vx += (targetX - (card.x + card.width / 2)) * 0.000074;
        card.vy += (targetY - (card.y + card.height / 2)) * 0.000078;
        card.vx += Math.sin(time * 0.17 + card.phase) * 0.0015;
        card.va += Math.sin(time * 0.15 + card.phase) * 0.000029;
        card.vx *= 0.986;
        card.vy *= 0.987;
        card.va *= 0.98;
        card.x += clamp(card.vx, -1.26, 1.26);
        card.y += clamp(card.vy, -1.3, 1.3);
        card.angle += card.va;
      }

      if (card.x < 14) {
        card.x = 14;
        card.vx = Math.abs(card.vx) * 0.22;
      }

      if (card.y < 14) {
        card.y = 14;
        card.vy = Math.abs(card.vy) * 0.16;
      }

      if (card.x > rect.width - card.width - 14) {
        card.x = rect.width - card.width - 14;
        card.vx = -Math.abs(card.vx) * 0.22;
      }

      if (card.y > rect.height - card.height - 18) {
        card.y = rect.height - card.height - 18;
        card.vy = -Math.abs(card.vy) * 0.16;
      }
    }

    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        solveCollision(cards[i], cards[j]);
      }
    }

    for (const card of cards) {
      card.element.style.transform = `translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, 0) rotate(${card.angle.toFixed(4)}rad)`;
    }

  }

  assets.forEach(createCard);
  animateFallback();
  frameId = window.setInterval(animateFallback, 16);

  return () => {
    window.clearInterval(frameId);
    stage.innerHTML = "";
  };
}

function initFloatingWorld() {
  const stage = document.querySelector("[data-floating-world]");
  if (!stage) return null;
  if (isCompactFloatingLayout(stage)) return initFloatingMobile(stage);
  if (!window.Matter) return initFloatingFallback(stage);
  if (stage.dataset.floatingReady === "true") return null;
  stage.dataset.floatingReady = "true";

  const {
    Bodies,
    Body,
    Composite,
    Engine,
    Events,
    Mouse,
    MouseConstraint,
    Runner
  } = window.Matter;

  const assets = getFloatingAssets();

  const engine = Engine.create({ enableSleeping: false });
  engine.positionIterations = 8;
  engine.velocityIterations = 6;
  engine.constraintIterations = 3;
  engine.gravity.y = 0.012;

  const runner = Runner.create();
  const cards = [];
  let bounds = [];
  let activeCard = null;
  let frameId = 0;
  let lastTick = performance.now();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function stageRect() {
    return stage.getBoundingClientRect();
  }

  function createCard(asset, index) {
    const rect = stageRect();
    const responsiveScale = clamp(rect.width / 1500, 0.48, 0.68);
    const width = asset.width * responsiveScale;
    const height = asset.height * responsiveScale;
    const collisionScale = asset.collisionScale || Math.max(asset.imageScale || 1, 1.08);
    const collisionWidth = width * collisionScale;
    const collisionHeight = height * collisionScale;
    const element = createFloatingElement(asset, index, width, height);
    stage.appendChild(element);

    const body = Bodies.rectangle(
      clamp(rect.width * asset.x, collisionWidth * 0.55, rect.width - collisionWidth * 0.55),
      clamp(rect.height * asset.floatY, collisionHeight * 0.55, rect.height - collisionHeight * 0.55),
      collisionWidth,
      collisionHeight,
      {
        restitution: 0.025,
        friction: 0.96,
        frictionAir: 0.215,
        density: 0.002,
        slop: 0.045,
        render: { visible: false }
      }
    );

    Body.rotate(body, asset.angle * Math.PI / 180);
    Composite.add(engine.world, body);

    const card = {
      body,
      element,
      index,
      baseWidth: width,
      baseHeight: height,
      baseCollisionWidth: collisionWidth,
      baseCollisionHeight: collisionHeight,
      scale: 1,
      anchorX: asset.x,
      floatY: asset.floatY,
      phase: index * 1.73,
      wander: makeWander(index)
    };
    cards.push(card);

    element.addEventListener("pointerdown", () => setActiveCard(card));
    element.addEventListener("wheel", (event) => resizeCard(event, card), { passive: false });
  }

  function setActiveCard(card) {
    if (activeCard) activeCard.element.classList.remove("is-active");
    activeCard = card;
    if (activeCard) activeCard.element.classList.add("is-active");
  }

  function resizeCard(event, card) {
    event.preventDefault();
    event.stopPropagation();

    const nextScale = clamp(card.scale * (event.deltaY < 0 ? 1.06 : 0.94), 0.66, 1.34);
    const ratio = nextScale / card.scale;
    if (Math.abs(ratio - 1) < 0.01) return;

    card.scale = nextScale;
    Body.scale(card.body, ratio, ratio);
    card.element.style.setProperty("--card-w", `${card.baseWidth * card.scale}px`);
    card.element.style.setProperty("--card-h", `${card.baseHeight * card.scale}px`);
    setActiveCard(card);
  }

  function resetBounds() {
    if (bounds.length) Composite.remove(engine.world, bounds);

    const rect = stageRect();
    const wallOptions = {
      isStatic: true,
      restitution: 0.08,
      friction: 0.92,
      render: { visible: false }
    };

    bounds = [
      Bodies.rectangle(rect.width / 2, rect.height + 70, rect.width + 320, 128, wallOptions),
      Bodies.rectangle(rect.width / 2, -70, rect.width + 320, 128, wallOptions),
      Bodies.rectangle(-70, rect.height / 2, 140, rect.height + 360, wallOptions),
      Bodies.rectangle(rect.width + 70, rect.height / 2, 140, rect.height + 360, wallOptions)
    ];

    Composite.add(engine.world, bounds);
  }

  function updateCards() {
    const rect = stageRect();

    for (const card of cards) {
      const width = card.baseWidth * card.scale;
      const height = card.baseHeight * card.scale;
      const collisionWidth = card.baseCollisionWidth * card.scale;
      const collisionHeight = card.baseCollisionHeight * card.scale;
      let { x, y } = card.body.position;
      const angle = card.body.angle;
      const minX = collisionWidth / 2 + 18;
      const maxX = rect.width - collisionWidth / 2 - 18;
      const minY = collisionHeight / 2 + 18;
      const maxY = rect.height - collisionHeight / 2 - 20;

      if (x < minX) {
        x = minX;
        Body.setPosition(card.body, { x, y });
        Body.setVelocity(card.body, { x: Math.abs(card.body.velocity.x) * 0.08, y: card.body.velocity.y * 0.56 });
      } else if (x > maxX) {
        x = maxX;
        Body.setPosition(card.body, { x, y });
        Body.setVelocity(card.body, { x: -Math.abs(card.body.velocity.x) * 0.08, y: card.body.velocity.y * 0.56 });
      }

      if (y < minY) {
        y = minY;
        Body.setPosition(card.body, { x, y });
        Body.setVelocity(card.body, { x: card.body.velocity.x * 0.56, y: Math.abs(card.body.velocity.y) * 0.08 });
      } else if (y > maxY) {
        y = maxY;
        Body.setPosition(card.body, { x, y });
        Body.setVelocity(card.body, { x: card.body.velocity.x * 0.56, y: -Math.abs(card.body.velocity.y) * 0.06 });
      }

      card.element.style.transform = `translate3d(${(x - width / 2).toFixed(2)}px, ${(y - height / 2).toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;
    }

  }

  function tickMatter() {
    Engine.update(engine, 1000 / 60);
    updateCards();
  }

  assets.forEach(createCard);
  resetBounds();

  const mouse = Mouse.create(stage);
  mouse.pixelRatio = window.devicePixelRatio || 1;
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    constraint: {
      stiffness: 0.09,
      damping: 0.32,
      render: { visible: false }
    }
  });
  releaseMatterScroll(mouse);

  Composite.add(engine.world, mouseConstraint);

  Events.on(engine, "beforeUpdate", () => {
    const rect = stageRect();
    const time = performance.now() * 0.001;

    for (const card of cards) {
      if (mouseConstraint.body === card.body) continue;

      updateWander(card.wander, time, card.index);
      const targetY = rect.height * card.floatY + card.wander.y * rect.height * 0.18 + Math.sin(time * 0.12 + card.phase) * 24;
      const targetX = rect.width * card.anchorX + card.wander.x * rect.width * 0.16 + Math.cos(time * 0.105 + card.phase) * 24;
      const forceX = clamp((targetX - card.body.position.x) * 0.0000052, -0.00124, 0.00124);
      const forceY = clamp((targetY - card.body.position.y) * 0.0000054 - 0.00014, -0.00128, 0.00128);
      const spin = Math.sin(time * 0.15 + card.phase) * 0.000014;

      Body.applyForce(card.body, card.body.position, { x: forceX, y: forceY });
      Body.setAngularVelocity(card.body, clamp(card.body.angularVelocity * 0.82 + spin, -0.0095, 0.0095));

      const speed = Math.hypot(card.body.velocity.x, card.body.velocity.y);
      if (speed > 0.86) {
        const ratio = 0.86 / speed;
        Body.setVelocity(card.body, {
          x: card.body.velocity.x * ratio,
          y: card.body.velocity.y * ratio
        });
      }
    }
  });

  Events.on(mouseConstraint, "startdrag", (event) => {
    const card = cards.find((item) => item.body === event.body);
    setActiveCard(card || null);
    stage.classList.add("is-grabbing");
  });

  Events.on(mouseConstraint, "enddrag", () => {
    stage.classList.remove("is-grabbing");
  });

  window.addEventListener("resize", resetBounds);
  function animateMatter(now = performance.now()) {
    const delta = clamp(now - lastTick, 1000 / 90, 1000 / 60);
    lastTick = now;
    Engine.update(engine, delta);
    updateCards();
    frameId = window.requestAnimationFrame(animateMatter);
  }

  animateMatter();

  return () => {
    window.cancelAnimationFrame(frameId);
    Runner.stop(runner);
    window.removeEventListener("resize", resetBounds);
    Composite.clear(engine.world);
    Engine.clear(engine);
  };
}

let floatingWorldStarted = false;
let floatingScheduleStarted = false;
let floatingWorldStarting = false;
let matterLoadPromise = null;

function loadMatterLibrary() {
  if (window.Matter) return Promise.resolve();
  if (matterLoadPromise) return matterLoadPromise;

  matterLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("matter-load-failed"));
    document.head.appendChild(script);
  });

  return matterLoadPromise;
}

function scheduleFloatingWorld() {
  if (floatingScheduleStarted) return;
  floatingScheduleStarted = true;

  const stage = document.querySelector("[data-floating-world]");
  if (!stage) return;

  async function startFloatingWorld() {
    if (floatingWorldStarted || floatingWorldStarting) return;
    floatingWorldStarting = true;

    if (!isCompactFloatingLayout(stage) && !window.Matter) {
      try {
        await loadMatterLibrary();
      } catch {
        // If the CDN is blocked, the lightweight fallback keeps the section usable.
      }
    }

    const cleanup = initFloatingWorld();
    if (!cleanup) {
      floatingWorldStarting = false;
      window.setTimeout(startFloatingWorld, 140);
      return;
    }

    floatingWorldStarted = true;
    floatingWorldStarting = false;
    window.removeEventListener("scroll", checkVisible);
    window.removeEventListener("resize", checkVisible);
  }

  function checkVisible() {
    const section = stage.closest(".floating-section") || stage;
    const rect = section.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.84 && rect.bottom > window.innerHeight * 0.16) {
      startFloatingWorld();
    }
  }

  if (!("IntersectionObserver" in window)) {
    checkVisible();
    window.addEventListener("scroll", checkVisible, { passive: true });
    window.addEventListener("resize", checkVisible);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    startFloatingWorld();
  }, {
    root: null,
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.18
  });

  observer.observe(stage.closest(".floating-section") || stage);
  window.addEventListener("scroll", checkVisible, { passive: true });
  window.addEventListener("resize", checkVisible);
  window.setTimeout(checkVisible, 120);
  if (window.location.hash === "#works") {
    window.setTimeout(startFloatingWorld, 160);
  }
}

if (!compactPointerQuery.matches) {
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("mousemove", handlePointerMove, { passive: true });
  requestAnimationFrame(animate);
} else if (hero) {
  hero.style.setProperty("--cursor-opacity", "0");
}

window.addEventListener("scroll", requestScrollParallax, { passive: true });
window.addEventListener("resize", requestScrollParallax);

scheduleFloatingWorld();
updateScrollParallax();
initTextReveals();
initPageTransitions();
initDesignViewer();
initLauncherPop();
initWorkArchive();
initContactForm();
initFooterPromptTyping();
initSiteCursor();
initBackgroundToggle();
window.setTimeout(hidePreloader, 650);

if (document.readyState === "complete") {
  hidePreloader();
  initVideo();
} else {
  window.addEventListener("load", () => {
    hidePreloader();
    initVideo();
  }, { once: true });
}

updateTime();
setInterval(updateTime, 1000);
