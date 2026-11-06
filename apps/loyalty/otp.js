// OTP delivery behind one interface: sendOtp(phone, code) -> Promise.
// Set WHATSAPP_PROVIDER=messagepro + MESSAGEPRO_TOKEN + MESSAGEPRO_ACCOUNT_ID + MESSAGEPRO_INBOX_ID to send through
// our omnichannel platform, or WHATSAPP_PROVIDER=meta + WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_TEMPLATE for Meta.
// Otherwise the dev stub logs the code on the SERVER console only. The code is never sent to the browser.
'use strict';

function metaCloud({ token, phoneId, template, lang = 'ar' }) {
  return async (phone, code) => {
    const to = '20' + phone.slice(1); // 01XXXXXXXXX -> 201XXXXXXXXX
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: template, language: { code: lang }, components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] },
      }),
    });
    if (!r.ok) throw new Error('whatsapp ' + r.status);
  };
}

// Message Pro (our omnichannel platform, Chatwoot-based). The Sequoia WhatsApp channel there is a
// WhatsApp Web ("Browser WhatsApp") session, not Meta Cloud, so there are no templates: we find or create
// the contact, reuse its open conversation in the WhatsApp inbox (or create one), then post a text message.
// Docs: https://omni.message-pro.com/docs . Auth header: api_access_token (account-level token).
function messagePro({ token, accountId, inboxId, base = 'https://omni.message-pro.com', fetchImpl = fetch, text = defaultText }) {
  if (!token || !accountId || !inboxId) throw new Error('messagepro: MESSAGEPRO_TOKEN, MESSAGEPRO_ACCOUNT_ID and MESSAGEPRO_INBOX_ID are required');
  const root = `${base}/api/v1/accounts/${encodeURIComponent(accountId)}`;
  const inbox = Number(inboxId);
  async function call(method, path, body) {
    const r = await fetchImpl(root + path, {
      method,
      headers: { api_access_token: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }
  const list = j => (Array.isArray(j?.payload) ? j.payload : Array.isArray(j) ? j : []);

  async function findContact(e164) {
    const r = await call('GET', '/contacts/search?include_contacts=true&q=' + encodeURIComponent(e164.slice(1)));
    if (!r.ok) throw new Error('messagepro search ' + r.status);
    return list(r.j).find(c => String(c.phone_number || '').replace(/\D/g, '') === e164.slice(1)) || null;
  }
  async function contactId(e164) {
    const found = await findContact(e164);
    if (found) return found.id;
    const r = await call('POST', '/contacts', { name: e164, phone_number: e164 });
    if (r.ok) return (r.j.payload?.contact || r.j.payload || r.j).id;
    if (r.status === 422) { const again = await findContact(e164); if (again) return again.id; } // created in parallel
    throw new Error('messagepro contact ' + r.status);
  }
  async function conversationId(cid, e164) {
    const r = await call('GET', `/contacts/${cid}/conversations`);
    if (r.ok) {
      const open = list(r.j).filter(c => c.inbox_id === inbox && c.status !== 'resolved').sort((a, b) => b.id - a.id)[0];
      if (open) return open.id;
    }
    const n = await call('POST', '/conversations', { inbox_id: inbox, contact_id: cid, source_id: e164.slice(1) });
    if (!n.ok) throw new Error('messagepro conversation ' + n.status);
    return n.j.id ?? n.j.payload?.id;
  }

  return async (phone, code) => {
    const e164 = '+20' + phone.slice(1); // 01XXXXXXXXX -> +201XXXXXXXXX
    const cid = await contactId(e164);
    const conv = await conversationId(cid, e164);
    const m = await call('POST', `/conversations/${conv}/messages`, { content: text(code), message_type: 'outgoing', private: false, content_type: 'text' });
    if (!m.ok) throw new Error('messagepro message ' + m.status);
  };
}
const defaultText = code => `كود الدخول لكارت سيكويا: ${code}\nصالح لمدة 5 دقايق. متديش الكود لحد، حتى لو قال إنه من سيكويا.`;

function devStub(log = console.log) {
  return async (phone, code) => log(`[otp:dev] ${phone} -> ${code}`);
}

function fromEnv(env = process.env) {
  if (env.WHATSAPP_PROVIDER === 'meta')
    return metaCloud({ token: env.WHATSAPP_TOKEN, phoneId: env.WHATSAPP_PHONE_ID, template: env.WHATSAPP_TEMPLATE || 'sequoia_otp' });
  if (env.WHATSAPP_PROVIDER === 'messagepro')
    return messagePro({ token: env.MESSAGEPRO_TOKEN, accountId: env.MESSAGEPRO_ACCOUNT_ID, inboxId: env.MESSAGEPRO_INBOX_ID, base: env.MESSAGEPRO_BASE || undefined });
  if (env.NODE_ENV === 'production') throw new Error('otp: set WHATSAPP_PROVIDER in production (dev stub would only log codes)');
  return devStub();
}
module.exports = { fromEnv, devStub, metaCloud, messagePro };
