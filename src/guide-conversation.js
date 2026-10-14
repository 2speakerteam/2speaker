const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const modeNames = { walk: '도보', subway: '지하철', bus: '버스', taxi: '택시' };
const AI_HISTORY_KEY = '2speaker:guide-ai-history:v2';

function readAiHistory() {
  try {
    // Discard the previous shared guide history, which included verification messages.
    window.localStorage.removeItem('2speaker:guide-ai-history:v1');
    const stored = JSON.parse(window.localStorage.getItem(AI_HISTORY_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((item) => item
      && (item.role === 'user' || item.role === 'assistant')
      && typeof item.text === 'string' && item.text.length <= 5000)
      .slice(-200).map((item) => ({ id: makeId(), role: item.role, text: item.text })) : [];
  } catch { return []; }
}

function placeQuery(message, context) {
  const exit = message.match(/([가-힣A-Za-z0-9]+역)\s*(\d+)번\s*출구/);
  if (exit) return `${exit[1]} ${exit[2]}번 출구`;
  const cleaned = message.replace(/[?？!.]/g, '').trim()
    .replace(/(?:의\s*)?(?:위치|주소|장소|어디|찾아|알려줘|알려주세요|있어|인가요|야|요|은|는|가|이)\s*$/g, '')
    .replace(/(?:로|으로|에|에서)\s*$/g, '').trim();
  return /^(?:목적지|거기|그곳)$/.test(cleaned) ? context.destination : cleaned;
}

function classifyQuestion(message) {
  if (/(?:왜|만약|추천|괜찮|안전|상황|어떻게 하면|계획|비교|대신|설명)/.test(message)) return 'ai';
  if (/(?:출구|주소|위치|어디|장소|건물|시설)/.test(message)) return 'place';
  if (/(?:경로|길|도보|지하철|버스|택시|환승|시간|거리|얼마나|가는 법|어떻게 가)/.test(message)) return 'route';
  return 'ai';
}

async function jsonPost(url, body, signal) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '요청 결과를 확인하지 못했습니다.');
  return payload;
}

function routeAnswer(message, context) {
  const requested = Object.entries(modeNames).find(([, label]) => message.includes(label));
  const selected = modeNames[context.mode] || '선택한 이동수단';
  if (requested && requested[0] !== context.mode) {
    return `${requested[1]} 버튼을 누르면 해당 TMAP 경로 결과를 확인할 수 있습니다.`;
  }
  if (!context.routeVerified || !context.routeText) {
    return `${selected} 경로 결과를 아직 확인하지 못했습니다. 출발지와 목적지를 확정한 뒤 다시 질문해 주세요.`;
  }
  return `현재 확인된 TMAP ${selected} 결과입니다. ${context.routeText.replace(/\s+/g, ' ').trim().slice(0, 700)}`;
}

