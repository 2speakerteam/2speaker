const { officialHost } = require('./field-source-policy');
const { plain } = require('./roadview-source-text');

function imageUrl(value, pageUrl) {
  try {
    const u = new URL(plain(String(value || '')), pageUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (!officialHost(u.hostname) && !/(?:^|\.)pstatic\.net$/.test(u.hostname)
      && !/^(?:blogfiles|postfiles)\.pstatic\.net$/.test(u.hostname)
      && !/^(?:blog\.kakaocdn\.net|t1\.daumcdn\.net)$/.test(u.hostname)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

function articleImages(html, pageUrl) {
  const rows = [], seen = new Set();
  for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const attributes = {};
    for (const pair of match[0].matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attributes[pair[1].toLowerCase()] = pair[3];
    const url = imageUrl(attributes['data-src'] || attributes.src || '', pageUrl);
    if (!url || seen.has(url)) continue;
    // A portal's map-search banner is not a trail map. Exclude shared page
    // decoration before nearby navigation text can raise its relevance score.
    const assetPath = new URL(url).pathname;
    if (/\/(?:common|icons?|logos?|banners?|skins?)\/|\/(?:logo|bg_|ico_|btn_|sprite|banner|share|sns)[^/]*$/i.test(assetPath)) continue;
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 600);
    const caption = plain(`${attributes.alt || ''} ${after.match(/<(?:figcaption|caption)\b[^>]*>([\s\S]*?)<\/(?:figcaption|caption)>/i)?.[1] || ''} ${plain(after).slice(0, 180)}`).slice(0, 350);
    const score = Number(/이정표|안내도|표지판|지도|signpost|trail map|route map|案内図|标志/i.test(caption)) * 10
      + Number(/입구|데크|가는 길|가는길|코스|entrance|directions|入口|アクセス/i.test(caption)) * 4;
    if (!score) continue;
    seen.add(url); rows.push({ url, caption, score });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function readImage(candidate, stats) {
  let target = imageUrl(candidate.url, candidate.pageUrl);
  for (let hop = 0; target && hop < 3; hop++) {
    stats.sourceImageRequests = (stats.sourceImageRequests || 0) + 1;
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(4500) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => {});
      target = imageUrl(response.headers.get('location') || '', target); continue;
    }
    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      || Number(response.headers.get('content-length')) > 2000000) {
      await response.body?.cancel().catch(() => {}); return null;
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 2000000) return null;
        chunks.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks);
    const valid = mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
      : mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) return null;
    return { inlineData: { mimeType, data: bytes.toString('base64') } };
  }
  return null;
}

async function sourceImageParts(sources, stats) {
  // A small bounded sample of public route/sign images, not every article image.
  const candidates = sources.filter(source => source.content).flatMap(source => (source.images || [])
    .map(image => ({ ...image, sourceId: source.id, pageUrl: source.url })))
    .sort((a, b) => b.score - a.score).filter((item, i, list) => list.findIndex(row => row.url === item.url) === i).slice(0, 2);
  stats.sourceImageCandidates = candidates.length;
  const parts = [];
  const results = await Promise.allSettled(candidates.map(candidate => readImage(candidate, stats)));
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      stats.sourceImagesRead = (stats.sourceImagesRead || 0) + 1;
      parts.push({ text: `Historical source image from ${candidates[i].sourceId}; caption: ${candidates[i].caption}. This is not the user's live view or a georeferenced route.` }, result.value);
    } else stats.sourceImageFailures = (stats.sourceImageFailures || 0) + 1;
  });
  return parts;
}

module.exports = { imageUrl, articleImages, sourceImageParts };
