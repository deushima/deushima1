(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const boot = $('[data-boot]');
  window.addEventListener('load', () => {
    window.setTimeout(() => boot?.classList.add('is-hidden'), prefersReducedMotion ? 20 : 900);
  });

  const clock = $('[data-clock]');
  const updateClock = () => {
    if (!clock) return;
    clock.textContent = new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires'
    }).format(new Date());
  };
  updateClock();
  window.setInterval(updateClock, 1000);

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

  $$('.reveal').forEach((el, index) => {
    if (el.closest('.hero')) el.style.transitionDelay = `${Math.min(index * 55, 330)}ms`;
    revealObserver.observe(el);
  });

  const transition = $('[data-page-transition]');
  $$('[data-transition-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const href = link.getAttribute('href');
      transition?.classList.add('is-active');
      window.setTimeout(() => {
        window.location.href = href;
      }, prefersReducedMotion ? 20 : 540);
    });
  });

  const spatialRoot = $('[data-spatial-menu]');
  const spatialCanvas = $('[data-spatial-canvas]');
  const spatialNodes = $$('[data-spatial-node]');

  if (spatialRoot && spatialCanvas && spatialNodes.length) {
    const ctx = spatialCanvas.getContext('2d');
    const state = {
      pointerX: 0,
      pointerY: 0,
      pointerTargetX: 0,
      pointerTargetY: 0,
      rotation: 0,
      width: 1,
      height: 1,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    };

    const baseVertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
      [0, -1.65, 0], [1.65, 0, 0], [0, 1.65, 0], [-1.65, 0, 0]
    ];
    const edges = [
      [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],
      [8,0],[8,1],[8,4],[8,5],[9,1],[9,2],[9,5],[9,6],[10,2],[10,3],[10,6],[10,7],
      [11,0],[11,3],[11,4],[11,7]
    ];
    const nodeVectors = [
      [-1.7, -0.62, 0.5],
      [1.58, -0.78, -0.1],
      [1.25, 1.05, 0.6],
      [-1.38, 1.02, -0.6]
    ];

    const resizeSpatial = () => {
      const rect = spatialRoot.getBoundingClientRect();
      state.width = Math.max(1, rect.width);
      state.height = Math.max(1, rect.height);
      spatialCanvas.width = Math.round(state.width * state.dpr);
      spatialCanvas.height = Math.round(state.height * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };

    const rotatePoint = ([x, y, z], t) => {
      const ay = t * 0.72 + state.pointerX * 0.44;
      const ax = -0.34 + state.pointerY * 0.34 + Math.sin(t * 0.35) * 0.08;
      const az = t * 0.13;

      let x1 = x * Math.cos(ay) - z * Math.sin(ay);
      let z1 = x * Math.sin(ay) + z * Math.cos(ay);
      let y1 = y;

      let y2 = y1 * Math.cos(ax) - z1 * Math.sin(ax);
      let z2 = y1 * Math.sin(ax) + z1 * Math.cos(ax);
      let x2 = x1;

      const x3 = x2 * Math.cos(az) - y2 * Math.sin(az);
      const y3 = x2 * Math.sin(az) + y2 * Math.cos(az);
      return [x3, y3, z2];
    };

    const project = ([x, y, z]) => {
      const depth = 5.8;
      const perspective = depth / (depth - z);
      const scale = Math.min(state.width, state.height) * 0.15;
      return {
        x: state.width * 0.5 + x * scale * perspective,
        y: state.height * 0.5 + y * scale * perspective,
        z,
        perspective
      };
    };

    const drawSpatial = (time) => {
      const t = time * 0.00035;
      state.pointerX += (state.pointerTargetX - state.pointerX) * 0.055;
      state.pointerY += (state.pointerTargetY - state.pointerY) * 0.055;
      state.rotation = t;

      ctx.clearRect(0, 0, state.width, state.height);
      const projected = baseVertices.map((point) => project(rotatePoint(point, t)));

      ctx.lineWidth = 1;
      edges.forEach(([a, b]) => {
        const p1 = projected[a];
        const p2 = projected[b];
        const avgZ = (p1.z + p2.z) * 0.5;
        const alpha = Math.max(0.06, Math.min(0.34, 0.17 + avgZ * 0.05));
        ctx.strokeStyle = `rgba(242,242,239,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      projected.forEach((p, index) => {
        const r = index >= 8 ? 2.1 : 1.5;
        ctx.fillStyle = index >= 8 ? 'rgba(217,255,79,.78)' : 'rgba(255,255,255,.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * p.perspective, 0, Math.PI * 2);
        ctx.fill();
      });

      nodeVectors.forEach((vector, index) => {
        const p = project(rotatePoint(vector, t * 0.78 + index * 0.12));
        const node = spatialNodes[index];
        if (!node) return;
        const scale = Math.max(0.82, Math.min(1.06, 0.94 + p.z * 0.035));
        const opacity = Math.max(0.66, Math.min(1, 0.86 + p.z * 0.04));
        const halfWidth = node.offsetWidth / 2;
        const halfHeight = node.offsetHeight / 2;
        const edgePadding = state.width < 600 ? 8 : 2;
        const x = Math.max(halfWidth + edgePadding, Math.min(state.width - halfWidth - edgePadding, p.x));
        const y = Math.max(halfHeight + edgePadding, Math.min(state.height - halfHeight - edgePadding, p.y));
        node.style.transform = `translate3d(${x - halfWidth}px, ${y - halfHeight}px, 0) scale(${scale})`;
        node.style.opacity = opacity.toFixed(3);
        node.style.zIndex = String(10 + Math.round((p.z + 3) * 3));
      });

      if (!prefersReducedMotion) requestAnimationFrame(drawSpatial);
    };

    spatialRoot.addEventListener('pointermove', (event) => {
      const rect = spatialRoot.getBoundingClientRect();
      state.pointerTargetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      state.pointerTargetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    });
    spatialRoot.addEventListener('pointerleave', () => {
      state.pointerTargetX = 0;
      state.pointerTargetY = 0;
    });

    resizeSpatial();
    new ResizeObserver(resizeSpatial).observe(spatialRoot);
    if (prefersReducedMotion) drawSpatial(0);
    else requestAnimationFrame(drawSpatial);
  }

  $$('[data-tilt-card]').forEach((card) => {
    const media = $('.work-card__media', card);
    if (!media || prefersReducedMotion || window.matchMedia('(pointer: coarse)').matches) return;

    card.addEventListener('pointermove', (event) => {
      const rect = media.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      media.style.transform = `rotateX(${(-y * 3.2).toFixed(2)}deg) rotateY(${(x * 4.2).toFixed(2)}deg)`;
    });
    card.addEventListener('pointerleave', () => {
      media.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  });

  const capabilityOrbit = $('[data-capability-orbit]');
  if (capabilityOrbit) {
    const items = $$('button', capabilityOrbit);
    const positionCapabilities = (time = 0) => {
      const width = capabilityOrbit.clientWidth;
      const height = capabilityOrbit.clientHeight;
      const rx = Math.max(105, width * 0.34);
      const ry = Math.max(125, height * 0.35);
      const t = time * 0.00018;

      items.forEach((item, index) => {
        const angle = (index / items.length) * Math.PI * 2 + t;
        const depth = Math.sin(angle + 0.8);
        const x = width * 0.5 + Math.cos(angle) * rx;
        const y = height * 0.5 + Math.sin(angle * 1.12) * ry * 0.72;
        const scale = 0.84 + (depth + 1) * 0.08;
        item.style.transform = `translate(-50%, -50%) translate(${(x - width * 0.5).toFixed(1)}px, ${(y - height * 0.5).toFixed(1)}px) scale(${scale.toFixed(3)})`;
        item.style.opacity = String(0.56 + (depth + 1) * 0.2);
        item.style.zIndex = String(5 + Math.round((depth + 1) * 4));
      });

      if (!prefersReducedMotion) requestAnimationFrame(positionCapabilities);
    };

    items.forEach((item) => {
      item.addEventListener('click', () => {
        const label = item.dataset.capability || item.textContent.trim();
        openChat(`Contame más sobre ${label}`);
      });
    });
    positionCapabilities();
  }

  const chat = $('[data-chat]');
  const chatPanel = $('.chat__panel', chat || document);
  const chatFeed = $('[data-chat-feed]');
  const chatForm = $('[data-chat-form]');
  const chatTextarea = chatForm?.elements?.message;
  const chatStatus = $('[data-chat-status]');
  let chatBusy = false;

  const portfolioContext = {
    identity: 'Deushima es la práctica independiente de Iván Lautaro Rodríguez, diseñador gráfico y director visual radicado en Buenos Aires, Argentina.',
    work: 'Su trabajo combina dirección visual, diseño gráfico, campañas, identidad, packaging, social content, motion, 3D, IA generativa y creative coding.',
    current: 'Actualmente Iván forma parte del equipo de diseño de SushiClub Argentina y desarrolla Deushima como laboratorio creativo independiente.',
    lab: '3Deushima es un workspace interactivo en tiempo real para explorar materiales, forma, extrusión y comportamiento visual de la marca.',
    contact: 'Para proyectos y colaboraciones se puede escribir a deushima@gmail.com o usar los enlaces de Behance, Instagram y LinkedIn del sitio.'
  };

  function localAnswer(input) {
    const text = input.toLowerCase();
    if (/3d|launcher|lab|three|webgl/.test(text)) {
      return `${portfolioContext.lab}\n\nPodés abrirlo desde “3D Lab” en la navegación o desde la sección Interactive Laboratory.`;
    }
    if (/sushi|trabaja|trabajo actual|actualmente|empleo/.test(text)) {
      return portfolioContext.current;
    }
    if (/contact|mail|correo|contratar|proyecto|colabor/.test(text)) {
      return portfolioContext.contact;
    }
    if (/qué hace|que hace|servicio|especialidad|diseñ|ai|ia|motion|branding|packaging|campaña/.test(text)) {
      return `${portfolioContext.identity} ${portfolioContext.work}`;
    }
    if (/quién|quien|ivan|iván|about|perfil/.test(text)) {
      return `${portfolioContext.identity} ${portfolioContext.current}`;
    }
    return `Puedo orientarte sobre el perfil de Iván, sus áreas de trabajo, 3Deushima, proyectos seleccionados y contacto. ${portfolioContext.work}`;
  }

  function addChatMessage(role, text) {
    if (!chatFeed) return;
    const article = document.createElement('article');
    article.className = `chat-message chat-message--${role === 'user' ? 'user' : 'bot'}`;
    const tag = document.createElement('span');
    tag.className = 'mono';
    tag.textContent = role === 'user' ? 'YOU' : 'D/AI';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    article.append(tag, paragraph);
    chatFeed.appendChild(article);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  async function askAssistant(message) {
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
        if (chatStatus) chatStatus.textContent = data.mode === 'ai' ? 'PORTFOLIO KNOWLEDGE / AI ONLINE' : 'PORTFOLIO KNOWLEDGE / LOCAL';
        return data.reply.trim();
      }
      return fallback;
    } catch {
      if (chatStatus) chatStatus.textContent = 'PORTFOLIO KNOWLEDGE / LOCAL MODE';
      return fallback;
    }
  }

  function openChat(prefill = '') {
    if (!chat) return;
    chat.classList.add('is-open');
    chat.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chat-open');
    if (prefill && chatTextarea) chatTextarea.value = prefill;
    window.setTimeout(() => chatTextarea?.focus(), 180);
  }

  function closeChat() {
    if (!chat) return;
    chat.classList.remove('is-open');
    chat.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chat-open');
  }

  $$('[data-chat-open]').forEach((button) => button.addEventListener('click', () => openChat()));
  $$('[data-chat-close]').forEach((button) => button.addEventListener('click', closeChat));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && chat?.classList.contains('is-open')) closeChat();
  });

  $$('[data-chat-suggestions] button').forEach((button) => {
    button.addEventListener('click', () => {
      if (!chatTextarea) return;
      chatTextarea.value = button.textContent.trim();
      chatForm?.requestSubmit();
    });
  });

  chatTextarea?.addEventListener('input', () => {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = `${Math.min(chatTextarea.scrollHeight, 140)}px`;
  });

  chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (chatBusy || !chatTextarea) return;
    const message = chatTextarea.value.trim();
    if (!message) return;

    chatBusy = true;
    addChatMessage('user', message);
    chatTextarea.value = '';
    chatTextarea.style.height = 'auto';
    if (chatStatus) chatStatus.textContent = 'D/AI / THINKING…';

    const reply = await askAssistant(message);
    addChatMessage('bot', reply);
    chatBusy = false;
  });

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const id = anchor.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  });
})();
