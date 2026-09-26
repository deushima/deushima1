(() => {
  const nav = document.querySelector("[data-card-nav]");
  const toggle = nav?.querySelector("[data-card-nav-toggle]");
  const drawer = nav?.querySelector("[data-card-nav-drawer]");
  const dragSurface = nav?.querySelector(".card-nav__bar");

  if (!nav || !toggle || !drawer || !dragSurface) return;

  let offsetX = 0;
  let offsetY = 0;
  let dragState = null;
  let suppressClick = false;
  let reboundTimer = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const applyOffset = () => {
    nav.style.setProperty("--card-nav-x", `${offsetX}px`);
    nav.style.setProperty("--card-nav-y", `${offsetY}px`);
  };

  const syncDrawerHeight = () => {
    const contentHeight = [...drawer.children].reduce((height, child) => height + child.getBoundingClientRect().height, 0);
    const barHeight = nav.offsetHeight - drawer.offsetHeight;
    const availableHeight = Math.max(0, window.innerHeight - 24 - barHeight);
    nav.style.setProperty("--card-nav-drawer-height", `${Math.min(contentHeight, availableHeight)}px`);
    return barHeight + Math.min(contentHeight, availableHeight);
  };

  const getDragBounds = (height = nav.offsetHeight) => {
    const rect = nav.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = document.documentElement.clientWidth;
    const horizontalMargin = Math.min(margin, Math.max(0, (viewportWidth - nav.offsetWidth) / 2));
    const left = rect.left + (rect.width - nav.offsetWidth) / 2;
    const top = rect.top + (rect.height - nav.offsetHeight) / 2;
    return {
      minX: offsetX + horizontalMargin - left,
      maxX: offsetX + viewportWidth - horizontalMargin - left - nav.offsetWidth,
      minY: offsetY + margin - top,
      maxY: offsetY + window.innerHeight - margin - top - height
    };
  };

  const keepInViewport = (height) => {
    const bounds = getDragBounds(height);
    offsetX = clamp(offsetX, bounds.minX, Math.max(bounds.minX, bounds.maxX));
    offsetY = clamp(offsetY, bounds.minY, Math.max(bounds.minY, bounds.maxY));
    applyOffset();
  };

  const beginDrag = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("a, button")) return;

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offsetX,
      baseY: offsetY,
      bounds: getDragBounds(),
      moved: false
    };

    window.clearTimeout(reboundTimer);
    nav.classList.remove("is-rebounding");
    nav.classList.add("is-dragging");
    dragSurface.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.hypot(dx, dy) > 3) dragState.moved = true;

    offsetX = clamp(dragState.baseX + dx, dragState.bounds.minX, dragState.bounds.maxX);
    offsetY = clamp(dragState.baseY + dy, dragState.bounds.minY, dragState.bounds.maxY);
    applyOffset();
    event.preventDefault();
  };

  const endDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const moved = dragState.moved;
    dragState = null;
    if (dragSurface.hasPointerCapture?.(event.pointerId)) {
      dragSurface.releasePointerCapture(event.pointerId);
    }

    nav.classList.remove("is-dragging");
    nav.classList.remove("is-rebounding");
    void nav.offsetWidth;
    nav.classList.add("is-rebounding");

    reboundTimer = window.setTimeout(() => {
      nav.classList.remove("is-rebounding");
    }, 560);

    if (moved) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };

  const setOpen = (open, restoreFocus = false) => {
    const openHeight = syncDrawerHeight();
    if (open) keepInViewport(openHeight);
    nav.classList.toggle("is-card-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Cerrar menu" : "Abrir menu");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    drawer.inert = !open;

    if (!open && restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-card-nav-open"));
  });

  dragSurface.addEventListener("pointerdown", beginDrag);
  dragSurface.addEventListener("pointermove", moveDrag);
  dragSurface.addEventListener("pointerup", endDrag);
  dragSurface.addEventListener("pointercancel", endDrag);
  dragSurface.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("blur", () => {
    if (dragState) endDrag({ pointerId: dragState.pointerId });
  });

  nav.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  drawer.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) {
      setOpen(false);
    }
  });

  nav.querySelector(".card-nav__cta")?.addEventListener("click", () => {
    setOpen(false);
  });

  nav.querySelector(".brand-mark")?.addEventListener("click", () => {
    setOpen(false);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!nav.classList.contains("is-card-nav-open")) return;
    if (nav.contains(event.target)) return;
    setOpen(false);
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !nav.classList.contains("is-card-nav-open")) return;
    event.preventDefault();
    setOpen(false, true);
  });

  window.addEventListener("resize", () => {
    const openHeight = syncDrawerHeight();
    keepInViewport(nav.classList.contains("is-card-nav-open") ? openHeight : undefined);
  });

  drawer.inert = true;
  document.fonts?.ready.then(() => {
    const openHeight = syncDrawerHeight();
    if (nav.classList.contains("is-card-nav-open")) keepInViewport(openHeight);
  });
  syncDrawerHeight();
  applyOffset();
})();
