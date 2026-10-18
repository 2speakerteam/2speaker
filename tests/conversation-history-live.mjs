// Explicitly run against disposable history-qa-* users in the existing project.
// Uses the real client modules and real Auth/Postgres APIs; no admin API key.
// node --experimental-vm-modules tests/conversation-history-live.mjs <credentials.json> <report.json>
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';

const credentials = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(credentials.length, 2);
for (const account of credentials) {
  assert.match(account.email, /^history-qa-[ab]-[0-9a-f]+@example\.com$/);
  assert.ok(account.password.length >= 16);
}
const authUrl = new URL('../src/account-session.js?v=20261018-cloud-history-1', import.meta.url);
const storeUrl = new URL('../src/conversation-store.js?v=20261018-cloud-history-1', import.meta.url);
const source = await readFile(authUrl, 'utf8');
const project = source.match(/const PROJECT_URL = '([^']+)'/)[1];
const publishable = source.match(/const PUBLISHABLE_KEY = '([^']+)'/)[1];
const scopes = ['guide_ai', 'guide_translation', 'roadview_ai', 'roadview_translation'];
const clients = [];
const checks = [];
const tag = randomUUID();
const fixture = (label, index = 0) => ({ id: `${Date.now() + index}-${randomUUID()}`,
  role: 'user', text: `QA ${label} · ${tag}`, speaker: '나', translation: `Saved ${label}`,
  sourceLanguage: 'ko', targetLanguage: 'en' });

async function client(initial = {}) {
  const storage = new Map(Object.entries(initial));
  const timers = new Set();
  const window = new EventTarget();
  window.location = { origin: 'https://2speaker.vercel.app' };
  const document = new EventTarget();
  document.hidden = false;
  const context = vm.createContext({ window, document, navigator: {}, crypto: webcrypto,
    Event, CustomEvent, AbortController, fetch, URL, URLSearchParams, console,
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: (fn, delay) => { const id = setTimeout(() => { timers.delete(id); fn(); }, delay); timers.add(id); return id; },
    clearTimeout: id => { timers.delete(id); clearTimeout(id); } });
  const modules = new Map();
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href, context });
    modules.set(url.href, module);
    await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
    return module;
  }
  const auth = await load(authUrl);
  const store = await load(storeUrl);
  await auth.evaluate();
  await store.evaluate();
  const result = { auth: auth.namespace, store: store.namespace, storage,
    dispose() { for (const id of timers) clearTimeout(id); timers.clear(); } };
  clients.push(result);
  return result;
}

async function login(instance, index) {
  await instance.auth.signIn(credentials[index].email, credentials[index].password);
  await instance.store.syncConversations();
  const claims = JSON.parse(Buffer.from((await instance.auth.accountToken()).split('.')[1], 'base64url'));
  assert.equal(claims.role, 'authenticated');
  return instance.auth.currentAccount().id;
}

async function check(name, action) {
  await action();
  checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}

