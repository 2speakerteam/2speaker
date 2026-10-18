const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);

export const arrivalPlaceholder = (mode, label = '') => `<div class="transit-arrival" data-arrival-mode="${mode}" role="status" aria-live="polite">
  <span class="transit-arrival-label">${escapeHtml(label || (mode === 'subway' ? '다음 열차' : '버스'))}</span>
  <span class="transit-arrival-values">도착정보 조회 중</span>
</div>`;

export function transitLineLabel(leg, color) {
  const route = String(leg.route || '');
  const subway = leg.mode === 'SUBWAY';
  const code = subway ? route.match(/(\d+)호선/)?.[1] : route.split(':').at(-1).trim();
  if (!code) return escapeHtml(leg.board);
  const background = /^#[\da-f]{6}$/i.test(color || '') ? color : subway ? '#747f00' : '#087ddd';
  return `<b class="transit-line-badge" style="--line-badge-color:${background}">${escapeHtml(code)}</b>${escapeHtml(leg.board)}`;
}

export function createTransitArrivals({ isActive }) {
  let run = null;
  const stop = () => {
    if (!run) return;
    clearTimeout(run.timer);
    run.controller?.abort();
    run = null;
  };
  const paint = (current, result) => {
    if (run !== current || !current.node.isConnected) return;
    const live = result.status === 'ok' && Array.isArray(result.arrivals);
    const values = live ? result.arrivals.slice(0, 2).map((item, index) => {
      const seconds = Number(item.seconds);
      const time = Number.isFinite(seconds) && seconds > 0
        ? `${Math.max(1, Math.ceil(seconds / 60))}분 후` : item.message || '도착정보 없음';
      return `${index ? '<span class="transit-arrival-next">· 그다음 </span>' : ''}<strong>${escapeHtml(time)}</strong>`;
    }).join('') : escapeHtml(result.message || '도착정보 확인 불가');
    const updated = live && result.checkedAt ? new Date(result.checkedAt) : null;
    const stamp = updated && Number.isFinite(updated.getTime())
      ? updated.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    current.node.classList.toggle('is-unavailable', !live);
    current.node.querySelector('.transit-arrival-values').innerHTML = values;
    let source = current.node.querySelector('.transit-arrival-source');
    if (live) {
      if (!source) { source = document.createElement('small'); source.className = 'transit-arrival-source'; current.node.append(source); }
      source.textContent = `${result.direction ? `${result.direction} · ` : ''}서울특별시${stamp ? ` ${stamp} 기준` : ''}`;
    } else source?.remove();
  };
  const refresh = async current => {
    if (run !== current || !current.node.isConnected) { stop(); return; }
    if (!isActive(current.mode) || document.hidden) {
      paint(current, { status: 'paused', message: '도착정보 다시 확인 중' });
      current.timer = setTimeout(() => refresh(current), 30000);
      return;
    }
    current.controller = new AbortController();
    try {
      const response = await fetch(`/api/transit/${current.mode}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: 'arrivals', ...current.request }), signal: current.controller.signal
      });
      const result = await response.json();
      if (run !== current) return;
      if (!response.ok) throw new Error('arrival request failed');
      paint(current, result);
      if (['not_configured', 'unsupported', 'unmatched', 'scheduled', 'auth_error'].includes(result.status)) return;
    } catch (error) {
      if (run !== current || error.name === 'AbortError') return;
      paint(current, { status: 'error', message: '도착정보 확인 불가' });
    } finally {
      current.controller = null;
    }
    if (run === current) current.timer = setTimeout(() => refresh(current), 30000);
  };
  const start = (mode, route, panel) => {
    stop();
    const node = panel?.querySelector('[data-arrival-mode]');
    const leg = mode === 'subway' ? route.subwayLegs?.[0] || route.transportLegs?.[0] : route.transportLegs?.[0];
    if (!node || !leg) return;
    const stations = Array.isArray(leg.stations) ? leg.stations : [];
    const key = value => String(value || '').replace(/\s|역$/g, '');
    const index = stations.findIndex(name => key(name) === key(leg.board));
    const path = route.segments?.find(segment => segment.mode === (mode === 'subway' ? 'SUBWAY' : 'BUS'))?.coordinates || [];
    run = { mode, node, timer: null, controller: null,
      request: { route: leg.route, board: leg.board, alight: leg.alight, boardPoint: leg.boardPoint,
        nextStation: index >= 0 ? stations[index + 1] || '' : '', path: path.slice(0, 600), departureBasis: route.departureBasis || '' } };
    if (route.departureBasis) { paint(run, { status: 'scheduled', message: '예약 출발 경로 · 실시간 도착 미적용' }); return; }
    void refresh(run);
  };
  const resume = () => {
    if (!run || !run.node.isConnected || !isActive(run.mode) || run.controller) return;
    clearTimeout(run.timer);
    void refresh(run);
  };
  return { start, stop, resume };
}
