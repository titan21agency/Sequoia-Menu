// OTP delivery behind one interface: sendOtp(phone, code) -> Promise.
// Set WHATSAPP_PROVIDER=meta + WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_TEMPLATE to send for real.
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

function devStub(log = console.log) {
  return async (phone, code) => log(`[otp:dev] ${phone} -> ${code}`);
}

function fromEnv(env = process.env) {
  if (env.WHATSAPP_PROVIDER === 'meta')
    return metaCloud({ token: env.WHATSAPP_TOKEN, phoneId: env.WHATSAPP_PHONE_ID, template: env.WHATSAPP_TEMPLATE || 'sequoia_otp' });
  return devStub();
}
module.exports = { fromEnv, devStub, metaCloud };
