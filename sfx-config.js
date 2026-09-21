(() => {
  'use strict';

  const SFX_MASTER_VOLUME = 0.46;

  window.DeushimaSFXConfig = Object.freeze({
    version: '3.0.2',
    sampleRate: 48000,
    masterVolume: SFX_MASTER_VOLUME,

    scale: Object.freeze({
      name: 'C major pentatonic',
      root: 'C4',
      rootMidi: 60,
      intervals: Object.freeze([0, 2, 4, 7, 9]),
      degreeNames: Object.freeze(['C', 'D', 'E', 'G', 'A']),
      maxDetuneCents: 8
    }),

    nodes: Object.freeze({
      works: 0,
      about: 1,
      launcher: 2,
      chat: 3,
      contact: 4
    }),

    performance: Object.freeze({
      maxVoices: 6,
      hoverMinIntervalMs: 60,
      typingMinIntervalMs: 35,
      streamMinIntervalMs: 80,
      comboWindowMs: 600,
      comboResetMs: 800,
      dragStepMs: 70,
      panAmount: 0.56
    }),

    mix: Object.freeze({
      eq: Object.freeze({
        lowShelfHz: 180,
        lowShelfDb: 1.2,
        presenceHz: 2600,
        presenceDb: -1.15,
        presenceQ: 0.72
      }),
      reverb: Object.freeze({
        durationMs: 118,
        decay: 4.9,
        wet: 0.075
      }),
      compressor: Object.freeze({
        threshold: -12,
        knee: 4,
        ratio: 3,
        attack: 0.006,
        release: 0.12
      }),
      limiter: Object.freeze({
        threshold: -3.2,
        knee: 0,
        ratio: 20,
        attack: 0.001,
        release: 0.075
      })
    }),

    timbres: Object.freeze({
      tonal: Object.freeze({
        label: 'Kalimba / marimba suave',
        attackMs: 5,
        noiseMs: 10,
        harmonics: Object.freeze([1, 0.32, 0.11]),
        transient: 0.18
      }),
      percussive: Object.freeze({
        label: 'Thock de madera / goma',
        attackMs: 1.5,
        noiseMs: 13,
        harmonics: Object.freeze([1, 0.2]),
        transient: 0.34
      }),
      accent: Object.freeze({
        label: 'Bubble pop cálido',
        attackMs: 3,
        noiseMs: 12,
        harmonics: Object.freeze([1, 0.27, 0.08]),
        transient: 0.24
      })
    }),

    sounds: Object.freeze({
      nodeAppearance: Object.freeze({
        role: 'tonal',
        interaction: 'Aparición de cada nodo',
        durationMs: 180,
        gain: 0.82,
        file: null,
        fileBaseDegree: 0,
        variants: 2
      }),
      nodeHover: Object.freeze({
        role: 'tonal',
        interaction: 'Hover de nodo — nota grave fija',
        durationMs: 145,
        gain: 0.79,
        degree: -5,
        file: null,
        fileBaseDegree: -5,
        variants: 2
      }),
      nodeSelect: Object.freeze({
        role: 'percussive',
        interaction: 'Click de nodo — thock grave fijo',
        durationMs: 52,
        gain: 0.84,
        degree: -6,
        file: null,
        fileBaseDegree: -6,
        variants: 2
      }),
      nodeOpen: Object.freeze({
        role: 'accent',
        interaction: 'Apertura al soltar un nodo',
        durationMs: 230,
        gain: 0.64,
        degrees: Object.freeze([0, 3]),
        file: null,
        fileBaseDegree: 0,
        variants: 2
      }),
      port: Object.freeze({
        role: 'percussive',
        interaction: 'Tap / hover de puerto',
        durationMs: 38,
        gain: 0.62,
        degree: 7,
        file: null,
        fileBaseDegree: 7,
        variants: 2
      }),
      pickup: Object.freeze({
        role: 'percussive',
        interaction: 'Inicio de drag',
        durationMs: 54,
        gain: 0.67,
        degree: -1,
        file: null,
        fileBaseDegree: -1,
        variants: 2
      }),
      drag: Object.freeze({
        role: 'tonal',
        interaction: 'Movimiento de drag',
        durationMs: 125,
        gain: 0.23,
        degree: -5,
        file: null,
        fileBaseDegree: -5,
        variants: 2
      }),
      drop: Object.freeze({
        role: 'percussive',
        interaction: 'Soltar nodo',
        durationMs: 58,
        gain: 0.78,
        degree: 0,
        file: null,
        fileBaseDegree: 0,
        variants: 2
      }),
      reset: Object.freeze({
        role: 'tonal',
        interaction: 'RESET',
        durationMs: 250,
        gain: 0.84,
        degrees: Object.freeze([4, 3, 2, 1, 0]),
        file: null,
        fileBaseDegree: 4,
        variants: 2
      }),
      lineShimmer: Object.freeze({
        role: 'tonal',
        interaction: 'Línea / Disconnect visible',
        durationMs: 165,
        gain: 0.38,
        degree: 8,
        file: null,
        fileBaseDegree: 8,
        variants: 2
      }),
      link: Object.freeze({
        role: 'accent',
        interaction: 'Crear conexión',
        durationMs: 210,
        gain: 0.69,
        degrees: Object.freeze([2, 3]),
        file: null,
        fileBaseDegree: 2,
        variants: 2
      }),
      disconnect: Object.freeze({
        role: 'percussive',
        interaction: 'Desconectar línea',
        durationMs: 46,
        gain: 0.63,
        degree: -1,
        file: null,
        fileBaseDegree: -1,
        variants: 2
      }),

      chatType: Object.freeze({
        role: 'percussive',
        interaction: 'Tipeo normal',
        durationMs: 34,
        gain: 0.88,
        variantDegrees: Object.freeze([0, 2, 3, 5]),
        files: Object.freeze([null, null, null, null]),
        variants: 4
      }),
      chatSpace: Object.freeze({
        role: 'percussive',
        interaction: 'Barra espaciadora',
        durationMs: 48,
        gain: 0.92,
        degree: -5,
        file: null,
        fileBaseDegree: -5,
        variants: 2
      }),
      chatDelete: Object.freeze({
        role: 'percussive',
        interaction: 'Backspace / Delete',
        durationMs: 40,
        gain: 0.66,
        degree: -2,
        file: null,
        fileBaseDegree: -2,
        variants: 2
      }),
      chatSend: Object.freeze({
        role: 'accent',
        interaction: 'Enviar mensaje',
        durationMs: 230,
        gain: 0.88,
        degrees: Object.freeze([0, 3]),
        file: null,
        fileBaseDegree: 0,
        variants: 2
      }),
      chatReceive: Object.freeze({
        role: 'accent',
        interaction: 'Recibir respuesta',
        durationMs: 250,
        gain: 0.8,
        degrees: Object.freeze([3, 5]),
        file: null,
        fileBaseDegree: 3,
        variants: 2
      }),
      chatStream: Object.freeze({
        role: 'percussive',
        interaction: 'Bloque de streaming',
        durationMs: 26,
        gain: 0.31,
        degree: -1,
        file: null,
        fileBaseDegree: -1,
        variants: 2
      }),
      chipHover: Object.freeze({
        role: 'tonal',
        interaction: 'Hover de chip',
        durationMs: 130,
        gain: 0.5,
        degree: 2,
        file: null,
        fileBaseDegree: 2,
        variants: 2
      }),
      chipClick: Object.freeze({
        role: 'percussive',
        interaction: 'Pointerdown en chip',
        durationMs: 54,
        gain: 0.7,
        degree: 1,
        file: null,
        fileBaseDegree: 1,
        variants: 2
      }),
      chatOpen: Object.freeze({
        role: 'accent',
        interaction: 'Abrir chat',
        durationMs: 230,
        gain: 0.78,
        degrees: Object.freeze([0, 3]),
        file: null,
        fileBaseDegree: 0,
        variants: 2
      }),
      chatClose: Object.freeze({
        role: 'accent',
        interaction: 'Cerrar chat',
        durationMs: 230,
        gain: 0.72,
        degrees: Object.freeze([3, 0]),
        file: null,
        fileBaseDegree: 3,
        variants: 2
      })
    })
  });
})();