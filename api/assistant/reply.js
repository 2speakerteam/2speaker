const { generateAssistantText } = require('../lib/model-provider');
const { requestTranslation } = require('../lib/google-translation');

function classifyIntent(text, { history = [] } = {}) {
  const normalized = text.toLowerCase();
  if (/(why\s+(?:(?:do|does|did|is|are)\s+)?(?:you|they|we|people|this|that)?\s*(?:say|said|speak|use|used|word|phrase|expression)|what does .{1,100} mean|what(?:'s| is) the difference|how is .{1,100} used|grammar|why this (?:phrase|expression|word)|explain (?:this|that|the meaning)|왜.*(말|표현|쓰|문장|이렇게)|무슨 뜻|뜻(?:이|은)?\s*(?:뭐|무엇)|표현.*설명|문법.*설명)/i.test(normalized)) {
    return 'explain';
  }
  if (/(practice|let'?s practice|role[ -]?play|conversation practice|let'?s (?:talk|chat)|speak with me|have a conversation|회화.*(연습|하자)|영어.*연습|연습하자|상황극)/i.test(normalized)) {
    return 'practice';
  }
  const hasHistory = Array.isArray(history) && history.some((turn) => typeof turn?.text === 'string' && turn.text.trim());
  if (hasHistory && /^(why\??|how come\??|what does that mean\??|can you explain\??|why is that\??|그건 왜\??|왜 그래\??|무슨 뜻이야\??)$/i.test(normalized.trim())) {
    return 'explain';
  }
  const previousIntent = Array.isArray(history)
    ? [...history].reverse().find((turn) => ['explain', 'practice'].includes(turn?.intent))?.intent
    : '';
  if (previousIntent === 'practice') return 'practice';
  return 'translation';
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((turn) => {
    if (!turn || !['user', 'model'].includes(turn.role) || typeof turn.text !== 'string') return [];
    const text = turn.text.trim().slice(0, 500);
    return text ? [{ role: turn.role, parts: [{ text }] }] : [];
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: '메시지를 확인해 주세요. 한 번에 2,000자까지 입력할 수 있어요.' });
  }

  let normalized;
  try {
    // Translation to English is used only for language-independent intent detection.
    // Ordinary translation still returns through Cloud Translation without calling Gemini.
    normalized = await requestTranslation(req, { text: message, targetLanguageCode: 'en' });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || '메시지 언어를 확인하지 못했어요.' });
  }

  const intent = classifyIntent(normalized.text, { history: req.body?.history });
  if (intent === 'translation') {
    return res.status(200).json({
      intent,
      useTranslationApi: true,
      sourceLanguage: normalized.sourceLanguageCode,
      englishText: normalized.text
    });
  }

  const language = normalized.sourceLanguageCode || 'the same language as the user’s latest message';
  const taskInstruction = intent === 'practice'
    ? 'Act as a friendly conversation partner for language practice. Reply naturally, keep the turn short, and invite the user to continue.'
    : 'Explain the wording, meaning, and natural usage. Give one concise example. Do not merely translate.';
  const systemInstruction = `You are the 2SPEAKER multilingual assistant. Understand the user's latest message in its original language and reply naturally in that same language (language code: ${language}). Use the conversation history to understand context. Do not switch languages unless asked. ${taskInstruction}`;
  const contents = [
    ...normalizeHistory(req.body?.history),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const generated = await generateAssistantText({ req, systemInstruction, contents });
    return res.status(200).json({ intent, sourceLanguage: normalized.sourceLanguageCode, text: generated.text, provider: generated.provider, model: generated.model });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'AI 응답을 불러오지 못했어요.' });
  }
};

