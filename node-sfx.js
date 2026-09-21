(() => {
  'use strict';

  const stage = document.querySelector('[data-hero-node-stage][data-sfx-scope="nodes"]');
  const chat = document.querySelector('[data-chat]');
  if (!stage && !chat) return;

  const nodes = stage ? [...stage.querySelectorAll('[data-sfx="node"][data-hero-node]')] : [];
  const resetButton = stage?.querySelector('[data-sfx="reset"]');
  const disconnectButton = stage?.querySelector('[data-sfx="disconnect"]');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const chatFeed = chat?.querySelector('[data-chat-feed]');
  const chatForm = chat?.querySelector('[data-chat-form]');
  const chatTextarea = chatForm?.elements?.message;
  const chatSuggestions = chat ? [...chat.querySelectorAll('[data-chat-suggestions] button')] : [];

  // +6 dB aprox. respecto del master anterior (0.24).
  // Es el único control de nivel general de los SFX y no depende de la música.
  const SFX_MASTER_VOLUME = 0.48;

  const CONFIG = {
    master: {
      gain: SFX_MASTER_VOLUME,
      maxVoices: 6,
      hoverMinInterval: 60,
      comboWindow: 600,
      comboReset: 800,
      panAmount: 0.58,
      dragUpdateMs: 44
    },
    limiter: {
      threshold: -5.5,
      knee: 0,
      ratio: 20,
      attack: 0.0015,
      release: 0.085
    },
    reverb: {
      duration: 0.115,
      decay: 4.8,
      wet: 0.085
    },
    notes: {
      works: 261.63,
      about: 293.66,
      launcher: 329.63,
      chat: 392,
      contact: 440
    },
    sounds: {
      nodeAppearance: {
        file: null,
        gain: 0.92,
        duration: 0.115,
        transientGain: 0.075,
        bodyGain: 0.16
      },
      nodeHover: {
        file: null,
        gain: 1,
        duration: 0.095,
        transientGain: 0.08,
        bodyGain: 0.17
      },
      port: {
        file: null,
        gain: 0.72,
        duration: 0.045,
        transientGain: 0.065,
        bodyGain: 0.105
      },
      nodeClick: {
        file: null,
        gain: 1.06,
        duration: 0.155,
        transientGain: 0.105,
        bodyGain: 0.21,
        thumpGain: 0.15
      },
      pickup: {
        file: null,
        gain: 0.82,
        duration: 0.082,
        transientGain: 0.07,
        bodyGain: 0.13
      },
      drop: {
        file: null,
        gain: 0.98,
        duration: 0.135,
        transientGain: 0.09,
        bodyGain: 0.18
      },
      reset: {
        file: null,
        gain: 0.9,
        duration: 0.18,
        transientGain: 0.072,
        bodyGain: 0.14
      },
      lineShimmer: {
        file: null,
        gain: 0.54,
        duration: 0.16,
        transientGain: 0.055,
        bodyGain: 0.07
      },
      link: {
        file: null,
        gain: 0.82,
        duration: 0.13,
        transientGain: 0.07,
        bodyGain: 0.13
      },
      disconnect: {
        file: null,
        gain: 0.72,
        duration: 0.075,
        transientGain: 0.08,
        bodyGain: 0.105
      },
      chatType: {
        files: [null, null, null, null],
        gain: 1,
        duration: 0.038,
        transientGain: 0.105,
        bodyGain: 0.16,
        variants: [188, 205, 224, 242]
      },
      chatSpace: {
        file: null,
        gain: 1.04,
        duration: 0.046,
        transientGain: 0.105,
        bodyGain: 0.18,
        frequency: 154
      },
      chatDelete: {
        file: null,
        gain: 0.76,
        duration: 0.04,
        transientGain: 0.07,
        bodyGain: 0.13,
        frequency: 138
      },
      chatSend: {
        file: null,
        gain: 0.94,
        duration: 0.14,
        transientGain: 0.085,
        bodyGain: 0.18
      },
      chatReceive: {
        file: null,
        gain: 0.78,
        duration: 0.16,
        transientGain: 0.06,
        bodyGain: 0.15
      },
      chatStream: {
        file: null,
        gain: 0.34,
        duration: 0.026,
        transientGain: 0.035,
        bodyGain: 0.055
      },
      chipHover: {
        file: null,
        gain: 0.54,
        duration: 0.052,
        transientGain: 0.055,
        bodyGain: 0.09
      },
      chipClick: {
        file: null,
        gain: 0.82,
        duration: 0.105,
        transientGain: 0.08,
        bodyGain: 0.15
      },
      chatOpen: {
        file: null,
        gain: 0.76,
        duration: 0.14,
        transientGain: 0.065,
        bodyGain: 0.14
      },
      chatClose: {
        file: null,
        gain: 0.68,
        duration: 0.13,
        transientGain: 0.06,
        bodyGain: 0.125
      }
    }
  };

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  let context = null;
  let masterGain = null;
  let limiter = null;
  let reverb = null;
  let reverbWet = null;
  let noiseBuffer = null;
  let unlocked = false;
  let stageVisible = false;
  let appearancePlayed = false;
  let appearanceQueued = false;
  let activeVoices = new Set();
  let pointerState = null;
  let connectionPointer = null;
  let dragVoice = null;
  let lastHoverAt = 0;
  let comboLevel = 0;
  let comboResetTimer = 0;
  let lastPointerTap = { node: null, time: 0 };
  let lastLineHoverAt = 0;

  let typingVariant = 0;
  let lastTypingSoundAt = 0;
  let lastPhysicalKeyAt = 0;
  let lastPhysicalInputKind = '';
  let lastReceiveAt = 0;
  let lastStreamTapAt = 0;
  let resolvedMessages = new WeakSet();

  const buffers = new Map();
  const pendingBuffers = new Map();
  const stats = Object.create(null);

  function recordStat(name) {
    stats[name] = (stats[name] || 0) + 1;
  }

  function randomFactor(range = 0.05) {
    return 1 + ((Math.random() * 2) - 1) * range;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function canPlay() {
    return Boolean(
      context &&
      unlocked &&
      context.state === 'running' &&
      !document.hidden
    );
  }

  function makeNoiseBuffer() {
    if (!context) return null;
    const length = Math.max(1, Math.floor(context.sampleRate * 0.24));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function makeReverbImpulse() {
    if (!context) return null;
    const length = Math.max(1, Math.floor(context.sampleRate * CONFIG.reverb.duration));
    const impulse = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        const decay = Math.pow(1 - progress, CONFIG.reverb.decay);
        data[index] = (Math.random() * 2 - 1) * decay * 0.72;
      }
    }

    return impulse;
  }

  function ensureContext() {
    if (context || !AudioContextCtor) return context;

    context = new AudioContextCtor({ latencyHint: 'interactive' });
    masterGain = context.createGain();
    limiter = context.createDynamicsCompressor();
    reverb = context.createConvolver();
    reverbWet = context.createGain();

    limiter.threshold.value = CONFIG.limiter.threshold;
    limiter.knee.value = CONFIG.limiter.knee;
    limiter.ratio.value = CONFIG.limiter.ratio;
    limiter.attack.value = CONFIG.limiter.attack;
    limiter.release.value = CONFIG.limiter.release;

    masterGain.gain.value = CONFIG.master.gain;
    reverbWet.gain.value = CONFIG.reverb.wet;
    reverb.buffer = makeReverbImpulse();

    masterGain.connect(limiter);
    reverb.connect(reverbWet);
    reverbWet.connect(limiter);
    limiter.connect(context.destination);

    noiseBuffer = makeNoiseBuffer();
    return context;
  }

  async function unlock() {
    ensureContext();
    if (!context) return false;

    try {
      if (context.state === 'suspended') await context.resume();
      unlocked = context.state === 'running';
    } catch {
      unlocked = false;
    }

    if (unlocked) {
      preloadConfiguredFiles();
      maybePlayAppearance();
    }

    return unlocked;
  }

  function cleanupVoices() {
    const now = performance.now();
    activeVoices.forEach((voice) => {
      if (!voice.sustained && voice.endsAt <= now) {
        activeVoices.delete(voice);
      }
    });
  }

  function connectVoiceOutput(node, panner) {
    if (panner) {
      node.connect(panner);
      panner.connect(masterGain);
      panner.connect(reverb);
      return;
    }

    node.connect(masterGain);
    node.connect(reverb);
  }

  function panForElement(element) {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const normalized = (center / Math.max(1, window.innerWidth)) * 2 - 1;
    return clamp(normalized * CONFIG.master.panAmount, -CONFIG.master.panAmount, CONFIG.master.panAmount);
  }

  function createVoice(element, durationMs, overallGain = 1, sustained = false, forcedPan = null) {
    cleanupVoices();
    if (!canPlay() || activeVoices.size >= CONFIG.master.maxVoices) return null;

    const input = context.createGain();
    const panValue = forcedPan == null ? panForElement(element) : forcedPan;
    const panner = typeof context.createStereoPanner === 'function'
      ? context.createStereoPanner()
      : null;

    input.gain.value = overallGain * randomFactor(0.055);
    if (panner) panner.pan.value = panValue;
    connectVoiceOutput(input, panner);

    const voice = {
      input,
      panner,
      pan: panValue,
      pitch: randomFactor(0.05),
      sustained,
      ended: false,
      endsAt: performance.now() + durationMs + 140
    };

    activeVoices.add(voice);

    if (!sustained) {
      window.setTimeout(() => endVoice(voice), durationMs + 120);
    }

    return voice;
  }

  function endVoice(voice) {
    if (!voice || voice.ended) return;
    voice.ended = true;
    activeVoices.delete(voice);
    try { voice.input.disconnect(); } catch {}
    try { voice.panner?.disconnect(); } catch {}
  }

  function envelopeGain(voice, start, duration, peak, attack = 0.003, releaseCurve = true) {
    const gain = context.createGain();
    const end = start + duration;
    const safePeak = Math.max(0.0002, peak);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safePeak, start + Math.min(attack, duration * 0.28));

    if (releaseCurve) {
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      gain.gain.linearRampToValueAtTime(0.0001, end);
    }

    gain.connect(voice.input);
    return gain;
  }

  function transientNoise(voice, {
    duration = 0.018,
    gain = 0.08,
    frequency = 1500,
    q = 0.75,
    delay = 0,
    type = 'bandpass'
  } = {}) {
    if (!voice || !context || !noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amplitude = envelopeGain(voice, start, duration, gain * randomFactor(0.08), 0.0015);

    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = Math.max(90, frequency * randomFactor(0.06));
    filter.Q.value = q;

    source.connect(filter);
    filter.connect(amplitude);
    source.start(start);
    source.stop(start + duration + 0.008);
  }

  function tonalBody(voice, {
    frequency,
    endRatio = 0.68,
    duration = 0.09,
    gain = 0.14,
    delay = 0,
    type = 'triangle',
    filterFrequency = 1350,
    attack = 0.003
  }) {
    if (!voice || !context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amplitude = envelopeGain(voice, start, duration, gain * randomFactor(0.07), attack);
    const startFrequency = Math.max(35, frequency * voice.pitch);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(30, startFrequency * endRatio),
      start + Math.max(0.018, duration * 0.72)
    );

    filter.type = 'lowpass';
    filter.frequency.value = Math.max(220, filterFrequency * randomFactor(0.035));
    filter.Q.value = 0.72;

    oscillator.connect(filter);
    filter.connect(amplitude);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.012);
  }

  function resonantBody(voice, {
    frequency,
    duration,
    gain,
    delay = 0,
    ratio = 2.78,
    filterFrequency = 1800
  }) {
    tonalBody(voice, {
      frequency: frequency * ratio,
      endRatio: 0.74,
      duration: duration * 0.62,
      gain,
      delay,
      type: 'triangle',
      filterFrequency
    });
  }

  function organicHit(element, sound, frequency, {
    kind = 'mallet',
    pan = null,
    secondNote = null,
    boing = false
  } = {}) {
    const durationMs = Math.ceil((sound.duration + 0.09) * 1000);
    const voice = createVoice(element, durationMs, sound.gain, false, pan);
    if (!voice) return null;

    const transientFrequency = kind === 'thock' ? 1250 : kind === 'bubble' ? 1850 : 1550;
    transientNoise(voice, {
      duration: kind === 'thock' ? 0.015 : 0.018,
      gain: sound.transientGain,
      frequency: transientFrequency,
      q: kind === 'wood' ? 1.15 : 0.72
    });

    const endRatio = kind === 'bubble' ? 0.56 : kind === 'thock' ? 0.72 : 0.64;
    const filterFrequency = kind === 'thock' ? 920 : kind === 'wood' ? 1420 : 1700;

    tonalBody(voice, {
      frequency,
      endRatio,
      duration: sound.duration,
      gain: sound.bodyGain,
      type: 'triangle',
      filterFrequency
    });

    if (kind === 'wood' || kind === 'mallet') {
      resonantBody(voice, {
        frequency,
        duration: sound.duration,
        gain: sound.bodyGain * 0.23,
        delay: 0.002,
        ratio: kind === 'wood' ? 2.92 : 2.46,
        filterFrequency: 2100
      });
    }

    if (boing) {
      tonalBody(voice, {
        frequency: frequency * 0.72,
        endRatio: 0.48,
        duration: Math.min(0.12, sound.duration * 0.92),
        gain: sound.bodyGain * 0.34,
        delay: 0.022,
        type: 'triangle',
        filterFrequency: 880
      });
    }

    if (secondNote) {
      tonalBody(voice, {
        frequency: secondNote.frequency,
        endRatio: secondNote.endRatio ?? 0.7,
        duration: secondNote.duration ?? sound.duration * 0.7,
        gain: secondNote.gain ?? sound.bodyGain * 0.55,
        delay: secondNote.delay ?? 0.035,
        type: 'triangle',
        filterFrequency: secondNote.filterFrequency ?? 1600
      });
    }

    return voice;
  }

  function brush(element, sound, frequency = 900) {
    const voice = createVoice(element, Math.ceil((sound.duration + 0.08) * 1000), sound.gain);
    if (!voice) return null;

    transientNoise(voice, {
      duration: sound.duration,
      gain: sound.transientGain,
      frequency,
      q: 0.55,
      type: 'bandpass'
    });

    tonalBody(voice, {
      frequency: Math.max(120, frequency * 0.28),
      endRatio: 0.7,
      duration: sound.duration * 0.58,
      gain: sound.bodyGain,
      delay: 0.008,
      type: 'triangle',
      filterFrequency: 1100
    });

    return voice;
  }

  async function loadBuffer(path) {
    if (!path || !context) return null;
    if (buffers.has(path)) return buffers.get(path);
    if (pendingBuffers.has(path)) return pendingBuffers.get(path);

    const pending = fetch(path, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`SFX HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
      .then((buffer) => {
        buffers.set(path, buffer);
        pendingBuffers.delete(path);
        return buffer;
      })
      .catch(() => {
        pendingBuffers.delete(path);
        return null;
      });

    pendingBuffers.set(path, pending);
    return pending;
  }

  function configuredPaths() {
    const paths = [];
    Object.values(CONFIG.sounds).forEach((sound) => {
      if (sound.file) paths.push(sound.file);
      if (Array.isArray(sound.files)) {
        sound.files.forEach((path) => {
          if (path) paths.push(path);
        });
      }
    });
    return [...new Set(paths)];
  }

  function preloadConfiguredFiles() {
    if (!context) return;
    configuredPaths().forEach((path) => {
      loadBuffer(path);
    });
  }

  function playBuffer(path, element, {
    gain = 1,
    playbackRate = 1,
    pan = null
  } = {}) {
    const buffer = buffers.get(path);
    if (!buffer || !canPlay()) return false;

    const rate = Math.max(0.5, playbackRate * randomFactor(0.035));
    const durationMs = (buffer.duration / rate) * 1000;
    const voice = createVoice(element, durationMs, gain, false, pan);
    if (!voice) return false;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(voice.input);
    source.start();
    return true;
  }

  function tryConfiguredFile(soundName, element, {
    gain = 1,
    variantIndex = null,
    playbackRate = 1,
    pan = null
  } = {}) {
    const sound = CONFIG.sounds[soundName];
    if (!sound) return false;

    const path = variantIndex != null && Array.isArray(sound.files)
      ? sound.files[variantIndex % sound.files.length]
      : sound.file;

    if (!path) return false;
    if (buffers.has(path)) {
      return playBuffer(path, element, {
        gain: sound.gain * gain,
        playbackRate,
        pan
      });
    }

    loadBuffer(path);
    return false;
  }

  function noteFor(node) {
    return CONFIG.notes[node?.dataset?.heroNode] || CONFIG.notes.launcher;
  }

  function playAppearanceNote(node, index) {
    const sound = CONFIG.sounds.nodeAppearance;
    recordStat('nodeAppearance');
    if (tryConfiguredFile('nodeAppearance', node)) return;

    const base = noteFor(node) * (1 + index * 0.004);
    organicHit(node, sound, base, {
      kind: 'mallet',
      secondNote: {
        frequency: base * 1.5,
        delay: 0.022,
        gain: sound.bodyGain * 0.2,
        duration: 0.055
      }
    });
  }

  function playLineShimmer(element = stage, gainScale = 1) {
    const sound = CONFIG.sounds.lineShimmer;
    recordStat('lineShimmer');
    if (tryConfiguredFile('lineShimmer', element, { gain: gainScale })) return;
    const local = { ...sound, gain: sound.gain * gainScale };
    brush(element, local, 980);
  }

  function playNodeHover(node) {
    const now = performance.now();
    if (now - lastHoverAt < CONFIG.master.hoverMinInterval) return;

    if (now - lastHoverAt <= CONFIG.master.comboWindow) {
      comboLevel = Math.min(4, comboLevel + 1);
    } else {
      comboLevel = 0;
    }

    lastHoverAt = now;
    window.clearTimeout(comboResetTimer);
    comboResetTimer = window.setTimeout(() => {
      comboLevel = 0;
    }, CONFIG.master.comboReset);

    const sound = CONFIG.sounds.nodeHover;
    recordStat('nodeHover');
    if (tryConfiguredFile('nodeHover', node, { playbackRate: 1 + comboLevel * 0.012 })) return;

    const base = noteFor(node) * (1 + comboLevel * 0.012);
    const local = {
      ...sound,
      bodyGain: sound.bodyGain * (1 + comboLevel * 0.08),
      transientGain: sound.transientGain * (1 + comboLevel * 0.05)
    };

    organicHit(node, local, base, {
      kind: 'wood',
      secondNote: {
        frequency: base * 1.5,
        delay: 0.018,
        gain: local.bodyGain * 0.18,
        duration: 0.048
      }
    });
  }

  function playPort(port) {
    const sound = CONFIG.sounds.port;
    recordStat('port');
    if (tryConfiguredFile('port', port)) return;
    organicHit(port, sound, 520, { kind: 'wood' });
  }

  function playNodeTap(node) {
    const sound = CONFIG.sounds.nodeClick;
    recordStat('nodeClick');
    if (tryConfiguredFile('nodeClick', node)) return;

    const base = noteFor(node);
    const voice = organicHit(node, sound, base * 0.92, {
      kind: 'thock',
      boing: true,
      secondNote: node?.dataset?.heroNode === 'contact'
        ? {
            frequency: base * 1.5,
            delay: 0.025,
            gain: sound.bodyGain * 0.34,
            duration: 0.08
          }
        : null
    });

    if (voice) {
      tonalBody(voice, {
        frequency: 82,
        endRatio: 0.58,
        duration: 0.085,
        gain: sound.thumpGain,
        delay: 0.004,
        type: 'triangle',
        filterFrequency: 420
      });
    }
  }

  function playPickup(node) {
    const sound = CONFIG.sounds.pickup;
    recordStat('pickup');
    if (tryConfiguredFile('pickup', node)) return;
    organicHit(node, sound, noteFor(node) * 0.74, { kind: 'rubber', boing: true });
  }

  function startDragTone(node) {
    if (!canPlay() || dragVoice || activeVoices.size >= CONFIG.master.maxVoices) return;

    const voice = createVoice(node, 10000, 0.74, true);
    if (!voice) return;

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    const base = noteFor(node) * 0.46;

    oscillator.type = 'triangle';
    oscillator.frequency.value = base;
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.55;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.05);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(voice.input);
    oscillator.start(now);

    dragVoice = { voice, oscillator, gain, base };
    recordStat('drag');
  }

  function updateDragTone(speed, node) {
    if (!dragVoice || !context) return;
    const normalized = clamp(speed / 1650, 0, 1);
    const frequency = dragVoice.base * (1 + normalized * 0.66);
    const now = context.currentTime;

    dragVoice.oscillator.frequency.setTargetAtTime(frequency, now, 0.032);
    dragVoice.gain.gain.setTargetAtTime(
      0.009 + normalized * 0.008,
      now,
      0.04
    );

    if (dragVoice.voice.panner && node) {
      dragVoice.voice.panner.pan.setTargetAtTime(panForElement(node), now, 0.045);
    }
  }

  function stopDragTone() {
    if (!dragVoice || !context) return;
    const current = dragVoice;
    dragVoice = null;
    const now = context.currentTime;

    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setTargetAtTime(0.0001, now, 0.055);
    try { current.oscillator.stop(now + 0.16); } catch {}
    window.setTimeout(() => endVoice(current.voice), 190);
  }

  function playDrop(node) {
    const sound = CONFIG.sounds.drop;
    recordStat('drop');
    if (tryConfiguredFile('drop', node)) return;

    const base = noteFor(node) * 0.72;
    organicHit(node, sound, base, {
      kind: 'thock',
      boing: true,
      secondNote: {
        frequency: base * 1.28,
        delay: 0.06,
        gain: sound.bodyGain * 0.3,
        duration: 0.052
      }
    });
  }

  function playReset() {
    const sound = CONFIG.sounds.reset;
    recordStat('reset');
    if (tryConfiguredFile('reset', resetButton || stage)) return;

    const element = resetButton || stage;
    [392, 311, 247].forEach((frequency, index) => {
      window.setTimeout(() => {
        if (!canPlay()) return;
        const local = {
          ...sound,
          gain: sound.gain * (1 - index * 0.12),
          bodyGain: sound.bodyGain * (1 - index * 0.1)
        };
        organicHit(element, local, frequency, { kind: 'wood' });
      }, index * 48);
    });
  }

  function playLink(element) {
    const sound = CONFIG.sounds.link;
    recordStat('link');
    if (tryConfiguredFile('link', element || stage)) return;

    organicHit(element || stage, sound, 330, {
      kind: 'mallet',
      secondNote: {
        frequency: 440,
        delay: 0.042,
        gain: sound.bodyGain * 0.58,
        duration: 0.072
      }
    });
  }

  function playDisconnect() {
    const sound = CONFIG.sounds.disconnect;
    recordStat('disconnect');
    if (tryConfiguredFile('disconnect', disconnectButton || stage)) return;
    organicHit(disconnectButton || stage, sound, 220, { kind: 'thock' });
  }

  function playChatType(kind = 'normal', element = chatTextarea) {
    const now = performance.now();
    if (now - lastTypingSoundAt < 35) return;
    lastTypingSoundAt = now;

    if (kind === 'space') {
      const sound = CONFIG.sounds.chatSpace;
      recordStat('chatSpace');
      if (tryConfiguredFile('chatSpace', element, { pan: 0.34 })) return;
      organicHit(element, sound, sound.frequency, { kind: 'thock', pan: 0.34 });
      return;
    }

    if (kind === 'delete') {
      const sound = CONFIG.sounds.chatDelete;
      recordStat('chatDelete');
      if (tryConfiguredFile('chatDelete', element, { pan: 0.34 })) return;
      organicHit(element, sound, sound.frequency, { kind: 'thock', pan: 0.34 });
      return;
    }

    const sound = CONFIG.sounds.chatType;
    const variantIndex = typingVariant % sound.variants.length;
    typingVariant = (typingVariant + 1) % sound.variants.length;
    const base = sound.variants[variantIndex] * randomFactor(0.045);

    recordStat('chatType');
    if (tryConfiguredFile('chatType', element, {
      variantIndex,
      pan: 0.34,
      playbackRate: randomFactor(0.035)
    })) return;

    organicHit(element, sound, base, { kind: 'thock', pan: 0.34 });
  }

  function playChatSend(element = chatForm) {
    const sound = CONFIG.sounds.chatSend;
    recordStat('chatSend');
    if (tryConfiguredFile('chatSend', element, { pan: 0.34 })) return;

    organicHit(element, sound, 310, {
      kind: 'bubble',
      pan: 0.34,
      secondNote: {
        frequency: 405,
        delay: 0.04,
        gain: sound.bodyGain * 0.62,
        duration: 0.08,
        endRatio: 0.76
      }
    });
  }

  function playChatReceive(element) {
    const sound = CONFIG.sounds.chatReceive;
    recordStat('chatReceive');
    if (tryConfiguredFile('chatReceive', element, { pan: 0.3 })) return;

    organicHit(element, sound, 355, {
      kind: 'bubble',
      pan: 0.3,
      boing: true,
      secondNote: {
        frequency: 470,
        delay: 0.052,
        gain: sound.bodyGain * 0.42,
        duration: 0.085
      }
    });
  }

  function playChatStream(element) {
    const now = performance.now();
    if (now - lastStreamTapAt < 80 || now - lastReceiveAt < 160) return;
    lastStreamTapAt = now;

    const sound = CONFIG.sounds.chatStream;
    recordStat('chatStream');
    if (tryConfiguredFile('chatStream', element, { pan: 0.3 })) return;
    organicHit(element, sound, 215, { kind: 'thock', pan: 0.3 });
  }

  function playChipHover(element) {
    const sound = CONFIG.sounds.chipHover;
    recordStat('chipHover');
    if (tryConfiguredFile('chipHover', element, { pan: 0.3 })) return;
    organicHit(element, sound, 330, { kind: 'wood', pan: 0.3 });
  }

  function playChipClick(element) {
    const sound = CONFIG.sounds.chipClick;
    recordStat('chipClick');
    if (tryConfiguredFile('chipClick', element, { pan: 0.3 })) return;
    organicHit(element, sound, 285, {
      kind: 'bubble',
      pan: 0.3,
      secondNote: {
        frequency: 360,
        delay: 0.032,
        gain: sound.bodyGain * 0.42,
        duration: 0.065
      }
    });
  }

  function playChatOpen(element) {
    const sound = CONFIG.sounds.chatOpen;
    recordStat('chatOpen');
    if (tryConfiguredFile('chatOpen', element, { pan: 0.36 })) return;
    organicHit(element, sound, 270, {
      kind: 'mallet',
      pan: 0.36,
      secondNote: {
        frequency: 360,
        delay: 0.045,
        gain: sound.bodyGain * 0.56,
        duration: 0.072,
        endRatio: 0.76
      }
    });
  }

  function playChatClose(element) {
    const sound = CONFIG.sounds.chatClose;
    recordStat('chatClose');
    if (tryConfiguredFile('chatClose', element, { pan: 0.36 })) return;
    organicHit(element, sound, 340, {
      kind: 'mallet',
      pan: 0.36,
      secondNote: {
        frequency: 245,
        delay: 0.04,
        gain: sound.bodyGain * 0.52,
        duration: 0.068
      }
    });
  }

  function runAppearance() {
    if (!stage || appearancePlayed || appearanceQueued || !canPlay() || !stageVisible) return;
    if (!document.body.classList.contains('is-site-ready')) return;
    if (document.body.classList.contains('is-content-panel-open')) return;

    appearanceQueued = true;
    const ordered = [...nodes].sort((a, b) => (
      Number(a.dataset.sfxOrder || 0) - Number(b.dataset.sfxOrder || 0)
    ));

    ordered.forEach((node, index) => {
      window.setTimeout(() => playAppearanceNote(node, index), index * 86);
    });

    window.setTimeout(() => {
      playLineShimmer(stage, 0.9);
      appearancePlayed = true;
      appearanceQueued = false;
    }, 470);
  }

  function maybePlayAppearance() {
    if (!canPlay()) return;
    runAppearance();
  }

  function nodeFromTarget(target) {
    return target?.closest?.('[data-sfx="node"][data-hero-node]') || null;
  }

  function onPointerOver(event) {
    if (coarsePointer.matches || event.pointerType === 'touch') return;

    const port = event.target.closest?.('[data-sfx="port"]');
    if (port && !port.contains(event.relatedTarget)) {
      unlock();
      playPort(port);
      return;
    }

    const node = nodeFromTarget(event.target);
    if (!node) return;
    const relatedNode = nodeFromTarget(event.relatedTarget);
    if (relatedNode === node) return;

    unlock();
    playNodeHover(node);
  }

  function onPointerDown(event) {
    unlock();

    const port = event.target.closest?.('[data-sfx="port"]');
    if (port) {
      const sourceNode = nodeFromTarget(port);
      connectionPointer = {
        pointerId: event.pointerId,
        sourceNode
      };
      if (coarsePointer.matches || event.pointerType === 'touch') playPort(port);
      return;
    }

    const node = nodeFromTarget(event.target);
    if (!node) return;

    pointerState = {
      pointerId: event.pointerId,
      node,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      lastToneUpdate: 0,
      dragged: false,
      pointerType: event.pointerType
    };
  }

  function onPointerMove(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;

    const now = performance.now();
    const totalDistance = Math.hypot(
      event.clientX - pointerState.startX,
      event.clientY - pointerState.startY
    );

    const threshold = coarsePointer.matches ? 7 : 4;
    if (!pointerState.dragged && totalDistance >= threshold) {
      pointerState.dragged = true;
      playPickup(pointerState.node);
      startDragTone(pointerState.node);
    }

    if (!pointerState.dragged || now - pointerState.lastToneUpdate < CONFIG.master.dragUpdateMs) return;

    const dt = Math.max(8, now - pointerState.lastTime);
    const speed = Math.hypot(
      event.clientX - pointerState.lastX,
      event.clientY - pointerState.lastY
    ) / dt * 1000;

    updateDragTone(speed, pointerState.node);
    pointerState.lastToneUpdate = now;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;
    pointerState.lastTime = now;
  }

  function onPointerUp(event) {
    if (connectionPointer && event.pointerId === connectionPointer.pointerId) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetNode = nodeFromTarget(target);
      if (targetNode && targetNode !== connectionPointer.sourceNode) {
        playLink(targetNode);
      }
      connectionPointer = null;
    }

    if (!pointerState || event.pointerId !== pointerState.pointerId) return;

    const state = pointerState;
    pointerState = null;

    if (state.dragged) {
      stopDragTone();
      playDrop(state.node);
      return;
    }

    playNodeTap(state.node);
    lastPointerTap = { node: state.node, time: performance.now() };

    if (state.pointerType === 'touch' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(8); } catch {}
    }
  }

  function onPointerCancel(event) {
    if (connectionPointer?.pointerId === event.pointerId) connectionPointer = null;
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const wasDragging = pointerState.dragged;
    pointerState = null;
    if (wasDragging) stopDragTone();
  }

  function onStageClick(event) {
    const reset = event.target.closest?.('[data-sfx="reset"]');
    if (reset) {
      unlock();
      playReset();
      return;
    }

    const disconnect = event.target.closest?.('[data-sfx="disconnect"]');
    if (disconnect) {
      unlock();
      playDisconnect();
      return;
    }

    const node = nodeFromTarget(event.target);
    if (!node || event.detail !== 0) return;

    if (lastPointerTap.node === node && performance.now() - lastPointerTap.time < 320) return;
    unlock();
    playNodeTap(node);
  }

  function isIgnoredTypingKey(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return true;
    return [
      'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End', 'PageUp', 'PageDown',
      'CapsLock', 'NumLock', 'ScrollLock',
      'Insert', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
      'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ].includes(event.key);
  }

  function onChatKeyDown(event) {
    if (!chatTextarea || event.target !== chatTextarea || event.isComposing) return;
    if (isIgnoredTypingKey(event)) return;

    const now = performance.now();

    if (event.key === 'Enter' && !event.shiftKey) {
      lastPhysicalKeyAt = now;
      lastPhysicalInputKind = 'send';
      return;
    }

    if (event.repeat && now - lastTypingSoundAt < 35) return;

    lastPhysicalKeyAt = now;

    if (event.key === 'Backspace' || event.key === 'Delete') {
      lastPhysicalInputKind = 'delete';
      unlock();
      playChatType('delete');
      return;
    }

    if (event.key === ' ') {
      lastPhysicalInputKind = 'space';
      unlock();
      playChatType('space');
      return;
    }

    if (event.key.length === 1 || event.key === 'Unidentified') {
      lastPhysicalInputKind = 'normal';
      if (event.key !== 'Unidentified') {
        unlock();
        playChatType('normal');
      }
    }
  }

  function onChatInput(event) {
    if (event.target !== chatTextarea || event.isComposing) return;

    const now = performance.now();
    const keyboardHandled = now - lastPhysicalKeyAt < 70 && lastPhysicalInputKind !== '';
    if (keyboardHandled) return;

    const inputType = String(event.inputType || '');

    unlock();

    if (inputType.startsWith('delete')) {
      playChatType('delete');
      return;
    }

    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return;

    if (inputType.startsWith('insert')) {
      playChatType(event.data === ' ' ? 'space' : 'normal');
    }
  }

  function setupChatSounds() {
    if (!chat) return;

    document.addEventListener('click', (event) => {
      const opener = event.target.closest?.('[data-chat-open]');
      if (opener) {
        unlock();
        playChatOpen(opener);
        return;
      }

      const closer = event.target.closest?.('[data-chat-close]');
      if (closer) {
        unlock();
        playChatClose(closer);
      }
    }, true);

    chatForm?.addEventListener('submit', () => {
      const value = String(chatTextarea?.value || '').trim();
      if (!value || chat?.classList.contains('is-busy')) return;
      unlock();
      playChatSend(chatForm);
    }, true);

    chatTextarea?.addEventListener('keydown', onChatKeyDown, true);
    chatTextarea?.addEventListener('input', onChatInput, true);

    chatSuggestions.forEach((button) => {
      button.addEventListener('pointerover', (event) => {
        if (coarsePointer.matches || event.pointerType === 'touch') return;
        if (button.contains(event.relatedTarget)) return;
        unlock();
        playChipHover(button);
      });

      button.addEventListener('click', () => {
        unlock();
        playChipClick(button);
      }, true);
    });

    if (chatFeed) {
      const observer = new MutationObserver((mutations) => {
        let resolvedTarget = null;
        let streamTarget = null;

        mutations.forEach((mutation) => {
          const candidates = [];

          if (mutation.target instanceof Element) candidates.push(mutation.target);
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) candidates.push(node);
          });

          candidates.forEach((candidate) => {
            const article = candidate.matches?.('.deu-chat-message--bot')
              ? candidate
              : candidate.closest?.('.deu-chat-message--bot');

            if (!article || article.classList.contains('deu-chat-message--processing')) return;

            if (article.classList.contains('deu-chat-message--resolved') && !resolvedMessages.has(article)) {
              resolvedMessages.add(article);
              resolvedTarget = article;
              return;
            }

            streamTarget = article;
          });

          if (mutation.type === 'characterData') {
            const article = mutation.target.parentElement?.closest?.('.deu-chat-message--bot');
            if (article && !article.classList.contains('deu-chat-message--processing')) {
              streamTarget = article;
            }
          }
        });

        if (resolvedTarget) {
          lastReceiveAt = performance.now();
          unlock();
          playChatReceive(resolvedTarget);
          return;
        }

        if (streamTarget) {
          unlock();
          playChatStream(streamTarget);
        }
      });

      observer.observe(chatFeed, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  if (stage) {
    stage.addEventListener('pointerover', onPointerOver);
    stage.addEventListener('pointerdown', onPointerDown, true);
    stage.addEventListener('click', onStageClick);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        stageVisible = Boolean(entries[0]?.isIntersecting);
        if (stageVisible) maybePlayAppearance();
      }, { threshold: 0.24 });
      observer.observe(stage);
    } else {
      stageVisible = true;
    }

    const readyObserver = new MutationObserver(() => {
      if (document.body.classList.contains('is-site-ready')) maybePlayAppearance();
    });
    readyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (disconnectButton) {
      const lineObserver = new MutationObserver(() => {
        if (coarsePointer.matches || !disconnectButton.classList.contains('is-visible')) return;
        const now = performance.now();
        if (now - lastLineHoverAt < 180) return;
        lastLineHoverAt = now;
        playLineShimmer(disconnectButton, 0.42);
      });
      lineObserver.observe(disconnectButton, { attributes: true, attributeFilter: ['class'] });
    }
  }

  setupChatSounds();

  const unlockFromInteraction = () => {
    unlock();
  };

  document.addEventListener('pointerdown', unlockFromInteraction, { capture: true, passive: true });
  document.addEventListener('keydown', unlockFromInteraction, { capture: true });

  document.addEventListener('visibilitychange', async () => {
    if (!context) return;

    if (document.hidden) {
      try { await context.suspend(); } catch {}
      return;
    }

    if (unlocked) {
      try { await context.resume(); } catch {}
    }
  });

  const api = Object.freeze({
    config: CONFIG,
    masterVolume: SFX_MASTER_VOLUME,
    unlock,
    getContextState: () => context?.state || 'uninitialized',
    getVoiceCount: () => {
      cleanupVoices();
      return activeVoices.size;
    },
    getStats: () => ({ ...stats }),
    preloadFiles: preloadConfiguredFiles
  });

  window.DeushimaNodeSFX = api;
  window.DeushimaSFX = api;
})();
