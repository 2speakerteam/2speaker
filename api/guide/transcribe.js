const { cloudProjectId, getAccessToken } = require('../lib/google-cloud');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  }
  const audio = req.body?.audio;
  if (typeof audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || audio.length > 2_800_000) {
    return res.status(400).json({ error: '음성 데이터를 확인할 수 없습니다.' });
  }
  try {
    const token = await getAccessToken(req);
    const project = encodeURIComponent(cloudProjectId());
    const response = await fetch(`https://speech.googleapis.com/v2/projects/${project}/locations/global/recognizers/_:recognize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        config: {
          autoDecodingConfig: {},
          languageCodes: ['ko-KR', 'en-US'],
          model: 'short'
        },
        content: audio
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = response.status === 403
        ? 'Google 음성 인식 권한 또는 Speech-to-Text API 설정을 확인해 주세요.'
        : 'Google 음성 인식 응답을 받지 못했습니다.';
      return res.status(response.status === 403 ? 503 : 502).json({ error });
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    const text = results.map((result) => result.alternatives?.[0]?.transcript || '').join(' ').trim();
    const language = results.find((result) => result.languageCode)?.languageCode || '';
    return res.status(200).json({ text, language });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || '음성을 인식하지 못했습니다.' });
  }
};
