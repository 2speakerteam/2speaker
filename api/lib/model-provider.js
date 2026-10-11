const { cloudLocation, cloudProjectId, getAccessToken } = require('./google-cloud');

async function generateWithVertex({ req, systemInstruction, contents }) {
  const projectId = cloudProjectId();
  const location = cloudLocation();
  const configuredModelId = process.env.GEMINI_MODEL_ID?.trim();
  // Keep production compatible with the previous preview value already saved in Vercel.
  const modelId = !configuredModelId || configuredModelId === 'gemini-3-flash-preview'
    ? 'gemini-3.8-flash'
    : configuredModelId;
  const token = await getAccessToken(req);
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: 'LOW' } }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 403
      ? 'Vertex AI 권한을 확인해 주세요.'
      : response.status === 404
        ? '설정한 Gemini Flash 모델을 찾지 못했어요.'
        : response.status === 429
          ? 'Vertex AI 사용 한도에 도달했어요. 비용·할당량 설정을 확인하고 다시 시도해 주세요.'
          : 'Gemini 응답을 받지 못했어요. Vertex AI 설정을 확인해 주세요.';
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) {
    const error = new Error('Gemini가 답변을 만들지 못했어요.');
    error.statusCode = 502;
    throw error;
  }

  return { text, provider: 'vertex', model: payload.modelVersion || modelId };
}

function toOpenAIInput(contents) {
  return contents.map((turn) => ({
    role: turn.role === 'model' ? 'assistant' : 'user',
    content: (turn.parts || []).map((part) => part.text || '').join('')
  })).filter((turn) => turn.content);
}

async function generateWithOpenAI({ systemInstruction, contents }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error('OpenAI는 아직 선택·설정되지 않았어요. AI_PROVIDER와 서버 전용 API 키를 직접 설정해야 사용할 수 있어요.');
    error.statusCode = 503;
    throw error;
  }

  const modelId = process.env.OPENAI_MODEL_ID?.trim() || 'gpt-6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      instructions: systemInstruction,
      input: toOpenAIInput(contents),
      max_output_tokens: 360
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 429
      ? 'OpenAI 사용 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.'
      : response.status === 401 || response.status === 403
        ? 'OpenAI 서버 인증 설정을 확인해 주세요.'
        : 'OpenAI 응답을 받지 못했어요.';
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  const outputText = payload.output_text || payload.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
  if (!outputText?.trim()) {
    const error = new Error('GPT가 답변을 만들지 못했어요.');
    error.statusCode = 502;
    throw error;
  }
  return { text: outputText.trim(), provider: 'openai', model: payload.model || modelId };
}

const PROVIDERS = Object.freeze({
  vertex: generateWithVertex,
  openai: generateWithOpenAI
});

async function generateAssistantText(input) {
  const providerName = process.env.AI_PROVIDER?.trim().toLowerCase() || 'vertex';
  const provider = PROVIDERS[providerName];
  if (!provider) {
    const error = new Error(`AI_PROVIDER "${providerName}" is not configured on this server.`);
    error.statusCode = 503;
    throw error;
  }
  // Explicit provider selection only: a failed/empty Vertex call never falls back to a paid provider.
  return provider(input);
}

module.exports = { generateAssistantText };

