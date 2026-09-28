(() => {
  'use strict';

  const coarse = window.matchMedia('(pointer: coarse)');
  const mobile = window.matchMedia('(max-width: 760px)');
  if (!coarse.matches && !mobile.matches) return;

  const root = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
  const menu = document.querySelector('.hero-custom-node-context');
  if (!root || !menu) return;

  let activeTouchId = null;
  let touchStartedAt = 0;
  let menuOpenedAt = 0;
  let protectRelease = false;
  let suppressSyntheticUntil = 0;

  const now = () => performance.now();

  const isInsideMenu = target => target instanceof Node && menu.contains(target);

  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    if (isInsideMenu(event.target)) return;
    activeTouchId = event.pointerId;
    touchStartedAt = now();
    protectRelease = false;
  }, { capture: true, passive: true });

  const observer = new MutationObserver(() => {
    if (!menu.classList.contains('is-open')) return;
    if (activeTouchId == null) return;

    // The menu was opened by the current long-press gesture. From this point,
    // lifting the finger must only end the gesture — never dismiss the menu.
    menuOpenedAt = now();
    protectRelease = true;
  });

  observer.observe(menu, { attributes: true, attributeFilter: ['class'] });

  const guardRelease = event => {
    if (!protectRelease) return;
    if (activeTouchId == null || event.pointerId !== activeTouchId) return;
    if (!menu.classList.contains('is-open')) return;
    if (isInsideMenu(event.target)) return;

    // Stop the release before the workspace's global interaction teardown sees it.
    // This preserves the already-open contextual menu on Android/Chrome where a
    // long-press release can otherwise be interpreted as a cancel/dismiss action.
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();

    suppressSyntheticUntil = now() + 750;
    protectRelease = false;
    activeTouchId = null;
  };

  document.addEventListener('pointerup', guardRelease, { capture: true, passive: false });
  document.addEventListener('pointercancel', guardRelease, { capture: true, passive: false });

  document.addEventListener('click', event => {
    if (now() > suppressSyntheticUntil) return;
    if (!menu.classList.contains('is-open')) return;
    if (isInsideMenu(event.target)) return;

    // Android may emit a synthetic click after the finger is lifted. It belongs
    // to the long-press gesture and must not be treated as a second canvas tap.
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }, { capture: true });

  document.addEventListener('contextmenu', event => {
    if (now() > suppressSyntheticUntil) return;
    if (!menu.classList.contains('is-open')) return;
    if (isInsideMenu(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }, { capture: true });

  menu.addEventListener('pointerdown', () => {
    // Once the user actually interacts with the menu, normal menu lifecycle is
    // restored immediately so items/forms can close or replace it as intended.
    protectRelease = false;
    activeTouchId = null;
    suppressSyntheticUntil = 0;
  }, { capture: true, passive: true });

  window.addEventListener('blur', () => {
    activeTouchId = null;
    protectRelease = false;
    suppressSyntheticUntil = 0;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    activeTouchId = null;
    protectRelease = false;
    suppressSyntheticUntil = 0;
  });
})();
