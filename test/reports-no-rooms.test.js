/* No rooms, no module section in the reports.
 *
 * With the modules withdrawn, every progress report still printed the whole
 * section: a heading, tiles reading 0 and 0%, four skill averages reading "—",
 * and an empty table under a full set of headers.
 *
 * The tiles are the part that matters. "Overall Progress" is completedCount over
 * mods.length — module progress wearing a general name — and a student reading
 * "Overall Progress: 0%" takes it as their progress. On paper, without the
 * context that explains it, it reads as someone who has done nothing. Absent is
 * truthful; zero is not.
 *
 * Run, not grepped: three separate renderers had to agree, and a grep proves
 * nothing about which branch a given input takes.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

const MODULES = [
  { moduleId: 'M1', title: 'Weather', topic: 'weather', completed: true,
    quizBest: 90, grammarBest: 80, listeningBest: 70, evalBest: 88 },
  { moduleId: 'M2', title: 'Engineering', topic: 'eng', completed: false,
    quizBest: null, grammarBest: null, listeningBest: null, evalBest: null },
];

/* One sandbox, three renderers. _downloadProgressPdf reads a module-scope
 * variable rather than an argument, so it is lifted alongside the setter. */
function lift(names, extra) {
  const captured = { html: '' };
  const stubs = {
    byId: () => ({ set innerHTML(v) { captured.html = v; }, get innerHTML() { return captured.html; } }),
    safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
    uiIcon: () => '', uiIconInline: () => '',
    _openReportWindow: (html) => { captured.html = html; },
    _formatTimeSec: () => '1h 0m',
    window: { _gToast: () => {} },
    document: { createElement: () => ({ style: {}, setAttribute() {} }) },
    Date, Math, Number, String, Object, JSON, console, Array,
  };
  Object.assign(stubs, extra || {});
  const src = names.map(grab).join('\n') +
    '\nreturn { ' + names.map(n => n.match(/function (\w+)/)[1] + ': ' + n.match(/function (\w+)/)[1]).join(', ') + ' };';
  const api = new Function(...Object.keys(stubs), 'var _lastProgressReportData = null;\n' + src)(...Object.values(stubs));
  return { api, captured };
}

console.log('--- the report on screen ---');
const screen = lift(['function _renderProgressReport(res, backFnOrBool)']);
function onScreen(mods) {
  screen.api._renderProgressReport({ userName: 'Ana', totalActiveSeconds: 3600, modules: mods }, false);
  return screen.captured.html;
}
const withRooms = onScreen(MODULES);
ok('with rooms on, the module tiles are there', /Modules Completed/.test(withRooms));
ok('and Overall Progress',                      /Overall Progress/.test(withRooms));
ok('and the module table',                      /<th[^>]*>Module</.test(withRooms));

const noRooms = onScreen([]);
ok('with rooms off, no Modules Completed tile', !/Modules Completed/.test(noRooms));
/* The one that would read as a lie. */
ok('and no Overall Progress tile',              !/Overall Progress/.test(noRooms));
ok('no module table',                           !/<th[^>]*>Module</.test(noRooms));
ok('and no "No modules available" row either',  !/No modules available/.test(noRooms));
/* What must survive: the report is shorter, not gone. */
ok('Total Active Time is still reported',       /Total Active Time/.test(noRooms));
ok('and the download button still offered',     /_downloadProgressPdf/.test(noRooms));

console.log('--- and the same on paper ---');
/* Both PDFs, because three renderers had to agree and two of them are printed —
 * read without the screen's context, which is where a stray 0% does most harm. */
['function _downloadProgressPdf()'].forEach(function (sig) {
  const pdf = lift([sig], {});
  // the module-scope variable the printer reads
  const run = (mods) => {
    const f = new Function('byId','safeText','uiIcon','uiIconInline','_openReportWindow','_formatTimeSec','_reportClientError','REPORT_TOKENS','window','document','Date','Math','Number','String','Object','JSON','console','Array','DATA',
      'var _lastProgressReportData = DATA;\n' + grab(sig) + '\nreturn _downloadProgressPdf;');
    let html = '', thrown = null;
    /* The printer wraps itself in try/catch and reports through
     * _reportClientError. Stubbed to RETHROW: swallowing it here would turn a
     * broken renderer into an empty string and every assertion below into a pass
     * about nothing. */
    f(() => ({}), v => String(v == null ? '' : v), () => '', () => '',
      (h) => { html = h; }, () => '1h', (src, e) => { thrown = e; },
      /* The report's palette is a CSS string and none of these assertions are
       * about colour, so a placeholder is honest here. */
      ':root{}',
      { _gToast(){} }, { createElement: () => ({ style: {} }) },
      Date, Math, Number, String, Object, JSON, console, Array,
      { userName: 'Ana', totalActiveSeconds: 3600, modules: mods })();
    if (thrown) throw thrown;
    return html;
  };
  const on  = run(MODULES);
  const off = run([]);
  ok('the PDF prints modules when there are some', /Modules Completed/.test(on));
  ok('and prints none when there are none',        !/Modules Completed/.test(off));
  ok('no printed Overall Progress either',         !/Overall Progress/.test(off));
  ok('and no empty module table',                  !/<th>Module</.test(off));
  ok('but Active Time still prints',               /Active Time/.test(off));
});

console.log('--- the unified PDF drops the whole section ---');
/* Not just its table: the heading, three cards and four skill averages reading
 * "—" all went with it. */
const unified = grab('function _downloadUnifiedProgressPdf()');
ok('the Course Modules section is conditional',
   /\(mods\.length \? \(\s*\n\s*'<div class="section">' \+\s*\n\s*'<h2>Course Modules<\/h2>'/.test(unified));
ok('and its table is no longer separately guarded',
   !/\(mods\.length \? '<table>'/.test(unified));

console.log('--- and it all comes back when a room does ---');
ok('nothing is deleted, only branched',
   /Modules Completed/.test(S) && /Overall Progress/.test(S) && /Course Modules/.test(S));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll report assertions passed.');
process.exit(fails ? 1 : 0);
