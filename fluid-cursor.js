import { VFX } from "https://esm.sh/@vfx-js/core";

const copyShader = `
precision highp float;
uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 offset;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  outColor = texture(src, uv);
}`;

const curlShader = `
precision highp float;
uniform sampler2D velocity;
uniform vec2 resolution;
uniform vec2 offset;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  float L = texture(velocity, uv - vec2(t.x, 0.0)).y;
  float R = texture(velocity, uv + vec2(t.x, 0.0)).y;
  float T = texture(velocity, uv + vec2(0.0, t.y)).x;
  float B = texture(velocity, uv - vec2(0.0, t.y)).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const vorticityShader = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D curl;
uniform vec2 resolution;
uniform vec2 offset;
uniform vec2 mouse;
uniform vec2 mouseDelta;
uniform float curlStrength;
uniform float splatForce;
uniform float splatRadius;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  float aspect = resolution.x / resolution.y;
  float L = abs(texture(curl, uv - vec2(t.x, 0.0)).x);
  float R = abs(texture(curl, uv + vec2(t.x, 0.0)).x);
  float T = abs(texture(curl, uv + vec2(0.0, t.y)).x);
  float B = abs(texture(curl, uv - vec2(0.0, t.y)).x);
  float C = texture(curl, uv).x;
  vec2 force = vec2(T - B, R - L);
  float len = length(force);
  force = len > 0.0001 ? force / len : vec2(0.0);
  force *= curlStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(velocity, uv).xy;
  vel += force * 0.016;
  vel = clamp(vel, vec2(-1000.0), vec2(1000.0));
  vec2 mouseUv = mouse / resolution;
  vec2 diff = uv - mouseUv;
  diff.x *= aspect;
  float splat = exp(-dot(diff, diff) / splatRadius);
  vel += (mouseDelta / resolution) * splat * splatForce;
  outColor = vec4(vel, 0.0, 1.0);
}`;

const divergenceShader = `
precision highp float;
uniform sampler2D vort_vel;
uniform vec2 resolution;
uniform vec2 offset;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  float L = texture(vort_vel, uv - vec2(t.x, 0.0)).x;
  float R = texture(vort_vel, uv + vec2(t.x, 0.0)).x;
  float T = texture(vort_vel, uv + vec2(0.0, t.y)).y;
  float B = texture(vort_vel, uv - vec2(0.0, t.y)).y;
  vec2 C = texture(vort_vel, uv).xy;
  if (uv.x - t.x < 0.0) L = -C.x;
  if (uv.x + t.x > 1.0) R = -C.x;
  if (uv.y + t.y > 1.0) T = -C.y;
  if (uv.y - t.y < 0.0) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const pressureInitShader = `
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(0.0);
}`;

const pressureShader = `
precision highp float;
uniform sampler2D src;
uniform sampler2D divergence;
uniform vec2 resolution;
uniform vec2 offset;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  float L = texture(src, uv - vec2(t.x, 0.0)).x;
  float R = texture(src, uv + vec2(t.x, 0.0)).x;
  float T = texture(src, uv + vec2(0.0, t.y)).x;
  float B = texture(src, uv - vec2(0.0, t.y)).x;
  float div = texture(divergence, uv).x;
  outColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

function makeGradientShader(pressureBuffer) {
  return `
precision highp float;
uniform sampler2D vort_vel;
uniform sampler2D ${pressureBuffer};
uniform vec2 resolution;
uniform vec2 offset;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  float L = texture(${pressureBuffer}, uv - vec2(t.x, 0.0)).x;
  float R = texture(${pressureBuffer}, uv + vec2(t.x, 0.0)).x;
  float T = texture(${pressureBuffer}, uv + vec2(0.0, t.y)).x;
  float B = texture(${pressureBuffer}, uv - vec2(0.0, t.y)).x;
  vec2 vel = texture(vort_vel, uv).xy;
  vel -= vec2(R - L, T - B);
  outColor = vec4(vel, 0.0, 1.0);
}`;
}

const advectVelShader = `
precision highp float;
uniform sampler2D proj_vel;
uniform vec2 resolution;
uniform vec2 offset;
uniform float velocityDissipation;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 t = 1.0 / resolution;
  vec2 vel = texture(proj_vel, uv).xy;
  vec2 coord = uv - vel * t * 0.016;
  vec2 advected = texture(proj_vel, coord).xy;
  advected /= 1.0 + velocityDissipation * 0.016;
  outColor = vec4(advected, 0.0, 1.0);
}`;

