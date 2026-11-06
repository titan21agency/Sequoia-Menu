// Sequoia Card — business rules. Change these here only (owner to confirm the placeholders).
'use strict';
module.exports = Object.freeze({
  STAMPS_REQUIRED: 6,                    // placeholder — owner will confirm
  REWARD_NAME: 'مشروبك المميز علينا',     // placeholder
  MIN_HOURS_BETWEEN_STAMPS: 3,           // blocks double-stamping the same visit
  STAMP_EXPIRY_DAYS: null,               // null = stamps never expire; a number = stamps older than this don't count

  // OTP / sessions
  OTP_TTL_MIN: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_SEC: 60,
  OTP_MAX_PER_PHONE_HOUR: 5,
  OTP_MAX_PER_IP_HOUR: 15,
  CUSTOMER_SESSION_DAYS: 180,
  STAFF_SESSION_HOURS: 12,
});
