import { readAiHistory, saveAiHistory as persistAiHistory } from './guide-history.js?v=20261018-cloud-history-1';
import { readConversation, saveConversation, HISTORY_EVENT, HISTORY_STATUS_EVENT, conversationStatus } from './conversation-store.js?v=20261018-cloud-history-1';
import { translationPartner, rememberTranslationPartner, translationRecordingType, createTranslationSpeech } from './translation-auto.js?v=20261018-auto-1';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function plainAssistantReply(value) {
  return String(value || '')
    .replace(/^[ \t]*```[^\n]*$/gm, '')
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const modeNames = { walk: '도보', subway: '지하철', bus: '버스', taxi: '택시' };

function placeQuery(message, context) {
  const exit = message.match(/([가-힣A-Za-z0-9]+역)\s*(\d+)번\s*출구/);
  if (exit) return `${exit[1]} ${exit[2]}번 출구`;
  const cleaned = message.replace(/[?？!.]/g, '').trim()
    .replace(/(?:의\s*)?(?:위치|주소|장소|어디|찾아|알려줘|알려주세요|있어|인가요|야|요|은|는|가|이)\s*$/g, '')
    .replace(/(?:로|으로|에|에서)\s*$/g, '').trim();
  return /^(?:목적지|거기|그곳)$/.test(cleaned) ? context.destination : cleaned;
}

function classifyQuestion(message) {
  // A request to translate route-related text is still a language task.
  if (/(?:번역|translate)/i.test(message)) return 'ai';
  if (/(?:왜|만약|추천|괜찮|안전|상황|어떻게 하면|계획|비교|대신|설명)/.test(message)) return 'ai';
  if (/(?:출구|주소|위치|어디|장소|건물|시설)/.test(message)) return 'place';
  if (/(?:현재|지금|이\s*경로|선택한)/.test(message)
    && /(?:경로|길|도보|지하철|버스|택시|환승|시간|거리|얼마나|가는 법|어떻게 가)/.test(message)) return 'route';
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
  const asksAboutNamedTrip = /(?:에서|부터)\s*[^\s?!,.]+(?:까지|으로|로|은|는)/.test(message);
  if (asksAboutNamedTrip && (!context.start || !context.destination
    || !message.includes(context.start) || !message.includes(context.destination))) {
    return `현재 화면의 경로는 ${context.start || '출발지'}에서 ${context.destination || '목적지'}까지입니다. 다른 구간의 이동 시간은 해당 출발지와 목적지로 검색해 확인해 주세요.`;
  }
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
  let generation = 0;
  let recorder = null;
  let stream = null;
  let recordTimer = null;
  const translationVoice = createTranslationSpeech(() => { if (!stopped) setStatus('통역 음성을 재생하지 못했습니다. 번역문은 화면에서 확인해 주세요.'); });
  let selecting = false;
  const selectedIds = new Set();
  const messages = { ai: readAiHistory(), translation: readConversation('guide_translation') };
  let historySaved = true;
  const saveAiHistory = () => {
    historySaved = persistAiHistory(messages.ai);
  };

  section.innerHTML = `<div class="guide-chat-messages" role="log" aria-live="polite"></div>
    <form class="guide-chat-form" aria-label="대화 입력">
      <input type="text" maxlength="2000" autocomplete="off" aria-label="대화 메시지" placeholder="질문을 입력하세요">
      <button type="button" class="guide-chat-mic" aria-label="음성 입력"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
      <button type="submit" class="guide-chat-send" aria-label="메시지 보내기"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/></svg></button>
      <button type="button" class="guide-chat-trash" aria-label="AI 대화 전체 삭제" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v6M14 11v6"/></svg></button>
    </form>
    <p class="guide-chat-status" role="status" aria-live="polite"></p>
    <div class="guide-chat-tabs" role="group" aria-label="대화 방식">
      <button type="button" data-chat-mode="ai" aria-pressed="true"><span>AI대화</span></button>
      <button type="button" data-chat-mode="translation" aria-pressed="false"><span>실시간 통역</span></button>
    </div>`;
  const log = section.querySelector('.guide-chat-messages');
  const form = section.querySelector('.guide-chat-form');
  const input = form.querySelector('input');
  const status = section.querySelector('.guide-chat-status');
  const mic = section.querySelector('.guide-chat-mic');
  const trash = form.querySelector('.guide-chat-trash');
  const tabs = section.querySelector('.guide-chat-tabs');
  const guideContent = section.closest('.guide-content');
  const resizeMap = () => guideContent?.querySelector('#route-map')?.dispatchEvent(new Event('guide-layout-change'));
  const deleteActions = section.closest('.guide-screen').querySelector('.guide-chat-delete-actions');
  const selectedCount = deleteActions.querySelector('.guide-chat-selected-count');
  const cancelDelete = deleteActions.querySelector('.guide-chat-delete-cancel');
  const confirmDelete = trash;

  const updateDeleteUi = () => {
    if (trash) {
      trash.hidden = mode !== 'ai';
      trash.disabled = !messages.ai.length || (selecting && !selectedIds.size);
      trash.setAttribute('aria-label', selecting ? `선택한 AI 대화 ${selectedIds.size}개 삭제` : 'AI 대화 전체 삭제');
    }
    tabs.hidden = selecting;
    deleteActions.hidden = !selecting;
    selectedCount.textContent = `선택 ${selectedIds.size}개`;
    input.disabled = selecting;
    mic.disabled = selecting;
    form.querySelector('.guide-chat-send').disabled = selecting;
    log.setAttribute('aria-live', selecting ? 'off' : 'polite');
  };

  const renderMessages = (follow = false) => {
    log.innerHTML = messages[mode].map((item) => {
      const name = mode === 'ai' ? item.role === 'user' ? '나' : 'AI' : item.speaker || '화자 확인 필요';
      const shownText = mode === 'ai' && item.role === 'assistant'
        ? plainAssistantReply(item.text) : item.text;
      const bubble = `<article class="guide-chat-bubble ${mode === 'ai' ? item.role : item.speaker === '나' ? 'self' : 'other'}">
        <span>${escapeHtml(name)}</span><div><p>${escapeHtml(shownText)}</p>
        ${item.translation ? `<small>${escapeHtml(item.translation)}</small>` : ''}</div>
        ${item.translation ? `<button type="button" class="guide-chat-speak" data-speak-id="${item.id}" aria-label="번역 음성 재생">🔊</button>` : ''}
      </article>`;
      return selecting && mode === 'ai'
        ? `<div class="guide-chat-select-row${selectedIds.has(item.id) ? ' is-selected' : ''}"><input type="checkbox" class="guide-chat-select" data-select-id="${item.id}" aria-label="${name} 대화 선택" ${selectedIds.has(item.id) ? 'checked' : ''}>${bubble}</div>`
        : bubble;
    }).join('');
    updateDeleteUi();
    if (follow && guideContent?.dataset.chatExpanded === 'true') {
      window.requestAnimationFrame(() => {
        guideContent.scrollTop = guideContent.scrollHeight;
      });
    }
  };
  let statusMessage = '';
  const setStatus = (message) => {
    statusMessage = message;
    status.textContent = [message, conversationStatus(), !historySaved
      ? '대화를 브라우저에 저장하지 못했습니다. 이 화면을 닫기 전에 필요한 내용을 복사해 주세요.' : '']
      .filter(Boolean).join(' ');
  };

  async function submit(message, { speakReply = false, sourceLanguage = '' } = {}) {
    const text = message.trim();
    if (!text || busy || stopped || selecting) return;
    busy = true;
    const run = ++generation;
    const requestMode = mode;
    if (requestMode === 'translation') translationVoice.stop();
    controller = new AbortController();
    const signal = controller.signal;
    const context = getContext();
    input.value = '';
    if (requestMode === 'ai') {
      messages.ai = readAiHistory();
      messages.ai.push({ id: makeId(), role: 'user', text });
      saveAiHistory();
    }
    renderMessages(true);
    setStatus(requestMode === 'ai' ? '답변을 확인하고 있습니다.' : '원문 언어를 확인하고 번역 중입니다.');
    let speechUnavailable = false;
    try {
      if (requestMode === 'ai') {
        const category = classifyQuestion(text);
        const answer = category === 'route' ? routeAnswer(text, context)
          : category === 'place' ? await placeAnswer(text, context, signal)
            : (await jsonPost('/api/assistant/reply', {
              task: 'guide-chat',
              message: text,
              context,
              history: messages.ai.slice(0, -1).slice(-8).map(({ role, text: content }) => ({
                role, text: role === 'assistant' ? plainAssistantReply(content) : content
              }))
            }, signal)).text;
        if (!stopped && run === generation) {
          messages.ai = readAiHistory();
          messages.ai.push({ id: makeId(), role: 'assistant', text: plainAssistantReply(answer) });
          saveAiHistory();
        }
        if (speakReply && !stopped && run === generation && mode === 'ai') {
          if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
            try {
              const utterance = new SpeechSynthesisUtterance(plainAssistantReply(answer));
              utterance.lang = /[가-힣]/.test(utterance.text) ? 'ko-KR' : 'en-US';
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            } catch {
              speechUnavailable = true;
            }
          } else {
            speechUnavailable = true;
          }
        }
      } else {
        const result = await jsonPost('/api/translation/translate', {
          text, userLanguage: 'ko', counterpartLanguage: translationPartner(), automatic: true, sourceLanguage
        }, signal);
        if (stopped || run !== generation) return;
        if (result.needsCounterpart) {
          messages.translation.push({ id: makeId(), speaker: '나', text });
          historySaved = saveConversation('guide_translation', messages.translation);
          renderMessages(true);
          setStatus('상대방이 먼저 한 문장 말해 주세요. 언어를 확인한 뒤 통역하겠습니다.');
          return;
        }
        const source = String(result.sourceLanguage || '').toLowerCase();
        if (!source) throw new Error('원문 언어를 확인하지 못해 발화자를 지정하지 않았습니다.');
        const speaker = source.startsWith('ko') ? '나' : '상대방';
        rememberTranslationPartner(result);
        if (!stopped) {
          messages.translation.push({
            id: makeId(), speaker, text, translation: result.text,
            targetLanguage: result.targetLanguage
          });
          historySaved = saveConversation('guide_translation', messages.translation);
        }
        if (speakReply && !stopped && mode === 'translation') void translationVoice.play(result.text, result.targetLanguage);
      }
      if (!stopped && run === generation) renderMessages(true);
      if (!stopped && run === generation) setStatus(speechUnavailable
        ? '이 브라우저에서 답변 음성 재생을 사용할 수 없습니다. 답변은 화면에서 확인해 주세요.' : '');
    } catch (error) {
      if (!stopped && run === generation && error.name !== 'AbortError') setStatus(error.message || '요청에 실패했습니다.');
    } finally {
      if (run === generation) { busy = false; controller = null; }
    }
  }

  async function toggleRecording() {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy || stopped) return;
    const recordingMode = mode;
    const mimeType = recordingMode === 'translation' ? translationRecordingType() : 'audio/webm;codecs=opus';
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder
      || !mimeType || !MediaRecorder.isTypeSupported(mimeType)) {
      setStatus('이 브라우저에서 양방향 음성 인식을 사용할 수 없습니다. 문자로 입력해 주세요.');
      return;
    }
    try {
      translationVoice.stop();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearTimeout(recordTimer);
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        mic.setAttribute('aria-pressed', 'false');
        if (stopped || !chunks.length) return;
        setStatus('음성을 인식하고 있습니다.');
        try {
          const audio = new Blob(chunks, { type: mimeType });
          if (audio.size > 2_000_000) throw new Error('음성 길이가 너무 깁니다. 짧게 다시 말해 주세요.');
          const bytes = new Uint8Array(await audio.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const result = await jsonPost('/api/assistant/reply', { task: 'transcribe', audio: btoa(binary),
            autoLanguage: recordingMode === 'translation' });
          if (!stopped && mode === recordingMode && result.text) await submit(result.text, { speakReply: true,
            sourceLanguage: recordingMode === 'translation' ? result.language : '' });
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
  let holdTimer = null;
  let holdPointer = null;
  const cancelHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdPointer = null;
  };
  log.addEventListener('pointerdown', (event) => {
    if (mode !== 'ai' || selecting || busy || stopped || event.button !== 0
      || !event.target.closest('.guide-chat-bubble')) return;
    cancelHold();
    holdPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdPointer = null;
      if (mode !== 'ai' || selecting || busy || stopped) return;
      selecting = true;
      selectedIds.clear();
      setStatus('');
      updateDeleteUi();
      renderMessages();
    }, 1000);
  });
  log.addEventListener('pointermove', (event) => {
    if (holdPointer?.id === event.pointerId
      && Math.hypot(event.clientX - holdPointer.x, event.clientY - holdPointer.y) > 12) cancelHold();
  });
  log.addEventListener('pointerup', cancelHold);
  log.addEventListener('pointercancel', cancelHold);
  log.addEventListener('pointerleave', cancelHold);
  log.addEventListener('contextmenu', (event) => {
    if (mode === 'ai' && event.target.closest('.guide-chat-bubble')) event.preventDefault();
  });
  const cancelSelection = () => {
    if (!selecting) return;
    selecting = false;
    selectedIds.clear();
    updateDeleteUi();
    renderMessages();
  };
  cancelDelete.addEventListener('click', cancelSelection);
  confirmDelete.addEventListener('click', () => {
    if (mode !== 'ai' || (selecting && !selectedIds.size)) return;
    messages.ai = readAiHistory();
    const deleting = selecting ? selectedIds : new Set(messages.ai.map((item) => item.id));
    const deletedCount = messages.ai.filter((item) => deleting.has(item.id)).length;
    if (!deletedCount) return;
    if (deletedCount === messages.ai.length && !window.confirm('AI 대화 기록을 모두 삭제할까요?')) return;
    messages.ai = messages.ai.filter((item) => !deleting.has(item.id));
    saveAiHistory();
    selecting = false;
    selectedIds.clear();
    updateDeleteUi();
    renderMessages(true);
    setStatus(`대화 ${deletedCount}개를 삭제했습니다.`);
  });
  log.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-select-id]');
    if (!selecting || !checkbox) return;
    if (checkbox.checked) selectedIds.add(checkbox.dataset.selectId);
    else selectedIds.delete(checkbox.dataset.selectId);
    checkbox.closest('.guide-chat-select-row')?.classList.toggle('is-selected', checkbox.checked);
    updateDeleteUi();
  });
  section.querySelectorAll('[data-chat-mode]').forEach((button) => {
    button.setAttribute('aria-expanded', String(guideContent?.dataset.chatExpanded === 'true'));
    button.addEventListener('click', () => {
      translationVoice.stop();
      const requestedMode = button.dataset.chatMode;
      const chatExpanded = guideContent?.dataset.chatExpanded !== 'false';
      if (chatExpanded && requestedMode === mode) {
        cancelSelection();
        guideContent.dataset.chatExpanded = 'false';
        section.querySelectorAll('[data-chat-mode]').forEach((tab) => tab.setAttribute('aria-expanded', 'false'));
        resizeMap();
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          guideContent.scrollTop = 0;
        });
        return;
      }
      mode = requestedMode;
      selecting = false;
      selectedIds.clear();
      section.querySelectorAll('[data-chat-mode]').forEach((tab) =>
        tab.setAttribute('aria-pressed', String(tab === button)));
      if (guideContent) {
        guideContent.dataset.chatExpanded = 'true';
        section.querySelectorAll('[data-chat-mode]').forEach((tab) => tab.setAttribute('aria-expanded', 'true'));
        resizeMap();
      }
      input.placeholder = mode === 'ai' ? '질문을 입력하세요' : '통역할 내용을 입력하세요';
      setStatus('');
      updateDeleteUi();
      renderMessages(true);
    });
  });
  log.addEventListener('click', (event) => {
    const button = event.target.closest('[data-speak-id]');
    if (!button) return;
    const item = messages.translation.find((entry) => entry.id === button.dataset.speakId);
    if (!item) {
      setStatus('이 브라우저에서 번역 음성 재생을 사용할 수 없습니다.');
      return;
    }
    void translationVoice.play(item.translation, item.targetLanguage);
  });
  const syncHistory = (event) => {
    if (event.detail?.scopes && !event.detail.scopes.some(scope => scope.startsWith('guide_'))) return;
    if (event.detail?.accountChanged) {
      generation++;
      controller?.abort();
      controller = null;
      busy = false;
      translationVoice.stop();
      window.speechSynthesis?.cancel();
      if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
      stream?.getTracks().forEach(track => track.stop());
      clearTimeout(recordTimer);
      selecting = false;
      selectedIds.clear();
      setStatus('');
    }
    messages.ai = readAiHistory();
    messages.translation = readConversation('guide_translation');
    for (const id of selectedIds) {
      if (!messages.ai.some((item) => item.id === id)) selectedIds.delete(id);
    }
    updateDeleteUi();
    renderMessages();
  };
  const syncStatus = () => setStatus(statusMessage);
  window.addEventListener(HISTORY_EVENT, syncHistory);
  window.addEventListener(HISTORY_STATUS_EVENT, syncStatus);
  updateDeleteUi();
  renderMessages();
  setStatus('');
  return { cancelSelection, stop() {
    stopped = true;
    translationVoice.stop();
    cancelHold();
    window.removeEventListener(HISTORY_EVENT, syncHistory);
    window.removeEventListener(HISTORY_STATUS_EVENT, syncStatus);
    controller?.abort();
    clearTimeout(recordTimer);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    window.speechSynthesis?.cancel();
  } };
}
