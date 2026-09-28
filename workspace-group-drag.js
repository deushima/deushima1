(() => {
  'use strict';

  const BOOT_KEY = '__deushimaWorkspaceGroupDragV1';
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;

  const start = () => {
    const hero = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
    const stage = hero?.querySelector('[data-hero-node-stage]');
    const selectionApi = window.DeushimaMarqueeSelection;
    const customApi = window.DeushimaCustomNodes;
    const originalApi = window.DeushimaHeroNodes;

    if (!hero || !stage || !selectionApi?.getSelectedElements || !customApi?.getWorkspacePayload) {
      window.setTimeout(start, 80);
      return;
    }

    const BLOCKED_DRAG_TARGET = [
      '[data-custom-port]',
      '[data-node-port]',
      '.hero-custom-node__delete',
      '.hero-custom-node__resize-handle',
      '.hero-custom-node__format-toolbar',
      '.hero-custom-node__format-popover',
      '.hero-custom-node__edit-url',
      'a',
      'button',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ].join(',');

    const DRAG_THRESHOLD = 4;
    let groupDrag = null;

    const clone = value => {
      if (typeof structuredClone === 'function') return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    };

    const camera = () => window.DeushimaHeroCamera || null;

    const screenToWorld = (clientX, clientY) => {
      const api = camera();
      if (api?.screenToWorld) return api.screenToWorld(clientX, clientY);
      const rect = hero.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const worldToStage = (worldX, worldY) => {
      const api = camera();
      if (api?.worldToStage) return api.worldToStage(worldX, worldY);
      const stageRect = stage.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      return {
        x: worldX - (stageRect.left - heroRect.left),
        y: worldY - (stageRect.top - heroRect.top)
      };
    };

    const elementKey = element => {
      if (!(element instanceof HTMLElement)) return null;
      if (element.dataset.customNode) return `custom:${element.dataset.customNode}`;
      if (element.dataset.heroNode) return `hero:${element.dataset.heroNode}`;
      return null;
    };

    const keyParts = key => {
      const separator = String(key || '').indexOf(':');
      if (separator < 0) return null;
      return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
    };

    const centerWorldOf = element => {
      const rect = element.getBoundingClientRect();
      return screenToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    };

    const basePositionsFromPayload = (payload, selectedElements) => {
      const customPositions = new Map();
      const originalPositions = new Map();
      const payloadCustom = new Map((payload?.nodes || []).map(node => [String(node.id), node]));
      const payloadOriginal = new Map((payload?.originalNodes?.positions || []).map(position => [String(position.id), position]));

      selectedElements.forEach(element => {
        const key = elementKey(element);
        const parsed = keyParts(key);
        if (!parsed) return;

        if (parsed.kind === 'custom') {
          const node = payloadCustom.get(parsed.id);
          if (node && Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y))) {
            customPositions.set(parsed.id, { x: Number(node.x), y: Number(node.y) });
          } else {
            customPositions.set(parsed.id, centerWorldOf(element));
          }
          return;
        }

        if (parsed.kind === 'hero') {
          const position = payloadOriginal.get(parsed.id);
          if (position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
            originalPositions.set(parsed.id, { x: Number(position.x), y: Number(position.y) });
          } else {
            originalPositions.set(parsed.id, centerWorldOf(element));
          }
        }
      });

      return { customPositions, originalPositions };
    };

    const applyVisualPosition = (key, base, dx, dy) => {
      const parsed = keyParts(key);
      if (!parsed) return;
      const worldX = base.x + dx;
      const worldY = base.y + dy;
      const local = worldToStage(worldX, worldY);

      if (parsed.kind === 'custom') {
        const element = stage.querySelector(`[data-custom-node="${CSS.escape(parsed.id)}"]`);
        if (!(element instanceof HTMLElement)) return;
        element.style.setProperty('--custom-node-x', `${local.x.toFixed(3)}px`);
        element.style.setProperty('--custom-node-y', `${local.y.toFixed(3)}px`);
        element.classList.add('is-group-dragging');
        return;
      }

      if (parsed.kind === 'hero') {
        const element = stage.querySelector(`[data-hero-node="${CSS.escape(parsed.id)}"]`);
        if (!(element instanceof HTMLElement)) return;
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        element.style.setProperty('--node-x', `${(local.x / width * 100).toFixed(6)}%`);
        element.style.setProperty('--node-y', `${(local.y / height * 100).toFixed(6)}%`);
        element.classList.add('is-group-dragging');
      }
    };

    const clearVisualFlags = () => {
      stage.querySelectorAll('.is-group-dragging').forEach(element => element.classList.remove('is-group-dragging'));
    };

    const encodeWorkspace = payload => {
      const envelope = {
        format: 'deushima-workspace',
        version: 1,
        state: payload
      };
      const bytes = new TextEncoder().encode(JSON.stringify(envelope));
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const encoded = btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      return `DEUSHIMA1:${encoded}`;
    };

    const applyDeltaToPayload = (payload, state, dx, dy) => {
      const next = clone(payload);
      const selectedCustomIds = new Set(state.customPositions.keys());

      next.nodes = (next.nodes || []).map(node => {
        const base = state.customPositions.get(String(node.id));
        if (!base || !selectedCustomIds.has(String(node.id))) return node;
        return {
          ...node,
          x: Number((base.x + dx).toFixed(6)),
          y: Number((base.y + dy).toFixed(6))
        };
      });

      if (state.originalPositions.size) {
        const original = next.originalNodes && typeof next.originalNodes === 'object'
          ? next.originalNodes
          : { positions: [], edges: [] };
        const positions = new Map((original.positions || []).map(position => [String(position.id), { ...position }]));
        state.originalPositions.forEach((base, id) => {
          positions.set(id, {
            id,
            x: Number((base.x + dx).toFixed(6)),
            y: Number((base.y + dy).toFixed(6))
          });
        });
        next.originalNodes = {
          ...original,
          positions: [...positions.values()]
        };
      }

      return next;
    };

    const restoreSelection = keys => {
      requestAnimationFrame(() => {
        selectionApi.selectByKeys?.(keys);
      });
    };

    const commitGroupDrag = (state, { revert = false } = {}) => {
      clearVisualFlags();
      const dx = revert ? 0 : state.dx;
      const dy = revert ? 0 : state.dy;
      const currentPayload = customApi.getWorkspacePayload?.() || state.startPayload;
      const payload = applyDeltaToPayload(currentPayload, state, dx, dy);

      try {
        if (typeof customApi.importWorkspace === 'function') {
          customApi.importWorkspace(encodeWorkspace(payload));
        } else if (!state.customPositions.size && originalApi?.applyWorkspaceState) {
          originalApi.applyWorkspaceState(payload.originalNodes, { persist: true });
        }
      } catch (error) {
        console.error('[Deushima group drag] Unable to commit grouped movement.', error);
        try {
          if (typeof customApi.importWorkspace === 'function') {
            customApi.importWorkspace(encodeWorkspace(state.startPayload));
          }
        } catch {}
      }

      restoreSelection(state.keys);
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(520);
    };

    document.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(BLOCKED_DRAG_TARGET)) return;

      const targetNode = event.target.closest('[data-custom-node], [data-hero-node]');
      if (!(targetNode instanceof HTMLElement) || !stage.contains(targetNode)) return;

      const selectedElements = selectionApi.getSelectedElements()
        .filter(element => element instanceof HTMLElement && element.isConnected);
      if (selectedElements.length < 2 || !selectedElements.includes(targetNode)) return;

      const keys = selectedElements.map(elementKey).filter(Boolean);
      const startPayload = clone(customApi.getWorkspacePayload());
      const positions = basePositionsFromPayload(startPayload, selectedElements);
      const startWorld = screenToWorld(event.clientX, event.clientY);

      groupDrag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWorld,
        startPayload,
        keys,
        customPositions: positions.customPositions,
        originalPositions: positions.originalPositions,
        dx: 0,
        dy: 0,
        moved: false
      };
    }, { passive: true });

    window.addEventListener('pointermove', event => {
      const state = groupDrag;
      if (!state || event.pointerId !== state.pointerId) return;

      if (!state.moved) {
        const distance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
        if (distance < DRAG_THRESHOLD) return;
        state.moved = true;
        hero.classList.add('is-group-node-dragging');
      }

      const currentWorld = screenToWorld(event.clientX, event.clientY);
      state.dx = currentWorld.x - state.startWorld.x;
      state.dy = currentWorld.y - state.startWorld.y;

      state.customPositions.forEach((base, id) => applyVisualPosition(`custom:${id}`, base, state.dx, state.dy));
      state.originalPositions.forEach((base, id) => applyVisualPosition(`hero:${id}`, base, state.dx, state.dy));
      window.DeushimaGrid?.wake?.(180);
    }, { passive: true });

    window.addEventListener('pointerup', event => {
      const state = groupDrag;
      if (!state || event.pointerId !== state.pointerId) return;
      groupDrag = null;
      hero.classList.remove('is-group-node-dragging');
      if (!state.moved) {
        clearVisualFlags();
        return;
      }
      commitGroupDrag(state);
    });

    window.addEventListener('pointercancel', event => {
      const state = groupDrag;
      if (!state || event.pointerId !== state.pointerId) return;
      groupDrag = null;
      hero.classList.remove('is-group-node-dragging');
      commitGroupDrag(state, { revert: true });
    });

    window.addEventListener('blur', () => {
      const state = groupDrag;
      if (!state) return;
      groupDrag = null;
      hero.classList.remove('is-group-node-dragging');
      commitGroupDrag(state, { revert: true });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
