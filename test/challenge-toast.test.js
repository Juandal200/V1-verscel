/* The confirmation names the pilot, and cannot name null.
 *
 * `_gamCloseModal()` sets `_gam.targetEmail` and `_gam.targetName` to null — that is
 * its job, it clears the modal. `_gamSendChallenge` called it and then built the
 * toast out of those same two fields, three lines later, so the message read
 * "Challenge sent to null!" every single time a challenge was sent (F-0028).
 *
 * The fallback is what proves the ordering was the cause rather than missing data:
 * with `data-name` absent the toast would have shown the email, and with
 * `data-email` absent the guard at the top of the send would have refused to send
 * at all. Reaching the toast AND printing the word null needs both fields cleared
 * between the send and the message, and only the close does that.
 *
 * So this checks the ORDER, not the text. Capturing the name before the close and
 * using the server's own message both satisfy it; reintroducing the read does not.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The SUCCESS HANDLER, not the whole send function.
 *
 * The boundary matters and the first version of this suite got it wrong: it
 * bounded the window at the next sibling function, which swept in the trailing
 * `.sendChallenge(AppState.sessionToken, _gam.targetEmail, ...)`. That argument
 * sits textually below the close and is read ABOVE it in time — it is evaluated
 * when the call is made, before any handler runs — so the wider window reported a
 * third violation that is not one, and acting on it would have broken the send.
 *
 * The handler runs later, against whatever the state holds by then. That is the
 * region where reading cleared state is a defect, so that is the region checked. */
const start = S.indexOf('function _gamSendChallenge()');
ok('_gamSendChallenge is in the source', start !== -1);
const fn    = S.slice(start, start + 4000);
const hs    = fn.indexOf('.withSuccessHandler(');
const he    = fn.indexOf('.withFailureHandler(');
ok('the send has a success handler, and a failure handler after it',
   hs !== -1 && he !== -1 && he > hs);
const body  = (hs === -1 || he === -1) ? '' : fn.slice(hs, he);

console.log('--- the modal close is what clears the target ---');
const closeStart = S.indexOf('function _gamCloseModal()');
const closeBody  = S.slice(closeStart, closeStart + 400);
/* Stated as a premise, not as a style rule: if the close ever stops clearing these,
 * the invariant below is no longer load-bearing and somebody should know. */
ok('_gamCloseModal clears targetEmail and targetName',
   /_gam\.targetEmail\s*=\s*null/.test(closeBody) && /_gam\.targetName\s*=\s*null/.test(closeBody));

console.log('--- nothing reads the cleared target after the close ---');
const closeCall = body.indexOf('_gamCloseModal()');
ok('the send handler closes the modal', closeCall !== -1);
const after = closeCall === -1 ? '' : body.slice(closeCall);
const late  = [...after.matchAll(/_gam\.(targetName|targetEmail)/g)].map(m => m[0]);
ok('no read of _gam.target* after _gamCloseModal()', late.length === 0,
   late.length + ' found: ' + late.join(', '));

console.log('--- the confirmation still names someone ---');
const toast = (body.match(/_gToast\((?:[^()]|\([^()]*\))*Challenge sent to(?:[^()]|\([^()]*\))*\)/) || [''])[0];
ok('a "Challenge sent to" confirmation exists', toast !== '');
ok('the confirmation does not interpolate the word null',
   toast !== '' && !/\bnull\b/.test(toast), toast.slice(0, 120));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll challenge-toast assertions passed.');
process.exit(fails ? 1 : 0);
