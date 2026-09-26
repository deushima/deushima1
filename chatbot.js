(() => {
  const chat = document.querySelector('[data-chat]');
  if (!chat) return;

  const feed = chat.querySelector('[data-chat-feed]');
  const form = chat.querySelector('[data-chat-form]');
  const textarea = form?.elements?.message;
  const submitButton = form?.querySelector('button[type="submit"]');
  const status = chat.querySelector('[data-chat-status]');
  const suggestionButtons = [...chat.querySelectorAll('[data-chat-suggestions] button')];
  let busy = false;
  let pendingMessage = null;
  let focusTimer = 0;
  let focusOrigin = null;
  chat.inert = true;

  const presetPrompts = {
    what: '¿Qué hace Deushima?',
    work: '¿En qué trabaja Iván?',
    lab: 'Mostrame el 3D Lab'
  };

  const context = {
    identity: 'Deushima es la práctica independiente de Iván Lautaro Rodríguez, diseñador gráfico y director visual radicado en Buenos Aires, Argentina.',
    work: 'Su trabajo combina dirección visual, diseño gráfico, campañas, identidad, packaging, social content, motion, 3D, IA generativa y creative coding.',
    current: 'Actualmente Iván forma parte del equipo de diseño de SushiClub Argentina y desarrolla Deushima como laboratorio creativo independiente.',
    lab: '3Deushima es un workspace interactivo en tiempo real para explorar materiales, forma, extrusión y comportamiento visual de la marca.',
    contact: 'Para proyectos y colaboraciones se puede escribir a deushima@gmail.com o usar los enlaces de Behance, Instagram y LinkedIn del sitio.'
  };

  const localAnswer = (input) => {
    const text = String(input || '').toLowerCase();
    if (/3d|launcher|lab|three|webgl/.test(text)) return `${context.lab}\n\nPodés abrirlo desde “Launcher 3D” en el portfolio.`;
    if (/sushi|trabaja|trabajo actual|actualmente|empleo/.test(text)) return context.current;
    if (/contact|mail|correo|contratar|proyecto|colabor/.test(text)) return context.contact;
    if (/qué hace|que hace|servicio|especialidad|diseñ|ai|ia|motion|branding|packaging|campaña/.test(text)) return `${context.identity} ${context.work}`;
    if (/quién|quien|ivan|iván|about|perfil/.test(text)) return `${context.identity} ${context.current}`;
    return `Puedo orientarte sobre el perfil de Iván, sus áreas de trabajo, 3Deushima, proyectos seleccionados y contacto. ${context.work}`;
  };

  const internalMetadataLine = /^(?:user\s+safety|assistant\s+safety|safety(?:\s+(?:status|rating|classification))?|moderation(?:\s+(?:status|result))?)\s*:\s*(?:safe|unsafe|allowed|blocked|pass(?:ed)?|ok|none|low|medium|high|true|false)\s*\.?$/i;
  const internalMetadataPrefix = /^(?:user\s+safety|assistant\s+safety|safety(?:\s+(?:status|rating|classification))?|moderation(?:\s+(?:status|result))?)\s*:/i;

  const sanitizeRemoteReply = (value) => {
    if (typeof value !== 'string') return '';

    const cleaned = value
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !internalMetadataLine.test(line))
      .join('\n')
      .trim();

    if (!cleaned) return '';
    if (cleaned.length <= 180 && internalMetadataPrefix.test(cleaned)) return '';
    return cleaned;
  };

  const scrollFeedToLatest = () => {
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  };

  const appendMessage = (role, text) => {
    if (!feed) return null;
    const article = document.createElement('article');
    article.className = `deu-chat-message deu-chat-message--${role === 'user' ? 'user' : 'bot'}`;
    const tag = document.createElement('span');
    tag.textContent = role === 'user' ? 'YOU' : 'D/AI';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    article.append(tag, paragraph);
    feed.appendChild(article);
    scrollFeedToLatest();
    return article;
  };

  const appendProcessingMessage = () => {
    if (!feed) return null;

    const article = document.createElement('article');
    article.className = 'deu-chat-message deu-chat-message--bot deu-chat-message--processing';
    article.setAttribute('role', 'status');
    article.setAttribute('aria-label', 'D/AI procesando respuesta');

    const tag = document.createElement('span');
    tag.textContent = 'D/AI';

    const processing = document.createElement('div');
    processing.className = 'deu-chat-processing';

    const label = document.createElement('span');
    label.className = 'deu-chat-processing__label';
    label.textContent = 'Procesando respuesta';

    const dots = document.createElement('span');
    dots.className = 'deu-chat-processing__dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      dots.appendChild(document.createElement('i'));
    }

    processing.append(label, dots);
    article.append(tag, processing);
    feed.appendChild(article);
    scrollFeedToLatest();
    return article;
  };

  const resolveProcessingMessage = (text) => {
    if (!pendingMessage || !pendingMessage.isConnected) {
      pendingMessage = null;
      appendMessage('bot', text);
      return;
    }

    const processing = pendingMessage.querySelector('.deu-chat-processing');
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    processing?.replaceWith(paragraph);
    pendingMessage.classList.remove('deu-chat-message--processing');
    pendingMessage.classList.add('deu-chat-message--resolved');
    pendingMessage.removeAttribute('role');
    pendingMessage.removeAttribute('aria-label');
    pendingMessage = null;
    scrollFeedToLatest();
  };

  const openChat = () => {
    focusOrigin = document.activeElement;
    chat.inert = false;
    chat.classList.add('is-open');
    chat.setAttribute('aria-hidden', 'false');
    document.body.classList.add('deu-chat-open');
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      if (chat.classList.contains('is-open')) textarea?.focus({ preventScroll: true });
    }, 160);
  };

  const closeChat = () => {
    window.clearTimeout(focusTimer);
    if (chat.contains(document.activeElement)) focusOrigin?.focus?.({ preventScroll: true });
    chat.classList.remove('is-open');
    chat.setAttribute('aria-hidden', 'true');
    chat.inert = true;
    document.body.classList.remove('deu-chat-open');
  };

  const askAssistant = async (message) => {
    const fallback = localAnswer(message);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/chat', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = sanitizeRemoteReply(data.reply);

      if (reply) {
        if (status) status.textContent = data.mode === 'ai' ? 'PORTFOLIO KNOWLEDGE / AI ONLINE' : 'PORTFOLIO KNOWLEDGE / LOCAL';
        return reply;
      }

      if (typeof data.reply === 'string' && data.reply.trim()) {
        console.warn('D/AI ignored internal provider metadata instead of rendering it.');
      }
    } catch {} finally {
      window.clearTimeout(timeout);
    }

    if (status) status.textContent = 'PORTFOLIO KNOWLEDGE / LOCAL MODE';
    return fallback;
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy;
    chat.classList.toggle('is-busy', nextBusy);
    chat.setAttribute('aria-busy', String(nextBusy));
    form?.setAttribute('aria-busy', String(nextBusy));

    suggestionButtons.forEach((button) => {
      button.disabled = nextBusy;
      button.setAttribute('aria-disabled', String(nextBusy));
    });

    if (submitButton) {
      submitButton.disabled = nextBusy;
      submitButton.setAttribute('aria-disabled', String(nextBusy));
    }
  };

  const sendMessage = async (rawMessage) => {
    if (busy) return;
    const message = String(rawMessage || '').normalize('NFC').trim();
    if (!message) return;

    setBusy(true);
    appendMessage('user', message);
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    pendingMessage = appendProcessingMessage();
    if (status) status.textContent = 'D/AI / PROCESANDO…';

    try {
      const reply = await askAssistant(message);
      resolveProcessingMessage(reply);
    } finally {
      if (pendingMessage?.isConnected) pendingMessage.remove();
      pendingMessage = null;
      setBusy(false);
      if (chat.classList.contains('is-open')) textarea?.focus({ preventScroll: true });
    }
  };

  document.querySelectorAll('[data-chat-open]').forEach((button) => button.addEventListener('click', openChat));
  chat.querySelectorAll('[data-chat-close]').forEach((button) => button.addEventListener('click', closeChat));

  suggestionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const prompt = presetPrompts[button.dataset.chatSuggestion];
      if (!prompt) return;
      sendMessage(prompt);
    });
  });

  textarea?.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  });

  textarea?.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (busy) return;
    form?.requestSubmit();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!textarea) return;
    await sendMessage(textarea.value);
  });

  document.addEventListener('keydown', (event) => {
    if (!chat.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChat();
    }
    if (event.key === 'Tab') {
      const items = [...chat.querySelectorAll('.deu-chat__panel button:not(:disabled), .deu-chat__panel textarea')];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !chat.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !chat.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    }
  });
})();

