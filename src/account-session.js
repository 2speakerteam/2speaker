// This is the existing project's browser-safe publishable key. Never use a
// secret/service-role key here: database access must pass the user's RLS policy.
const PROJECT_URL = 'https://jdojufplflfwxyolbaat.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_5ktCr7IM5PrvAFOcF9Qvjw_ozb0dYhx';
const SESSION_KEY = '2speaker:account-session:v1';
export const ACCOUNT_EVENT = '2speaker-account-changed';
let session = readSession();
let refresh = null;

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY));
    return value?.user?.id && value.access_token && value.refresh_token ? value : null;
  } catch { return null; }
}

function saveSession(value) {
  const previous = session?.user?.id;
  session = value ? { access_token: value.access_token, refresh_token: value.refresh_token,
    expires_at: value.expires_at || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600),
    user: { id: value.user.id, email: value.user.email || '' } } : null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* The signed-in session remains usable until this document closes. */ }
  if (previous !== session?.user?.id) window.dispatchEvent(new Event(ACCOUNT_EVENT));
}

function authError(payload, status) {
  const code = payload.code || payload.error_code || payload.error;
  const messages = {
    invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
    email_not_confirmed: '가입 이메일의 인증 링크를 먼저 확인한 뒤 로그인해 주세요.',
    user_already_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
    email_address_invalid: '이메일 주소를 확인해 주세요.',
    email_address_not_authorized: '가입 인증 메일 발송 설정을 확인해야 합니다. 다른 이메일로 반복 가입하지 마세요.',
    over_email_send_rate_limit: '인증 메일 발송 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    weak_password: '비밀번호는 8자 이상으로 입력해 주세요.',
    signup_disabled: '현재 회원가입이 비활성화되어 있습니다.',
    refresh_token_not_found: '다시 로그인하면 서버에 보관된 대화를 불러올 수 있습니다.',
    refresh_token_already_used: '다시 로그인하면 서버에 보관된 대화를 불러올 수 있습니다.'
  };
  const error = new Error(messages[code] || (status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    : '계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
  error.status = status;
  return error;
}

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${PROJECT_URL}${path}`, { method, signal: controller.signal,
      cache: 'no-store', headers: { apikey: PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw authError(payload, response.status);
    return payload;
  } finally { clearTimeout(timer); }
}

export function currentAccount() { return session ? { ...session.user } : null; }

export async function accountToken() {
  if (!session) throw new Error('대화를 서버에서 복원하려면 같은 계정으로 로그인해 주세요.');
  if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
  if (!refresh) {
    const renew = async () => {
      // Refresh tokens rotate. A second tab must use the newly saved token.
      const stored = readSession();
      if (stored?.user.id === session?.user.id) session = stored;
      if (session?.expires_at * 1000 > Date.now() + 60000) return session.access_token;
      const owner = session?.user.id;
      try {
        const result = await request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: { refresh_token: session?.refresh_token } });
        if (session?.user.id !== owner) throw new Error('계정이 변경되었습니다.');
        saveSession(result);
        return session.access_token;
      } catch (error) {
        if ([400, 401, 403].includes(error.status) && session?.user.id === owner) saveSession(null);
        throw error;
      }
    };
    refresh = (navigator.locks ? navigator.locks.request('2speaker-account-refresh', renew) : renew())
      .finally(() => { refresh = null; });
  }
  return refresh;
}

export async function accountRequest(path, options = {}) {
  if (!path.startsWith('/rest/v1/')) throw new Error('잘못된 대화 저장 경로입니다.');
  const owner = session?.user.id;
  try { return await request(path, { ...options, token: await accountToken() }); }
  catch (error) {
    if (error.status === 401 && session?.user.id === owner) saveSession(null);
    throw error;
  }
}

export async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: email.trim(), password } });
  saveSession(result);
  return currentAccount();
}

export async function signUp(email, password) {
  if (password.length < 8) throw new Error('비밀번호는 8자 이상으로 입력해 주세요.');
  const result = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin)}`, {
    method: 'POST', body: { email: email.trim(), password } });
  if (result.access_token && result.user) saveSession(result);
  return Boolean(result.access_token);
}

export async function signOut() {
  try {
    if (session) await request('/auth/v1/logout?scope=local', { method: 'POST', token: await accountToken() });
  } finally { saveSession(null); }
}

export async function initializeAccount() {
  if (!session) return;
  const owner = session.user.id;
  try {
    const token = await accountToken();
    const user = await request('/auth/v1/user', { token });
    if (session && user.id === session.user.id) session.user.email = user.email || '';
  } catch (error) {
    if ([400, 401, 403].includes(error.status) && session?.user.id === owner) saveSession(null);
    throw error;
  }
}

window.addEventListener('storage', event => {
  if (event.key !== SESSION_KEY && event.key !== null) return;
  const previous = session?.user.id;
  session = readSession();
  if (previous !== session?.user.id) window.dispatchEvent(new Event(ACCOUNT_EVENT));
});
