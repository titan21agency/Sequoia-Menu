/*
 * Sequoia table calls — shared transport for the menu (index.html) and the
 * captain screen (captain.html).
 *
 * Uses our own API (apps/loyalty/server.js, same origin under /api):
 *  - the menu posts call / bill / req to /api/calls with the table's QR signature (?t=7&s=...);
 *  - the captain screen (staff login) posts took / undo to /api/staff/calls and listens on
 *    /api/staff/calls/stream, which replays the last 12 h on connect.
 * Nothing goes to a third-party service, and only signed-in staff can read the calls.
 * Same publish() / subscribe() shape as before, so the pages did not change.
 */
(function () {
  'use strict';

  var API = '/api';
  var STAFF_TYPES = { took: 1, undo: 1 };
  var qs = /[?&]s=([A-Za-z0-9_-]{12})(?:&|$)/.exec(location.search);
  var TABLE_SIG = qs ? qs[1] : '';

  function publish(obj) {
    var staff = STAFF_TYPES[obj.type];
    var body = staff ? obj : Object.assign({ s: TABLE_SIG }, obj);
    return fetch(API + (staff ? '/staff/calls' : '/calls'), {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(function () { return {}; });
    });
  }

  // onMessage(payloadObject, {id, time(ms), replay:boolean})
  // onStatus('live' | 'connecting')
  function subscribe(onMessage, onStatus) {
    var es, seen = {}, startedAt = Date.now(), retry = 0, closed = false;

    function connect() {
      if (closed) return;
      onStatus && onStatus('connecting');
      es = new EventSource(API + '/staff/calls/stream');
      es.onopen = function () { retry = 0; onStatus && onStatus('live'); };
      es.addEventListener('msg', function (e) {
        var m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        if (!m || seen[m.id] || !m.body || typeof m.body !== 'object') return;
        seen[m.id] = 1;
        var time = m.time || 0;
        onMessage(m.body, { id: m.id, time: time, replay: time < startedAt - 5000 });
      });
      es.onerror = function () {
        onStatus && onStatus('connecting');
        if (es.readyState === 2) { // CLOSED: browser gave up (or our staff session ended)
          es.close();
          fetch(API + '/staff/me', { credentials: 'same-origin' }).then(function (r) {
            if (r.status === 401 && window.SequoiaOrders.onLoggedOut) { closed = true; return window.SequoiaOrders.onLoggedOut(); }
            setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++)));
          }, function () { setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++))); });
        }
      };
    }
    connect();
    return function unsubscribe() { closed = true; if (es) es.close(); };
  }

  // Handled requests go to the Google report sheet through our server (staff session + a token the
  // browser never sees). The sheet URL and token live only in the server env (REPORT_SHEET_URL / _TOKEN).
  var REPORT_URL = API + '/staff/report';

  window.SequoiaOrders = { publish: publish, subscribe: subscribe, reportUrl: REPORT_URL };
})();
