// Pure loyalty rules (no DB) — unit tested in test/rules.test.js
'use strict';
const HOUR = 3600e3, DAY = 24 * HOUR;

// Stamps that count toward the current card: same cycle and not expired.
function activeStamps(stamps, cycle, now, cfg) {
  return stamps.filter(s => s.cycle_id === cycle &&
    (cfg.STAMP_EXPIRY_DAYS == null || now - s.created_at < cfg.STAMP_EXPIRY_DAYS * DAY));
}

function cardState(stamps, cycle, now, cfg) {
  const active = activeStamps(stamps, cycle, now, cfg).sort((a, b) => a.created_at - b.created_at);
  const count = Math.min(active.length, cfg.STAMPS_REQUIRED);
  const lastAt = stamps.reduce((m, s) => Math.max(m, s.created_at), 0);
  const nextStampAt = lastAt ? lastAt + cfg.MIN_HOURS_BETWEEN_STAMPS * HOUR : 0;
  return {
    count, required: cfg.STAMPS_REQUIRED, remaining: cfg.STAMPS_REQUIRED - count,
    complete: count >= cfg.STAMPS_REQUIRED, cycle,
    slots: active.slice(0, cfg.STAMPS_REQUIRED).map(s => s.created_at),
    nextStampAt: nextStampAt > now ? nextStampAt : 0,
  };
}

// -> null if allowed, else a reason code
function stampBlock(state) {
  if (state.complete) return 'card_full';
  if (state.nextStampAt) return 'too_soon';
  return null;
}
function redeemBlock(state) { return state.complete ? null : 'not_full'; }

// Egyptian mobile -> 01XXXXXXXXX or null. Accepts +20 / 0020 / Arabic-Indic digits / spaces.
function normalizePhone(input) {
  let s = String(input ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0)).replace(/[\s\-().]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  else if (/^20 ?1\d{9}$/.test(s)) s = '0' + s.slice(2);
  else if (/^1[0125]\d{8}$/.test(s)) s = '0' + s;
  return /^01[0125]\d{8}$/.test(s) ? s : null;
}
const maskPhone = p => p.slice(0, 3) + '•••••' + p.slice(-3);

module.exports = { cardState, stampBlock, redeemBlock, normalizePhone, maskPhone, activeStamps };