async function placeAnswer(message, context, signal) {
  const query = placeQuery(message, context);
  if (!query || query.length > 80) return '확인할 장소 이름을 말씀해 주세요.';
  const payload = await jsonPost('/api/map/place', { query }, signal);
  const places = Array.isArray(payload.places) ? payload.places : [];
  const normalized = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();
  const exit = query.match(/^(.+?역)\s*(\d+)번\s*출구$/);
  const matching = exit
    ? places.filter((place) => place.category === '교통시설>지하철출구번호'
      && normalized(place.title).startsWith(normalized(exit[1]))
      && normalized(place.title).includes(`${exit[2]}번출구`))
    : places.filter((place) => normalized(place.title) === normalized(query));
  const valid = matching.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
  if (!valid.length) return `네이버 장소 검색에서 ‘${query}’의 확인된 위치를 찾지 못했습니다.`;
  if (valid.length !== 1) return `‘${query}’의 검색 결과가 여러 곳입니다. 장소를 더 구체적으로 말씀해 주세요.`;
  const place = valid[0];
  const address = place.roadAddress || place.address;
  return address
    ? `네이버 장소 정보에서 확인한 ${place.title}의 주소는 ${address}입니다.`
    : `네이버에서 ${place.title}의 좌표는 확인했지만, 안내할 주소는 제공되지 않았습니다.`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createGuideConversation(section, { getContext }) {
  if (!section) return { stop() {} };
  let mode = 'ai';
  let busy = false;
  let stopped = false;
  let controller = null;
  let recorder = null;
  let stream = null;
  let recordTimer = null;
  let counterpartLanguage = 'en';
  const messages = { ai: readAiHistory(), translation: [] };
  const saveAiHistory = () => {
    try {
      messages.ai = messages.ai.slice(-200);
      window.localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(
        messages.ai.map(({ role, text }) => ({ role, text }))
      ));
    } catch { /* Keep the current conversation visible if storage is unavailable. */ }
  };

  section.innerHTML = `<div class="guide-chat-messages" role="log" aria-live="polite"></div>
    <form class="guide-chat-form" aria-label="대화 입력">
      <input type="text" maxlength="2000" autocomplete="off" aria-label="대화 메시지" placeholder="질문을 입력하세요">
      <button type="button" class="guide-chat-mic" aria-label="음성 입력"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
      <button type="submit" class="guide-chat-send" aria-label="메시지 보내기"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/></svg></button>
    </form>
    <p class="guide-chat-status" role="status" aria-live="polite"></p>
    <div class="guide-chat-tabs" role="group" aria-label="대화 방식">
      <button type="button" data-chat-mode="ai" aria-pressed="true">AI 대화</button>
      <button type="button" data-chat-mode="translation" aria-pressed="false">실시간 통역</button>
    </div>`;
  const log = section.querySelector('.guide-chat-messages');
  const form = section.querySelector('.guide-chat-form');
  const input = form.querySelector('input');
  const status = section.querySelector('.guide-chat-status');
  const mic = section.querySelector('.guide-chat-mic');

  const renderMessages = (follow = false) => {
    log.innerHTML = messages[mode].map((item) => {
      const name = mode === 'ai' ? item.role === 'user' ? '나' : 'AI' : item.speaker || '화자 확인 필요';
      return `<article class="guide-chat-bubble ${mode === 'ai' ? item.role : item.speaker === '나' ? 'self' : 'other'}">
        <span>${escapeHtml(name)}</span><div><p>${escapeHtml(item.text)}</p>
        ${item.translation ? `<small>${escapeHtml(item.translation)}</small>` : ''}</div>
        ${item.translation ? `<button type="button" class="guide-chat-speak" data-speak-id="${item.id}" aria-label="번역 음성 재생">🔊</button>` : ''}
      </article>`;
    }).join('');
    if (follow) {
      const scroller = section.closest('.guide-content');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  };
  const setStatus = (message) => { status.textContent = message; };

  async function submit(message) {
    const text = message.trim();
    if (!text || busy || stopped) return;
    busy = true;
    const requestMode = mode;
    controller = new AbortController();
    const signal = controller.signal;
    const context = getContext();
    input.value = '';
    if (requestMode === 'ai') {
      messages.ai.push({ id: makeId(), role: 'user', text });
      saveAiHistory();
    }
    renderMessages(true);
    setStatus(requestMode === 'ai' ? '답변을 확인하고 있습니다.' : '원문 언어를 확인하고 번역 중입니다.');
    try {
      if (requestMode === 'ai') {
        const category = classifyQuestion(text);
        const answer = category === 'route' ? routeAnswer(text, context)
          : category === 'place' ? await placeAnswer(text, context, signal)
            : (await jsonPost('/api/assistant/reply', {
              task: 'guide-chat',
              message: text,
              context,
              history: messages.ai.slice(0, -1).slice(-8).map(({ role, text: content }) => ({ role, text: content }))
            }, signal)).text;
        if (!stopped) {
          messages.ai.push({ id: makeId(), role: 'assistant', text: answer });
          saveAiHistory();
        }
      } else {
        const result = await jsonPost('/api/translation/translate', {
          text, userLanguage: 'ko', counterpartLanguage
        }, signal);
        const source = String(result.sourceLanguage || '').toLowerCase();
        if (!source) throw new Error('원문 언어를 확인하지 못해 발화자를 지정하지 않았습니다.');
        const speaker = source.startsWith('ko') ? '나' : '상대방';
        if (speaker === '상대방') counterpartLanguage = source;
        if (!stopped) messages.translation.push({
          id: makeId(), speaker, text, translation: result.text,
          targetLanguage: result.targetLanguage
        });
      }
      if (!stopped) renderMessages(true);
      if (!stopped) setStatus('');
    } catch (error) {
      if (!stopped && error.name !== 'AbortError') setStatus(error.message || '요청에 실패했습니다.');
    } finally {
      busy = false;
      controller = null;
    }
  }

  async function toggleRecording() {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy || stopped) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder
      || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      setStatus('이 브라우저에서 양방향 음성 인식을 사용할 수 없습니다. 문자로 입력해 주세요.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearTimeout(recordTimer);
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        mic.setAttribute('aria-pressed', 'false');
        if (stopped || !chunks.length) return;
        setStatus('음성을 인식하고 있습니다.');
        try {
          const audio = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
          if (audio.size > 2_000_000) throw new Error('음성 길이가 너무 깁니다. 짧게 다시 말해 주세요.');
          const bytes = new Uint8Array(await audio.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const result = await jsonPost('/api/assistant/reply', { task: 'transcribe', audio: btoa(binary) });
          if (!stopped && result.text) await submit(result.text);
          else if (!stopped) setStatus('음성을 확인하지 못했습니다. 다시 말해 주세요.');
        } catch (error) {
          if (!stopped) setStatus(error.message || '음성 인식에 실패했습니다.');
        }
      };
      recorder.start();
      mic.setAttribute('aria-pressed', 'true');
      setStatus('듣고 있습니다. 마이크를 다시 누르면 전송합니다.');
      recordTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 12000);
    } catch {
      setStatus('마이크를 사용할 수 없습니다. 문자로 입력해 주세요.');
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); void submit(input.value); });
  mic.addEventListener('click', () => { void toggleRecording(); });
  section.querySelectorAll('[data-chat-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.chatMode;
    section.querySelectorAll('[data-chat-mode]').forEach((tab) =>
      tab.setAttribute('aria-pressed', String(tab === button)));
    input.placeholder = mode === 'ai' ? '질문을 입력하세요' : '한국어 또는 영어로 입력하세요';
    setStatus('');
    renderMessages(true);
  }));
  log.addEventListener('click', (event) => {
    const button = event.target.closest('[data-speak-id]');
    if (!button) return;
    const item = messages.translation.find((entry) => entry.id === button.dataset.speakId);
    if (!item || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setStatus('이 브라우저에서 번역 음성 재생을 사용할 수 없습니다.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(item.translation);
    utterance.lang = item.targetLanguage?.startsWith('en') ? 'en-US'
      : item.targetLanguage?.startsWith('ko') ? 'ko-KR'
        : item.targetLanguage || 'ko-KR';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
  renderMessages();
  return { stop() {
    stopped = true;
    controller?.abort();
    clearTimeout(recordTimer);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    window.speechSynthesis?.cancel();
  } };
}
