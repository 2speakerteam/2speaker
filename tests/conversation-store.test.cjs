const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const scopes = ['guide_ai', 'guide_translation', 'roadview_ai', 'roadview_translation'];
const source = fs.readFileSync(path.join(__dirname, '../src/conversation-store.js'), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replace(/export (function|const) /g, '$1 ');
const clone = value => JSON.parse(JSON.stringify(value));
const key = row => `${row.stream}:${row.message_id}`;
const message = id => ({ id, role: 'user', text: `Message ${id}` });

// Persistent remote rows outlive each isolated browser's storage and session.
// The RPC stub follows the database's irreversible deletion-marker behavior.
function server() {
  return {
    accounts: new Map(), writes: [],
    rows(owner) {
      if (!this.accounts.has(owner)) this.accounts.set(owner, new Map());
      return this.accounts.get(owner);
    },
    async request(owner, url, options = {}) {
      assert.ok(owner, 'History requests require an authenticated account');
      const rows = this.rows(owner);
      if (options.method === 'POST') {
        assert.equal(url, '/rest/v1/rpc/save_conversation_events');
        return options.body.events.map(event => {
          this.writes.push({ owner, ...clone(event) });
          const previous = rows.get(key(event));
          const deleted = previous?.deleted_at || (event.deleted ? new Date().toISOString() : null);
          const row = { stream: event.stream, message_id: event.message_id,
            payload: deleted ? {} : clone(event.payload), sort_key: event.sort_key, deleted_at: deleted };
          rows.set(key(row), row);
          return clone(row);
        });
      }
      const query = new URL(url, 'https://history.example').searchParams;
      assert.equal(query.get('user_id'), `eq.${owner}`);
      const offset = Number(query.get('offset'));
      const limit = Number(query.get('limit'));
      return clone([...rows.values()].sort((a, b) => a.stream.localeCompare(b.stream)
        || a.sort_key - b.sort_key || a.message_id.localeCompare(b.message_id)).slice(offset, offset + limit));
    }
  };
}

function browser(remote) {
  let account = null, nextTimer = 0;
  const storage = new Map(), timers = new Map();
  const window = new EventTarget(), document = new EventTarget();
  const module = { exports: {} };
  document.hidden = false;
  vm.runInNewContext(source + '\nmodule.exports = { readConversation, saveConversation, deleteConversation, syncConversations, conversationAccountStatus };', {
    module, window, document, Event, CustomEvent, URL, crypto: webcrypto,
    ACCOUNT_EVENT: 'account-changed', currentAccount: () => account,
    accountRequest: (url, options) => remote.request(account?.id, url, options),
    localStorage: { getItem: name => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, String(value)) },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id)
  });
  return {
    store: module.exports, storage,
    async login(id) {
      account = { id };
      window.dispatchEvent(new Event('account-changed'));
      await module.exports.syncConversations();
    },
    logout() { account = null; window.dispatchEvent(new Event('account-changed')); }
  };
}

test('partial and empty snapshots never delete saved AI or translation history', async () => {
  const remote = server(), client = browser(remote);
  await client.login('member-a');
  for (const scope of scopes) client.store.saveConversation(scope, [message(`${scope}-first`), message(`${scope}-second`)]);
  await client.store.syncConversations();
  for (const scope of scopes) {
    client.store.saveConversation(scope, [message(`${scope}-second`)]);
    client.store.saveConversation(scope, []);
  }
  await client.store.syncConversations();
  for (const scope of scopes) assert.equal(client.store.readConversation(scope).length, 2);
  assert.equal(remote.writes.filter(write => write.deleted).length, 0);
});

test('clearing all browser data preserves remote records and a fresh login restores every stream', async () => {
  const remote = server(), original = browser(remote);
  await original.login('member-a');
  for (const scope of scopes) original.store.saveConversation(scope, [message(`${scope}-saved`)]);
  await original.store.syncConversations();
  original.storage.clear();
  original.logout();
  const fresh = browser(remote);
  assert.equal(fresh.storage.size, 0);
  assert.equal(fresh.store.readConversation('guide_ai').length, 0);
  await fresh.login('member-a');
  for (const scope of scopes) assert.equal(fresh.store.readConversation(scope)[0].id, `${scope}-saved`);
  assert.equal(remote.rows('member-a').size, 4);
  assert.equal(remote.writes.filter(write => write.deleted).length, 0);
});

test('only explicit trash deletion removes selected messages and stale devices cannot restore them', async () => {
  const remote = server(), original = browser(remote), other = browser(remote);
  await original.login('member-a');
  for (const scope of scopes) original.store.saveConversation(scope, [message(`${scope}-remove`), message(`${scope}-keep`)]);
  await original.store.syncConversations();
  await other.login('member-a');
  const stale = new Map(scopes.map(scope => [scope, other.store.readConversation(scope)]));
  for (const scope of scopes) original.store.deleteConversation(scope, [`${scope}-remove`]);
  await original.store.syncConversations();
  for (const scope of scopes) other.store.saveConversation(scope, stale.get(scope));
  await other.store.syncConversations();
  for (const scope of scopes) {
    assert.deepEqual(Array.from(other.store.readConversation(scope), item => item.id), [`${scope}-keep`]);
    const deleted = remote.rows('member-a').get(`${scope}:${scope}-remove`);
    assert.ok(deleted.deleted_at);
    assert.deepEqual(deleted.payload, {});
  }
  assert.equal(remote.writes.filter(write => write.deleted).length, 4);
});

test('restoration reads all pages of old history without an age or message-count cutoff', async () => {
  const remote = server();
  for (let i = 0; i < 1003; i++) {
    const row = { stream: scopes[i % scopes.length], message_id: `old-${i}`,
      payload: message(`old-${i}`), sort_key: i, deleted_at: null };
    remote.rows('member-a').set(key(row), row);
  }
  const client = browser(remote);
  await client.login('member-a');
  assert.equal(scopes.reduce((count, scope) => count + client.store.readConversation(scope).length, 0), 1003);
  assert.equal(remote.writes.length, 0);
  client.logout();
  await client.login('member-b');
  for (const scope of scopes) assert.equal(client.store.readConversation(scope).length, 0);
  assert.equal(remote.rows('member-a').size, 1003);
});
