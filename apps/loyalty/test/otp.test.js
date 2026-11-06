'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OTP = require('../otp');

// Fake Message Pro API: records calls, answers like the Chatwoot-based platform.
function fakePlatform({ contacts = [], conversations = [], fail = {} } = {}) {
  const calls = [];
  let nextId = 500;
  const fetchImpl = async (url, init) => {
    const u = new URL(url); const path = u.pathname.replace('/api/v1/accounts/129', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, query: u.search, body, headers: init.headers });
    const json = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (fail[path]) return json(fail[path], {});
    if (init.method === 'GET' && path === '/contacts/search') {
      const q = u.searchParams.get('q');
      return json(200, { payload: contacts.filter(c => c.phone_number.replace(/\D/g, '') === q) });
    }
    if (init.method === 'POST' && path === '/contacts') { const c = { id: nextId++, phone_number: body.phone_number }; contacts.push(c); return json(200, { payload: { contact: c } }); }
    let m = path.match(/^\/contacts\/(\d+)\/conversations$/);
    if (m) return json(200, { payload: conversations.filter(c => c.contact_id === +m[1]) });
    if (init.method === 'POST' && path === '/conversations') { const c = { id: nextId++, inbox_id: body.inbox_id, contact_id: body.contact_id, status: 'open' }; conversations.push(c); return json(200, c); }
    m = path.match(/^\/conversations\/(\d+)\/messages$/);
    if (m) return json(200, { id: nextId++ });
    return json(404, {});
  };
  return { calls, fetchImpl, contacts, conversations };
}
const make = f => OTP.messagePro({ token: 'tok', accountId: 129, inboxId: 147, fetchImpl: f.fetchImpl });

test('messagepro: new number -> creates contact + conversation, sends code as text', async () => {
  const f = fakePlatform();
  await make(f)('01012345678', '123456');
  const seq = f.calls.map(c => c.method + ' ' + c.path);
  assert.deepEqual(seq, ['GET /contacts/search', 'POST /contacts', 'GET /contacts/500/conversations', 'POST /conversations', 'POST /conversations/501/messages']);
  assert.equal(f.calls[1].body.phone_number, '+201012345678');
  assert.deepEqual(f.calls[3].body, { inbox_id: 147, contact_id: 500, source_id: '201012345678' });
  const msg = f.calls[4].body;
  assert.equal(msg.message_type, 'outgoing'); assert.equal(msg.private, false);
  assert.match(msg.content, /123456/);
  assert.equal(f.calls[0].headers.api_access_token, 'tok');
});

test('messagepro: existing contact with open WhatsApp conversation is reused', async () => {
  const f = fakePlatform({
    contacts: [{ id: 7, phone_number: '+201012345678' }],
    conversations: [{ id: 30, inbox_id: 147, contact_id: 7, status: 'open' }, { id: 31, inbox_id: 152, contact_id: 7, status: 'open' }, { id: 29, inbox_id: 147, contact_id: 7, status: 'resolved' }],
  });
  await make(f)('01012345678', '654321');
  assert.deepEqual(f.calls.map(c => c.method + ' ' + c.path), ['GET /contacts/search', 'GET /contacts/7/conversations', 'POST /conversations/30/messages']);
});

test('messagepro: platform error rejects (server answers 502, no code leaks)', async () => {
  const f = fakePlatform({ fail: { '/contacts/search': 401 } });
  await assert.rejects(make(f)('01012345678', '111111'), /messagepro search 401/);
});

test('fromEnv: messagepro needs its settings; production refuses the dev stub', () => {
  assert.throws(() => OTP.fromEnv({ WHATSAPP_PROVIDER: 'messagepro' }), /required/);
  assert.equal(typeof OTP.fromEnv({ WHATSAPP_PROVIDER: 'messagepro', MESSAGEPRO_TOKEN: 'x', MESSAGEPRO_ACCOUNT_ID: '129', MESSAGEPRO_INBOX_ID: '147' }), 'function');
  assert.throws(() => OTP.fromEnv({ NODE_ENV: 'production' }), /WHATSAPP_PROVIDER/);
  assert.equal(typeof OTP.fromEnv({}), 'function');
});
