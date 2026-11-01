/*
 * Sequoia table calls — shared transport for the menu (index.html) and the
 * captain screen (captain.html).
 *
 * Uses ntfy.sh (free, no account): the menu publishes a small JSON message to
 * a private channel, the captain iPad listens to that channel live.
 * To move to another backend later (e.g. Firebase), only this file changes:
 * keep the same publish() / subscribe() shape.
 */
(function () {
  'use strict';

  var SERVER = 'https://ntfy.sh';
  var CHANNEL = 'sequoia-dvm0qhyey0cj91tc5o'; // change to start a fresh, private channel
  var HISTORY = '12h';                        // how far back the captain screen replays on open

  function publish(obj) {
    return fetch(SERVER + '/' + CHANNEL, {
      method: 'POST',
      body: JSON.stringify(obj)
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
      es = new EventSource(SERVER + '/' + CHANNEL + '/sse?since=' + HISTORY);
      es.onopen = function () { retry = 0; onStatus && onStatus('live'); };
      es.onmessage = function (e) {
        var m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        if (!m || m.event !== 'message' || seen[m.id]) return;
        seen[m.id] = 1;
        var body;
        try { body = JSON.parse(m.message); } catch (_) { return; }
        if (!body || typeof body !== 'object') return;
        var time = (m.time || 0) * 1000;
        onMessage(body, { id: m.id, time: time, replay: time < startedAt - 5000 });
      };
      es.onerror = function () {
        onStatus && onStatus('connecting');
        if (es.readyState === 2) { // CLOSED: browser gave up, reconnect ourselves
          es.close();
          setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++)));
        }
      };
    }
    connect();
    return function unsubscribe() { closed = true; if (es) es.close(); };
  }

  // Google Sheet that keeps every handled request (set after the sheet is created)
  var REPORT_URL = 'https://script.google.com/macros/s/AKfycbwbIYBj5PVRZuEDtGFrJ2aZtDKm1ZAXPf_aClYpWcwOt644ufZDRg7mSMiMOKPntrvS7g/exec';

  window.SequoiaOrders = { publish: publish, subscribe: subscribe, reportUrl: REPORT_URL };
})();
