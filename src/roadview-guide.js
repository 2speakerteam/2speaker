const HISTORY_KEY = '2speaker:roadview-voice-history:v1';
const RECOVERY_KEY = `${HISTORY_KEY}:recovery`;
const GREETING = '안녕하세요. 무엇을 도와드릴까요?';
const CHECKING = '지도와 관련 정보를 확인한 후 안내드리겠습니다.';
const esc = v => String(v || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let historyMemory = { ai: [], translation: [] };
let unsavedHistory = false;

function safeSource(source) {
  try {
    const u = new URL(source?.url);
    return u.protocol === 'https:' && !u.username && !u.password
      ? { title: String(source.title || u.hostname).slice(0, 200), url: u.href } : null;
  } catch { return null; }
}

function readHistory() {
  if (unsavedHistory) return historyMemory;
  try {
    const decode = raw => {
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !Array.isArray(value.ai) || !Array.isArray(value.translation)) return null;
      return Object.fromEntries(['ai', 'translation'].map(mode => [mode,
        value[mode].filter(t => t && ['user', 'assistant'].includes(t.role) && typeof t.text === 'string')
          .filter(t => mode !== 'ai' || t.role !== 'assistant' || t.text !== GREETING)
          .map(t => ({ id: t.id || id(), role: t.role, text: t.text,
            translation: typeof t.translation === 'string' ? t.translation : '',
            sources: (Array.isArray(t.sources) ? t.sources : []).map(safeSource).filter(Boolean) }))]));
    };
    let value;
    try { value = decode(localStorage.getItem(HISTORY_KEY)); } catch { value = null; }
    if (!value) try { value = decode(localStorage.getItem(RECOVERY_KEY)); } catch { value = null; }
    if (value) historyMemory = value;
  } catch { /* Keep unsaved visible messages in this document. */ }
  return historyMemory;
}

function saveHistory() {
  try {
    const value = JSON.stringify(historyMemory);
    localStorage.setItem(HISTORY_KEY, value);
    try { localStorage.setItem(RECOVERY_KEY, value); } catch { /* Primary remains saved. */ }
    unsavedHistory = false;
    return true;
  } catch { unsavedHistory = true; return false; }
}

async function post(url, body, signal) {
  const response = await fetch(url, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '연결을 확인한 뒤 다시 말씀해 주세요.');
  return result;
}

function currentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude,
      lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }),
    () => resolve(null), { enableHighAccuracy: true, maximumAge: 15000, timeout: 5500 });
  });
}

const microphone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>';
const trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v6M14 11v6"/></svg>';

