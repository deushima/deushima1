(() => {
  'use strict';

  const root = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
  const stage = root?.querySelector('[data-hero-node-stage]');
  const api = window.DeushimaCustomNodes;
  if (!root || !stage || !api || stage.dataset.workspaceMediaReady === 'true') return;
  stage.dataset.workspaceMediaReady = 'true';

  const HISTORY_LIMIT = 48;
  const SVG_INITIAL_WIDTH = 240;
  const MAX_MEDIA_URL_LENGTH = 4000;
  const undoStack = [];
  let transactionBefore = null;
  let transactionTimer = 0;
  let restoring = false;
  let lastCanvasClient = null;

  const editableSelector = 'input,textarea,select,[contenteditable="true"]';
  const menuSelector = '.hero-custom-node-context';

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest(editableSelector));
  }

  function isInsideWorkspace(clientX, clientY) {
    const rect = root.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function rememberCanvasPoint(event) {
    if (!isInsideWorkspace(event.clientX, event.clientY)) return;
    if (event.target instanceof Element && event.target.closest(menuSelector)) return;
    lastCanvasClient = { x: event.clientX, y: event.clientY };
  }

  function worldAnchor() {
    const rect = root.getBoundingClientRect();
    const point = lastCanvasClient || { x: rect.left + rect.width * .5, y: rect.top + rect.height * .5 };
    const camera = window.DeushimaHeroCamera;
    if (camera?.screenToWorld) return camera.screenToWorld(point.x, point.y);
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  function workspaceCode() {
    try { return api.exportWorkspace(); } catch { return null; }
  }

  function pushUndo(before) {
    if (!before || restoring) return;
    const current = workspaceCode();
    if (!current || current === before) return;
    if (undoStack[undoStack.length - 1] !== before) undoStack.push(before);
    if (undoStack.length > HISTORY_LIMIT) undoStack.splice(0, undoStack.length - HISTORY_LIMIT);
  }

  function beginTransaction() {
    if (restoring || transactionBefore) return;
    transactionBefore = workspaceCode();
  }

  function finalizeTransaction(delay = 0) {
    window.clearTimeout(transactionTimer);
    transactionTimer = window.setTimeout(() => {
      transactionTimer = 0;
      if (!transactionBefore || restoring) return;
      const before = transactionBefore;
      const current = workspaceCode();
      if (current && current !== before) {
        transactionBefore = null;
        pushUndo(before);
      }
    }, delay);
  }

  function clearTransaction() {
    window.clearTimeout(transactionTimer);
    transactionTimer = 0;
    transactionBefore = null;
  }

  function undoWorkspace() {
    clearTransaction();
    const current = workspaceCode();
    let target = undoStack.pop() || null;
    while (target && target === current) target = undoStack.pop() || null;
    if (!target) return false;

    restoring = true;
    try {
      api.importWorkspace(target);
    } catch (error) {
      console.warn('Workspace undo failed:', error);
      return false;
    } finally {
      requestAnimationFrame(() => { restoring = false; });
    }
    toast('UNDO');
    return true;
  }

  function toast(message) {
    let node = root.querySelector('[data-workspace-media-toast]');
    if (!node) {
      node = document.createElement('div');
      node.dataset.workspaceMediaToast = 'true';
      Object.assign(node.style, {
        position: 'fixed',
        left: '50%',
        bottom: '2rem',
        zIndex: '9999',
        transform: 'translateX(-50%) translateY(8px)',
        padding: '.48rem .68rem',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '9px',
        background: 'rgba(14,14,16,.9)',
        color: 'rgba(255,255,255,.92)',
        font: '600 10px/1 Inter, sans-serif',
        letterSpacing: '.1em',
        opacity: '0',
        pointerEvents: 'none',
        transition: 'opacity .16s ease, transform .2s cubic-bezier(.22,1,.36,1)'
      });
      root.appendChild(node);
    }
    node.textContent = message;
    node.style.opacity = '1';
    node.style.transform = 'translateX(-50%) translateY(0)';
    window.clearTimeout(Number(node.dataset.timer) || 0);
    const timer = window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateX(-50%) translateY(8px)';
    }, 1200);
    node.dataset.timer = String(timer);
  }

  function isCosmosElementUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      return host === 'cosmos.so' && /^\/e\/\d+\/?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function resolveRemoteMedia(url) {
    const response = await fetch(`/api/media-resolver?url=${encodeURIComponent(url)}`, {
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('media-resolver-failed');
    const data = await response.json();
    if (!data?.url) throw new Error('media-url-missing');
    return data;
  }

  function createMediaAtAnchor(url, { compact = false, before = null } = {}) {
    const anchor = worldAnchor();
    const snapshot = before || workspaceCode();
    const model = api.createMedia(anchor.x, anchor.y, url);
    if (!model) return null;
    if (compact) {
      model.width = SVG_INITIAL_WIDTH;
      model.el?.style.setProperty('--custom-media-width', `${SVG_INITIAL_WIDTH}px`);
    }
    window.setTimeout(() => pushUndo(snapshot), 40);
    return model;
  }

  function encodeBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function sanitizeSvg(raw) {
    const text = String(raw || '').trim();
    if (!/^<svg[\s>]/i.test(text) || text.length > 65536) return null;
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement?.localName !== 'svg') return null;
    const svg = doc.documentElement;
    svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
    svg.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on')) node.removeAttribute(attribute.name);
        if ((name === 'href' || name.endsWith(':href') || name === 'src') && /^javascript:/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }

  async function svgMediaUrl(svg) {
    const bytes = new TextEncoder().encode(svg);
    if (typeof CompressionStream !== 'function') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const encoded = encodeBase64Url(compressed);
    const url = `${location.origin}/api/svg-media?d=${encoded}`;
    return url.length <= MAX_MEDIA_URL_LENGTH ? url : null;
  }

  function clipboardSvgSource(clipboardData) {
    if (!clipboardData) return { text: '', file: null };
    const svgMime = clipboardData.getData('image/svg+xml');
    if (svgMime?.trim()) return { text: svgMime, file: null };
    const plain = clipboardData.getData('text/plain') || '';
    if (/^\s*<svg[\s>]/i.test(plain)) return { text: plain, file: null };
    const item = [...(clipboardData.items || [])].find(entry => entry.type === 'image/svg+xml');
    return { text: '', file: item?.getAsFile?.() || null };
  }

  async function handleSvgPaste(event, source) {
    const raw = source.text || await source.file?.text?.() || '';
    const sanitized = sanitizeSvg(raw);
    if (!sanitized) {
      toast('SVG INVALID');
      return;
    }
    const before = workspaceCode();
    const url = await svgMediaUrl(sanitized);
    if (!url) {
      toast('SVG TOO LARGE');
      return;
    }
    const model = createMediaAtAnchor(url, { compact: true, before });
    if (!model) {
      toast('NODE LIMIT');
      return;
    }
    toast('SVG PASTED');
  }

  async function handleCosmosPaste(url) {
    const before = workspaceCode();
    try {
      const media = await resolveRemoteMedia(url);
      const model = createMediaAtAnchor(media.url, { before });
      toast(model ? 'COSMOS ADDED' : 'NODE LIMIT');
    } catch (error) {
      console.warn('Cosmos resolver failed:', error);
      toast('COSMOS ERROR');
    }
  }

  root.addEventListener('pointermove', rememberCanvasPoint, { passive: true });
  root.addEventListener('pointerdown', event => {
    rememberCanvasPoint(event);
    if (isEditableTarget(event.target)) return;
    beginTransaction();
    finalizeTransaction(1200);
  }, { capture: true, passive: true });
  root.addEventListener('contextmenu', rememberCanvasPoint, { capture: true });

  window.addEventListener('pointerup', () => {
    finalizeTransaction(240);
    window.setTimeout(() => finalizeTransaction(1200), 280);
  }, { capture: true, passive: true });

  new MutationObserver(() => finalizeTransaction(220)).observe(stage, {
    childList: true,
    subtree: true
  });

  document.addEventListener('keydown', event => {
    const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
    if (modifier && String(event.key || '').toLowerCase() === 'z' && !event.shiftKey && !isEditableTarget(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undoWorkspace();
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      beginTransaction();
      finalizeTransaction(320);
    }
  }, { capture: true });

  document.addEventListener('paste', event => {
    if (isEditableTarget(event.target)) return;
    if (!root.contains(event.target instanceof Node ? event.target : null) && document.activeElement !== stage) return;

    const source = clipboardSvgSource(event.clipboardData);
    if (source.text || source.file) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void handleSvgPaste(event, source);
      return;
    }

    const plain = String(event.clipboardData?.getData('text/plain') || '').trim();
    if (isCosmosElementUrl(plain)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void handleCosmosPaste(plain);
    }
  }, { capture: true });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('.hero-custom-node-context__url-form')) return;
    const menu = form.closest('.hero-custom-node-context');
    const heading = menu?.querySelector('.hero-custom-node-context__heading')?.textContent?.trim() || '';
    const input = form.querySelector('.hero-custom-node-context__url-input');
    const url = String(input?.value || '').trim();
    if (heading !== 'Link image' || !isCosmosElementUrl(url)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const message = form.querySelector('.hero-custom-node-context__url-message');
    const submit = form.querySelector('button[type="submit"]');
    const previousLabel = submit?.textContent || 'Create';
    const before = workspaceCode();
    if (message) message.textContent = 'Loading Cosmos media…';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Loading…';
    }

    void (async () => {
      try {
        const media = await resolveRemoteMedia(url);
        const selectedId = api.getState()?.selectedNodeId || null;
        const selected = selectedId ? api.getWorkspacePayload()?.nodes?.find(node => node.id === selectedId) : null;

        if (selected?.type === 'media') {
          const payload = api.getWorkspacePayload();
          const target = payload.nodes.find(node => node.id === selectedId);
          target.url = media.url;
          target.mediaType = media.mediaType === 'video' ? 'video' : 'image';
          if (Number.isFinite(Number(media.aspectRatio))) target.aspectRatio = Number(media.aspectRatio);
          const envelope = JSON.stringify({ format: 'deushima-workspace', version: 1, state: payload });
          const bytes = new TextEncoder().encode(envelope);
          const code = `DEUSHIMA1:${encodeBase64Url(bytes)}`;
          api.importWorkspace(code);
        } else {
          const model = createMediaAtAnchor(media.url, { before });
          if (!model) throw new Error('node-limit');
        }
        pushUndo(before);
        menu?.classList.remove('is-open');
        toast('COSMOS ADDED');
      } catch (error) {
        console.warn('Cosmos resolver failed:', error);
        if (message) message.textContent = 'Could not load this Cosmos media.';
        toast('COSMOS ERROR');
      } finally {
        if (submit?.isConnected) {
          submit.disabled = false;
          submit.textContent = previousLabel;
        }
      }
    })();
  }, { capture: true });
})();
