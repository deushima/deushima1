(() => {
  'use strict';

  const BOOT_KEY = '__deushimaWireNodeAutoconnectV1';
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;

  const CREATE_TYPES = new Map([
    ['Text', 'text'],
    ['Link image', 'media'],
    ['Instagram', 'instagram'],
    ['YouTube', 'youtube'],
    ['Link', 'link']
  ]);

  const start = () => {
    const hero = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
    const stage = hero?.querySelector('[data-hero-node-stage]');
    const menu = hero?.querySelector('.hero-custom-node-context') || document.querySelector('.hero-custom-node-context');
    const api = window.DeushimaCustomNodes;

    if (!hero || !stage || !menu || !api?.getState) {
      window.setTimeout(start, 80);
      return;
    }

    let gesture = null;
    let pendingWire = null;
    let selectedType = null;
    let awaitingNode = false;
    let candidateNode = null;
    let candidateType = null;
    let candidateObserver = null;
    let menuCloseTimer = 0;
    let syntheticPointerSeed = 47000;
    let connecting = false;

    const isPort = target => target instanceof Element
      ? target.closest('[data-custom-port], [data-node-port]')
      : null;

    const centerOf = element => {
      if (!(element instanceof Element) || !element.isConnected) return null;
      const rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5
      };
    };

    const menuIsCanvas = () => {
      if (!menu.classList.contains('is-open')) return false;
      const heading = menu.querySelector('.hero-custom-node-context__heading');
      return heading?.textContent?.trim() === 'New node +';
    };

    const clearCandidateObserver = () => {
      candidateObserver?.disconnect();
      candidateObserver = null;
    };

    const clearPending = () => {
      window.clearTimeout(menuCloseTimer);
      menuCloseTimer = 0;
      clearCandidateObserver();
      pendingWire = null;
      selectedType = null;
      awaitingNode = false;
      candidateNode = null;
      candidateType = null;
      connecting = false;
      delete menu.dataset.wireAutoconnect;
    };

    const snapshotConnectionCount = () => {
      try {
        return Number(api.getState()?.connections?.length) || 0;
      } catch {
        return 0;
      }
    };

    const closestPortToSource = (node, sourcePort) => {
      const sourceCenter = centerOf(sourcePort);
      if (!sourceCenter) return null;
      const ports = [...node.querySelectorAll('[data-custom-port]')];
      let best = null;
      let bestDistance = Infinity;
      ports.forEach(port => {
        const point = centerOf(port);
        if (!point) return;
        const distance = Math.hypot(point.x - sourceCenter.x, point.y - sourceCenter.y);
        if (distance < bestDistance) {
          best = port;
          bestDistance = distance;
        }
      });
      return best;
    };

    const dispatchSyntheticPointer = (target, type, point, pointerId, buttons) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons,
        clientX: point.x,
        clientY: point.y
      });
      target.dispatchEvent(event);
    };

    const connectCandidate = () => {
      if (connecting) return;
      if (!pendingWire || !candidateNode?.isConnected || !pendingWire.sourcePort?.isConnected) {
        clearPending();
        return;
      }

      const sourcePort = pendingWire.sourcePort;
      const targetPort = closestPortToSource(candidateNode, sourcePort);
      const sourcePoint = centerOf(sourcePort);
      const targetPoint = centerOf(targetPort);
      if (!targetPort || !sourcePoint || !targetPoint) {
        clearPending();
        return;
      }

      connecting = true;
      const before = snapshotConnectionCount();
      const pointerId = ++syntheticPointerSeed;

      dispatchSyntheticPointer(sourcePort, 'pointerdown', sourcePoint, pointerId, 1);
      dispatchSyntheticPointer(window, 'pointermove', targetPoint, pointerId, 1);
      dispatchSyntheticPointer(window, 'pointerup', targetPoint, pointerId, 0);

      requestAnimationFrame(() => {
        const after = snapshotConnectionCount();
        if (after > before) {
          candidateNode?.classList.add('is-wire-autoconnected');
        }
        clearPending();
      });
    };

    const tryFinalizeCandidate = () => {
      if (connecting) return;
      if (!candidateNode?.isConnected || !pendingWire) return;
      if (menu.classList.contains('is-open')) return;
      if (candidateType === 'media' && !candidateNode.classList.contains('is-media-ready')) return;
      connectCandidate();
    };

    const watchCandidate = node => {
      clearCandidateObserver();
      candidateObserver = new MutationObserver(() => {
        if (!node.isConnected) {
          candidateNode = null;
          clearCandidateObserver();
          return;
        }
        tryFinalizeCandidate();
      });
      candidateObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
    };

    const stageObserver = new MutationObserver(records => {
      if (!pendingWire || !awaitingNode || candidateNode || connecting) return;

      for (const record of records) {
        for (const added of record.addedNodes) {
          if (!(added instanceof Element)) continue;
          const node = added.matches('[data-custom-node]')
            ? added
            : added.querySelector?.('[data-custom-node]');
          if (!node) continue;

          candidateNode = node;
          candidateType = selectedType;
          awaitingNode = false;
          watchCandidate(node);
          tryFinalizeCandidate();
          return;
        }
      }
    });
    stageObserver.observe(stage, { childList: true, subtree: true });

    const scheduleMenuClosedResolution = () => {
      window.clearTimeout(menuCloseTimer);
      menuCloseTimer = window.setTimeout(() => {
        menuCloseTimer = 0;
        if (!pendingWire || connecting || menu.classList.contains('is-open')) return;

        if (candidateNode?.isConnected) {
          if (candidateType === 'media' && !candidateNode.classList.contains('is-media-ready')) {
            clearPending();
            return;
          }
          tryFinalizeCandidate();
          return;
        }

        // Text nodes are created immediately after the menu closes in the same click task.
        // Give that DOM insertion a small window before treating the close as a cancel.
        clearPending();
      }, 140);
    };

    const menuObserver = new MutationObserver(() => {
      if (!pendingWire || connecting) return;
      if (menu.classList.contains('is-open')) {
        window.clearTimeout(menuCloseTimer);
        menuCloseTimer = 0;
        return;
      }
      scheduleMenuClosedResolution();
    });
    menuObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('pointerdown', event => {
      if (!event.isTrusted) return;
      const port = isPort(event.target);
      if (!port || !stage.contains(port)) return;
      gesture = {
        pointerId: event.pointerId,
        sourcePort: port,
        startedAt: performance.now()
      };
    }, { capture: true, passive: true });

    window.addEventListener('pointerup', event => {
      if (!event.isTrusted || !gesture || event.pointerId !== gesture.pointerId) return;
      const finishedGesture = gesture;
      gesture = null;

      requestAnimationFrame(() => {
        if (!finishedGesture.sourcePort?.isConnected || !menuIsCanvas()) {
          clearPending();
          return;
        }

        pendingWire = {
          sourcePort: finishedGesture.sourcePort,
          dropX: event.clientX,
          dropY: event.clientY,
          startedAt: finishedGesture.startedAt
        };
        selectedType = null;
        awaitingNode = false;
        candidateNode = null;
        candidateType = null;
        connecting = false;
        menu.dataset.wireAutoconnect = 'true';
      });
    }, { passive: true });

    window.addEventListener('pointercancel', event => {
      if (!event.isTrusted || !gesture || event.pointerId !== gesture.pointerId) return;
      gesture = null;
    }, { passive: true });

    menu.addEventListener('click', event => {
      if (!pendingWire || connecting) return;
      const item = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
      if (!item || !menu.contains(item)) return;
      const label = item.querySelector('.hero-custom-node-context__label')?.textContent?.trim();
      const type = CREATE_TYPES.get(label || '');
      if (!type) return;

      selectedType = type;
      candidateNode = null;
      candidateType = null;
      clearCandidateObserver();

      // Text is created synchronously by the menu action. URL-backed nodes are armed
      // only when their form is actually submitted, so Cancel does not create a wire.
      awaitingNode = type === 'text';
    }, { capture: true });

    menu.addEventListener('submit', event => {
      if (!pendingWire || connecting || !selectedType || selectedType === 'text') return;
      const form = event.target instanceof Element
        ? event.target.closest('.hero-custom-node-context__url-form')
        : null;
      if (!form || !menu.contains(form)) return;
      awaitingNode = true;
      candidateNode = null;
      candidateType = null;
      clearCandidateObserver();
    }, { capture: true });

    // Escape/click-away closes are handled by the menu observer. If the whole page
    // changes state, do not leave a stale source waiting for a future node.
    window.addEventListener('blur', () => {
      if (!menu.classList.contains('is-open')) clearPending();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPending();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();