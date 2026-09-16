/* A duel is decided by the server, and the paper carries no answers.
 *
 * This replaces challenge-toast.test.js, which guarded the ordering bug in
 * F-0028 — the toast read `_gam.targetName` after `_gamCloseModal()` had set it
 * to null. Both of those functions are gone: the modal with its scenario list
 * and its type-your-own-score box was replaced by a five-question duel. A test
 * for a code path that no longer exists passes or fails on nothing, so the
 * subject moved rather than the file being kept green out of habit.
 *
 * What is worth guarding now is different and larger. Two things decide whether
 * this feature is honest:
 *
 *   the answer never reaches the browser — if correctIndex is in the payload,
 *   the page source is the answer key and the duel is theatre;
 *
 *   the score and the clock are the server's — a result the client computes is
 *   a result the client chooses, and the tie-break is time.
 *
 * Both are structural, and both are the kind of thing that gets undone by
 * somebody adding a convenience field months from now.
 */
const fs = require('fs');
const G  = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The builder of what the pilot is sent, bounded by the next function. */
const pfp = (G.match(/function _gamPaperForPlay_[\s\S]*?\n\}\n/) || [''])[0];

console.log('--- the answer stays on the server ---');
ok('_gamPaperForPlay_ exists', pfp !== '');
ok('and never puts correctIndex in what it returns',
   pfp !== '' && !/correctIndex/.test(pfp));
/* The client must not be reading it either, whatever the server sends. */
ok('no client code reads a correctIndex off a challenge payload',
   !/_duel[\s\S]{0,4000}?correctIndex/.test(S));

console.log('--- the score is counted where it cannot be chosen ---');
ok('_gamScorePaper_ compares against the sheet, not against the payload',
   /function _gamScorePaper_[\s\S]*?q\.correctIndex/.test(G));
const submit = (G.match(/function submitChallengeResult[\s\S]*?\n\}\n/) || [''])[0];
ok('submitChallengeResult exists', submit !== '');
ok('and scores by calling the scorer rather than trusting a number sent in',
   submit !== '' && /_gamScorePaper_\(/.test(submit));
/* The signature is the guard: a `correct` parameter would be a number the
 * browser supplies, and no amount of care downstream fixes that. */
ok('its signature takes answers, not a score',
   /function submitChallengeResult\(sessionToken, challengeId, answers\)/.test(G));

console.log('--- the clock is the server\'s ---');
ok('elapsed time is measured from a stored stamp',
   submit !== '' && /_Started_At/.test(submit) && /Date\.now\(\) - new Date\(/.test(submit));
ok('and it is capped so an abandoned paper cannot run forever',
   submit !== '' && /Math\.min\(capMs/.test(submit));
ok('no elapsed time is read out of the submitted payload',
   submit !== '' && !/answers\.(ms|elapsed|time)/.test(submit));

console.log('--- both pilots get the one paper ---');
ok('the drawn paper is frozen on the row', /PaperJson/.test(G));
ok('and the options are shuffled once, at draw time, not per fetch',
   /function _gamDrawPaper_[\s\S]*?_gamShuffle_\(opts\.map/.test(G));
const forPlay = pfp;
ok('serving it reuses the stored order rather than reshuffling',
   forPlay !== '' && /p\.order\.map/.test(forPlay) && !/_gamShuffle_/.test(forPlay));

console.log('--- nothing shows a raw null to a pilot ---');
/* F-0028 was a null reaching the screen. The shape is gone, the lesson is not. */
const result = (S.match(/function _duelResult[\s\S]*?\n  \}\n/) || [''])[0];
ok('_duelResult exists', result !== '');
ok('and interpolates no bare null or undefined',
   result !== '' && !/\+\s*(null|undefined)\b/.test(result));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll challenge-duel assertions passed.');
process.exit(fails ? 1 : 0);
