const canvas = document.querySelector("[data-noise-canvas]");
const hero = document.querySelector(".hero");
const ctx = canvas.getContext("2d", { alpha: true });
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
let noiseCanvas = document.createElement("canvas");
let noiseCtx = noiseCanvas.getContext("2d");
let noiseImage = null;
let noiseWidth = 0;
let noiseHeight = 0;
let dust = [];

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildNoiseBuffer();
  buildDust();
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
  photoBlur += (targetBlur - photoBlur) * 0.13;
  noiseBoost += (targetNoiseBoost - noiseBoost) * 0.18;
  targetBlur *= 0.87;
  targetNoiseBoost *= 0.84;
  updateNoise(now);

  ctx.clearRect(0, 0, width, height);

  hero.style.setProperty("--photo-x", `${(-pointerX * 48).toFixed(2)}px`);
  hero.style.setProperty("--photo-y", `${(-pointerY * 30).toFixed(2)}px`);
  hero.style.setProperty("--photo-blur", `${photoBlur.toFixed(2)}px`);
  hero.style.setProperty("--noise-opacity", `${Math.min(0.58, 0.38 + noiseBoost * 0.14).toFixed(2)}`);

  const driftX = pointerX * 46 + Math.sin(now * 0.0004) * 18;
  const driftY = pointerY * 34 + Math.cos(now * 0.00034) * 14;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.3 + noiseBoost * 0.16;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCanvas, driftX - 18, driftY - 18, width + 36, height + 36);
  ctx.restore();

  ctx.save();
  dust.forEach((point, index) => {
    const x = point.x + Math.sin(now * 0.00024 + point.drift + index) * 1.2;
    const y = point.y + Math.cos(now * 0.00018 + point.drift) * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${point.alpha})`;
    ctx.fillRect(x, y, point.size, point.size);
  });
  ctx.restore();

  requestAnimationFrame(drawNoise);
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
window.addEventListener("pointermove", (event) => {
  const movement = Math.hypot(event.movementX || 0, event.movementY || 0);
  targetX = (event.clientX / window.innerWidth - 0.5) * 2;
  targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  targetBlur = Math.min(7.2, movement * 0.12);
  targetNoiseBoost = Math.min(1, movement / 34);
});

window.addEventListener("load", () => {
  window.setTimeout(() => preloader.classList.add("is-hidden"), 620);
});

resizeCanvas();
updateTime();
setInterval(updateTime, 1000);
requestAnimationFrame(drawNoise);
