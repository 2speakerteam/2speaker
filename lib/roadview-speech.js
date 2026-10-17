const { cloudProjectId, getAccessToken } = require('../api/lib/google-cloud');

const fixedText = {
  greeting: '안녕하세요. 무엇을 도와드릴까요?',
  checking: '지도와 관련 정보를 확인한 후 안내드리겠습니다.'
};
const fixedAudio = new Map();

async function synthesize(req, text) {
  const korean = /[가-힣]/.test(text);
  const token = await getAccessToken(req);
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      'x-goog-user-project': cloudProjectId() },
    body: JSON.stringify({
      input: { text, prompt: `Speak ${korean ? 'Korean' : 'English'} as a warm, calm woman talking naturally to one nearby person. Use a soft, relaxed conversational voice, gentle everyday intonation, and a short natural pause between sentences. Keep a comfortable unhurried pace without stretching syllables. Avoid the fixed cadence of announcements, automated phone menus or newsreaders. Do not overact, whisper, add breaths, laugh or add any words. Read only the supplied text exactly.` },
      voice: { languageCode: korean ? 'ko-KR' : 'en-US',
        name: 'Achernar', modelName: 'gemini-2.5-flash-tts' },
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
      pending = synthesize(req, text);
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
