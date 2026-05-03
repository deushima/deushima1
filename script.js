const canvas = document.querySelector("[data-noise-canvas]");
const distortionCanvas = document.querySelector("[data-distortion-canvas]");
const hero = document.querySelector(".hero");
const sourceImage = document.querySelector(".hero__photo");
const ctx = canvas.getContext("2d", { alpha: true });
const gl = distortionCanvas.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
  preserveDrawingBuffer: false
});
const preloader = document.querySelector("[data-preloader]");
const timeNode = document.querySelector("[data-current-time]");

let width = 0;
let height = 0;
let dpr = 1;
let pointerX = 0;
let pointerY = 0;
let targetX = 0;
let targetY = 0;
let targetBlur = 0;
let photoBlur = 0;
let noiseBoost = 0;
let targetNoiseBoost = 0;
let mouseX = 0.5;
let mouseY = 0.5;
let smoothMouseX = 0.5;
let smoothMouseY = 0.5;
let velocityX = 0;
let velocityY = 0;
let targetVelocityX = 0;
let targetVelocityY = 0;
let distortionForce = 0;
let targetDistortionForce = 0;
let lastPointerX = null;
let lastPointerY = null;
let noiseCanvas = document.createElement("canvas");
let noiseCtx = noiseCanvas.getContext("2d");
let noiseImage = null;
let noiseWidth = 0;
let noiseHeight = 0;
let dust = [];
let pointerTrail = [];
let webglReady = false;
let distortionProgram = null;
let distortionUniforms = null;
const trailUniformData = new Float32Array(40);
const trailLifeData = new Float32Array(10);

const vertexShaderSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentShaderSource = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uImageResolution;
uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform vec2 uParallax;
uniform float uMotionBlur;
uniform vec4 uTrail[10];
uniform float uTrailLife[10];
uniform float uForce;
uniform float uTime;

vec2 coverUv(vec2 uv) {
  vec2 ratio = uResolution / uImageResolution;
  float scale = max(ratio.x, ratio.y);
  vec2 scaledSize = uImageResolution * scale;
  vec2 crop = (scaledSize - uResolution) / (2.0 * scaledSize);
  return uv * (uResolution / scaledSize) + crop;
}

vec3 applyLook(vec3 color) {
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, 0.86);
  color = (color - 0.5) * 1.38 + 0.5;
  color *= vec3(0.55, 0.63, 0.92);
  return clamp(color, 0.0, 1.0);
}

vec4 photo(vec2 uv) {
  vec2 covered = coverUv(uv + uParallax);
  return texture2D(uTexture, covered);
}

