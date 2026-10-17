const { requestTranslation } = require('../lib/google-translation');

function languageCode(value) {
  return typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.trim())
    ? value.trim()
    : '';
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

  const userLanguage = languageCode(req.body?.userLanguage) || 'ko';
  const automatic = req.body?.automatic === true;
  const normalize = value => {
    const code = languageCode(value);
    const base = code.toLowerCase().split('-')[0];
    if (base === 'cmn' || base === 'zh') return /hant|tw/i.test(code) ? 'zh-TW' : 'zh-CN';
    if (base === 'yue') return 'zh-TW';
    return base === 'iw' ? 'he' : base;
  };
  const counterpartLanguage = automatic ? normalize(req.body?.counterpartLanguage) : languageCode(req.body?.counterpartLanguage);
  let sourceLanguage = automatic ? normalize(req.body?.sourceLanguage) : languageCode(req.body?.sourceLanguage);
  let englishText = typeof req.body?.englishText === 'string' ? req.body.englishText.trim().slice(0, 4000) : '';

  try {
    if (!sourceLanguage) {
      const normalized = await requestTranslation(req, { text, targetLanguageCode: 'en' });
      sourceLanguage = automatic ? normalize(normalized.sourceLanguageCode) : languageCode(normalized.sourceLanguageCode);
      englishText = normalized.text;
    }

    if (automatic && !sourceLanguage) {
      return res.status(422).json({ error: '말씀하신 언어를 확인하지 못했습니다. 한 문장으로 다시 말씀해 주세요.' });
    }
    if (automatic && sourceLanguage === normalize(userLanguage) && !counterpartLanguage) {
      return res.status(200).json({ intent: 'translation', needsCounterpart: true, text: '',
        sourceLanguage, targetLanguage: '', provider: 'google-translation' });
    }

    // If the speaker uses their selected language, translate toward the detected conversation partner.
    // Otherwise translate the partner's message back into the user's selected language.
    const targetLanguage = (automatic ? sourceLanguage === normalize(userLanguage) : sourceLanguage.toLowerCase() === userLanguage.toLowerCase())
      ? counterpartLanguage || (userLanguage.toLowerCase() === 'en' ? 'ko' : 'en')
      : userLanguage;

    let translatedText;
    if (sourceLanguage.toLowerCase() === targetLanguage.toLowerCase()) {
      translatedText = text;
    } else if (targetLanguage.toLowerCase() === 'en' && englishText) {
      translatedText = englishText;
    } else {
      const translated = await requestTranslation(req, {
        text,
        targetLanguageCode: targetLanguage,
        sourceLanguageCode: sourceLanguage
      });
      translatedText = translated.text;
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