const displayShader = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D canvas;
uniform vec2 resolution;
uniform vec2 offset;
uniform vec2 simSize;
out vec4 outColor;

vec3 spectrum(float x) {
  return cos((x - vec3(0, .5, 1)) * vec3(.6, 1., .5) * 3.14);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 vel = texture(velocity, uv).xy;
  vec2 disp = vel / simSize;
  float v = length(disp);

  const int N = 8;
  vec4 color = vec4(0.0);
  vec3 wsum = vec3(0.0);

  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1);
    vec3 w = max(vec3(0.0), cos((t - vec3(0.0, 0.5, 1.0)) * 3.14159 * 0.5));
    vec4 sampleColor = texture(canvas, uv - disp * 0.28 * (t + 0.24) * v);
    color.rgb += sampleColor.rgb * w;
    color.a += sampleColor.a * (w.r + w.g + w.b) / 3.0;
    wsum += w;
  }

  color.rgb /= wsum;
  color.a /= (wsum.r + wsum.g + wsum.b) / 3.0;
  outColor = color;

  vec4 chroma = vec4(spectrum(sin(v * 2.0) * 0.38 + 0.62), 1.0);
  outColor += chroma * (smoothstep(0.18, 0.78, v) * 0.34);

  float edge = smoothstep(0.003, 0.0, abs(v - 0.25));
  outColor = abs(outColor - edge * 0.34);
}`;

function buildFluidPasses(opts) {
  const { simSize, mouseDelta } = opts;
  const pressurePasses = [];

  pressurePasses.push({
    frag: pressureInitShader,
    target: "p_a",
    float: true,
    size: simSize
  });

  let lastTarget = "p_a";
  for (let i = 0; i < opts.pressureIterations; i++) {
    lastTarget = i % 2 === 0 ? "p_b" : "p_a";
    pressurePasses.push({
      frag: pressureShader,
      target: lastTarget,
      float: true,
      size: simSize
    });
  }

  return [
    { frag: copyShader, target: "canvas" },
    { frag: curlShader, target: "curl", float: true, size: simSize },
    {
      frag: vorticityShader,
      target: "vort_vel",
      float: true,
      size: simSize,
      uniforms: {
        mouseDelta,
        curlStrength: opts.curlStrength,
        splatForce: opts.splatForce,
        splatRadius: opts.splatRadius
      }
    },
    { frag: divergenceShader, target: "divergence", float: true, size: simSize },
    ...pressurePasses,
    {
      frag: makeGradientShader(lastTarget),
      target: "proj_vel",
      float: true,
      size: simSize
    },
    {
      frag: advectVelShader,
      target: "velocity",
      persistent: true,
      float: true,
      size: simSize,
      uniforms: { velocityDissipation: opts.velocityDissipation }
    },
    {
      frag: displayShader,
      uniforms: { simSize }
    }
  ];
}

const app = document.getElementById("app");
let pos = [-1, -1];
let delta = [0, 0];

function onMove(x, y) {
  if (pos[0] >= 0) {
    delta = [x - pos[0], y - pos[1]];
  }
  pos = [x, y];
}

window.addEventListener("pointermove", (event) => {
  onMove(event.clientX, window.innerHeight - event.clientY);
});

async function initFluidCursor() {
  if (!app || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const simBase = window.innerWidth < 720 ? 150 : 220;
  const aspect = document.documentElement.clientWidth / document.documentElement.clientHeight;
  const simSize = aspect > 1
    ? [Math.round(simBase * aspect), simBase]
    : [simBase, Math.round(simBase / aspect)];

  const passes = buildFluidPasses({
    simSize,
    mouseDelta: () => {
      delta = [delta[0] * 0.84, delta[1] * 0.84];
      return delta;
    },
    pressureIterations: 12,
    curlStrength: 20,
    velocityDissipation: 2.2,
    splatForce: 3000,
    splatRadius: 0.002
  });

  const vfx = new VFX({ postEffect: passes });
  await vfx.add(app, { shader: "none" });
  vfx.play();
}

if (document.readyState === "complete") {
  initFluidCursor();
} else {
  window.addEventListener("load", initFluidCursor, { once: true });
}
