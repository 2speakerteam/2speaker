const { cloudProjectId, getAccessToken } = require('./google-cloud');

async function requestTranslation(req, { text, targetLanguageCode, sourceLanguageCode }) {
  const token = await getAccessToken(req);
  const endpoint = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(cloudProjectId())}/locations/global:translateText`;
  const requestBody = {
    contents: [text],
    mimeType: 'text/plain',
    targetLanguageCode
  };
  if (sourceLanguageCode) requestBody.sourceLanguageCode = sourceLanguageCode;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  const payload = await response.json().catch(() => ({}));
  const translation = payload.translations?.[0];
  const translatedText = translation?.translatedText?.trim();
  if (!response.ok || !translatedText) {
    const error = new Error(response.status === 403
      ? 'Cloud Translation API가 켜져 있고 서비스 계정에 번역 권한이 있는지 확인해 주세요.'
      : 'Google Translation API에서 번역 결과를 받지 못했어요.');
    error.statusCode = response.status >= 500 ? 502 : response.status || 502;
    throw error;
  }

  return {
    text: translatedText,
    sourceLanguageCode: translation.detectedLanguageCode || sourceLanguageCode || '',
    targetLanguageCode
  };
}

module.exports = { requestTranslation };

