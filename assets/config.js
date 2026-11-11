/*
 * Sequoia — shared front-end settings, loaded first by the menu (index.html) and the
 * captain screen. Change values here only; every page reads them from window.SEQUOIA_CONFIG.
 */
(function () {
  'use strict';
  window.SEQUOIA_CONFIG = Object.freeze({
    // Google review link: used by the in-app review invite, the WhatsApp message and the QR code.
    GOOGLE_REVIEW_URL: 'https://g.page/r/CdlSTIN6djjmEBE/review'
  });
})();
