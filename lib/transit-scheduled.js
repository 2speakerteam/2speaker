const TMAP_ROUTES_URL = 'https://apis.openapi.sk.com/transit/routes';

function nextMorningKst() {
  // Korea does not observe daylight saving time; use UTC methods on the KST offset.
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const morning = new Date(now);
  morning.setUTCHours(7, 0, 0, 0);
  if (morning <= now) morning.setUTCDate(morning.getUTCDate() + 1);
  const date = morning.toISOString().slice(0, 10);
  return {
    searchDttm: `${date.replace(/-/g, '')}0700`,
    label: `${date} 07:00 KST`
  };
}

async function requestNextMorning(start, end, appKey, signal) {
  const departure = nextMorningKst();
  const response = await fetch(TMAP_ROUTES_URL, {
    method: 'POST',
    headers: { appKey, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startX: String(start.lng), startY: String(start.lat),
      endX: String(end.lng), endY: String(end.lat),
      count: 10, lang: 0, format: 'json', searchDttm: departure.searchDttm
    }),
    signal
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, departure };
}

module.exports = { requestNextMorning };
