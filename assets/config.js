/*
 * Sequoia — shared front-end settings, loaded first by the menu (index.html) and the
 * captain screen. Change values here only; every page reads them from window.SEQUOIA_CONFIG.
 */
(function () {
  'use strict';
  window.SEQUOIA_CONFIG = Object.freeze({
    // Google review link: used by the in-app review invite, the WhatsApp message and the QR code.
    GOOGLE_REVIEW_URL: 'https://g.page/r/CdlSTIN6djjmEBE/review',

    // Social links at the bottom of the cover page. An empty link hides its icon.
    INSTAGRAM_URL: 'https://www.instagram.com/sequoiacafe.eg',
    FACEBOOK_URL: 'https://www.facebook.com/share/1F9akPHx5p/',
    TIKTOK_URL: 'https://www.tiktok.com/@sequoia.cafe',
    WHATSAPP_URL: 'https://wa.me/201044401212'   // wa.me format: 20 + the number without its leading 0
  });
})();
