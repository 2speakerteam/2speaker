const { cloudProjectId, getAccessToken } = require('../lib/google-cloud');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 사용할 수 있어요.' });
  }

  try {
    const token = await getAccessToken(req);
    const projectId = encodeURIComponent(cloudProjectId());
    const endpoint = `https://translation.googleapis.com/v3/projects/${projectId}/locations/global/supportedLanguages?displayLanguageCode=ko`;
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.languages)) {
      const error = new Error(response.status === 403
        ? 'Cloud Translation API 언어 목록 권한을 확인해 주세요.'
        : '번역 지원 언어 목록을 불러오지 못했어요.');
      error.statusCode = response.status >= 500 ? 502 : response.status || 502;
      throw error;
    }

    const languages = payload.languages
      .filter((item) => typeof item.languageCode === 'string' && typeof item.displayName === 'string')
      .map(({ languageCode, displayName }) => ({ code: languageCode, name: displayName }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
    return res.status(200).json({ languages });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || '언어 목록을 불러오지 못했어요.' });
  }
};

