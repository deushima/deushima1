(() => {
  const chat = document.querySelector('[data-chat]');
  if (!chat) return;

  const feed = chat.querySelector('[data-chat-feed]');
  const form = chat.querySelector('[data-chat-form]');
  const textarea = form?.elements?.message;
  const status = chat.querySelector('[data-chat-status]');
  const suggestionButtons = [...chat.querySelectorAll('[data-chat-suggestions] button')];
  let busy = false;

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

  const appendMessage = (role, text) => {
    if (!feed) return;
    const article = document.createElement('article');
    article.className = `deu-chat-message deu-chat-message--${role === 'user' ? 'user' : 'bot'}`;
    const tag = document.createElement('span');
    tag.textContent = role === 'user' ? 'YOU' : 'D/AI';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    article.append(tag, paragraph);
    feed.appendChild(article);
    feed.scrollTop = feed.scrollHeight;
  };

  const openChat = () => {
    chat.classList.add('is-open');
    chat.setAttribute('aria-hidden', 'false');
    document.body.classList.add('deu-chat-open');
    window.setTimeout(() => textarea?.focus(), 160);
  };

  const closeChat = () => {
    chat.classList.remove('is-open');
    chat.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('deu-chat-open');
  };

  const askAssistant = async (message) => {
    const fallback = localAnswer(message);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (typeof data.reply === 'string' && data.reply.trim()) {
        if (status) status.textContent = data.mode === 'ai' ? 'PORTFOLIO KNOWLEDGE / AI ONLINE' : 'PORTFOLIO KNOWLEDGE / LOCAL';
        return data.reply.trim();
      }
    } catch {}
    if (status) status.textContent = 'PORTFOLIO KNOWLEDGE / LOCAL MODE';
    return fallback;
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy;
    suggestionButtons.forEach((button) => {
      button.disabled = nextBusy;
      button.setAttribute('aria-disabled', String(nextBusy));
    });
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
    if (status) status.textContent = 'D/AI / THINKING…';

    try {
      const reply = await askAssistant(message);
      appendMessage('bot', reply);
    } finally {
      setBusy(false);
      textarea?.focus({ preventScroll: true });
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

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!textarea) return;
    await sendMessage(textarea.value);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && chat.classList.contains('is-open')) closeChat();
  });
})();
