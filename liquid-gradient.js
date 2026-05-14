(function () {
  const canvas = document.querySelector("[data-liquid-gradient]");
  if (!canvas) return;

  const hero = document.querySelector(".hero");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";

  let app = null;
  let active = false;
  let loadPromise = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-three-liquid]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.THREE));
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = THREE_SRC;
      script.async = true;
      script.dataset.threeLiquid = "true";
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("three-load-failed"));
      document.head.appendChild(script);
    });

    return loadPromise;
  }

  class TouchTexture {
    constructor(THREE) {
      this.THREE = THREE;
      this.size = 64;
      this.maxAge = 64;
      this.radius = 0.25 * this.size;
      this.trail = [];
      this.last = null;
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.size;
      this.canvas.height = this.size;
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.texture = new THREE.Texture(this.canvas);
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.clear();
    }

    clear() {
      this.ctx.fillStyle = "rgb(128,128,0)";
      this.ctx.fillRect(0, 0, this.size, this.size);
    }

    add(point) {
      let vx = 0;
      let vy = 0;
      let force = 0.18;

      if (this.last) {
        const dx = point.x - this.last.x;
        const dy = point.y - this.last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.00045) return;
        vx = dx / dist;
        vy = dy / dist;
        force = clamp((dx * dx + dy * dy) * 18000, 0.18, 2.0);
      }

      this.last = { x: point.x, y: point.y };
      this.trail.push({ x: point.x, y: point.y, vx, vy, force, age: 0 });
      if (this.trail.length > 24) this.trail.shift();
    }

    drawPoint(point) {
      const x = point.x * this.size;
      const y = (1 - point.y) * this.size;
      const life = 1 - point.age / this.maxAge;
      const attack = point.age < this.maxAge * 0.24
        ? Math.sin((point.age / (this.maxAge * 0.24)) * (Math.PI / 2))
        : 1;
      const release = life * (2 - life);
      const intensity = attack * release * point.force;
      const offset = this.size * 3;
      const r = ((point.vx + 1) * 0.5) * 255;
      const g = ((point.vy + 1) * 0.5) * 255;
      const b = intensity * 255;

      this.ctx.shadowOffsetX = offset;
      this.ctx.shadowOffsetY = offset;
      this.ctx.shadowBlur = this.radius * 1.15;
      this.ctx.shadowColor = `rgba(${r},${g},${b},${0.16 + intensity * 0.34})`;
      this.ctx.beginPath();
      this.ctx.fillStyle = "rgba(255,0,0,1)";
      this.ctx.arc(x - offset, y - offset, this.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    update() {
      this.clear();
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const point = this.trail[i];
        point.age += 1;
        if (point.age > this.maxAge) {
          this.trail.splice(i, 1);
          continue;
        }
        point.x += point.vx * point.force * 0.00125;
        point.y += point.vy * point.force * 0.00125;
        this.drawPoint(point);
      }
      this.texture.needsUpdate = true;
    }
  }

  class LiquidGradient {
    constructor(THREE, targetCanvas) {
      this.THREE = THREE;
      this.canvas = targetCanvas;
      this.clock = new THREE.Clock();
      this.frame = null;
      this.touchTexture = new TouchTexture(THREE);
      this.pointer = { x: 0.5, y: 0.5 };
      this.pointerTarget = { x: 0.5, y: 0.5 };
      this.pointerVelocity = { x: 0, y: 0 };
      this.pointerVelocityTarget = { x: 0, y: 0 };
      this.pointerActivity = 0;
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        depth: false,
        stencil: false,
        powerPreference: "high-performance"
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1 : 1.35));

      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.uniforms = {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTouchTexture: { value: this.touchTexture.texture },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uPointerVelocity: { value: new THREE.Vector2(0, 0) },
        uPointerActivity: { value: 0 },
        uPointerStrength: { value: coarsePointer.matches ? 0.0 : 0.42 },
        uGrain: { value: 0.055 },
        uDeep: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        uNavy: { value: new THREE.Vector3(0.0, 0.0, 0.18) },
        uBlue: { value: new THREE.Vector3(0.0, 0.0, 0.93) },
        uLight: { value: new THREE.Vector3(0.557, 0.765, 1.0) }
      };

      const material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform float uTime;
          uniform vec2 uResolution;
          uniform sampler2D uTouchTexture;
          uniform vec2 uPointer;
          uniform vec2 uPointerVelocity;
          uniform float uPointerActivity;
          uniform float uPointerStrength;
          uniform float uGrain;
          uniform vec3 uDeep;
          uniform vec3 uNavy;
          uniform vec3 uBlue;
          uniform vec3 uLight;
          varying vec2 vUv;

          float random(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float blob(vec2 uv, vec2 center, float radius) {
            float d = length(uv - center);
            return 1.0 - smoothstep(0.0, radius, d);
          }

          vec2 liquidCenter(float t, float speed, float ampX, float ampY, float phase) {
            return vec2(
              0.5 + sin(t * speed + phase) * ampX,
              0.5 + cos(t * (speed * 0.82) + phase * 1.37) * ampY
            );
          }

          void main() {
            vec2 uv = vUv;
            vec2 touch = texture2D(uTouchTexture, uv).rg * 2.0 - 1.0;
            float touchPower = texture2D(uTouchTexture, uv).b;
            uv += touch * touchPower * uPointerStrength;

            float pointerDistance = length(uv - uPointer);
            float pointerPull = 1.0 - smoothstep(0.0, 0.46, pointerDistance);
            vec2 pointerDrift = uPointerVelocity * pointerPull * (0.035 + uPointerActivity * 0.115);
            uv -= pointerDrift;

            float ripple = sin(pointerDistance * 28.0 - uTime * 4.2) * 0.012;
            uv += normalize(uv - uPointer + 0.0001) * ripple * pointerPull * uPointerActivity;

            float aspect = uResolution.x / max(uResolution.y, 1.0);
            vec2 p = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);
            float t = uTime * 0.18;
            vec2 cursorBias = (uPointer - 0.5) * vec2(0.24 * aspect, 0.2);
            float basePulse = sin(uTime * 0.18 + uv.x * 2.2 + uv.y * 1.35) * 0.5 + 0.5;
            float lowerLift = 1.0 - smoothstep(-0.08, 0.92, uv.y);
            float editorialLift = pow(lowerLift, 1.65) * 0.12;
            vec2 domeSpace = vec2((uv.x - 0.5 + cursorBias.x * 0.24) * 0.72, (uv.y + 0.04 + cursorBias.y * 0.1) * 0.46);
            float editorialDome = 1.0 - smoothstep(0.08, 0.92, length(domeSpace));
            editorialDome = pow(max(editorialDome, 0.0), 1.78);

            vec3 color = uDeep;
            color += uNavy * (0.46 + basePulse * 0.09 + editorialLift * 0.065);
            color += uBlue * (basePulse * 0.11 + editorialLift * 0.07);
            color += uBlue * editorialDome * 0.33;
            color += uLight * pow(editorialDome, 2.2) * 0.13;

            float b1 = blob(p, liquidCenter(t, 1.00, 0.34, 0.18, 0.2) + cursorBias * 0.38, 0.52);
            float b2 = blob(p, liquidCenter(t, 0.74, 0.42, 0.24, 2.1) - cursorBias * 0.26, 0.48);
            float b3 = blob(p, liquidCenter(t, 1.32, 0.26, 0.28, 4.2) + cursorBias * 0.18, 0.44);
            float b4 = blob(p, liquidCenter(t, 0.58, 0.48, 0.16, 5.5) - cursorBias * 0.34, 0.58);

            color += uBlue * b1 * 0.28;
            color += uLight * b2 * 0.16;
            color += vec3(0.0, 0.12, 1.0) * b3 * 0.24;
            color += uNavy * b4 * 0.16;
            color += uBlue * pointerPull * (0.08 + uPointerActivity * 0.08);
            color += uLight * pointerPull * uPointerActivity * 0.12;

            float wave = sin((uv.x * 2.1 + uv.y * 3.4 + uTime * 0.18) * 3.14159) * 0.5 + 0.5;
            color += uBlue * wave * 0.035;

            float vignette = smoothstep(0.86, 0.22, length((uv - 0.5) * vec2(1.05, 0.86)));
            float topShade = smoothstep(0.58, 1.0, uv.y);
            color *= 0.84 + vignette * 0.48;
            color = mix(color, uDeep, topShade * 0.15);

            float grain = random(uv * uResolution.xy + uTime * 34.0) * 2.0 - 1.0;
            color += grain * uGrain;
            color = clamp(color, 0.0, 1.0);

            gl_FragColor = vec4(color, 1.0);
          }
        `
      });

      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      this.scene.add(this.mesh);
      this.resize();
    }

    resize() {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      this.renderer.setSize(width, height, false);
      this.uniforms.uResolution.value.set(width, height);
    }

    pointerMove(event) {
      if (coarsePointer.matches) return;
      const width = Math.max(window.innerWidth, 1);
      const height = Math.max(window.innerHeight, 1);
      const point = {
        x: clamp(event.clientX / width, 0, 1),
        y: clamp(1 - event.clientY / height, 0, 1)
      };
      this.pointerVelocityTarget.x = clamp(point.x - this.pointerTarget.x, -0.12, 0.12);
      this.pointerVelocityTarget.y = clamp(point.y - this.pointerTarget.y, -0.12, 0.12);
      this.pointerTarget = point;
      this.pointerActivity = 1;
      this.touchTexture.add(point);
      active = !prefersReducedMotion.matches;
      this.play();
    }

    render() {
      const delta = Math.min(this.clock.getDelta(), 0.06);
      this.uniforms.uTime.value += delta;
      this.pointer.x += (this.pointerTarget.x - this.pointer.x) * 0.095;
      this.pointer.y += (this.pointerTarget.y - this.pointer.y) * 0.095;
      this.pointerVelocity.x += (this.pointerVelocityTarget.x - this.pointerVelocity.x) * 0.18;
      this.pointerVelocity.y += (this.pointerVelocityTarget.y - this.pointerVelocity.y) * 0.18;
      this.pointerVelocityTarget.x *= 0.86;
      this.pointerVelocityTarget.y *= 0.86;
      this.pointerActivity *= 0.94;
      this.uniforms.uPointer.value.set(this.pointer.x, this.pointer.y);
      this.uniforms.uPointerVelocity.value.set(this.pointerVelocity.x, this.pointerVelocity.y);
      this.uniforms.uPointerActivity.value = this.pointerActivity;
      this.touchTexture.update();
      this.renderer.render(this.scene, this.camera);
    }

    play() {
      if (this.frame) return;
      const tick = () => {
        if (!active || document.hidden) {
          this.frame = null;
          return;
        }
        this.render();
        this.frame = window.requestAnimationFrame(tick);
      };
      this.frame = window.requestAnimationFrame(tick);
    }

    dispose() {
      if (this.frame) window.cancelAnimationFrame(this.frame);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.touchTexture.texture.dispose();
      this.renderer.dispose();
    }
  }

  function setCanvasVisibility() {
    const shouldAnimate = true;
    active = shouldAnimate && !prefersReducedMotion.matches && Boolean(app);
    canvas.style.setProperty("--liquid-opacity", "1.000");
    if (active) app.play();
  }

  function initFallback() {
    canvas.classList.add("is-fallback");
    canvas.style.setProperty("--liquid-opacity", "1");
    window.addEventListener("scroll", setCanvasVisibility, { passive: true });
    window.addEventListener("resize", setCanvasVisibility);
    setCanvasVisibility();
  }

  async function init() {
    if (prefersReducedMotion.matches || coarsePointer.matches) {
      initFallback();
      return;
    }

    try {
      const THREE = await loadThree();
      app = new LiquidGradient(THREE, canvas);
      app.render();
      window.addEventListener("pointermove", (event) => app?.pointerMove(event), { passive: true });
      window.addEventListener("resize", () => {
        app?.resize();
        setCanvasVisibility();
      });
      window.addEventListener("scroll", setCanvasVisibility, { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          app?.render();
          setCanvasVisibility();
        }
      });
      setCanvasVisibility();
    } catch (error) {
      console.warn("Liquid gradient fallback:", error);
      initFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
