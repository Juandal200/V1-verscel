/* TICKETS.md is the auditable baseline the last audit did not have.
 *
 * Audit #2 returned CANNOT VERIFY for 20 of 35 tickets, for one reason: the
 * ticket text lived only in the Telegram bot, so there was nothing to check the
 * code against. "Is this still true?" has no answer when the requirement cannot
 * be read. This file is that requirement, and these assertions are what keep it
 * usable — a ledger with a missing Done when is the same problem again.
 *
 * The load-bearing field is `Done when`, and its tag matters as much as its
 * text: DERIVED means Claude inferred the condition from a defect description,
 * so it is an assumption and can be wrong. That distinction must survive. */
'use strict';
const fs = require('fs');
const T = fs.readFileSync(__dirname + '/../TICKETS.md', 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

const HEADING = /^## ((?:F|I|D|T)-\d+[ab]?) — (.+)$/;
const lines = T.split('\n');

// Every heading, so a malformed ticket cannot hide by not matching the pattern.
const allHeadings = lines.filter(l => l.startsWith('## '));
const ticketish   = allHeadings.filter(l => /^## [FIDT]-/.test(l));
const prose       = allHeadings.filter(l => !/^## [FIDT]-/.test(l));

console.log('\nTICKETS.md — the enumeration\n');
ok('the file exists and has headings', allHeadings.length > 0);
ok('every ticket-shaped heading matches the pattern',
   ticketish.every(h => HEADING.test(h)),
   ticketish.filter(h => !HEADING.test(h)).join(' | '));
console.log('    ' + prose.length + ' prose sections: ' + prose.map(p => p.slice(3)).join(', '));

// Split into blocks so each ticket is checked on its own text.
const blocks = [];
lines.forEach((l, i) => {
  const m = l.match(HEADING);
  if (m) blocks.push({ id: m[1], title: m[2], start: i, body: [] });
  else if (blocks.length) blocks[blocks.length - 1].body.push(l);
});
/* A block ends at the next heading of ANY level. Splitting only on '## ' let
 * the last numbered ticket swallow the '# Decisions' intro below it, which
 * mentions `STATED` — so that ticket appeared to carry two kind tags. */
blocks.forEach(b => {
  const out = [];
  for (const l of b.body) { if (/^#{1,6} /.test(l)) break; out.push(l); }
  b.text = out.join('\n');
});

console.log('\nevery ticket carries the fields an audit needs:');
const noDone   = blocks.filter(b => !/^\*\*Done when\*\* /m.test(b.text));
const noStatus = blocks.filter(b => !/^\*\*Status\*\* /m.test(b.text));
const noSource = blocks.filter(b => !/^\*\*Source\*\* /m.test(b.text));
ok(blocks.length + ' tickets, all with a Done when', noDone.length === 0, noDone.map(b => b.id).join(' '));
ok(blocks.length + ' tickets, all with a Status',    noStatus.length === 0, noStatus.map(b => b.id).join(' '));
ok(blocks.length + ' tickets, all with a Source',    noSource.length === 0, noSource.map(b => b.id).join(' '));

console.log('\nevery Done when is tagged with where it came from:');
const KINDS = ['STATED', 'DERIVED', 'UNDERIVABLE'];
const untagged = blocks.filter(b => !KINDS.some(k => b.text.includes('**Done when** `' + k + '`')));
ok('all tagged STATED / DERIVED / UNDERIVABLE', untagged.length === 0, untagged.map(b => b.id).join(' '));
// An UNDERIVABLE ticket must NOT also carry an invented condition.
const bogus = blocks.filter(b => /\*\*Done when\*\* `UNDERIVABLE`[^\n]*\S/.test(b.text));
ok('and nothing marked UNDERIVABLE smuggles a condition in anyway',
   bogus.length === 0, bogus.map(b => b.id).join(' '));

console.log('\nevery Status uses the agreed vocabulary:');
/* SHAs are written in backticks in the file, which the first version of this
 * regex did not allow — it failed twelve tickets that were correctly formed.
 * A checker that rejects the right answer is as useless as one that accepts
 * the wrong one. */
const STATUS = /^\*\*Status\*\* (Open\b|Fixed `?[0-9a-f]{7,40}`?|Fixed\b|Accepted —|Superseded by [FIDT]-\d)/m;
const badStatus = blocks.filter(b => !STATUS.test(b.text));
ok('Open / Fixed <sha> / Fixed — <why> / Accepted — <reason> / Superseded by <ID>',
   badStatus.length === 0,
   badStatus.map(b => b.id + ': ' + ((b.text.match(/^\*\*Status\*\* (.*)$/m) || [])[1] || '').slice(0, 42)).join(' | '));

console.log('\nno ticket restates KNOWN_ISSUES — it links:');
const K = fs.readFileSync(__dirname + '/../KNOWN_ISSUES.md', 'utf8');
const refs = blocks.filter(b => /KNOWN_ISSUES/.test(b.text));
ok(refs.length + ' tickets point at KNOWN_ISSUES', refs.length > 0);
// A link must name a section that is actually there.
const missing = [];
refs.forEach(b => {
  const q = b.text.match(/KNOWN_ISSUES[^"]*?"([^"]+)"/);
  if (q && !K.includes(q[1])) missing.push(b.id + ' -> "' + q[1] + '"');
});
ok('and every quoted section title exists there', missing.length === 0, missing.join(' | '));

console.log('\nprovenance is recorded on every ticket:');
// F-0018 came from no report — that IS its finding, so it carries R-0000.
const badSrc = blocks.filter(b => !/\*\*Source\*\* R-\d{4}/.test(b.text));
ok('each names the meeting report it came from', badSrc.length === 0, badSrc.map(b => b.id).join(' '));
const decisions = blocks.filter(b => /^D-\d/.test(b.id));
ok('and every decision is marked as a decision, not a defect report',
   decisions.every(b => /origin: a decision, not a defect report/.test(b.text)),
   decisions.filter(b => !/origin: a decision/.test(b.text)).map(b => b.id).join(' '));

console.log('\nthe two split halves of F-0017 both say they share a bot ID:');
['F-0017a', 'F-0017b'].forEach(id => {
  const b = blocks.find(x => x.id === id);
  ok(id + ' exists', !!b);
  if (b) ok(id + ' records that the bot has one ID for both', /bot ID|single ticket|Same bot ID/i.test(b.text));
});

console.log('\nno duplicate ids:');
const ids = blocks.map(b => b.id);
ok(ids.length + ' ids, all distinct', new Set(ids).size === ids.length,
   ids.filter((v, i) => ids.indexOf(v) !== i).join(' '));

console.log('\ncounts:');
const by = k => blocks.filter(b => new RegExp('`' + k + '`').test(b.text)).length;
console.log('    STATED      ' + by('STATED'));
console.log('    DERIVED     ' + by('DERIVED'));
console.log('    UNDERIVABLE ' + by('UNDERIVABLE'));
console.log('    total       ' + blocks.length);
ok('the three kinds account for every ticket',
   by('STATED') + by('DERIVED') + by('UNDERIVABLE') === blocks.length,
   by('STATED') + '+' + by('DERIVED') + '+' + by('UNDERIVABLE') + ' vs ' + blocks.length);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
