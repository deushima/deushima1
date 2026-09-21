(() => {
  'use strict';

  const stage = document.querySelector('[data-hero-node-stage][data-sfx-scope="nodes"]');
  if (!stage) return;

  const nodes = [...stage.querySelectorAll('[data-sfx="node"][data-hero-node]')];
  const resetButton = stage.querySelector('[data-sfx="reset"]');
  const disconnectButton = stage.querySelector('[data-sfx="disconnect"]');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const CONFIG = Object.freeze({
    master: {
      gain: 0.24,
      maxVoices: 6,
      hoverMinInterval: 60,
      comboWindow: 600,
      comboReset: 800,
      panAmount: 0.58,
      dragUpdateMs: 42
    },
    limiter: {
      threshold: -11,
      knee: 0,
      ratio: 20,
      attack: 0.002,
      release: 0.09
    },
    notes: {
      works: 261.63,
      about: 293.66,
      launcher: 329.63,
      chat: 392,
      contact: 440
    },
    appearance: {
      stepMs: 86,
      noteDuration: 0.11,
      noteGain: 0.095,
      shimmerDelayMs: 470
    },
    hover: {
      duration: 0.068,
      gain: 0.105,
      harmonicGain: 0.027,
      sweepDuration: 0.13,
      sweepGain: 0.018,
      pitchVariance: 0.05,
      gainVariance: 0.06
    },
    port: {
      frequency: 1520,
      duration: 0.038,
      gain: 0.034,
      pitchVariance: 0.055
    },
    click: {
      duration: 0.16,
      gain: 0.12,
      thumpStart: 74,
      thumpEnd: 48,
      thumpGain: 0.085,
      releaseDelay: 0.072,
      releaseDuration: 0.034,
      releaseFrequency: 1180,
      releaseGain: 0.03,
      contactAccentRatio: 1.5,
      contactAccentGain: 0.032
    },
    pickup: {
      duration: 0.075,
      gain: 0.064,
      pitchRatio: 0.82
    },
    drag: {
      baseGain: 0.012,
      baseRatio: 0.62,
      speedPitchRange: 0.82,
      maxSpeed: 1650,
      attack: 0.045,
      release: 0.07
    },
    drop: {
      duration: 0.13,
      gain: 0.078,
      bounceDelay: 0.062,
      bounceGain: 0.028
    },
    reset: {
      duration: 0.19,
      gain: 0.07,
      startFrequency: 780,
      endFrequency: 190
    },
    shimmer: {
      duration: 0.18,
      gain: 0.026,
      startFrequency: 920,
      endFrequency: 2260
    },
    link: {
      duration: 0.115,
      gain: 0.045,
      startFrequency: 690,
      endFrequency: 1320
    },
    disconnect: {
      duration: 0.06,
      gain: 0.045,
      frequency: 620
    }
  });

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  let context = null;
  let masterGain = null;
  let limiter = null;
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

  function randomFactor(range = 0.05) {
    return 1 + ((Math.random() * 2) - 1) * range;
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
    const length = Math.max(1, Math.floor(context.sampleRate * 0.22));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function ensureContext() {
    if (context || !AudioContextCtor) return context;

    context = new AudioContextCtor({ latencyHint: 'interactive' });
    masterGain = context.createGain();
    limiter = context.createDynamicsCompressor();

    limiter.threshold.value = CONFIG.limiter.threshold;
    limiter.knee.value = CONFIG.limiter.knee;
    limiter.ratio.value = CONFIG.limiter.ratio;
    limiter.attack.value = CONFIG.limiter.attack;
    limiter.release.value = CONFIG.limiter.release;

    masterGain.gain.value = 0;
    masterGain.connect(limiter);
    limiter.connect(context.destination);
    noiseBuffer = makeNoiseBuffer();
    syncMaster(true);
    return context;
  }

  function syncMaster(immediate = false) {
    if (!context || !masterGain) return;
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    if (immediate) {
      masterGain.gain.setValueAtTime(CONFIG.master.gain, now);
    } else {
      masterGain.gain.setTargetAtTime(CONFIG.master.gain, now, 0.018);
    }
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

    syncMaster(true);
    maybePlayAppearance();
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

  function createVoice(element, durationMs, overallGain = 1, sustained = false) {
    cleanupVoices();
    if (!canPlay() || activeVoices.size >= CONFIG.master.maxVoices) return null;

    const input = context.createGain();
    const panValue = panForElement(element);
    const panner = typeof context.createStereoPanner === 'function'
      ? context.createStereoPanner()
      : null;

    input.gain.value = overallGain * randomFactor(0.055);

    if (panner) {
      panner.pan.value = panValue;
      input.connect(panner);
      panner.connect(masterGain);
    } else {
      input.connect(masterGain);
    }

    const voice = {
      input,
      panner,
      pan: panValue,
      pitch: randomFactor(0.05),
      sustained,
      ended: false,
      endsAt: performance.now() + durationMs + 120
    };

    activeVoices.add(voice);

    if (!sustained) {
      window.setTimeout(() => endVoice(voice), durationMs + 100);
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

  function envelopeGain(voice, start, duration, peak, attack = 0.004) {
    const gain = context.createGain();
    const end = start + duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.min(attack, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(voice.input);
    return gain;
  }

  function tone(voice, {
    frequency,
    duration,
    gain,
    type = 'sine',
    delay = 0,
    attack = 0.004,
    endFrequency = null,
    pitchVariance = null
  }) {
    if (!voice || !context) return null;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const amplitude = envelopeGain(voice, start, duration, gain, attack);
    const variance = pitchVariance == null ? voice.pitch : randomFactor(pitchVariance);
    const startFrequency = Math.max(22, frequency * variance);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(22, endFrequency * variance),
        start + duration
      );
    }

    oscillator.connect(amplitude);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.012);
    return oscillator;
  }

  function filteredSweep(voice, {
    startFrequency,
    endFrequency,
    duration,
    gain,
    delay = 0,
    movePanToCenter = false
  }) {
    if (!voice || !context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amplitude = envelopeGain(voice, start, duration, gain, 0.012);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(startFrequency * voice.pitch, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency * voice.pitch, start + duration);

    filter.type = 'bandpass';
    filter.Q.value = 1.8;
    filter.frequency.setValueAtTime(Math.max(180, startFrequency * 1.3), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(240, endFrequency * 1.5), start + duration);

    oscillator.connect(filter);
    filter.connect(amplitude);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);

    if (movePanToCenter && voice.panner) {
      voice.panner.pan.cancelScheduledValues(start);
      voice.panner.pan.setValueAtTime(voice.pan, start);
      voice.panner.pan.linearRampToValueAtTime(0, start + duration);
    }
  }

  function noiseTick(voice, duration, gain, highpass = 2100, delay = 0) {
    if (!voice || !context || !noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amplitude = envelopeGain(voice, start, duration, gain, 0.002);

    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass * voice.pitch;
    filter.Q.value = 0.8;

    source.connect(filter);
    filter.connect(amplitude);
    source.start(start);
    source.stop(start + duration + 0.01);
  }

  function panForElement(element) {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const normalized = (center / Math.max(1, window.innerWidth)) * 2 - 1;
    return Math.max(-CONFIG.master.panAmount, Math.min(CONFIG.master.panAmount, normalized * CONFIG.master.panAmount));
  }

  function noteFor(node) {
    return CONFIG.notes[node?.dataset?.heroNode] || CONFIG.notes.launcher;
  }

  function playAppearanceNote(node, index) {
    const voice = createVoice(node, 150, 0.86);
    if (!voice) return;
    const base = noteFor(node) * (1 + index * 0.006);
    tone(voice, {
      frequency: base,
      duration: CONFIG.appearance.noteDuration,
      gain: CONFIG.appearance.noteGain,
      type: 'sine'
    });
    tone(voice, {
      frequency: base * 2.01,
      duration: CONFIG.appearance.noteDuration * 0.72,
      gain: CONFIG.appearance.noteGain * 0.22,
      type: 'triangle'
    });
    noiseTick(voice, 0.025, 0.012, 2800);
  }

  function playShimmer(element = stage, gainScale = 1) {
    const voice = createVoice(element, 230, gainScale);
    if (!voice) return;
    filteredSweep(voice, {
      startFrequency: CONFIG.shimmer.startFrequency,
      endFrequency: CONFIG.shimmer.endFrequency,
      duration: CONFIG.shimmer.duration,
      gain: CONFIG.shimmer.gain,
      movePanToCenter: true
    });
    noiseTick(voice, 0.085, 0.008 * gainScale, 3300, 0.04);
  }

  function playHover(node) {
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

    const voice = createVoice(node, 190, 1);
    if (!voice) return;

    const base = noteFor(node) * (1 + comboLevel * 0.012);
    const harmonicLift = 1 + comboLevel * 0.13;

    tone(voice, {
      frequency: base,
      duration: CONFIG.hover.duration,
      gain: CONFIG.hover.gain,
      type: 'sine',
      pitchVariance: CONFIG.hover.pitchVariance
    });

    tone(voice, {
      frequency: base * 2.02,
      duration: CONFIG.hover.duration * 0.78,
      gain: CONFIG.hover.harmonicGain * harmonicLift,
      type: 'triangle',
      pitchVariance: CONFIG.hover.pitchVariance
    });

    noiseTick(voice, 0.025, 0.013 * harmonicLift, 2900);

    filteredSweep(voice, {
      startFrequency: Math.max(420, base * 1.55),
      endFrequency: Math.max(900, base * (3.05 + comboLevel * 0.12)),
      duration: CONFIG.hover.sweepDuration,
      gain: CONFIG.hover.sweepGain * harmonicLift,
      delay: 0.012,
      movePanToCenter: true
    });
  }

  function playPort(port) {
    const voice = createVoice(port, 90, 0.92);
    if (!voice) return;
    tone(voice, {
      frequency: CONFIG.port.frequency,
      duration: CONFIG.port.duration,
      gain: CONFIG.port.gain,
      type: 'sine',
      pitchVariance: CONFIG.port.pitchVariance
    });
  }

  function playNodeTap(node) {
    const voice = createVoice(node, 270, 1);
    if (!voice) return;

    const base = noteFor(node);

    tone(voice, {
      frequency: base,
      duration: CONFIG.click.duration,
      gain: CONFIG.click.gain,
      type: 'sine'
    });

    tone(voice, {
      frequency: base * 2,
      duration: CONFIG.click.duration * 0.72,
      gain: CONFIG.click.gain * 0.2,
      type: 'triangle'
    });

    tone(voice, {
      frequency: CONFIG.click.thumpStart,
      endFrequency: CONFIG.click.thumpEnd,
      duration: 0.095,
      gain: CONFIG.click.thumpGain,
      type: 'sine',
      attack: 0.008
    });

    noiseTick(voice, 0.032, 0.018, 1800);

    if (node?.dataset?.heroNode === 'contact') {
      tone(voice, {
        frequency: base * CONFIG.click.contactAccentRatio,
        duration: 0.105,
        gain: CONFIG.click.contactAccentGain,
        type: 'sine',
        delay: 0.018
      });
    }

    tone(voice, {
      frequency: CONFIG.click.releaseFrequency,
      duration: CONFIG.click.releaseDuration,
      gain: CONFIG.click.releaseGain,
      type: 'triangle',
      delay: CONFIG.click.releaseDelay
    });

    noiseTick(voice, 0.018, 0.012, 3100, CONFIG.click.releaseDelay);
  }

  function playPickup(node) {
    const voice = createVoice(node, 115, 0.95);
    if (!voice) return;
    const base = noteFor(node) * CONFIG.pickup.pitchRatio;
    tone(voice, {
      frequency: base,
      endFrequency: base * 1.08,
      duration: CONFIG.pickup.duration,
      gain: CONFIG.pickup.gain,
      type: 'sine'
    });
    noiseTick(voice, 0.028, 0.011, 2200);
  }

  function startDragTone(node) {
    if (!canPlay() || dragVoice || activeVoices.size >= CONFIG.master.maxVoices) return;

    const voice = createVoice(node, 10000, 1, true);
    if (!voice) return;

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    const base = noteFor(node) * CONFIG.drag.baseRatio;

    oscillator.type = 'sine';
    oscillator.frequency.value = base;
    filter.type = 'lowpass';
    filter.frequency.value = 950;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(CONFIG.drag.baseGain, now + CONFIG.drag.attack);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(voice.input);
    oscillator.start(now);

    dragVoice = { voice, oscillator, gain, base };
  }

  function updateDragTone(speed, node) {
    if (!dragVoice || !context) return;
    const normalized = Math.max(0, Math.min(1, speed / CONFIG.drag.maxSpeed));
    const frequency = dragVoice.base * (1 + normalized * CONFIG.drag.speedPitchRange);
    const now = context.currentTime;

    dragVoice.oscillator.frequency.setTargetAtTime(frequency, now, 0.028);
    dragVoice.gain.gain.setTargetAtTime(
      CONFIG.drag.baseGain * (0.7 + normalized * 0.55),
      now,
      0.035
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
    current.gain.gain.setTargetAtTime(0.0001, now, CONFIG.drag.release);
    try { current.oscillator.stop(now + 0.18); } catch {}
    window.setTimeout(() => endVoice(current.voice), 210);
  }

  function playDrop(node) {
    const voice = createVoice(node, 230, 0.96);
    if (!voice) return;
    const base = noteFor(node) * 0.78;

    tone(voice, {
      frequency: base * 1.06,
      endFrequency: base,
      duration: CONFIG.drop.duration,
      gain: CONFIG.drop.gain,
      type: 'sine',
      attack: 0.006
    });

    tone(voice, {
      frequency: base * 1.42,
      duration: 0.055,
      gain: CONFIG.drop.bounceGain,
      type: 'triangle',
      delay: CONFIG.drop.bounceDelay
    });

    noiseTick(voice, 0.03, 0.014, 1800);
  }

  function playReset() {
    const voice = createVoice(resetButton || stage, 260, 1);
    if (!voice) return;

    filteredSweep(voice, {
      startFrequency: CONFIG.reset.startFrequency,
      endFrequency: CONFIG.reset.endFrequency,
      duration: CONFIG.reset.duration,
      gain: CONFIG.reset.gain
    });

    tone(voice, {
      frequency: 420,
      endFrequency: 220,
      duration: 0.15,
      gain: 0.034,
      type: 'sine',
      delay: 0.025
    });

    noiseTick(voice, 0.055, 0.014, 1200, 0.018);
  }

  function playLink(element) {
    const voice = createVoice(element || stage, 180, 0.94);
    if (!voice) return;
    filteredSweep(voice, {
      startFrequency: CONFIG.link.startFrequency,
      endFrequency: CONFIG.link.endFrequency,
      duration: CONFIG.link.duration,
      gain: CONFIG.link.gain,
      movePanToCenter: true
    });
    tone(voice, {
      frequency: CONFIG.link.endFrequency * 1.22,
      duration: 0.045,
      gain: 0.022,
      type: 'sine',
      delay: 0.072
    });
  }

  function playDisconnect() {
    const voice = createVoice(disconnectButton || stage, 120, 0.9);
    if (!voice) return;
    tone(voice, {
      frequency: CONFIG.disconnect.frequency,
      endFrequency: CONFIG.disconnect.frequency * 0.62,
      duration: CONFIG.disconnect.duration,
      gain: CONFIG.disconnect.gain,
      type: 'triangle'
    });
    noiseTick(voice, 0.026, 0.018, 2500, 0.012);
  }

  function runAppearance() {
    if (appearancePlayed || appearanceQueued || !canPlay() || !stageVisible) return;
    if (!document.body.classList.contains('is-site-ready')) return;
    if (document.body.classList.contains('is-content-panel-open')) return;

    appearanceQueued = true;
    const ordered = [...nodes].sort((a, b) => (
      Number(a.dataset.sfxOrder || 0) - Number(b.dataset.sfxOrder || 0)
    ));

    ordered.forEach((node, index) => {
      window.setTimeout(() => playAppearanceNote(node, index), index * CONFIG.appearance.stepMs);
    });

    window.setTimeout(() => {
      playShimmer(stage, 0.92);
      appearancePlayed = true;
      appearanceQueued = false;
    }, CONFIG.appearance.shimmerDelayMs);
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
    playHover(node);
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

  stage.addEventListener('pointerover', onPointerOver);
  stage.addEventListener('pointerdown', onPointerDown, true);
  stage.addEventListener('click', onStageClick);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true });

  const unlockFromInteraction = () => {
    unlock();
  };
  document.addEventListener('pointerdown', unlockFromInteraction, { capture: true, passive: true });
  document.addEventListener('keydown', unlockFromInteraction, { capture: true });

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
      playShimmer(disconnectButton, 0.42);
    });
    lineObserver.observe(disconnectButton, { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('visibilitychange', async () => {
    if (!context) return;
    if (document.hidden) {
      try { await context.suspend(); } catch {}
      return;
    }

    if (unlocked) {
      try { await context.resume(); } catch {}
      syncMaster(true);
    }
  });

  window.DeushimaNodeSFX = Object.freeze({
    config: CONFIG,
    unlock,
    getContextState: () => context?.state || 'uninitialized',
    getVoiceCount: () => {
      cleanupVoices();
      return activeVoices.size;
    }
  });
})();
