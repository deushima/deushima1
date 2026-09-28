'use strict';

function normalizedHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/\.$/, '');
}

function isPinterestHost(hostname) {
  const host = normalizedHost(hostname);
  return host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com');
}

function isCosmosHost(hostname) {
  const host = normalizedHost(hostname).replace(/^www\./, '');
  return host === 'cosmos.so';
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

function mediaAspect(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return Math.max(.35, Math.min(3.5, w / h));
}

async function fetchHtml(url, signal) {
  return fetch(url, {
    redirect: 'follow',
    signal,
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9'
    }
  });
}

async function resolvePinterest(incoming, signal) {
  const response = await fetchHtml(incoming.href, signal);
  if (!response.ok) throw new Error('Pinterest did not return a usable page');

  const finalUrl = new URL(response.url);
  if (!isPinterestHost(finalUrl.hostname)) throw new Error('Unexpected redirect target');

  const html = (await response.text()).slice(0, 2_000_000);
  const imageUrl = normalizeMediaUrl(findMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']));
  const videoUrl = normalizeMediaUrl(findMeta(html, ['og:video:secure_url', 'og:video', 'twitter:player:stream']));
  const mediaUrl = videoUrl || imageUrl;
  if (!mediaUrl) return null;

  return {
    url: mediaUrl,
    sourceUrl: finalUrl.href,
    mediaType: videoUrl ? 'video' : 'image'
  };
}

const COSMOS_QUERY = `
query ResolveElement($elementId: ElementId!) {
  elementView(elementId: $elementId) {
    __typename
    element {
      __typename
      ... on MediaElementTile {
        media {
          __typename
          url
          width
          height
          ... on AnimatedImage {
            video { url thumbnailUrl }
          }
          ... on Video {
            thumbnail { url }
            mux { playbackUrl mp4Url(quality: LOW) }
            duration
            isStored
          }
        }
      }
    }
    ... on MultiMediaElementView {
      media {
        __typename
        url
        width
        height
        ... on AnimatedImage {
          video { url thumbnailUrl }
        }
        ... on Video {
          thumbnail { url }
          mux { playbackUrl mp4Url(quality: LOW) }
          duration
          isStored
        }
      }
    }
  }
}`;

function flattenMedia(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach(item => flattenMedia(item, output));
    return output;
  }
  if (typeof value === 'object') output.push(value);
  return output;
}

function selectCosmosMedia(payload) {
  const view = payload?.data?.elementView;
  const candidates = [
    ...flattenMedia(view?.media),
    ...flattenMedia(view?.element?.media)
  ];

  for (const media of candidates) {
    if (media?.__typename !== 'Video') continue;
    const url = normalizeMediaUrl(media.url || media.mux?.mp4Url || '');
    if (!url) continue;
    return {
      url,
      mediaType: 'video',
      width: Number(media.width) || null,
      height: Number(media.height) || null,
      aspectRatio: mediaAspect(media.width, media.height)
    };
  }

  for (const media of candidates) {
    if (media?.__typename !== 'AnimatedImage') continue;
    const videoUrl = normalizeMediaUrl(media.video?.url || '');
    if (videoUrl) {
      return {
        url: videoUrl,
        mediaType: 'video',
        width: Number(media.width) || null,
        height: Number(media.height) || null,
        aspectRatio: mediaAspect(media.width, media.height)
      };
    }
  }

  for (const media of candidates) {
    const url = normalizeMediaUrl(media?.url || '');
    if (!url) continue;
    return {
      url,
      mediaType: 'image',
      width: Number(media.width) || null,
      height: Number(media.height) || null,
      aspectRatio: mediaAspect(media.width, media.height)
    };
  }
  return null;
}

async function resolveCosmos(incoming, signal) {
  const match = incoming.pathname.match(/^\/e\/(\d+)\/?$/i);
  if (!match) throw new Error('Unsupported Cosmos URL');
  const elementId = Number(match[1]);
  if (!Number.isSafeInteger(elementId) || elementId <= 0) throw new Error('Invalid Cosmos element id');

  try {
    const response = await fetch('https://api.cosmos.so/graphql', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-client-name': 'deushima-media-resolver'
      },
      body: JSON.stringify({
        operationName: 'ResolveElement',
        variables: { elementId },
        query: COSMOS_QUERY
      })
    });

    if (response.ok) {
      const payload = await response.json();
      const media = selectCosmosMedia(payload);
      if (media) return { ...media, sourceUrl: incoming.href };
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
  }

  const response = await fetchHtml(incoming.href, signal);
  if (!response.ok) throw new Error('Cosmos did not return a usable page');
  const finalUrl = new URL(response.url);
  if (!isCosmosHost(finalUrl.hostname)) throw new Error('Unexpected redirect target');
  const html = (await response.text()).slice(0, 2_000_000);
  const videoUrl = normalizeMediaUrl(findMeta(html, ['og:video:secure_url', 'og:video', 'twitter:player:stream']));
  const imageUrl = normalizeMediaUrl(findMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']));
  const url = videoUrl || imageUrl;
  if (!url) return null;
  const width = Number(findMeta(html, ['og:image:width', 'og:video:width'])) || null;
  const height = Number(findMeta(html, ['og:image:height', 'og:video:height'])) || null;
  return {
    url,
    sourceUrl: finalUrl.href,
    mediaType: videoUrl ? 'video' : 'image',
    width,
    height,
    aspectRatio: mediaAspect(width, height)
  };
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

  if (!['http:', 'https:'].includes(incoming.protocol)) {
    return res.status(400).json({ error: 'Invalid URL protocol' });
  }

  const source = isPinterestHost(incoming.hostname)
    ? 'pinterest'
    : isCosmosHost(incoming.hostname)
      ? 'cosmos'
      : null;
  if (!source) return res.status(400).json({ error: 'Unsupported media source' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const result = source === 'pinterest'
      ? await resolvePinterest(incoming, controller.signal)
      : await resolveCosmos(incoming, controller.signal);
    if (!result?.url) return res.status(404).json({ error: 'No media found on this page' });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? 'Media request timed out' : 'Unable to resolve remote media'
    });
  } finally {
    clearTimeout(timeout);
  }
};
