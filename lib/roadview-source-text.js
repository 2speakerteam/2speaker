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

module.exports = { plain, relevantExcerpt };
