/* One-time Message Pro setup page. The link carries a one-use code in the #fragment (never sent in URLs
 * or logs); the token and webhook secret go straight from this form to /api/setup/messagepro. */
(function () {
  'use strict';
  var code = location.hash.slice(1);
  try { history.replaceState(null, '', location.pathname); } catch (_) {} // drop the code from the address bar
  var f = document.getElementById('f'), msg = document.getElementById('msg'), go = document.getElementById('go');
  var ERR = {
    link: 'الرابط ده اتستخدم قبل كده أو خلص وقته. اطلب رابط جديد.',
    token: 'التوكن شكله مش صح. انسخه تاني من Developer API.',
    secret: 'سر الـ Webhook شكله مش صح. انسخه تاني.',
    'token-rejected': 'Message Pro رفض التوكن. اعمل توكن جديد وجرّب تاني.',
    platform: 'مقدرناش نوصل لـ Message Pro دلوقتي. جرّب كمان شوية.',
    rate: 'محاولات كتير. استنى ساعة وجرّب تاني.'
  };
  function say(t, ok) { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'err'); }
  if (!code) { say(ERR.link); go.disabled = true; return; }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var token = document.getElementById('token').value.trim(), secret = document.getElementById('secret').value.trim();
    if (!token) { say('اكتب التوكن الأول.'); return; }
    go.disabled = true; say('بنتأكد من التوكن…', true);
    fetch('/api/setup/messagepro', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sequoia' },
      body: JSON.stringify({ code: code, token: token, webhookSecret: secret })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); })
      .then(function (j) {
        if (j.status === 200 && j.ok) {
          f.hidden = true; document.getElementById('done').hidden = false;
          document.getElementById('doneText').textContent = j.whatsappMessage
            ? 'كود الدخول بقى بيتبعت على واتساب، والدخول برسالة واتساب اشتغل كمان.'
            : 'كود الدخول بقى بيتبعت على واتساب.';
          code = '';
          return;
        }
        go.disabled = j.error === 'link';
        say(ERR[j.error] || 'حصل خطأ. جرّب تاني.');
      }, function () { go.disabled = false; say('مفيش اتصال. جرّب تاني.'); });
  });
})();
