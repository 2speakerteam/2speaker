import { currentGuidePosition } from './guide-location.js?v=20261020-gps-evidence-1';
import { translationPartner, rememberTranslationPartner, translationRecordingType, translationSpeechLocale } from './translation-auto.js?v=20261018-auto-1';
import { readConversation, saveConversation, deleteConversation, HISTORY_EVENT, HISTORY_STATUS_EVENT, conversationStatus } from './conversation-store.js?v=20261020-explicit-delete-1';

const GREETING = '안녕하세요. 무엇을 도와드릴까요?';
const CHECKING = '지도와 관련 정보를 확인한 후 안내드리겠습니다.';
const esc = v => String(v || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let historyMemory = { ai: [], translation: [] };

function safeSource(source) {
  try {
    const u = new URL(source?.url);
    return u.protocol === 'https:' && !u.username && !u.password
      ? { title: String(source.title || u.hostname).slice(0, 200), url: u.href } : null;
  } catch { return null; }
}

function readHistory() {
  historyMemory = { ai: readConversation('roadview_ai'), translation: readConversation('roadview_translation') };
  return historyMemory;
}

function saveHistory() {
  const aiSaved = saveConversation('roadview_ai', historyMemory.ai);
  const translationSaved = saveConversation('roadview_translation', historyMemory.translation);
  return aiSaved && translationSaved;
}

async function post(url, body, signal) {
  const response = await fetch(url, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '연결을 확인한 뒤 다시 말씀해 주세요.');
  return result;
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
    <form class="roadview-guide-form" aria-label="거리뷰 대화 입력"><select class="roadview-guide-speaker-select" aria-label="문자를 입력하는 사람" hidden><option value="self">나</option><option value="other">사용자</option></select><input type="text" maxlength="2000" autocomplete="off" placeholder="필요하면 문자로 입력하세요" aria-label="거리뷰 질문"><button type="submit" aria-label="거리뷰 질문 보내기">➤</button><button type="button" data-guide-action="trash" aria-label="대화 기록 전체 삭제">${trashIcon}</button></form>
    <div class="roadview-guide-speakers" role="group" aria-label="통역할 사람의 마이크" hidden>
      <button type="button" data-guide-speaker="self" aria-label="나의 음성 통역 시작" aria-pressed="true">${microphone}<span>나</span></button>
      <button type="button" data-guide-speaker="other" aria-label="상대방의 음성 통역 시작" aria-pressed="false">${microphone}<span>사용자</span></button>
    </div>
    <p class="roadview-guide-status" role="status"></p>`;
  section.insertBefore(panel, section.querySelector('.walk-panorama-controls'));
  const guideContent = section.closest('.guide-content');
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
  const speakerSelect = panel.querySelector('.roadview-guide-speaker-select');
  const speakerControls = panel.querySelector('.roadview-guide-speakers');
  const speakerButtons = [...speakerControls.querySelectorAll('[data-guide-speaker]')];
  let translationSpeaker = 'self';
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

  const playbackControls = section.querySelector('.walk-panorama-controls');
  playbackControls.classList.add('roadview-guide-controls');
  playbackControls.setAttribute('role', 'group');
  playbackControls.setAttribute('aria-label', '로드뷰 재생 조작');
  playbackControls.querySelector('[data-panorama-action="previous"]').setAttribute('aria-label', '로드뷰 이전');
  playbackControls.querySelector('[data-panorama-action="next"]').setAttribute('aria-label', '로드뷰 다음');
  const layoutControls = () => {
    const heading = panel.querySelector('.roadview-guide-heading');
    const voice = panel.querySelector('.roadview-guide-voice');
    (opened ? heading : section.querySelector('.walk-panorama-view')).append(playbackControls);
    playbackControls.querySelector('[data-panorama-action="playback"]').hidden = false;
    panel.insertBefore(voice, panel.querySelector('.roadview-guide-form'));
    voice.hidden = mode === 'translation';
    speakerControls.hidden = speakerSelect.hidden = mode !== 'translation';
    input.setAttribute('aria-label', mode === 'translation' ? '통역할 문자' : '거리뷰 질문');
    panel.querySelector('[type="submit"]').setAttribute('aria-label', mode === 'translation' ? '선택한 사람의 문자 통역' : '거리뷰 질문 보내기');
  };
  layoutControls();
  const buttons = () => section.querySelectorAll('[data-panorama-chat]');
  let statusMessage = '';
  const setStatus = text => { statusMessage = text; status.textContent = [text, conversationStatus(), saved ? ''
    : '기록을 이 기기에 저장하지 못했습니다. 화면을 닫기 전에 복사해 주세요.'].filter(Boolean).join(' '); };
  const updateDeleteUi = () => {
    panel.dataset.selecting = String(selecting);
    panel.querySelector('.roadview-guide-title').textContent = selecting
      ? `선택 ${selectedIds.size}개` : mode === 'ai' ? 'AI 음성 가이드' : '실시간 통역';
    trash.hidden = false;
    trash.disabled = !historyMemory[mode].length || (selecting && !selectedIds.size);
    trash.setAttribute('aria-label', selecting ? `선택한 대화 ${selectedIds.size}개 삭제` : '대화 기록 전체 삭제');
    log.setAttribute('aria-live', selecting ? 'off' : 'polite');
  };
  const followMessages = () => {
    followFrame = null;
    if (!opened || selecting) return;
    log.style.paddingBottom = '2px';
    log.scrollTop = log.scrollHeight;
    if (guideContent?.dataset.roadviewBelow === 'true') {
      guideContent.scrollTo({ top: guideContent.scrollHeight, behavior: 'smooth' });
    }
  };
  const render = (follow = true) => {
    const entries = historyMemory[mode];
    const scrollTop = log.scrollTop;
    log.innerHTML = entries.map(t => {
      const bubble = `<article class="roadview-guide-message ${t.role}" data-message-id="${esc(t.id)}">
      <span>${t.role === 'user' ? '나' : mode === 'ai' ? 'AI' : '상대방'}</span><div class="roadview-guide-message-content">
      <p>${esc(t.text)}</p>${t.translation ? `<p class="roadview-guide-translation">${esc(t.translation)}</p>` : ''}
      ${t.sources?.length ? `<div class="roadview-guide-sources">${t.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join('')}</div>` : ''}</div>
    </article>`;
      return selecting
        ? `<div class="roadview-guide-select-row${selectedIds.has(t.id) ? ' is-selected' : ''}"><input type="checkbox" class="guide-chat-select" data-select-id="${esc(t.id)}" aria-label="${t.role === 'user' ? '나' : mode === 'ai' ? 'AI 답변' : '상대방'} 대화 선택" ${selectedIds.has(t.id) ? 'checked' : ''}>${bubble}</div>` : bubble;
    }).join('');
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
    readHistory();
    const message = { id: id(), sources: [], ...entry };
    historyMemory[mode].push(message);
    saved = saveHistory();
    render();
    return message.id;
  };
  const updateVoice = () => {
    const recording = recorder?.state === 'recording';
    state.textContent = recording ? '듣는 중' : '';
    mic.setAttribute('aria-pressed', String(recording));
    mic.setAttribute('aria-label', recording ? '음성 질문 전송' : '음성 질문 시작');
    auto.setAttribute('aria-pressed', String(autoListen));
    auto.textContent = autoListen ? '음성 끄기' : '음성 켜기';
    panel.dataset.listening = String(recording);
    panel.dataset.busy = String(busy);
    panel.dataset.translationSpeaker = translationSpeaker;
    speakerSelect.value = translationSpeaker;
    speakerSelect.disabled = busy || acquiring || recording;
    mic.disabled = busy || acquiring;
    for (const button of speakerButtons) {
      const selected = button.dataset.guideSpeaker === translationSpeaker;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = busy || acquiring || (recording && !selected);
      button.dataset.listening = String(recording && selected);
      button.setAttribute('aria-label', `${selected && recording ? '전송할' : '시작할'} ${button.dataset.guideSpeaker === 'self' ? '나의' : '상대방의'} 음성 통역`);
    }
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

  async function speak(text, listenAfter = false, language = '') {
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
      const matchesLanguage = v => language ? v.lang.toLowerCase().split('-')[0] === language.toLowerCase().split('-')[0]
        : (korean ? /^ko/i : /^en/i).test(v.lang);
      const voice = voices.find(v => matchesLanguage(v)
        && /female|여성|Heami|Yuna|Seoyeon|SunHi|SoonBok|Zira|Samantha|Susan|Karen|Aria|Ava|Jenny/i.test(v.name))
        || (language ? voices.find(matchesLanguage) : null);
      if ((!voice && !language) || !synth || !window.SpeechSynthesisUtterance) { failed(); return; }
      retainedUtterance = new SpeechSynthesisUtterance(text);
      if (voice) retainedUtterance.voice = voice;
      retainedUtterance.lang = language ? translationSpeechLocale(language) : korean ? 'ko-KR' : 'en-US';
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
        const result = await post('/api/assistant/reply', { task: 'roadview-speech', message: text,
          ...(language ? { language } : {}) }, speechController.signal);
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

  async function submit(value, sourceLanguage = '', speaker = translationSpeaker) {
    const text = value.trim();
    if (!text || busy || !opened || stopped) return;
    cancelSelection();
    autoListen = true;
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
    const messageId = append({ role: mode === 'translation' && speaker === 'other' ? 'assistant' : 'user', text,
      ...(mode === 'translation' ? { speaker: speaker === 'self' ? '나' : '상대방' } : {}) });
    setStatus(mode === 'ai' ? '지도와 관련 정보를 확인하고 있습니다.' : '통역하고 있습니다.');
    updateVoice();
    if (mode === 'ai') speak(CHECKING);
    try {
      let answer;
      if (mode === 'ai') {
        const position = await currentGuidePosition(signal);
        if (run !== generation || !opened || signal.aborted) return;
        answer = await post('/api/assistant/reply', {
          task: 'roadview-guide', message: text, position, context: getContext(),
          history: historyMemory.ai.slice(0, -1).slice(-8).map(({ role, text: content }) => ({ role, text: content }))
        }, signal);
        if (run !== generation || !opened) return;
        append({ role: 'assistant', text: answer.text,
          sources: (answer.sources || []).map(safeSource).filter(Boolean) });
      } else {
        const result = await post('/api/translation/translate', {
          text, userLanguage: 'ko', counterpartLanguage: translationPartner(), automatic: true, sourceLanguage, speaker
        }, signal);
        if (run !== generation || !opened) return;
        if (result.needsCounterpart) {
          busy = false; autoListen = false;
          setStatus('상대방이 먼저 한 문장 말해 주세요. 언어를 확인한 뒤 통역하겠습니다.');
          updateVoice();
          return;
        }
        if (speaker === 'other') rememberTranslationPartner(result);
        readHistory();
        const userEntry = historyMemory.translation.find(entry => entry.id === messageId);
        if (userEntry) {
          userEntry.translation = result.text;
          userEntry.sourceLanguage = result.sourceLanguage;
          userEntry.targetLanguage = result.targetLanguage;
          saved = saveHistory();
        }
        answer = { text: result.text, language: result.targetLanguage };
        render();
      }
      busy = false;
      setStatus('');
      updateVoice();
      // Each translation turn starts from the chosen person's microphone.
      // Do not reopen one microphone automatically and guess the next speaker.
      speak(answer.text, false, answer.language || '');
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

  async function startRecording(speaker = translationSpeaker) {
    if (busy || speaking || acquiring || recorder?.state === 'recording' || !opened || stopped) return;
    const mimeType = mode === 'translation' ? translationRecordingType() : 'audio/webm;codecs=opus';
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder
      || !mimeType || !MediaRecorder.isTypeSupported(mimeType)) {
      autoListen = false;
      setStatus('이 브라우저에서는 음성 입력을 사용할 수 없습니다. 마이크를 지원하는 브라우저에서 다시 열어 주세요.');
      updateVoice();
      return;
    }
    const run = generation;
    const request = ++microphoneRequest;
    acquiring = true;
    updateVoice();
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!opened || stopped || busy || request !== microphoneRequest || run !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
      acquiring = false;
      stream = acquired;
      const chunks = [];
      const active = new MediaRecorder(stream, { mimeType });
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
          const result = await post('/api/assistant/reply', { task: 'transcribe', audio: btoa(binary),
            autoLanguage: mode === 'translation' }, controller.signal);
          if (run !== generation || !opened) return;
          busy = false;
          if (!result.text?.trim()) {
            autoListen = false;
            setStatus('음성을 확인하지 못했습니다. 마이크를 누르고 다시 말씀해 주세요.');
            updateVoice();
            return;
          }
          await submit(result.text, mode === 'translation' ? result.language : '', speaker);
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
      setStatus('마이크 권한을 허용한 뒤 다시 눌러 주세요.');
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
    if (guideContent?.dataset.roadviewBelow === 'true') {
      delete guideContent.dataset.roadviewBelow;
      guideContent.style.removeProperty('--roadview-full-height');
      guideContent.scrollTop = 0;
    }
    layoutControls();
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
    if (guideContent) {
      guideContent.style.setProperty('--roadview-full-height', `${guideContent.clientHeight}px`);
      guideContent.dataset.roadviewBelow = 'true';
    }
    layoutControls();
    auto.hidden = closeButton.hidden = true;
    log.style.paddingBottom = '';
    section.dataset.voiceGuideOpen = 'true';
    panel.querySelector('.roadview-guide-title').textContent = mode === 'ai' ? 'AI 음성 가이드' : '실시간 통역';
    panel.querySelector('.roadview-guide-languages').hidden = true;
    input.placeholder = '필요하면 문자로 입력하세요';
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
    // Both panels wait for the existing microphone button before listening.
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
    if (selecting || busy || stopped || event.button !== 0
      || !event.target.closest('[data-message-id]') || event.target.closest('button, a, input')) return;
    cancelHold();
    holdPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    holdTimer = setTimeout(() => {
      cancelHold();
      if (selecting || busy || stopped || !opened) return;
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
    if (event.target.closest('[data-message-id]')) event.preventDefault();
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
    if (selecting && !selectedIds.size) return;
    readHistory();
    const entries = historyMemory[mode];
    const deleting = selecting ? new Set(selectedIds) : new Set(entries.map(t => t.id));
    const count = entries.filter(t => deleting.has(t.id)).length;
    if (!count) return;
    if (count === entries.length && !window.confirm(mode === 'ai' ? '거리뷰 대화 기록을 모두 삭제할까요?' : '거리뷰 통역 기록을 모두 삭제할까요?')) return;
    historyMemory[mode] = entries.filter(t => !deleting.has(t.id));
    saved = deleteConversation(mode === 'ai' ? 'roadview_ai' : 'roadview_translation', deleting);
    cancelSelection();
    render();
    setStatus(`대화 ${count}개를 삭제했습니다.`);
  });
  closeButton.addEventListener('click', close);
  auto.addEventListener('click', () => {
    if (autoListen) { cancelVoice(); setStatus('음성을 껐습니다. 기록은 유지됩니다.'); }
    else { autoListen = true; updateVoice(); if (!busy && !speaking) void startRecording(); }
  });
  const activateMicrophone = (speaker = translationSpeaker) => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy || acquiring) return;
    if (mode === 'translation') translationSpeaker = speaker;
    speechRequest++;
    stopSpeech();
    speaking = false;
    autoListen = true;
    void startRecording(speaker);
  };
  mic.addEventListener('click', () => activateMicrophone());
  for (const button of speakerButtons) button.addEventListener('click', () => activateMicrophone(button.dataset.guideSpeaker));
  speakerSelect.addEventListener('change', () => {
    translationSpeaker = speakerSelect.value === 'other' ? 'other' : 'self';
    updateVoice();
  });
  panel.querySelector('form').addEventListener('submit', event => { event.preventDefault(); void submit(input.value); });
  panel.querySelector('[data-guide-action="swap"]').addEventListener('click', () => {
    const old = userLanguage.value;
    userLanguage.value = otherLanguage.value;
    otherLanguage.value = old;
  });
  const sync = event => {
    if (event.detail?.scopes && !event.detail.scopes.some(scope => scope.startsWith('roadview_'))) return;
    if (event.detail?.accountChanged) {
      generation++;
      controller?.abort();
      controller = null;
      busy = false;
      cancelVoice();
      cancelSelection();
      setStatus('');
    }
    readHistory();
    for (const key of selectedIds) if (!historyMemory[mode].some(t => t.id === key)) selectedIds.delete(key);
    if (selecting && !selectedIds.size) cancelSelection();
    if (opened) render(false);
  };
  const resizeMessages = () => {
    if (!opened || selecting) return;
    if (guideContent?.dataset.roadviewBelow === 'true') {
      guideContent.style.setProperty('--roadview-full-height', `${guideContent.clientHeight}px`);
    }
    cancelAnimationFrame(followFrame);
    followFrame = requestAnimationFrame(followMessages);
  };
  const visibility = () => {
    if (document.hidden && opened) {
      cancelVoice();
      setStatus('음성을 잠시 멈췄습니다. 마이크를 누르면 다시 대화합니다.');
    }
  };
  const syncStatus = () => setStatus(statusMessage);
  window.addEventListener(HISTORY_EVENT, sync);
  window.addEventListener(HISTORY_STATUS_EVENT, syncStatus);
  window.addEventListener('resize', resizeMessages);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', close);
  return { open, close, stop() { close(); stopped = true; window.removeEventListener(HISTORY_EVENT, sync); window.removeEventListener(HISTORY_STATUS_EVENT, syncStatus); window.removeEventListener('resize', resizeMessages); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', close); section.append(playbackControls); playbackControls.classList.remove('roadview-guide-controls'); panel.remove(); } };
}
