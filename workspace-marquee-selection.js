(() => {
  'use strict';

  const BOOT_KEY = '__deushimaWorkspaceMarqueeV1';
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;

  const start = () => {
    const hero = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
    const stage = hero?.querySelector('[data-hero-node-stage]');
    if (!hero || !stage) {
      window.setTimeout(start, 80);
      return;
    }

    const NODE_SELECTOR = '[data-custom-node], [data-hero-node]';
    const BLOCKED_SELECTOR = [
      NODE_SELECTOR,
      '[data-custom-port]',
      '[data-node-port]',
      '[data-node-disconnect]',
      '.hero-custom-node-line-hit',
      '.hero-custom-connection-delete',
      '.hero-custom-node-context',
      '.card-nav',
      '.status-cluster',
      '.floating-cta',
      '.section-jump-control',
      '.deu-chat-launcher',
      '.hero__copy',
      'a',
      'button',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ].join(',');

    const threshold = 5;
    const selected = new Set();
    let drag = null;

    const marquee = document.createElement('div');
    marquee.className = 'workspace-marquee-selection';
    marquee.setAttribute('aria-hidden', 'true');
    document.body.appendChild(marquee);

    const insideHero = (x, y) => {
      const rect = hero.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const clampToHero = (x, y) => {
      const rect = hero.getBoundingClientRect();
      return {
        x: Math.max(rect.left, Math.min(rect.right, x)),
        y: Math.max(rect.top, Math.min(rect.bottom, y))
      };
    };

    const rectFromPoints = (a, b) => ({
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y)
    });

    const intersects = (a, b) => !(
      b.right < a.left ||
      b.left > a.right ||
      b.bottom < a.top ||
      b.top > a.bottom
    );

    const allNodes = () => [...stage.querySelectorAll(NODE_SELECTOR)]
      .filter(node => node instanceof HTMLElement && node.isConnected && !node.hidden);

    const publishSelection = () => {
      hero.dataset.marqueeSelectionCount = String(selected.size);
      hero.classList.toggle('has-marquee-selection', selected.size > 0);
      hero.dispatchEvent(new CustomEvent('deushima:marquee-selection-change', {
        detail: { elements: [...selected], count: selected.size }
      }));
    };

    const setSelected = (elements, { additive = false } = {}) => {
      if (!additive) {
        selected.forEach(node => node.classList.remove('is-marquee-selected'));
        selected.clear();
      }

      elements.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        selected.add(node);
        node.classList.add('is-marquee-selected');
      });

      publishSelection();
    };

    const clearSelection = () => setSelected([]);

    const selectionKey = node => {
      if (!(node instanceof HTMLElement)) return null;
      if (node.dataset.customNode) return `custom:${node.dataset.customNode}`;
      if (node.dataset.heroNode) return `hero:${node.dataset.heroNode}`;
      return null;
    };

    const selectByKeys = keys => {
      const wanted = new Set(Array.isArray(keys) ? keys.map(String) : []);
      const elements = allNodes().filter(node => {
        const key = selectionKey(node);
        return key && wanted.has(key);
      });
      setSelected(elements);
      return elements;
    };

    const updateVisual = rect => {
      marquee.style.left = `${rect.left}px`;
      marquee.style.top = `${rect.top}px`;
      marquee.style.width = `${rect.width}px`;
      marquee.style.height = `${rect.height}px`;
    };

    const updateHits = rect => {
      const hits = allNodes().filter(node => {
        const nodeRect = node.getBoundingClientRect();
        if (!nodeRect.width || !nodeRect.height) return false;
        return intersects(rect, nodeRect);
      });

      const preview = new Set(drag?.additive ? [...(drag.baseSelection || [])] : []);
      hits.forEach(node => preview.add(node));

      allNodes().forEach(node => {
        node.classList.toggle('is-marquee-preview', preview.has(node));
      });

      if (drag) drag.previewSelection = preview;
    };

    const resetPreview = () => {
      stage.querySelectorAll('.is-marquee-preview').forEach(node => node.classList.remove('is-marquee-preview'));
    };

    const finishDrag = ({ commit = true } = {}) => {
      if (!drag) return;
      const state = drag;
      drag = null;

      try {
        if (hero.hasPointerCapture?.(state.pointerId)) hero.releasePointerCapture(state.pointerId);
      } catch {}

      marquee.classList.remove('is-active');
      hero.classList.remove('is-marquee-dragging');

      if (state.active && commit) {
        setSelected([...(state.previewSelection || [])], { additive: false });
      } else if (!state.active && commit && !state.additive) {
        clearSelection();
      }

      resetPreview();
    };

    const isEditableTarget = target => Boolean(target instanceof Element && target.closest(
      'input, textarea, select, [contenteditable="true"], .hero-custom-node__format-popover'
    ));

    const deleteSelectedCustomNodes = () => {
      const customNodes = [...selected].filter(node => node.matches?.('[data-custom-node]') && node.isConnected);
      if (!customNodes.length) return 0;

      const deleteButtons = customNodes
        .map(node => node.querySelector('.hero-custom-node__delete'))
        .filter(button => button instanceof HTMLButtonElement && !button.disabled);

      if (!deleteButtons.length) return 0;

      clearSelection();
      deleteButtons.forEach(button => button.click());
      return deleteButtons.length;
    };

    hero.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') return;
      if (event.button !== 0) return;
      if (!insideHero(event.clientX, event.clientY)) return;
      if (document.body.classList.contains('is-content-panel-open') || document.body.classList.contains('is-design-viewer-open')) return;

      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(BLOCKED_SELECTOR)) return;
      if (document.querySelector('.hero-custom-node-context.is-open')) return;

      const point = clampToHero(event.clientX, event.clientY);
      drag = {
        pointerId: event.pointerId,
        start: point,
        current: point,
        active: false,
        additive: Boolean(event.shiftKey),
        baseSelection: event.shiftKey ? new Set(selected) : new Set(),
        previewSelection: event.shiftKey ? new Set(selected) : new Set()
      };

      if (!event.shiftKey) {
        selected.forEach(node => node.classList.remove('is-marquee-selected'));
        selected.clear();
      }

      try { hero.setPointerCapture?.(event.pointerId); } catch {}
      event.preventDefault();
    }, { capture: true });

    window.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const point = clampToHero(event.clientX, event.clientY);
      drag.current = point;

      if (!drag.active) {
        const distance = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
        if (distance < threshold) return;
        drag.active = true;
        hero.classList.add('is-marquee-dragging');
        marquee.classList.add('is-active');
      }

      event.preventDefault();
      const rect = rectFromPoints(drag.start, point);
      updateVisual(rect);
      updateHits(rect);
    }, { passive: false, capture: true });

    window.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishDrag({ commit: true });
    }, { capture: true });

    window.addEventListener('pointercancel', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishDrag({ commit: false });
    }, { capture: true });

    document.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0 || event.shiftKey) return;
      const node = event.target instanceof Element ? event.target.closest(NODE_SELECTOR) : null;
      if (node && selected.size && !selected.has(node)) clearSelection();
    }, { capture: true, passive: true });

    document.addEventListener('keydown', event => {
      if (drag || isEditableTarget(event.target)) return;

      if (event.key === 'Escape') {
        if (!selected.size) return;
        event.preventDefault();
        clearSelection();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!selected.size) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      deleteSelectedCustomNodes();
    }, { capture: true });

    window.addEventListener('blur', () => finishDrag({ commit: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) finishDrag({ commit: false });
    });

    const observer = new MutationObserver(() => {
      let changed = false;
      [...selected].forEach(node => {
        if (!node.isConnected) {
          selected.delete(node);
          changed = true;
        }
      });
      if (changed) publishSelection();
    });
    observer.observe(stage, { childList: true, subtree: true });

    window.DeushimaMarqueeSelection = Object.freeze({
      clear: clearSelection,
      deleteSelected: deleteSelectedCustomNodes,
      getSelectedElements: () => [...selected],
      getSelectedKeys: () => [...selected].map(selectionKey).filter(Boolean),
      selectByKeys,
      getSelectedCustomNodeIds: () => [...selected]
        .map(node => node.dataset.customNode)
        .filter(Boolean),
      getSelectedOriginalNodeIds: () => [...selected]
        .map(node => node.dataset.heroNode)
        .filter(Boolean)
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