void main() {
  vec2 uv = vUv;
  vec2 mouse = uMouse;
  vec2 velocity = uVelocity;
  vec2 mainDir = normalize(velocity + vec2(0.0001));
  float totalField = 0.0;
  vec2 pull = vec2(0.0);
  vec2 wave = vec2(0.0);
  vec2 blurStep = vec2(0.0);
  vec2 aberration = vec2(0.0);

  for (int i = 0; i < 10; i++) {
    vec2 point = uTrail[i].xy;
    vec2 pointVelocity = uTrail[i].zw;
    float life = uTrailLife[i];
    vec2 dir = normalize(pointVelocity + vec2(0.0001));
    vec2 normal = vec2(-dir.y, dir.x);
    vec2 delta = uv - point;
    delta.x *= uResolution.x / uResolution.y;

    float along = dot(delta, dir);
    float across = dot(delta, normal);
    float speed = clamp(length(pointVelocity) / 82.0, 0.0, 1.0) * life * uForce;
    float core = exp(-dot(delta, delta) * 24.0);
    float wake = (1.0 - smoothstep(-0.06, 0.54, along)) * (1.0 - smoothstep(0.0, 0.34, abs(across)));
    float lane = 0.5 + 0.5 * sin(across * 88.0 + along * 20.0 - uTime * 0.004 + float(i) * 1.7);
    float ribbon = exp(-abs(across) * 18.0) * wake * (0.54 + lane * 0.46);
    float softEdge = 1.0 - smoothstep(0.0, 0.58, length(delta));
    float field = clamp(core * 0.64 + ribbon * 0.82, 0.0, 1.0) * speed * softEdge;

    totalField += field;
    pull += -dir * field * (0.11 + life * 0.045);
    wave += normal * sin(along * 34.0 + uTime * 0.004 + float(i)) * field * 0.014;
    blurStep += dir * field * 0.019;
    aberration += dir * field * 0.022;
  }

  totalField = clamp(totalField, 0.0, 1.0);

  vec2 displacedUv = uv + pull + wave;
  vec2 motionDir = normalize(velocity + vec2(0.0001));
  vec2 globalBlur = motionDir * uMotionBlur;
  vec4 base = photo(uv) * 0.48;
  base += photo(uv - globalBlur) * 0.26;
  base += photo(uv + globalBlur) * 0.26;

  vec3 blurred = vec3(0.0);
  blurred += photo(displacedUv - blurStep * 3.0).rgb * 0.08;
  blurred += photo(displacedUv - blurStep * 2.0).rgb * 0.12;
  blurred += photo(displacedUv - blurStep).rgb * 0.16;
  blurred += photo(displacedUv).rgb * 0.28;
  blurred += photo(displacedUv + blurStep).rgb * 0.16;
  blurred += photo(displacedUv + blurStep * 2.0).rgb * 0.12;
  blurred += photo(displacedUv + blurStep * 3.0).rgb * 0.08;

  vec3 chroma;
  chroma.r = photo(displacedUv + aberration).r;
  chroma.g = blurred.g;
  chroma.b = photo(displacedUv - aberration).b;

  vec3 mixedColor = mix(base.rgb, mix(blurred, chroma, 0.84), smoothstep(0.018, 0.78, totalField));
  vec3 color = applyLook(mixedColor);
  color = mix(vec3(0.0588), color, 0.98);

  gl_FragColor = vec4(color, 1.0);
}`;

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;

  distortionCanvas.width = Math.floor(width * dpr);
  distortionCanvas.height = Math.floor(height * dpr);
  distortionCanvas.style.width = `${width}px`;
  distortionCanvas.style.height = `${height}px`;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (gl && webglReady) {
    gl.viewport(0, 0, distortionCanvas.width, distortionCanvas.height);
  }

  buildNoiseBuffer();
  buildDust();
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram() {
  const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(program));
    return null;
  }

  return program;
}

async function initDistortion() {
  if (!gl || !sourceImage) return;

  if (!sourceImage.complete || sourceImage.naturalWidth === 0) {
    try {
      await sourceImage.decode();
    } catch {
      return;
    }
  }

  distortionProgram = createProgram();
  if (!distortionProgram) return;

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(distortionProgram, "aPosition");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImage);

  distortionUniforms = {
    texture: gl.getUniformLocation(distortionProgram, "uTexture"),
    resolution: gl.getUniformLocation(distortionProgram, "uResolution"),
    imageResolution: gl.getUniformLocation(distortionProgram, "uImageResolution"),
    mouse: gl.getUniformLocation(distortionProgram, "uMouse"),
    velocity: gl.getUniformLocation(distortionProgram, "uVelocity"),
    parallax: gl.getUniformLocation(distortionProgram, "uParallax"),
    motionBlur: gl.getUniformLocation(distortionProgram, "uMotionBlur"),
    trail: gl.getUniformLocation(distortionProgram, "uTrail[0]"),
    trailLife: gl.getUniformLocation(distortionProgram, "uTrailLife[0]"),
    force: gl.getUniformLocation(distortionProgram, "uForce"),
    time: gl.getUniformLocation(distortionProgram, "uTime")
  };

  gl.useProgram(distortionProgram);
  gl.uniform1i(distortionUniforms.texture, 0);
  gl.viewport(0, 0, distortionCanvas.width, distortionCanvas.height);
  webglReady = true;
  hero.classList.add("is-webgl");
}

function buildNoiseBuffer() {
  noiseWidth = Math.max(260, Math.floor(width / 3.5));
  noiseHeight = Math.max(160, Math.floor(height / 3.5));
  noiseCanvas.width = noiseWidth;
  noiseCanvas.height = noiseHeight;
  noiseImage = noiseCtx.createImageData(noiseWidth, noiseHeight);
}

function buildDust() {
  dust = [];
  const amount = Math.floor((width * height) / 13000);

  for (let i = 0; i < amount; i++) {
    dust.push({
      x: Math.random() * width,
      y: Math.random() * height,
      alpha: 0.03 + Math.random() * 0.16,
      size: Math.random() < 0.88 ? 1 : 1.7,
      drift: Math.random() * Math.PI * 2
    });
  }
}

function updateNoise(now) {
  if (!noiseImage) return;

  const data = noiseImage.data;
  const wave = Math.floor(now * 0.025);

  for (let i = 0; i < data.length; i += 4) {
    const n = Math.random();
    const pulse = Math.sin(i * 0.00065 + wave) * 0.5 + 0.5;
    const value = n > 0.48 ? 196 + Math.floor(n * 50) : Math.floor(n * 54);
    const blue = Math.floor(pulse * 48);

    data[i] = Math.max(0, value - 28);
    data[i + 1] = Math.max(0, value - 16 + blue * 0.2);
    data[i + 2] = Math.min(255, value + blue);
    data[i + 3] = n > 0.43 ? 72 : 18;
  }

  noiseCtx.putImageData(noiseImage, 0, 0);
}

function drawNoise(now) {
  pointerX += (targetX - pointerX) * 0.06;
  pointerY += (targetY - pointerY) * 0.06;
  smoothMouseX += (mouseX - smoothMouseX) * 0.12;
  smoothMouseY += (mouseY - smoothMouseY) * 0.12;
  velocityX += (targetVelocityX - velocityX) * 0.14;
  velocityY += (targetVelocityY - velocityY) * 0.14;
  photoBlur += (targetBlur - photoBlur) * 0.13;
  distortionForce += (targetDistortionForce - distortionForce) * 0.14;
  noiseBoost += (targetNoiseBoost - noiseBoost) * 0.18;
  targetBlur *= 0.87;
  targetVelocityX *= 0.82;
  targetVelocityY *= 0.82;
  targetDistortionForce *= 0.84;
  targetNoiseBoost *= 0.84;
  updatePointerTrail();
  updateNoise(now);

  ctx.clearRect(0, 0, width, height);

  hero.style.setProperty("--photo-x", `${(-pointerX * 48).toFixed(2)}px`);
  hero.style.setProperty("--photo-y", `${(-pointerY * 30).toFixed(2)}px`);
  hero.style.setProperty("--photo-blur", `${photoBlur.toFixed(2)}px`);
  hero.style.setProperty("--shadow-x", `${(pointerX * 42).toFixed(2)}px`);
  hero.style.setProperty("--shadow-y", `${(pointerY * 26).toFixed(2)}px`);
  hero.style.setProperty("--shadow-blur", `${(7 + photoBlur * 0.72).toFixed(2)}px`);
  hero.style.setProperty("--shadow-opacity", `${Math.min(0.24, 0.1 + noiseBoost * 0.08 + photoBlur * 0.006).toFixed(3)}`);
  hero.style.setProperty("--noise-opacity", `${Math.min(0.58, 0.38 + noiseBoost * 0.14).toFixed(2)}`);

  drawDistortion(now);

  const idleX = Math.sin(now * 0.00055) * 28 + Math.sin(now * 0.0011) * 8;
  const idleY = Math.cos(now * 0.00047) * 22 + Math.cos(now * 0.0009) * 7;
  const driftX = pointerX * 46 + idleX;
  const driftY = pointerY * 34 + idleY;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.4 + noiseBoost * 0.2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCanvas, driftX - 18, driftY - 18, width + 36, height + 36);
  ctx.restore();

  ctx.save();
  dust.forEach((point, index) => {
    const x = point.x + Math.sin(now * 0.00024 + point.drift + index) * 1.2;
    const y = point.y + Math.cos(now * 0.00018 + point.drift) * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${point.alpha * 1.25})`;
    ctx.fillRect(x, y, point.size, point.size);
  });
  ctx.restore();

  requestAnimationFrame(drawNoise);
}

