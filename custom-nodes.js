(() => {
  'use strict';

  const hero = document.querySelector('.hero--node-canvas');
  const stage = hero?.querySelector('[data-hero-node-stage]');
  const originalMesh = stage?.querySelector('[data-hero-node-mesh]');
  const originalNodes = stage ? [...stage.querySelectorAll('[data-hero-node]')] : [];
  if (!hero || !stage || !originalMesh || !originalNodes.length) return;
  if (stage.dataset.customNodesReady === 'true') return;
  stage.dataset.customNodesReady = 'true';

  const STORAGE_KEY = 'deushima:nodes:v1';
  const HINT_KEY = 'deushima:nodes:menu-hint:v1';
  const STORAGE_VERSION = 1;
  const MAX_NODES = 20;
  const MAX_CONNECTIONS = 60;
  const MAX_TEXT_LENGTH = 280;
  const COUNTER_THRESHOLD = 220;
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_TOLERANCE = 8;
  const DRAG_THRESHOLD = 5;
  const PORT_RADIUS = 46;

  const NODE_TYPES = Object.freeze([
    Object.freeze({ id: 'text', label: 'Text', icon: 'T' })
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
  let menuNodeId = null;
  let menuFocusOrigin = null;
  let clearConfirmTimer = 0;
  let longPressState = null;
  let longPressOpenedUntil = 0;
  let typingVariant = 0;
  let lastTypingAt = 0;
  let resizeSaveTimer = 0;

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
  document.body.appendChild(menu);

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

  function endpointPort(ref, direction) {
    const parsed = parseEndpoint(ref);
    const el = endpointElement(ref);
    if (!parsed || !el) return null;
    if (parsed.kind === 'user') {
      return el.querySelector(`[data-custom-port="${direction}"]`);
    }
    return el.querySelector(`[data-node-port="${direction}"]`);
  }

  function stagePointFromClient(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      nx: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      ny: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
      rect
    };
  }

  function isPointInsideStage(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
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

  function canOpenCanvasMenuAt(target, clientX, clientY) {
    return (
      !isModalOpen() &&
      isPointInsideStage(clientX, clientY) &&
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
    const stageRect = stage.getBoundingClientRect();
    const width = Math.max(1, model.el.offsetWidth || model.el.getBoundingClientRect().width);
    const height = Math.max(1, model.el.offsetHeight || model.el.getBoundingClientRect().height);
    const margin = mobileQuery.matches ? 9 : 10;
    const minX = clamp((width * 0.5 + margin) / Math.max(1, stageRect.width), 0, 0.5);
    const maxX = 1 - minX;
    const minY = clamp((height * 0.5 + margin) / Math.max(1, stageRect.height), 0, 0.5);
    const maxY = 1 - minY;
    return { minX, maxX, minY, maxY };
  }

  function clampModel(model) {
    const bounds = nodeBoundsFor(model);
    const oldX = model.x;
    const oldY = model.y;
    model.x = clamp(model.x, bounds.minX, bounds.maxX);
    model.y = clamp(model.y, bounds.minY, bounds.maxY);
    return oldX !== model.x || oldY !== model.y;
  }

  function renderModel(model) {
    clampModel(model);
    model.el.style.setProperty('--custom-node-x', `${(model.x * 100).toFixed(4)}%`);
    model.el.style.setProperty('--custom-node-y', `${(model.y * 100).toFixed(4)}%`);
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

  function insertLineBreak(editor, model) {
    const current = safeText(editor.textContent);
    const offsets = selectionOffsets(editor);
    const start = clamp(offsets.start, 0, current.length);
    const end = clamp(offsets.end, start, current.length);

    if (current.length - (end - start) >= MAX_TEXT_LENGTH) return false;

    const next = safeText(
      current.slice(0, start)
      + '\n'
      + current.slice(end)
    );

    editor.textContent = next;
    model.text = next;
    updateCounter(model);
    setCaretOffset(editor, start + 1);
    saveState();
    drawConnections();
    window.DeushimaGrid?.wake?.(280);
    return true;
  }

  function setEditing(model, editing, focus = true) {
    if (editingNodeId && editingNodeId !== model.id) {
      const previous = models.get(editingNodeId);
      if (previous) setEditing(previous, false, false);
    }

    model.editing = editing;
    model.el.classList.toggle('is-editing', editing);
    model.editor.setAttribute('contenteditable', editing ? 'true' : 'false');
    editingNodeId = editing ? model.id : (editingNodeId === model.id ? null : editingNodeId);

    if (editing && focus) {
      setFront(model);
      requestAnimationFrame(() => {
        model.editor.focus({ preventScroll: true });
        placeCaretAtEnd(model.editor);
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

    const editor = document.createElement('div');
    editor.className = 'hero-custom-node__editor';
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Node text');
    editor.setAttribute('data-placeholder', 'Write something…');
    editor.setAttribute('contenteditable', 'false');
    editor.spellcheck = true;
    editor.textContent = model.text;

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
    el.append(meta, del, editor, counter, portIn, portOut);
    nodeLayer.appendChild(el);

    model.el = el;
    model.editor = editor;
    model.counter = counter;
    model.portIn = portIn;
    model.portOut = portOut;

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
      if (event.target.closest('[data-custom-port], .hero-custom-node__delete')) return;

      selectNode(model);

      const mayDrag = !model.editing || Boolean(event.target.closest('[data-custom-drag-handle]'));
      if (!mayDrag) return;

      const rect = el.getBoundingClientRect();
      dragState = {
        id: model.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - (rect.left + rect.width * 0.5),
        offsetY: event.clientY - (rect.top + rect.height * 0.5),
        moved: false,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        lastSoundAt: 0
      };
      el.setPointerCapture?.(event.pointerId);
    });

    el.addEventListener('dblclick', event => {
      if (event.target.closest('[data-custom-port], .hero-custom-node__delete')) return;
      event.preventDefault();
      selectNode(model);
      setEditing(model, true);
    });

    el.addEventListener('focus', () => selectNode(model));

    el.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      selectNode(model);
      openNodeMenu(model, event.clientX, event.clientY, el);
    });

    editor.addEventListener('keydown', event => {
      if (!model.editing) return;

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
      if (!inputType.startsWith('insert') || inputType === 'insertLineBreak' || inputType === 'insertParagraph') return;
      const incoming = String(event.data || '');
      const current = editor.textContent.length;
      const replacement = selectedLength(editor);
      if (current - replacement + incoming.length > MAX_TEXT_LENGTH) {
        event.preventDefault();
      }
    });

    editor.addEventListener('paste', event => {
      if (!model.editing) return;
      event.preventDefault();
      const raw = event.clipboardData?.getData('text/plain') || '';
      const current = editor.textContent.length;
      const replacement = selectedLength(editor);
      const remaining = Math.max(0, MAX_TEXT_LENGTH - (current - replacement));
      insertPlainText(editor, raw.slice(0, remaining));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    editor.addEventListener('input', () => {
      let text = safeText(editor.textContent);
      if (editor.textContent !== text) {
        editor.textContent = text;
        placeCaretAtEnd(editor);
      }
      model.text = text;
      updateCounter(model);
      saveState();
      drawConnections();
      window.DeushimaGrid?.wake?.(380);
    });

    editor.addEventListener('blur', () => {
      if (model.editing && document.activeElement !== editor) {
        setEditing(model, false, false);
      }
    });

    portOut.addEventListener('pointerdown', event => beginConnection(event, model));
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
    x = 0.5,
    y = 0.5,
    text = '',
    z = ++zCounter,
    animate = true,
    focusEditor = true,
    persist = true,
    sound = true,
    select = true
  } = {}) {
    if (models.size >= MAX_NODES) return null;
    if (models.has(id)) return null;

    const model = {
      id,
      note: clamp(Math.trunc(note) || 1, 1, 999),
      type: 'text',
      x: clamp(Number(x) || 0.5, 0, 1),
      y: clamp(Number(y) || 0.5, 0, 1),
      text: safeText(text),
      z: clamp(Math.trunc(z) || 1, 1, 9999),
      editing: false,
      el: null,
      editor: null,
      counter: null,
      portIn: null,
      portOut: null
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

  function deleteIncidentConnections(id) {
    const ref = endpointRefForUser(id);
    const ids = connections
      .filter(connection => connection.from === ref || connection.to === ref)
      .map(connection => connection.id);
    ids.forEach(connectionId => removeConnection(connectionId, { persist: false, sound: false }));
  }

  function deleteNode(id, { announceChange = false, sound = false, persist = true } = {}) {
    const model = models.get(id);
    if (!model) return false;

    deleteIncidentConnections(id);
    if (editingNodeId === id) editingNodeId = null;
    if (selectedNodeId === id) selectedNodeId = null;

    const remove = () => {
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
    const stageRect = stage.getBoundingClientRect();
    const offsetX = 28 / Math.max(1, stageRect.width);
    const offsetY = 24 / Math.max(1, stageRect.height);
    return createTextNode({
      x: source.x + offsetX,
      y: source.y + offsetY,
      text: source.text,
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

    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    window.setTimeout(() => {
      announce('Nodes cleared');
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(800);
    }, reducedMotion.matches ? 0 : 170);
  }

  function connectionKey(from, to) {
    return `${from}=>${to}`;
  }

  function hasConnection(from, to) {
    const key = connectionKey(from, to);
    return connections.some(connection => connectionKey(connection.from, connection.to) === key);
  }

  function portCenter(ref, direction) {
    const port = endpointPort(ref, direction);
    if (!port) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = port.getBoundingClientRect();
    return {
      x: rect.left - stageRect.left + rect.width * 0.5,
      y: rect.top - stageRect.top + rect.height * 0.5
    };
  }

  function curvePoints(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const direction = dx >= 0 ? 1 : -1;
    const tension = Math.max(40, Math.min(180, Math.abs(dx) * .46 + Math.abs(dy) * .08));
    return {
      from,
      to,
      c1: { x: from.x + tension * direction, y: from.y },
      c2: { x: to.x - tension * direction, y: to.y }
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
      const from = portCenter(connection.from, 'out');
      const to = portCenter(connection.to, 'in');
      if (!from || !to) return;
      const points = curvePoints(from, to);
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
      connection.from.startsWith('orig:') || connection.to.startsWith('orig:')
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

  function createConnection(from, to, { persist = true, sound = true } = {}) {
    if (!parseEndpoint(from) || !parseEndpoint(to)) return null;
    if (!from.startsWith('user:')) return null;
    if (from === to || hasConnection(from, to) || connections.length >= MAX_CONNECTIONS) return null;

    const connection = { id: uid('conn'), from, to };
    connections.push(connection);
    ensureConnectionElement(connection);
    drawConnections();
    scheduleConnectionLoop();
    if (persist) saveState();
    if (sound) playSfx('link', { element: endpointElement(to), gainScale: .9 });
    return connection;
  }

  function removeConnection(id, { persist = true, sound = true } = {}) {
    const index = connections.findIndex(connection => connection.id === id);
    if (index < 0) return false;
    const connection = connections[index];
    const soundElement = endpointElement(connection.to);
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

  function nearestCompatibleInput(clientX, clientY, sourceId) {
    let best = null;
    const ports = [
      ...stage.querySelectorAll('[data-custom-port="in"]'),
      ...stage.querySelectorAll('[data-node-port="in"]')
    ];

    ports.forEach(port => {
      const customNode = port.closest('[data-custom-node]');
      const originalNode = port.closest('[data-hero-node]');
      const ref = customNode
        ? endpointRefForUser(customNode.dataset.customNode)
        : originalNode
          ? endpointRefForOriginal(originalNode.dataset.heroNode)
          : null;
      if (!ref || ref === endpointRefForUser(sourceId)) return;

      const rect = port.getBoundingClientRect();
      const x = rect.left + rect.width * .5;
      const y = rect.top + rect.height * .5;
      const distance = Math.hypot(clientX - x, clientY - y);
      port.classList.toggle('is-near', distance <= PORT_RADIUS);

      if (distance <= PORT_RADIUS && (!best || distance < best.distance)) {
        best = { port, ref, distance };
      }
    });

    return best;
  }

  function clearCompatiblePorts() {
    stage.querySelectorAll('[data-custom-port="in"].is-near, [data-node-port="in"].is-near')
      .forEach(port => port.classList.remove('is-near'));
  }

  function beginConnection(event, model) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectNode(model);

    const point = portCenter(endpointRefForUser(model.id), 'out');
    if (!point) return;

    connectionState = {
      pointerId: event.pointerId,
      sourceId: model.id,
      sourceRef: endpointRefForUser(model.id),
      sourcePort: model.portOut,
      pointerX: point.x,
      pointerY: point.y,
      target: null
    };
    model.portOut.classList.add('is-active');
    stage.classList.add('is-editing');
    model.portOut.setPointerCapture?.(event.pointerId);
    drawConnectionPreview();
    scheduleConnectionLoop();
  }

  function drawConnectionPreview() {
    if (!connectionState) {
      previewPath.setAttribute('d', '');
      return;
    }
    const from = portCenter(connectionState.sourceRef, 'out');
    if (!from) return;
    const to = { x: connectionState.pointerX, y: connectionState.pointerY };
    previewPath.setAttribute('d', curvePath(curvePoints(from, to)));
  }

  function moveConnection(event) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;
    event.preventDefault();
    const point = stagePointFromClient(event.clientX, event.clientY);
    connectionState.pointerX = point.x;
    connectionState.pointerY = point.y;
    connectionState.target = nearestCompatibleInput(event.clientX, event.clientY, connectionState.sourceId);
    drawConnectionPreview();
  }

  function endConnection(event) {
    if (!connectionState || event.pointerId !== connectionState.pointerId) return;

    const state = connectionState;
    const target = nearestCompatibleInput(event.clientX, event.clientY, state.sourceId) || state.target;

    state.sourcePort.releasePointerCapture?.(event.pointerId);
    state.sourcePort.classList.remove('is-active');
    stage.classList.remove('is-editing');
    clearCompatiblePorts();
    connectionState = null;
    previewPath.setAttribute('d', '');

    if (target?.ref) {
      createConnection(state.sourceRef, target.ref, { persist: true, sound: true });
    }
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
    const from = portCenter(connection.from, 'out');
    const to = portCenter(connection.to, 'in');
    if (!from || !to) return;
    positionLineDeleteButton(cubicPoint(curvePoints(from, to), .5));
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
      model.el.classList.add('is-dragging');
      playSfx('pickup', { element: model.el, eventTimestamp: event.timeStamp });
    }

    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const centerX = event.clientX - stageRect.left - dragState.offsetX;
    const centerY = event.clientY - stageRect.top - dragState.offsetY;
    model.x = centerX / Math.max(1, stageRect.width);
    model.y = centerY / Math.max(1, stageRect.height);
    renderModel(model);

    const now = performance.now();
    const step = window.DeushimaSFX?.config?.performance?.dragStepMs || 70;
    if (now - dragState.lastSoundAt >= step) {
      const dt = Math.max(8, now - dragState.lastTime);
      const speed = Math.hypot(
        event.clientX - dragState.lastX,
        event.clientY - dragState.lastY
      ) / dt * 1000;
      const degree = -5 + clamp(Math.round((speed / 1650) * 4), 0, 4);
      playSfx('drag', {
        element: model.el,
        degree,
        eventTimestamp: event.timeStamp,
        gainScale: .88
      });
      dragState.lastSoundAt = now;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      dragState.lastTime = now;
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
  }

  function readState() {
    let parsed;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.nodes)) return null;

    const nodes = [];
    const ids = new Set();

    for (const rawNode of parsed.nodes.slice(0, MAX_NODES)) {
      if (!rawNode || rawNode.type !== 'text') continue;
      const id = typeof rawNode.id === 'string' && rawNode.id.length <= 90 ? rawNode.id : null;
      if (!id || ids.has(id)) continue;
      const x = Number(rawNode.x);
      const y = Number(rawNode.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      ids.add(id);
      nodes.push({
        id,
        type: 'text',
        note: clamp(Math.trunc(Number(rawNode.note)) || nodes.length + 1, 1, 999),
        text: safeText(rawNode.text),
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
        z: clamp(Math.trunc(Number(rawNode.z)) || nodes.length + 1, 1, 9999)
      });
    }

    const validRefs = new Set([
      ...nodes.map(node => endpointRefForUser(node.id)),
      ...[...originalNames].map(endpointRefForOriginal)
    ]);

    const restoredConnections = [];
    const seen = new Set();
    const rawConnections = Array.isArray(parsed.connections) ? parsed.connections : [];

    for (const rawConnection of rawConnections.slice(0, MAX_CONNECTIONS)) {
      if (!rawConnection) continue;
      const from = String(rawConnection.from || '');
      const to = String(rawConnection.to || '');
      if (!from.startsWith('user:') || !validRefs.has(from) || !validRefs.has(to) || from === to) continue;
      const key = connectionKey(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      restoredConnections.push({
        id: typeof rawConnection.id === 'string' && rawConnection.id.length <= 100
          ? rawConnection.id
          : uid('conn'),
        from,
        to
      });
    }

    return {
      nodes,
      connections: restoredConnections,
      nextNote: clamp(Math.trunc(Number(parsed.nextNote)) || nodes.length + 1, 1, 9999),
      zCounter: clamp(Math.trunc(Number(parsed.zCounter)) || nodes.length + 1, 1, 9999)
    };
  }

  function saveState() {
    const payload = {
      version: STORAGE_VERSION,
      nextNote: nextNoteNumber,
      zCounter,
      nodes: [...models.values()].map(model => ({
        id: model.id,
        type: 'text',
        note: model.note,
        text: safeText(model.text),
        x: Number(model.x.toFixed(6)),
        y: Number(model.y.toFixed(6)),
        z: model.z
      })),
      connections: connections.map(connection => ({
        id: connection.id,
        from: connection.from,
        to: connection.to
      }))
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function restoreState() {
    const saved = readState();
    if (!saved) {
      restoreHintState();
      return;
    }

    nextNoteNumber = saved.nextNote;
    zCounter = saved.zCounter;

    saved.nodes.forEach(data => {
      createTextNode({
        ...data,
        animate: false,
        focusEditor: false,
        persist: false,
        sound: false,
        select: false
      });
    });

    connections = saved.connections;
    connections.forEach(ensureConnectionElement);
    restoreHintState();
    requestAnimationFrame(() => {
      clampAllNodesAndSave(false);
      drawConnections();
      scheduleConnectionLoop();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(800);
    });
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

  function buildCanvasMenu() {
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
          closeMenu(false);
          markHintUsed();
          const model = createTextNode({
            x: anchor.nx,
            y: anchor.ny,
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

    const resetDisabled = window.DeushimaHeroNodes?.isDefaultLayout?.() !== false;
    menu.appendChild(menuItem({
      label: 'Reset',
      icon: '↺',
      disabled: resetDisabled,
      action: () => {
        closeMenu(false);
        markHintUsed();
        playSfx('reset', { element: stage });
        window.DeushimaHeroNodes?.resetOriginals?.();
        announce('Layout reset');
        window.DeushimaGrid?.wake?.(850);
        window.setTimeout(() => stage.focus({ preventScroll: true }), reducedMotion.matches ? 0 : 300);
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
    menu.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'hero-custom-node-context__heading';
    heading.textContent = `NOTE ${String(model.note).padStart(2, '0')}`;
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

  function placeMenu(clientX, clientY) {
    const margin = 10;
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.add('is-open');
    menu.style.visibility = 'hidden';

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const left = clamp(clientX, margin, Math.max(margin, window.innerWidth - rect.width - margin));
      const top = clamp(clientY, margin, Math.max(margin, window.innerHeight - rect.height - margin));
      menu.style.setProperty('--menu-origin-x', clientX > window.innerWidth * .5 ? '100%' : '0%');
      menu.style.setProperty('--menu-origin-y', clientY > window.innerHeight * .5 ? '100%' : '0%');
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = '';

      const first = [...menu.querySelectorAll('[role="menuitem"]')]
        .find(item => item.getAttribute('aria-disabled') !== 'true');
      first?.focus({ preventScroll: true });
    });
  }

  function openCanvasMenu(clientX, clientY, origin = stage) {
    if (isModalOpen()) return;
    closeMenu(false);
    const point = stagePointFromClient(clientX, clientY);
    menuAnchor = {
      clientX,
      clientY,
      nx: point.nx,
      ny: point.ny
    };
    menuMode = 'canvas';
    menuNodeId = null;
    menuFocusOrigin = origin instanceof HTMLElement ? origin : stage;
    buildCanvasMenu();
    playSfx('chatOpen', { element: stage, gainScale: .76 });
    placeMenu(clientX, clientY);
  }

  function openNodeMenu(model, clientX, clientY, origin = model.el) {
    closeMenu(false);
    menuAnchor = { clientX, clientY, nx: model.x, ny: model.y };
    menuMode = 'node';
    menuNodeId = model.id;
    menuFocusOrigin = origin;
    buildNodeMenu(model);
    playSfx('chatOpen', { element: model.el, gainScale: .72 });
    placeMenu(clientX, clientY);
  }

  function closeMenu(restoreFocus = true) {
    window.clearTimeout(clearConfirmTimer);
    clearConfirmTimer = 0;
    if (!menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    const focusTarget = menuFocusOrigin;
    menuMode = null;
    menuNodeId = null;
    menuAnchor = null;
    menuFocusOrigin = null;

    window.setTimeout(() => {
      if (!menu.classList.contains('is-open')) menu.replaceChildren();
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

  hero.addEventListener('contextmenu', event => {
    if (performance.now() < longPressOpenedUntil) {
      event.preventDefault();
      return;
    }

    const customNodeEl = event.target.closest?.('[data-custom-node]');
    if (customNodeEl) {
      const model = models.get(customNodeEl.dataset.customNode);
      if (!model || isModalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      selectNode(model);
      openNodeMenu(model, event.clientX, event.clientY, customNodeEl);
      return;
    }

    if (!canOpenCanvasMenuAt(event.target, event.clientX, event.clientY)) return;
    event.preventDefault();
    openCanvasMenu(event.clientX, event.clientY, stage);
  });

  hero.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || isModalOpen()) return;
    if (!canOpenCanvasMenuAt(event.target, event.clientX, event.clientY)) return;

    clearLongPress();
    longPressState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      timer: window.setTimeout(() => {
        if (!longPressState) return;
        longPressOpenedUntil = performance.now() + 900;
        try { navigator.vibrate?.(8); } catch {}
        openCanvasMenu(longPressState.clientX, longPressState.clientY, stage);
        longPressState = null;
      }, LONG_PRESS_MS)
    };
  }, { passive: true });

  function moveLongPress(event) {
    if (!longPressState || event.pointerId !== longPressState.pointerId) return;
    const distance = Math.hypot(event.clientX - longPressState.startX, event.clientY - longPressState.startY);
    if (distance > LONG_PRESS_TOLERANCE) {
      clearLongPress();
      return;
    }
    longPressState.clientX = event.clientX;
    longPressState.clientY = event.clientY;
  }

  function clearLongPress(event = null) {
    if (event && longPressState && event.pointerId !== longPressState.pointerId) return;
    if (longPressState?.timer) window.clearTimeout(longPressState.timer);
    longPressState = null;
  }

  window.addEventListener('pointermove', event => {
    moveNodeDrag(event);
    moveConnection(event);
    moveLongPress(event);
  }, { passive: false });

  window.addEventListener('pointerup', event => {
    endNodeDrag(event);
    endConnection(event);
    clearLongPress(event);
  });

  window.addEventListener('pointercancel', event => {
    endNodeDrag(event);
    endConnection(event);
    clearLongPress(event);
  });

  document.addEventListener('pointerdown', event => {
    if (menu.classList.contains('is-open') && !menu.contains(event.target)) {
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
    if (menu.classList.contains('is-open')) return;

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

  window.addEventListener('scroll', () => closeMenu(false), { passive: true, capture: true });

  window.addEventListener('resize', () => {
    closeMenu(false);
    window.clearTimeout(resizeSaveTimer);
    resizeSaveTimer = window.setTimeout(() => {
      clampAllNodesAndSave(true);
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(600);
    }, 90);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (connectionRaf) cancelAnimationFrame(connectionRaf);
      connectionRaf = 0;
      closeMenu(false);
      return;
    }
    drawConnections();
    scheduleConnectionLoop();
  });

  coarsePointer.addEventListener?.('change', () => {
    hint.textContent = coarsePointer.matches ? 'Long-press for options' : 'Right-click for options';
  });

  stage.addEventListener('deushima:hero-layout-change', () => {
    if (menuMode === 'canvas' && menu.classList.contains('is-open')) buildCanvasMenu();
  });

  const resizeObserver = new ResizeObserver(() => {
    clampAllNodesAndSave(false);
    drawConnections();
    window.DeushimaGrid?.wake?.(360);
  });
  resizeObserver.observe(stage);

  function initialRestore() {
    restoreState();
    window.setTimeout(() => window.DeushimaGrid?.refreshDynamicNodes?.(), 120);
    window.setTimeout(() => {
      clampAllNodesAndSave(true);
      drawConnections();
      scheduleConnectionLoop();
      window.DeushimaGrid?.refreshDynamicNodes?.();
      window.DeushimaGrid?.wake?.(700);
    }, 700);
  }

  window.DeushimaCustomNodes = Object.freeze({
    storageKey: STORAGE_KEY,
    hintKey: HINT_KEY,
    maxNodes: MAX_NODES,
    nodeTypes: NODE_TYPES,
    createText: (x = .5, y = .5, text = '') => createTextNode({ x, y, text }),
    clear: clearAllNodes,
    getState: () => ({
      nodes: [...models.values()].map(model => ({
        id: model.id,
        note: model.note,
        text: model.text,
        x: model.x,
        y: model.y,
        z: model.z
      })),
      connections: connections.map(connection => ({ ...connection })),
      editingNodeId,
      selectedNodeId,
      selectedConnectionId,
      menuOpen: menu.classList.contains('is-open')
    })
  });

  initialRestore();
})();
