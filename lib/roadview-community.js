const { plain, relevantExcerpt } = require('./roadview-source-text');

const normalize = value => String(value || '').replace(/[\s·().（）]/g, '').toLowerCase();
const trim = (value, length) => String(value || '').trim().slice(0, length);

// Only public article URLs on known publishing hosts are fetched. No cookies,
// login, arbitrary hosts, embedded APIs, or redirects to another service.
function articleUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    url.protocol = 'https:';
    url.hash = '';
    if (['blog.naver.com', 'm.blog.naver.com'].includes(host)) {
      const match = url.pathname.match(/^\/([\w-]+)\/(\d+)\/?$/);
      const blog = match?.[1] || url.searchParams.get('blogId') || url.pathname.match(/^\/([\w-]+)\/?$/)?.[1];
      const post = match?.[2] || url.searchParams.get('logNo');
      if (!/^[\w-]+$/.test(blog || '') || !/^\d+$/.test(post || '')) return null;
      return `https://m.blog.naver.com/${blog}/${post}`;
    }
    if (['cafe.naver.com', 'm.cafe.naver.com'].includes(host)) {
      const named = url.pathname.match(/^\/([\w-]+)\/(\d+)\/?$/);
      const numbered = url.pathname.match(/^\/ca-fe\/web\/cafes\/(\d+)\/articles\/(\d+)\/?$/);
      if (named) return `https://m.cafe.naver.com/${named[1]}/${named[2]}`;
      if (numbered) return `https://m.cafe.naver.com/ca-fe/web/cafes/${numbered[1]}/articles/${numbered[2]}`;
      const club = url.searchParams.get('clubid');
      const post = url.searchParams.get('articleid');
      if (/^\d+$/.test(club || '') && /^\d+$/.test(post || '')) {
        return `https://m.cafe.naver.com/ca-fe/web/cafes/${club}/articles/${post}`;
      }
    }
    if (/^[a-z\d-]+\.tistory\.com$/.test(host) && /^\/(?:\d+|entry\/[^/]+)\/?$/.test(url.pathname)) {
      url.search = '';
      return url.href;
    }
  } catch { /* Unsupported/malformed search result. */ }
  return null;
}

