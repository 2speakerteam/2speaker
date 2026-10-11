const TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const JWT_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const TOKEN_EXCHANGE_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const STS_URL = 'https://sts.googleapis.com/v1/token';
const IAM_CREDENTIALS_URL = 'https://iamcredentials.googleapis.com/v1';

let cachedToken = null;
let tokenExpiresAt = 0;

function configuration(req) {
  const oidcToken = req?.headers?.['x-vercel-oidc-token'];
  if (typeof oidcToken !== 'string' || !oidcToken.trim()) {
    const error = new Error('Vercel OIDC 토큰을 찾지 못했어요. Vercel 프로젝트에서 OIDC를 켜고 배포 환경에서 다시 시도해 주세요.');
    error.statusCode = 503;
    throw error;
  }

  const values = {
    projectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim(),
    poolId: process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID?.trim(),
    providerId: process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim(),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  };
  if (Object.values(values).some((value) => !value)) {
    const error = new Error('Google Cloud WIF 설정이 서버 환경 변수에 완성되지 않았어요.');
    error.statusCode = 503;
    throw error;
  }
  return { ...values, oidcToken: oidcToken.trim() };
}

async function exchangeForAccessToken(config) {
  const audience = `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`;
  const exchange = await fetch(STS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      audience,
      grant_type: TOKEN_EXCHANGE_TYPE,
      requested_token_type: TOKEN_TYPE,
      scope: TOKEN_SCOPE,
      subject_token_type: JWT_TYPE,
      subject_token: config.oidcToken
    })
  });
  const exchanged = await exchange.json().catch(() => ({}));
  if (!exchange.ok || !exchanged.access_token) {
    const error = new Error('Google STS가 Vercel OIDC 토큰을 교환하지 못했어요. WIF 제공자와 Audience 설정을 확인해 주세요.');
    error.statusCode = 502;
    throw error;
  }

  const impersonationUrl = `${IAM_CREDENTIALS_URL}/projects/-/serviceAccounts/${encodeURIComponent(config.serviceAccountEmail)}:generateAccessToken`;
  const impersonation = await fetch(impersonationUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${exchanged.access_token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ scope: [TOKEN_SCOPE] })
  });
  const impersonated = await impersonation.json().catch(() => ({}));
  if (!impersonation.ok || !impersonated.accessToken || !impersonated.expireTime) {
    const error = new Error('Google이 제한된 서비스 계정 임시 토큰을 발급하지 못했어요. 서비스 계정 WIF 권한을 확인해 주세요.');
    error.statusCode = 502;
    throw error;
  }

  return { accessToken: impersonated.accessToken, expireTime: Date.parse(impersonated.expireTime) };
}

async function getAccessToken(req) {
  const config = configuration(req);
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const token = await exchangeForAccessToken(config);
  if (!Number.isFinite(token.expireTime) || token.expireTime <= Date.now()) {
    const error = new Error('Google 임시 토큰 만료 시간을 확인하지 못했어요.');
    error.statusCode = 502;
    throw error;
  }
  cachedToken = token.accessToken;
  tokenExpiresAt = token.expireTime;
  return cachedToken;
}

function cloudProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() || 'speaker-510912';
}

function cloudLocation() {
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'global';
}

module.exports = { cloudLocation, cloudProjectId, getAccessToken };

