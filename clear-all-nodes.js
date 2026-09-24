(() => {
  'use strict';

  const STORAGE_KEY = 'deushima:workspace:clear-all:v1';
  const MENU_SELECTOR = '.hero-custom-node-context';
  const ITEM_SELECTOR = '.hero-custom-node-context__item';
  const LABEL_SELECTOR = '.hero-custom-node-context__label';
  const CONFIRM_MS = 2800;

  const stage = document.querySelector('[data-hero-node-stage]');
  const menu = document.querySelector(MENU_SELECTOR);
  if (!stage || !menu) return;

  const detachedOriginals = new Map();

  function heroNodesApi() {
    return window.DeushimaHeroNodes || null;
  }

  function customNodesApi() {
    return window.DeushimaCustomNodes || null;
  }

  function readClearedState() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeClearedState(active) {
    try {
      if (active) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function originalNodes() {
    const nodes = heroNodesApi()?.getOriginalNodes?.();
    return Array.isArray(nodes) ? nodes : [...stage.querySelectorAll('[data-hero-node]')];
  }

  function detachOriginalNodes() {
    originalNodes().forEach(node => {
      if (!node?.isConnected || detachedOriginals.has(node)) return;
      const marker = document.createComment(`deushima-original-node:${node.dataset.heroNode || 'node'}`);
      node.replaceWith(marker);
      node.setAttribute('aria-hidden', 'true');
      detachedOriginals.set(node, marker);
    });

    stage.classList.add('is-all-nodes-cleared');

    const disconnect = stage.querySelector('[data-node-disconnect]');
    disconnect?.classList.remove('is-visible');
    disconnect?.setAttribute('aria-hidden', 'true');
    if (disconnect) disconnect.tabIndex = -1;
  }

  function restoreOriginalNodes() {
    originalNodes().forEach(node => {
      const marker = detachedOriginals.get(node);
      if (marker?.isConnected) {
        marker.replaceWith(node);
      } else if (!node.isConnected) {
        stage.appendChild(node);
      }
      node.removeAttribute('aria-hidden');
      detachedOriginals.delete(node);
    });

    stage.classList.remove('is-all-nodes-cleared');
  }

  function emptyOriginalWorkspace({ persist = true } = {}) {
    heroNodesApi()?.applyWorkspaceState?.({
      positions: [],
      edges: []
    }, { persist });
    detachOriginalNodes();
    heroNodesApi()?.requestDraw?.();
  }

  function removeVisitorCardsImmediately() {
    stage.querySelectorAll('[data-custom-node]').forEach(node => node.remove());
  }

  function closeContextMenu() {
    menu.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
  }

  function clearEverything() {
    writeClearedState(true);
    emptyOriginalWorkspace({ persist: true });
    customNodesApi()?.clear?.();
    removeVisitorCardsImmediately();

    window.setTimeout(() => {
      detachOriginalNodes();
      removeVisitorCardsImmediately();
      heroNodesApi()?.requestDraw?.();
    }, 220);

    closeContextMenu();
    stage.focus({ preventScroll: true });
  }

  function restoreOriginalsBeforeReset() {
    if (!readClearedState()) return;
    writeClearedState(false);
    restoreOriginalNodes();
    requestAnimationFrame(() => heroNodesApi()?.requestDraw?.());
  }

  function menuLabel(button) {
    return button?.querySelector(LABEL_SELECTOR)?.textContent?.trim() || '';
  }

  function buildClearAllButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-custom-node-context__item';
    button.setAttribute('role', 'menuitem');
    button.dataset.clearAllNodes = '';

    const icon = document.createElement('span');
    icon.className = 'hero-custom-node-context__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '×';

    const label = document.createElement('span');
    label.className = 'hero-custom-node-context__label';
    label.textContent = 'Clear all nodes';

    button.append(icon, label);

    let confirmTimer = 0;

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.confirm !== 'true') {
        button.dataset.confirm = 'true';
        button.classList.add('is-confirming');
        label.textContent = 'Confirm clear all';
        window.clearTimeout(confirmTimer);
        confirmTimer = window.setTimeout(() => {
          button.dataset.confirm = 'false';
          button.classList.remove('is-confirming');
          label.textContent = 'Clear all nodes';
        }, CONFIRM_MS);
        return;
      }

      window.clearTimeout(confirmTimer);
      clearEverything();
    });

    return button;
  }

  function enhanceCanvasMenu() {
    const heading = menu.querySelector('.hero-custom-node-context__heading');
    if (heading?.textContent?.trim() !== 'New node +') return;
    if (menu.querySelector('[data-clear-all-nodes]')) return;

    const importButton = [...menu.querySelectorAll(ITEM_SELECTOR)]
      .find(button => menuLabel(button) === 'Import Node');

    if (!importButton) return;
    importButton.insertAdjacentElement('afterend', buildClearAllButton());
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest(ITEM_SELECTOR)
      : null;
    if (!button || !menu.contains(button)) return;
    if (menuLabel(button) !== 'Reset') return;
    restoreOriginalsBeforeReset();
  }, true);

  const menuObserver = new MutationObserver(enhanceCanvasMenu);
  menuObserver.observe(menu, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  function applyPersistedClearedState() {
    if (!readClearedState()) return;
    emptyOriginalWorkspace({ persist: false });

    const customState = customNodesApi()?.getState?.();
    if (customState?.nodes?.length || customState?.connections?.length) {
      customNodesApi()?.clear?.();
      removeVisitorCardsImmediately();
    }
  }

  enhanceCanvasMenu();
  applyPersistedClearedState();

  window.DeushimaClearAllNodes = Object.freeze({
    storageKey: STORAGE_KEY,
    clear: clearEverything,
    isCleared: readClearedState,
    restoreOriginals: () => {
      writeClearedState(false);
      restoreOriginalNodes();
      heroNodesApi()?.resetOriginals?.();
      heroNodesApi()?.requestDraw?.();
    }
  });
})();
