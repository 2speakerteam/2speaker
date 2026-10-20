function nearbyInput(value) {
  if (!value || typeof value !== 'object') return null;
  const { lat, lng, accuracy, timestamp } = value;
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0 || accuracy > 2000
    || Math.abs(Date.now() - timestamp) > 120000) return null;
  const areas = [...new Set((Array.isArray(value.areas) ? value.areas : [])
    .filter(area => typeof area === 'string' && area.length <= 100
      && /^[가-힣a-zA-Z0-9\s·.-]+$/.test(area))
    .map(area => area.trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 2);
  return areas.length ? { lat, lng, accuracy, areas } : null;
}

function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const arc = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad)
    * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

async function nearbyPlaces(query, origin, search) {
  // Local search has no latitude/longitude/radius parameters and returns at most
  // five items per query. Search legal/admin districts, then filter actual points.
  const areas = [...origin.areas];
  const parent = areas[0].split(' ');
  if (parent.length >= 3) areas.push(parent.slice(0, -1).join(' '));
  const terms = [...new Set(areas)].slice(0, 3).map(area => `${area} ${query}`);
  const settled = await Promise.allSettled(terms.map(search));
  const successful = settled.filter(result => result.status === 'fulfilled');
  if (!successful.length) throw settled[0].reason;
  const categoryPattern = ({
    '미용실': /(?:미용실|헤어)/, '편의점': /편의점/, '약국': /약국/,
    '카페': /(?:카페|커피)/, '식당': /(?:음식점|식당)/
  })[query];
  const unique = new Map();
  for (const place of successful.flatMap(result => result.value)) {
    if (![place.lat, place.lng].every(Number.isFinite)
      || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) continue;
    // Match the provider's business category, never require its brand name to
    // contain "미용실", "편의점", etc.
    if (categoryPattern && !categoryPattern.test(place.category || '')) continue;
    const distance = distanceMeters(origin, place);
    if (distance > 3000) continue;
    const key = `${place.title}:${place.lat}:${place.lng}`;
    unique.set(key, { ...place, distanceMeters: Math.round(distance) });
  }
  return {
    places: [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 15),
    nearby: true, distanceBasis: 'straight-line', radiusMeters: 3000,
    partial: successful.length !== settled.length,
    coverage: 'regional-search-candidates'
  };
}

module.exports = { nearbyInput, nearbyPlaces, distanceMeters };
