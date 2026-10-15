(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const status = $('#status');
  const progressBar = $('#progress-bar');
  const analyzeButton = $('#analyze');
  const cancelButton = $('#cancel');
  const routeSamplesCache = new Map();
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const radians = Math.PI / 180;

  let maps = null;
  let client = null;
  let roadview = null;
  let frames = [];
  let turns = [];
  let selected = -1;
  let playing = false;
  let playTimer = null;
  let generation = 0;
  let routeDistance = 0;
  let currentRender = null;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#ffb6b6' : '#9fe8f1';
  }

  function setBusy(busy) {
    analyzeButton.disabled = busy || !maps;
    cancelButton.disabled = !busy;
  }

  function distanceMeters(a, b) {
    const dLat = (b.lat - a.lat) * radians;
    const dLng = (b.lng - a.lng) * radians;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function bearing(a, b) {
    const lat1 = a.lat * radians;
    const lat2 = b.lat * radians;
    const dLng = (b.lng - a.lng) * radians;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) / radians + 360) % 360;
  }

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
  }

  async function postJson(path, body, signal) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${path} 요청에 실패했습니다.`);
    return payload;
  }

  async function findPlace(query, signal) {
    const payload = await postJson('/api/map/place', { query }, signal);
    const places = Array.isArray(payload.places) ? payload.places : [];
    const queryText = normalize(query);
    const place = places.find((item) => normalize(item.title).startsWith(queryText)) || places[0];
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
      throw new Error(`장소 좌표를 찾지 못했습니다: ${query}`);
    }
    return place;
  }

  async function findStationExit(query, station, signal) {
    const stationName = query.match(/^(.+?역)(?:\s|\(|$)/)?.[1];
    if (!stationName) return null;
    const payload = await postJson('/api/map/place', { query: `${stationName} 출구` }, signal);
    const places = Array.isArray(payload.places) ? payload.places : [];
    return places
      .filter((place) => place.category === '교통시설>지하철출구번호'
        && place.title?.startsWith(stationName)
        && Number.isFinite(place.lat) && Number.isFinite(place.lng)
        && distanceMeters(place, station) <= 160)
      .sort((a, b) => distanceMeters(a, station) - distanceMeters(b, station))[0] || null;
  }

  function buildEdges(segments) {
    const edges = [];
    let progress = 0;
    for (const segment of segments || []) {
      const coordinates = segment?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
      for (let index = 1; index < coordinates.length; index += 1) {
        const [lngA, latA] = coordinates[index - 1];
        const [lngB, latB] = coordinates[index];
        const a = { lat: latA, lng: lngA };
        const b = { lat: latB, lng: lngB };
        if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) continue;
        const length = distanceMeters(a, b);
        if (length < 0.1) continue;
        edges.push({ a, b, from: progress, to: progress + length });
        progress += length;
      }
    }
    if (!edges.length) throw new Error('TMAP 경로 좌표가 부족합니다.');
    return { edges, length: progress };
  }

  function pointAt(edges, progress) {
    const target = Math.max(0, Math.min(edges.at(-1).to, progress));
    const edge = edges.find((item) => item.to >= target) || edges.at(-1);
    const portion = (target - edge.from) / (edge.to - edge.from);
    return {
      lat: edge.a.lat + (edge.b.lat - edge.a.lat) * portion,
      lng: edge.a.lng + (edge.b.lng - edge.a.lng) * portion,
      progress: target
    };
  }

  function projectProgress(edges, point) {
    let best = { distance: Infinity, progress: 0 };
    const latScale = 111195;
    const lngScale = latScale * Math.cos(point.lat * radians);
    for (const edge of edges) {
      const ax = (edge.a.lng - point.lng) * lngScale;
      const ay = (edge.a.lat - point.lat) * latScale;
      const dx = (edge.b.lng - edge.a.lng) * lngScale;
      const dy = (edge.b.lat - edge.a.lat) * latScale;
      const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(ax + fraction * dx, ay + fraction * dy);
      if (distance < best.distance) best = { distance, progress: edge.from + fraction * (edge.to - edge.from) };
    }
    return best;
  }

  function turnList(route, edges, length) {
    const turnCodes = new Set([12, 13, 14, 16, 17, 18, 19]);
    const crossingCodes = new Set([211, 212, 213, 214, 215, 216, 217]);
    const candidates = [];
    for (const guide of Array.isArray(route.guidePoints) ? route.guidePoints : []) {
      if (!turnCodes.has(guide.turnType) && !crossingCodes.has(guide.turnType)) continue;
      const projection = projectProgress(edges, guide);
      if (projection.distance > 10 || projection.progress < 4 || projection.progress > length - 4) continue;
      const before = pointAt(edges, projection.progress - 5);
      const after = pointAt(edges, projection.progress + 7);
      const delta = ((bearing(before, after) - bearing(pointAt(edges, projection.progress - 8), pointAt(edges, projection.progress - 3)) + 540) % 360) - 180;
      const crossing = crossingCodes.has(guide.turnType);
      const action = crossing ? '횡단' : Math.abs(delta) < 24 ? '직진' : delta < 0 ? '좌회전' : '우회전';
      if (action !== '직진') candidates.push({ progress: projection.progress, action, crossing });
    }
    return candidates.sort((a, b) => a.progress - b.progress)
      .filter((item, index, all) => !all.slice(0, index).some((prior) =>
        Math.abs(prior.progress - item.progress) < 8));
  }

  function sampleProgresses(length, spacing, turnPoints) {
    const positions = [];
    for (let progress = 0; progress < length; progress += spacing) positions.push(progress);
    positions.push(length);
    for (const turn of turnPoints) {
      for (const offset of [-6, 0, 6]) {
        const value = turn.progress + offset;
        if (value > 0 && value < length) positions.push(value);
      }
    }
    return [...new Set(positions.map((value) => Math.round(value * 10) / 10))]
      .sort((a, b) => a - b)
      .filter((value, index, all) => index === 0 || value - all[index - 1] >= Math.min(3, spacing / 2));
  }

  function upcomingInstruction(frame) {
    const next = turns.find((turn) => turn.progress >= frame.progress - 2);
    if (!next) return '계속 직진하세요.';
    const meters = Math.max(0, Math.round(next.progress - frame.progress));
    if (next.crossing) return meters ? `약 ${meters}m 앞 횡단 지점` : '횡단 지점';
    return meters ? `약 ${meters}m 앞 ${next.action}` : `여기서 ${next.action}`;
  }

  function renderMetrics(samples, available, sceneCount, spacing, length) {
    let longestNullRun = 0;
    let run = 0;
    let largestFrameGap = 0;
    let prior = null;
    for (const sample of samples) {
      if (sample.panoId) {
        if (prior) largestFrameGap = Math.max(largestFrameGap, sample.progress - prior.progress);
        prior = sample;
        run = 0;
      } else {
        run += 1;
        longestNullRun = Math.max(longestNullRun, run);
      }
    }
    const approximateGap = longestNullRun ? Math.max(spacing, longestNullRun * spacing) : 0;
    $('#metrics').hidden = false;
    $('#m-distance').textContent = `${Math.round(length).toLocaleString('ko-KR')}m`;
    $('#m-coverage').textContent = `${samples.length}곳 / ${available}곳 (${Math.round(available / samples.length * 100)}%)`;
    $('#m-scenes').textContent = `${sceneCount}장 · 최대 간격 약 ${Math.round(largestFrameGap)}m`;
    $('#m-gap').textContent = approximateGap ? `약 ${approximateGap}m` : '표본 지점에서 없음';
  }

  function updatePlaybackControls() {
    $('#previous').disabled = selected <= 0 || playing;
    $('#next').disabled = selected < 0 || selected >= frames.length - 1 || playing;
    $('#play').disabled = frames.length < 2;
    $('#play').textContent = playing ? '일시정지' : '재생';
  }

  function applyFrameView(frame) {
    if (!roadview || !frame || roadview.getPanoId() !== frame.panoId) return;
    roadview.setViewpoint({ pan: frame.heading, tilt: 0, zoom: 0 });
    currentRender?.resolve?.();
    currentRender = null;
  }

  function displayFrame(index) {
    if (!roadview || index < 0 || index >= frames.length) return Promise.resolve();
    selected = index;
    const frame = frames[index];
    window.clearTimeout(currentRender?.timer);
    if (currentRender?.resolve) currentRender.resolve();
    updatePlaybackControls();
    $('#frame-label').textContent = `장면 ${index + 1} / ${frames.length} · 진행 약 ${Math.round(frame.progress)}m · pano ${frame.panoId}`;
    $('#heading-label').textContent = `방향 ${Math.round(frame.heading)}°`;
    $('#instruction').textContent = upcomingInstruction(frame);

    return new Promise((resolve) => {
      currentRender = { resolve, timer: null };
      try {
        roadview.setPanoId(frame.panoId, new maps.LatLng(frame.lat, frame.lng));
        if (roadview.getPanoId() === frame.panoId) {
          window.setTimeout(() => applyFrameView(frame), 90);
        }
        currentRender.timer = window.setTimeout(() => {
          applyFrameView(frame);
          if (currentRender) { currentRender = null; resolve(); }
        }, 1600);
      } catch {
        currentRender = null;
        resolve();
      }
    });
  }

  function play() {
    if (playing) {
      playing = false;
      window.clearTimeout(playTimer);
      updatePlaybackControls();
      return;
    }
    if (frames.length < 2) return;
    if (selected >= frames.length - 1) selected = -1;
    playing = true;
    updatePlaybackControls();
    const advance = async () => {
      if (!playing) return;
      const nextIndex = selected + 1;
      if (nextIndex >= frames.length) {
        playing = false;
        updatePlaybackControls();
        return;
      }
      const started = performance.now();
      await displayFrame(nextIndex);
      if (!playing) return;
      const targetMs = Number($('#speed').value) || 1000;
      playTimer = window.setTimeout(advance, Math.max(100, targetMs - (performance.now() - started)));
    };
    void advance();
  }

  async function nearestPano(point, radius) {
    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}:${radius}`;
    if (routeSamplesCache.has(key)) return routeSamplesCache.get(key);
    const value = await new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, 7000);
      try {
        client.getNearestPanoId(new maps.LatLng(point.lat, point.lng), radius, (panoId) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(panoId || null);
        });
      } catch {
        if (!settled) { settled = true; window.clearTimeout(timer); resolve(null); }
      }
    });
    routeSamplesCache.set(key, value);
    return value;
  }

  async function analyzeRoute(signal, token) {
    const startQuery = $('#start').value.trim();
    const endQuery = $('#end').value.trim();
    if (!startQuery || !endQuery) throw new Error('출발지와 도착지를 입력해 주세요.');

    setStatus('기존 네이버 장소 검색으로 출발지와 도착지를 확인합니다.');
    const [startPlace, endPlace] = await Promise.all([
      findPlace(startQuery, signal), findPlace(endQuery, signal)
    ]);
    const [startExit, endExit] = await Promise.all([
      findStationExit(startQuery, startPlace, signal),
      findStationExit(endQuery, endPlace, signal)
    ]);
    const start = startExit && distanceMeters(startExit, startPlace) <= 120 ? startExit : startPlace;
    const end = endExit && distanceMeters(endExit, endPlace) <= 80 ? endExit : endPlace;

    setStatus('기존 TMAP 도보 API로 경로를 가져옵니다.');
    const payload = await postJson('/api/transit/walk', { start, end }, signal);
    if (!payload.coordinateMatch || !payload.route?.segments?.length) {
      throw new Error('TMAP 경로 좌표를 확인하지 못했습니다.');
    }
    const route = payload.route;
    const { edges, length } = buildEdges(route.segments);
    routeDistance = Number(route.distanceMeters) || length;
    turns = turnList(route, edges, length);
    const spacing = Number($('#spacing').value) || 10;
    const radius = Number($('#radius').value) || 20;
    const progresses = sampleProgresses(length, spacing, turns);
    const found = [];
    const samples = [];
    frames = [];
    selected = -1;
    $('#metrics').hidden = true;
    $('#progress-bar').style.width = '0%';

    setStatus(`TMAP 경로 ${Math.round(routeDistance)}m · ${progresses.length}곳을 ${spacing}m 간격으로 순차 조회합니다.`);
    for (let index = 0; index < progresses.length; index += 1) {
      if (token !== generation || signal.aborted) return;
      const progress = progresses[index];
      const point = pointAt(edges, progress);
      const before = pointAt(edges, Math.max(0, progress - 4));
      const after = pointAt(edges, Math.min(length, progress + 7));
      const heading = bearing(before, after);
      const panoId = await nearestPano(point, radius);
      const sample = { ...point, heading, panoId };
      samples.push(sample);
      if (panoId) {
        found.push(sample);
        if (frames.at(-1)?.panoId !== panoId) frames.push(sample);
      }
      const percent = Math.round((index + 1) / progresses.length * 100);
      $('#progress-bar').style.width = `${percent}%`;
      setStatus(`로드뷰 확인 중 ${index + 1}/${progresses.length} · 응답 ${found.length}곳 · ${percent}%`);
      if (index < progresses.length - 1) await delay(700);
    }
    if (token !== generation || signal.aborted) return;

    renderMetrics(samples, found.length, frames.length, spacing, length);
    setBusy(false);
    $('#previous').disabled = true;
    $('#next').disabled = frames.length < 2;
    $('#play').disabled = frames.length < 2;
    if (!frames.length) {
      setStatus('이 TMAP 경로 주변에서 카카오 로드뷰 지점을 찾지 못했습니다.', true);
      return;
    }
    setStatus(`조회 완료 · TMAP ${Math.round(routeDistance)}m · 실제 파노라마 ${frames.length}장. 첫 장면을 표시합니다.`);
    await displayFrame(0);
  }

  async function connectKakao() {
    if (maps) return;
    const keyInput = $('#kakao-key');
    const key = keyInput.value.trim();
    if (!key) { setStatus('카카오 JavaScript 키를 입력해 주세요.', true); return; }
    keyInput.value = '';
    $('#connect').disabled = true;
    setStatus('카카오 지도 SDK를 연결합니다.');
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
        script.onload = () => {
          if (!window.kakao?.maps?.load) { reject(new Error('카카오 지도 SDK를 사용할 수 없습니다.')); return; }
          window.kakao.maps.load(resolve);
        };
        script.onerror = () => reject(new Error('카카오 키·도메인 등록 또는 네트워크 연결을 확인해 주세요.'));
        document.head.appendChild(script);
      });
      maps = window.kakao.maps;
      client = new maps.RoadviewClient();
      roadview = new maps.Roadview($('#roadview'));
      maps.event.addListener(roadview, 'panoid_changed', () => {
        if (currentRender) applyFrameView(frames[selected]);
      });
      maps.event.addListener(roadview, 'init', () => roadview.relayout());
      analyzeButton.disabled = false;
      $('#connect').textContent = '연결 완료';
      setStatus('카카오 로드뷰 연결 완료. 출발지와 도착지를 확인하고 경로를 조회하세요.');
    } catch (error) {
      $('#connect').disabled = false;
      setStatus(error instanceof Error ? error.message : '카카오 SDK 연결에 실패했습니다.', true);
    }
  }

  analyzeButton.addEventListener('click', async () => {
    const token = ++generation;
    const controller = new AbortController();
    analyzeButton._controller?.abort();
    analyzeButton._controller = controller;
    setBusy(true);
    playing = false;
    window.clearTimeout(playTimer);
    updatePlaybackControls();
    try {
      await analyzeRoute(controller.signal, token);
    } catch (error) {
      if (controller.signal.aborted) return;
      setBusy(false);
      setStatus(error instanceof Error ? error.message : '경로 분석에 실패했습니다.', true);
    }
  });

  cancelButton.addEventListener('click', () => {
    generation += 1;
    analyzeButton._controller?.abort();
    playing = false;
    window.clearTimeout(playTimer);
    setBusy(false);
    updatePlaybackControls();
    setStatus('조회가 취소됐습니다. 이미 보낸 카카오 조회 요청은 취소할 수 없습니다.');
  });

  $('#connect').addEventListener('click', connectKakao);
  $('#previous').addEventListener('click', () => { if (!playing) void displayFrame(selected - 1); });
  $('#next').addEventListener('click', () => { if (!playing) void displayFrame(selected + 1); });
  $('#play').addEventListener('click', play);
})();