function articleBody(html) {
  // Take the article container, not navigation, unrelated recommendations or comments.
  const containers = ['se-main-container', 'postViewArea', 'ContentRenderer', 'article_view',
    'tt_article_useless_p_margin', 'entry-content', 'post_ct'];
  const tag = containers.map(name => new RegExp(
    `<(div|article)\\b[^>]*(?:class|id)\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*>`, 'i').exec(html)).find(Boolean);
  if (!tag) return '';
  const start = tag.index + tag[0].length;
  const tags = new RegExp(`<(/?)${tag[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 1;
  let next;
  while ((next = tags.exec(html))) {
    depth += next[1] ? -1 : 1;
    if (!depth) return plain(html.slice(start, next.index));
  }
  return ''; // Never treat a truncated/unrecognised page as a fully read article.
}

async function readArticle(url) {
  let target = articleUrl(url);
  const signal = AbortSignal.timeout(5500);
  for (let hops = 0; target && hops < 3; hops++) {
    const response = await fetch(target, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') || '', target).href;
      await response.body?.cancel().catch(() => {});
      const allowed = articleUrl(next);
      if (!allowed || allowed === target) return { content: '', readStatus: 'restricted_or_unavailable' };
      target = allowed;
      continue;
    }
    if (!response.ok || !/text\/html/.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {});
      return { content: '', readStatus: 'restricted_or_unavailable' };
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1500000) return { content: '', readStatus: 'oversized' };
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const html = Buffer.concat(chunks).toString('utf8');
    const content = articleBody(html);
    // A login/captcha page does not have a recognised article container.
    if (content.length < 80) return { content: '', readStatus: 'excerpt_only' };
    const published = html.match(/<meta\b[^>]*(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1];
    return { content, readStatus: 'article_read', pagePublishedAt: dateOnly(published) };
  }
  return { content: '', readStatus: 'restricted_or_unavailable' };
}

function dateOnly(value) {
  const match = String(value || '').match(/^(20\d{2})-?(\d{2})-?(\d{2})(?:T|$)/);
  if (!match) return '';
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(date)
    && parsed <= Date.now() + 86400000 ? date : '';
}

async function searchCommunity(query, stats, subject = '') {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const secret = process.env.NAVER_API_HUB_API_KEY?.trim();
  if (!clientId || !secret) throw new Error('방문기 검색 연결을 확인해 주세요.');
  const topic = trim(subject || query, 100);
  const journey = trim(query || topic, 160);
  const errors = [];
  const candidates = new Map();
  const search = async (channel, term, sort = 'sim') => {
    const endpoint = new URL(`https://naverapihub.apigw.ntruss.com/search/v1/${channel}`);
    endpoint.searchParams.set('query', term.slice(0, 200));
    endpoint.searchParams.set('display', '20');
    endpoint.searchParams.set('format', 'json');
    if (channel !== 'webkr') endpoint.searchParams.set('sort', sort);
    stats.communitySearchCalls = (stats.communitySearchCalls || 0) + 1;
    const response = await fetch(endpoint, { headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': secret
    }, signal: AbortSignal.timeout(7000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.items)) {
      stats.communitySearchFailures = (stats.communitySearchFailures || 0) + 1;
      const statusKey = `communitySearchHttp${response.status}`;
      stats[statusKey] = (stats[statusKey] || 0) + 1;
      throw new Error([401, 403].includes(response.status)
        ? '방문기 검색의 인증·권한을 확인하지 못했습니다.' : '방문기 검색 일부를 불러오지 못했습니다.');
    }
    stats.communitySearchResults = (stats.communitySearchResults || 0) + body.items.length;
    for (const item of body.items) {
      const url = articleUrl(item.link);
      if (!url || candidates.has(url)) continue;
      candidates.set(url, { kind: 'community', channel, url,
        title: plain(item.title).slice(0, 200), snippet: plain(item.description).slice(0, 1000),
        author: plain(item.bloggername || item.cafename).slice(0, 100),
        publishedAt: dateOnly(item.postdate), content: '', readStatus: 'excerpt_only' });
    }
  };
  const collect = async requests => {
    const results = await Promise.allSettled(requests);
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason.message);
  };
  await collect([
    search('blog', `${journey} 가는 길`),
    search('blog', `${topic} 가는 길`, 'date'),
    search('cafearticle', `${journey} 가는 길`)
  ]);
  // Existing web-search permission can still supply public excerpts if a new
  // channel is unavailable. Do not turn an API failure into "no information".
  if (!candidates.size) await collect([
    search('webkr', `${topic} 가는 길 site:blog.naver.com`),
    search('webkr', `${topic} 가는 길 site:cafe.naver.com`)
  ]);
  const words = topic.split(/\s+/).map(normalize).filter(word => word.length > 1);
  const relevance = source => {
    const title = normalize(source.title);
    const text = normalize(`${source.title} ${source.snippet}`);
    const matches = text.includes(normalize(topic)) || (words.length && words.every(word => text.includes(word)));
    if (!matches) return -1;
    const access = /입구|데크|표지판|이정표|가는길|가는법|가는방법|코스|출구|산책|둘레길|등산|접근/.test(text);
    if (!access) return -1;
    return (title.includes(normalize(topic)) ? 10 : 0) + (source.publishedAt ? 2 : 0)
      + (normalize(`${source.title} ${source.snippet}`).includes(normalize(journey)) ? 3 : 0);
  };
  const ranked = [...candidates.values()].filter(source => relevance(source) >= 0)
    .sort((a, b) => relevance(b) - relevance(a) || b.publishedAt.localeCompare(a.publishedAt));
  const authors = new Set();
  const selected = ranked.filter(source => {
    const url = new URL(source.url);
    const author = url.hostname === 'm.blog.naver.com' ? `${url.hostname}/${url.pathname.split('/')[1]}`
      : url.hostname.endsWith('.tistory.com') ? url.hostname : source.url;
    if (authors.has(author)) return false;
    authors.add(author);
    return true;
  }).slice(0, 4);
  stats.communityCandidates = candidates.size;
  await Promise.all(selected.map(async source => {
    stats.communityPageCalls = (stats.communityPageCalls || 0) + 1;
    try {
      const result = await readArticle(source.url);
      source.readStatus = result.readStatus;
      source.publishedAt = source.publishedAt || result.pagePublishedAt || '';
      source.content = relevantExcerpt(result.content || '', topic);
      if (source.content) stats.communityPagesRead = (stats.communityPagesRead || 0) + 1;
    } catch (error) {
      source.readStatus = 'unavailable';
      const failure = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'Timeout'
        : error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ? 'ConnectTimeout'
        : ['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error?.cause?.code)
          ? error.cause.code : 'NetworkError';
      const key = `communityPage${failure}`;
      stats[key] = (stats[key] || 0) + 1;
    }
  }));
  return { sources: selected, errors: [...new Set(errors)] };
}

module.exports = { searchCommunity, articleUrl, articleBody, dateOnly };
