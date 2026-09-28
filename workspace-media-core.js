(() => {
  'use strict';

  const API_WAIT_MS = 8000;
  const HISTORY_LIMIT = 60;
  const HISTORY_POLL_MS = 240;
  const TEXT_GROUP_MS = 850;
  const SVG_CACHE = 'deushima-local-svg-v1';
  const SVG_PREFIX = '/__deushima_local_media/';
  const MAX_SVG_BYTES = 512 * 1024;

  const hero = document.querySelector('.hero--node-canvas');
  const stage = document.querySelector('[data-hero-node-stage]');
  if (!hero || !stage) return;

  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  async function waitForApi() {
    const startedAt = performance.now();
    while (!window.DeushimaCustomNodes && performance.now() - startedAt < API_WAIT_MS) {
      await sleep(40);
    }
    return window.DeushimaCustomNodes || null;
  }

  function normalizeHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim(), location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function isCosmosUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return false;
    try {
      const url = new URL(normalized);
      const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      return host === 'cosmos.so' && /^\/e\/\d+\/?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function resolveMedia(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api/media-resolver?url=${encodeURIComponent(normalized)}`, {
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) return null;
      const data = await response.json();
      const url = normalizeHttpUrl(data?.url);
      if (!url || !['image', 'video'].includes(data?.mediaType)) return null;
      const ratio = Number(data?.aspectRatio);
      return {
        url,
        mediaType: data.mediaType,
        aspectRatio: Number.isFinite(ratio) && ratio > 0 ? Math.max(.35, Math.min(3.5, ratio)) : 1.35
      };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function canvasCenterWorld() {
    const rect = hero.getBoundingClientRect();
    const clientX = rect.left + rect.width * .5;
    const clientY = rect.top + rect.height * .5;
    const point = window.DeushimaHeroCamera?.screenToWorld?.(clientX, clientY);
    return point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? point
      : { x: rect.width * .5, y: rect.height * .5 };
  }

  function menuWorldPoint(menu) {
    const rect = menu?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return canvasCenterWorld();
    const point = window.DeushimaHeroCamera?.screenToWorld?.(
      rect.left + Math.min(24, rect.width * .2),
      rect.top + Math.min(24, rect.height * .2)
    );
    return point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? point
      : canvasCenterWorld();
  }

  function activeEditableTarget(target = document.activeElement) {
    return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function closeContextMenu(menu) {
    if (!menu) return;
    menu.classList.remove('is-open', 'is-url-form', 'is-workspace-form');
    menu.style.visibility = '';
    window.setTimeout(() => {
      if (!menu.classList.contains('is-open')) menu.replaceChildren();
    }, 170);
    stage.focus({ preventScroll: true });
  }

  function decodeBase64UrlUtf8(value) {
    const encoded = String(value || '');
    const padding = '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64UrlUtf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeWorkspace(code) {
    const prefix = 'DEUSHIMA1:';
    const raw = String(code || '').trim();
    if (!raw.startsWith(prefix)) throw new Error('Invalid workspace code');
    return JSON.parse(decodeBase64UrlUtf8(raw.slice(prefix.length)));
  }

  function encodeWorkspace(envelope) {
    return `DEUSHIMA1:${encodeBase64UrlUtf8(JSON.stringify(envelope))}`;
  }

  function structuralSignature(code) {
    const envelope = decodeWorkspace(code);
    const state = envelope?.state || {};
    return JSON.stringify({
      nodes: (Array.isArray(state.nodes) ? state.nodes : []).map(node => {
        const clone = { ...node };
        delete clone.z;
        return clone;
      }),
      connections: state.connections || [],
      originalNodes: state.originalNodes || null
    });
  }

  function sanitizeSvg(rawSvg) {
    const source = String(rawSvg || '').trim();
    if (!source || source.length > MAX_SVG_BYTES || !/<svg[\s>]/i.test(source)) return null;

    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    const svg = doc.documentElement;
    if (!svg || svg.localName?.toLowerCase() !== 'svg') return null;

    svg.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video').forEach(node => node.remove());
    svg.querySelectorAll('style').forEach(style => {
      style.textContent = String(style.textContent || '')
        .replace(/@import\s+[^;]+;?/gi, '')
        .replace(/url\(\s*(['"]?)https?:[^)]+\)/gi, 'none');
    });

    const nodes = [svg, ...svg.querySelectorAll('*')];
    nodes.forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || '').trim();
        if (name.startsWith('on')) {
          node.removeAttribute(attribute.name);
          return;
        }
        if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#') && !value.startsWith('data:image/')) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    let aspectRatio = 1.35;
    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      aspectRatio = viewBox[2] / viewBox[3];
    } else {
      const width = parseFloat(String(svg.getAttribute('width') || '').replace(/[^0-9.+-]/g, ''));
      const height = parseFloat(String(svg.getAttribute('height') || '').replace(/[^0-9.+-]/g, ''));
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) aspectRatio = width / height;
    }

    return {
      svg: new XMLSerializer().serializeToString(svg),
      aspectRatio: Math.max(.35, Math.min(3.5, aspectRatio || 1.35))
    };
  }

  async function ensureSvgServiceWorker() {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
    try {
      const registration = await navigator.serviceWorker.register('/workspace-media-sw.js?v=20260928-1', { scope: '/' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await Promise.race([
          new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
          sleep(1800)
        ]);
      }
      return Boolean(registration.active || registration.waiting || registration.installing);
    } catch {
      return false;
    }
  }

  async function cacheSvg(svgText) {
    if (!await ensureSvgServiceWorker()) return null;
    const id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const url = new URL(`${SVG_PREFIX}${id}.svg`, location.origin).href;
    try {
      const cache = await caches.open(SVG_CACHE);
      await cache.put(url, new Response(svgText, {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': 'private, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        }
      }));
      return url;
    } catch {
      return null;
    }
  }

  async function svgFromClipboard(event) {
    const clipboard = event.clipboardData;
    if (!clipboard) return null;

    const svgItem = [...clipboard.items].find(item => item.type === 'image/svg+xml');
    if (svgItem) {
      const file = svgItem.getAsFile();
      if (file) return await file.text();
    }

    const typed = clipboard.getData('image/svg+xml');
    if (typed?.trim()) return typed;

    const plain = clipboard.getData('text/plain');
    if (/^\s*<svg[\s>]/i.test(plain || '')) return plain;

    const html = clipboard.getData('text/html');
    if (/<svg[\s>]/i.test(html || '')) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const svg = doc.querySelector('svg');
      if (svg) return svg.outerHTML;
    }
    return null;
  }

  async function createSvgNode(api, rawSvg) {
    const sanitized = sanitizeSvg(rawSvg);
    if (!sanitized) return false;
    const mediaUrl = await cacheSvg(sanitized.svg);
    if (!mediaUrl) return false;
    const point = canvasCenterWorld();
    const model = api.createMedia(point.x, point.y, mediaUrl);
    if (!model) return false;
    const node = document.querySelector(`[data-custom-node="${CSS.escape(model.id)}"]`);
    if (node) {
      node.style.setProperty('--custom-media-width', '260px');
      node.style.width = '260px';
    }
    return true;
  }

  function setUrlFormBusy(form, busy, label = '') {
    const input = form.querySelector('.hero-custom-node-context__url-input');
    const confirm = form.querySelector('.hero-custom-node-context__url-button.is-primary');
    if (input) input.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (confirm) {
      confirm.disabled = busy;
      if (busy) {
        confirm.dataset.cosmosOriginalText = confirm.textContent || 'Create';
        confirm.textContent = 'Loading…';
      } else {
        confirm.textContent = confirm.dataset.cosmosOriginalText || label || 'Create';
        delete confirm.dataset.cosmosOriginalText;
      }
    }
  }

  async function updateSelectedMedia(api, media) {
    const selectedId = api.getState?.().selectedNodeId;
    if (!selectedId) return false;
    const code = api.exportWorkspace();
    const envelope = decodeWorkspace(code);
    const nodes = envelope?.state?.nodes;
    if (!Array.isArray(nodes)) return false;
    const node = nodes.find(item => item.id === selectedId && item.type === 'media');
    if (!node) return false;
    node.url = media.url;
    node.mediaType = media.mediaType;
    node.aspectRatio = media.aspectRatio;
    return api.importWorkspace(encodeWorkspace(envelope)) === true;
  }

  function installCosmosUrlFormBridge(api) {
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('.hero-custom-node-context__url-form')) return;
      const menu = form.closest('.hero-custom-node-context');
      const heading = menu?.querySelector('.hero-custom-node-context__heading')?.textContent?.trim().toLowerCase();
      if (heading !== 'link image') return;
      const input = form.querySelector('.hero-custom-node-context__url-input');
      const url = input?.value || '';
      if (!isCosmosUrl(url)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      void (async () => {
        const message = form.querySelector('.hero-custom-node-context__url-message');
        const confirm = form.querySelector('.hero-custom-node-context__url-button.is-primary');
        const isUpdate = confirm?.textContent?.trim().toLowerCase() === 'update';
        if (message) message.textContent = 'Loading Cosmos media…';
        setUrlFormBusy(form, true);
        const media = await resolveMedia(url);
        if (!form.isConnected) return;
        setUrlFormBusy(form, false, isUpdate ? 'Update' : 'Create');
        if (!media) {
          if (message) message.textContent = 'Could not load this Cosmos media.';
          input?.focus({ preventScroll: true });
          return;
        }

        try {
          if (isUpdate) {
            const updated = await updateSelectedMedia(api, media);
            if (!updated) throw new Error('Unable to update media');
          } else {
            const point = menuWorldPoint(menu);
            const created = api.createMedia(point.x, point.y, media.url);
            if (!created) throw new Error('Unable to create media');
          }
          closeContextMenu(menu);
        } catch {
          if (message) message.textContent = 'Unable to create this Cosmos media.';
          input?.focus({ preventScroll: true });
        }
      })();
    }, true);
  }

  function installPasteBridge(api) {
    document.addEventListener('paste', event => {
      if (activeEditableTarget(event.target) || api.getState?.().editingNodeId) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;

      const hasSvgFile = [...clipboard.items].some(item => item.type === 'image/svg+xml');
      const typedSvg = clipboard.getData('image/svg+xml');
      const plain = clipboard.getData('text/plain');
      const html = clipboard.getData('text/html');
      const hasSvgMarkup = hasSvgFile || Boolean(typedSvg?.trim()) || /^\s*<svg[\s>]/i.test(plain || '') || /<svg[\s>]/i.test(html || '');

      if (hasSvgMarkup) {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          const rawSvg = await svgFromClipboard(event);
          if (rawSvg) await createSvgNode(api, rawSvg);
        })();
        return;
      }

      if (isCosmosUrl(plain)) {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          const media = await resolveMedia(plain);
          if (!media) return;
          const point = canvasCenterWorld();
          api.createMedia(point.x, point.y, media.url);
        })();
      }
    }, true);
  }

  function installUndoHistory(api) {
    const history = [];
    const redo = [];
    let restoring = false;
    let lastSignature = '';
    let lastEditNodeId = null;
    let lastEditAt = 0;

    const capture = ({ force = false } = {}) => {
      if (restoring) return null;
      let code;
      let signature;
      try {
        code = api.exportWorkspace();
        signature = structuralSignature(code);
      } catch {
        return null;
      }
      if (!force && signature === lastSignature) return { code, signature, changed: false };

      const editingNodeId = api.getState?.().editingNodeId || null;
      const now = performance.now();
      const canGroupText = (
        editingNodeId
        && history.length > 1
        && editingNodeId === lastEditNodeId
        && now - lastEditAt < TEXT_GROUP_MS
      );

      if (canGroupText) history[history.length - 1] = { code, signature };
      else history.push({ code, signature });
      if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);

      lastSignature = signature;
      lastEditNodeId = editingNodeId;
      lastEditAt = editingNodeId ? now : 0;
      if (!force) redo.length = 0;
      return { code, signature, changed: true };
    };

    const restoreCode = async (code, direction) => {
      restoring = true;
      try {
        api.importWorkspace(code);
        await sleep(60);
        lastSignature = structuralSignature(code);
        lastEditNodeId = null;
        lastEditAt = 0;
        stage.focus({ preventScroll: true });
      } finally {
        restoring = false;
      }
      window.dispatchEvent(new CustomEvent('deushima:workspace-history', { detail: { direction } }));
    };

    const undo = async () => {
      capture();
      if (history.length <= 1) return false;
      const current = history.pop();
      redo.push(current);
      const target = history[history.length - 1];
      await restoreCode(target.code, 'undo');
      return true;
    };

    const redoAction = async () => {
      if (!redo.length) return false;
      const target = redo.pop();
      history.push(target);
      await restoreCode(target.code, 'redo');
      return true;
    };

    capture({ force: true });
    const poll = window.setInterval(() => capture(), HISTORY_POLL_MS);
    window.addEventListener('pagehide', () => window.clearInterval(poll), { once: true });

    document.addEventListener('keydown', event => {
      const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (!modifier || activeEditableTarget(event.target) || api.getState?.().editingNodeId) return;
      const key = String(event.key || '').toLowerCase();
      const wantsUndo = key === 'z' && !event.shiftKey;
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y';
      if (!wantsUndo && !wantsRedo) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void (wantsUndo ? undo() : redoAction());
    }, true);

    window.DeushimaWorkspaceHistory = Object.freeze({ undo, redo: redoAction, capture });
  }

  void (async () => {
    const api = await waitForApi();
    if (!api) return;
    void ensureSvgServiceWorker();
    installCosmosUrlFormBridge(api);
    installPasteBridge(api);
    installUndoHistory(api);
  })();
})();
