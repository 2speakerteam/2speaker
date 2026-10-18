import { ACCOUNT_EVENT, currentAccount, accountRequest } from './account-session.js?v=20261018-cloud-history-1';

export const HISTORY_EVENT = '2speaker-history-changed';
export const HISTORY_STATUS_EVENT = '2speaker-history-status';
const SCOPES = ['guide_ai', 'guide_translation', 'roadview_ai', 'roadview_translation'];
const PREFIX = '2speaker:account-history:v1:';
const caches = new Map();
let activeOwner = currentAccount()?.id || 'guest';
let syncing = null;
let timer = null;
let syncState = 'idle';
let syncError = '';

const copy = value => JSON.parse(JSON.stringify(value));
const keyFor = owner => `${PREFIX}${owner}`;
const operationKey = (scope, id) => `${scope}:${id}`;
const messageTime = item => Number(String(item.id).split('-')[0]) || Date.now();

function decode(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function legacyHistory() {
  const result = Object.fromEntries(SCOPES.map(scope => [scope, []]));
  for (const key of ['2speaker:guide-ai-history:v3', '2speaker:guide-ai-history:v3:recovery',
    '2speaker:guide-ai-history:v2', '2speaker:guide-ai-history:v1']) {
    const items = decode(key);
    if (Array.isArray(items)) { result.guide_ai = items; break; }
  }
  for (const key of ['2speaker:roadview-voice-history:v1', '2speaker:roadview-voice-history:v1:recovery']) {
    const value = decode(key);
    if (Array.isArray(value?.ai) && Array.isArray(value?.translation)) {
      result.roadview_ai = value.ai.filter(item => item && (item.role !== 'assistant' || item.text !== '안녕하세요. 무엇을 도와드릴까요?'));
      result.roadview_translation = value.translation;
      break;
    }
  }
  return result;
}

function entry(item) {
  if (!item || typeof item.text !== 'string') return null;
  const sources = (Array.isArray(item.sources) ? item.sources : []).flatMap(source => {
    try {
      const url = new URL(source?.url);
      return url.protocol === 'https:' && !url.username && !url.password
        ? [{ title: String(source.title || url.hostname).slice(0, 200), url: url.href }] : [];
    } catch { return []; }
  });
  return { id: typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(item.id) ? item.id
    : `${Date.now()}-${crypto.randomUUID()}`, text: item.text,
    role: ['user', 'assistant'].includes(item.role) ? item.role : 'user',
    ...(item.speaker ? { speaker: ['나', '상대방'].includes(item.speaker) ? item.speaker : '화자 확인 필요' } : {}),
    ...(typeof item.translation === 'string' ? { translation: item.translation } : {}),
    ...(typeof item.sourceLanguage === 'string' ? { sourceLanguage: item.sourceLanguage.slice(0, 30) } : {}),
    ...(typeof item.targetLanguage === 'string' ? { targetLanguage: item.targetLanguage.slice(0, 30) } : {}),
    ...(sources.length ? { sources } : {}) };
}

function stateFor(owner = activeOwner) {
  if (caches.has(owner)) return caches.get(owner);
  const primary = decode(keyFor(owner));
  const saved = primary?.rows && primary?.pending ? primary : decode(`${keyFor(owner)}:recovery`);
  const state = { rows: {}, pending: {}, claimedBy: saved?.claimedBy || '' };
  if (saved?.rows && saved?.pending) {
    for (const row of Object.values(saved.rows)) {
      if (!validRow(row)) continue;
      const key = operationKey(row.stream, row.message_id);
      state.rows[key] = row;
      if (saved.pending[key]) state.pending[key] = { ...copy(row),
        version: saved.pending[key].version || crypto.randomUUID() };
    }
  } else if (owner === 'guest') {
    for (const [scope, items] of Object.entries(legacyHistory())) {
      let last = 0;
      for (const raw of items) {
        const item = entry(raw);
        if (item) last = Math.max(last + 1, messageTime(item));
        if (item) state.rows[operationKey(scope, item.id)] = { stream: scope, message_id: item.id,
          payload: item, sort_key: last, deleted_at: null };
      }
    }
  }
  caches.set(owner, state);
  return state;
}

function persist(owner, state) {
  try {
    const value = JSON.stringify(state);
    localStorage.setItem(keyFor(owner), value);
    try { localStorage.setItem(`${keyFor(owner)}:recovery`, value); } catch { /* Primary is saved. */ }
    return true;
  } catch { return false; }
}

function notify(scopes = SCOPES, accountChanged = false) {
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { scopes, accountChanged } }));
}