export function createRoadviewGuide(section, { getContext, onOpen, onLayoutChange }) {
  const panel = document.createElement('section');
  panel.className = 'roadview-guide-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '거리뷰 음성 대화');
  panel.innerHTML = `<div class="roadview-guide-heading">
      <strong class="roadview-guide-title">AI 음성 가이드</strong>
      <button type="button" data-guide-action="auto" aria-pressed="false" hidden>음성 켜기</button>
      <button type="button" data-guide-action="close" aria-label="거리뷰 대화 닫기" hidden>×</button>
    </div>
    <div class="roadview-guide-languages" hidden>
      <label><span class="sr-only">내 언어</span><select data-guide-language="user" aria-label="내 언어"><option value="ko">🇰🇷 한국어</option><option value="en">🇺🇸 영어</option></select></label>
      <button type="button" data-guide-action="swap" aria-label="통역 언어 바꾸기">⇄</button>
      <label><span class="sr-only">상대방 언어</span><select data-guide-language="other" aria-label="상대방 언어"><option value="en">🇺🇸 영어</option><option value="ko">🇰🇷 한국어</option></select></label>
    </div>
    <div class="roadview-guide-body">
      <div class="roadview-guide-voice"><button type="button" data-guide-action="mic" aria-label="음성 질문 시작" aria-pressed="false">${microphone}</button><span class="roadview-guide-state" role="status"></span></div>
      <div class="roadview-guide-messages" role="log" aria-live="polite" aria-label="사용자와 AI 대화 기록"></div>
    </div>
    <form class="roadview-guide-form" aria-label="거리뷰 대화 입력"><input type="text" maxlength="2000" autocomplete="off" placeholder="필요하면 문자로 입력하세요" aria-label="거리뷰 질문"><button type="submit" aria-label="거리뷰 질문 보내기">➤</button><button type="button" data-guide-action="trash" aria-label="대화 기록 전체 삭제">${trashIcon}</button></form>
    <p class="roadview-guide-status" role="status"></p>`;
  section.insertBefore(panel, section.querySelector('.walk-panorama-controls'));
  const log = panel.querySelector('.roadview-guide-messages');
  const state = panel.querySelector('.roadview-guide-state');
  const status = panel.querySelector('.roadview-guide-status');
  const input = panel.querySelector('input');
  const mic = panel.querySelector('[data-guide-action="mic"]');
  const auto = panel.querySelector('[data-guide-action="auto"]');
  const closeButton = panel.querySelector('[data-guide-action="close"]');
  const trash = panel.querySelector('[data-guide-action="trash"]');
  const userLanguage = panel.querySelector('[data-guide-language="user"]');
  const otherLanguage = panel.querySelector('[data-guide-language="other"]');
  let mode = 'ai';
  let opened = false;
  let stopped = false;
  let busy = false;
  let autoListen = false;
  let speaking = false;
  let recorder = null;
  let acquiring = false;
  let microphoneRequest = 0;
  let speechRequest = 0;
  const voiceAudio = new Audio();
  voiceAudio.preload = 'auto';
  let speechController = null;
  let retainedUtterance = null;
  let speechTimer = null;
  let stream = null;
  let audioContext = null;
  let silenceTimer = null;
  let recordTimer = null;
  let controller = null;
  let generation = 0;
  let saved = true;
  let selecting = false;
  const selectedIds = new Set();
  let followFrame = null;
  let holdTimer = null;
  let holdPointer = null;
  let suppressClickUntil = 0;
  readHistory();

  const buttons = () => section.querySelectorAll('[data-panorama-chat]');
  const setStatus = text => { status.textContent = [text, saved ? ''
    : '기록을 이 기기에 저장하지 못했습니다. 화면을 닫기 전에 복사해 주세요.'].filter(Boolean).join(' '); };
  const updateDeleteUi = () => {
    panel.querySelector('.roadview-guide-title').textContent = selecting
      ? `선택 ${selectedIds.size}개` : mode === 'ai' ? 'AI 음성 가이드' : '실시간 통역';
    trash.hidden = mode !== 'ai';
    trash.disabled = !historyMemory.ai.length || (selecting && !selectedIds.size);
    trash.setAttribute('aria-label', selecting ? `선택한 대화 ${selectedIds.size}개 삭제` : '대화 기록 전체 삭제');
    log.setAttribute('aria-live', selecting ? 'off' : 'polite');
  };
  const followMessages = () => {
    followFrame = null;
    if (!opened || selecting) return;
    if (mode !== 'ai') { log.scrollTop = log.scrollHeight; return; }
    // Start at the latest question (or greeting), instead of cutting off the
    // top of that exchange by always pinning the scrollbar to its bottom.
    log.style.paddingBottom = '2px';
    const entries = historyMemory.ai;
    const latest = entries.at(-1);
    const anchorId = latest?.text === GREETING ? latest.id : entries.findLast(t => t.role === 'user')?.id || latest?.id;
    const anchor = [...log.querySelectorAll('[data-message-id]')].find(el => el.dataset.messageId === anchorId);
    if (!anchor) { log.scrollTop = 0; return; }
    const top = Math.max(0, anchor.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 2);
    const remaining = log.scrollHeight - top;
    log.style.paddingBottom = `${Math.max(2, log.clientHeight - remaining + 2)}px`;
    log.scrollTop = top;
  };
  const render = (follow = true) => {
    const entries = historyMemory[mode];
    const scrollTop = log.scrollTop;
    log.innerHTML = entries.map(t => {
      const bubble = `<article class="roadview-guide-message ${t.role}" data-message-id="${esc(t.id)}">
      <span>${t.role === 'user' ? '내가 말한 내용' : mode === 'ai' ? 'AI 답변' : '상대방 응답'}</span>
      <p>${esc(t.text)}</p>${t.role === 'assistant' && mode === 'ai' && t.text !== GREETING ? `<button type="button" class="roadview-guide-replay" data-replay-id="${esc(t.id)}" aria-label="AI 답변 다시 듣기">🔊 다시 듣기</button>` : ''}${t.translation ? `<p class="roadview-guide-translation">${esc(t.translation)}</p>` : ''}
      ${t.sources?.length ? `<div class="roadview-guide-sources">${t.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join('')}</div>` : ''}
    </article>`;
      return selecting && mode === 'ai'
        ? `<div class="roadview-guide-select-row${selectedIds.has(t.id) ? ' is-selected' : ''}"><input type="checkbox" class="guide-chat-select" data-select-id="${esc(t.id)}" aria-label="${t.role === 'user' ? '내가 말한 내용' : 'AI 답변'} 대화 선택" ${selectedIds.has(t.id) ? 'checked' : ''}>${bubble}</div>` : bubble;
    }).join('') || '<p class="roadview-guide-empty">말씀하신 내용과 답변이 여기에 남습니다.</p>';
    updateDeleteUi();
    cancelAnimationFrame(followFrame);
    if (follow) followFrame = requestAnimationFrame(followMessages);
    else log.scrollTop = scrollTop;
  };
  const cancelHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdPointer = null;
  };
  const cancelSelection = () => {
    cancelHold();
    selecting = false;
    selectedIds.clear();
    updateDeleteUi();
  };
  const append = entry => {
    historyMemory[mode].push({ id: id(), sources: [], ...entry });
    saved = saveHistory();
    render();
  };
  const updateVoice = () => {
    const recording = recorder?.state === 'recording';
    state.textContent = mode === 'ai' ? (recording ? '듣는 중' : '')
      : recording ? '듣는 중' : busy ? '확인 중' : speaking ? '답변 중' : '말하기';
    mic.setAttribute('aria-pressed', String(recording));
    mic.setAttribute('aria-label', recording ? '음성 질문 전송' : '음성 질문 시작');
    auto.setAttribute('aria-pressed', String(autoListen));
    auto.textContent = autoListen ? '음성 끄기' : '음성 켜기';
    panel.dataset.listening = String(recording);
    panel.dataset.busy = String(busy);
  };
  const releaseMicrophone = () => {
    microphoneRequest++;
    acquiring = false;
    clearTimeout(recordTimer);
    clearInterval(silenceTimer);
    recordTimer = silenceTimer = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    if (audioContext) void audioContext.close().catch(() => {});
    audioContext = null;
  };
  const cancelVoice = () => {
    autoListen = false;
    speechRequest++;
    const active = recorder;
    recorder = null;
    if (active?.state === 'recording') active.stop();
    releaseMicrophone();
    stopSpeech();
    speaking = false;
    updateVoice();
  };
  function stopSpeech() {
    clearTimeout(speechTimer);
    speechTimer = null;
    speechController?.abort();
    speechController = null;
    voiceAudio.onended = voiceAudio.onerror = null;
    voiceAudio.pause();
    voiceAudio.removeAttribute('src');
    voiceAudio.load();
    window.speechSynthesis?.cancel();
    retainedUtterance = null;
  }

  async function speak(text, listenAfter = false) {
    if (!opened || stopped || !autoListen) return;
    const speechRun = ++speechRequest;
    const run = generation;
    stopSpeech();
    const current = () => run === generation && speechRun === speechRequest && opened && !stopped && autoListen;
    let fallbackStarted = false;
    const completed = () => {
      if (!current()) return;
      clearTimeout(speechTimer);
      retainedUtterance = null;
      speaking = false;
      updateVoice();
      if (listenAfter && !busy) void startRecording();
    };
    const failed = () => {
      if (!current()) return;
      clearTimeout(speechTimer);
      speaking = false;
      autoListen = false;
      setStatus('음성이 재생되지 않았습니다. 답변의 다시 듣기를 눌러 주세요.');
      updateVoice();
    };
    const nativeFallback = () => {
      if (!current() || fallbackStarted) return;
      fallbackStarted = true;
      clearTimeout(speechTimer);
      voiceAudio.onended = voiceAudio.onerror = null;
      voiceAudio.pause();
      const synth = window.speechSynthesis;
      const korean = /[가-힣]/.test(text);
      const voices = synth?.getVoices() || [];
      const voice = voices.find(v => (korean ? /^ko/i : /^en/i).test(v.lang)
        && /female|여성|Heami|Yuna|Seoyeon|SunHi|SoonBok|Zira|Samantha|Susan|Karen|Aria|Ava|Jenny/i.test(v.name));
      if (!voice || !window.SpeechSynthesisUtterance) { failed(); return; }
      retainedUtterance = new SpeechSynthesisUtterance(text);
      retainedUtterance.voice = voice;
      retainedUtterance.lang = korean ? 'ko-KR' : 'en-US';
      retainedUtterance.rate = 0.9;
      retainedUtterance.pitch = 1;
      retainedUtterance.volume = 1;
      retainedUtterance.onend = completed;
      retainedUtterance.onerror = failed;
      try { synth.resume(); synth.speak(retainedUtterance); }
      catch { failed(); }
    };
    speaking = true;
    updateVoice();
    voiceAudio.volume = 1;
    voiceAudio.muted = false;
    voiceAudio.onended = completed;
    voiceAudio.onerror = nativeFallback;
    speechTimer = setTimeout(() => { if (current()) { voiceAudio.pause(); nativeFallback(); } }, 30000);
    try {
      if (text === GREETING || text === CHECKING) {
        const phrase = text === GREETING ? 'greeting' : 'checking';
        voiceAudio.src = `/public/audio/roadview-${phrase}-voice3.mp3`;
        // Run play inside the original button tap, before any await. The fixed
        // greeting is cached audio, not a model-generated reply.
        await voiceAudio.play();
      } else {
        speechController = new AbortController();
        const result = await post('/api/assistant/reply', { task: 'roadview-speech', message: text }, speechController.signal);
        if (!current()) return;
        voiceAudio.src = `data:audio/mpeg;base64,${result.audioContent}`;
        await voiceAudio.play();
      }
      if (current()) clearTimeout(speechTimer);
    } catch (error) {
      if (!current() || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') failed();
      else nativeFallback();
    }
  }

  async function submit(value) {
    const text = value.trim();
    if (!text || busy || !opened || stopped) return;
    cancelSelection();
    if (mode === 'ai') autoListen = true;
    // A typed question also ends the current recording; never record the app's reply.
    const active = recorder;
    recorder = null;
    if (active?.state === 'recording') active.stop();
    releaseMicrophone();
    const run = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    busy = true;
    speaking = false;
    stopSpeech();
    input.value = '';
    append({ role: 'user', text });
    setStatus(mode === 'ai' ? '지도와 관련 정보를 확인하고 있습니다.' : '통역하고 있습니다.');
    updateVoice();
    if (mode === 'ai') speak(CHECKING);
    try {
      let answer;
      if (mode === 'ai') {
        const position = await currentPosition();
        if (run !== generation || !opened) return;
        answer = await post('/api/assistant/reply', {
          task: 'roadview-guide', message: text, position, context: getContext(),
          history: historyMemory.ai.slice(0, -1).slice(-8).map(({ role, text: content }) => ({ role, text: content }))
        }, signal);
        if (run !== generation || !opened) return;
        append({ role: 'assistant', text: answer.text,
          sources: (answer.sources || []).map(safeSource).filter(Boolean) });
      } else {
        const result = await post('/api/translation/translate', {
          text, userLanguage: userLanguage.value, counterpartLanguage: otherLanguage.value
        }, signal);
        if (run !== generation || !opened) return;
        const userEntry = historyMemory.translation.at(-1);
        if (userEntry?.role === 'user' && userEntry.text === text) {
          userEntry.translation = result.text;
          if (result.sourceLanguage && result.sourceLanguage.split('-')[0] !== userLanguage.value.split('-')[0]) {
            userEntry.role = 'assistant';
          }
          saved = saveHistory();
        }
        answer = { text: result.text };
        render();
      }
      busy = false;
      setStatus('');
      updateVoice();
      speak(answer.text, true);
    } catch (error) {
      if (run !== generation || !opened || error.name === 'AbortError') return;
      busy = false;
      stopSpeech();
      speaking = false;
      autoListen = false;
      setStatus(error.message || '답변을 확인하지 못했습니다. 다시 말씀해 주세요.');
      updateVoice();
    } finally {
      if (run === generation) { busy = false; controller = null; updateVoice(); }
    }
  }

  async function startRecording() {
    if (busy || speaking || acquiring || recorder?.state === 'recording' || !opened || stopped) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder
      || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      autoListen = false;
      setStatus('이 브라우저에서는 음성 입력을 사용할 수 없습니다. 아래 입력창을 이용해 주세요.');
      updateVoice();
      return;
    }
    const run = generation;
    const request = ++microphoneRequest;
    acquiring = true;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!opened || stopped || busy || request !== microphoneRequest || run !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
      acquiring = false;
      stream = acquired;
      const chunks = [];
      const active = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder = active;
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      active.onstop = async () => {
        if (recorder !== active) return;
        recorder = null;
        releaseMicrophone();
        if (!opened || stopped || run !== generation || !chunks.length) return;
        busy = true;
        setStatus('말씀하신 내용을 확인하고 있습니다.');
        updateVoice();
        controller = new AbortController();
        try {
          const audio = new Blob(chunks, { type: active.mimeType });
          if (audio.size > 2000000) throw new Error('음성이 너무 깁니다. 짧게 다시 말씀해 주세요.');
          const bytes = new Uint8Array(await audio.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const result = await post('/api/assistant/reply', { task: 'transcribe', audio: btoa(binary) }, controller.signal);
          if (run !== generation || !opened) return;
          busy = false;
          if (!result.text?.trim()) {
            autoListen = false;
            setStatus('음성을 확인하지 못했습니다. 마이크를 누르고 다시 말씀해 주세요.');
            updateVoice();
            return;
          }
          await submit(result.text);
        } catch (error) {
          if (run !== generation || !opened || error.name === 'AbortError') return;
          busy = false;
          autoListen = false;
          setStatus(error.message || '음성을 확인하지 못했습니다. 다시 말씀해 주세요.');
          updateVoice();
        }
      };
      active.start(250);
      setStatus('말씀해 주세요. 말을 마치면 자동으로 전송합니다.');
      updateVoice();
      recordTimer = setTimeout(() => { if (active.state === 'recording') active.stop(); }, 20000);
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          audioContext = new AudioContext();
          await audioContext.resume();
          if (recorder !== active || !stream) return;
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          const data = new Float32Array(analyser.fftSize);
          let heard = false;
          let lastSpeech = performance.now();
          silenceTimer = setInterval(() => {
            if (recorder !== active || active.state !== 'recording') return;
            analyser.getFloatTimeDomainData(data);
            const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
            if (rms > 0.015) { heard = true; lastSpeech = performance.now(); }
            if (heard && performance.now() - lastSpeech > 1400) active.stop();
          }, 150);
        }
      } catch { setStatus('말씀하신 뒤 마이크를 다시 누르면 전송합니다.'); }
    } catch {
      if (request !== microphoneRequest || run !== generation || !opened) return;
      releaseMicrophone();
      autoListen = false;
      setStatus('마이크 권한을 확인해 주세요. 아래 입력창으로도 질문할 수 있습니다.');
      updateVoice();
    }
  }

  function close() {
    if (!opened) return;
    opened = false;
    generation++;
    controller?.abort();
    controller = null;
    busy = false;
    cancelSelection();
    cancelAnimationFrame(followFrame);
    cancelVoice();
    panel.hidden = true;
    delete section.dataset.voiceGuideOpen;
    buttons().forEach(b => { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-pressed', 'false'); });
    onLayoutChange();
  }
  function open(requestedMode = 'ai') {
    if (stopped) return;
    if (opened && mode === requestedMode) { close(); return; }
    if (opened) close();
    generation++;
    mode = requestedMode === 'translation' ? 'translation' : 'ai';
    onOpen();
    opened = true;
    panel.hidden = false;
    panel.dataset.mode = mode;
    auto.hidden = closeButton.hidden = mode === 'ai';
    log.style.paddingBottom = '';
    section.dataset.voiceGuideOpen = 'true';
    panel.querySelector('.roadview-guide-title').textContent = mode === 'ai' ? 'AI 음성 가이드' : '실시간 통역';
    panel.querySelector('.roadview-guide-languages').hidden = mode !== 'translation';
    input.placeholder = mode === 'ai' ? '필요하면 문자로 입력하세요' : '음성 또는 문자로 통역하세요';
    buttons().forEach(b => {
      const selected = b.dataset.panoramaChat === mode;
      b.setAttribute('aria-expanded', String(selected));
      b.setAttribute('aria-pressed', String(selected));
    });
    setStatus('');
    render();
    onLayoutChange();
    autoListen = true;
    updateVoice();
    void startRecording();
  }
  log.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
    if (selecting) {
      if (event.target.closest('input, button, a')) return;
      const bubble = event.target.closest('[data-message-id]');
      if (!bubble) { cancelSelection(); render(false); return; }
      const key = bubble.dataset.messageId;
      if (selectedIds.has(key)) selectedIds.delete(key); else selectedIds.add(key);
      if (!selectedIds.size) cancelSelection();
      render(false);
      return;
    }
    const replay = event.target.closest('[data-replay-id]');
    if (!replay || busy) return;
    const entry = historyMemory.ai.find(t => t.id === replay.dataset.replayId);
    if (!entry) return;
    cancelVoice();
    autoListen = true;
    setStatus('');
    void speak(entry.text, false);
  });
  // Reuse page 2's hold threshold, movement tolerance and circular selectors.
  log.addEventListener('pointerdown', event => {
    if (mode !== 'ai' || selecting || busy || stopped || event.button !== 0
      || !event.target.closest('[data-message-id]') || event.target.closest('button, a, input')) return;
    cancelHold();
    holdPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    holdTimer = setTimeout(() => {
      cancelHold();
      if (mode !== 'ai' || selecting || busy || stopped || !opened) return;
      selecting = true;
      selectedIds.clear();
      suppressClickUntil = Date.now() + 500;
      setStatus('');
      render(false);
    }, 1000);
  });
  log.addEventListener('pointermove', event => {
    if (holdPointer?.id === event.pointerId
      && Math.hypot(event.clientX - holdPointer.x, event.clientY - holdPointer.y) > 12) cancelHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) log.addEventListener(type, cancelHold);
  log.addEventListener('contextmenu', event => {
    if (mode === 'ai' && event.target.closest('[data-message-id]')) event.preventDefault();
  });
  log.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-select-id]');
    if (!selecting || !checkbox) return;
    if (checkbox.checked) selectedIds.add(checkbox.dataset.selectId);
    else selectedIds.delete(checkbox.dataset.selectId);
    if (!selectedIds.size) { cancelSelection(); render(false); return; }
    checkbox.closest('.roadview-guide-select-row')?.classList.toggle('is-selected', checkbox.checked);
    updateDeleteUi();
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selecting) { cancelSelection(); render(false); }
  });
  trash.addEventListener('click', () => {
    if (mode !== 'ai' || (selecting && !selectedIds.size)) return;
    readHistory();
    const entries = historyMemory.ai;
    const deleting = selecting ? new Set(selectedIds) : new Set(entries.map(t => t.id));
    const count = entries.filter(t => deleting.has(t.id)).length;
    if (!count) return;
    if (count === entries.length && !window.confirm('거리뷰 대화 기록을 모두 삭제할까요?')) return;
    historyMemory.ai = entries.filter(t => !deleting.has(t.id));
    saved = saveHistory();
    cancelSelection();
    render();
    setStatus(`대화 ${count}개를 삭제했습니다.`);
  });
  closeButton.addEventListener('click', close);
  auto.addEventListener('click', () => {
    if (autoListen) { cancelVoice(); setStatus('음성을 껐습니다. 기록은 유지됩니다.'); }
    else { autoListen = true; updateVoice(); if (!busy && !speaking) void startRecording(); }
  });
  mic.addEventListener('click', () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy) return;
    speechRequest++;
    stopSpeech();
    speaking = false;
    autoListen = true;
    void startRecording();
  });
  panel.querySelector('form').addEventListener('submit', event => { event.preventDefault(); void submit(input.value); });
  panel.querySelector('[data-guide-action="swap"]').addEventListener('click', () => {
    const old = userLanguage.value;
    userLanguage.value = otherLanguage.value;
    otherLanguage.value = old;
  });
  const sync = event => {
    if (event.key !== HISTORY_KEY) return;
    readHistory();
    for (const key of selectedIds) if (!historyMemory.ai.some(t => t.id === key)) selectedIds.delete(key);
    if (selecting && !selectedIds.size) cancelSelection();
    if (opened) render(false);
  };
  const resizeMessages = () => {
    if (!opened || selecting || mode !== 'ai') return;
    cancelAnimationFrame(followFrame);
    followFrame = requestAnimationFrame(followMessages);
  };
  const visibility = () => {
    if (document.hidden && opened) {
      cancelVoice();
      setStatus('음성을 잠시 멈췄습니다. 마이크를 누르면 다시 대화합니다.');
    }
  };
  window.addEventListener('storage', sync);
  window.addEventListener('resize', resizeMessages);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', close);
  return { open, close, stop() { close(); stopped = true; window.removeEventListener('storage', sync); window.removeEventListener('resize', resizeMessages); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', close); panel.remove(); } };
}
