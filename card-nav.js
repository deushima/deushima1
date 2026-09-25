(() => {
  const nav = document.querySelector("[data-card-nav]");
  const toggle = nav?.querySelector("[data-card-nav-toggle]");
  const drawer = nav?.querySelector("[data-card-nav-drawer]");

  if (!nav || !toggle || !drawer) return;

  const setOpen = (open, restoreFocus = false) => {
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
})();
