const HISTORY_KEY = '2speaker:guide-ai-history:v3';
const RECOVERY_KEY = `${HISTORY_KEY}:recovery`;
const LEGACY_KEYS = ['2speaker:guide-ai-history:v2', '2speaker:guide-ai-history:v1'];
let memory = null;
let unsaved = false;

function decode(raw) {
  if (raw === null) return null;
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return null;
    // A long answer is still a valid saved message. Never trim history on read.
    return items.filter((item) => item && ['user', 'assistant'].includes(item.role)
      && typeof item.text === 'string').map((item) => ({
      id: typeof item.id === 'string' ? item.id : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: item.role, text: item.text
    }));
  } catch { return null; }
}

export function readAiHistory() {
  if (unsaved && memory) return memory.map((item) => ({ ...item }));
  try {
    const storage = window.localStorage;
    const primary = storage.getItem(HISTORY_KEY);
    let history = decode(primary);
    if (history === null) history = decode(storage.getItem(RECOVERY_KEY));
    // An explicit empty v3 history means the user deleted it; do not restore old messages.
    if (history === null && primary === null) {
      for (const key of LEGACY_KEYS) {
        history = decode(storage.getItem(key));
        if (history !== null) break;
      }
    }
    if (history !== null) {
      memory = history;
      if (decode(primary) === null) saveAiHistory(history);
    }
  } catch { /* Retain messages in memory when storage is temporarily unavailable. */ }
  return (memory || []).map((item) => ({ ...item }));
}

export function saveAiHistory(history) {
  memory = history.map(({ id, role, text }) => ({ id, role, text }));
  unsaved = true;
  try {
    const storage = window.localStorage;
    const serialized = JSON.stringify(memory);
    storage.setItem(HISTORY_KEY, serialized);
    unsaved = false;
    try { storage.setItem(RECOVERY_KEY, serialized); }
    catch { storage.removeItem(RECOVERY_KEY); }
  } catch { /* Do not discard the visible conversation on quota/storage failure. */ }
  return !unsaved;
}
