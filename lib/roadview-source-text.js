// Text only: retrieved pages are evidence, never executable markup or instructions.
function plain(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:header|footer|nav)\b[^>]*>[\s\S]*?<\/(?:header|footer|nav)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
    }).replace(/\s+/g, ' ').trim();
}

function relevantExcerpt(content, topic) {
  if (content.length <= 4000) return content;
  const needles = [topic, ...topic.split(/\s+/).filter(word => word.length > 1),
    '찾아가기', '가는 방법', '입구', '데크', '이정표', '이용방법', '구매방법', '발매기', '환승'];
  const ranges = [[0, 700]];
  for (const needle of needles.filter(Boolean)) {
    let from = 0;
    for (let count = 0; count < 2; count++) {
      const index = content.indexOf(needle, from);
      if (index < 0) break;
      ranges.push([Math.max(0, index - 120), Math.min(content.length, index + 1100)]);
      from = index + needle.length;
    }
  }
  const selected = [];
  for (const [start, end] of ranges) {
    if (selected.some(range => start < range[1] && end > range[0])) continue;
    selected.push([start, end]);
    if (selected.reduce((total, range) => total + range[1] - range[0], 0) >= 3600) break;
  }
  return selected.sort((a, b) => a[0] - b[0]).map(([start, end]) => content.slice(start, end)).join(' [중략] ').slice(0, 4000);
}

function accessExcerpt(content, topic, focus = '') {
  // Preserve adjacent route paragraphs and both ends of a connecting sequence.
  // The older excerpt picker skipped overlapping ranges instead of merging them.
  if (content.length <= 7000) return content;
  const ranges = [[0, 700]];
  const needles = [focus, topic, '입구', '이정표', '데크', '갈림길', '접근', '가는 길',
    'entrance', 'signpost', 'trail', 'access', '入口', '案内'];
  for (const needle of needles.filter(Boolean)) {
    let at = 0;
    for (let count = 0; count < 3; count++) {
      at = content.indexOf(needle, at); if (at < 0) break;
      ranges.push([Math.max(0, at - 500), Math.min(content.length, at + 1600)]); at += needle.length;
    }
  }
  const merged = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 100) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  // A user-specified entrance gets priority over the article introduction.
  const focusAt = focus ? content.indexOf(focus) : -1;
  const selected = merged.sort((a, b) => Number(focusAt >= b[0] && focusAt < b[1]) - Number(focusAt >= a[0] && focusAt < a[1]));
  let budget = 7000;
  const kept = [];
  for (const range of selected) {
    if (budget < 400) break;
    let start = range[0], end = Math.min(range[1], start + budget);
    if (focusAt >= start && focusAt < range[1] && end < focusAt + 1200) {
      start = Math.max(start, focusAt - 500); end = Math.min(range[1], start + budget);
    }
    kept.push([start, end]); budget -= end - start;
  }
  return kept.sort((a, b) => a[0] - b[0]).map(([start, end]) => content.slice(start, end)).join(' [중략] ');
}

module.exports = { plain, relevantExcerpt, accessExcerpt };
