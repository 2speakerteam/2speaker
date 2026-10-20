import { readAiHistory, saveAiHistory as persistAiHistory } from './guide-history.js?v=20261020-explicit-delete-1';
import { readConversation, saveConversation, deleteConversation, HISTORY_EVENT, HISTORY_STATUS_EVENT, conversationStatus } from './conversation-store.js?v=20261020-explicit-delete-1';
import { translationPartner, rememberTranslationPartner, translationRecordingType, createTranslationSpeech } from './translation-auto.js?v=20261018-auto-1';
import { askFieldGuide } from './field-guide.js?v=20261020-field-1';

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

async function jsonPost(url, body, signal) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '요청 결과를 확인하지 못했습니다.');
  return payload;
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
  let acquiring = false;
  let voiceGeneration = 0;
  let translationSpeaker = 'self';
  let playbackId = '';
  const translationVoice = createTranslationSpeech(() => { if (!stopped) setStatus('통역 음성을 재생하지 못했습니다. 번역문은 화면에서 확인해 주세요.'); });
  let selecting = false;
  const selectedIds = new Set();
  const messages = { ai: readAiHistory(), translation: readConversation('guide_translation') };
  let historySaved = true;
  const saveAiHistory = () => {
    historySaved = persistAiHistory(messages.ai);
  };

  section.innerHTML = `<div class="guide-chat-tabs" role="group" aria-label="대화 방식">
      <button type="button" data-chat-mode="ai" aria-pressed="true"><span>AI대화</span></button>
      <button type="button" data-chat-mode="translation" aria-pressed="false"><span>실시간 통역</span></button>
    </div>
    <div class="guide-chat-panel">
    <div class="guide-translation-heading" hidden>
      <strong>실시간 통역</strong>
      <div class="guide-translation-playback" role="group" aria-label="통역 음성 재생">
        <button type="button" data-translation-playback="previous" aria-label="이전 통역 재생"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
        <button type="button" data-translation-playback="play" aria-label="통역 음성 재생"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg></button>
        <button type="button" data-translation-playback="next" aria-label="다음 통역 재생"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
      </div>
    </div>
    <div class="guide-chat-messages" role="log" aria-live="polite"></div>
    <form class="guide-chat-form" aria-label="대화 입력">
      <input type="text" maxlength="2000" autocomplete="off" aria-label="대화 메시지" placeholder="질문을 입력하세요">
      <button type="button" class="guide-chat-mic" aria-label="음성 입력"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
      <button type="submit" class="guide-chat-send" aria-label="메시지 보내기"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/></svg></button>
      <button type="button" class="guide-chat-trash" aria-label="AI 대화 전체 삭제" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v6M14 11v6"/></svg></button>
    </form>
    <div class="guide-translation-speakers" role="group" aria-label="통역할 사람의 마이크" hidden>
      <button type="button" data-translation-speaker="self" aria-label="나의 음성 통역 시작" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg><span>나</span></button>
      <button type="button" data-translation-speaker="other" aria-label="상대방의 음성 통역 시작" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg><span>사용자</span></button>
    </div>
    <p class="guide-chat-status" role="status" aria-live="polite"></p>
    </div>`;
  const log = section.querySelector('.guide-chat-messages');
  const form = section.querySelector('.guide-chat-form');
  const input = form.querySelector('input');
  const status = section.querySelector('.guide-chat-status');
  const mic = section.querySelector('.guide-chat-mic');
  const trash = form.querySelector('.guide-chat-trash');
  const tabs = section.querySelector('.guide-chat-tabs');
  const heading = section.querySelector('.guide-translation-heading');
  const speakerControls = section.querySelector('.guide-translation-speakers');
  const speakerButtons = [...section.querySelectorAll('[data-translation-speaker]')];
  const playbackButtons = [...section.querySelectorAll('[data-translation-playback]')];
  const guideContent = section.closest('.guide-content');
  const resizeMap = () => guideContent?.querySelector('#route-map')?.dispatchEvent(new Event('guide-layout-change'));
  const deleteActions = section.closest('.guide-screen').querySelector('.guide-chat-delete-actions');
  const selectedCount = deleteActions.querySelector('.guide-chat-selected-count');
  const cancelDelete = deleteActions.querySelector('.guide-chat-delete-cancel');
  const confirmDelete = trash;

  const replayableMessages = () => messages.translation.filter(item => item.translation);
  const updateTranslationUi = () => {
    section.dataset.mode = mode;
    heading.hidden = mode !== 'translation';
    speakerControls.hidden = mode !== 'translation';
    const recording = recorder?.state === 'recording';
    for (const button of speakerButtons) {
      const selected = button.dataset.translationSpeaker === translationSpeaker;
      button.setAttribute('aria-pressed', String(selected));
      button.dataset.listening = String(recording && selected);
      button.disabled = busy || acquiring || (recording && !selected);
      button.setAttribute('aria-label', `${recording && selected ? '전송할' : '시작할'} ${button.dataset.translationSpeaker === 'self' ? '나의' : '상대방의'} 음성 통역`);
    }
    const entries = replayableMessages();
    const selectedIndex = entries.findIndex(item => item.id === playbackId);
    const index = selectedIndex < 0 ? entries.length - 1 : selectedIndex;
    for (const button of playbackButtons) {
      const action = button.dataset.translationPlayback;
      button.disabled = busy || acquiring || recording || !entries.length
        || (action === 'previous' && index === 0) || (action === 'next' && index === entries.length - 1);
    }
  };

  const cancelRecording = () => {
    voiceGeneration++;
    clearTimeout(recordTimer);
    if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); }
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    recorder = null;
    acquiring = false;
    mic.setAttribute('aria-pressed', 'false');
    updateTranslationUi();
  };

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
    updateTranslationUi();
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
        if (mode === 'translation') log.scrollTop = log.scrollHeight;
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

  async function submit(message, { speakReply = false, sourceLanguage = '', speaker = translationSpeaker } = {}) {
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
        const result = await askFieldGuide(text, { signal, context,
          history: messages.ai.slice(0, -1).slice(-8).map(({ role, text: content }) => ({
            role, text: role === 'assistant' ? plainAssistantReply(content) : content
          })) });
        if (!result || signal.aborted) return;
        const answer = result.text;
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
          text, userLanguage: 'ko', counterpartLanguage: translationPartner(), automatic: true, sourceLanguage, speaker
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
        if (speaker === 'other') rememberTranslationPartner(result);
        if (!stopped) {
          playbackId = makeId();
          messages.translation.push({
            id: playbackId, speaker: speaker === 'self' ? '나' : '상대방', text, translation: result.text,
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
      if (run === generation) { busy = false; controller = null; updateTranslationUi(); }
    }
  }

  async function toggleRecording(speaker = translationSpeaker) {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (busy || stopped || acquiring) return;
    const recordingMode = mode;
    const voiceRun = ++voiceGeneration;
    if (recordingMode === 'translation') translationSpeaker = speaker;
    const mimeType = recordingMode === 'translation' ? translationRecordingType() : 'audio/webm;codecs=opus';
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder
      || !mimeType || !MediaRecorder.isTypeSupported(mimeType)) {
      setStatus(recordingMode === 'translation' ? '이 브라우저에서 음성 인식을 사용할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.' : '이 브라우저에서 양방향 음성 인식을 사용할 수 없습니다. 문자로 입력해 주세요.');
      return;
    }
    try {
      acquiring = true;
      updateTranslationUi();
      translationVoice.stop();
      const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped || voiceRun !== voiceGeneration) { acquiredStream.getTracks().forEach((track) => track.stop()); return; }
      stream = acquiredStream;
      acquiring = false;
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearTimeout(recordTimer);
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        mic.setAttribute('aria-pressed', 'false');
        if (stopped || voiceRun !== voiceGeneration || !chunks.length) { updateTranslationUi(); return; }
        acquiring = true;
        updateTranslationUi();
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
          if (!stopped && voiceRun === voiceGeneration && mode === recordingMode && result.text) await submit(result.text, { speakReply: true,
            sourceLanguage: recordingMode === 'translation' ? result.language : '', speaker });
          else if (!stopped && voiceRun === voiceGeneration) setStatus('음성을 확인하지 못했습니다. 다시 말해 주세요.');
        } catch (error) {
          if (!stopped && voiceRun === voiceGeneration) setStatus(error.message || '음성 인식에 실패했습니다.');
        } finally {
          if (voiceRun === voiceGeneration) { acquiring = false; updateTranslationUi(); }
        }
      };
      recorder.start();
      mic.setAttribute('aria-pressed', 'true');
      updateTranslationUi();
      setStatus('듣고 있습니다. 마이크를 다시 누르면 전송합니다.');
      recordTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 12000);
    } catch {
      if (!stopped && voiceRun === voiceGeneration) {
        acquiring = false;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        updateTranslationUi();
        setStatus(recordingMode === 'translation' ? '마이크 권한을 허용한 뒤 다시 눌러 주세요.' : '마이크를 사용할 수 없습니다. 문자로 입력해 주세요.');
      }
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); void submit(input.value); });
  mic.addEventListener('click', () => { void toggleRecording(); });
  for (const button of speakerButtons) button.addEventListener('click', () => {
    void toggleRecording(button.dataset.translationSpeaker);
  });
  const replayTranslation = (item) => {
    if (!item || busy || acquiring || recorder?.state === 'recording') return;
    playbackId = item.id;
    updateTranslationUi();
    void translationVoice.play(item.translation, item.targetLanguage);
  };
  for (const button of playbackButtons) button.addEventListener('click', () => {
    const entries = replayableMessages();
    let index = entries.findIndex(item => item.id === playbackId);
    if (index < 0) index = entries.length - 1;
    if (button.dataset.translationPlayback === 'previous') index--;
    if (button.dataset.translationPlayback === 'next') index++;
    replayTranslation(entries[index]);
  });
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
    historySaved = deleteConversation('guide_ai', deleting);
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
      cancelRecording();
      generation++;
      controller?.abort();
      controller = null;
      busy = false;
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
    replayTranslation(item);
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
      cancelRecording();
      playbackId = '';
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
    cancelRecording();
    window.speechSynthesis?.cancel();
  } };
}
