'use strict';

function isPinterestHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function findMeta(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]);
    }
  }
  return null;
}

function normalizeMediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let incoming;
  try {
    incoming = new URL(String(req.query?.url || ''));
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!isPinterestHost(incoming.hostname) || !['http:', 'https:'].includes(incoming.protocol)) {
    return res.status(400).json({ error: 'Only Pinterest links are supported' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(incoming.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) return res.status(502).json({ error: 'Pinterest did not return a usable page' });

    const finalUrl = new URL(response.url);
    if (!isPinterestHost(finalUrl.hostname)) {
      return res.status(400).json({ error: 'Unexpected redirect target' });
    }

    const html = (await response.text()).slice(0, 2_000_000);
    const imageUrl = normalizeMediaUrl(findMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']));
    const videoUrl = normalizeMediaUrl(findMeta(html, ['og:video:secure_url', 'og:video', 'twitter:player:stream']));
    const mediaUrl = imageUrl || videoUrl;

    if (!mediaUrl) return res.status(404).json({ error: 'No media found in this Pinterest page' });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      url: mediaUrl,
      sourceUrl: finalUrl.href,
      mediaType: imageUrl ? 'image' : 'video'
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({ error: aborted ? 'Pinterest request timed out' : 'Unable to resolve Pinterest media' });
  } finally {
    clearTimeout(timeout);
  }
};