function drawDistortion(now) {
  if (!gl || !webglReady || !distortionProgram || !distortionUniforms) return;

  trailUniformData.fill(0);
  trailLifeData.fill(0);

  for (let i = 0; i < Math.min(pointerTrail.length, 10); i++) {
    const point = pointerTrail[i];
    const index = i * 4;
    trailUniformData[index] = point.x;
    trailUniformData[index + 1] = point.y;
    trailUniformData[index + 2] = point.vx;
    trailUniformData[index + 3] = point.vy;
    trailLifeData[i] = point.life;
  }

  gl.useProgram(distortionProgram);
  gl.uniform2f(distortionUniforms.resolution, distortionCanvas.width, distortionCanvas.height);
  gl.uniform2f(distortionUniforms.imageResolution, sourceImage.naturalWidth, sourceImage.naturalHeight);
  gl.uniform2f(distortionUniforms.mouse, smoothMouseX, smoothMouseY);
  gl.uniform2f(distortionUniforms.velocity, velocityX, velocityY);
  gl.uniform2f(distortionUniforms.parallax, pointerX * 0.026, -pointerY * 0.018);
  gl.uniform1f(distortionUniforms.motionBlur, Math.min(0.006, photoBlur * 0.00085));
  gl.uniform4fv(distortionUniforms.trail, trailUniformData);
  gl.uniform1fv(distortionUniforms.trailLife, trailLifeData);
  gl.uniform1f(distortionUniforms.force, Math.min(1, distortionForce));
  gl.uniform1f(distortionUniforms.time, now);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function updatePointerTrail() {
  pointerTrail = pointerTrail
    .map((point) => ({
      ...point,
      vx: point.vx * 0.88,
      vy: point.vy * 0.88,
      life: point.life * 0.84
    }))
    .filter((point) => point.life > 0.035);
}

function updateTime() {
  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  timeNode.textContent = formatter.format(new Date());
}

window.addEventListener("resize", resizeCanvas);

function handlePointerMove(event) {
  const movementX = lastPointerX === null ? event.movementX || 0 : event.clientX - lastPointerX;
  const movementY = lastPointerY === null ? event.movementY || 0 : event.clientY - lastPointerY;
  const movement = Math.hypot(movementX, movementY);

  if (movement === 0 && event.clientX === lastPointerX && event.clientY === lastPointerY) {
    return;
  }

  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  mouseX = event.clientX / window.innerWidth;
  mouseY = 1 - event.clientY / window.innerHeight;
  targetX = (event.clientX / window.innerWidth - 0.5) * 2;
  targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  targetVelocityX = movementX * 1.22;
  targetVelocityY = -movementY * 1.22;
  targetBlur = Math.min(7.2, movement * 0.12);
  targetDistortionForce = Math.min(1, movement / 34);
  targetNoiseBoost = Math.min(1, movement / 34);

  if (movement > 2.5) {
    pointerTrail.unshift({
      x: mouseX,
      y: mouseY,
      vx: movementX * 1.72,
      vy: -movementY * 1.72,
      life: Math.min(0.82, 0.34 + movement / 34)
    });

    if (pointerTrail.length > 7) {
      pointerTrail.length = 7;
    }
  }
}

window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("mousemove", handlePointerMove);

function hidePreloader() {
  window.setTimeout(() => preloader.classList.add("is-hidden"), 620);
}

if (document.readyState === "complete") {
  hidePreloader();
} else {
  window.addEventListener("load", hidePreloader, { once: true });
}

resizeCanvas();
updateTime();
setInterval(updateTime, 1000);
initDistortion();
requestAnimationFrame(drawNoise);
