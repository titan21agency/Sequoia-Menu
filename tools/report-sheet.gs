/**
 * Sequoia — report sheet for the captain screen.
 * Every request the captain marks as done is added as a row in "Log".
 * "Daily" summarises each business day (starting 6 AM).
 *
 * Setup: Extensions → Apps Script in the Google Sheet → paste this → run setup() once →
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → copy the /exec URL.
 */
var HEADERS = ['business_day', 'table', 'kind', 'detail', 'requested', 'handled', 'wait_seconds', 'rid'];

function setup() {
  var ss = SpreadsheetApp.getActive();
  var log = ss.getSheetByName('Log') || ss.insertSheet('Log');
  if (log.getLastRow() === 0) log.appendRow(HEADERS);
  log.setFrozenRows(1);
  var daily = ss.getSheetByName('Daily') || ss.insertSheet('Daily');
  daily.clear();
  daily.getRange('A1').setFormula(
    '=QUERY(Log!A:G,"select A, count(B), avg(G), max(G) where A is not null group by A order by A desc ' +
    'label A \'day\', count(B) \'requests\', avg(G) \'avg wait (s)\', max(G) \'max wait (s)\'",1)');
  daily.getRange('F1').setFormula('=QUERY(Log!A:C,"select A, count(B) where A is not null group by A order by A desc pivot C",1)');
}

function businessDay_(d) {
  var x = new Date(d.getTime() - 6 * 3600 * 1000); // before 6 AM counts as the previous day
  return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    var rows = (data.rows || []).slice(0, 200);
    var log = SpreadsheetApp.getActive().getSheetByName('Log');
    var seen = {};
    var last = log.getLastRow();
    if (last > 1) log.getRange(2, 8, last - 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });
    var out = [];
    rows.forEach(function (r) {
      if (!r || !r.rid || seen[r.rid]) return;
      var req = new Date(r.requested), done = new Date(r.handled);
      if (isNaN(req) || isNaN(done)) return;
      out.push([businessDay_(req), String(r.table).slice(0, 4), String(r.kind).slice(0, 10), String(r.detail || '').slice(0, 20),
                req, done, Math.max(0, Math.round(+r.wait_seconds || 0)), String(r.rid).slice(0, 40)]);
      seen[r.rid] = 1;
    });
    if (out.length) log.getRange(log.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}
