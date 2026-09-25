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
    nav.style.setProperty("--card-nav-drawer-height", `${drawer.scrollHeight}px`);
  };

  const getDragBounds = () => {
    const rect = nav.getBoundingClientRect();
    const margin = 12;
    return {
      minX: offsetX + margin - rect.left,
      maxX: offsetX + window.innerWidth - margin - rect.right,
      minY: offsetY + margin - rect.top,
      maxY: offsetY + window.innerHeight - margin - rect.bottom
    };
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
    if (dragSurface.hasPointerCapture?.(event.pointerId)) {
      dragSurface.releasePointerCapture(event.pointerId);
    }

    dragState = null;
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
    syncDrawerHeight();
    nav.classList.toggle("is-card-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Cerrar menu" : "Abrir menu");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");

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
    syncDrawerHeight();
    const bounds = getDragBounds();
    offsetX = clamp(offsetX, bounds.minX, bounds.maxX);
    offsetY = clamp(offsetY, bounds.minY, bounds.maxY);
    applyOffset();
  });

  syncDrawerHeight();
  applyOffset();
})();