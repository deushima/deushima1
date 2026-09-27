(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const app = $("[data-app]");
  const fileInput = $("[data-file-input]");
  const stage = $("[data-dropzone]");
  const viewport = $("[data-viewport]");
  const canvasWrap = $("[data-canvas-wrap]");
  const canvas = $("[data-canvas]");
  const emptyState = $("[data-empty]");
  const statusEl = $("[data-status]");
  const dimensionsEl = $("[data-dimensions]");
  const fileMetaEl = $("[data-file-meta]");
  const outputMetaEl = $("[data-output-meta]");
  const toastEl = $("[data-toast]");
  const bgHexEl = $("[data-bg-hex]");
  const leftRail = $(".rail--left");
  const rightRail = $(".rail--right");

  if (!app || !canvas || !fileInput) return;

  const DEFAULT = Object.freeze({
    exposure: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    hue: 0,
    blur: 0,
    grain: 0,
    rgbSplit: 0,
    pixelate: 1,
    posterize: 0,
    halftone: 0,
    vignette: 0,
    mono: false,
    scanlines: false,
    invert: false,
    dither: false,
    duotone: false,
    duoDark: "#111315",
    duoLight: "#ff5c38",
    ratio: "original",
    fit: "cover",
    frame: "none",
    frameSize: 7,
    bgColor: "#e8e7e2",
    specialMode: "none"
  });

  const PRESETS = {
    clean: {},
    "soft-flash": {
      exposure: 18, contrast: 106, saturation: 88, temperature: 6,
      grain: 5, vignette: 10, blur: 0.25
    },
    xerox: {
      contrast: 152, saturation: 0, posterize: 3, grain: 17,
      mono: true, dither: true
    },
    riso: {
      exposure: 2, contrast: 128, saturation: 0, grain: 9,
      halftone: 8, duotone: true, duoDark: "#2737ff", duoLight: "#ff5739"
    },
    rgb: {
      contrast: 111, saturation: 118, rgbSplit: 9, grain: 3
    },
    silver: {
      exposure: 7, contrast: 92, saturation: 0, grain: 5,
      mono: true, vignette: 8
    },
    night: {
      contrast: 124, saturation: 0, grain: 8, vignette: 20,
      duotone: true, duoDark: "#07110c", duoLight: "#adff72"
    },
    bitmap: {
      contrast: 132, saturation: 88, pixelate: 6, posterize: 4,
      grain: 4
    },
    halftone: {
      contrast: 138, saturation: 0, mono: true, halftone: 10,
      grain: 3
    },
    thermal: {
      contrast: 122, saturation: 100, grain: 3, specialMode: "thermal"
    },
    solar: {
      exposure: 5, contrast: 126, saturation: 78, specialMode: "solarize",
      grain: 5
    },
    signal: {
      contrast: 114, saturation: 112, rgbSplit: 14, pixelate: 2,
      scanlines: true, grain: 9
    }
  };

  const EFFECT_KEYS = [
    "exposure", "contrast", "saturation", "temperature", "hue", "blur",
    "grain", "rgbSplit", "pixelate", "posterize", "halftone", "vignette",
    "mono", "scanlines", "invert", "dither", "duotone", "duoDark",
    "duoLight", "specialMode"
  ];

  let state = { ...DEFAULT };
  let sourceImage = null;
  let sourceName = "";
  let sourceBytes = 0;
  let sourceUrl = "";
  let activePreset = "clean";
  let renderRaf = 0;
  let renderToken = 0;
  let compareActive = false;
  let toastTimer = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const hexToRgb = (hex) => {
    const clean = hex.replace("#", "");
    const value = parseInt(clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const createCanvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 1800);
  }

  function setBusy(isBusy, text = "PROCESSING") {
    statusEl.textContent = isBusy ? text : (sourceImage ? "LIVE" : "READY");
    app.classList.toggle("is-processing", isBusy);
  }

  function setControlsEnabled(enabled) {
    $$('[data-action="export"], [data-action="reset"], [data-action="randomize"], [data-action="compare"]')
      .forEach((el) => { el.disabled = !enabled; });
  }

  function setActivePreset(name) {
    activePreset = name;
    $$(".preset").forEach((el) => el.classList.toggle("is-active", el.dataset.preset === name));
  }

  function markCustom() {
    activePreset = "custom";
    $$(".preset").forEach((el) => el.classList.remove("is-active"));
  }

  function syncUI() {
    $$("[data-param]").forEach((el) => {
      const key = el.dataset.param;
      if (!(key in state)) return;
      el.value = state[key];
    });
    $$("[data-output]").forEach((el) => {
      const key = el.dataset.output;
      if (key in state) el.value = formatOutput(key, state[key]);
    });
    $$("[data-toggle]").forEach((el) => {
      const key = el.dataset.toggle;
      if (key in state) el.checked = Boolean(state[key]);
    });
    $$("[data-color]").forEach((el) => {
      const key = el.dataset.color;
      if (key in state) el.value = state[key];
    });
    $$(".frame-option").forEach((el) => el.classList.toggle("is-active", el.dataset.frame === state.frame));
    if (bgHexEl) bgHexEl.textContent = state.bgColor.toUpperCase();
  }

  function formatOutput(key, value) {
    if (key === "blur") return Number(value).toFixed(Number(value) % 1 ? 2 : 0);
    if (key === "pixelate") return Math.round(value);
    if (["contrast", "saturation"].includes(key)) return Math.round(value);
    if (key === "frameSize") return Math.round(value);
    return Math.round(value);
  }

  function scheduleRender() {
    if (!sourceImage) return;
    cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(() => renderPreview());
  }

  function ratioValue() {
    if (state.ratio === "original") return sourceImage.width / sourceImage.height;
    const [a, b] = state.ratio.split(":").map(Number);
    return a / b;
  }

  function resolveCanvasSize(maxDimension) {
    const ratio = ratioValue();
    const sourceLong = Math.max(sourceImage.width, sourceImage.height);
    const longEdge = Math.max(240, Math.min(maxDimension, sourceLong));
    if (ratio >= 1) {
      return { width: Math.round(longEdge), height: Math.round(longEdge / ratio) };
    }
    return { width: Math.round(longEdge * ratio), height: Math.round(longEdge) };
  }

  function drawSource(target, originalOnly = false) {
    const ctx = target.getContext("2d", { alpha: false });
    const tw = target.width;
    const th = target.height;
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, tw, th);

    const iw = sourceImage.width;
    const ih = sourceImage.height;
    const scale = state.fit === "contain"
      ? Math.min(tw / iw, th / ih)
      : Math.max(tw / iw, th / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (tw - dw) / 2;
    const dy = (th - dh) / 2;

    if (originalOnly || state.pixelate <= 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, dx, dy, dw, dh);
      return;
    }

    const pixel = Math.max(1, Math.round(state.pixelate));
    const sw = Math.max(1, Math.round(tw / pixel));
    const sh = Math.max(1, Math.round(th / pixel));
    const small = createCanvas(sw, sh);
    const sctx = small.getContext("2d", { alpha: false });
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(sourceImage, dx / pixel, dy / pixel, dw / pixel, dh / pixel);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, sw, sh, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = true;
  }

  function applyCssFilters(input, originalOnly) {
    if (originalOnly) return input;
    const out = createCanvas(input.width, input.height);
    const ctx = out.getContext("2d", { alpha: false });
    const brightness = clamp(100 + state.exposure * 0.72, 25, 190);
    ctx.filter = [
      `brightness(${brightness}%)`,
      `contrast(${state.contrast}%)`,
      `saturate(${state.saturation}%)`,
      `hue-rotate(${state.hue}deg)`,
      `blur(${state.blur}px)`
    ].join(" ");
    ctx.drawImage(input, 0, 0);
    ctx.filter = "none";
    return out;
  }

  function applyPixelEffects(target, originalOnly) {
    if (originalOnly) return;
    const needsPixels = state.temperature !== 0 || state.mono || state.posterize > 0 ||
      state.duotone || state.invert || state.dither || state.rgbSplit > 0 ||
      state.grain > 0 || state.specialMode !== "none";

    if (!needsPixels) return;

    const ctx = target.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, target.width, target.height);
    const data = imageData.data;
    const src = new Uint8ClampedArray(data);
    const temp = state.temperature / 100;
    const dark = hexToRgb(state.duoDark);
    const light = hexToRgb(state.duoLight);
    const posterLevels = state.posterize > 1 ? Math.round(state.posterize) : 0;
    const rgbOffset = Math.round(state.rgbSplit * Math.max(target.width, target.height) / 1200);
    const width = target.width;
    const height = target.height;
    const bayer = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (temp !== 0) {
          r = clamp(r + 34 * temp, 0, 255);
          b = clamp(b - 38 * temp, 0, 255);
          g = clamp(g + 7 * temp, 0, 255);
        }

        if (state.specialMode === "solarize") {
          const solar = (v) => v > 132 ? 255 - v : v;
          r = solar(r);
          g = solar(g);
          b = solar(b);
        }

        if (state.specialMode === "thermal") {
          const l = luminance(r, g, b) / 255;
          const stops = [
            [0.00, [12, 12, 45]],
            [0.24, [30, 41, 173]],
            [0.46, [0, 184, 202]],
            [0.66, [245, 224, 61]],
            [0.84, [248, 99, 41]],
            [1.00, [246, 239, 217]]
          ];
          let a = stops[0];
          let z = stops[stops.length - 1];
          for (let s = 0; s < stops.length - 1; s += 1) {
            if (l >= stops[s][0] && l <= stops[s + 1][0]) {
              a = stops[s];
              z = stops[s + 1];
              break;
            }
          }
          const t = clamp((l - a[0]) / Math.max(0.0001, z[0] - a[0]), 0, 1);
          r = mix(a[1][0], z[1][0], t);
          g = mix(a[1][1], z[1][1], t);
          b = mix(a[1][2], z[1][2], t);
        }

        if (state.mono || state.duotone || state.dither) {
          const l = luminance(r, g, b);
          r = g = b = l;
        }

        if (state.dither) {
          const threshold = ((bayer[y & 3][x & 3] + 0.5) / 16 - 0.5) * 96;
          const v = r + threshold > 128 ? 255 : 0;
          r = g = b = v;
        }

        if (posterLevels) {
          const step = 255 / (posterLevels - 1);
          r = Math.round(r / step) * step;
          g = Math.round(g / step) * step;
          b = Math.round(b / step) * step;
        }

        if (state.duotone) {
          const l = luminance(r, g, b) / 255;
          r = mix(dark[0], light[0], l);
          g = mix(dark[1], light[1], l);
          b = mix(dark[2], light[2], l);
        }

        if (state.invert) {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }

        if (rgbOffset > 0) {
          const leftX = clamp(x - rgbOffset, 0, width - 1);
          const rightX = clamp(x + rgbOffset, 0, width - 1);
          r = src[(y * width + leftX) * 4];
          b = src[(y * width + rightX) * 4 + 2];
        }

        if (state.grain > 0) {
          const seed = ((x * 374761393 + y * 668265263) ^ (x * y * 1274126177)) >>> 0;
          const n = ((seed % 1024) / 1023 - 0.5) * state.grain * 1.45;
          r += n;
          g += n;
          b += n;
        }

        data[i] = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function applyOverlays(target, originalOnly) {
    if (originalOnly) return;
    const ctx = target.getContext("2d");
    const w = target.width;
    const h = target.height;

    if (state.halftone > 0) {
      const cell = Math.max(4, Math.round(state.halftone * Math.max(w, h) / 1200));
      const data = ctx.getImageData(0, 0, w, h).data;
      ctx.save();
      ctx.fillStyle = state.duotone ? state.duoDark : "#101112";
      ctx.globalAlpha = state.duotone ? 0.33 : 0.22;
      for (let y = cell / 2; y < h; y += cell) {
        for (let x = cell / 2; x < w; x += cell) {
          const px = Math.min(w - 1, Math.floor(x));
          const py = Math.min(h - 1, Math.floor(y));
          const i = (py * w + px) * 4;
          const l = luminance(data[i], data[i + 1], data[i + 2]) / 255;
          const radius = Math.max(0.15, (1 - l) * cell * 0.52);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    if (state.scanlines) {
      const gap = Math.max(3, Math.round(Math.max(w, h) / 360));
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#090a0b";
      for (let y = 0; y < h; y += gap * 2) ctx.fillRect(0, y, w, Math.max(1, gap * 0.4));
      ctx.restore();
    }

    if (state.vignette > 0) {
      const strength = state.vignette / 100;
      const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.68);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${0.88 * strength})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function applyFrame(input) {
    if (state.frame === "none") return input;

    const w = input.width;
    const h = input.height;
    const edge = Math.max(5, Math.round(Math.min(w, h) * state.frameSize / 100));
    const bottomExtra = state.frame === "polaroid" ? Math.round(edge * 1.8) : 0;
    const out = createCanvas(w + edge * 2, h + edge * 2 + bottomExtra);
    const ctx = out.getContext("2d");

    if (state.frame === "white" || state.frame === "polaroid") {
      ctx.fillStyle = "#ecebe6";
      ctx.fillRect(0, 0, out.width, out.height);
    } else if (state.frame === "black" || state.frame === "film") {
      ctx.fillStyle = "#0c0d0e";
      ctx.fillRect(0, 0, out.width, out.height);
    } else if (state.frame === "chrome") {
      const gradient = ctx.createLinearGradient(0, 0, out.width, out.height);
      gradient.addColorStop(0, "#565a5b");
      gradient.addColorStop(0.22, "#d1d2cf");
      gradient.addColorStop(0.48, "#717575");
      gradient.addColorStop(0.72, "#e3e3df");
      gradient.addColorStop(1, "#4b4f50");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.strokeStyle = "rgba(20,21,22,.7)";
      ctx.lineWidth = Math.max(1, edge * 0.08);
      ctx.strokeRect(edge * 0.28, edge * 0.28, out.width - edge * 0.56, out.height - edge * 0.56);
    }

    ctx.drawImage(input, edge, edge);

    if (state.frame === "film") {
      const holeW = Math.max(3, edge * 0.33);
      const holeH = Math.max(3, edge * 0.52);
      const gap = holeW * 1.7;
      ctx.fillStyle = "#d7d6d1";
      for (let x = edge * 0.35; x < out.width - edge * 0.35; x += gap) {
        ctx.fillRect(x, edge * 0.18, holeW, holeH);
        ctx.fillRect(x, out.height - edge * 0.18 - holeH, holeW, holeH);
      }
    }

    return out;
  }

  function buildFinal(maxDimension, originalOnly = false) {
    const { width, height } = resolveCanvasSize(maxDimension);
    const source = createCanvas(width, height);
    drawSource(source, originalOnly);
    const filtered = applyCssFilters(source, originalOnly);
    applyPixelEffects(filtered, originalOnly);
    applyOverlays(filtered, originalOnly);
    return applyFrame(filtered);
  }

  async function renderPreview() {
    if (!sourceImage) return;
    const token = ++renderToken;
    setBusy(true, compareActive ? "ORIGINAL" : "RENDERING");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (token !== renderToken) return;

    const maxDim = window.innerWidth <= 760 ? 900 : 1200;
    const result = buildFinal(maxDim, compareActive);
    if (token !== renderToken) return;

    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(result, 0, 0);

    dimensionsEl.textContent = `${sourceImage.width} × ${sourceImage.height}`;
    outputMetaEl.textContent = `PNG / ${result.width} × ${result.height}`;
    setBusy(false);
  }

  function resetEffects() {
    const preserved = {
      ratio: state.ratio,
      fit: state.fit,
      frame: state.frame,
      frameSize: state.frameSize,
      bgColor: state.bgColor
    };
    state = { ...DEFAULT, ...preserved };
    setActivePreset("clean");
    syncUI();
    scheduleRender();
  }

  function applyPreset(name) {
    const patch = PRESETS[name];
    if (!patch) return;
    const preserved = {
      ratio: state.ratio,
      fit: state.fit,
      frame: state.frame,
      frameSize: state.frameSize,
      bgColor: state.bgColor
    };
    const fresh = { ...DEFAULT, ...preserved };
    EFFECT_KEYS.forEach((key) => { if (key in patch) fresh[key] = patch[key]; });
    state = fresh;
    setActivePreset(name);
    syncUI();
    scheduleRender();
  }

  function randomize() {
    if (!sourceImage) return;
    const candidates = Object.keys(PRESETS).filter((name) => name !== activePreset);
    applyPreset(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  async function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      toast("Use a JPG, PNG, WEBP or AVIF image.");
      return;
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";

    setBusy(true, "LOADING");
    image.onload = () => {
      sourceImage = image;
      sourceName = file.name || "image";
      sourceBytes = file.size || 0;
      emptyState.hidden = true;
      canvasWrap.hidden = false;
      setControlsEnabled(true);
      fileMetaEl.textContent = `${shortName(sourceName)} / ${humanBytes(sourceBytes)}`;
      resetEffects();
      setBusy(false);
      toast("Image loaded. Processing stays on this device.");
    };
    image.onerror = () => {
      setBusy(false);
      toast("Could not read this image.");
    };
    image.src = sourceUrl;
  }

  function shortName(name) {
    return name.length > 22 ? `${name.slice(0, 18)}…` : name;
  }

  function humanBytes(bytes) {
    if (!bytes) return "DEMO";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function createDemo() {
    const demo = createCanvas(1200, 1500);
    const ctx = demo.getContext("2d", { alpha: false });
    ctx.fillStyle = "#d8d7d1";
    ctx.fillRect(0, 0, demo.width, demo.height);

    ctx.fillStyle = "#17191a";
    ctx.fillRect(0, 0, 1200, 260);
    ctx.fillRect(0, 1260, 1200, 240);

    ctx.fillStyle = "#ff5c38";
    ctx.fillRect(115, 365, 410, 610);

    ctx.save();
    ctx.translate(795, 685);
    ctx.rotate(-0.17);
    ctx.fillStyle = "#2a3cc8";
    ctx.fillRect(-235, -360, 470, 720);
    ctx.restore();

    ctx.fillStyle = "#161819";
    ctx.beginPath();
    ctx.arc(610, 780, 215, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f0efe9";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(610, 780, 142, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#f0efe9";
    ctx.font = "700 94px Arial, sans-serif";
    ctx.fillText("IMAGE", 88, 165);
    ctx.font = "700 94px Arial, sans-serif";
    ctx.fillText("LAB", 828, 1420);

    ctx.fillStyle = "#141617";
    ctx.font = "600 28px Arial, sans-serif";
    ctx.fillText("DEUSHIMA / TEST MATERIAL", 86, 1118);

    sourceImage = demo;
    sourceName = "demo-material.png";
    sourceBytes = 0;
    emptyState.hidden = true;
    canvasWrap.hidden = false;
    setControlsEnabled(true);
    fileMetaEl.textContent = "DEMO MATERIAL";
    resetEffects();
    toast("Demo loaded. Try a style.");
  }

  async function exportImage() {
    if (!sourceImage) return;
    setBusy(true, "EXPORTING");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const maxDim = Math.min(3200, Math.max(sourceImage.width, sourceImage.height));
      const result = buildFinal(maxDim, false);
      const blob = await new Promise((resolve) => result.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("Export failed");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
      link.href = url;
      link.download = `deushima-${base}-${activePreset === "custom" ? "custom" : activePreset}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      toast(`Exported ${result.width} × ${result.height} PNG.`);
    } catch (error) {
      console.error(error);
      toast("Export failed. Try a smaller image.");
    } finally {
      setBusy(false);
    }
  }

  function openFilePicker() {
    fileInput.value = "";
    fileInput.click();
  }

  function setInspectorTab(tab) {
    $$("[data-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    $$("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  }

  function setMobileView(view) {
    $$("[data-mobile-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.mobileView === view));

    if (view === "styles") {
      leftRail.style.display = "";
      rightRail.classList.remove("mobile-open");
      return;
    }

    leftRail.style.display = "none";
    rightRail.classList.add("mobile-open");
    setInspectorTab(view);
  }

  $$('[data-action="upload"]').forEach((button) => button.addEventListener("click", openFilePicker));
  $$('[data-action="export"]').forEach((button) => button.addEventListener("click", exportImage));
  $('[data-action="demo"]')?.addEventListener("click", createDemo);
  $('[data-action="reset"]')?.addEventListener("click", resetEffects);
  $('[data-action="randomize"]')?.addEventListener("click", randomize);

  fileInput.addEventListener("change", () => loadFile(fileInput.files?.[0]));

  $$(".preset").forEach((button) => button.addEventListener("click", () => {
    if (!sourceImage) createDemo();
    applyPreset(button.dataset.preset);
  }));

  $$("[data-param]").forEach((input) => {
    const handler = () => {
      const key = input.dataset.param;
      const numeric = input.type === "range";
      state[key] = numeric ? Number(input.value) : input.value;
      const output = $(`[data-output="${key}"]`);
      if (output) output.value = formatOutput(key, state[key]);
      markCustom();
      scheduleRender();
    };
    input.addEventListener(input.type === "range" ? "input" : "change", handler);
  });

  $$("[data-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      state[input.dataset.toggle] = input.checked;
      markCustom();
      scheduleRender();
    });
  });

  $$("[data-color]").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.color] = input.value;
      if (input.dataset.color === "bgColor" && bgHexEl) bgHexEl.textContent = input.value.toUpperCase();
      markCustom();
      scheduleRender();
    });
  });

  $$(".frame-option").forEach((button) => {
    button.addEventListener("click", () => {
      state.frame = button.dataset.frame;
      $$(".frame-option").forEach((el) => el.classList.toggle("is-active", el === button));
      markCustom();
      scheduleRender();
    });
  });

  $$("[data-tab]").forEach((button) => button.addEventListener("click", () => setInspectorTab(button.dataset.tab)));
  $$("[data-mobile-view]").forEach((button) => button.addEventListener("click", () => setMobileView(button.dataset.mobileView)));

  $$("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const zoom = button.dataset.zoom;
      $$("[data-zoom]").forEach((el) => el.classList.toggle("is-active", el === button));
      canvasWrap.classList.toggle("is-100", zoom === "100");
      if (zoom === "fit") viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    });
  });

  const compareButton = $('[data-action="compare"]');
  const startCompare = () => {
    if (!sourceImage) return;
    compareActive = true;
    scheduleRender();
  };
  const endCompare = () => {
    if (!compareActive) return;
    compareActive = false;
    scheduleRender();
  };
  compareButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    compareButton.setPointerCapture?.(event.pointerId);
    startCompare();
  });
  compareButton?.addEventListener("pointerup", endCompare);
  compareButton?.addEventListener("pointercancel", endCompare);
  compareButton?.addEventListener("lostpointercapture", endCompare);
  compareButton?.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      startCompare();
    }
  });
  compareButton?.addEventListener("keyup", endCompare);

  ["dragenter", "dragover"].forEach((type) => {
    stage.addEventListener(type, (event) => {
      event.preventDefault();
      if ([...(event.dataTransfer?.types || [])].includes("Files")) stage.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    stage.addEventListener(type, (event) => {
      event.preventDefault();
      stage.classList.remove("is-dragging");
      if (type === "drop") loadFile(event.dataTransfer?.files?.[0]);
    });
  });

  window.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      loadFile(file);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key.toLowerCase() === "u") openFilePicker();
    if (event.key.toLowerCase() === "r" && sourceImage) resetEffects();
    if (event.key.toLowerCase() === "e" && sourceImage) exportImage();
  });

  window.addEventListener("resize", () => {
    if (sourceImage) scheduleRender();
  }, { passive: true });

  setControlsEnabled(false);
  syncUI();
})();