try {
  const a = await client();
  const b = await client();
  const aId = await login(a, 0);
  const bId = await login(b, 1);
  assert.notEqual(aId, bId);
  const aMessages = Object.fromEntries(scopes.map((scope, index) => [scope, fixture(`A ${scope}`, index)]));
  const bMessage = fixture('B private');

  await check('four_streams_saved_on_real_server_as_regular_member', async () => {
    for (const scope of scopes) a.store.saveConversation(scope, [aMessages[scope]]);
    await a.store.syncConversations();
    const rows = await a.auth.accountRequest('/rest/v1/conversation_events?select=stream,message_id,payload,deleted_at');
    for (const scope of scopes) assert.ok(rows.some(row => row.message_id === aMessages[scope].id && row.payload.text === aMessages[scope].text));
    b.store.saveConversation('guide_ai', [bMessage]);
    await b.store.syncConversations();
  });

  await check('member_A_cannot_read_member_B_and_reverse', async () => {
    assert.equal((await a.auth.accountRequest(`/rest/v1/conversation_events?user_id=eq.${bId}`)).length, 0);
    assert.equal((await b.auth.accountRequest(`/rest/v1/conversation_events?user_id=eq.${aId}`)).length, 0);
    assert.ok(!b.store.readConversation('guide_ai').some(item => item.id === aMessages.guide_ai.id));
  });

  await check('member_A_cannot_insert_or_change_member_B_rows', async () => {
    await assert.rejects(a.auth.accountRequest('/rest/v1/conversation_events', { method: 'POST', body: {
      user_id: bId, stream: 'guide_ai', message_id: fixture('forbidden').id,
      payload: fixture('forbidden'), sort_key: Date.now() } }), error => [401, 403].includes(error.status));
    await a.auth.accountRequest(`/rest/v1/conversation_events?user_id=eq.${bId}`, {
      method: 'PATCH', body: { payload: { text: 'forbidden overwrite' } } });
    const rows = await b.auth.accountRequest(`/rest/v1/conversation_events?message_id=eq.${bMessage.id}`);
    assert.equal(rows[0].payload.text, bMessage.text);
  });

  await check('anonymous_requests_cannot_read_history', async () => {
    const response = await fetch(`${project}/rest/v1/conversation_events?select=message_id`, { headers: { apikey: publishable } });
    assert.ok([401, 403].includes(response.status));
  });

  await check('logout_hides_local_account_history_without_deleting_server_rows', async () => {
    await a.auth.signOut();
    assert.equal(a.store.readConversation('guide_ai').length, 0);
  });

  const cleanPhone = await client();
  await check('cleared_site_data_and_login_restore_all_four_streams', async () => {
    assert.equal(cleanPhone.storage.size, 0);
    await login(cleanPhone, 0);
    for (const scope of scopes) assert.ok(cleanPhone.store.readConversation(scope).some(item => item.id === aMessages[scope].id));
  });

  const legacy = fixture('existing guest history');
  const secondDevice = await client({ '2speaker:guide-ai-history:v3': JSON.stringify([legacy]) });
  await check('device_change_and_guest_import_preserve_existing_server_history', async () => {
    await login(secondDevice, 0);
    const rows = secondDevice.store.readConversation('guide_ai');
    assert.ok(rows.some(item => item.id === legacy.id));
    assert.ok(rows.some(item => item.id === aMessages.guide_ai.id));
  });

  await check('explicit_delete_is_not_resurrected_by_stale_device', async () => {
    const older = secondDevice.store.readConversation('guide_ai');
    cleanPhone.store.saveConversation('guide_ai', cleanPhone.store.readConversation('guide_ai').filter(item => item.id !== aMessages.guide_ai.id));
    await cleanPhone.store.syncConversations();
    secondDevice.store.saveConversation('guide_ai', older.map(item => ({ ...item, text: `${item.text} stale copy` })));
    await secondDevice.store.syncConversations();
    assert.ok(!secondDevice.store.readConversation('guide_ai').some(item => item.id === aMessages.guide_ai.id));
    const deleted = await secondDevice.auth.accountRequest(`/rest/v1/conversation_events?message_id=eq.${aMessages.guide_ai.id}`);
    assert.ok(deleted[0].deleted_at);
    assert.equal(Object.keys(deleted[0].payload).length, 0);
  });

  await check('existing_other_streams_and_member_B_are_unchanged', async () => {
    await b.store.syncConversations();
    assert.equal(b.store.readConversation('guide_ai').find(item => item.id === bMessage.id).text, bMessage.text);
    for (const scope of scopes.slice(1)) assert.ok(secondDevice.store.readConversation(scope).some(item => item.id === aMessages[scope].id));
  });

  const report = { testedAt: new Date().toISOString(), backend: 'Supabase Auth + Postgres RLS',
    accountRole: 'authenticated', checks, passed: checks.length,
    note: 'Two disposable QA members only. Fresh isolated client storage simulates cleared site data and a second device. No administrator key or real member conversations used.' };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
} finally {
  for (const instance of clients) instance.dispose();
}
