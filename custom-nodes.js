(() => {
  'use strict';

  const hero = document.querySelector('[data-workspace-interaction-root]') || document.querySelector('.hero--node-canvas');
  const stage = hero?.querySelector('[data-hero-node-stage]');
  const originalMesh = stage?.querySelector('[data-hero-node-mesh]');
  const originalNodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  if (!hero || !stage || !originalMesh || !originalNodes.length) return;
  if (stage.dataset.customNodesReady === 'true') return;
  stage.dataset.customNodesReady = 'true';

  const workspaceInteraction = window.DeushimaWorkspaceInteraction || null;
  const interactionRoot = workspaceInteraction?.root || hero;

  const STORAGE_KEY = 'deushima:nodes:v3';
  const PREVIOUS_STORAGE_KEY = 'deushima:nodes:v2';
  const LEGACY_STORAGE_KEY = 'deushima:nodes:v1';
  const HINT_KEY = 'deushima:nodes:menu-hint:v1';
  const STORAGE_VERSION = 3;
  const WORKSPACE_FORMAT = 'deushima-workspace';
  const WORKSPACE_VERSION = 1;
  const WORKSPACE_CODE_PREFIX = 'DEUSHIMA1:';
  const MAX_NODES = 20;
  const MAX_CONNECTIONS = 60;
  const MAX_TEXT_LENGTH = 280;
  const MAX_RICH_TEXT_HTML_LENGTH = 24000;
  const MAX_URL_LENGTH = 4096;
  const MAX_ID_LENGTH = 90;
  const MAX_CONNECTION_ID_LENGTH = 100;
  const MAX_WORKSPACE_CODE_LENGTH = 131072;
  const MAX_WORLD_COORDINATE = 10000000;
  const COUNTER_THRESHOLD = 220;
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_TOLERANCE = 8;
  const DRAG_THRESHOLD = 5;
  const PORT_RADIUS = 46;
  const PORT_IDS = Object.freeze(['left', 'right']);
  const MEDIA_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'apng', 'svg', 'ico']);
  const MEDIA_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'ogg', 'm4v', 'mov']);
  const MEDIA_MOUNT_TIMEOUT_MS = 10000;

  const NODE_TYPES = Object.freeze([
    Object.freeze({ id: 'text', label: 'Text', icon: 'T' }),
    Object.freeze({ id: 'media', label: 'Link image', icon: '▧' }),
    Object.freeze({ id: 'instagram', label: 'Instagram', icon: '◎' }),
    Object.freeze({ id: 'youtube', label: 'YouTube', icon: '▶' }),
    Object.freeze({ id: 'link', label: 'Link', icon: '↗' })
  ]);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const originalNames = new Set(originalNodes.map(node => node.dataset.heroNode).filter(Boolean));

  const ns = 'http://www.w3.org/2000/svg';
  const models = new Map();
  let connections = [];
  const connectionEls = new Map();

  let zCounter = 1;
  let nextNoteNumber = 1;
  let selectedNodeId = null;
  let selectedConnectionId = null;
  let editingNodeId = null;
  let dragState = null;
  let connectionState = null;
  let connectionRaf = 0;
  let hoverConnectionId = null;
  let lineDeleteHideTimer = 0;
  let menuAnchor = null;
  let menuMode = null;
  let menuUrlKind = null;
  let menuNodeId = null;
  let menuFocusOrigin = null;
  let menuOpen = false;
  let menuPlacementToken = 0;
  let clearConfirmTimer = 0;
  let longPressState = null;
  let longPressOpenedUntil = 0;
  let typingVariant = 0;
  let lastTypingAt = 0;
  let resizeSaveTimer = 0;
  let cameraSaveTimer = 0;
  let workspaceMutationDepth = 0;

  const mediaVisibilityObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const video = entry.target;
          if (!(video instanceof HTMLVideoElement)) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.02) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { root: hero, rootMargin: '160px', threshold: [0, .02] })
    : null;

  const customMesh = document.createElementNS(ns, 'svg');
  customMesh.classList.add('hero-custom-node-mesh');
  customMesh.setAttribute('aria-hidden', 'true');

  const previewPath = document.createElementNS(ns, 'path');
  previewPath.setAttribute('class', 'hero-custom-node-line--preview');
  previewPath.setAttribute('d', '');
  customMesh.appendChild(previewPath);

  originalMesh.insertAdjacentElement('afterend', customMesh);

  const nodeLayer = document.createElement('div');
  nodeLayer.className = 'hero-custom-node-layer';
  stage.appendChild(nodeLayer);

  const lineDeleteButton = document.createElement('button');
  lineDeleteButton.className = 'hero-custom-connection-delete';
  lineDeleteButton.type = 'button';
  lineDeleteButton.setAttribute('aria-label', 'Delete connection');
  lineDeleteButton.textContent = '×';
  stage.appendChild(lineDeleteButton);

  const menu = document.createElement('div');
  menu.className = 'hero-custom-node-context';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Node canvas options');
  interactionRoot.appendChild(menu);

  const live = document.createElement('div');
  live.className = 'hero-custom-node-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);

  const hint = document.createElement('span');
  hint.className = 'hero-custom-node-hint';
  hint.textContent = coarsePointer.matches ? 'Long-press for options' : 'Right-click for options';
  hero.appendChild(hint);

  if (!stage.hasAttribute('tabindex')) stage.tabIndex = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function uid(prefix = 'node') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function announce(message) {
    live.textContent = '';
    requestAnimationFrame(() => {
      live.textContent = message;
    });
  }

  function isModalOpen() {
    return [
      'is-content-panel-open',
      'is-design-viewer-open',
      'is-launcher-pop-open',
      'deu-chat-open',
      'is-page-leaving'
    ].some(className => document.body.classList.contains(className));
  }

  function playSfx(name, options = {}) {
    return window.DeushimaSFX?.playScoped?.(name, options) || false;
  }

  function markHintUsed() {
    hint.classList.add('is-hidden');
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
  }

  function restoreHintState() {
    let hidden = false;
    try { hidden = localStorage.getItem(HINT_KEY) === '1'; } catch {}
    if (hidden || models.size) hint.classList.add('is-hidden');
  }

  function safeText(value) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .slice(0, MAX_TEXT_LENGTH);
  }

  function plainTextFromElement(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('img').forEach(image => image.remove());
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    return String(clone.textContent || '').replace(/\r\n?/g, '\n');
  }

  function plainTextFromEditor(editor) {
    return safeText(plainTextFromElement(editor));
  }

  function richHtmlText(html) {
    const host = document.createElement('div');
    host.innerHTML = String(html || '');
    return safeText(plainTextFromElement(host));
  }

  function sanitizeRichTextHtml(value, fallbackText = '') {
    const source = String(value || '').slice(0, MAX_RICH_TEXT_HTML_LENGTH);
    const input = document.createElement('div');
    input.innerHTML = source;
    const output = document.createElement('div');
    let imageCount = 0;

    const appendChildren = (from, to) => {
      [...from.childNodes].forEach(child => appendSanitized(child, to));
    };

    const appendSanitized = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.data));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toUpperCase();
      if (tag === 'BR') {
        parent.appendChild(document.createElement('br'));
        return;
      }

      if (tag === 'IMG') {
        if (imageCount >= 6) return;
        const src = normalizeHttpUrl(node.getAttribute('src'));
        if (!src) return;
        const image = document.createElement('img');
        image.src = src;
        image.alt = String(node.getAttribute('alt') || '').slice(0, 120);
        image.loading = 'lazy';
        image.decoding = 'async';
        parent.appendChild(image);
        imageCount += 1;
        return;
      }

      if (tag === 'A') {
        const href = normalizeHttpUrl(node.getAttribute('href'));
        if (!href) {
          appendChildren(node, parent);
          return;
        }
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        appendChildren(node, anchor);
        parent.appendChild(anchor);
        return;
      }

      const mappedTag = tag === 'B' || tag === 'STRONG'
        ? 'strong'
        : tag === 'I' || tag === 'EM'
          ? 'em'
          : tag === 'U'
            ? 'u'
            : tag === 'S' || tag === 'STRIKE'
              ? 's'
              : null;

      if (mappedTag) {
        const wrapper = document.createElement(mappedTag);
        appendChildren(node, wrapper);
        parent.appendChild(wrapper);
        return;
      }

      if (tag === 'DIV' || tag === 'P') {
        appendChildren(node, parent);
        const last = parent.lastChild;
        if (last && !(last.nodeType === Node.ELEMENT_NODE && last.tagName === 'BR')) {
          parent.appendChild(document.createElement('br'));
        }
        return;
      }

      appendChildren(node, parent);
    };

    appendChildren(input, output);

    const plain = plainTextFromElement(output);
    if (plain.length > MAX_TEXT_LENGTH) {
      const fallback = document.createElement('div');
      fallback.textContent = safeText(plain);
      return fallback.innerHTML;
    }

    if (!output.childNodes.length && fallbackText) {
      output.textContent = safeText(fallbackText);
    }

    const html = output.innerHTML;
    if (html.length <= MAX_RICH_TEXT_HTML_LENGTH) return html;

    const fallback = document.createElement('div');
    fallback.textContent = safeText(plain || fallbackText);
    return fallback.innerHTML;
  }

  function normalizeHttpUrl(value) {
    try {
      const raw = String(value || '').trim();
      if (!raw || raw.length > MAX_URL_LENGTH) return null;
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function displayHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '') || url;
    } catch {
      return url;
    }
  }

  function shortUrl(url, max = 58) {
    const value = String(url || '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function inferMediaTypeFromUrl(url) {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      const name = pathname.split('/').pop() || '';
      const extension = name.includes('.') ? name.split('.').pop() : '';
      if (MEDIA_IMAGE_EXTENSIONS.has(extension)) return 'image';
      if (MEDIA_VIDEO_EXTENSIONS.has(extension)) return 'video';
    } catch {}
    return 'unknown';
  }

  function probeImageUrl(url, timeoutMs = 10000) {
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(result);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        const aspectRatio = image.naturalWidth && image.naturalHeight
          ? image.naturalWidth / image.naturalHeight
          : 1.35;
        finish({ mediaType: 'image', aspectRatio });
      };
      image.onerror = () => finish(null);
      image.src = url;
    });
  }

  function parseInstagramUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return null;
    try {
      const url = new URL(normalized);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const rawKind = parts[0].toLowerCase();
      if (!['p', 'reel', 'reels'].includes(rawKind)) return null;
      const code = String(parts[1] || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!code) return null;
      const kind = rawKind === 'p' ? 'p' : 'reel';
      const canonicalUrl = `https://www.instagram.com/${kind}/${code}/`;
      return {
        url: canonicalUrl,
        embedUrl: `${canonicalUrl}embed/`,
        variant: kind,
        aspectRatio: kind === 'reel' ? 9 / 16 : 4 / 5
      };
    } catch {
      return null;
    }
  }

  function parseYouTubeUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return null;
    try {
      const url = new URL(normalized);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      let id = '';
      let variant = 'video';

      if (host === 'youtu.be') {
        id = url.pathname.split('/').filter(Boolean)[0] || '';
      } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'watch') {
          id = url.searchParams.get('v') || '';
        } else if (['shorts', 'embed', 'live'].includes(parts[0])) {
          id = parts[1] || '';
          if (parts[0] === 'shorts') variant = 'short';
        }
      }

      id = String(id).trim();
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
      return {
        url: variant === 'short'
          ? `https://www.youtube.com/shorts/${id}`
          : `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
        variant,
        aspectRatio: variant === 'short' ? 9 / 16 : 16 / 9
      };
    } catch {
      return null;
    }
  }

  function parseEmbedUrl(type, value) {
    if (type === 'instagram') return parseInstagramUrl(value);
    if (type === 'youtube') return parseYouTubeUrl(value);
    return null;
  }

  function probeVideoUrl(url, timeoutMs = 10000) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        resolve(result);
      };
      const onReady = () => {
        const aspectRatio = video.videoWidth && video.videoHeight
          ? video.videoWidth / video.videoHeight
          : 1.35;
        finish({ mediaType: 'video', aspectRatio });
      };
      const onError = () => finish(null);
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      video.src = url;
      video.load();
    });
  }

  async function probeDirectMedia(url) {
    const inferred = inferMediaTypeFromUrl(url);
    if (inferred === 'image') return probeImageUrl(url);
    if (inferred === 'video') return probeVideoUrl(url);

    const imageResult = await probeImageUrl(url);
    if (imageResult) return imageResult;
    return probeVideoUrl(url);
  }

  function normalizePortId(value) {
    if (value === 'left' || value === 'in') return 'left';
    if (value === 'right' || value === 'out') return 'right';
    return null;
  }

  function domPortToken(portId) {
    return normalizePortId(portId) === 'left' ? 'in' : 'out';
  }

  function endpointRefForOriginal(name) {
    return `orig:${name}`;
  }

  function endpointRefForUser(id) {
    return `user:${id}`;
  }

  function parseEndpoint(ref) {
    if (typeof ref !== 'string') return null;
    if (ref.startsWith('user:')) {
      const id = ref.slice(5);
      return models.has(id) ? { kind: 'user', id } : null;
    }
    if (ref.startsWith('orig:')) {
      const name = ref.slice(5);
      return originalNames.has(name) ? { kind: 'orig', name } : null;
    }
    return null;
  }

  function endpointElement(ref) {
    const parsed = parseEndpoint(ref);
    if (!parsed) return null;
    if (parsed.kind === 'user') return models.get(parsed.id)?.el || null;
    return stage.querySelector(`[data-hero-node="${CSS.escape(parsed.name)}"]`);
  }

  function endpointPort(ref, portId) {
    const parsed = parseEndpoint(ref);
    const el = endpointElement(ref);
    if (!parsed || !el) return null;
    const token = domPortToken(portId);
    if (parsed.kind === 'user') {
      return el.querySelector(`[data-custom-port="${token}"]`);
    }
    return el.querySelector(`[data-node-port="${token}"]`);
  }

  function endpointFromPort(port) {
    if (!(port instanceof Element)) return null;
    const token = port.dataset.customPort || port.dataset.nodePort;
    const portId = normalizePortId(token);
    if (!portId) return null;

    const customNode = port.closest('[data-custom-node]');
    if (customNode?.dataset.customNode) {
      return { ref: endpointRefForUser(customNode.dataset.customNode), port: portId };
    }

    const originalNode = port.closest('[data-hero-node]');
    if (originalNode?.dataset.heroNode) {
      return { ref: endpointRefForOriginal(originalNode.dataset.heroNode), port: portId };
    }

    return null;
  }

  function endpointKey(endpoint) {
    return endpoint ? `${endpoint.ref}@${endpoint.port}` : '';
  }

  function cameraApi() {
    return window.DeushimaHeroCamera || null;
  }

  function cameraScale() {
    return cameraApi()?.getState?.().scale || 1;
  }

  function worldPointFromClient(clientX, clientY) {
    const camera = cameraApi();
    if (camera?.screenToWorld) return camera.screenToWorld(clientX, clientY);

    const heroRect = hero.getBoundingClientRect();
    return {
      x: clientX - heroRect.left,
      y: clientY - heroRect.top
    };
  }

  function worldToStageLocal(worldX, worldY) {
    const camera = cameraApi();
    if (camera?.worldToStage) return camera.worldToStage(worldX, worldY);

    const stageRect = stage.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    return {
      x: worldX - (stageRect.left - heroRect.left),
      y: worldY - (stageRect.top - heroRect.top)
    };
  }

  function stageLocalPointFromClient(clientX, clientY) {
    const stageRect = stage.getBoundingClientRect();
    const scale = cameraScale();
    return {
      x: (clientX - stageRect.left) / scale,
      y: (clientY - stageRect.top) / scale
    };
  }

  function isPointInsideWorkspace(clientX, clientY) {
    const rect = hero.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function isExcludedCanvasTarget(target) {
    if (!(target instanceof Element)) return true;
    return Boolean(target.closest([
      '.nav',
      '.hero__copy',
      '.floating-cta',
      '.deu-chat-launcher',
      '[data-hero-node]',
      '[data-custom-node]',
      '[data-node-disconnect]',
      '.hero-custom-connection-delete',
      '.hero-custom-node-context',
      'a',
      'button',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ].join(',')));
  }

  function eventPath(event) {
    return workspaceInteraction?.eventPath?.(event)
      || (typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target]);
  }

  function pathClosest(event, selector) {
    for (const item of eventPath(event)) {
      if (!(item instanceof Element)) continue;
      if (item.matches(selector)) return item;
      const closest = item.closest?.(selector);
      if (closest) return closest;
    }
    return null;
  }

  function isScreenUiEvent(event) {
    if (workspaceInteraction?.isFixedUiEvent?.(event)) return true;
    return Boolean(pathClosest(event, '.hero-custom-node-context, input, textarea, select, [contenteditable="true"]'));
  }

  function canOpenCanvasMenuAt(target, clientX, clientY) {
    return (
      !isModalOpen() &&
      isPointInsideWorkspace(clientX, clientY) &&
      !isExcludedCanvasTarget(target)
    );
  }

  function setFront(model) {
    zCounter = Math.min(9999, zCounter + 1);
    model.z = zCounter;
    model.el.style.zIndex = String(20 + model.z);
    if (models.has(model.id)) saveState();
  }

  function nodeBoundsFor(model) {
    const worldBounds = cameraApi()?.getWorldBounds?.() || {
      minX: -hero.clientWidth * 3,
      maxX: hero.clientWidth * 4,
      minY: -hero.clientHeight * 3,
      maxY: hero.clientHeight * 4
    };
    const width = Math.max(1, model.el?.offsetWidth || 180);
    const height = Math.max(1, model.el?.offsetHeight || 96);
    const margin = mobileQuery.matches ? 9 : 10;
    return {
      minX: worldBounds.minX + width * 0.5 + margin,
      maxX: worldBounds.maxX - width * 0.5 - margin,
      minY: worldBounds.minY + height * 0.5 + margin,
      maxY: worldBounds.maxY - height * 0.5 - margin
    };
  }

  function clampModel(model) {
    if (!model?.el) return false;
    if (model.preserveWorldPosition) return false;
    const bounds = nodeBoundsFor(model);
    const oldX = model.x;
    const oldY = model.y;
    model.x = clamp(model.x, bounds.minX, bounds.maxX);
    model.y = clamp(model.y, bounds.minY, bounds.maxY);
    return oldX !== model.x || oldY !== model.y;
  }

  function renderModel(model) {
    if (!model?.el) return;
    clampModel(model);
    const local = worldToStageLocal(model.x, model.y);
    model.el.style.setProperty('--custom-node-x', `${local.x.toFixed(3)}px`);
    model.el.style.setProperty('--custom-node-y', `${local.y.toFixed(3)}px`);
    model.el.style.zIndex = String(20 + model.z);
  }

  function updateCounter(model) {
    const length = model.text.length;
    model.counter.textContent = `${length}/${MAX_TEXT_LENGTH}`;
    model.el.classList.toggle('is-near-limit', length >= COUNTER_THRESHOLD);
  }

  function placeCaretAtEnd(editor) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectionInside(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (!container || !editor.contains(container)) return null;
    return range;
  }

  function selectedLength(editor) {
    const range = selectionInside(editor);
    return range ? range.toString().length : 0;
  }

  function insertPlainText(editor, text) {
    const clean = safeText(text);
    if (!clean) return;
    const range = selectionInside(editor);
    if (!range) {
      editor.appendChild(document.createTextNode(clean));
      placeCaretAtEnd(editor);
      return;
    }
    range.deleteContents();
    const node = document.createTextNode(clean);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectionOffsets(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      const length = editor.textContent.length;
      return { start: length, end: length };
    }

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    if (
      !(startContainer === editor || editor.contains(startContainer.nodeType === Node.ELEMENT_NODE ? startContainer : startContainer.parentNode))
      || !(endContainer === editor || editor.contains(endContainer.nodeType === Node.ELEMENT_NODE ? endContainer : endContainer.parentNode))
    ) {
      const length = editor.textContent.length;
      return { start: length, end: length };
    }

    const startRange = document.createRange();
    startRange.selectNodeContents(editor);
    startRange.setEnd(startContainer, range.startOffset);

    const endRange = document.createRange();
    endRange.selectNodeContents(editor);
    endRange.setEnd(endContainer, range.endOffset);

    return {
      start: startRange.toString().length,
      end: endRange.toString().length
    };
  }

  function setCaretOffset(editor, targetOffset) {
    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, targetOffset);
    let node = walker.nextNode();

    if (!node) {
      node = document.createTextNode('');
      editor.appendChild(node);
    }

    let lastNode = node;
    while (node) {
      lastNode = node;
      const length = node.data.length;
      if (remaining <= length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= length;
      node = walker.nextNode();
    }

    const range = document.createRange();
    range.setStart(lastNode, lastNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function commitEditorText(editor, model, text, caretOffset = null) {
    const next = safeText(text);
    editor.textContent = next;
    model.text = next;
    model.html = sanitizeRichTextHtml(editor.innerHTML, next);
    updateCounter(model);
    if (Number.isFinite(caretOffset)) setCaretOffset(editor, caretOffset);
    saveState();
    drawConnections();
    window.DeushimaGrid?.wake?.(280);
  }

  function syncEditorModel(editor, model, { persist = true } = {}) {
    const rawText = plainTextFromElement(editor);
    if (rawText.length > MAX_TEXT_LENGTH) {
      editor.innerHTML = model.html || sanitizeRichTextHtml('', model.text);
      placeCaretAtEnd(editor);
      announce('Text limit reached');
      return false;
    }

    model.text = safeText(rawText);
    model.html = sanitizeRichTextHtml(editor.innerHTML, model.text);
    updateCounter(model);
    if (persist) saveState();
    drawConnections();
    window.DeushimaGrid?.wake?.(380);
    return true;
  }

  function captureEditorSelection(model) {
    const range = selectionInside(model?.editor);
    if (!range) return null;
    model.savedRange = range.cloneRange();
    return model.savedRange;
  }

  function restoreEditorSelection(model) {
    const editor = model?.editor;
    const selection = window.getSelection();
    if (!editor || !selection) return false;

    const range = model.savedRange;
    if (range) {
      const start = range.startContainer;
      const end = range.endContainer;
      const startInside = start === editor || editor.contains(start.nodeType === Node.ELEMENT_NODE ? start : start.parentNode);
      const endInside = end === editor || editor.contains(end.nodeType === Node.ELEMENT_NODE ? end : end.parentNode);
      if (startInside && endInside) {
        try {
          selection.removeAllRanges();
          selection.addRange(range.cloneRange());
          return true;
        } catch {}
      }
    }

    const activeRange = selectionInside(editor);
    if (activeRange) return true;

    placeCaretAtEnd(editor);
    return true;
  }

  function ensureEditorSelection(model) {
    if (!model?.editor) return false;
    if (!model.editing) setEditing(model, true, false);
    model.editor.focus({ preventScroll: true });
    restoreEditorSelection(model);
    return true;
  }

  function currentEditorLink(model) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !model?.editor) return null;
    let node = selection.anchorNode;
    if (!node) return null;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    const anchor = node?.closest?.('a[href]') || null;
    return anchor && model.editor.contains(anchor) ? anchor : null;
  }

  function updateTextToolbarState(model) {
    if (!model?.formatButtons || !model.editor) return;
    const hasSelection = Boolean(selectionInside(model.editor));
    const commandState = command => {
      if (!hasSelection) return false;
      try { return Boolean(document.queryCommandState(command)); } catch { return false; }
    };
    const states = {
      bold: commandState('bold'),
      italic: commandState('italic'),
      underline: commandState('underline'),
      strike: commandState('strikeThrough'),
      link: Boolean(hasSelection && currentEditorLink(model))
    };

    Object.entries(model.formatButtons).forEach(([key, button]) => {
      if (!button || !(key in states)) return;
      const active = states[key];
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function applyEditorCommand(model, command) {
    if (!ensureEditorSelection(model)) return false;
    try { document.execCommand(command, false, null); } catch { return false; }
    syncEditorModel(model.editor, model);
    captureEditorSelection(model);
    updateTextToolbarState(model);
    return true;
  }

  function applyEditorLink(model, rawUrl) {
    if (!ensureEditorSelection(model)) return false;
    const editor = model.editor;
    const range = selectionInside(editor);
    if (!range) return false;
    const trimmed = String(rawUrl || '').trim();
    const existing = currentEditorLink(model);

    if (!trimmed) {
      if (!existing) return false;
      try { document.execCommand('unlink', false, null); } catch { return false; }
      syncEditorModel(editor, model);
      captureEditorSelection(model);
      updateTextToolbarState(model);
      return true;
    }

    const url = normalizeHttpUrl(trimmed);
    if (!url) {
      announce('Use a valid http or https URL');
      return false;
    }

    if (range.collapsed && existing) {
      existing.href = url;
      existing.target = '_blank';
      existing.rel = 'noopener noreferrer';
    } else if (range.collapsed) {
      const available = MAX_TEXT_LENGTH - plainTextFromElement(editor).length;
      if (url.length > available) {
        announce('Text limit reached');
        return false;
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      range.insertNode(anchor);
      range.setStartAfter(anchor);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      try { document.execCommand('createLink', false, url); } catch { return false; }
      editor.querySelectorAll('a[href]').forEach(anchor => {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      });
    }

    syncEditorModel(editor, model);
    captureEditorSelection(model);
    updateTextToolbarState(model);
    return true;
  }

  function insertEditorImage(model, rawUrl) {
    if (!ensureEditorSelection(model)) return false;
    const url = normalizeHttpUrl(rawUrl);
    if (!url) {
      announce('Use a valid http or https image URL');
      return false;
    }

    const editor = model.editor;
    const range = selectionInside(editor);
    if (!range) return false;

    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    range.deleteContents();
    range.insertNode(image);
    range.setStartAfter(image);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    syncEditorModel(editor, model);
    captureEditorSelection(model);
    updateTextToolbarState(model);
    return true;
  }

  function insertLineBreak(editor, model) {
    const current = plainTextFromElement(editor);
    const replacement = selectedLength(editor);
    if (current.length - replacement >= MAX_TEXT_LENGTH) return false;

    let range = selectionInside(editor);
    if (!range) {
      placeCaretAtEnd(editor);
      range = selectionInside(editor);
    }
    if (!range) return false;

    range.deleteContents();
    const br = document.createElement('br');
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    model.logicalCaretOffset = null;
    syncEditorModel(editor, model);
    captureEditorSelection(model);
    updateTextToolbarState(model);
    return true;
  }

  function setEditing(model, editing, focus = true) {
    if (editingNodeId && editingNodeId !== model.id) {
      const previous = models.get(editingNodeId);
      if (previous) setEditing(previous, false, false);
    }

    model.editing = editing;
    if (!editing) {
      model.logicalCaretOffset = null;
      model.savedRange = null;
      if (model.urlPopover) model.urlPopover.hidden = true;
      if (model.morePanel) model.morePanel.hidden = true;
      model.toolbar?.classList.remove('has-popover');
    }
    model.el.classList.toggle('is-editing', editing);
    model.editor.setAttribute('contenteditable', editing ? 'true' : 'false');
    editingNodeId = editing ? model.id : (editingNodeId === model.id ? null : editingNodeId);

    if (editing && focus) {
      setFront(model);
      requestAnimationFrame(() => {
        model.editor.focus({ preventScroll: true });
        placeCaretAtEnd(model.editor);
        captureEditorSelection(model);
        updateTextToolbarState(model);
      });
    }
  }

  function selectNode(model, focus = false) {
    if (selectedNodeId && selectedNodeId !== model.id) {
      models.get(selectedNodeId)?.el.classList.remove('is-selected');
    }
    selectedConnectionId = null;
    syncConnectionSelection();
    selectedNodeId = model.id;
    model.el.classList.add('is-selected');
    setFront(model);
    updateTextToolbarState(model);
    if (focus) model.el.focus({ preventScroll: true });
  }

  function clearNodeSelection() {
    if (!selectedNodeId) return;
    models.get(selectedNodeId)?.el.classList.remove('is-selected');
    selectedNodeId = null;
  }

  function createNodeElement(model, { animate = true } = {}) {
    const el = document.createElement('article');
    el.className = 'hero-custom-node';
    el.dataset.customNode = model.id;
    el.dataset.gridNode = 'dynamic';
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `Editable text node NOTE ${String(model.note).padStart(2, '0')}`);

    const meta = document.createElement('div');
    meta.className = 'hero-custom-node__meta';
    meta.dataset.customDragHandle = '';

    const label = document.createElement('span');
    label.className = 'hero-custom-node__label';
    label.textContent = `NOTE ${String(model.note).padStart(2, '0')}`;

    const del = document.createElement('button');
    del.className = 'hero-custom-node__delete';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete node');
    del.textContent = '×';

    const toolbar = document.createElement('div');
    toolbar.className = 'hero-custom-node__format-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Text formatting');

    const formatButton = ({ key, label, shortcut = '', icon = '' }) => {
      const button = document.createElement('button');
      button.className = 'hero-custom-node__format-button';
      button.type = 'button';
      button.dataset.formatAction = key;
      button.dataset.tooltip = label;
      if (shortcut) button.dataset.shortcut = shortcut;
      button.setAttribute('aria-label', shortcut ? `${label} (${shortcut})` : label);
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = icon;
      return button;
    };

    const shortcutPrefix = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
    const boldButton = formatButton({ key: 'bold', label: 'Bold', shortcut: `${shortcutPrefix}B`, icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-bold">B</span>' });
    const italicButton = formatButton({ key: 'italic', label: 'Italic', shortcut: `${shortcutPrefix}I`, icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-italic">I</span>' });
    const underlineButton = formatButton({ key: 'underline', label: 'Underline', shortcut: `${shortcutPrefix}U`, icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-underline">U</span>' });
    const linkButton = formatButton({ key: 'link', label: 'Add link', shortcut: `${shortcutPrefix}K`, icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-link">⌁</span>' });
    const imageButton = formatButton({ key: 'image', label: 'Insert image', icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-image">▧</span>' });
    const moreButton = formatButton({ key: 'more', label: 'More formatting', icon: '<span aria-hidden="true" class="hero-custom-node__format-more-glyph">•••</span>' });

    const urlPopover = document.createElement('div');
    urlPopover.className = 'hero-custom-node__format-popover';
    urlPopover.hidden = true;
    const urlInput = document.createElement('input');
    urlInput.className = 'hero-custom-node__format-url';
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.autocomplete = 'off';
    urlInput.spellcheck = false;
    urlInput.setAttribute('aria-label', 'URL');
    const urlApply = document.createElement('button');
    urlApply.className = 'hero-custom-node__format-apply';
    urlApply.type = 'button';
    urlApply.setAttribute('aria-label', 'Apply');
    urlApply.textContent = '↗';
    urlPopover.append(urlInput, urlApply);

    const morePanel = document.createElement('div');
    morePanel.className = 'hero-custom-node__format-more-panel';
    morePanel.hidden = true;
    const strikeButton = formatButton({ key: 'strike', label: 'Strikethrough', icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-strike">S</span>' });
    const clearFormatButton = formatButton({ key: 'clear', label: 'Clear formatting', icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-clear">Tx</span>' });
    const unlinkButton = formatButton({ key: 'unlink', label: 'Remove link', icon: '<span aria-hidden="true" class="hero-custom-node__format-glyph is-unlink">×⌁</span>' });
    morePanel.append(strikeButton, clearFormatButton, unlinkButton);
    toolbar.append(boldButton, italicButton, underlineButton, linkButton, imageButton, moreButton, urlPopover, morePanel);

    const editor = document.createElement('div');
    editor.className = 'hero-custom-node__editor';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Node text');
    editor.setAttribute('data-placeholder', 'Write something…');
    editor.setAttribute('contenteditable', 'false');
    editor.spellcheck = true;
    editor.innerHTML = model.html || sanitizeRichTextHtml('', model.text);

    const counter = document.createElement('span');
    counter.className = 'hero-custom-node__counter';

    const portIn = document.createElement('span');
    portIn.className = 'hero-custom-node__port hero-custom-node__port--in';
    portIn.dataset.customPort = 'in';
    portIn.setAttribute('aria-hidden', 'true');

    const portOut = document.createElement('span');
    portOut.className = 'hero-custom-node__port hero-custom-node__port--out';
    portOut.dataset.customPort = 'out';
    portOut.setAttribute('aria-hidden', 'true');

    meta.append(label);
    el.append(toolbar, meta, del, editor, counter, portIn, portOut);
    nodeLayer.appendChild(el);

    model.el = el;
    model.editor = editor;
    model.counter = counter;
    model.portIn = portIn;
    model.portOut = portOut;
    model.toolbar = toolbar;
    model.urlPopover = urlPopover;
    model.urlInput = urlInput;
    model.morePanel = morePanel;
    model.formatButtons = {
      bold: boldButton,
      italic: italicButton,
      underline: underlineButton,
      link: linkButton,
      strike: strikeButton
    };

    const closeToolbarPanels = ({ restoreFocus = false } = {}) => {
      urlPopover.hidden = true;
      morePanel.hidden = true;
      toolbar.classList.remove('has-popover');
      if (restoreFocus) {
        ensureEditorSelection(model);
        captureEditorSelection(model);
        updateTextToolbarState(model);
      }
    };

    const openUrlPopover = mode => {
      captureEditorSelection(model);
      morePanel.hidden = true;
      urlPopover.hidden = false;
      urlPopover.dataset.mode = mode;
      toolbar.classList.add('has-popover');
      const currentLink = mode === 'link' ? currentEditorLink(model) : null;
      urlInput.value = currentLink?.href || '';
      urlInput.placeholder = mode === 'image' ? 'https://…/image.jpg' : 'https://…';
      urlInput.setAttribute('aria-label', mode === 'image' ? 'Image URL' : 'Link URL');
      requestAnimationFrame(() => {
        urlInput.focus({ preventScroll: true });
        if (urlInput.value) urlInput.select();
      });
    };

    const submitUrlPopover = () => {
      const mode = urlPopover.dataset.mode;
      const value = urlInput.value;
      const applied = mode === 'image'
        ? insertEditorImage(model, value)
        : applyEditorLink(model, value);
      if (applied) closeToolbarPanels({ restoreFocus: true });
    };

    toolbar.addEventListener('pointerdown', event => {
      event.stopPropagation();
      if (event.target.closest('.hero-custom-node__format-button')) event.preventDefault();
    });
    toolbar.addEventListener('click', event => event.stopPropagation());

    boldButton.addEventListener('click', () => applyEditorCommand(model, 'bold'));
    italicButton.addEventListener('click', () => applyEditorCommand(model, 'italic'));
    underlineButton.addEventListener('click', () => applyEditorCommand(model, 'underline'));
    strikeButton.addEventListener('click', () => applyEditorCommand(model, 'strikeThrough'));
    clearFormatButton.addEventListener('click', () => {
      applyEditorCommand(model, 'removeFormat');
      closeToolbarPanels({ restoreFocus: true });
    });
    unlinkButton.addEventListener('click', () => {
      applyEditorCommand(model, 'unlink');
      closeToolbarPanels({ restoreFocus: true });
    });
    linkButton.addEventListener('click', () => openUrlPopover('link'));
    imageButton.addEventListener('click', () => openUrlPopover('image'));
    moreButton.addEventListener('click', () => {
      captureEditorSelection(model);
      urlPopover.hidden = true;
      morePanel.hidden = !morePanel.hidden;
      toolbar.classList.toggle('has-popover', !morePanel.hidden);
      updateTextToolbarState(model);
    });
    urlApply.addEventListener('click', submitUrlPopover);
    urlInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitUrlPopover();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeToolbarPanels({ restoreFocus: true });
      }
    });

    renderModel(model);
    updateCounter(model);

    if (animate && !reducedMotion.matches) {
      el.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-entering')));
    }

    del.addEventListener('pointerdown', event => event.stopPropagation());
    del.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      markHintUsed();
      deleteNode(model.id, { announceChange: true, sound: true });
    });

    el.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('[data-custom-port], .hero-custom-node__delete, .hero-custom-node__format-toolbar')) return;

      selectNode(model);

      const mayDrag = !model.editing || Boolean(event.target.closest('[data-custom-drag-handle]'));
      if (!mayDrag) return;

      const rect = el.getBoundingClientRect();
      const scale = cameraScale();
      dragState = {
        id: model.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: (event.clientX - (rect.left + rect.width * 0.5)) / scale,
        offsetY: (event.clientY - (rect.top + rect.height * 0.5)) / scale,
        moved: false,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        lastSoundAt: 0
      };
      el.setPointerCapture?.(event.pointerId);
    });

    el.addEventListener('dblclick', event => {
      if (event.target.closest('[data-custom-port], .hero-custom-node__delete, .hero-custom-node__format-toolbar')) return;
      event.preventDefault();
      selectNode(model);
      setEditing(model, true);
    });

    el.addEventListener('focus', () => selectNode(model));

    editor.addEventListener('keydown', event => {
      if (!model.editing) return;

      const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (modifier) {
        const key = String(event.key || '').toLowerCase();
        if (key === 'b' || key === 'i' || key === 'u') {
          event.preventDefault();
          applyEditorCommand(model, key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
          return;
        }
        if (key === 'k') {
          event.preventDefault();
          openUrlPopover('link');
          return;
        }
      }

      const now = performance.now();
      const ignored = (
        event.ctrlKey || event.altKey || event.metaKey ||
        ['Shift','Control','Alt','Meta','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)
      );

      if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(model, false, false);
        el.focus({ preventScroll: true });
        return;
      }

      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) {
        model.logicalCaretOffset = null;
      }

      if (!ignored && now - lastTypingAt >= 35) {
        if (event.key === 'Backspace' || event.key === 'Delete') {
          playSfx('chatDelete', { element: editor, eventTimestamp: event.timeStamp });
        } else if (event.key === ' ') {
          playSfx('chatSpace', { element: editor, eventTimestamp: event.timeStamp });
        } else if (event.key === 'Enter' || event.key.length === 1) {
          playSfx('chatType', {
            element: editor,
            variantIndex: typingVariant % 4,
            eventTimestamp: event.timeStamp
          });
          typingVariant = (typingVariant + 1) % 4;
        }
        lastTypingAt = now;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        insertLineBreak(editor, model);
      }
    }, { capture: true });

    editor.addEventListener('beforeinput', event => {
      if (!model.editing) return;
      const inputType = String(event.inputType || '');

      if (Number.isFinite(model.logicalCaretOffset)) {
        const current = plainTextFromEditor(editor);
        let position = clamp(model.logicalCaretOffset, 0, current.length);

        if (inputType === 'insertText' || inputType === 'insertCompositionText') {
          event.preventDefault();
          const incoming = safeText(event.data || '');
          const allowed = Math.max(0, MAX_TEXT_LENGTH - current.length);
          const chunk = incoming.slice(0, allowed);
          const next = current.slice(0, position) + chunk + current.slice(position);
          position += chunk.length;
          model.logicalCaretOffset = null;
          commitEditorText(editor, model, next, position);
          return;
        }

        if (inputType === 'deleteContentBackward') {
          event.preventDefault();
          const next = position > 0
            ? current.slice(0, position - 1) + current.slice(position)
            : current;
          position = Math.max(0, position - 1);
          model.logicalCaretOffset = null;
          commitEditorText(editor, model, next, position);
          return;
        }

        if (inputType === 'deleteContentForward') {
          event.preventDefault();
          const next = current.slice(0, position) + current.slice(position + 1);
          model.logicalCaretOffset = null;
          commitEditorText(editor, model, next, position);
          return;
        }
      }

      if (!inputType.startsWith('insert') || inputType === 'insertLineBreak' || inputType === 'insertParagraph') return;
      const incoming = String(event.data || '');
      const current = plainTextFromElement(editor).length;
      const replacement = selectedLength(editor);
      if (current - replacement + incoming.length > MAX_TEXT_LENGTH) {
        event.preventDefault();
      }
    });

    editor.addEventListener('pointerdown', () => {
      model.logicalCaretOffset = null;
    }, { passive: true });

    editor.addEventListener('paste', event => {
      if (!model.editing) return;
      event.preventDefault();
      const raw = event.clipboardData?.getData('text/plain') || '';
      if (Number.isFinite(model.logicalCaretOffset)) {
        const current = plainTextFromEditor(editor);
        const position = clamp(model.logicalCaretOffset, 0, current.length);
        const remaining = Math.max(0, MAX_TEXT_LENGTH - current.length);
        const chunk = safeText(raw).slice(0, remaining);
        const next = current.slice(0, position) + chunk + current.slice(position);
        model.logicalCaretOffset = null;
        commitEditorText(editor, model, next, position + chunk.length);
        return;
      }
      const current = plainTextFromElement(editor).length;
      const replacement = selectedLength(editor);
      const remaining = Math.max(0, MAX_TEXT_LENGTH - (current - replacement));
      insertPlainText(editor, raw.slice(0, remaining));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    editor.addEventListener('input', () => {
      model.logicalCaretOffset = null;
      syncEditorModel(editor, model);
      captureEditorSelection(model);
      updateTextToolbarState(model);
    });

    editor.addEventListener('blur', () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (model.editing && active !== editor && !model.toolbar?.contains(active)) {
          setEditing(model, false, false);
        }
      });
    });

    editor.addEventListener('click', event => {
      if (model.editing && event.target.closest('a')) event.preventDefault();
    });

    editor.addEventListener('load', event => {
      if (!(event.target instanceof HTMLImageElement)) return;
      drawConnections();
      window.DeushimaGrid?.wake?.(300);
    }, true);

    [portIn, portOut].forEach(port => {
      port.addEventListener('pointerenter', event => {
        if (coarsePointer.matches || event.pointerType === 'touch') return;
        playSfx('port', { element: port, eventTimestamp: event.timeStamp, gainScale: .8 });
      }, { passive: true });
    });

    return el;
  }

  function createTextNode({
    id = uid('note'),
    note = nextNoteNumber++,
    x = null,
    y = null,
    text = '',
    html = '',
    z = ++zCounter,
    animate = true,
    focusEditor = true,
    persist = true,
    sound = true,
    select = true,
    preserveWorldPosition = false
  } = {}) {
    if (models.size >= MAX_NODES) return null;
    if (models.has(id)) return null;

    const heroRect = hero.getBoundingClientRect();
    const fallbackCenter = worldPointFromClient(
      heroRect.left + heroRect.width * 0.5,
      heroRect.top + heroRect.height * 0.5
    );
    const worldX = Number.isFinite(Number(x)) ? Number(x) : fallbackCenter.x;
    const worldY = Number.isFinite(Number(y)) ? Number(y) : fallbackCenter.y;
    const initialHtml = sanitizeRichTextHtml(html, text);
    const initialText = richHtmlText(initialHtml) || safeText(text);

    const model = {
      id,
      note: clamp(Math.trunc(note) || 1, 1, 999),
      type: 'text',
      x: worldX,
      y: worldY,
      text: initialText,
      html: initialHtml,
      z: clamp(Math.trunc(z) || 1, 1, 9999),
      preserveWorldPosition: Boolean(preserveWorldPosition),
      editing: false,
      logicalCaretOffset: null,
      savedRange: null,
      el: null,
      editor: null,
      counter: null,
      portIn: null,
      portOut: null,
      toolbar: null,
      urlPopover: null,
      urlInput: null,
      morePanel: null,
      formatButtons: null
    };

    zCounter = Math.max(zCounter, model.z);
    nextNoteNumber = Math.max(nextNoteNumber, model.note + 1);
    models.set(id, model);
    createNodeElement(model, { animate });
    renderModel(model);
    if (select) selectNode(model);

    if (persist) saveState();
    window.DeushimaGrid?.refreshDynamicNodes?.();
    window.DeushimaGrid?.wake?.(900);
    scheduleConnectionLoop();

    if (sound) playSfx('chatSend', { element: model.el, gainScale: .9 });
    if (focusEditor) setEditing(model, true);

    return model;
  }

  document.addEventListener('selectionchange', () => {
    if (!editingNodeId) return;
    const model = models.get(editingNodeId);
    if (!model?.editor) return;
    const range = selectionInside(model.editor);
    if (!range) return;
    model.savedRange = range.cloneRange();
    updateTextToolbarState(model);
  });

  function nextSerialForType(type) {
    let highest = 0;
    models.forEach(model => {
      if (model.type === type) highest = Math.max(highest, Number(model.note) || 0);
    });
    return highest + 1;
  }

  function nodeTypeLabel(model) {
    const prefix = model.type === 'media'
      ? 'MEDIA'
      : model.type === 'link'
        ? 'LINK'
        : model.type === 'instagram'
          ? 'INSTAGRAM'
          : model.type === 'youtube'
            ? 'YOUTUBE'
            : 'NOTE';
    return `${prefix} ${String(model.note).padStart(2, '0')}`;
  }

  function createSafeAnchor(url, label, className) {
    const anchor = document.createElement('a');
    anchor.className = className;
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.draggable = false;
    anchor.textContent = label;
    anchor.addEventListener('pointerdown', event => event.stopPropagation());
    return anchor;
  }

  function bindStaticNodeDrag(model, el) {
    el.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('[data-custom-port], .hero-custom-node__delete, a, button, input')) return;
      selectNode(model);
      const rect = el.getBoundingClientRect();
      const scale = cameraScale();
      dragState = {
        id: model.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: (event.clientX - (rect.left + rect.width * 0.5)) / scale,
        offsetY: (event.clientY - (rect.top + rect.height * 0.5)) / scale,
        moved: false,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        lastSoundAt: 0
      };
      try { el.setPointerCapture?.(event.pointerId); } catch {}
    });
    el.addEventListener('focus', () => selectNode(model));
  }

  function appendStaticNodePorts(model, el) {
    const portIn = document.createElement('span');
    portIn.className = 'hero-custom-node__port hero-custom-node__port--in';
    portIn.dataset.customPort = 'in';
    portIn.setAttribute('aria-hidden', 'true');
    const portOut = document.createElement('span');
    portOut.className = 'hero-custom-node__port hero-custom-node__port--out';
    portOut.dataset.customPort = 'out';
    portOut.setAttribute('aria-hidden', 'true');
    el.append(portIn, portOut);
    model.portIn = portIn;
    model.portOut = portOut;
    [portIn, portOut].forEach(port => {
      port.addEventListener('pointerenter', event => {
        if (coarsePointer.matches || event.pointerType === 'touch') return;
        playSfx('port', { element: port, eventTimestamp: event.timeStamp, gainScale: .8 });
      }, { passive: true });
    });
  }

  function createStaticNodeShell(model) {
    const el = document.createElement('article');
    el.className = `hero-custom-node hero-custom-node--${model.type}`;
    el.dataset.customNode = model.id;
    el.dataset.gridNode = 'dynamic';
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `${model.type} node ${nodeTypeLabel(model)}`);
    const meta = document.createElement('div');
    meta.className = 'hero-custom-node__meta';
    meta.dataset.customDragHandle = '';
    const label = document.createElement('span');
    label.className = 'hero-custom-node__label';
    label.textContent = nodeTypeLabel(model);
    meta.append(label);
    const del = document.createElement('button');
    del.className = 'hero-custom-node__delete';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete node');
    del.textContent = '×';
    el.append(meta, del);
    nodeLayer.appendChild(el);
    model.el = el;
    del.addEventListener('pointerdown', event => event.stopPropagation());
    del.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      markHintUsed();
      deleteNode(model.id, { announceChange: true, sound: true });
    });
    bindStaticNodeDrag(model, el);
    appendStaticNodePorts(model, el);
    return { el, meta };
  }

  function finishStaticNodeCreation(model, { animate, persist, sound, select }) {
    renderModel(model);
    if (select) selectNode(model);
    if (animate && !reducedMotion.matches) {
      model.el.classList.add('is-materializing');
      requestAnimationFrame(() => requestAnimationFrame(() => model.el.classList.remove('is-materializing')));
    }
    if (persist) saveState();
    window.DeushimaGrid?.refreshDynamicNodes?.();
    window.DeushimaGrid?.wake?.(520);
    scheduleConnectionLoop();
    if (sound) playSfx('chatSend', { element: model.el, gainScale: .88 });
    return model;
  }

  function createLinkNode({
    id = uid('link'), note = null, x = null, y = null, url = '', z = ++zCounter,
    animate = true, persist = true, sound = true, select = true, preserveWorldPosition = false
  } = {}) {
    if (models.size >= MAX_NODES || models.has(id)) return null;
    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl) return null;
    const heroRect = hero.getBoundingClientRect();
    const fallback = worldPointFromClient(heroRect.left + heroRect.width * .5, heroRect.top + heroRect.height * .5);
    const model = {
      id,
      note: clamp(Math.trunc(Number(note)) || nextSerialForType('link'), 1, 999),
      type: 'link',
      x: Number.isFinite(Number(x)) ? Number(x) : fallback.x,
      y: Number.isFinite(Number(y)) ? Number(y) : fallback.y,
      url: normalizedUrl,
      z: clamp(Math.trunc(Number(z)) || 1, 1, 9999),
      preserveWorldPosition: Boolean(preserveWorldPosition),
      el: null,
      portIn: null,
      portOut: null
    };
    zCounter = Math.max(zCounter, model.z);
    models.set(id, model);
    const { el } = createStaticNodeShell(model);
    const body = document.createElement('div');
    body.className = 'hero-custom-node__link-body';
    const host = document.createElement('strong');
    host.className = 'hero-custom-node__domain';
    host.textContent = displayHost(model.url);
    const path = document.createElement('span');
    path.className = 'hero-custom-node__url';
    path.textContent = shortUrl(model.url, 72);
    const open = createSafeAnchor(model.url, 'Open link ↗', 'hero-custom-node__open-link');
    body.append(host, path, open);
    el.insertBefore(body, model.portIn);
    return finishStaticNodeCreation(model, { animate, persist, sound, select });
  }

  function createEmbedNode({
    id = uid('embed'), note = null, type = '', x = null, y = null, url = '', z = ++zCounter,
    animate = true, persist = true, sound = true, select = true
  } = {}) {
    if (!['instagram', 'youtube'].includes(type)) return null;
    if (models.size >= MAX_NODES || models.has(id)) return null;
    const parsed = parseEmbedUrl(type, url);
    if (!parsed) return null;
    const heroRect = hero.getBoundingClientRect();
    const fallback = worldPointFromClient(heroRect.left + heroRect.width * .5, heroRect.top + heroRect.height * .5);
    const model = {
      id,
      note: clamp(Math.trunc(Number(note)) || nextSerialForType(type), 1, 999),
      type,
      x: Number.isFinite(Number(x)) ? Number(x) : fallback.x,
      y: Number.isFinite(Number(y)) ? Number(y) : fallback.y,
      url: parsed.url,
      embedUrl: parsed.embedUrl,
      embedVariant: parsed.variant,
      aspectRatio: parsed.aspectRatio,
      z: clamp(Math.trunc(Number(z)) || 1, 1, 9999),
      el: null,
      portIn: null,
      portOut: null,
      embedFrame: null,
      embedElement: null,
      embedDomain: null,
      embedOpen: null
    };
    zCounter = Math.max(zCounter, model.z);
    models.set(id, model);

    const { el } = createStaticNodeShell(model);
    const frame = document.createElement('div');
    frame.className = 'hero-custom-node__embed-frame';
    frame.style.setProperty('--embed-aspect', model.aspectRatio.toFixed(5));
    const iframe = document.createElement('iframe');
    iframe.className = 'hero-custom-node__embed';
    iframe.src = model.embedUrl;
    iframe.title = type === 'instagram' ? 'Instagram embed' : 'YouTube embed';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);

    const footer = document.createElement('div');
    footer.className = 'hero-custom-node__media-footer';
    const domain = document.createElement('span');
    domain.className = 'hero-custom-node__domain';
    domain.textContent = type === 'instagram' ? 'instagram.com' : 'youtube.com';
    const actions = document.createElement('span');
    actions.className = 'hero-custom-node__media-actions';
    const edit = document.createElement('button');
    edit.className = 'hero-custom-node__edit-url';
    edit.type = 'button';
    edit.textContent = 'Edit URL';
    edit.addEventListener('pointerdown', event => event.stopPropagation());
    edit.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openUrlForm(type, { anchor: { worldX: model.x, worldY: model.y }, model });
    });
    const open = createSafeAnchor(model.url, '↗', 'hero-custom-node__media-open');
    open.setAttribute('aria-label', type === 'instagram' ? 'Open on Instagram' : 'Open on YouTube');
    actions.append(edit, open);
    footer.append(domain, actions);

    model.embedFrame = frame;
    model.embedElement = iframe;
    model.embedDomain = domain;
    model.embedOpen = open;
    el.insertBefore(frame, model.portIn);
    el.insertBefore(footer, model.portIn);
    return finishStaticNodeCreation(model, { animate, persist, sound, select });
  }

  function setMediaStatus(model, message, failed = false) {
    if (!model.mediaStatus) return;
    model.mediaStatus.textContent = message;
    model.el?.classList.toggle('is-media-error', failed);
  }

  function commitMediaReady(model, mediaType, element, aspectRatio) {
    model.mediaType = mediaType;
    if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
      model.aspectRatio = clamp(aspectRatio, .35, 3.5);
      model.mediaFrame?.style.setProperty('--media-aspect', model.aspectRatio.toFixed(5));
    }
    model.el?.classList.remove('is-media-error');
    model.el?.classList.add('is-media-ready');
    if (model.mediaStatus) model.mediaStatus.textContent = '';
    element.classList.add('is-ready');
    model.height = model.el?.offsetHeight || model.height || null;
    saveState();
    drawConnections();
    window.DeushimaGrid?.wake?.(240);
  }

  function mountMedia(model) {
    if (!model.mediaFrame) return;
    model.mediaLoadToken = (model.mediaLoadToken || 0) + 1;
    const loadToken = model.mediaLoadToken;
    const isCurrentLoad = () => (
      models.get(model.id) === model
      && model.mediaLoadToken === loadToken
    );
    model.mediaFrame.querySelectorAll('img, video').forEach(node => {
      if (node instanceof HTMLVideoElement) mediaVisibilityObserver?.unobserve(node);
      node.remove();
    });
    model.el.classList.remove('is-media-ready', 'is-media-error');
    setMediaStatus(model, 'Loading media…');

    const fail = () => {
      if (!isCurrentLoad()) return;
      setMediaStatus(model, `Media unavailable · ${shortUrl(model.url, 46)}`, true);
    };

    const mountVideo = () => {
      const video = document.createElement('video');
      video.className = 'hero-custom-node__media';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'metadata';
      video.controls = false;
      video.addEventListener('loadedmetadata', () => {
        if (!isCurrentLoad()) return;
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : model.aspectRatio;
        commitMediaReady(model, 'video', video, ratio);
        if (mediaVisibilityObserver) mediaVisibilityObserver.observe(video);
        else video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', fail, { once: true });
      model.mediaFrame.prepend(video);
      model.mediaElement = video;
      video.src = model.url;
    };

    const mountImage = (fallbackToVideo = false) => {
      const image = document.createElement('img');
      image.className = 'hero-custom-node__media';
      image.alt = '';
      image.decoding = 'async';
      image.loading = 'eager';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', () => {
        if (!isCurrentLoad()) return;
        const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : model.aspectRatio;
        commitMediaReady(model, 'image', image, ratio);
      }, { once: true });
      image.addEventListener('error', () => {
        if (!isCurrentLoad()) return;
        image.remove();
        if (fallbackToVideo) mountVideo();
        else fail();
      }, { once: true });
      model.mediaFrame.prepend(image);
      model.mediaElement = image;
      image.src = model.url;
    };

    if (model.mediaType === 'video') mountVideo();
    else if (model.mediaType === 'image') mountImage(false);
    else mountImage(true);
  }

  function waitForMountedMedia(model) {
    if (model?.el?.classList.contains('is-media-ready')) return Promise.resolve(true);
    const media = model?.mediaElement;
    if (!(media instanceof HTMLImageElement) && !(media instanceof HTMLVideoElement)) {
      return Promise.resolve(false);
    }

    if (media instanceof HTMLImageElement && media.complete) {
      return Promise.resolve(media.naturalWidth > 0 && media.naturalHeight > 0);
    }
    if (media instanceof HTMLVideoElement && media.readyState >= 1) return Promise.resolve(true);

    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        media.removeEventListener('load', onReady);
        media.removeEventListener('loadedmetadata', onReady);
        media.removeEventListener('error', onError);
        resolve(result);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), MEDIA_MOUNT_TIMEOUT_MS);
      media.addEventListener('load', onReady, { once: true });
      media.addEventListener('loadedmetadata', onReady, { once: true });
      media.addEventListener('error', onError, { once: true });
    });
  }

  function createMediaNode({
    id = uid('media'), note = null, x = null, y = null, url = '', mediaType = 'unknown',
    width = 300, height = null, aspectRatio = 1.35, z = ++zCounter,
    animate = true, persist = true, sound = true, select = true, preserveWorldPosition = false
  } = {}) {
    if (models.size >= MAX_NODES || models.has(id)) return null;
    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl) return null;
    const heroRect = hero.getBoundingClientRect();
    const fallback = worldPointFromClient(heroRect.left + heroRect.width * .5, heroRect.top + heroRect.height * .5);
    const model = {
      id,
      note: clamp(Math.trunc(Number(note)) || nextSerialForType('media'), 1, 999),
      type: 'media',
      x: Number.isFinite(Number(x)) ? Number(x) : fallback.x,
      y: Number.isFinite(Number(y)) ? Number(y) : fallback.y,
      url: normalizedUrl,
      mediaType: ['image', 'video'].includes(mediaType) ? mediaType : inferMediaTypeFromUrl(normalizedUrl),
      width: clamp(Number(width) || 300, 220, 420),
      height: Number.isFinite(Number(height)) ? Number(height) : null,
      aspectRatio: clamp(Number(aspectRatio) || 1.35, .35, 3.5),
      z: clamp(Math.trunc(Number(z)) || 1, 1, 9999),
      preserveWorldPosition: Boolean(preserveWorldPosition),
      el: null,
      portIn: null,
      portOut: null,
      mediaFrame: null,
      mediaStatus: null,
      mediaElement: null
    };
    zCounter = Math.max(zCounter, model.z);
    models.set(id, model);
    const { el } = createStaticNodeShell(model);
    el.style.setProperty('--custom-media-width', `${model.width}px`);

    const frame = document.createElement('div');
    frame.className = 'hero-custom-node__media-frame';
    frame.style.setProperty('--media-aspect', model.aspectRatio.toFixed(5));
    const status = document.createElement('span');
    status.className = 'hero-custom-node__media-status';
    status.textContent = 'Loading media…';
    frame.append(status);

    const footer = document.createElement('div');
    footer.className = 'hero-custom-node__media-footer';
    const domain = document.createElement('span');
    domain.className = 'hero-custom-node__domain';
    domain.textContent = displayHost(model.url);
    const actions = document.createElement('span');
    actions.className = 'hero-custom-node__media-actions';
    const edit = document.createElement('button');
    edit.className = 'hero-custom-node__edit-url';
    edit.type = 'button';
    edit.textContent = 'Edit URL';
    edit.addEventListener('pointerdown', event => event.stopPropagation());
    edit.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openUrlForm('media', { anchor: { worldX: model.x, worldY: model.y }, model });
    });
    const open = createSafeAnchor(model.url, '↗', 'hero-custom-node__media-open');
    open.setAttribute('aria-label', 'Open media in new tab');
    actions.append(edit, open);
    footer.append(domain, actions);

    model.mediaFrame = frame;
    model.mediaStatus = status;
    model.mediaDomain = domain;
    model.mediaOpen = open;
    el.insertBefore(frame, model.portIn);
    el.insertBefore(footer, model.portIn);
    mountMedia(model);
    return finishStaticNodeCreation(model, { animate, persist, sound, select });
  }

  function deleteIncidentConnections(id) {
    const ref = endpointRefForUser(id);
    const ids = connections
      .filter(connection => connection.from?.ref === ref || connection.to?.ref === ref)
      .map(connection => connection.id);
    ids.forEach(connectionId => removeConnection(connectionId, { persist: false, sound: false }));
  }

  function deleteNode(id, { announceChange = false, sound = false, persist = true } = {}) {
    const model = models.get(id);
    if (!model) return false;

    if (model.type === 'media') model.mediaLoadToken = (model.mediaLoadToken || 0) + 1;

    deleteIncidentConnections(id);
    if (editingNodeId === id) editingNodeId = null;
    if (selectedNodeId === id) selectedNodeId = null;

    const remove = () => {
      if (model.mediaElement instanceof HTMLVideoElement) {
        mediaVisibilityObserver?.unobserve(model.mediaElement);
        model.mediaElement.pause();
      }
      model.el.remove();
      models.delete(id);
      if (persist) saveState();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(700);
      drawConnections();
      scheduleConnectionLoop();
      if (announceChange) announce('Node deleted');
    };

    if (!reducedMotion.matches) {
      model.el.classList.add('is-removing');
      window.setTimeout(remove, 150);
    } else {
      remove();
    }

    if (sound) playSfx('chatClose', { element: model.el, gainScale: .86 });
    return true;
  }

  function duplicateNode(id) {
    const source = models.get(id);
    if (!source || models.size >= MAX_NODES) return null;
    if (source.type === 'link') {
      return createLinkNode({
        x: source.x + 28,
        y: source.y + 24,
        url: source.url,
        animate: true,
        persist: true,
        sound: true
      });
    }
    if (source.type === 'media') {
      return createMediaNode({
        x: source.x + 28,
        y: source.y + 24,
        url: source.url,
        mediaType: source.mediaType,
        width: source.width,
        height: source.height,
        aspectRatio: source.aspectRatio,
        animate: true,
        persist: true,
        sound: true
      });
    }
    if (source.type === 'instagram' || source.type === 'youtube') {
      return createEmbedNode({
        type: source.type,
        x: source.x + 28,
        y: source.y + 24,
        url: source.url,
        animate: true,
        persist: true,
        sound: true
      });
    }
    return createTextNode({
      x: source.x + 28,
      y: source.y + 24,
      text: source.text,
      html: source.html,
      animate: true,
      focusEditor: false,
      persist: true,
      sound: true
    });
  }

  function clearAllNodes() {
    const ids = [...models.keys()];
    connections = [];
    connectionEls.forEach(record => record.group.remove());
    connectionEls.clear();
    hideLineDeleteButton();
    selectedConnectionId = null;
    previewPath.setAttribute('d', '');

    ids.forEach(id => deleteNode(id, {
      announceChange: false,
      sound: false,
      persist: false
    }));

    try {
      localStorage.removeItem(PREVIOUS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
    window.setTimeout(() => {
      saveState();
      announce('Nodes cleared');
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(800);
    }, reducedMotion.matches ? 0 : 170);
  }

  function connectionRouteKey(from, to) {
    return [endpointKey(from), endpointKey(to)].sort().join('::');
  }

  function nextConnectionLane(from, to) {
    const key = connectionRouteKey(from, to);
    const used = new Set(
      connections
        .filter(connection => connectionRouteKey(connection.from, connection.to) === key)
        .map(connection => Number(connection.lane) || 0)
    );
    const candidates = [0];
    for (let index = 1; index <= 12; index += 1) candidates.push(index, -index);
    return candidates.find(lane => !used.has(lane)) ?? (used.size + 1);
  }

  function laneOffset(lane) {
    return (Number(lane) || 0) * 8;
  }

  function portCenter(endpointOrRef, portId = null) {
    const endpoint = typeof endpointOrRef === 'string'
      ? { ref: endpointOrRef, port: normalizePortId(portId) }
      : endpointOrRef;
    if (!endpoint?.ref || !normalizePortId(endpoint.port)) return null;
    const parsed = parseEndpoint(endpoint.ref);
    if (!parsed) return null;
    if (parsed.kind === 'user') {
      const model = models.get(parsed.id);
      if (!model?.el) return null;
      const halfWidth = Math.max(1, model.el.offsetWidth || 180) * 0.5;
      const worldX = model.x + (endpoint.port === 'left' ? -halfWidth : halfWidth);
      return worldToStageLocal(worldX, model.y);
    }
    const port = endpointPort(endpoint.ref, endpoint.port);
    if (!port) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = port.getBoundingClientRect();
    const scale = cameraScale();
    return {
      x: (rect.left - stageRect.left + rect.width * 0.5) / scale,
      y: (rect.top - stageRect.top + rect.height * 0.5) / scale
    };
  }

  function portClientCenter(endpoint) {
    const parsed = parseEndpoint(endpoint?.ref);
    if (!parsed || !normalizePortId(endpoint?.port)) return null;
    if (parsed.kind === 'user') {
      const model = models.get(parsed.id);
      const camera = cameraApi();
      if (!model?.el || !camera?.worldToScreen) return null;
      const halfWidth = Math.max(1, model.el.offsetWidth || 180) * 0.5;
      return camera.worldToScreen(
        model.x + (endpoint.port === 'left' ? -halfWidth : halfWidth),
        model.y
      );
    }
    const port = endpointPort(endpoint.ref, endpoint.port);
    if (!port) return null;
    const rect = port.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
  }

  function curvePoints(from, to, fromPort = 'right', toPort = 'left', lane = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const tension = Math.max(42, Math.min(190, Math.abs(dx) * .42 + Math.abs(dy) * .12));
    const nx = -dy / distance;
    const ny = dx / distance;
    const offset = laneOffset(lane);
    const fromDirection = fromPort === 'left' ? -1 : 1;
    const toDirection = toPort === 'left' ? -1 : 1;
    return {
      from,
      to,
      c1: { x: from.x + tension * fromDirection + nx * offset, y: from.y + ny * offset },
      c2: { x: to.x + tension * toDirection + nx * offset, y: to.y + ny * offset }
    };
  }

  function curvePath(points) {
    return `M ${points.from.x.toFixed(2)} ${points.from.y.toFixed(2)} C ${points.c1.x.toFixed(2)} ${points.c1.y.toFixed(2)}, ${points.c2.x.toFixed(2)} ${points.c2.y.toFixed(2)}, ${points.to.x.toFixed(2)} ${points.to.y.toFixed(2)}`;
  }

  function cubicPoint(points, t) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return {
      x: uu * u * points.from.x + 3 * uu * t * points.c1.x + 3 * u * tt * points.c2.x + tt * t * points.to.x,
      y: uu * u * points.from.y + 3 * uu * t * points.c1.y + 3 * u * tt * points.c2.y + tt * t * points.to.y
    };
  }

  function ensureConnectionElement(connection) {
    if (connectionEls.has(connection.id)) return connectionEls.get(connection.id);

    const group = document.createElementNS(ns, 'g');
    group.dataset.customConnection = connection.id;

    const visible = document.createElementNS(ns, 'path');
    visible.setAttribute('class', 'hero-custom-node-line');
    visible.setAttribute('pathLength', '1');

    const hit = document.createElementNS(ns, 'path');
    hit.setAttribute('class', 'hero-custom-node-line-hit');

    group.append(visible, hit);
    customMesh.insertBefore(group, previewPath);

    const record = { group, visible, hit };
    connectionEls.set(connection.id, record);

    hit.addEventListener('pointerenter', () => {
      hoverConnectionId = connection.id;
      record.visible.classList.add('is-hovered');
      selectedConnectionId = selectedConnectionId === connection.id ? selectedConnectionId : selectedConnectionId;
      showLineDeleteButton(connection.id);
      if (!reducedMotion.matches) {
        record.visible.animate(
          [
            { strokeDasharray: '.16 .84', strokeDashoffset: '1', opacity: .72 },
            { strokeDasharray: '.16 .84', strokeDashoffset: '-1', opacity: 1 }
          ],
          { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
      }
    });

    hit.addEventListener('pointerleave', () => {
      hoverConnectionId = null;
      record.visible.classList.remove('is-hovered');
      scheduleHideLineDeleteButton();
    });

    hit.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      selectedConnectionId = connection.id;
      clearNodeSelection();
      syncConnectionSelection();
      showLineDeleteButton(connection.id);
    });

    return record;
  }

  function syncConnectionSelection() {
    connectionEls.forEach((record, id) => {
      record.visible.classList.toggle('is-selected', id === selectedConnectionId);
    });
  }

  function drawConnections() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;

    customMesh.setAttribute('viewBox', `0 0 ${width} ${height}`);

    connections.forEach(connection => {
      const from = portCenter(connection.from);
      const to = portCenter(connection.to);
      if (!from || !to) return;
      const points = curvePoints(from, to, connection.from.port, connection.to.port, connection.lane);
      const d = curvePath(points);
      const record = ensureConnectionElement(connection);
      record.visible.setAttribute('d', d);
      record.hit.setAttribute('d', d);

      if (hoverConnectionId === connection.id || selectedConnectionId === connection.id) {
        const center = cubicPoint(points, .5);
        positionLineDeleteButton(center);
      }
    });

    [...connectionEls.keys()].forEach(id => {
      if (connections.some(connection => connection.id === id)) return;
      connectionEls.get(id)?.group.remove();
      connectionEls.delete(id);
    });

    syncConnectionSelection();
  }

  function shouldContinuouslyDrawConnections() {
    if (!connections.length || document.hidden) return false;
    if (connectionState || dragState?.moved) return true;
    if (reducedMotion.matches || window.matchMedia('(max-width: 760px)').matches) return false;
    return connections.some(connection => (
      connection.from.ref.startsWith('orig:') || connection.to.ref.startsWith('orig:')
    ));
  }

  function connectionLoop() {
    connectionRaf = 0;
    drawConnections();
    if (shouldContinuouslyDrawConnections()) {
      connectionRaf = requestAnimationFrame(connectionLoop);
    }
  }

  function scheduleConnectionLoop() {
    if (connectionRaf) return;
    connectionRaf = requestAnimationFrame(connectionLoop);
  }

  function pulseConnectionPort(endpoint) {
    const port = endpointPort(endpoint.ref, endpoint.port);
    if (!port || reducedMotion.matches) return;
    port.classList.remove('is-connect-pulse');
    void port.offsetWidth;
    port.classList.add('is-connect-pulse');
    window.setTimeout(() => port.classList.remove('is-connect-pulse'), 420);
  }

  function createConnection(from, to, { persist = true, sound = true, lane = null } = {}) {
    if (!from || !to || !parseEndpoint(from.ref) || !parseEndpoint(to.ref)) return null;
    if (!normalizePortId(from.port) || !normalizePortId(to.port)) return null;
    if (from.ref === to.ref || connections.length >= MAX_CONNECTIONS) return null;

    const requestedLane = lane === null || lane === undefined ? NaN : Number(lane);

    const connection = {
      id: uid('conn'),
      from: { ref: from.ref, port: normalizePortId(from.port) },
      to: { ref: to.ref, port: normalizePortId(to.port) },
      lane: Number.isFinite(requestedLane) ? requestedLane : nextConnectionLane(from, to)
    };
    connections.push(connection);
    const record = ensureConnectionElement(connection);
    drawConnections();
    scheduleConnectionLoop();
    if (persist) saveState();
    if (!reducedMotion.matches) {
      record.visible.animate(
        [
          { strokeDasharray: '1', strokeDashoffset: '1', opacity: .42 },
          { strokeDasharray: '1', strokeDashoffset: '0', opacity: 1 }
        ],
        { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }
    pulseConnectionPort(connection.from);
    pulseConnectionPort(connection.to);
    window.DeushimaGrid?.wake?.(220);
    if (sound) playSfx('link', { element: endpointElement(to.ref), gainScale: .9 });
    return connection;
  }

  function removeConnection(id, { persist = true, sound = true } = {}) {
    const index = connections.findIndex(connection => connection.id === id);
    if (index < 0) return false;
    const connection = connections[index];
    const soundElement = endpointElement(connection.to.ref);
    connections.splice(index, 1);
    connectionEls.get(id)?.group.remove();
    connectionEls.delete(id);
    if (selectedConnectionId === id) selectedConnectionId = null;
    if (hoverConnectionId === id) hoverConnectionId = null;
    hideLineDeleteButton();
    drawConnections();
    if (persist) saveState();
    if (sound) playSfx('disconnect', { element: soundElement, gainScale: .9 });
    return true;
  }

  function nearestCompatiblePort(clientX, clientY, sourceEndpoint) {
    let best = null;
    const ports = [
      ...stage.querySelectorAll('[data-custom-port]'),
      ...stage.querySelectorAll('[data-node-port]')
    ];

    ports.forEach(port => {
      const endpoint = endpointFromPort(port);
      if (!endpoint || endpoint.ref === sourceEndpoint.ref) return;
      const point = portClientCenter(endpoint);
      if (!point) return;
      const distance = Math.hypot(clientX - point.x, clientY - point.y);
      port.classList.toggle('is-near', distance <= PORT_RADIUS);

      if (distance <= PORT_RADIUS && (!best || distance < best.distance)) {
        best = { port, endpoint, distance };
      }
    });

    return best;
  }

  function clearCompatiblePorts() {
    stage.querySelectorAll('[data-custom-port].is-near, [data-node-port].is-near')
      .forEach(port => port.classList.remove('is-near'));
  }

  function beginConnection(event, sourcePort) {
    if (event.button !== undefined && event.button !== 0) return;
    const source = endpointFromPort(sourcePort);
    if (!source || !parseEndpoint(source.ref)) return;
    event.preventDefault();
    event.stopPropagation();
    const parsed = parseEndpoint(source.ref);
    if (parsed?.kind === 'user') {
      const model = models.get(parsed.id);
      if (model) selectNode(model);
    }

    const point = portCenter(source);
    if (!point) return;

    connectionState = {
      pointerId: event.pointerId,
      source,
      sourcePort,
      pointerX: point.x,
      pointerY: point.y,
      target: null
    };
    sourcePort.classList.add('is-active');
    stage.classList.add('is-editing');
    try { sourcePort.setPointerCapture?.(event.pointerId); } catch {}
    drawConnectionPreview();
    scheduleConnectionLoop();
  }

  function drawConnectionPreview() {
    if (!connectionState) {
      previewPath.setAttribute('d', '');
      return;
    }
    const from = portCenter(connectionState.source);
    if (!from) return;
    const targetEndpoint = connectionState.target?.endpoint || null;
    const to = targetEndpoint
      ? portCenter(targetEndpoint)
      : { x: connectionState.pointerX, y: connectionState.pointerY };
    if (!to) return;
    const toPort = targetEndpoint?.port || (to.x >= from.x ? 'left' : 'right');
    previewPath.setAttribute('d', curvePath(curvePoints(from, to, connectionState.source.port, toPort, 0)));
  }

  function moveConnection(event) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;
    event.preventDefault();
    const point = stageLocalPointFromClient(event.clientX, event.clientY);
    connectionState.pointerX = point.x;
    connectionState.pointerY = point.y;
    connectionState.target = nearestCompatiblePort(event.clientX, event.clientY, connectionState.source);
    drawConnectionPreview();
  }

  function endConnection(event, { commit = true } = {}) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;

    const state = connectionState;
    const target = commit
      ? nearestCompatiblePort(event.clientX, event.clientY, state.source) || state.target
      : null;

    connectionState = null;
    try {
      if (state.sourcePort.hasPointerCapture?.(event.pointerId)) state.sourcePort.releasePointerCapture(event.pointerId);
    } catch {}
    state.sourcePort.classList.remove('is-active');
    stage.classList.remove('is-editing');
    clearCompatiblePorts();
    previewPath.setAttribute('d', '');

    if (target?.endpoint) {
      createConnection(state.source, target.endpoint, { persist: true, sound: true });
    } else if (commit) {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
      if (canOpenCanvasMenuAt(dropTarget, event.clientX, event.clientY)) {
        openCanvasMenu(event.clientX, event.clientY, stage);
      }
    }
    scheduleConnectionLoop();
  }

  function cancelConnectionGesture() {
    if (!connectionState) return;
    const state = connectionState;
    connectionState = null;
    try {
      if (state.sourcePort.hasPointerCapture?.(state.pointerId)) {
        state.sourcePort.releasePointerCapture(state.pointerId);
      }
    } catch {}
    state.sourcePort.classList.remove('is-active');
    stage.classList.remove('is-editing');
    clearCompatiblePorts();
    previewPath.setAttribute('d', '');
    scheduleConnectionLoop();
  }

  function positionLineDeleteButton(point) {
    lineDeleteButton.style.left = `${point.x.toFixed(2)}px`;
    lineDeleteButton.style.top = `${point.y.toFixed(2)}px`;
    lineDeleteButton.classList.add('is-visible');
  }

  function showLineDeleteButton(id) {
    const connection = connections.find(item => item.id === id);
    if (!connection) return;
    window.clearTimeout(lineDeleteHideTimer);
    const from = portCenter(connection.from);
    const to = portCenter(connection.to);
    if (!from || !to) return;
    positionLineDeleteButton(cubicPoint(curvePoints(
      from,
      to,
      connection.from.port,
      connection.to.port,
      connection.lane
    ), .5));
    lineDeleteButton.dataset.connectionId = id;
  }

  function scheduleHideLineDeleteButton() {
    window.clearTimeout(lineDeleteHideTimer);
    lineDeleteHideTimer = window.setTimeout(() => {
      if (lineDeleteButton.matches(':hover') || selectedConnectionId) return;
      hideLineDeleteButton();
    }, 130);
  }

  function hideLineDeleteButton() {
    delete lineDeleteButton.dataset.connectionId;
    lineDeleteButton.classList.remove('is-visible');
  }

  lineDeleteButton.addEventListener('pointerenter', () => window.clearTimeout(lineDeleteHideTimer));
  lineDeleteButton.addEventListener('pointerleave', scheduleHideLineDeleteButton);
  lineDeleteButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const id = lineDeleteButton.dataset.connectionId;
    if (id) removeConnection(id, { persist: true, sound: true });
  });

  function moveNodeDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const model = models.get(dragState.id);
    if (!model) return;

    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.moved && distance < DRAG_THRESHOLD) return;

    if (!dragState.moved) {
      dragState.moved = true;
      model.preserveWorldPosition = false;
      model.el.classList.add('is-dragging');
      playSfx('pickup', { element: model.el, eventTimestamp: event.timeStamp });
    }

    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(8, now - dragState.lastTime);
    const deltaX = event.clientX - dragState.lastX;
    const deltaY = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    dragState.lastTime = now;
    const worldPoint = worldPointFromClient(event.clientX, event.clientY);
    model.x = worldPoint.x - dragState.offsetX;
    model.y = worldPoint.y - dragState.offsetY;
    renderModel(model);
    window.DeushimaHeroCamera?.setAutoPanPointer?.(event.clientX, event.clientY, true);

    const step = window.DeushimaSFX?.config?.performance?.dragStepMs || 70;
    if (now - dragState.lastSoundAt >= step) {
      const speed = Math.hypot(deltaX, deltaY) / dt * 1000;
      const degree = -5 + clamp(Math.round((speed / 1650) * 4), 0, 4);
      playSfx('drag', {
        element: model.el,
        degree,
        eventTimestamp: event.timeStamp,
        gainScale: .88
      });
      dragState.lastSoundAt = now;
    }

    drawConnections();
    window.DeushimaGrid?.wake?.(520);
  }

  function endNodeDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const model = models.get(dragState.id);
    const moved = dragState.moved;
    model?.el.releasePointerCapture?.(event.pointerId);
    model?.el.classList.remove('is-dragging');
    dragState = null;

    if (moved && model) {
      renderModel(model);
      saveState();
      playSfx('drop', { element: model.el, eventTimestamp: event.timeStamp });
      drawConnections();
      window.DeushimaGrid?.wake?.(500);
    }
    window.DeushimaHeroCamera?.clearAutoPan?.();
  }

  function serializeNodeModel(model) {
    const base = {
      id: model.id,
      type: model.type,
      note: model.note,
      x: Number(model.x.toFixed(6)),
      y: Number(model.y.toFixed(6)),
      z: model.z
    };
    if (model.type === 'text') {
      return {
        ...base,
        text: safeText(model.text),
        html: sanitizeRichTextHtml(model.html, model.text)
      };
    }
    if (model.type === 'link' || model.type === 'instagram' || model.type === 'youtube') {
      return { ...base, url: model.url };
    }
    const mediaHeight = Number(model.height);
    return {
      ...base,
      url: model.url,
      mediaType: model.mediaType,
      width: Number(model.width) || 300,
      height: model.height != null && Number.isFinite(mediaHeight) && mediaHeight > 0 ? mediaHeight : null,
      aspectRatio: Number(model.aspectRatio) || 1.35
    };
  }

  function serializeConnections() {
    return connections.map(connection => ({
      id: connection.id,
      from: { ...connection.from },
      to: { ...connection.to },
      lane: connection.lane
    }));
  }

  function serializeCameraState() {
    const state = cameraApi()?.getState?.();
    if (!state) return null;
    const cx = Number(state.cx);
    const cy = Number(state.cy);
    const scale = Number(state.scale);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(scale)) return null;
    return {
      cx: Number(cx.toFixed(6)),
      cy: Number(cy.toFixed(6)),
      scale: Number(scale.toFixed(6))
    };
  }

  function serializeOriginalWorkspaceState() {
    const state = window.DeushimaHeroNodes?.getWorkspaceState?.();
    if (!state) return null;
    return {
      positions: (Array.isArray(state.positions) ? state.positions : []).map(position => ({
        id: String(position.id || ''),
        x: Number(Number(position.x).toFixed(4)),
        y: Number(Number(position.y).toFixed(4))
      })),
      edges: (Array.isArray(state.edges) ? state.edges : []).map(edge => [String(edge?.[0] || ''), String(edge?.[1] || '')])
    };
  }

  function serializeStatePayload() {
    const cameraState = cameraApi()?.getState?.();
    return {
      version: STORAGE_VERSION,
      viewport: cameraState ? {
        width: Number(cameraState.width) || 0,
        height: Number(cameraState.height) || 0
      } : null,
      nextNote: nextNoteNumber,
      zCounter,
      nodes: [...models.values()].map(serializeNodeModel),
      connections: serializeConnections(),
      originalNodes: serializeOriginalWorkspaceState(),
      camera: serializeCameraState()
    };
  }

  function validWorkspaceId(value, maxLength = MAX_ID_LENGTH) {
    return typeof value === 'string'
      && value.length >= 1
      && value.length <= maxLength
      && /^[A-Za-z0-9_-]+$/.test(value);
  }

  function validWorldCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= MAX_WORLD_COORDINATE;
  }

  function validateCameraState(rawCamera, { strict = false } = {}) {
    if (rawCamera == null) return strict ? null : undefined;
    if (typeof rawCamera !== 'object' || Array.isArray(rawCamera)) return null;
    if (strict && (typeof rawCamera.cx !== 'number' || typeof rawCamera.cy !== 'number' || typeof rawCamera.scale !== 'number')) return null;
    const cx = Number(rawCamera.cx);
    const cy = Number(rawCamera.cy);
    const scale = Number(rawCamera.scale);
    const config = cameraApi()?.config || {};
    const minScale = Number.isFinite(Number(config.minScale)) ? Number(config.minScale) : .4;
    const maxScale = Number.isFinite(Number(config.maxScale)) ? Number(config.maxScale) : 2.5;
    if (!validWorldCoordinate(cx) || !validWorldCoordinate(cy) || !Number.isFinite(scale)) return null;
    if (scale < minScale || scale > maxScale) return null;
    return { cx, cy, scale };
  }

  function validateOriginalWorkspaceState(rawOriginals, { strict = false } = {}) {
    if (rawOriginals == null) return strict ? null : undefined;
    if (typeof rawOriginals !== 'object' || Array.isArray(rawOriginals)) return null;
    if (!Array.isArray(rawOriginals.positions) || !Array.isArray(rawOriginals.edges)) return null;
    if (rawOriginals.positions.length > originalNames.size || rawOriginals.edges.length > 32) return null;

    const positions = [];
    const seenPositions = new Set();
    for (const rawPosition of rawOriginals.positions) {
      if (strict && (!rawPosition || typeof rawPosition !== 'object' || typeof rawPosition.x !== 'number' || typeof rawPosition.y !== 'number')) return null;
      const id = rawPosition?.id;
      const x = Number(rawPosition?.x);
      const y = Number(rawPosition?.y);
      if (!originalNames.has(id) || seenPositions.has(id) || !validWorldCoordinate(x) || !validWorldCoordinate(y)) {
        if (strict) return null;
        continue;
      }
      seenPositions.add(id);
      positions.push({ id, x, y });
    }

    const edges = [];
    const seenEdges = new Set();
    for (const rawEdge of rawOriginals.edges) {
      if (!Array.isArray(rawEdge) || rawEdge.length !== 2) {
        if (strict) return null;
        continue;
      }
      const [from, to] = rawEdge;
      if (!originalNames.has(from) || !originalNames.has(to) || from === to) {
        if (strict) return null;
        continue;
      }
      const key = [from, to].sort().join('::');
      if (seenEdges.has(key)) {
        if (strict) return null;
        continue;
      }
      seenEdges.add(key);
      edges.push([from, to]);
    }
    return { positions, edges };
  }

  function validateConnections(rawConnections, nodes, { strict = false } = {}) {
    if (!Array.isArray(rawConnections)) return strict ? null : [];
    if (strict && rawConnections.length > MAX_CONNECTIONS) return null;
    const validRefs = new Set([
      ...nodes.map(node => endpointRefForUser(node.id)),
      ...[...originalNames].map(endpointRefForOriginal)
    ]);

    const restoredConnections = [];
    const ids = new Set();

    for (const rawConnection of rawConnections.slice(0, MAX_CONNECTIONS)) {
      if (!rawConnection || typeof rawConnection !== 'object' || Array.isArray(rawConnection)) {
        if (strict) return null;
        continue;
      }
      if (strict && (
        typeof rawConnection.id !== 'string'
        || typeof rawConnection.from !== 'object'
        || rawConnection.from === null
        || Array.isArray(rawConnection.from)
        || typeof rawConnection.from.ref !== 'string'
        || typeof rawConnection.to !== 'object'
        || rawConnection.to === null
        || Array.isArray(rawConnection.to)
        || typeof rawConnection.to.ref !== 'string'
      )) return null;
      const from = typeof rawConnection.from === 'string'
        ? { ref: rawConnection.from, port: 'right' }
        : { ref: String(rawConnection.from?.ref || ''), port: normalizePortId(rawConnection.from?.port) };
      const to = typeof rawConnection.to === 'string'
        ? { ref: rawConnection.to, port: 'left' }
        : { ref: String(rawConnection.to?.ref || ''), port: normalizePortId(rawConnection.to?.port) };
      if (strict && (!PORT_IDS.includes(rawConnection.from?.port) || !PORT_IDS.includes(rawConnection.to?.port))) return null;
      const laneNumber = Number(rawConnection.lane);
      if (strict && typeof rawConnection.lane !== 'number') return null;
      const validLane = Number.isInteger(laneNumber) && laneNumber >= -MAX_CONNECTIONS && laneNumber <= MAX_CONNECTIONS;
      if (
        !validRefs.has(from.ref)
        || !validRefs.has(to.ref)
        || from.ref === to.ref
        || !from.port
        || !to.port
        || (strict && !validLane)
      ) {
        if (strict) return null;
        continue;
      }
      if (strict && !validWorkspaceId(rawConnection.id, MAX_CONNECTION_ID_LENGTH)) return null;
      let id = typeof rawConnection.id === 'string' && rawConnection.id.length <= MAX_CONNECTION_ID_LENGTH
        ? rawConnection.id
        : uid('conn');
      if (ids.has(id)) {
        if (strict) return null;
        id = uid('conn');
      }
      ids.add(id);
      restoredConnections.push({
        id,
        from,
        to,
        lane: validLane ? laneNumber : clamp(Math.trunc(laneNumber) || 0, -MAX_CONNECTIONS, MAX_CONNECTIONS)
      });
    }

    return restoredConnections;
  }

  function validateViewport(rawViewport, { strict = false } = {}) {
    if (rawViewport == null) return strict ? null : undefined;
    if (typeof rawViewport !== 'object' || Array.isArray(rawViewport)) return null;
    if (strict && (typeof rawViewport.width !== 'number' || typeof rawViewport.height !== 'number')) return null;
    const width = Number(rawViewport.width);
    const height = Number(rawViewport.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 100000 || height > 100000) {
      return null;
    }
    return { width, height };
  }

  function validateV3State(parsed, { strict = false } = {}) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.nodes)) return null;
    if (strict && parsed.nodes.length > MAX_NODES) return null;
    if (strict && !Array.isArray(parsed.connections)) return null;
    const nodes = [];
    const ids = new Set();

    for (const rawNode of parsed.nodes.slice(0, MAX_NODES)) {
      if (
        !rawNode
        || typeof rawNode !== 'object'
        || Array.isArray(rawNode)
        || !['text', 'link', 'media', 'instagram', 'youtube'].includes(rawNode.type)
      ) {
        if (strict) return null;
        continue;
      }
      const id = typeof rawNode.id === 'string' && rawNode.id.length <= MAX_ID_LENGTH ? rawNode.id : null;
      if (!id || ids.has(id) || (strict && !validWorkspaceId(id))) {
        if (strict) return null;
        continue;
      }
      const x = Number(rawNode.x);
      const y = Number(rawNode.y);
      if (strict && (typeof rawNode.x !== 'number' || typeof rawNode.y !== 'number')) return null;
      if (!validWorldCoordinate(x) || !validWorldCoordinate(y)) {
        if (strict) return null;
        continue;
      }
      const noteNumber = Number(rawNode.note);
      const zNumber = Number(rawNode.z);
      if (strict && (typeof rawNode.note !== 'number' || typeof rawNode.z !== 'number')) return null;
      if (strict && (
        !Number.isInteger(noteNumber) || noteNumber < 1 || noteNumber > 999
        || !Number.isInteger(zNumber) || zNumber < 1 || zNumber > 9999
      )) return null;
      ids.add(id);
      const base = {
        id,
        type: rawNode.type,
        note: strict ? noteNumber : clamp(Math.trunc(noteNumber) || nodes.length + 1, 1, 999),
        x,
        y,
        z: strict ? zNumber : clamp(Math.trunc(zNumber) || nodes.length + 1, 1, 9999)
      };

      if (rawNode.type === 'text') {
        if (strict && (
          typeof rawNode.text !== 'string'
          || rawNode.text.length > MAX_TEXT_LENGTH
          || (rawNode.html !== undefined && (typeof rawNode.html !== 'string' || rawNode.html.length > MAX_RICH_TEXT_HTML_LENGTH))
        )) return null;
        const html = sanitizeRichTextHtml(rawNode.html, rawNode.text);
        nodes.push({ ...base, text: richHtmlText(html) || safeText(rawNode.text), html });
        continue;
      }

      if (strict && (typeof rawNode.url !== 'string' || rawNode.url.length < 1 || rawNode.url.length > MAX_URL_LENGTH)) return null;
      const url = normalizeHttpUrl(rawNode.url);
      if (!url) {
        if (strict) return null;
        continue;
      }
      if (rawNode.type === 'link') {
        nodes.push({ ...base, url });
        continue;
      }

      if (rawNode.type === 'instagram' || rawNode.type === 'youtube') {
        const parsedEmbed = parseEmbedUrl(rawNode.type, url);
        if (!parsedEmbed) {
          if (strict) return null;
          continue;
        }
        nodes.push({ ...base, url: parsedEmbed.url });
        continue;
      }

      const widthNumber = Number(rawNode.width);
      const heightNumber = rawNode.height == null ? null : Number(rawNode.height);
      const aspectNumber = Number(rawNode.aspectRatio);
      const mediaType = ['image', 'video'].includes(rawNode.mediaType)
        ? rawNode.mediaType
        : inferMediaTypeFromUrl(url);
      if (strict && (
        typeof rawNode.mediaType !== 'string' || !['image', 'video'].includes(rawNode.mediaType)
        || typeof rawNode.width !== 'number'
        || (rawNode.height !== null && typeof rawNode.height !== 'number')
        || typeof rawNode.aspectRatio !== 'number'
        || !Number.isFinite(widthNumber) || widthNumber < 220 || widthNumber > 420
        || (heightNumber !== null && (!Number.isFinite(heightNumber) || heightNumber <= 0 || heightNumber > 10000))
        || !Number.isFinite(aspectNumber) || aspectNumber < .35 || aspectNumber > 3.5
      )) return null;

      nodes.push({
        ...base,
        url,
        mediaType,
        width: strict ? widthNumber : clamp(widthNumber || 300, 220, 420),
        height: strict ? heightNumber : (Number.isFinite(heightNumber) ? heightNumber : null),
        aspectRatio: strict ? aspectNumber : clamp(aspectNumber || 1.35, .35, 3.5)
      });
    }

    const restoredConnections = validateConnections(parsed.connections, nodes, { strict });
    if (restoredConnections === null) return null;
    const camera = validateCameraState(parsed.camera, { strict });
    if (camera === null) return null;
    const originalNodesState = validateOriginalWorkspaceState(parsed.originalNodes, { strict });
    if (originalNodesState === null) return null;
    const viewport = validateViewport(parsed.viewport, { strict });
    if (viewport === null) return null;
    const nextNoteValue = Number(parsed.nextNote);
    const zCounterValue = Number(parsed.zCounter);
    if (strict && (typeof parsed.nextNote !== 'number' || typeof parsed.zCounter !== 'number')) return null;
    if (strict && (
      !Number.isInteger(nextNoteValue) || nextNoteValue < 1 || nextNoteValue > 9999
      || !Number.isInteger(zCounterValue) || zCounterValue < 1 || zCounterValue > 9999
      || nextNoteValue <= Math.max(0, ...nodes.filter(node => node.type === 'text').map(node => node.note))
      || zCounterValue < Math.max(0, ...nodes.map(node => node.z))
    )) return null;

    return {
      nodes,
      connections: restoredConnections,
      nextNote: strict ? nextNoteValue : clamp(Math.trunc(nextNoteValue) || nodes.length + 1, 1, 9999),
      zCounter: strict ? zCounterValue : clamp(Math.trunc(zCounterValue) || nodes.length + 1, 1, 9999),
      viewport,
      camera,
      originalNodes: originalNodesState,
      migrated: false
    };
  }

  function migrateV2State(parsed) {
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.nodes)) return null;
    const nodes = [];
    const ids = new Set();
    for (const rawNode of parsed.nodes.slice(0, MAX_NODES)) {
      if (!rawNode || rawNode.type !== 'text') continue;
      const id = typeof rawNode.id === 'string' && rawNode.id.length <= 90 ? rawNode.id : null;
      if (!id || ids.has(id)) continue;
      const x = Number(rawNode.x);
      const y = Number(rawNode.y);
      if (!validWorldCoordinate(x) || !validWorldCoordinate(y)) continue;
      ids.add(id);
      nodes.push({
        id,
        type: 'text',
        note: clamp(Math.trunc(Number(rawNode.note)) || nodes.length + 1, 1, 999),
        text: safeText(rawNode.text),
        x,
        y,
        z: clamp(Math.trunc(Number(rawNode.z)) || nodes.length + 1, 1, 9999)
      });
    }

    return {
      nodes,
      connections: validateConnections(parsed.connections, nodes),
      nextNote: clamp(Math.trunc(Number(parsed.nextNote)) || nodes.length + 1, 1, 9999),
      zCounter: clamp(Math.trunc(Number(parsed.zCounter)) || nodes.length + 1, 1, 9999),
      migrated: true,
      migratedFrom: 2
    };
  }

  function migrateLegacyState(parsed) {
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes)) return null;
    const nodes = [];
    const ids = new Set();
    const origin = cameraApi()?.getStageOrigin?.() || { x: 0, y: 0 };
    const stageWidth = Math.max(1, stage.clientWidth);
    const stageHeight = Math.max(1, stage.clientHeight);

    for (const rawNode of parsed.nodes.slice(0, MAX_NODES)) {
      if (!rawNode || rawNode.type !== 'text') continue;
      const id = typeof rawNode.id === 'string' && rawNode.id.length <= 90 ? rawNode.id : null;
      if (!id || ids.has(id)) continue;
      const nx = Number(rawNode.x);
      const ny = Number(rawNode.y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      ids.add(id);
      nodes.push({
        id,
        type: 'text',
        note: clamp(Math.trunc(Number(rawNode.note)) || nodes.length + 1, 1, 999),
        text: safeText(rawNode.text),
        x: origin.x + nx * stageWidth,
        y: origin.y + ny * stageHeight,
        z: clamp(Math.trunc(Number(rawNode.z)) || nodes.length + 1, 1, 9999)
      });
    }

    return {
      nodes,
      connections: validateConnections(parsed.connections, nodes),
      nextNote: clamp(Math.trunc(Number(parsed.nextNote)) || nodes.length + 1, 1, 9999),
      zCounter: clamp(Math.trunc(Number(parsed.zCounter)) || nodes.length + 1, 1, 9999),
      migrated: true,
      migratedFrom: 1
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const valid = validateV3State(parsed);
        if (valid) return valid;
      }
    } catch {}

    try {
      const previousRaw = localStorage.getItem(PREVIOUS_STORAGE_KEY);
      if (previousRaw) {
        const previous = JSON.parse(previousRaw);
        const migrated = migrateV2State(previous);
        if (migrated) return migrated;
      }
    } catch {}

    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) return null;
      const legacy = JSON.parse(legacyRaw);
      return migrateLegacyState(legacy);
    } catch {
      return null;
    }
  }

  function saveState() {
    const cameraState = cameraApi()?.getState?.();
    const payload = {
      version: STORAGE_VERSION,
      viewport: cameraState ? { width: cameraState.width, height: cameraState.height } : null,
      nextNote: nextNoteNumber,
      zCounter,
      nodes: [...models.values()].map(model => {
        const base = {
          id: model.id,
          type: model.type,
          note: model.note,
          x: Number(model.x.toFixed(6)),
          y: Number(model.y.toFixed(6)),
          z: model.z
        };
        if (model.type === 'text') return { ...base, text: safeText(model.text) };
        if (model.type === 'link' || model.type === 'instagram' || model.type === 'youtube') {
          return { ...base, url: model.url };
        }
        return {
          ...base,
          url: model.url,
          mediaType: model.mediaType,
          width: Number(model.width) || 300,
          height: Number.isFinite(Number(model.height)) ? Number(model.height) : null,
          aspectRatio: Number(model.aspectRatio) || 1.35
        };
      }),
      connections: connections.map(connection => ({
        id: connection.id,
        from: { ...connection.from },
        to: { ...connection.to },
        lane: connection.lane
      }))
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleWorkspaceSave(delay = 160) {
    if (workspaceMutationDepth > 0) return;
    window.clearTimeout(cameraSaveTimer);
    cameraSaveTimer = window.setTimeout(() => {
      cameraSaveTimer = 0;
      if (workspaceMutationDepth === 0) saveState();
    }, delay);
  }

  function encodeBase64UrlUtf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function decodeBase64UrlUtf8(value) {
    const encoded = String(value || '');
    if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid workspace code.');
    const padding = '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Workspace code is not valid UTF-8.');
    }
  }

  function workspaceEnvelopeFromState(state = serializeStatePayload()) {
    return {
      format: WORKSPACE_FORMAT,
      version: WORKSPACE_VERSION,
      state
    };
  }

  function exportWorkspaceCode() {
    const state = serializeStatePayload();
    if (!validateV3State(state, { strict: true })) {
      throw new Error('Workspace is not ready to export.');
    }
    const json = JSON.stringify(workspaceEnvelopeFromState(state));
    const code = `${WORKSPACE_CODE_PREFIX}${encodeBase64UrlUtf8(json)}`;
    if (code.length > MAX_WORKSPACE_CODE_LENGTH) throw new Error('Workspace is too large to export.');
    return code;
  }

  function decodeWorkspaceCode(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code || code.length > MAX_WORKSPACE_CODE_LENGTH || !code.startsWith(WORKSPACE_CODE_PREFIX)) {
      throw new Error('Use a valid DEUSHIMA1 workspace code.');
    }
    let envelope;
    try {
      envelope = JSON.parse(decodeBase64UrlUtf8(code.slice(WORKSPACE_CODE_PREFIX.length)));
    } catch (error) {
      if (error instanceof Error && /workspace|UTF-8/i.test(error.message)) throw error;
      throw new Error('Workspace code contains invalid JSON.');
    }
    if (
      !envelope
      || typeof envelope !== 'object'
      || Array.isArray(envelope)
      || envelope.format !== WORKSPACE_FORMAT
      || envelope.version !== WORKSPACE_VERSION
    ) {
      throw new Error('Unsupported workspace format or version.');
    }
    const validated = validateV3State(envelope.state, { strict: true });
    if (!validated) throw new Error('Workspace data failed validation.');
    return validated;
  }

  function clearWorkspaceRuntimeImmediate() {
    connectionState = null;
    dragState = null;
    editingNodeId = null;
    selectedNodeId = null;
    selectedConnectionId = null;
    hoverConnectionId = null;
    window.DeushimaHeroCamera?.clearAutoPan?.();
    previewPath.setAttribute('d', '');
    hideLineDeleteButton();
    originalNodes.forEach(node => {
      node.classList.remove('is-connect-target');
      node.querySelectorAll('.hero-node__port').forEach(port => {
        port.classList.remove('is-active', 'is-near', 'is-connect-pulse');
      });
    });
    connectionEls.forEach(record => record.group?.remove());
    connectionEls.clear();
    connections = [];
    models.forEach(model => {
      if (model.type === 'media') model.mediaLoadToken = (model.mediaLoadToken || 0) + 1;
      if (model.mediaElement instanceof HTMLVideoElement) {
        mediaVisibilityObserver?.unobserve(model.mediaElement);
        model.mediaElement.pause();
      }
      model.el?.remove();
    });
    models.clear();
  }

  function applyWorkspaceStatePayload(payload, { persist = true } = {}) {
    workspaceMutationDepth += 1;
    try {
      clearWorkspaceRuntimeImmediate();

      if (payload.camera) {
        const camera = cameraApi();
        if (!camera?.setState?.(payload.camera, { immediate: true, preserveOnResize: true })) {
          throw new Error('Unable to restore camera state.');
        }
      }

      if (payload.originalNodes) {
        const originalApi = window.DeushimaHeroNodes;
        if (!originalApi?.applyWorkspaceState || originalApi.applyWorkspaceState(payload.originalNodes, { persist: false }) === false) {
          throw new Error('Unable to restore original node layout.');
        }
      }

      nextNoteNumber = payload.nextNote;
      zCounter = payload.zCounter;

      for (const data of payload.nodes) {
        const shared = {
          ...data,
          animate: false,
          persist: false,
          sound: false,
          select: false,
          preserveWorldPosition: true
        };
        let created = null;
        if (data.type === 'link') created = createLinkNode(shared);
        else if (data.type === 'media') created = createMediaNode(shared);
        else if (data.type === 'instagram' || data.type === 'youtube') {
          created = createEmbedNode({ ...shared, type: data.type });
        } else created = createTextNode({ ...shared, focusEditor: false });
        if (!created) throw new Error(`Unable to restore node ${data.id}.`);
      }

      nextNoteNumber = payload.nextNote;
      zCounter = payload.zCounter;
      connections = payload.connections.map(connection => ({
        ...connection,
        from: { ...connection.from },
        to: { ...connection.to }
      }));
      connections.forEach(ensureConnectionElement);
      drawConnections();
      scheduleConnectionLoop();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(700);
    } finally {
      workspaceMutationDepth = Math.max(0, workspaceMutationDepth - 1);
    }

    if (persist && !saveState()) throw new Error('Unable to persist workspace.');
    return true;
  }

  function importWorkspaceCode(rawCode) {
    const incoming = decodeWorkspaceCode(rawCode);
    const backup = serializeStatePayload();
    try {
      applyWorkspaceStatePayload(incoming, { persist: true });
    } catch (error) {
      try {
        applyWorkspaceStatePayload(backup, { persist: true });
      } catch {}
      throw error;
    }
    return true;
  }

  function restoreState() {
    const saved = readState();
    if (!saved) {
      restoreHintState();
      return null;
    }

    nextNoteNumber = saved.nextNote;
    zCounter = saved.zCounter;

    saved.nodes.forEach(data => {
      if (data.type === 'link') {
        createLinkNode({ ...data, animate: false, persist: false, sound: false, select: false });
        return;
      }
      if (data.type === 'media') {
        createMediaNode({ ...data, animate: false, persist: false, sound: false, select: false });
        return;
      }
      if (data.type === 'instagram' || data.type === 'youtube') {
        createEmbedNode({ ...data, animate: false, persist: false, sound: false, select: false });
        return;
      }
      createTextNode({ ...data, animate: false, focusEditor: false, persist: false, sound: false, select: false });
    });

    connections = saved.connections;
    connections.forEach(ensureConnectionElement);

    if (saved.migrated) {
      saveState();
      try {
        if (saved.migratedFrom === 2) localStorage.removeItem(PREVIOUS_STORAGE_KEY);
        if (saved.migratedFrom === 1) localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}
    }

    restoreHintState();
    requestAnimationFrame(() => {
      models.forEach(renderModel);
      drawConnections();
      scheduleConnectionLoop();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(800);
    });
    return saved;
  }

  function clampAllNodesAndSave(persist = true) {
    let changed = false;
    models.forEach(model => {
      changed = clampModel(model) || changed;
      renderModel(model);
    });
    drawConnections();
    if (changed && persist) saveState();
  }

  function menuItem({ label, icon, action, disabled = false, className = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hero-custom-node-context__item${className ? ` ${className}` : ''}`;
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    if (disabled) button.tabIndex = -1;

    const iconEl = document.createElement('span');
    iconEl.className = 'hero-custom-node-context__icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'hero-custom-node-context__label';
    labelEl.textContent = label;

    button.append(iconEl, labelEl);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.getAttribute('aria-disabled') === 'true') return;
      action?.(button, labelEl);
    });

    return button;
  }

  function separator() {
    const el = document.createElement('div');
    el.className = 'hero-custom-node-context__separator';
    el.setAttribute('role', 'separator');
    return el;
  }

  function looksLikeWebPageUrl(url) {
    try {
      return /\.(?:html?|php|aspx?|jsp)$/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  function openUrlForm(kind, { anchor = null, model = null } = {}) {
    const anchorSnapshot = anchor ? { ...anchor } : menuAnchor ? { ...menuAnchor } : model ? { worldX: model.x, worldY: model.y } : null;
    if (!anchorSnapshot) return;
    menuMode = 'url-form';
    menuUrlKind = kind;
    menuNodeId = model?.id || null;
    menuAnchor = anchorSnapshot;
    menu.classList.remove('is-workspace-form');
    menu.classList.add('is-url-form');
    menu.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = kind === 'media'
      ? 'Link image'
      : kind === 'instagram'
        ? 'Instagram'
        : kind === 'youtube'
          ? 'YouTube'
          : 'Link';
    const form = document.createElement('form');
    form.className = 'hero-custom-node-context__url-form';
    const input = document.createElement('input');
    input.className = 'hero-custom-node-context__url-input';
    input.type = 'url';
    input.inputMode = 'url';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'https://…';
    input.value = model?.url || '';
    input.setAttribute(
      'aria-label',
      kind === 'media'
        ? 'Direct media URL'
        : kind === 'instagram'
          ? 'Instagram URL'
          : kind === 'youtube'
            ? 'YouTube URL'
            : 'Link URL'
    );
    const message = document.createElement('div');
    message.className = 'hero-custom-node-context__url-message';
    message.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'hero-custom-node-context__url-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'hero-custom-node-context__url-button';
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'hero-custom-node-context__url-button is-primary';
    confirm.textContent = model ? 'Update' : 'Create';
    actions.append(cancel, confirm);
    form.append(input, message, actions);
    menu.append(heading, form);
    let mediaValidationAttempt = 0;
    cancel.addEventListener('click', event => {
      event.preventDefault();
      mediaValidationAttempt += 1;
      if (model) closeMenu(false);
      else {
        menu.classList.remove('is-url-form');
        menuMode = 'canvas';
        menuUrlKind = null;
        buildCanvasMenu();
        queueMicrotask(() => menuItems()[0]?.focus({ preventScroll: true }));
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (formSubmitting) return;
      const normalized = normalizeHttpUrl(input.value);
      if (!normalized) {
        message.textContent = 'Use a valid http:// or https:// URL.';
        input.focus({ preventScroll: true });
        return;
      }
      if (kind === 'media' && looksLikeWebPageUrl(normalized)) {
        message.textContent = "This URL doesn't appear to be direct media.";
        input.focus({ preventScroll: true });
        return;
      }

      if (kind === 'media') {
        const attempt = ++mediaValidationAttempt;
        const originalConfirmText = confirm.textContent;
        message.textContent = 'Loading media…';
        confirm.disabled = true;
        confirm.textContent = 'Loading…';
        input.setAttribute('aria-busy', 'true');

        const media = await probeDirectMedia(normalized);
        const formIsCurrent = (
          attempt === mediaValidationAttempt
          && form.isConnected
          && menu.contains(form)
          && menuMode === 'url-form'
        );
        if (!formIsCurrent) return;

        confirm.disabled = false;
        confirm.textContent = originalConfirmText;
        input.removeAttribute('aria-busy');

        if (!media) {
          message.textContent = 'Could not load this media URL.';
          input.focus({ preventScroll: true });
          return;
        }

        if (model?.type === 'media') {
          const previous = {
            url: model.url,
            mediaType: model.mediaType,
            aspectRatio: model.aspectRatio
          };
          model.url = normalized;
          model.mediaType = media.mediaType;
          model.aspectRatio = clamp(media.aspectRatio || model.aspectRatio || 1.35, .35, 3.5);
          model.mediaFrame?.style.setProperty('--media-aspect', model.aspectRatio.toFixed(5));
          model.mediaDomain.textContent = displayHost(normalized);
          model.mediaOpen.href = normalized;
          mountMedia(model);
          const loaded = await waitForMountedMedia(model);
          const mountIsCurrent = (
            attempt === mediaValidationAttempt
            && form.isConnected
            && menu.contains(form)
            && menuMode === 'url-form'
            && menuUrlKind === 'media'
          );
          if (!mountIsCurrent) return;
          if (!loaded) {
            model.url = previous.url;
            model.mediaType = previous.mediaType;
            model.aspectRatio = previous.aspectRatio;
            model.mediaFrame?.style.setProperty('--media-aspect', model.aspectRatio.toFixed(5));
            model.mediaDomain.textContent = displayHost(model.url);
            model.mediaOpen.href = model.url;
            mountMedia(model);
            message.textContent = 'Could not load this media URL.';
            input.focus({ preventScroll: true });
            return;
          }
          saveState();
          closeMenu(false);
          return;
        }

        const created = createMediaNode({
          x: anchorSnapshot.worldX,
          y: anchorSnapshot.worldY,
          url: normalized,
          mediaType: media.mediaType,
          aspectRatio: media.aspectRatio,
          animate: true,
          persist: false,
          sound: true,
          select: true
        });
        if (!created) {
          message.textContent = 'Unable to create this node.';
          return;
        }
        const loaded = await waitForMountedMedia(created);
        const mountIsCurrent = (
          attempt === mediaValidationAttempt
          && form.isConnected
          && menu.contains(form)
          && menuMode === 'url-form'
          && menuUrlKind === 'media'
        );
        if (!mountIsCurrent) return;
        if (!loaded) {
          deleteNode(created.id, { persist: false, sound: false });
          message.textContent = 'Could not load this media URL.';
          input.focus({ preventScroll: true });
          return;
        }
        saveState();
        closeMenu(false);
        markHintUsed();
        announce('Node created');
        return;
      }

      if (kind === 'instagram' || kind === 'youtube') {
        const parsed = parseEmbedUrl(kind, normalized);
        if (!parsed) {
          message.textContent = kind === 'instagram'
            ? 'Use a valid Instagram post or reel URL.'
            : 'Use a valid YouTube video, Shorts or youtu.be URL.';
          input.focus({ preventScroll: true });
          return;
        }

        if (model?.type === kind) {
          model.url = parsed.url;
          model.embedUrl = parsed.embedUrl;
          model.embedVariant = parsed.variant;
          model.aspectRatio = parsed.aspectRatio;
          model.embedFrame?.style.setProperty('--embed-aspect', model.aspectRatio.toFixed(5));
          if (model.embedElement) model.embedElement.src = model.embedUrl;
          if (model.embedDomain) model.embedDomain.textContent = kind === 'instagram' ? 'instagram.com' : 'youtube.com';
          if (model.embedOpen) model.embedOpen.href = model.url;
          saveState();
          closeMenu(false);
          return;
        }

        const created = createEmbedNode({
          type: kind,
          x: anchorSnapshot.worldX,
          y: anchorSnapshot.worldY,
          url: parsed.url,
          animate: true,
          persist: true,
          sound: true,
          select: true
        });
        if (!created) {
          message.textContent = 'Unable to create this node.';
          return;
        }
        closeMenu(false);
        markHintUsed();
        announce('Node created');
        return;
      }

      const created = createLinkNode({ x: anchorSnapshot.worldX, y: anchorSnapshot.worldY, url: normalized, animate: true, persist: true, sound: true, select: true });
      if (!created) {
        message.textContent = 'Unable to create this node.';
        return;
      }
      closeMenu(false);
      markHintUsed();
      announce('Node created');
    });
    if (!menuOpen) {
      const screen = cameraApi()?.worldToScreen?.(anchorSnapshot.worldX, anchorSnapshot.worldY);
      const heroRect = hero.getBoundingClientRect();
      placeMenu(screen?.x ?? heroRect.left + heroRect.width * .5, screen?.y ?? heroRect.top + heroRect.height * .5);
    }
    queueMicrotask(() => input.focus({ preventScroll: true }));
  }
  function openWorkspacePanel(mode) {
    const isSave = mode === 'save';
    const anchorSnapshot = menuAnchor ? { ...menuAnchor } : null;
    menuMode = isSave ? 'workspace-save' : 'workspace-import';
    menuUrlKind = null;
    menu.classList.remove('is-url-form');
    menu.classList.add('is-workspace-form');
    menu.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = isSave ? 'SAVE WORKSPACE' : 'IMPORT WORKSPACE';

    const form = document.createElement('form');
    form.className = 'hero-custom-node-context__workspace-form';
    const textarea = document.createElement('textarea');
    textarea.className = 'hero-custom-node-context__workspace-code';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textarea.wrap = 'off';
    textarea.maxLength = MAX_WORKSPACE_CODE_LENGTH;
    textarea.setAttribute('aria-label', isSave ? 'Workspace export code' : 'Workspace import code');
    const message = document.createElement('div');
    message.className = 'hero-custom-node-context__workspace-message';
    message.setAttribute('aria-live', 'polite');

    let exportReady = true;
    if (isSave) {
      textarea.readOnly = true;
      try {
        textarea.value = exportWorkspaceCode();
        message.textContent = 'Copy this code to restore the full workspace.';
      } catch (error) {
        exportReady = false;
        message.textContent = error instanceof Error ? error.message : 'Unable to export workspace.';
      }
    } else {
      textarea.placeholder = 'Paste workspace code...';
      message.textContent = '';
    }

    const actions = document.createElement('div');
    actions.className = 'hero-custom-node-context__workspace-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'hero-custom-node-context__url-button';
    back.textContent = isSave ? 'Back' : 'Cancel';
    const primary = document.createElement('button');
    primary.type = isSave ? 'button' : 'submit';
    primary.className = 'hero-custom-node-context__url-button is-primary';
    primary.textContent = isSave ? 'Copy code' : 'Import';
    primary.disabled = isSave && !exportReady;
    actions.append(back, primary);
    form.append(textarea, message, actions);
    menu.append(heading, form);

    const returnToCanvasMenu = () => {
      menu.classList.remove('is-workspace-form');
      menuMode = 'canvas';
      if (anchorSnapshot) menuAnchor = { ...anchorSnapshot };
      buildCanvasMenu();
      queueMicrotask(() => menuItems()[0]?.focus({ preventScroll: true }));
    };

    back.addEventListener('click', event => {
      event.preventDefault();
      returnToCanvasMenu();
    });

    if (isSave) {
      const copyCode = async ({ selectOnFailure = true } = {}) => {
        let copied = false;
        try {
          await navigator.clipboard.writeText(textarea.value);
          copied = true;
        } catch {
          if (selectOnFailure) {
            textarea.focus({ preventScroll: true });
            textarea.select();
          }
        }
        message.textContent = copied ? 'Workspace code copied' : 'Select the code and copy it manually.';
        return copied;
      };
      primary.addEventListener('click', async event => {
        event.preventDefault();
        await copyCode();
      });
      queueMicrotask(() => { void copyCode({ selectOnFailure: false }); });
    } else {
      let pendingImport = null;
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (pendingImport) {
          const backup = serializeStatePayload();
          try {
            applyWorkspaceStatePayload(pendingImport, { persist: true });
          } catch {
            try { applyWorkspaceStatePayload(backup, { persist: true }); } catch {}
            pendingImport = null;
            textarea.disabled = false;
            message.textContent = 'Invalid workspace code';
            textarea.focus({ preventScroll: true });
            return;
          }
          markHintUsed();
          closeMenu(false);
          announce('Workspace imported');
          stage.focus({ preventScroll: true });
          return;
        }
        try {
          pendingImport = decodeWorkspaceCode(textarea.value);
          textarea.disabled = true;
          message.textContent = 'Importing will replace your current workspace.';
          back.textContent = 'Cancel';
          primary.textContent = 'Import';
          primary.focus({ preventScroll: true });
        } catch (error) {
          pendingImport = null;
          const unsupported = error instanceof Error && /unsupported workspace/i.test(error.message);
          message.textContent = unsupported ? 'Unsupported workspace version' : 'Invalid workspace code';
          textarea.focus({ preventScroll: true });
        }
      });
    }

    if (!menuOpen) {
      const heroRect = hero.getBoundingClientRect();
      placeMenu(anchorSnapshot?.clientX ?? heroRect.left + heroRect.width * .5, anchorSnapshot?.clientY ?? heroRect.top + heroRect.height * .5);
    }
    queueMicrotask(() => textarea.focus({ preventScroll: true }));
  }

  function buildCanvasMenu() {
    menu.classList.remove('is-url-form', 'is-workspace-form');
    menu.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = 'New node +';
    menu.appendChild(heading);

    NODE_TYPES.forEach(type => {
      const limitReached = models.size >= MAX_NODES;
      menu.appendChild(menuItem({
        label: limitReached ? 'Node limit reached' : type.label,
        icon: type.icon,
        disabled: limitReached,
        action: () => {
          if (!menuAnchor) return;
          const anchor = { ...menuAnchor };
          if (type.id !== 'text') {
            openUrlForm(type.id, { anchor });
            return;
          }
          closeMenu(false);
          markHintUsed();
          const model = createTextNode({
            x: anchor.worldX,
            y: anchor.worldY,
            animate: true,
            focusEditor: true,
            persist: true,
            sound: true
          });
          if (model) announce('Node created');
        }
      }));
    });

    menu.appendChild(separator());

    menu.appendChild(menuItem({
      label: 'Save Node',
      icon: '↓',
      action: () => openWorkspacePanel('save')
    }));

    menu.appendChild(menuItem({
      label: 'Import Node',
      icon: '↑',
      action: () => openWorkspacePanel('import')
    }));

    menu.appendChild(separator());

    const resetDisabled = (
      window.DeushimaHeroNodes?.isDefaultLayout?.() !== false
      && window.DeushimaHeroCamera?.isDefaultView?.() !== false
    );
    menu.appendChild(menuItem({
      label: 'Reset',
      icon: '↺',
      disabled: resetDisabled,
      action: () => {
        closeMenu(false);
        markHintUsed();
        playSfx('reset', { element: stage });
        window.DeushimaHeroNodes?.resetOriginals?.();
        window.DeushimaHeroCamera?.recenter?.({ animate: !reducedMotion.matches });
        scheduleWorkspaceSave(reducedMotion.matches ? 0 : 360);
        announce('Layout reset');
        window.DeushimaGrid?.wake?.(850);
        window.setTimeout(() => stage.focus({ preventScroll: true }), reducedMotion.matches ? 0 : 300);
      }
    }));

    menu.appendChild(menuItem({
      label: 'Recenter view',
      icon: '⌾',
      action: () => {
        closeMenu(false);
        markHintUsed();
        window.DeushimaHeroCamera?.recenter?.({ animate: !reducedMotion.matches });
        scheduleWorkspaceSave(reducedMotion.matches ? 0 : 240);
        announce('View recentered');
        window.setTimeout(() => stage.focus({ preventScroll: true }), reducedMotion.matches ? 0 : 180);
      }
    }));

    if (models.size) {
      menu.appendChild(separator());
      const clearButton = menuItem({
        label: 'Clear my nodes',
        icon: '×',
        action: (button, labelEl) => {
          if (button.dataset.confirm !== 'true') {
            button.dataset.confirm = 'true';
            button.classList.add('is-confirming');
            labelEl.textContent = 'Confirm clear';
            window.clearTimeout(clearConfirmTimer);
            clearConfirmTimer = window.setTimeout(() => {
              button.dataset.confirm = 'false';
              button.classList.remove('is-confirming');
              labelEl.textContent = 'Clear my nodes';
            }, 2800);
            return;
          }
          window.clearTimeout(clearConfirmTimer);
          closeMenu(false);
          markHintUsed();
          playSfx('chatClose', { element: stage, gainScale: .84 });
          clearAllNodes();
          stage.focus({ preventScroll: true });
        }
      });
      menu.appendChild(clearButton);
    }
  }

  function buildNodeMenu(model) {
    menu.classList.remove('is-url-form', 'is-workspace-form');
    menu.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = nodeTypeLabel(model);
    menu.appendChild(heading);

    menu.appendChild(menuItem({
      label: models.size >= MAX_NODES ? 'Node limit reached' : 'Duplicate',
      icon: '⧉',
      disabled: models.size >= MAX_NODES,
      action: () => {
        closeMenu(false);
        markHintUsed();
        const duplicate = duplicateNode(model.id);
        if (duplicate) announce('Node created');
      }
    }));

    menu.appendChild(menuItem({
      label: 'Delete',
      icon: '×',
      action: () => {
        closeMenu(false);
        markHintUsed();
        deleteNode(model.id, { announceChange: true, sound: true });
        stage.focus({ preventScroll: true });
      }
    }));
  }

  function placeMenu(clientX, clientY, { focusFirst = true } = {}) {
    const margin = 10;
    const placementToken = ++menuPlacementToken;
    menuOpen = true;
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.add('is-open');
    menu.style.visibility = 'hidden';
    const rect = menu.getBoundingClientRect();
    if (!menuOpen || placementToken !== menuPlacementToken) return;
    const left = clamp(clientX, margin, Math.max(margin, window.innerWidth - rect.width - margin));
    const top = clamp(clientY, margin, Math.max(margin, window.innerHeight - rect.height - margin));
    menu.style.setProperty('--menu-origin-x', clientX > window.innerWidth * .5 ? '100%' : '0%');
    menu.style.setProperty('--menu-origin-y', clientY > window.innerHeight * .5 ? '100%' : '0%');
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';

    if (!focusFirst) return;

    queueMicrotask(() => {
      if (!menuOpen || placementToken !== menuPlacementToken) return;
      const first = [...menu.querySelectorAll('[role="menuitem"]')]
        .find(item => item.getAttribute('aria-disabled') !== 'true');
      first?.focus({ preventScroll: true });
    });
  }

  function openCanvasMenu(clientX, clientY, origin = stage, { focusFirst = true } = {}) {
    if (isModalOpen()) return;
    closeMenu(false);
    const point = worldPointFromClient(clientX, clientY);
    menuAnchor = {
      clientX,
      clientY,
      worldX: point.x,
      worldY: point.y
    };
    menuMode = 'canvas';
    menuUrlKind = null;
    menuNodeId = null;
    menuFocusOrigin = origin instanceof HTMLElement ? origin : stage;
    buildCanvasMenu();
    playSfx('chatOpen', { element: stage, gainScale: .76 });
    placeMenu(clientX, clientY);
    workspaceInteraction?.debug?.('menu open', null, { menuOpen: true, mode: 'canvas' });
  }

  function openNodeMenu(model, clientX, clientY, origin = model.el) {
    closeMenu(false);
    menuAnchor = { clientX, clientY, worldX: model.x, worldY: model.y };
    menuMode = 'node';
    menuUrlKind = null;
    menuNodeId = model.id;
    menuFocusOrigin = origin;
    buildNodeMenu(model);
    playSfx('chatOpen', { element: model.el, gainScale: .72 });
    placeMenu(clientX, clientY);
    workspaceInteraction?.debug?.('menu open', null, { menuOpen: true, mode: 'node', nodeId: model.id });
  }

  function closeMenu(restoreFocus = true) {
    window.clearTimeout(clearConfirmTimer);
    clearConfirmTimer = 0;
    menuPlacementToken += 1;
    const closeToken = menuPlacementToken;
    const wasOpen = menuOpen || menu.classList.contains('is-open');
    menuOpen = false;
    menu.classList.remove('is-open', 'is-url-form', 'is-workspace-form');
    const focusTarget = menuFocusOrigin;
    menuMode = null;
    menuUrlKind = null;
    menuNodeId = null;
    menuAnchor = null;
    menuFocusOrigin = null;

    workspaceInteraction?.debug?.('menu close', null, { menuOpen: false });
    if (!wasOpen) {
      menu.replaceChildren();
      return;
    }

    window.setTimeout(() => {
      if (menuOpen || closeToken !== menuPlacementToken || menu.classList.contains('is-open')) return;
      menu.replaceChildren();
      if (restoreFocus && focusTarget?.focus) focusTarget.focus({ preventScroll: true });
    }, reducedMotion.matches ? 0 : 150);
  }

  function menuItems() {
    return [...menu.querySelectorAll('[role="menuitem"]')]
      .filter(item => item.getAttribute('aria-disabled') !== 'true');
  }

  menu.addEventListener('keydown', event => {
    const items = menuItems();
    if (!items.length) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
      return;
    }
    const index = Math.max(0, items.indexOf(document.activeElement));

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.matches('[role="menuitem"]')) {
      event.preventDefault();
      document.activeElement.click();
    }
  });

  function handleWorkspaceContextMenu(event) {
    if (performance.now() < longPressOpenedUntil) {
      event.preventDefault();
      event.stopPropagation();
      workspaceInteraction?.debug?.('contextmenu', event, { prevented: true, menuOpen });
      return;
    }

    const menuTarget = pathClosest(event, '.hero-custom-node-context');
    if (menuTarget) {
      event.preventDefault();
      event.stopPropagation();
      workspaceInteraction?.debug?.('contextmenu', event, { prevented: true, menuOpen: true, targetRole: 'context-menu' });
      return;
    }

    if (isScreenUiEvent(event)) {
      closeMenu(false);
      workspaceInteraction?.debug?.('contextmenu', event, { prevented: false, menuOpen: false, targetRole: 'screen-ui' });
      return;
    }

    if (isModalOpen() || !isPointInsideWorkspace(event.clientX, event.clientY)) return;

    const customNodeEl = pathClosest(event, '[data-custom-node]');
    event.preventDefault();
    event.stopPropagation();
    workspaceInteraction?.cancel?.('contextmenu');

    if (customNodeEl) {
      const model = models.get(customNodeEl.dataset.customNode);
      if (!model) return;
      selectNode(model);
      openNodeMenu(model, event.clientX, event.clientY, customNodeEl);
      workspaceInteraction?.debug?.('contextmenu', event, { prevented: true, menuOpen: true, targetRole: 'visitor-node' });
      return;
    }

    openCanvasMenu(event.clientX, event.clientY, stage);
    workspaceInteraction?.debug?.('contextmenu', event, { prevented: true, menuOpen: true, targetRole: 'workspace' });
  }

  interactionRoot.addEventListener('contextmenu', handleWorkspaceContextMenu, { capture: true });

  function startLongPress(target, clientX, clientY, pointerId, source) {
    if (isModalOpen()) return;
    if (!canOpenCanvasMenuAt(target, clientX, clientY)) return;
    if (longPressState) clearLongPress();

    longPressState = {
      pointerId,
      source,
      startX: clientX,
      startY: clientY,
      clientX,
      clientY,
      timer: window.setTimeout(() => {
        if (!longPressState) return;
        const point = { x: longPressState.clientX, y: longPressState.clientY };
        longPressOpenedUntil = performance.now() + 900;
        try { navigator.vibrate?.(8); } catch {}
        openCanvasMenu(point.x, point.y, stage);
        longPressState = null;
      }, LONG_PRESS_MS)
    };
  }

  interactionRoot.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    startLongPress(event.target, event.clientX, event.clientY, event.pointerId, 'pointer');
  }, { passive: true });

  function moveLongPress(event) {
    if (!longPressState || longPressState.source !== 'pointer' || event.pointerId !== longPressState.pointerId) return;
    const distance = Math.hypot(event.clientX - longPressState.startX, event.clientY - longPressState.startY);
    if (distance > LONG_PRESS_TOLERANCE) {
      clearLongPress();
      return;
    }
    longPressState.clientX = event.clientX;
    longPressState.clientY = event.clientY;
  }

  function clearLongPress(event = null) {
    if (
      event
      && longPressState
      && longPressState.source === 'pointer'
      && event.pointerId !== longPressState.pointerId
    ) return;
    if (longPressState?.timer) window.clearTimeout(longPressState.timer);
    longPressState = null;
  }

  stage.addEventListener('pointerdown', event => {
    const port = event.target instanceof Element
      ? event.target.closest('[data-custom-port], [data-node-port]')
      : null;
    if (!port || !stage.contains(port)) return;
    beginConnection(event, port);
  }, { capture: true });

  stage.addEventListener('lostpointercapture', event => {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;
    if (event.target !== connectionState.sourcePort) return;
    endConnection(event, { commit: false });
  }, { capture: true });

  function cancelTransientInteraction({ reason = 'cancel', pointerId = null } = {}) {
    if (dragState && (pointerId == null || dragState.pointerId === pointerId)) {
      const state = dragState;
      const model = models.get(state.id);
      dragState = null;
      if (model?.el) {
        model.el.classList.remove('is-dragging');
        try {
          if (model.el.hasPointerCapture?.(state.pointerId)) model.el.releasePointerCapture(state.pointerId);
        } catch {}
        if (state.moved) {
          renderModel(model);
          saveState();
          drawConnections();
        }
      }
      window.DeushimaHeroCamera?.clearAutoPan?.();
    }

    if (connectionState && (pointerId == null || connectionState.pointerId === pointerId)) {
      const state = connectionState;
      connectionState = null;
      try {
        if (state.sourcePort?.hasPointerCapture?.(state.pointerId)) state.sourcePort.releasePointerCapture(state.pointerId);
      } catch {}
      state.sourcePort?.classList.remove('is-active');
      stage.classList.remove('is-editing');
      clearCompatiblePorts();
      previewPath.setAttribute('d', '');
      drawConnections();
    }

    clearLongPress();

    const preserveUrlForm = (
      menuMode === 'url-form'
      && (reason === 'window-blur' || reason === 'visibilitychange')
    );
    if (!preserveUrlForm && ['window-blur', 'visibilitychange', 'blocked-ui', 'escape', 'pointercancel', 'lostpointercapture', 'contextmenu'].includes(reason)) {
      closeMenu(false);
    }
  }

  workspaceInteraction?.registerCancelHandler?.(cancelTransientInteraction);

  window.addEventListener('pointermove', event => {
    moveNodeDrag(event);
    moveConnection(event);
    moveLongPress(event);
    if (connections.length && stage.querySelector('[data-hero-node].is-dragging')) {
      drawConnections();
    }
  }, { passive: false });

  window.addEventListener('pointerup', event => {
    endNodeDrag(event);
    endConnection(event, { commit: true });
    clearLongPress(event);
  });

  window.addEventListener('pointercancel', event => {
    endNodeDrag(event);
    endConnection(event, { commit: false });
    clearLongPress(event);
  });

  document.addEventListener('pointerdown', event => {
    // Right-click is owned exclusively by the workspace contextmenu handler.
    // Closing here changes the hit-test target between pointerdown/contextmenu
    // and produces different native-menu behaviour across browser engines.
    if (menuOpen && event.button !== 2 && !menu.contains(event.target)) {
      closeMenu(false);
    }

    if (editingNodeId) {
      const editing = models.get(editingNodeId);
      if (editing && !editing.el.contains(event.target)) setEditing(editing, false, false);
    }

    if (
      event.target instanceof Element &&
      !event.target.closest('[data-custom-node], .hero-custom-node-line-hit, .hero-custom-connection-delete, .hero-custom-node-context')
    ) {
      clearNodeSelection();
      if (!event.target.closest('.hero-custom-node-line-hit')) {
        selectedConnectionId = null;
        syncConnectionSelection();
        if (!hoverConnectionId) hideLineDeleteButton();
      }
    }
  }, { capture: true, passive: true });

  document.addEventListener('keydown', event => {
    if (menuOpen) return;

    if (
      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) &&
      document.activeElement === stage &&
      !isModalOpen()
    ) {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      openCanvasMenu(rect.left + rect.width * .5, rect.top + rect.height * .5, stage);
      return;
    }

    if (editingNodeId) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedConnectionId) {
        event.preventDefault();
        removeConnection(selectedConnectionId, { persist: true, sound: true });
        announce('Connection deleted');
        return;
      }
      if (selectedNodeId) {
        event.preventDefault();
        const id = selectedNodeId;
        deleteNode(id, { announceChange: true, sound: true });
        stage.focus({ preventScroll: true });
      }
    } else if (event.key === 'Escape' && selectedConnectionId) {
      selectedConnectionId = null;
      syncConnectionSelection();
      hideLineDeleteButton();
    }
  });

  window.addEventListener('scroll', event => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeMenu(false);
  }, { passive: true, capture: true });

  window.addEventListener('resize', () => {
    closeMenu(false);
    window.clearTimeout(resizeSaveTimer);
    resizeSaveTimer = window.setTimeout(() => {
      models.forEach(renderModel);
      drawConnections();
      scheduleWorkspaceSave(0);
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(600);
    }, 180);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (connectionRaf) cancelAnimationFrame(connectionRaf);
      connectionRaf = 0;
      if (menuMode !== 'url-form') closeMenu(false);
      return;
    }
    drawConnections();
    scheduleConnectionLoop();
  });

  hero.addEventListener('deushima:camera-change', () => {
    if (dragState?.moved) {
      const model = models.get(dragState.id);
      if (model) {
        const point = worldPointFromClient(dragState.lastX, dragState.lastY);
        model.x = point.x - dragState.offsetX;
        model.y = point.y - dragState.offsetY;
        renderModel(model);
      }
    }

    if (connections.length) drawConnections();

    if (menuMode === 'canvas' && menuOpen) {
      buildCanvasMenu();
    }
    scheduleWorkspaceSave(180);
  });

  coarsePointer.addEventListener?.('change', () => {
    hint.textContent = coarsePointer.matches ? 'Long-press for options' : 'Right-click for options';
  });

  stage.addEventListener('deushima:hero-layout-change', () => {
    if (menuMode === 'canvas' && menuOpen) buildCanvasMenu();
    drawConnections();
    scheduleConnectionLoop();
    scheduleWorkspaceSave(80);
  });

  const resizeObserver = new ResizeObserver(() => {
    models.forEach(renderModel);
    drawConnections();
    window.DeushimaGrid?.wake?.(360);
  });
  resizeObserver.observe(stage);

  function initialRestore() {
    const restored = restoreState();
    window.setTimeout(() => window.DeushimaGrid?.refreshDynamicNodes?.(), 120);
    window.setTimeout(() => {
      if (restored?.originalNodes) {
        workspaceMutationDepth += 1;
        try {
          const camera = cameraApi();
          camera?.refreshGeometry?.({ recenterView: false });
          window.DeushimaHeroNodes?.applyWorkspaceState?.(restored.originalNodes, { persist: false });
        } finally {
          workspaceMutationDepth = Math.max(0, workspaceMutationDepth - 1);
        }
      }
      models.forEach(renderModel);
      drawConnections();
      scheduleConnectionLoop();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(700);
    }, 700);
  }

  window.DeushimaCustomNodes = Object.freeze({
    storageKey: STORAGE_KEY,
    previousStorageKey: PREVIOUS_STORAGE_KEY,
    legacyStorageKey: LEGACY_STORAGE_KEY,
    storageVersion: STORAGE_VERSION,
    hintKey: HINT_KEY,
    maxNodes: MAX_NODES,
    nodeTypes: NODE_TYPES,
    createText: (x = null, y = null, text = '') => createTextNode({ x, y, text }),
    createLink: (x = null, y = null, url = '') => createLinkNode({ x, y, url }),
    createMedia: (x = null, y = null, url = '') => createMediaNode({ x, y, url }),
    createInstagram: (x = null, y = null, url = '') => createEmbedNode({ type: 'instagram', x, y, url }),
    createYouTube: (x = null, y = null, url = '') => createEmbedNode({ type: 'youtube', x, y, url }),
    clear: clearAllNodes,
    exportWorkspace: exportWorkspaceCode,
    importWorkspace: importWorkspaceCode,
    getWorkspacePayload: serializeStatePayload,
    getState: () => ({
      nodes: [...models.values()].map(model => ({
        id: model.id,
        type: model.type,
        note: model.note,
        text: model.type === 'text' ? model.text : undefined,
        url: model.type !== 'text' ? model.url : undefined,
        mediaType: model.type === 'media' ? model.mediaType : undefined,
        x: model.x,
        y: model.y,
        z: model.z
      })),
      connections: connections.map(connection => ({
        ...connection,
        from: { ...connection.from },
        to: { ...connection.to }
      })),
      editingNodeId,
      selectedNodeId,
      selectedConnectionId,
      menuOpen
    })
  });

  initialRestore();
})();
