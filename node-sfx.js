(() => {
  'use strict';

  const CONFIG = window.DeushimaSFXConfig;
  if (!CONFIG) return;

  const stage = document.querySelector('[data-hero-node-stage][data-sfx-scope="nodes"]');
  const chat = document.querySelector('[data-chat]');
  if (!stage && !chat) return;

  const nodes = stage ? [...stage.querySelectorAll('[data-sfx="node"][data-hero-node]')] : [];
  const disconnectButton = stage?.querySelector('[data-sfx="disconnect"]');
  const chatFeed = chat?.querySelector('[data-chat-feed]');
  const chatForm = chat?.querySelector('[data-chat-form]');
  const chatTextarea = chatForm?.elements?.message;
  const chatSuggestions = chat ? [...chat.querySelectorAll('[data-chat-suggestions] button')] : [];
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const debugEnabled = new URLSearchParams(window.location.search).get('sfxdebug') === '1';

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor({
    latencyHint: 'interactive',
    sampleRate: CONFIG.sampleRate
  });

  const buffers = new Map();
  const externalBuffers = new Map();
  const externalRequests = new Map();
  const voiceSlots = [];
  const counters = new Map();
  const stats = Object.create(null);

  const MENU_SOUND_NAMES = new Set([
    'nodeAppearance',
    'nodeHover',
    'nodeSelect',
    'nodeOpen',
    'port',
    'pickup',
    'drag',
    'drop',
    'reset',
    'lineShimmer',
    'link',
    'disconnect'
  ]);

  const MENU_BLOCKING_BODY_CLASSES = [
    'is-content-panel-open',
    'is-design-viewer-open',
    'is-launcher-pop-open',
    'deu-chat-open',
    'is-page-leaving'
  ];

  const sfxEnabled = true;
  const sfxScale = 1;

  let dryBus;
  let reverbSend;
  let convolver;
  let reverbWet;
  let mixBus;
  let masterGain;
  let lowShelf;
  let presenceEq;
  let compressor;
  let limiter;
  let silenceBuffer;
  let warmed = false;
  let unlocked = context.state === 'running';

  let stageVisible = false;
  let appearancePlayed = false;
  let appearanceQueued = false;
  let pointerState = null;
  let connectionPointer = null;
  let lastHoverAt = 0;
  let lastLineHoverAt = 0;
  let lastDragPulseAt = 0;

  let typingVariant = 0;
  let lastTypingSoundAt = 0;
  let lastPhysicalKeyAt = 0;
  let lastPhysicalInputKind = '';
  let lastBeforeInputAt = 0;
  let lastSendAt = 0;
  let lastReceiveAt = 0;
  let lastStreamAt = 0;
  const resolvedMessages = new WeakSet();

  let lastLatency = {
    eventToStartMs: 0,
    jsMs: 0,
    baseMs: 0,
    outputMs: 0,
    estimatedMs: 0,
    source: '—'
  };
  let debugLatencyEl = null;

  function recordStat(name) {
    stats[name] = (stats[name] || 0) + 1;
  }

  function randomFactor(range = 0.025) {
    return 1 + ((Math.random() * 2) - 1) * range;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function positiveModulo(value, modulo) {
    return ((value % modulo) + modulo) % modulo;
  }

  function scaleDegreeToMidi(degree) {
    const size = CONFIG.scale.intervals.length;
    const octave = Math.floor(degree / size);
    const index = positiveModulo(degree, size);
    return CONFIG.scale.rootMidi + octave * 12 + CONFIG.scale.intervals[index];
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function degreeToFrequency(degree) {
    return midiToFrequency(scaleDegreeToMidi(degree));
  }

  function degreeToLabel(degree) {
    const midi = scaleDegreeToMidi(degree);
    const pitchClasses = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    return `${pitchClasses[positiveModulo(midi, 12)]}${octave}`;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createMonoBuffer(length) {
    if (typeof AudioBuffer === 'function') {
      return new AudioBuffer({
        length,
        numberOfChannels: 1,
        sampleRate: CONFIG.sampleRate
      });
    }
    return context.createBuffer(1, length, CONFIG.sampleRate);
  }

  function centsRatio(cents) {
    return Math.pow(2, cents / 1200);
  }

  function normalizeSamples(samples, targetPeak = 0.78) {
    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    if (peak <= 0.000001) return;
    const scale = targetPeak / peak;
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] *= scale;
    }
  }

  function addHit(samples, {
    role,
    frequency,
    onsetSec = 0,
    durationSec,
    seed = 1,
    amplitude = 1
  }) {
    const timbre = CONFIG.timbres[role];
    const random = seededRandom(seed);
    const sampleRate = CONFIG.sampleRate;
    const start = Math.max(0, Math.floor(onsetSec * sampleRate));
    const end = Math.min(samples.length, start + Math.floor(durationSec * sampleRate));
    const attackSec = Math.max(0.001, (timbre.attackMs / 1000) * (0.9 + random() * 0.2));
    const noiseSec = timbre.noiseMs / 1000;
    const detuneCents = (random() * 2 - 1) * CONFIG.scale.maxDetuneCents;
    const settledFrequency = frequency * centsRatio(detuneCents);
    const startFrequency = settledFrequency * centsRatio(4);
    let phase = 0;
    let previousNoise = 0;

    for (let index = start; index < end; index += 1) {
      const localIndex = index - start;
      const t = localIndex / sampleRate;
      const p = clamp(t / durationSec, 0, 1);
      const attack = Math.min(1, t / attackSec);
      const decayPower = role === 'percussive' ? 9.5 : role === 'accent' ? 5.8 : 6.6;
      const envelope = attack * Math.pow(1 - p, decayPower);

      const settle = Math.min(1, t / 0.024);
      const instantaneousFrequency = startFrequency + (settledFrequency - startFrequency) * settle;
      phase += (Math.PI * 2 * instantaneousFrequency) / sampleRate;

      let tonal = 0;
      const harmonics = timbre.harmonics;
      for (let harmonic = 0; harmonic < harmonics.length; harmonic += 1) {
        const partial = harmonic + 1;
        tonal += Math.sin(phase * partial) * harmonics[harmonic];
      }

      if (role === 'tonal') {
        tonal += Math.sin(phase * 3) * 0.04 * Math.pow(1 - p, 3);
      } else if (role === 'percussive') {
        tonal += Math.sin(phase * 0.5) * 0.16 * Math.pow(1 - p, 12);
      } else {
        tonal += Math.sin(phase * 2) * 0.07 * Math.pow(1 - p, 4);
      }

      let transient = 0;
      if (t <= noiseSec) {
        const rawNoise = random() * 2 - 1;
        const highPassed = rawNoise - previousNoise * 0.86;
        previousNoise = rawNoise;
        transient = highPassed
          * timbre.transient
          * Math.pow(1 - (t / noiseSec), 4);
      }

      samples[index] += (tonal * envelope + transient) * amplitude;
    }
  }

  function renderSoundBuffer(soundName, sound, {
    degree = null,
    degrees = null,
    variant = 0,
    typingVariantIndex = null
  } = {}) {
    const durationSec = sound.durationMs / 1000;
    const tailSec = sound.role === 'accent' ? 0.045 : sound.role === 'tonal' ? 0.028 : 0.012;
    const length = Math.max(1, Math.ceil((durationSec + tailSec) * CONFIG.sampleRate));
    const samples = new Float32Array(length);

    if (soundName === 'chatType') {
      const targetDegree = sound.variantDegrees[typingVariantIndex ?? 0];
      addHit(samples, {
        role: sound.role,
        frequency: degreeToFrequency(targetDegree),
        durationSec,
        seed: 9000 + (typingVariantIndex ?? 0) * 97,
        amplitude: 1
      });
    } else if (Array.isArray(degrees) || Array.isArray(sound.degrees)) {
      const sequence = degrees || sound.degrees;
      const count = sequence.length;
      const spacing = count <= 2
        ? Math.min(0.09, durationSec * 0.42)
        : Math.max(0.038, (durationSec - 0.11) / Math.max(1, count - 1));
      const noteDuration = sound.role === 'accent'
        ? Math.min(0.17, durationSec * 0.72)
        : Math.min(0.15, durationSec * 0.62);

      sequence.forEach((sequenceDegree, index) => {
        addHit(samples, {
          role: sound.role,
          frequency: degreeToFrequency(sequenceDegree),
          onsetSec: index * spacing,
          durationSec: noteDuration,
          seed: 5000 + index * 211 + variant * 37 + soundName.length * 19,
          amplitude: index === 0 ? 1 : 0.92
        });
      });
    } else {
      const targetDegree = degree ?? sound.degree ?? 0;
      addHit(samples, {
        role: sound.role,
        frequency: degreeToFrequency(targetDegree),
        durationSec,
        seed: 3000 + targetDegree * 131 + variant * 53 + soundName.length * 17,
        amplitude: 1
      });
    }

    const targetPeak = sound.role === 'percussive'
      ? 0.84
      : sound.role === 'accent'
        ? 0.78
        : 0.76;
    normalizeSamples(samples, targetPeak);

    const buffer = createMonoBuffer(samples.length);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  function synthKey(soundName, {
    degree = null,
    variant = 0,
    typingVariantIndex = null
  } = {}) {
    if (soundName === 'chatType') return `${soundName}:typing:${typingVariantIndex ?? 0}`;
    if (degree != null) return `${soundName}:degree:${degree}:v:${variant}`;
    return `${soundName}:v:${variant}`;
  }

  function buildSynthLibrary() {
    const dynamicNodeSounds = ['nodeAppearance'];

    Object.entries(CONFIG.sounds).forEach(([soundName, sound]) => {
      if (soundName === 'chatType') {
        sound.variantDegrees.forEach((degree, index) => {
          buffers.set(
            synthKey(soundName, { typingVariantIndex: index }),
            renderSoundBuffer(soundName, sound, { typingVariantIndex: index })
          );
        });
        return;
      }

      if (dynamicNodeSounds.includes(soundName)) {
        for (let degree = 0; degree <= 8; degree += 1) {
          for (let variant = 0; variant < (sound.variants || 1); variant += 1) {
            buffers.set(
              synthKey(soundName, { degree, variant }),
              renderSoundBuffer(soundName, sound, { degree, variant })
            );
          }
        }
        return;
      }

      if (soundName === 'drag') {
        for (let degree = -5; degree <= -1; degree += 1) {
          for (let variant = 0; variant < (sound.variants || 1); variant += 1) {
            buffers.set(
              synthKey(soundName, { degree, variant }),
              renderSoundBuffer(soundName, sound, { degree, variant })
            );
          }
        }
        return;
      }

      for (let variant = 0; variant < (sound.variants || 1); variant += 1) {
        buffers.set(
          synthKey(soundName, { variant }),
          renderSoundBuffer(soundName, sound, {
            degree: sound.degree,
            degrees: sound.degrees,
            variant
          })
        );
      }
    });

    silenceBuffer = createMonoBuffer(2);
    silenceBuffer.getChannelData(0).fill(0);
  }

  function makeReverbImpulse() {
    const length = Math.max(1, Math.floor(CONFIG.sampleRate * (CONFIG.mix.reverb.durationMs / 1000)));
    const buffer = createMonoBuffer(length);
    const data = buffer.getChannelData(0);
    const random = seededRandom(88421);

    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      data[index] = (random() * 2 - 1)
        * Math.pow(1 - progress, CONFIG.mix.reverb.decay)
        * 0.72;
    }

    return buffer;
  }

  function buildAudioGraph() {
    dryBus = context.createGain();
    reverbSend = context.createGain();
    convolver = context.createConvolver();
    reverbWet = context.createGain();
    mixBus = context.createGain();
    masterGain = context.createGain();
    lowShelf = context.createBiquadFilter();
    presenceEq = context.createBiquadFilter();
    compressor = context.createDynamicsCompressor();
    limiter = context.createDynamicsCompressor();

    reverbSend.gain.value = CONFIG.mix.reverb.wet;
    convolver.buffer = makeReverbImpulse();
    reverbWet.gain.value = 1;
    masterGain.gain.value = CONFIG.masterVolume;

    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = CONFIG.mix.eq.lowShelfHz;
    lowShelf.gain.value = CONFIG.mix.eq.lowShelfDb;

    presenceEq.type = 'peaking';
    presenceEq.frequency.value = CONFIG.mix.eq.presenceHz;
    presenceEq.Q.value = CONFIG.mix.eq.presenceQ;
    presenceEq.gain.value = CONFIG.mix.eq.presenceDb;

    Object.assign(compressor, {});
    compressor.threshold.value = CONFIG.mix.compressor.threshold;
    compressor.knee.value = CONFIG.mix.compressor.knee;
    compressor.ratio.value = CONFIG.mix.compressor.ratio;
    compressor.attack.value = CONFIG.mix.compressor.attack;
    compressor.release.value = CONFIG.mix.compressor.release;

    limiter.threshold.value = CONFIG.mix.limiter.threshold;
    limiter.knee.value = CONFIG.mix.limiter.knee;
    limiter.ratio.value = CONFIG.mix.limiter.ratio;
    limiter.attack.value = CONFIG.mix.limiter.attack;
    limiter.release.value = CONFIG.mix.limiter.release;

    dryBus.connect(mixBus);
    reverbSend.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(mixBus);

    mixBus.connect(masterGain);
    masterGain.connect(lowShelf);
    lowShelf.connect(presenceEq);
    presenceEq.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(context.destination);

    for (let index = 0; index < CONFIG.performance.maxVoices; index += 1) {
      const gain = context.createGain();
      const panner = typeof context.createStereoPanner === 'function'
        ? context.createStereoPanner()
        : null;

      gain.gain.value = 0;
      if (panner) {
        gain.connect(panner);
        panner.connect(dryBus);
        panner.connect(reverbSend);
      } else {
        gain.connect(dryBus);
        gain.connect(reverbSend);
      }

      voiceSlots.push({
        gain,
        panner,
        source: null,
        soundName: null,
        busyUntil: 0,
        sustained: false,
        startedAt: 0
      });
    }
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

  function preloadExternalFiles() {
    configuredPaths().forEach((path) => {
      if (externalBuffers.has(path) || externalRequests.has(path)) return;

      const request = fetch(path, { cache: 'force-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`SFX HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
        .then((buffer) => {
          externalBuffers.set(path, buffer);
          externalRequests.delete(path);
          return buffer;
        })
        .catch(() => {
          externalRequests.delete(path);
          return null;
        });

      externalRequests.set(path, request);
    });
  }

  function resumeContext() {
    if (context.state === 'running') {
      unlocked = true;
      warmContext();
      return;
    }

    const resumePromise = context.resume();
    if (resumePromise?.then) {
      resumePromise.then(() => {
        unlocked = context.state === 'running';
        warmContext();
        maybePlayAppearance();
      }).catch(() => {});
    }
  }

  function warmContext() {
    if (warmed || !silenceBuffer || context.state !== 'running') return;
    warmed = true;
    const source = context.createBufferSource();
    source.buffer = silenceBuffer;
    source.connect(dryBus);
    source.start();
  }

  function eventTimestampToPerformance(timestamp) {
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp > 1e9 && Number.isFinite(performance.timeOrigin)) {
      return timestamp - performance.timeOrigin;
    }
    return timestamp;
  }

  function updateLatency(eventTimestamp, handlerStartedAt, startCallAt, sourceName) {
    const eventTime = eventTimestampToPerformance(eventTimestamp);
    if (eventTime == null) return;

    const eventToStartMs = Math.max(0, startCallAt - eventTime);
    const jsMs = Math.max(0, startCallAt - (handlerStartedAt ?? startCallAt));
    const baseMs = Number.isFinite(context.baseLatency) ? context.baseLatency * 1000 : 0;
    const outputMs = Number.isFinite(context.outputLatency) ? context.outputLatency * 1000 : 0;

    lastLatency = {
      eventToStartMs,
      jsMs,
      baseMs,
      outputMs,
      estimatedMs: eventToStartMs + baseMs + outputMs,
      source: sourceName
    };

    updateDebugLatency();
  }

  function panForElement(element) {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const normalized = (center / Math.max(1, window.innerWidth)) * 2 - 1;
    return clamp(
      normalized * CONFIG.performance.panAmount,
      -CONFIG.performance.panAmount,
      CONFIG.performance.panAmount
    );
  }

  function isMenuSfxBlocked() {
    return MENU_BLOCKING_BODY_CLASSES.some((className) => (
      document.body.classList.contains(className)
    ));
  }

  function stopMenuVoices() {
    voiceSlots.forEach((slot) => {
      if (!slot.source || !MENU_SOUND_NAMES.has(slot.soundName)) return;

      try { slot.source.stop(); } catch {}
      slot.source = null;
      slot.soundName = null;
      slot.sustained = false;
      slot.busyUntil = 0;
    });

    pointerState = null;
    connectionPointer = null;
  }

  function stopAllVoices() {
    voiceSlots.forEach((slot) => {
      if (!slot.source) return;
      try { slot.source.stop(); } catch {}
      slot.source = null;
      slot.soundName = null;
      slot.sustained = false;
      slot.busyUntil = 0;
    });
    pointerState = null;
    connectionPointer = null;
  }

  function applySfxState() {
    if (!masterGain) return;
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(CONFIG.masterVolume, now);
  }

  function refreshVoiceSlots(nowMs = performance.now()) {
    voiceSlots.forEach((slot) => {
      if (!slot.sustained && slot.busyUntil <= nowMs) {
        slot.source = null;
        slot.soundName = null;
      }
    });
  }

  function acquireVoice(nowMs = performance.now()) {
    refreshVoiceSlots(nowMs);

    let slot = voiceSlots.find((candidate) => !candidate.source);
    if (slot) return slot;

    slot = voiceSlots
      .filter((candidate) => !candidate.sustained)
      .sort((a, b) => a.startedAt - b.startedAt)[0]
      || [...voiceSlots].sort((a, b) => a.startedAt - b.startedAt)[0];

    if (slot?.source) {
      try { slot.source.stop(); } catch {}
      slot.source = null;
      slot.soundName = null;
      slot.sustained = false;
    }

    return slot || null;
  }

  function nextVariant(soundName, sound) {
    const count = Math.max(1, sound.variants || 1);
    const current = counters.get(soundName) || 0;
    counters.set(soundName, (current + 1) % count);
    return current % count;
  }

  function externalPathFor(sound, variantIndex) {
    if (Array.isArray(sound.files)) {
      return sound.files[variantIndex % sound.files.length] || null;
    }
    return sound.file || null;
  }

  function bufferFor(soundName, sound, {
    degree = null,
    variant = 0,
    typingVariantIndex = null
  } = {}) {
    const path = externalPathFor(sound, typingVariantIndex ?? variant);
    if (path && externalBuffers.has(path)) {
      const baseDegree = Number.isFinite(sound.fileBaseDegree)
        ? sound.fileBaseDegree
        : (degree ?? sound.degree ?? 0);
      const targetDegree = degree ?? sound.degree ?? baseDegree;
      const playbackRate = degreeToFrequency(targetDegree) / degreeToFrequency(baseDegree);
      return {
        buffer: externalBuffers.get(path),
        playbackRate
      };
    }

    const key = synthKey(soundName, {
      degree,
      variant,
      typingVariantIndex
    });

    return {
      buffer: buffers.get(key),
      playbackRate: 1
    };
  }

  function playSound(soundName, {
    element = null,
    degree = null,
    variantIndex = null,
    pan = null,
    eventTimestamp = null,
    handlerStartedAt = null,
    gainScale = 1,
    when = null,
    bypassMenuGate = false
  } = {}) {
    const sound = CONFIG.sounds[soundName];
    if (!sound) return false;

    if (!bypassMenuGate && MENU_SOUND_NAMES.has(soundName) && isMenuSfxBlocked()) return false;

    if (context.state !== 'running') resumeContext();

    const nowPerf = performance.now();
    const slot = acquireVoice(nowPerf);
    if (!slot) return false;

    let synthVariant;
    let typingVariantIndex = null;

    if (soundName === 'chatType') {
      typingVariantIndex = variantIndex ?? 0;
      synthVariant = 0;
    } else {
      synthVariant = nextVariant(soundName, sound);
    }

    const resolved = bufferFor(soundName, sound, {
      degree,
      variant: synthVariant,
      typingVariantIndex
    });

    if (!resolved.buffer) return false;

    const source = context.createBufferSource();
    source.buffer = resolved.buffer;
    source.playbackRate.value = resolved.playbackRate;

    const startAt = when ?? context.currentTime;
    const durationMs = (resolved.buffer.duration / resolved.playbackRate) * 1000;
    const startDelayMs = Math.max(0, (startAt - context.currentTime) * 1000);

    slot.gain.gain.cancelScheduledValues(context.currentTime);
    slot.gain.gain.setValueAtTime(
      sound.gain * gainScale * randomFactor(0.025),
      context.currentTime
    );

    if (slot.panner) {
      slot.panner.pan.setValueAtTime(
        pan == null ? panForElement(element) : clamp(pan, -1, 1),
        context.currentTime
      );
    }

    source.connect(slot.gain);
    slot.source = source;
    slot.soundName = soundName;
    slot.sustained = false;
    slot.startedAt = nowPerf;
    slot.busyUntil = nowPerf + startDelayMs + durationMs;

    const startCallAt = performance.now();
    source.start(startAt);
    updateLatency(eventTimestamp, handlerStartedAt, startCallAt, soundName);
    recordStat(soundName);
    return true;
  }

  function playNodeAppearance(node, index, when) {
    const degree = CONFIG.nodes[node.dataset.heroNode] ?? index;
    playSound('nodeAppearance', {
      element: node,
      degree,
      when
    });
  }

  function playNodeHover(node, eventTimestamp) {
    const now = performance.now();
    if (now - lastHoverAt < CONFIG.performance.hoverMinIntervalMs) return;

    lastHoverAt = now;
    playSound('nodeHover', {
      element: node,
      eventTimestamp
    });
  }

  function playNodeSelect(node, eventTimestamp) {
    playSound('nodeSelect', {
      element: node,
      eventTimestamp
    });
  }

  function playTyping(kind, eventTimestamp, handlerStartedAt = null) {
    const now = performance.now();
    if (now - lastTypingSoundAt < CONFIG.performance.typingMinIntervalMs) return false;
    lastTypingSoundAt = now;

    if (kind === 'space') {
      return playSound('chatSpace', {
        element: chatTextarea,
        pan: 0.32,
        eventTimestamp,
        handlerStartedAt
      });
    }

    if (kind === 'delete') {
      return playSound('chatDelete', {
        element: chatTextarea,
        pan: 0.32,
        eventTimestamp,
        handlerStartedAt
      });
    }

    const index = typingVariant % CONFIG.sounds.chatType.variantDegrees.length;
    typingVariant = (typingVariant + 1) % CONFIG.sounds.chatType.variantDegrees.length;

    return playSound('chatType', {
      element: chatTextarea,
      variantIndex: index,
      pan: 0.32,
      eventTimestamp,
      handlerStartedAt
    });
  }

  function runAppearance() {
    if (!stage || appearancePlayed || appearanceQueued || !stageVisible) return;
    if (context.state !== 'running') return;
    if (!document.body.classList.contains('is-site-ready')) return;
    if (document.body.classList.contains('is-content-panel-open')) return;

    appearanceQueued = true;
    const ordered = [...nodes].sort((a, b) => (
      Number(a.dataset.sfxOrder || 0) - Number(b.dataset.sfxOrder || 0)
    ));

    const startAt = context.currentTime + 0.02;
    ordered.forEach((node, index) => {
      playNodeAppearance(node, index, startAt + index * 0.086);
    });

    playSound('lineShimmer', {
      element: stage,
      when: startAt + ordered.length * 0.086 + 0.025,
      gainScale: 0.9
    });

    appearancePlayed = true;
    appearanceQueued = false;
  }

  function maybePlayAppearance() {
    if (context.state === 'running') runAppearance();
  }

  function nodeFromTarget(target) {
    return target?.closest?.('[data-sfx="node"][data-hero-node]') || null;
  }

  function onNodePointerOver(event) {
    if (coarsePointer.matches || event.pointerType === 'touch') return;

    const port = event.target.closest?.('[data-sfx="port"]');
    if (port && !port.contains(event.relatedTarget)) {
      playSound('port', {
        element: port,
        eventTimestamp: event.timeStamp
      });
      return;
    }

    const node = nodeFromTarget(event.target);
    if (!node) return;
    const relatedNode = nodeFromTarget(event.relatedTarget);
    if (relatedNode === node) return;

    playNodeHover(node, event.timeStamp);
  }

  function onNodePointerDown(event) {
    const disconnect = event.target.closest?.('[data-sfx="disconnect"]');
    if (disconnect) {
      playSound('disconnect', {
        element: disconnect,
        eventTimestamp: event.timeStamp
      });
      return;
    }

    const port = event.target.closest?.('[data-sfx="port"]');
    if (port) {
      connectionPointer = {
        pointerId: event.pointerId,
        sourceNode: nodeFromTarget(port)
      };

      if (coarsePointer.matches || event.pointerType === 'touch') {
        playSound('port', {
          element: port,
          eventTimestamp: event.timeStamp
        });
      }
      return;
    }

    const node = nodeFromTarget(event.target);
    if (!node) return;

    playNodeSelect(node, event.timeStamp);

    pointerState = {
      pointerId: event.pointerId,
      node,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      dragged: false,
      pointerType: event.pointerType
    };
  }

  function onNodePointerMove(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;

    const now = performance.now();
    const totalDistance = Math.hypot(
      event.clientX - pointerState.startX,
      event.clientY - pointerState.startY
    );

    const threshold = coarsePointer.matches ? 7 : 4;
    if (!pointerState.dragged && totalDistance >= threshold) {
      pointerState.dragged = true;
      playSound('pickup', {
        element: pointerState.node,
        eventTimestamp: event.timeStamp
      });
      lastDragPulseAt = 0;
    }

    if (!pointerState.dragged || now - lastDragPulseAt < CONFIG.performance.dragStepMs) return;

    const dt = Math.max(8, now - pointerState.lastTime);
    const speed = Math.hypot(
      event.clientX - pointerState.lastX,
      event.clientY - pointerState.lastY
    ) / dt * 1000;

    const bucket = clamp(Math.round((speed / 1650) * 4), 0, 4);
    const degree = -5 + bucket;

    playSound('drag', {
      element: pointerState.node,
      degree,
      eventTimestamp: event.timeStamp
    });

    lastDragPulseAt = now;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;
    pointerState.lastTime = now;
  }

  function onNodePointerUp(event) {
    if (connectionPointer && event.pointerId === connectionPointer.pointerId) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetNode = nodeFromTarget(target);
      if (targetNode && targetNode !== connectionPointer.sourceNode) {
        playSound('link', {
          element: targetNode,
          eventTimestamp: event.timeStamp
        });
      }
      connectionPointer = null;
    }

    if (!pointerState || event.pointerId !== pointerState.pointerId) return;

    const state = pointerState;
    pointerState = null;

    if (state.dragged) {
      playSound('drop', {
        element: state.node,
        eventTimestamp: event.timeStamp
      });
      return;
    }

    if (state.pointerType === 'touch' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(8); } catch {}
    }
  }

  function onNodePointerCancel(event) {
    if (connectionPointer?.pointerId === event.pointerId) connectionPointer = null;
    if (pointerState?.pointerId === event.pointerId) pointerState = null;
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
    const handlerStartedAt = performance.now();
    if (!chatTextarea || event.target !== chatTextarea || event.isComposing) return;
    if (isIgnoredTypingKey(event)) return;

    const now = performance.now();

    if (event.key === 'Enter' && !event.shiftKey) {
      playSound('chatSend', {
        element: chatForm,
        pan: 0.32,
        eventTimestamp: event.timeStamp,
        handlerStartedAt
      });
      lastSendAt = now;
      lastPhysicalKeyAt = now;
      lastPhysicalInputKind = 'send';
      return;
    }

    if (event.repeat && now - lastTypingSoundAt < CONFIG.performance.typingMinIntervalMs) return;

    if (event.key === 'Backspace' || event.key === 'Delete') {
      playTyping('delete', event.timeStamp, handlerStartedAt);
      lastPhysicalKeyAt = now;
      lastPhysicalInputKind = 'delete';
      return;
    }

    if (event.key === ' ') {
      playTyping('space', event.timeStamp, handlerStartedAt);
      lastPhysicalKeyAt = now;
      lastPhysicalInputKind = 'space';
      return;
    }

    if (event.key === 'Unidentified') {
      lastPhysicalKeyAt = 0;
      lastPhysicalInputKind = '';
      return;
    }

    if (event.key.length === 1) {
      playTyping('normal', event.timeStamp, handlerStartedAt);
      lastPhysicalKeyAt = now;
      lastPhysicalInputKind = 'normal';
    }
  }

  function onChatBeforeInput(event) {
    if (event.target !== chatTextarea || event.isComposing) return;

    const now = performance.now();
    if (now - lastPhysicalKeyAt < 70 && lastPhysicalInputKind) return;

    const inputType = String(event.inputType || '');
    if (!inputType) return;

    if (inputType.startsWith('delete')) {
      playTyping('delete', event.timeStamp);
      lastBeforeInputAt = now;
      return;
    }

    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return;

    if (inputType.startsWith('insert')) {
      playTyping(event.data === ' ' ? 'space' : 'normal', event.timeStamp);
      lastBeforeInputAt = now;
    }
  }

  function onChatInput(event) {
    if (event.target !== chatTextarea || event.isComposing) return;

    const now = performance.now();
    if (now - lastPhysicalKeyAt < 80 && lastPhysicalInputKind) return;
    if (now - lastBeforeInputAt < 80) return;

    const inputType = String(event.inputType || '');
    if (inputType.startsWith('delete')) {
      playTyping('delete', event.timeStamp);
      return;
    }

    if (inputType.startsWith('insert')) {
      playTyping(event.data === ' ' ? 'space' : 'normal', event.timeStamp);
    }
  }

  function onGlobalPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const closer = target.closest('[data-chat-close]');
    if (closer) {
      playSound('chatClose', {
        element: closer,
        pan: 0.35,
        eventTimestamp: event.timeStamp
      });
      return;
    }

    const sendButton = target.closest('.deu-chat__send');
    if (sendButton) {
      const value = String(chatTextarea?.value || '').trim();
      if (value && !chat?.classList.contains('is-busy')) {
        playSound('chatSend', {
          element: sendButton,
          pan: 0.34,
          eventTimestamp: event.timeStamp
        });
        lastSendAt = performance.now();
      }
      return;
    }

    const chip = target.closest('[data-chat-suggestions] button');
    if (chip) {
      playSound('chipClick', {
        element: chip,
        pan: 0.3,
        eventTimestamp: event.timeStamp
      });
      return;
    }

    const opener = target.closest('[data-chat-open], .deu-chat-launcher');
    if (opener && !opener.closest('[data-hero-node-stage]')) {
      playSound('chatOpen', {
        element: opener,
        pan: 0.34,
        eventTimestamp: event.timeStamp
      });
    }
  }

  function setupChatSounds() {
    if (!chat) return;

    chatTextarea?.addEventListener('keydown', onChatKeyDown, {
      capture: true,
      passive: true
    });

    chatTextarea?.addEventListener('beforeinput', onChatBeforeInput, {
      capture: true,
      passive: true
    });

    chatTextarea?.addEventListener('input', onChatInput, {
      capture: true,
      passive: true
    });

    chatSuggestions.forEach((button) => {
      button.addEventListener('pointerover', (event) => {
        if (coarsePointer.matches || event.pointerType === 'touch') return;
        if (button.contains(event.relatedTarget)) return;

        playSound('chipHover', {
          element: button,
          pan: 0.3,
          eventTimestamp: event.timeStamp
        });
      }, { passive: true });
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
          playSound('chatReceive', {
            element: resolvedTarget,
            pan: 0.28
          });
          return;
        }

        const now = performance.now();
        if (
          streamTarget &&
          now - lastReceiveAt >= 160 &&
          now - lastStreamAt >= CONFIG.performance.streamMinIntervalMs
        ) {
          lastStreamAt = now;
          playSound('chatStream', {
            element: streamTarget,
            pan: 0.28
          });
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

    chatForm?.addEventListener('submit', (event) => {
      const now = performance.now();
      if (now - lastSendAt < 140) return;

      const value = String(chatTextarea?.value || '').trim();
      if (!value || chat?.classList.contains('is-busy')) return;

      playSound('chatSend', {
        element: chatForm,
        pan: 0.32,
        eventTimestamp: event.timeStamp
      });
      lastSendAt = now;
    }, {
      capture: true,
      passive: true
    });
  }

  function setupNodeSounds() {
    if (!stage) return;

    stage.addEventListener('pointerover', onNodePointerOver, { passive: true });
    stage.addEventListener('pointerdown', onNodePointerDown, {
      capture: true,
      passive: true
    });
    window.addEventListener('pointermove', onNodePointerMove, { passive: true });
    window.addEventListener('pointerup', onNodePointerUp, { passive: true });
    window.addEventListener('pointercancel', onNodePointerCancel, { passive: true });

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
    readyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    if (disconnectButton) {
      const lineObserver = new MutationObserver(() => {
        if (coarsePointer.matches || !disconnectButton.classList.contains('is-visible')) return;

        const now = performance.now();
        if (now - lastLineHoverAt < 180) return;
        lastLineHoverAt = now;

        playSound('lineShimmer', {
          element: disconnectButton,
          gainScale: 0.72
        });
      });

      lineObserver.observe(disconnectButton, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  function createDebugPanel() {
    if (!debugEnabled) return;

    const style = document.createElement('style');
    style.textContent = `
      .sfx-debug {
        position: fixed;
        left: 0.75rem;
        bottom: 0.75rem;
        z-index: 50000;
        width: min(25rem, calc(100vw - 1.5rem));
        max-height: min(70vh, 34rem);
        overflow: auto;
        padding: 0.7rem;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(5,5,5,.96);
        color: #f4f4f1;
        font: 11px/1.35 Inter, system-ui, sans-serif;
        box-shadow: 0 1rem 3rem rgba(0,0,0,.45);
      }
      .sfx-debug__title {
        display:flex;
        justify-content:space-between;
        gap:.75rem;
        margin-bottom:.55rem;
        font-weight:600;
      }
      .sfx-debug__latency {
        margin:0 0 .65rem;
        color:rgba(244,244,241,.68);
        white-space:pre-wrap;
      }
      .sfx-debug__grid {
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:.3rem;
      }
      .sfx-debug button {
        min-height:2rem;
        padding:.35rem .45rem;
        border:1px solid rgba(255,255,255,.16);
        background:#0a0a0a;
        color:#fff;
        font:inherit;
        text-align:left;
        cursor:pointer;
      }
      .sfx-debug button:hover { background:#fff; color:#050505; }
      .sfx-debug__tools {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:.3rem;
        margin-bottom:.5rem;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('aside');
    panel.className = 'sfx-debug';
    panel.setAttribute('aria-label', 'SFX debug');

    const title = document.createElement('div');
    title.className = 'sfx-debug__title';
    title.innerHTML = `<span>SFX DEBUG · ${CONFIG.scale.name}</span><span>${CONFIG.masterVolume.toFixed(2)}</span>`;

    debugLatencyEl = document.createElement('p');
    debugLatencyEl.className = 'sfx-debug__latency';

    const tools = document.createElement('div');
    tools.className = 'sfx-debug__tools';

    const scaleButton = document.createElement('button');
    scaleButton.type = 'button';
    scaleButton.textContent = '▶ Escala C D E G A';
    scaleButton.addEventListener('pointerdown', (event) => {
      const startAt = context.currentTime + 0.01;
      for (let degree = 0; degree < 5; degree += 1) {
        playSound('nodeAppearance', {
          degree,
          when: startAt + degree * 0.12,
          eventTimestamp: degree === 0 ? event.timeStamp : null
        });
      }
    }, { passive: true });

    const intervalButton = document.createElement('button');
    intervalButton.type = 'button';
    intervalButton.textContent = '▶ Open / Close / Send / Receive';
    intervalButton.addEventListener('pointerdown', (event) => {
      const now = context.currentTime + 0.01;
      playSound('chatOpen', { when: now, eventTimestamp: event.timeStamp });
      playSound('chatClose', { when: now + 0.45 });
      playSound('chatSend', { when: now + 0.9 });
      playSound('chatReceive', { when: now + 1.35 });
    }, { passive: true });

    tools.append(scaleButton, intervalButton);

    const grid = document.createElement('div');
    grid.className = 'sfx-debug__grid';

    Object.keys(CONFIG.sounds).forEach((soundName) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = soundName;
      button.addEventListener('pointerdown', (event) => {
        const sound = CONFIG.sounds[soundName];

        if (soundName === 'chatType') {
          playSound(soundName, {
            variantIndex: 0,
            eventTimestamp: event.timeStamp
          });
          return;
        }

        if (soundName === 'nodeAppearance') {
          playSound(soundName, {
            degree: 0,
            eventTimestamp: event.timeStamp
          });
          return;
        }

        if (soundName === 'drag') {
          playSound(soundName, {
            degree: -5,
            eventTimestamp: event.timeStamp
          });
          return;
        }

        playSound(soundName, {
          eventTimestamp: event.timeStamp
        });
      }, { passive: true });
      grid.appendChild(button);
    });

    panel.append(title, debugLatencyEl, tools, grid);
    document.body.appendChild(panel);
    updateDebugLatency();
  }

  function updateDebugLatency() {
    if (!debugLatencyEl) return;

    debugLatencyEl.textContent =
      `last: ${lastLatency.source}\n`
      + `event.timeStamp → source.start(): ${lastLatency.eventToStartMs.toFixed(2)} ms\n`
      + `handler → source.start() (JS): ${lastLatency.jsMs.toFixed(2)} ms\n`
      + `ctx.baseLatency: ${lastLatency.baseMs.toFixed(2)} ms\n`
      + `ctx.outputLatency: ${lastLatency.outputMs.toFixed(2)} ms\n`
      + `estimated total: ${lastLatency.estimatedMs.toFixed(2)} ms`;
  }

  function playDebugSound(soundName) {
    if (!CONFIG.sounds[soundName]) return false;

    if (soundName === 'chatType') {
      return playSound(soundName, { variantIndex: 0 });
    }

    if (soundName === 'nodeAppearance') {
      return playSound(soundName, { degree: 0 });
    }

    if (soundName === 'drag') {
      return playSound(soundName, { degree: -5 });
    }

    return playSound(soundName);
  }

  buildSynthLibrary();
  buildAudioGraph();
  preloadExternalFiles();
  setupNodeSounds();
  setupChatSounds();
  createDebugPanel();

  const menuSfxGateObserver = new MutationObserver(() => {
    if (isMenuSfxBlocked()) stopMenuVoices();
  });
  menuSfxGateObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  document.addEventListener('pointerdown', (event) => {
    resumeContext();
    onGlobalPointerDown(event);
  }, {
    capture: true,
    passive: true
  });

  document.addEventListener('keydown', () => {
    resumeContext();
  }, {
    capture: true,
    passive: true
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (context.state === 'running') {
        context.suspend().catch(() => {});
      }
      return;
    }

    if (unlocked && context.state === 'suspended') {
      context.resume().then(() => {
        warmContext();
      }).catch(() => {});
    }
  });

  const api = Object.freeze({
    config: CONFIG,
    masterVolume: CONFIG.masterVolume,
    unlock: resumeContext,
    playDebugSound,
    playScoped: (soundName, options = {}) => playSound(soundName, {
      ...options,
      bypassMenuGate: true
    }),
    setEnabled: () => true,
    degreeToFrequency,
    degreeToLabel,
    getEnabled: () => true,
    getScale: () => 1,
    getContextState: () => context.state,
    getVoiceCount: () => {
      refreshVoiceSlots();
      return voiceSlots.filter((slot) => slot.source).length;
    },
    getStats: () => ({ ...stats }),
    getLatency: () => ({ ...lastLatency }),
    getBufferCount: () => buffers.size + externalBuffers.size
  });

  window.DeushimaNodeSFX = api;
  window.DeushimaSFX = api;

  if (context.state === 'running') {
    unlocked = true;
    warmContext();
    maybePlayAppearance();
  }
})();