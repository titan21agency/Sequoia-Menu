/* Registers sw.js (offline copy of the menu). Not on localhost unless ?sw=1, so local testing stays fresh. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local && !/[?&]sw=1\b/.test(location.search)) return;
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
