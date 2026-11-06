'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules');
const base = { STAMPS_REQUIRED: 6, MIN_HOURS_BETWEEN_STAMPS: 3, STAMP_EXPIRY_DAYS: null };
const H = 3600e3, DAY = 24 * H, T0 = 1_800_000_000_000;
const st = (n, cycle = 1, gap = 4 * H) => Array.from({ length: n }, (_, i) => ({ created_at: T0 + i * gap, cycle_id: cycle }));

test('counts stamps of the current cycle only', () => {
  const s = [...st(2, 1), ...st(3, 2, 5 * H).map(x => ({ ...x, created_at: x.created_at + 30 * DAY }))];
  const c = R.cardState(s, 2, T0 + 60 * DAY, base);
  assert.equal(c.count, 3); assert.equal(c.remaining, 3); assert.equal(c.complete, false);
});
test('cooldown blocks a second stamp within MIN_HOURS', () => {
  const c = R.cardState(st(1), 1, T0 + 2 * H, base);
  assert.equal(R.stampBlock(c), 'too_soon');
  assert.equal(R.stampBlock(R.cardState(st(1), 1, T0 + 3 * H, base)), null);
});
test('completion at STAMPS_REQUIRED, full card blocks stamping, allows redeem', () => {
  const c = R.cardState(st(6), 1, T0 + 100 * H, base);
  assert.equal(c.complete, true); assert.equal(c.slots.length, 6);
  assert.equal(R.stampBlock(c), 'card_full'); assert.equal(R.redeemBlock(c), null);
  assert.equal(R.redeemBlock(R.cardState(st(5), 1, T0 + 100 * H, base)), 'not_full');
});
test('new cycle starts empty', () => {
  const c = R.cardState(st(6, 1), 2, T0 + 100 * H, base);
  assert.equal(c.count, 0); assert.equal(c.complete, false);
});
test('expiry ignored when null, applied when set', () => {
  const s = st(3, 1, DAY);
  assert.equal(R.cardState(s, 1, T0 + 40 * DAY, base).count, 3);
  assert.equal(R.cardState(s, 1, T0 + 31.5 * DAY, { ...base, STAMP_EXPIRY_DAYS: 30 }).count, 1);
});
test('phone normalization and masking', () => {
  for (const v of ['01012345678', '+201012345678', '00201012345678', '1012345678', '010 1234 5678', '٠١٠١٢٣٤٥٦٧٨']) assert.equal(R.normalizePhone(v), '01012345678', v);
  for (const v of ['0101234567', '01312345678', 'abc', '', null, '0201012345678']) assert.equal(R.normalizePhone(v), null, String(v));
  assert.equal(R.maskPhone('01012345678'), '010•••••678');
});
