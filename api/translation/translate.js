const { cloudProjectId, getAccessToken } = require('../lib/google-cloud');

function detectKorean(text) {
  const koreanCharacters = (text.match(/[\uac00-\ud7a3]/g) || []).length;
  const latinCharacters = (text.match(/[a-z]/gi) || []).length;
  return koreanCharacters > 0 && koreanCharacters >= latinCharacters;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 2000) {
    return res.status(400).json({ error: '번역할 내용을 확인해 주세요. 한 번에 2,000자까지 입력할 수 있어요.' });
  }

  const sourceLanguage = detectKorean(text) ? 'ko' : 'en';
  const targetLanguage = sourceLanguage === 'ko' ? 'en' : 'ko';
  try {
    const token = await getAccessToken(req);
    const endpoint = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(cloudProjectId())}/locations/global:translateText`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        contents: [text],
        mimeType: 'text/plain',
        sourceLanguageCode: sourceLanguage,
        targetLanguageCode: targetLanguage
      })
    });
    const payload = await response.json().catch(() => ({}));
    const translatedText = payload.translations?.[0]?.translatedText?.trim();
    if (!response.ok || !translatedText) {
      const error = new Error(response.status === 403
        ? 'Cloud Translation API가 켜져 있고 서비스 계정에 번역 권한이 있는지 확인해 주세요.'
        : 'Google Translation API에서 번역 결과를 받지 못했어요.');
      error.statusCode = response.status >= 500 ? 502 : response.status || 502;
      throw error;
    }
    return res.status(200).json({
      intent: 'translation',
      text: translatedText,
      sourceLanguage,
      targetLanguage,
      provider: 'google-translation'
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || '번역 API에 연결하지 못했어요.' });
  }
};

