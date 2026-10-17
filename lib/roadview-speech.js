const { cloudProjectId, getAccessToken } = require('../api/lib/google-cloud');

const fixedText = {
  greeting: '안녕하세요. 무엇을 도와드릴까요?',
  checking: '지도와 관련 정보를 확인한 후 안내드리겠습니다.'
};
const fixedAudio = new Map();

async function synthesize(req, text, requestedLanguage = '') {
  const korean = /[가-힣]/.test(text);
  const base = requestedLanguage.toLowerCase().split('-')[0];
  const locales = { ko: 'ko-KR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
    ja: 'ja-JP', zh: /tw|hant/i.test(requestedLanguage) ? 'cmn-tw' : 'cmn-CN', pt: 'pt-BR', ru: 'ru-RU',
    vi: 'vi-VN', th: 'th-TH', id: 'id-ID', hi: 'hi-IN', ar: 'ar-EG', nl: 'nl-NL',
    pl: 'pl-PL', tr: 'tr-TR', uk: 'uk-UA', ro: 'ro-RO', bn: 'bn-BD', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN' };
  const locale = requestedLanguage ? locales[base] || requestedLanguage : korean ? 'ko-KR' : 'en-US';
  const token = await getAccessToken(req);
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      'x-goog-user-project': cloudProjectId() },
    body: JSON.stringify({
      input: { text, prompt: `Read only the supplied text verbatim in ${requestedLanguage ? locale : korean ? 'standard Korean' : 'English'}. Speak as a professional female radio or television host with a bright, welcoming announcer delivery. Let the listener hear a genuine friendly smile, as though you are delighted to greet and help them. Use lively, warm human intonation, a lightly lifted greeting and a gently rising question ending. Keep the mature, clear, centered female voice and precise but relaxed articulation. Connect words smoothly at a comfortable natural pace, with a brief pause between sentences and comfortable speaking volume. Avoid solemn newsreading, a flat automated phone cadence, strained high pitch, a childish or cutesy performance, shouting, singing or exaggerated excitement. Do not add any words, breaths or other sounds.` },
      voice: { languageCode: locale,
        name: 'Kore', modelName: 'gemini-2.5-pro-tts' },
      audioConfig: { audioEncoding: 'MP3' }
    }), signal: AbortSignal.timeout(25000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.audioContent) {
    const error = new Error(response.status === 403
      ? '여성 음성 서비스의 이용 권한을 확인해 주세요.' : '여성 음성을 불러오지 못했습니다. 다시 듣기를 눌러 주세요.');
    error.statusCode = response.status === 403 ? 503 : 502;
    error.providerReason = result.error?.details?.find(d => typeof d.reason === 'string')?.reason
      || result.error?.status || `HTTP_${response.status}`;
    throw error;
  }
  return result.audioContent;
}

async function handleRoadviewSpeech(req, res, phrase = '') {
  const text = phrase ? fixedText[phrase] : typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!text || text.length > 2000) return res.status(400).json({ error: '읽을 문장을 확인해 주세요.' });
  try {
    let pending = phrase && fixedAudio.get(phrase);
    if (!pending) {
      const language = !phrase && typeof req.body?.language === 'string'
        && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(req.body.language) ? req.body.language : '';
      pending = synthesize(req, text, language);
      if (phrase) fixedAudio.set(phrase, pending);
    }
    const audioContent = await pending;
    if (phrase) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(Buffer.from(audioContent, 'base64'));
    }
    return res.status(200).json({ audioContent });
  } catch (error) {
    if (phrase) fixedAudio.delete(phrase);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(error.statusCode || 502).json({ error: error.message,
      ...(error.providerReason ? { providerReason: error.providerReason } : {}) });
  }
}

module.exports = { handleRoadviewSpeech };
