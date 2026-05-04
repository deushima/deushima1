const hero = document.querySelector(".hero");
const preloader = document.querySelector("[data-preloader]");
const timeNode = document.querySelector("[data-current-time]");
const video = document.querySelector("[data-hero-video]");

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
  if (!preloader) return;
  window.setTimeout(() => preloader.classList.add("is-hidden"), 520);
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

  if (hero) {
    const speed = Math.min(1, Math.hypot(velocityX, velocityY) / 62);
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

  requestAnimationFrame(animate);
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

function getFloatingAssets() {
  return [
    { src: "Flotantes/heroines-2.svg", width: 330, height: 468, x: 0.78, y: 180, angle: 12, floatY: 0.58 },
    { src: "Flotantes/bestseller.svg", width: 318, height: 420, x: 0.17, y: 120, angle: -14, floatY: 0.62 },
    { src: "Flotantes/new-era-classic-png-negro.svg", width: 330, height: 396, x: 0.45, y: 60, angle: -1, floatY: 0.66 },
    { src: "Flotantes/svg-02.svg", width: 312, height: 402, x: 0.64, y: 80, angle: 15, floatY: 0.5 },
    { src: "Flotantes/Dise%C3%B1o.svg", width: 390, height: 292, x: 0.53, y: 10, angle: -31, floatY: 0.42 },
    { src: "Flotantes/big-boss-negativo.svg", width: 306, height: 408, x: 0.3, y: 30, angle: 5, floatY: 0.55 }
  ];
}

function createFloatingElement(asset, index, width, height) {
  const element = document.createElement("article");
  const image = document.createElement("img");
  const controls = document.createElement("span");
  const hint = document.createElement("span");

  element.className = "floating-card";
  element.style.setProperty("--card-w", `${width}px`);
  element.style.setProperty("--card-h", `${height}px`);

  image.className = "floating-card__image";
  image.src = asset.src;
  image.alt = "";
  image.draggable = false;

  controls.className = "floating-card__controls";
  ["nw", "ne", "se", "sw", "e", "w"].forEach((position) => {
    const handle = document.createElement("span");
    handle.className = `floating-card__handle floating-card__handle--${position}`;
    controls.appendChild(handle);
  });

  hint.className = "floating-card__hint";
  hint.textContent = `piece ${String(index + 1).padStart(2, "0")}`;

  element.append(image, controls, hint);
  return element;
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
    const responsiveScale = clamp(rect.width / 1500, 0.7, 1);
    const width = asset.width * responsiveScale;
    const height = asset.height * responsiveScale;
    const element = createFloatingElement(asset, index, width, height);
    const card = {
      element,
      width,
      height,
      x: clamp(rect.width * asset.x - width / 2, 24, rect.width - width - 24),
      y: asset.y,
      vx: (index % 2 === 0 ? 0.18 : -0.18),
      vy: 0,
      angle: asset.angle * Math.PI / 180,
      va: 0,
      scale: 1,
      floatY: asset.floatY,
      phase: index * 1.73,
      radius: Math.max(width, height) * 0.4,
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

    const overlap = (minDistance - distance) * 0.28;
    const nx = dx / distance;
    const ny = dy / distance;

    if (!a.dragging) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      a.vx -= nx * 0.055;
      a.vy -= ny * 0.055;
    }

    if (!b.dragging) {
      b.x += nx * overlap;
      b.y += ny * overlap;
      b.vx += nx * 0.055;
      b.vy += ny * 0.055;
    }
  }

  function animateFallback() {
    const rect = stage.getBoundingClientRect();
    const time = performance.now() * 0.001;

    for (const card of cards) {
      if (!card.dragging) {
        const targetY = rect.height * card.floatY + Math.sin(time * 0.38 + card.phase) * 20;
        const targetX = rect.width * (0.18 + (card.phase % 5) * 0.16) + Math.cos(time * 0.24 + card.phase) * 18;

        card.vx += (targetX - (card.x + card.width / 2)) * 0.00012;
        card.vy += 0.52;
        card.vy += (targetY - (card.y + card.height / 2)) * 0.00072;
        card.vx += Math.sin(time * 0.44 + card.phase) * 0.004;
        card.va += Math.sin(time * 0.34 + card.phase) * 0.00016;
        card.vx *= 0.955;
        card.vy *= 0.965;
        card.va *= 0.95;
        card.x += clamp(card.vx, -4.6, 4.6);
        card.y += clamp(card.vy, -7.2, 7.2);
        card.angle += card.va;
      }

      if (card.x < 14) {
        card.x = 14;
        card.vx = Math.abs(card.vx) * 0.38;
      }

      if (card.x > rect.width - card.width - 14) {
        card.x = rect.width - card.width - 14;
        card.vx = -Math.abs(card.vx) * 0.38;
      }

      if (card.y > rect.height - card.height - 18) {
        card.y = rect.height - card.height - 18;
        card.vy = -Math.abs(card.vy) * 0.24;
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
  engine.gravity.y = 0.82;

  const runner = Runner.create();
  const cards = [];
  let bounds = [];
  let activeCard = null;
  let frameId = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function stageRect() {
    return stage.getBoundingClientRect();
  }

  function createCard(asset, index) {
    const rect = stageRect();
    const responsiveScale = clamp(rect.width / 1500, 0.7, 1);
    const width = asset.width * responsiveScale;
    const height = asset.height * responsiveScale;
    const element = createFloatingElement(asset, index, width, height);
    stage.appendChild(element);

    const body = Bodies.rectangle(
      clamp(rect.width * asset.x, width * 0.6, rect.width - width * 0.6),
      asset.y,
      width,
      height,
      {
        restitution: 0.16,
        friction: 0.72,
        frictionAir: 0.07,
        density: 0.002,
        slop: 0.04,
        render: { visible: false }
      }
    );

    Body.rotate(body, asset.angle * Math.PI / 180);
    Composite.add(engine.world, body);

    const card = {
      body,
      element,
      baseWidth: width,
      baseHeight: height,
      scale: 1,
      floatY: asset.floatY,
      phase: index * 1.73
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
      restitution: 0.18,
      friction: 0.8,
      render: { visible: false }
    };

    bounds = [
      Bodies.rectangle(rect.width / 2, rect.height + 70, rect.width + 320, 128, wallOptions),
      Bodies.rectangle(-70, rect.height / 2, 140, rect.height + 360, wallOptions),
      Bodies.rectangle(rect.width + 70, rect.height / 2, 140, rect.height + 360, wallOptions)
    ];

    Composite.add(engine.world, bounds);
  }

  function updateCards() {
    for (const card of cards) {
      const width = card.baseWidth * card.scale;
      const height = card.baseHeight * card.scale;
      const { x, y } = card.body.position;
      const angle = card.body.angle;

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
      stiffness: 0.2,
      damping: 0.09,
      render: { visible: false }
    }
  });

  Composite.add(engine.world, mouseConstraint);

  Events.on(engine, "beforeUpdate", () => {
    const rect = stageRect();
    const time = performance.now() * 0.001;

    for (const card of cards) {
      if (mouseConstraint.body === card.body) continue;

      const targetY = rect.height * card.floatY + Math.sin(time * 0.38 + card.phase) * 20;
      const targetX = rect.width * (0.18 + (card.phase % 5) * 0.16) + Math.cos(time * 0.24 + card.phase) * 18;
      const forceX = clamp((targetX - card.body.position.x) * 0.000006, -0.003, 0.003);
      const forceY = clamp((targetY - card.body.position.y) * 0.000032 - 0.015, -0.032, 0.018);
      const spin = Math.sin(time * 0.34 + card.phase) * 0.00014;

      Body.applyForce(card.body, card.body.position, { x: forceX, y: forceY });
      Body.setAngularVelocity(card.body, card.body.angularVelocity * 0.93 + spin);

      const speed = Math.hypot(card.body.velocity.x, card.body.velocity.y);
      if (speed > 5.6) {
        const ratio = 5.6 / speed;
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
  tickMatter();
  frameId = window.setInterval(tickMatter, 16);

  return () => {
    window.clearInterval(frameId);
    Runner.stop(runner);
    window.removeEventListener("resize", resetBounds);
    Composite.clear(engine.world);
    Engine.clear(engine);
  };
}

let floatingWorldStarted = false;
let floatingScheduleStarted = false;

function scheduleFloatingWorld() {
  if (floatingScheduleStarted) return;
  floatingScheduleStarted = true;

  const stage = document.querySelector("[data-floating-world]");
  if (!stage) return;

  function startFloatingWorld() {
    if (floatingWorldStarted) return;
    const cleanup = initFloatingWorld();
    if (!cleanup) {
      window.setTimeout(startFloatingWorld, 140);
      return;
    }

    floatingWorldStarted = true;
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

window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("mousemove", handlePointerMove, { passive: true });

scheduleFloatingWorld();

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
requestAnimationFrame(animate);
