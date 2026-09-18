/* A courtesy may fail. It may not fail in secret.
 *
 * F-0043 was reported as "the email does not reach the challenged pilot", and
 * the reason it could not be answered from the repository is that the send was
 * wrapped in a catch that recorded nothing. Five explanations fitted the
 * evidence equally well — the URL call throwing, the day's quota spent, an
 * address refused, a message accepted and filtered, the send never reached — and
 * no amount of reading could eliminate one of them, because doing nothing and
 * succeeding produced the same observable.
 *
 * What this file guards is therefore not "the mail arrives" — no test on this
 * side of the wire can claim that — but that when it does not, something says
 * so: a returned outcome, a record, and a line on the screen of the pilot who
 * was told "Challenge sent".
 */
const fs = require('fs');
const G  = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The sender, bounded by its own closing brace at column zero. */
const mail = (G.match(/function _gamMailChallenge_[\s\S]*?\n\}\n/) || [''])[0];
const submit = (G.match(/function submitChallengeResult[\s\S]*?\n\}\n/) || [''])[0];

console.log('--- the send reports what happened ---');
ok('_gamMailChallenge_ exists', mail !== '');
ok('and no longer swallows the failure', mail !== '' && !/catch \(mailErr\) \{\s*(\/\/[^\n]*\n\s*)*\}/.test(mail));
ok('it returns an outcome when the send throws',
   /catch \(mailErr\)[\s\S]*?return \{ sent: false/.test(mail));
ok('and one when it does not', /return \{ sent: true/.test(mail));
ok('an address it cannot send to is its own answer, not an exception',
   /if \(!to\)[\s\S]*?return \{ sent: false/.test(mail));

console.log('--- the quota is read either side, because it separates the answers ---');
ok('there is a guarded reader', /function _gamMailQuota_\(\)[\s\S]*?catch \(e\) \{ return null; \}/.test(G));
ok('and both outcomes carry before and after',
   (mail.match(/quotaBefore/g) || []).length >= 3 && (mail.match(/quotaAfter/g) || []).length >= 2);

console.log('--- the call that could throw is guarded ---');
/* Userservice wraps this same call in two places. Here it sat unprotected inside
 * the message body, where a throw abandons the mail before MailApp sees it. */
ok('getService().getUrl() is inside its own try',
   /try \{ appUrl = String\(ScriptApp\.getService\(\)\.getUrl\(\) \|\| ''\); \} catch/.test(mail));
ok('it falls back to where the app is actually served from',
   /if \(!appUrl\) \{ try \{ appUrl = appBaseUrl_\(\)/.test(mail));
ok('and the message body no longer calls it inline',
   mail !== '' && !/href="' \+ ScriptApp\.getService/.test(mail));

console.log('--- the result carries it back to the client ---');
ok('submitChallengeResult declares the field rather than growing it on a branch',
   /notified:\s*null/.test(submit));
ok('and its companion', /notifyWhy:\s*''/.test(submit));
ok('the challenger side records what the send said',
   /var mail = _gamMailChallenge_\(row, user, correct\);[\s\S]{0,200}result\.notified\s*=\s*mail\.sent === true/.test(submit));

console.log('--- and the pilot is told ---');
ok('the panel tests for false, not for falsiness',
   /if \(r\.notified === false\)/.test(S));
ok('it says the duel is not lost with it',
   /could not email your opponent[\s\S]{0,200}Crew tab/.test(S));
ok('the technical reason goes to the developer channel, not the panel',
   /_reportClientError\('duel-notify'/.test(S));
ok('and notifyWhy is never written into the markup',
   !/gam-duel-warn[^\n]*notifyWhy/.test(S) && !/'\s*\+\s*r\.notifyWhy\s*\+\s*'/.test(S));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll challenge-notify assertions passed.');
process.exit(fails ? 1 : 0);
