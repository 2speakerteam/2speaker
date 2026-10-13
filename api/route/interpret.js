const { generateWithVertex } = require('../lib/model-provider');

const MODES = new Set(['walk', 'subway', 'bus', 'taxi', 'unspecified']);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 500) {
    return res.status(400).json({ error: '길찾기 요청을 500자 이내로 입력해 주세요.' });
  }

  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-4) : [];
  const previous = history.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const start = typeof item.start === 'string' ? item.start.slice(0, 100) : '';
    const destination = typeof item.destination === 'string' ? item.destination.slice(0, 100) : '';
    const mode = MODES.has(item.mode) ? item.mode : 'unspecified';
    return destination ? [{ start, destination, mode }] : [];
  });

  const systemInstruction = `You extract the user's route request into JSON. Return exactly one JSON object with these keys: start, destination, mode, useCurrentLocation, needsClarification, clarification.
start and destination are place-name strings only, never coordinates. start is an empty string when the user does not name a start place. mode is exactly walk, subway, bus, taxi, or unspecified. Use unspecified when no transport is requested. useCurrentLocation is true only when start is empty. needsClarification is true only when the requested destination cannot be identified from the latest request or a genuinely necessary place name is missing. clarification is a short Korean question when clarification is needed, otherwise an empty string.
Understand Korean natural route wording such as 에서, 까지, 으로, 가자, 지금 여기서 and mode suffixes. Strip commands and transport wording from place names. A named start always overrides GPS. Use the short previous-route context only to resolve a follow-up that omits a place; do not replace explicitly named places. Never invent place coordinates, addresses, lines, travel time, fares, or route data. Those come from NAVER and TMAP after this step.`;

  try {
    const generated = await generateWithVertex({
      req,
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ previous, message }) }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 350 }
    });
    let intent;
    try { intent = JSON.parse(generated.text); } catch { intent = null; }
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)
      || typeof intent.start !== 'string' || typeof intent.destination !== 'string'
      || typeof intent.useCurrentLocation !== 'boolean'
      || typeof intent.needsClarification !== 'boolean'
      || typeof intent.clarification !== 'string' || !MODES.has(intent.mode)) {
      return res.status(502).json({ error: 'Gemini 길찾기 해석 형식을 확인할 수 없습니다.' });
    }
    const start = intent.start.trim();
    const destination = intent.destination.trim();
    if (start.length > 100 || destination.length > 100 || intent.clarification.length > 200
      || intent.useCurrentLocation !== !start) {
      return res.status(502).json({ error: 'Gemini 길찾기 해석 결과가 일치하지 않습니다.' });
    }
    if (intent.needsClarification || !destination) {
      return res.status(422).json({ error: intent.clarification.trim() || '목적지를 알려 주세요.', clarification: true });
    }
    return res.status(200).json({ start, destination, mode: intent.mode, useCurrentLocation: intent.useCurrentLocation, provider: generated.provider });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Gemini 길찾기 해석에 실패했습니다.' });
  }
};