function status(state, error = '') {
  syncState = state;
  syncError = error;
  window.dispatchEvent(new Event(HISTORY_STATUS_EVENT));
}

export function conversationStatus() {
  if (!currentAccount()) return '기록을 서버에 보관하려면 더보기에서 로그인해 주세요. 로그인 전 기록은 이 기기에만 남습니다.';
  if (syncState === 'error') return '서버에 기록을 보관하지 못했습니다. 인터넷 연결과 로그인 상태를 확인해 주세요. 이 기기의 기록은 유지됩니다.';
  if (syncState === 'syncing') return '대화를 서버에 저장·복원 중입니다.';
  if (syncState === 'idle') return '계정의 대화 보관 상태를 확인하고 있습니다.';
  return '';
}

export function conversationAccountStatus() {
  if (!currentAccount()) return conversationStatus();
  return syncError || conversationStatus() || '대화를 서버에 보관하고 있습니다. 인터넷 기록 삭제 후에도 같은 계정으로 로그인하면 복원됩니다.';
}

export function readConversation(scope) {
  if (!SCOPES.includes(scope)) throw new Error('잘못된 대화 기록입니다.');
  if (activeOwner === 'guest' && stateFor().claimedBy) return [];
  return Object.values(stateFor().rows).filter(row => row.stream === scope && !row.deleted_at)
    .sort((a, b) => a.sort_key - b.sort_key || a.message_id.localeCompare(b.message_id))
    .map(row => entry({ ...copy(row.payload), id: row.message_id })).filter(Boolean);
}

export function saveConversation(scope, items) {
  if (!SCOPES.includes(scope)) return false;
  if (activeOwner === 'guest' && stateFor().claimedBy) caches.set('guest', { rows: {}, pending: {}, claimedBy: '' });
  const state = stateFor();
  const next = new Map(items.map(entry).filter(Boolean).map(item => [item.id, item]));
  let last = Object.values(state.rows).filter(row => row.stream === scope)
    .reduce((max, row) => Math.max(max, row.sort_key), 0);
  for (const row of Object.values(state.rows)) {
    if (row.stream !== scope || row.deleted_at || next.has(row.message_id)) continue;
    row.deleted_at = new Date().toISOString();
    row.payload = {};
    state.pending[operationKey(scope, row.message_id)] = { ...copy(row), version: crypto.randomUUID() };
  }
  for (const [id, item] of next) {
    const key = operationKey(scope, id);
    const previous = state.rows[key];
    // A deleted ID cannot return from another device's older cache.
    if (previous?.deleted_at || JSON.stringify(entry(previous?.payload)) === JSON.stringify(item)) continue;
    const row = { stream: scope, message_id: id, payload: copy(item),
      sort_key: previous?.sort_key || Math.max(last + 1, messageTime(item)), deleted_at: null };
    last = Math.max(last, row.sort_key);
    state.rows[key] = row;
    state.pending[key] = { ...copy(row), version: crypto.randomUUID() };
  }
  const saved = persist(activeOwner, state);
  if (currentAccount() && Object.keys(state.pending).length) { status('syncing'); scheduleSync(); }
  return saved;
}

function importGuest(owner) {
  const guest = stateFor('guest');
  if (guest.claimedBy && guest.claimedBy !== owner) return;
  const state = stateFor(owner);
  for (const [key, row] of Object.entries(guest.rows)) {
    if (state.rows[key]?.deleted_at || row.deleted_at) continue;
    if (!state.rows[key]) {
      state.rows[key] = copy(row);
      state.pending[key] = { ...copy(row), version: crypto.randomUUID() };
    }
  }
  // Keep accounts separate on shared phones. These rows now belong to this
  // account's pending queue even if the first upload is interrupted.
  guest.claimedBy = owner;
  if (persist(owner, state)) {
    const cleared = { rows: {}, pending: {}, claimedBy: '' };
    if (persist('guest', cleared)) caches.set('guest', cleared);
  } else persist('guest', guest);
}

