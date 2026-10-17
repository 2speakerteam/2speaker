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
      input: { text, prompt: `Read only the supplied text verbatim in ${korean ? 'standard Korean' : 'English'}. Speak as a professional female television or radio announcer warmly addressing one listener. Use a clear, centered adult female voice, precise but effortless articulation, smoothly connected phrasing and natural human sentence melody. Keep the delivery composed and confident, with a gentle smile in the voice, a comfortable slightly unhurried pace, and a brief natural pause between sentences. Let a genuine question end with a subtle natural rise. Do not sound like an automated phone menu, chant, whisper, over-enunciate, stretch syllables, add breaths or perform exaggerated excitement. Do not add any words or sounds.` },
      voice: { languageCode: korean ? 'ko-KR' : 'en-US',
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
