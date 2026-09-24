(() => {
  "use strict";

  const hero = document.querySelector(".hero--node-canvas");
  const toggle = document.querySelector("[data-workspace-immersive-toggle]");

  if (!(hero instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)) return;

  const body = document.body;
  let fallbackMode = false;
  let restoreScrollY = window.scrollY;

  const fullscreenElement = () =>
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    null;

  const isImmersive = () => body.classList.contains("is-workspace-immersive");

  function requestWorkspaceResize() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
  }

  function setImmersive(active) {
    body.classList.toggle("is-workspace-immersive", active);
    toggle.setAttribute("aria-pressed", String(active));
    toggle.setAttribute(
      "aria-label",
      active ? "Salir del modo inmersivo" : "Entrar en modo inmersivo"
    );
    toggle.title = active ? "Salir del modo inmersivo" : "Modo inmersivo";
    requestWorkspaceResize();
  }

  function restorePagePosition() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: restoreScrollY, left: 0, behavior: "auto" });
    });
  }

  async function enterImmersive() {
    if (isImmersive()) return;

    restoreScrollY = window.scrollY;
    fallbackMode = false;
    setImmersive(true);

    try {
      if (typeof hero.requestFullscreen === "function") {
        await hero.requestFullscreen({ navigationUI: "hide" });
        return;
      }

      if (typeof hero.webkitRequestFullscreen === "function") {
        hero.webkitRequestFullscreen();
        return;
      }

      fallbackMode = true;
    } catch {
      fallbackMode = true;
    }
  }

  async function exitImmersive() {
    const currentFullscreen = fullscreenElement();

    if (currentFullscreen) {
      try {
        if (typeof document.exitFullscreen === "function") {
          await document.exitFullscreen();
          return;
        }

        if (typeof document.webkitExitFullscreen === "function") {
          document.webkitExitFullscreen();
          return;
        }
      } catch {
        return;
      }
    }

    fallbackMode = false;
    setImmersive(false);
    restorePagePosition();
  }

  function syncFullscreenState() {
    const currentFullscreen = fullscreenElement();

    if (currentFullscreen === hero) {
      fallbackMode = false;
      if (!isImmersive()) setImmersive(true);
      return;
    }

    if (isImmersive() && !fallbackMode) {
      setImmersive(false);
      restorePagePosition();
    }
  }

  toggle.addEventListener("pointerdown", event => {
    event.stopPropagation();
  });

  toggle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    if (isImmersive()) exitImmersive();
    else enterImmersive();
  });

  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !isImmersive() || fullscreenElement()) return;
    event.preventDefault();
    fallbackMode = false;
    setImmersive(false);
    restorePagePosition();
  });
})();