(() => {
  const compactQuery = window.matchMedia('(max-width: 760px)');
  const panel = document.querySelector('[data-panel="contact"]');
  const video = panel?.querySelector('.contact-media__video');
  if (!panel || !video) return;

  const mobileSource = 'Video%20Background/Video%20footer%20mobile.mp4';
  let mobileSourceApplied = false;

  const isOpen = () => panel.classList.contains('is-panel-open') || panel.getAttribute('aria-hidden') === 'false';

  const applyMobileSource = () => {
    if (!compactQuery.matches) return;

    if (!mobileSourceApplied || video.getAttribute('src') !== mobileSource) {
      video.src = mobileSource;
      video.dataset.mobileContactSource = 'true';
      video.load();
      mobileSourceApplied = true;
    }

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const pauseMobileVideo = () => {
    if (!compactQuery.matches) return;
    video.pause();
    video.preload = 'none';
  };

  const restoreDesktopSource = () => {
    if (compactQuery.matches || video.dataset.mobileContactSource !== 'true') return;
    video.pause();
    video.removeAttribute('src');
    delete video.dataset.mobileContactSource;
    mobileSourceApplied = false;
    video.load();
    if (isOpen()) {
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      const playPromise = video.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    }
  };

  const sync = () => {
    if (compactQuery.matches) {
      if (isOpen()) {
        requestAnimationFrame(() => {
          applyMobileSource();
          window.setTimeout(applyMobileSource, 80);
        });
      } else {
        pauseMobileVideo();
      }
      return;
    }

    restoreDesktopSource();
  };

  const observer = new MutationObserver(sync);
  observer.observe(panel, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  compactQuery.addEventListener?.('change', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      video.pause();
      return;
    }
    sync();
  }, { passive: true });

  sync();
})();
