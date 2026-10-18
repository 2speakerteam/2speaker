import { readConversation, saveConversation } from './conversation-store.js?v=20261018-cloud-history-1';

export function readAiHistory() { return readConversation('guide_ai'); }
export function saveAiHistory(history) { return saveConversation('guide_ai', history); }
