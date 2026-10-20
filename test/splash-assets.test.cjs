const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(join(__dirname, '../splash-assets.js'), 'utf8');

function setup(fonts = { load: () => Promise.resolve([{}]) }) {
  const timers = new Map();
  let id = 0;
  const context = {
    window: {}, document: { fonts },
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); }
  };
  runInNewContext(source, context);
  return { ...context.window.DeushimaSplashAssets, timers };
}

function media(properties = {}) {
  return Object.assign(new EventTarget(), {
    style: {}, complete: false, naturalWidth: 0, readyState: 0,
    pause() { this.paused = true; },
    removeAttribute(name) { this.removed = name; },
    load() { this.reloaded = true; }
  }, properties);
}

test('cached images wait for decoding before becoming ready', async () => {
  const { waitForMedia, timers } = setup();
  let decoded;
  const image = media({ complete: true, naturalWidth: 100,
    decode: () => new Promise(resolve => { decoded = resolve; }) });
  let done = false;
  const result = waitForMedia(image, 'image').then(value => { done = true; return value; });
  await Promise.resolve();
  assert.equal(done, false);
  decoded();
  assert.equal(await result, true);
  assert.equal(timers.size, 0);
});

test('uncached images wait for load and hide broken files', async () => {
  const { waitForMedia } = setup();
  const image = media();
  const result = waitForMedia(image, 'image');
  image.complete = true;
  image.dispatchEvent(new Event('load'));
  assert.equal(await result, false);
  assert.equal(image.style.visibility, 'hidden');
});

test('image decode failure settles with a stable fallback', async () => {
  const { waitForMedia } = setup();
  const image = media({ complete: true, naturalWidth: 100, decode: () => Promise.reject(new Error('bad image')) });
  assert.equal(await waitForMedia(image, 'image'), false);
  assert.equal(image.style.visibility, 'hidden');
});

test('video metadata is insufficient: wait for buffered frame data', async () => {
  const { waitForMedia, timers } = setup();
  const video = media({ readyState: 1 });
  let done = false;
  const result = waitForMedia(video, 'video').then(value => { done = true; return value; });
  video.dispatchEvent(new Event('loadeddata'));
  await Promise.resolve();
  assert.equal(done, false);
  video.readyState = 3;
  video.dispatchEvent(new Event('canplay'));
  assert.equal(await result, true);
  assert.equal(timers.size, 0);
});

test('stalled video times out, releases its source, and cannot pop in later', async () => {
  const { waitForMedia, timers } = setup();
  const video = media();
  const result = waitForMedia(video, 'video');
  [...timers.values()].forEach(fn => fn());
  assert.equal(await result, false);
  assert.equal(video.paused, true);
  assert.equal(video.removed, 'src');
  assert.equal(video.reloaded, true);
  video.readyState = 4;
  video.dispatchEvent(new Event('canplay'));
  assert.equal(video.style.visibility, 'hidden');
  assert.equal(timers.size, 0);
});

test('fonts require actual loaded faces and recover from network errors', async () => {
  assert.equal(await setup().waitForFonts(), true);
  assert.equal(await setup({ load: () => Promise.resolve([]) }).waitForFonts(), false);
  assert.equal(await setup({ load: () => Promise.reject(new Error('offline')) }).waitForFonts(), false);
});

test('a stalled font request has a bounded wait', async () => {
  const { waitForFonts, timers } = setup({ load: () => new Promise(() => {}) });
  const result = waitForFonts();
  [...timers.values()].forEach(fn => fn());
  assert.equal(await result, false);
});