function mergeRows(state, rows) {
  for (const row of rows) {
    if (!validRow(row)) continue;
    const key = operationKey(row.stream, row.message_id);
    const pending = state.pending[key];
    if (row.deleted_at) {
      state.rows[key] = row;
      delete state.pending[key];
    } else if (!pending && !state.rows[key]?.deleted_at) state.rows[key] = row;
  }
}

function validRow(row) {
  return row && SCOPES.includes(row.stream) && typeof row.message_id === 'string'
    && /^[A-Za-z0-9_-]{1,120}$/.test(row.message_id)
    && Number.isSafeInteger(row.sort_key) && row.sort_key >= 0
    && (row.deleted_at || typeof row.payload?.text === 'string');
}

function scheduleSync(delay = 250) {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncConversations().catch(() => {}); }, delay);
}

export function syncConversations() {
  const account = currentAccount();
  if (!account) return Promise.resolve();
  if (activeOwner !== account.id) changeOwner();
  if (syncing?.owner === account.id) return syncing.promise;
  const owner = account.id;
  const state = stateFor(owner);
  const current = () => currentAccount()?.id === owner && activeOwner === owner;
  const run = { owner, promise: null };
  run.promise = (async () => {
    status('syncing');
    try {
      // Read first. An empty new browser must never overwrite the server copy.
      for (let offset = 0; ; offset += 500) {
        const rows = await accountRequest(`/rest/v1/conversation_events?user_id=eq.${encodeURIComponent(owner)}&select=stream,message_id,payload,sort_key,deleted_at&order=stream.asc,sort_key.asc,message_id.asc&limit=500&offset=${offset}`);
        if (!current()) return;
        if (!Array.isArray(rows)) throw new Error('서버 대화 기록을 확인하지 못했습니다.');
        mergeRows(state, rows);
        if (rows.length < 500) break;
      }
      persist(owner, state);
      notify();
      while (current() && Object.keys(state.pending).length) {
        const batch = Object.entries(state.pending).slice(0, 50);
        const rows = await accountRequest('/rest/v1/rpc/save_conversation_events', {
          method: 'POST', body: { events: batch.map(([, row]) => ({ stream: row.stream,
            message_id: row.message_id, payload: row.payload, sort_key: row.sort_key,
            deleted: Boolean(row.deleted_at) })) } });
        if (!current()) return;
        if (!Array.isArray(rows)) throw new Error('대화 저장 완료 응답을 확인하지 못했습니다.');
        const returned = new Set(rows.map(row => operationKey(row.stream, row.message_id)));
        if (batch.some(([key]) => !returned.has(key))) throw new Error('일부 대화의 서버 저장을 확인하지 못했습니다. 다시 연결하면 재전송합니다.');
        for (const [key, sent] of batch) {
          if (state.pending[key]?.version === sent.version) delete state.pending[key];
        }
        mergeRows(state, rows);
        persist(owner, state);
      }
      if (current()) { status('saved'); notify(); }
    } catch (error) {
      if (current()) status('error', error.message || '서버 대화 저장에 실패했습니다.');
      throw error;
    } finally { if (syncing === run) syncing = null; }
  })();
  syncing = run;
  return run.promise;
}

function changeOwner() {
  const owner = currentAccount()?.id || 'guest';
  const changed = activeOwner !== owner;
  activeOwner = owner;
  if (owner !== 'guest') importGuest(owner);
  if (changed) { status('idle'); notify(SCOPES, true); }
  if (owner !== 'guest') scheduleSync(0);
}

export function startConversationSync() {
  changeOwner();
}

window.addEventListener(ACCOUNT_EVENT, changeOwner);
window.addEventListener('online', () => { if (currentAccount()) scheduleSync(0); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentAccount()) scheduleSync(0);
});
window.addEventListener('storage', event => {
  if (event.key !== keyFor(activeOwner) && event.key !== null) return;
  caches.delete(activeOwner);
  stateFor();
  notify();
  if (currentAccount()) scheduleSync(0);
});
