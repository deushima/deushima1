'use strict';

const zlib = require('zlib');

const MAX_COMPRESSED_BYTES = 8192;
const MAX_SVG_BYTES = 65536;

function decodeBase64Url(value) {
  const input = String(value || '').trim();
  if (!input || !/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const padding = '='.repeat((4 - input.length % 4) % 4);
  try {
    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + padding, 'base64');
  } catch {
    return null;
  }
}

function sanitizeSvg(value) {
  let svg = String(value || '').trim();
  if (!/^<svg[\s>]/i.test(svg) || Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) return null;

  svg = svg
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|xlink:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');

  if (!/^<svg[\s>]/i.test(svg)) return null;
  if (!/\sxmlns\s*=/.test(svg.slice(0, 512))) {
    svg = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const compressed = decodeBase64Url(req.query?.d);
  if (!compressed || compressed.length > MAX_COMPRESSED_BYTES) {
    return res.status(400).send('Invalid SVG payload');
  }

  let raw;
  try {
    raw = zlib.inflateSync(compressed, { maxOutputLength: MAX_SVG_BYTES }).toString('utf8');
  } catch {
    return res.status(400).send('Invalid SVG payload');
  }

  const svg = sanitizeSvg(raw);
  if (!svg) return res.status(400).send('Invalid SVG');

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'");
  return res.status(200).send(svg);
};
